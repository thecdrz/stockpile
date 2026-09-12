# Stockpile Edge Cases & Failure Behavior

**Status:** Draft for Phase 0 specification freeze  
**Version:** 0.1  
**Scope:** Market-data failures, trading races, corporate actions, lending, leverage, bankruptcy, reports, Discord interactions, inactivity, scheduler failures, provider anomalies, and abuse/exploit cases.

This document exists to stop implementation from inventing rules after a weird event occurs.

The general rule is:

> When Stockpile cannot prove that a financial mutation is safe and deterministic, fail closed and preserve player state.

---

## 1. Classification

Every unusual condition falls into one of four classes.

### 1.1 Expected Edge Case

Known real-world/game condition with deterministic automatic handling.

Example: stock split.

### 1.2 Degraded Operation

Stockpile can continue partially but disables unsafe functionality.

Example: market quote provider unavailable while loan repayment still works.

### 1.3 Recoverable Invariant Failure

A projection/job is inconsistent but authoritative ledger history remains intact.

Example: cached position balance differs from quantity ledger.

Stockpile alerts operations and uses rebuild/reconciliation tooling.

### 1.4 Manual Review Exception

Rare external event where automated guessing would risk permanent corruption.

Example: complex merger terms unavailable from the provider.

Manual review is allowed here under the project's zero-touch exception because preserving financial correctness is more important than pretending every real-world corporate action can be inferred automatically.

---

# PART I — MARKET DATA & TRADING

## 2. Quote Missing for One Security

Condition:

- player opens a security or submits an order
- provider returns no trustworthy quote

Behavior:

- Security Detail shows last-known value only if available and labels it stale
- new executions are blocked
- pending market orders remain pending
- unrelated securities continue normally
- no cash/share mutation occurs

Do not substitute previous close as an executable quote during an open session.

---

## 3. Quote Is Older Than Provider's Declared Delay

Condition:

- delayed feed claims ~15 minutes
- latest market observation is materially older than expected delay + tolerance

Behavior:

- classify quote `STALE`
- block execution
- show timestamp/stale state
- raise provider-health metric

---

## 4. User Sees Live Price Elsewhere While Stockpile Feed Is Delayed

Exploit attempt:

- live market has moved
- Stockpile display still shows a delayed lower price
- player submits a buy

Behavior:

- displayed delayed quote is informational only
- order waits for a provider observation whose market timestamp is at/after submission
- cannot execute at the previously displayed stale price

This is a launch-critical anti-exploit test.

---

## 5. Price Gaps Between Order Submission and Verified Execution

For a market buy:

- reserved cash is based on estimated price
- verified price gaps up

Behavior:

- fractional quantity is reduced to maximum affordable amount when allowed
- if final notional falls below minimum trade size, cancel/reject execution and release reservation

For a sell:

- reserved quantity is fixed
- proceeds use verified execution price

Player receives the actual settled result, not the preview estimate.

---

## 6. Market Order Submitted One Second Before Close

Behavior:

- order is eligible only if a trustworthy market observation from/after acceptance occurs within the regular session according to the selected execution model
- otherwise it rolls to `PENDING_MARKET_OPEN` for next session

Stockpile does not fabricate a close fill merely because the order arrived before the clock changed.

---

## 7. Market Order Submitted During Early Close

Exchange calendar controls session state.

If the early close already occurred:

- queue for next regular eligible session

Do not use ordinary 4:00 PM assumptions.

---

## 8. Unexpected Exchange Closure

If authoritative calendar/status says exchange closed unexpectedly:

- no new regular-hours executions
- pending orders wait
- reporting uses last valid prices and notes closure where relevant

---

## 9. Exchange Calendar Service Unavailable

If Stockpile cannot establish whether an exchange is open:

- new executions for that exchange are paused
- portfolio viewing can use labeled last-known data
- non-market financial actions continue where safe

Fail closed.

---

## 10. Trading Halt After Order Submission

If order has not yet received a qualifying execution observation:

- leave pending or suspend depending on venue/provider semantics
- no synthetic fill

When trading resumes:

- use first eligible post-resumption observation under normal rules

If order expires while halted, cancel normally.

---

## 11. Security Halted for Multiple Days

Behavior:

- retain holding
- use last-known price only as labeled stale estimate
- block new trades
- do not declare position worthless
- margin/bankruptcy valuations dependent on that security enter deferred/review handling rather than forcing liquidation on stale data

---

## 12. Zero / Negative / Absurd Quote

If provider returns a clearly invalid value for an ordinary supported equity/ETF:

- reject the observation
- mark quote unavailable/stale
- increment provider anomaly metric
- block execution

Validation rules should include provider-specific sanity checks and reference prior observations.

A large real market crash must not be rejected merely because it is large; anomaly detection should trigger verification, not silently replace real prices.

---

## 13. Sudden 90% Move Without Corporate Action Data

Behavior:

- seek corroborating provider/action data where configured
- if feed is otherwise authoritative and timestamp valid, display movement
- for execution-critical use, apply selected provider confidence policy
- if split/reverse-split ambiguity exists, temporarily suspend the security until action state is resolved

Do not automatically assume either crash or split.

---

## 14. Duplicate Provider Quote/Event

Provider event/reference deduplication prevents duplicate processing.

Receiving the same observation twice may update cache metadata but must not create duplicate financial events.

---

## 15. Provider Corrects Yesterday's Close

Behavior:

- charts may refresh
- existing executed trades do not change silently
- official published snapshot/report may be flagged corrected if the close materially changes a report
- any required accounting correction uses explicit compensating events

---

## 16. Provider Changes Symbol Format

Example: Canadian symbol suffix convention changes.

Because Stockpile uses internal `security_id` and provider mapping:

- positions remain intact
- provider adapter mapping is updated
- no user holdings migration by ticker string is required

---

## 17. Same Ticker Exists on Multiple Exchanges

UI must require/retain listing identity.

`SHOP` alone is not sufficient internally.

Search displays exchange/currency clearly.

Orders always reference internal security ID.

---

## 18. Security Search Returns Stale/Delisted Listing

Search may show delisted/historical security only when explicitly useful for portfolio history.

It is not buyable.

Current trading search should prioritize active eligible listings.

---

## 19. Limit Order Triggered During Data Gap

If intraday observations are missing for a period:

- Stockpile may not infer that the limit crossed
- order remains unresolved until a licensed/authoritative bar/event covering that period is available
- if the missing interval can never be recovered, order enters review/cancel policy rather than guessing

---

## 20. Limit Price Crossed Multiple Times in One Delayed Bar

Use the deterministic bar-fill model in Market Data Spec.

Do not attempt fictional microstructure reconstruction.

The same bar/order inputs must produce the same result every time.

---

## 21. Player Cancels Order While Execution Is Racing

Database transaction determines outcome.

Exactly one wins:

- cancellation commits first -> execution sees cancelled order and cannot fill
- execution commits first -> cancel sees filled order and returns existing execution

Never both cancel and fill financially.

---

## 22. Player Double-Clicks Confirm Buy

Same interaction/request idempotency key returns one financial result.

Only one order/event exists.

---

## 23. Discord Retries an Interaction

Same as double-click: idempotency prevents duplication.

Response should surface original result when possible.

---

## 24. Two Devices Submit Purchases Simultaneously

Both operations validate cash inside authoritative database transactions.

Reservations/locks prevent total spend from exceeding available cash.

One may succeed and one may fail/reduce according to normal affordability rules.

---

## 25. Sell and Gift/Loan Are Submitted Simultaneously

Operations involving different asset classes may both succeed if valid.

Operations competing for cash/shares must serialize and revalidate.

No operation is authorized solely from a previously rendered dashboard.

---

# PART II — FX

## 26. FX Quote Missing

Cross-currency trade does not execute.

Domestic-currency securities continue trading normally.

---

## 27. FX Quote Stale

Same as missing for execution purposes.

Portfolio may show estimated converted values with timestamp/stale label.

---

## 28. FX Rate Moves During Delayed Stock Execution

Use the FX quote eligible at the actual stock execution/settlement event per Market Data Spec.

Preview is only an estimate.

Both stock and FX evidence are stored.

---

## 29. Base Currency Changes After Launch

Changing environment base currency after players have career history is **not a normal settings change**.

It requires an explicit migration specification and is disabled by default.

Reason: cash, debt, milestones, reports, loans, and cost basis are denominated in the original base currency.

---

# PART III — CORPORATE ACTIONS

## 30. Stock Split While Player Owns Shares

Automatically:

- adjust quantity
- preserve aggregate cost basis
- update average cost
- cancel affected open orders
- record action once
- notify player

---

## 31. Split Occurs While Buy Order Is Pending

Open order is cancelled when action is detected before execution.

Player may resubmit under new share/price structure.

This is safer than attempting automatic order transformation across vendors.

---

## 32. Reverse Split Produces Tiny Fraction

Fractional shares are supported, so retain the exact supported fraction.

Do not cash out solely because a traditional broker might.

---

## 33. Dividend Announced After Player Sells

Entitlement is determined by defined ex-date holding rule, not current ownership on payment date.

If entitled, player receives it even after selling.

---

## 34. Dividend Event Arrives Late

Post dividend when verified with true business effective date and current processing time.

If an old report is affected materially, append a correction indicator rather than silently regenerating history as though nothing changed.

---

## 35. Dividend Corrected Downward After Payment

Do not edit prior payment.

Post an explicit corporate-action correction/reversal according to provider confirmation.

If player no longer has enough cash to absorb a negative correction, create a defined settlement deficit and distress path rather than hiding it.

---

## 36. Ticker Change

Preserve internal identity, holdings, cost basis, charts/history.

Display new ticker going forward and retain alias history.

---

## 37. Cash Merger

On verified effective settlement:

- remove shares
- credit cash consideration
- realize gain/loss
- cancel orders
- mark old listing non-tradable where appropriate

---

## 38. Stock-for-Stock Merger

Transform quantity/cost basis using structured terms.

If target security is unsupported but valid, it may exist as a non-buyable portfolio holding until it can be disposed/handled under defined policy.

Do not discard value merely because the resulting security is outside normal discovery universe.

---

## 39. Merger Terms Ambiguous or Missing

Suspend affected security in `CORPORATE_ACTION_REVIEW`.

Do not guess.

Admin review is allowed.

This is a zero-touch exception.

---

## 40. Spin-Off Creates Unsupported Security

Create the resulting holding as a **corporate-action-only position**.

It may be visible and valued if licensed pricing exists.

New purchases remain disabled unless/until security becomes eligible.

If no reliable price exists, value is marked unavailable rather than zero.

---

## 41. Security Delisted but Trades OTC Later

Launch universe excludes OTC.

The position remains as a non-buyable legacy holding.

If licensed OTC valuation is unavailable, Stockpile waits for authoritative cash/reorganization/terminal event rather than assuming zero.

---

## 42. Company Files Bankruptcy but Shares Still Trade

Filing alone does not write to zero.

Trading eligibility follows provider/exchange state and supported universe policy.

Player financial status uses valid market/terminal valuation, not headlines.

---

## 43. Company Shares Cancelled as Worthless

Only an authoritative terminal corporate action writes quantity/value to zero.

Post explicit quantity/corporate-action event.

---

# PART IV — LOANS, GIFTS & DEBT

## 44. Borrower Has Exactly Enough Cash on Due Date

Automatic payment consumes required available cash.

Other pending optional actions cannot use cash already reserved/required by atomic settlement.

---

## 45. Borrower Has Partial Cash on Due Date

Default system policy:

- attempt defined payment amount
- if full scheduled payment cannot be made, apply available cash only if the loan contract's partial-payment rule permits automatic partial collection
- remaining due amount becomes late/delinquent

For launch player/system loans, automatic collection should take available cash up to amount due while preserving any protected bankruptcy recovery balance rules if applicable.

Every partial collection is ledgered.

---

## 46. Borrower Owns Stocks but Has No Cash for Unsecured Loan

Stockpile does not automatically sell ordinary positions to pay an unsecured loan.

Loan becomes late/delinquent/default according to schedule.

Borrower can choose to sell assets and pay.

Margin debt is different and may force liquidation.

---

## 47. Borrower Goes Offline Before Due Date

Debt continues.

Automatic payment attempts still occur.

Player was warned at borrowing time.

No inactivity pause.

---

## 48. Lender Goes Offline

Loan contract continues.

Repayments automatically credit lender account.

No lender action is required.

---

## 49. Lender Leaves Discord Server

Career account is not immediately deleted.

Loans remain valid and repayments continue to account.

Environment retention/deletion rules are defined in architecture/privacy operations, not by Discord membership alone.

---

## 50. Borrower Leaves Discord Server

Debt continues within the environment account.

If the player later rejoins with same Discord user identity, account resumes.

No debt is forgiven simply by leaving the server.

---

## 51. User Is Banned/Kicked Permanently

Admin may mark the account inactive/frozen.

Existing obligations continue automatically where possible until settled/default/bankruptcy.

Never transfer account ownership to a new Discord user.

---

## 52. Borrower and Lender Try to Restructure at Due-Time Race

One authoritative contract version wins through optimistic concurrency/versioning.

A payment already settled is not undone merely because a restructure request was open.

Restructure preview refreshes current balance before confirmation.

---

## 53. Lender Forgives Debt by Mistake

Forgiveness requires explicit confirmation showing irreversible effect.

Once posted, normal user UI does not undo it.

Only audited administrator correction for a proven software/interaction defect may compensate it.

---

## 54. Player Gifts Money, Then Immediately Goes Insolvent

Gift preflight checks distress/obligations.

If valid at commit time, gift stands.

If the gift violates creditor-protection rules because concurrent state changed, transaction fails.

No retroactive clawback is needed for a legitimately permitted gift.

---

## 55. Players Attempt to Game Net-Worth Awards by Passing Money Back and Forth

Gifts affect wealth but not investment-return metrics.

Weekly performance awards use cash-flow-adjusted returns.

Transfer statistics may expose excessive circular gifting.

League accounts cannot receive gifts.

---

## 56. Player Loan Used to Inflate Lender Net Worth

Receivable is offset by lender cash reduction at issuance; initial net worth does not increase.

Delinquent receivables are discounted under Economy Spec.

Interest becomes income only as accrued/collected according to contract rules.

---

## 57. Borrower Takes Loan and Gifts It Back to Lender/Friend

Transfer restrictions and debt/obligation checks apply.

Borrowed cash is not specially tagged, but the borrower cannot gift while prohibited distress states apply.

Cash-flow-adjusted investment return prevents fake performance.

---

## 58. Borrower Takes Maximum Loan Immediately Before Bankruptcy

Eligibility blocks new loans in default/insolvency/margin call.

Bankruptcy estate includes borrowed cash/assets.

Credit/default consequences remain.

Repeated-bankruptcy recovery grants diminish.

Simulation tests must explicitly attack this exploit.

---

# PART V — MARGIN & DISTRESS

## 59. Margin Ratio Crosses Threshold Intraday

State updates when Stockpile has trustworthy valuation data.

- crossing into Elevated Risk creates warning state
- crossing into Margin Call creates critical private alert
- crossing below Forced Liquidation threshold triggers deterministic liquidation process

Do not react to stale prices.

---

## 60. Margin Call Triggered Near Market Close

If player cannot act and required liquidation cannot safely complete before close:

- state persists
- liquidation orders queue for next eligible session where rules require
- gap risk is borne by virtual account

No fabricated close-price liquidation.

---

## 61. Margin Liquidation While Security Is Halted

Skip halted/unexecutable position temporarily and proceed to next eligible position if doing so can safely restore margin.

If insufficient executable assets exist:

- account remains critical
- liquidation continues when markets reopen
- no guessed sale

---

## 62. All Positions Gap Down Below Debt at Open

Forced liquidation executes under normal verified-price rules.

If estate remains negative after liquidation:

- enter insolvency/bankruptcy rules

Negative virtual net worth is allowed transiently as a defined distress state.

---

## 63. Player Deposits Gift During Margin Call

Receiving a permitted gift can improve cash/equity.

If it restores margin before forced liquidation commits, margin state recalculates.

If liquidation already posted, do not reverse it because later cash arrived.

---

## 64. Player Attempts to Gift Money During Margin Call

Blocked.

---

## 65. Margin Data Feed Fails During Crash

Pause new margin-supported buys and forced liquidation dependent on missing values.

Preserve latest state with clear warning.

When trustworthy pricing resumes, recalculate from current state.

Do not liquidate using stale prices.

---

# PART VI — BANKRUPTCY

## 66. Player Net Worth Briefly Goes Negative Intraday

Negative net worth alone does not instantly bankrupt the player.

Use Economy Spec mandatory-bankruptcy rules.

Market recovery may remove insolvency before the 3-day + default trigger.

---

## 67. Player Voluntarily Files While Orders Pending

Bankruptcy opening:

- freezes new financial-risk actions
- cancels pending orders where possible
- waits for any already-committed executions to settle
- then calculates estate from authoritative state

---

## 68. Corporate Action Occurs During Bankruptcy Estate

Estate owns the security until liquidation.

Corporate action processes normally into estate assets before distribution.

Bankruptcy cannot ignore value simply because the event is complicated.

---

## 69. Player Loan Borrower Bankrupts

Lender receives pro-rata estate recovery according to priority.

Remaining eligible balance is discharged.

Lender records realized default loss.

Do not reimburse lender from system money.

---

## 70. Player Is Both Creditor and Debtor in Same Bankruptcy Network

Each legal game contract is settled independently through ledger balances.

Optional netting is not performed unless explicitly defined later.

This avoids hidden cross-contract behavior.

---

## 71. Bankruptcy Estate Has Zero Cash and Illiquid Asset

Case remains open until asset reaches a terminal/valued state or an explicit admin-review exception resolves it.

Recovery grant is not issued until estate distribution/discharge is sufficiently finalized.

---

## 72. Player Bankrupts Repeatedly

Apply decreasing recovery grant rules from Economy Spec.

Career bankruptcy count/history remains permanent.

Do not permanently lock player out.

---

## 73. Bankruptcy Grant Accidentally Runs Twice

Idempotency key ensures one grant only.

Reconciliation explicitly tests bankruptcy-case grant count.

---

## 74. Player Receives Gift Immediately After Bankruptcy

Receiving gifts is allowed unless sender restrictions block it.

Outgoing gifts from recovering player remain disabled for configured period.

The incoming gift does not instantly repair credit history.

---

# PART VII — LEAGUES & REPORTING

## 75. Player Joins Mid-Month

Create provisional league account.

They may practice but cannot win current championship.

Fully ranked next monthly league.

---

## 76. Player Makes No League Trades

Their return remains based on cash (normally 0%).

They can appear in standings but should not qualify for Trader of the Week solely by doing nothing unless every relevant rule says so.

Weekly award eligibility may require active/invested criteria.

---

## 77. Two Players Tie Exactly in League Return

Use defined tie-breakers:

1. lower maximum drawdown
2. higher ending NAV
3. earlier first completed trade

No manual tie decision.

---

## 78. Market Data Missing at League Close

Do not close league using stale/partial values if they could change standings materially.

League status becomes `FINALIZING` until authoritative closes are available.

Public message can say results are pending verification.

---

## 79. Corporate Action Corrected After League Winner Announced

If correction materially changes standings:

- preserve original report artifact/history
- issue corrected league result
- update official trophy/record through audited correction events
- explain correction publicly

Do not silently swap winner.

---

## 80. Weekly Wrap Has No Interesting Awards

Publish fewer awards or a concise standings-only Wrap.

Never manufacture fake drama.

---

## 81. One Player Wins Every Award

Award selection attempts diversity only when similarly interesting valid candidates exist.

Do not deny a clearly deserved award merely for forced fairness.

Cap/dedup logic prevents redundant variants of the same event from filling the report.

---

## 82. Weekly Wrap Job Runs Twice

Use period/environment idempotency key.

One official Wrap record/post.

A second scheduler attempt detects existing publication.

---

## 83. Discord Post Fails After Report Is Generated

Separate report finalization from delivery state.

Retry Discord delivery using the same report ID.

Do not recompute awards differently on each retry.

---

## 84. Monthly Statement Job Runs Before Late Dividend Arrives

Publish using available authoritative data.

Later verified late event can generate correction annotation/supplement.

Do not mutate immutable financial history.

---

# PART VIII — DISCORD UX & AUTHORIZATION

## 85. Another User Clicks a Player-Specific Button

Revalidate Discord identity.

Reject without revealing private details.

---

## 86. Ephemeral Dashboard Expires

User runs `/stockpile` again.

No game state depends on message persistence.

---

## 87. Old Dashboard Button Clicked Days Later

Re-read current state, not old rendered values.

Refresh/redirect where appropriate.

No stale action can bypass current rules.

---

## 88. Bot Restarts While Modal Is Open

If interaction cannot be resumed, the submission fails gracefully and user returns through `/stockpile`.

No financial mutation happens until authoritative submission processing begins.

---

## 89. DM Delivery Fails for Private Loan Offer

Use configured public-channel fallback:

- minimal addressed notification
- no private terms
- restricted Open Offer action

If both DM and channel delivery fail, offer still exists in borrower's private Stockpile inbox/attention center.

---

## 90. Public Stockpile Channel Deleted

Scheduled public delivery pauses and admin configuration alert appears.

Private `/stockpile` functionality continues.

No financial processing depends on the public channel existing.

---

## 91. Bot Loses Permission to Post Images

Fall back to native text/components where possible.

Financial/report data remains accessible.

Visual rendering is enhancement, not source of truth.

---

# PART IX — SCHEDULER & INFRASTRUCTURE

## 92. Service Restarts During Scheduled Job

Job runner uses durable job state + financial idempotency.

On restart:

- unfinished job retries
- already-posted events are detected
- no duplicate money or reports

---

## 93. Clock/DST Change

Scheduling uses timezone-aware exchange calendars, not fixed UTC assumptions.

Internal timestamps stored UTC.

Weekly/report schedule resolves from market sessions.

---

## 94. Job Runs Late

Business effective time remains correct.

Example: interest due at midnight but service resumes at 02:00.

Post with intended effective time and actual processing time.

---

## 95. Multiple Worker Instances Pick Same Job

Database/queue leasing plus idempotency ensures one financial effect.

Duplicate worker attempt exits safely.

---

## 96. Database Becomes Read-Only / Unavailable

No financial mutation succeeds.

Bot may display cached/status information if clearly labeled, but should prefer an unavailable message over pretending success.

Do not acknowledge a financial action as successful before commit.

---

## 97. Database Commit Succeeds but Discord Response Times Out

On retry/status lookup, return existing event result using request/idempotency ID.

Player may initially see a timeout but must not be able to duplicate the action.

---

## 98. Visual Renderer Fails

Weekly/monthly report publishes accessible native fallback from finalized report data.

Do not skip economic reporting because the pretty card failed.

---

## 99. Backup Restore Is Missing Recent Events

Normal disaster-recovery policy determines recovery-point objective.

After restore:

- do not blindly rerun external financial effects without idempotency evidence
- reconcile provider/external references
- rebuild projections
- inspect gap before reopening trading

Release testing must exercise this scenario.

---

# PART X — INACTIVITY, MEMBERSHIP & IDENTITY

## 100. Player Is Inactive for Months with Stocks Only

Portfolio continues changing value.

Dividends/corporate actions continue processing.

No activity penalty merely for inactivity.

---

## 101. Player Is Inactive with Debt

Debt schedule continues.

Automatic cash payments continue where possible.

Delinquency/default can occur.

Critical notifications follow configured channels without endless spam.

---

## 102. Discord Username/Display Name Changes

Identity is tied to immutable Discord user ID.

Display name updates do not create a new Stockpile account.

Historical public reports may retain rendered name at publication time while profile resolves current display name.

---

## 103. Same User in Multiple Stockpile Guilds in Future

All data is environment-scoped.

A user has independent Career Accounts per environment unless a future cross-guild product explicitly changes that.

No balance leakage across guilds.

---

# PART XI — GAME ABUSE & MANIPULATION

## 104. Players Collude to Funnel Wealth to One Account

Career economy permits gifts within defined constraints because social finance is intentional.

However:

- investment return excludes gifts
- league is isolated
- transfer limits apply
- public records show gift flows where appropriate to the account owner

Stockpile does not need to prevent friends from roleplaying a financial dynasty as long as competition metrics stay fair.

---

## 105. Player Attempts Tiny Trades to Farm Credit/Achievements

Credit stability bonuses are capped.

Achievement/weekly award definitions should include minimum notional/account-impact thresholds.

No reward should be farmable through thousands of economically meaningless dust transactions.

---

## 106. Player Trades Repeatedly to Farm Most Active

Most Active is comedic, not economically rewarding.

Minimum trade size exists.

No cash/credit bonus is attached.

If spam becomes disruptive, per-user interaction rate limits may apply without changing financial semantics.

---

## 107. Circular Loans Among Three Players

Loans remain valid and each party incurs actual obligations.

Credit/performance calculations do not count borrowed principal as profit.

Risk metrics use gross debt and receivables so circular lending cannot create free net worth.

---

## 108. Two Players Create 0% Loans to Avoid Gift Limits

Player-loan exposure and borrower debt limits still apply.

A zero-interest loan creates a liability and maturity obligation.

It is not equivalent to an unrestricted gift.

Repeated artificial lending may be visible in career finance stats but does not improve investment return.

---

## 109. Player Attempts Self-Loan/Self-Gift/Challenge

Disallowed.

Source and destination player must differ for social financial contracts.

---

## 110. Player Attempts to Trade Unsupported Leveraged ETF

Security is discoverable only if product policy permits informational display.

Buy is blocked with explanation.

A leveraged ETF received through a corporate action would be treated as legacy holding only if such an unusual event occurred.

---

## 111. Player Finds Provider Symbol Not in Stockpile Universe

Direct API/ticker manipulation cannot bypass eligibility.

Order references must resolve to an enabled internal security ID.

---

# PART XII — CONFIGURATION & RULE CHANGES

## 112. Economy Threshold Changes Mid-Career

Configuration is versioned.

New events use new ruleset version.

Existing contracts preserve terms unless specification explicitly allows prospective change.

Historical reports remain explainable.

---

## 113. Interest Rate Configuration Changes While Loan Active

Existing fixed-rate loan retains contracted APR.

New loans use new configuration.

No retroactive repricing.

---

## 114. Status Threshold Changes

Status recalculates under new rules after configured effective time.

Record status-change event with ruleset version.

Do not rewrite historical status achievements.

---

## 115. Prestige Asset Price Changes

Existing owned asset retains its purchase price and uses current applicable resale/liquidation policy as defined by versioned asset/config data.

If resale policy changes, historical transaction remains untouched.

---

# PART XIII — REQUIRED MANUAL-REVIEW EXCEPTIONS

## 116. Allowed Manual Review Cases

Zero-touch does not mean blindly automating unknowable events.

Manual review is explicitly acceptable for:

- ambiguous/incomplete merger terms
- spin-off data that cannot be valued safely
- provider reports contradictory terminal security states
- external data correction that materially changes already-settled financial events without deterministic correction path
- corrupted provider identifier mapping affecting live holdings
- ledger invariant failure that rebuild does not resolve
- licensing/provider suspension requiring adapter migration

These cases should be rare and generate a clear admin queue rather than silently blocking the entire bot.

---

## 117. Manual Review Must Not Permit Casual Balance Editing

Resolution uses:

- provider mapping repair
- replay/rebuild
- explicit compensating events
- corporate-action repair event

Direct mutable balance edits remain prohibited as normal tooling.

---

# PART XIV — RELEASE EDGE-CASE TEST MATRIX

The following scenarios are mandatory automated/simulation tests before private launch:

1. duplicate Buy confirmation
2. two simultaneous buys exceeding cash
3. delayed feed anti-stale execution
4. order placed seconds before close
5. holiday/early close
6. halted security
7. stale FX
8. 2:1 split with pending orders
9. reverse split with fractional shares
10. ticker change
11. cash merger
12. stock merger
13. unsupported spin-off child security
14. delisting without terminal value
15. late dividend
16. corrected dividend
17. borrower partial payment
18. borrower inactive through default
19. lender leaves guild
20. loan restructure/payment race
21. gift + insolvency race
22. circular player loans
23. margin call and recovery
24. forced liquidation across multiple positions
25. halted largest margin position
26. price gap causing negative equity
27. voluntary bankruptcy with pending orders
28. lender loss in borrower bankruptcy
29. repeat bankruptcy recovery grants
30. league tie
31. league close with missing data
32. Weekly Wrap retry
33. monthly report late-data correction
34. Discord retry after committed DB transaction
35. scheduler duplicate worker
36. service restart during bankruptcy
37. projection corruption + rebuild
38. backup restore + reconciliation
39. provider outage during market crash
40. corporate action requiring manual review

A release candidate that has not passed these tests is not considered zero-touch ready.

---

## 118. Decisions Frozen by This Draft

1. Unknown financial states fail closed rather than guess.
2. Missing/stale market data blocks execution but not safe unrelated gameplay.
3. Ticker/listing identity is never inferred from ticker text alone.
4. Real corporate actions may create non-buyable legacy holdings rather than destroy value.
5. Leaving Discord does not erase debt or account history.
6. Unsecured debt does not automatically liquidate ordinary securities.
7. Margin may liquidate collateral under deterministic rules.
8. Bankruptcy waits for authoritative estate values where required.
9. Reports are finalized separately from Discord delivery so retries are stable.
10. Financial UI interactions always revalidate current state.
11. Scheduled work is retryable and idempotent.
12. Public competition cannot be manipulated through Career gifts/transfers.
13. Rare unknowable corporate/data events are allowed to enter manual review rather than corrupt the economy.
14. Manual repair uses explicit events/rebuilds, not casual balance edits.

---

## 119. Edge-Case North Star

The ideal Stockpile bug report is:

> The quote provider went down during a market crash. Trading paused for affected stocks, my dashboard clearly said the values were stale, my loan payment still processed, nothing duplicated when the bot restarted, and everything resumed when valid prices came back.

The unacceptable bug report is:

> Stockpile guessed.

When uncertain, preserve history, preserve assets, and wait for truth.
