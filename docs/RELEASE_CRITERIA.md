# Stockpile Release Criteria

**Status:** Draft for Phase 0 specification freeze  
**Version:** 0.1  
**Scope:** Required functionality, automated tests, simulations, data-provider validation, recovery exercises, Discord UX validation, operational readiness, and the private-launch go/no-go gate.

Stockpile is not ready because `/stockpile` opens or because a stock can be bought.

It is ready when we have evidence that the permanent economy can survive real markets, failures, retries, weird corporate actions, debt, bankruptcy, and long unattended operation without corrupting player history.

---

## 1. Release Philosophy

Private launch requires confidence in **correctness before completeness**.

A feature that exists must be safe.

A feature that is not safe should remain disabled rather than ship as a best-effort approximation.

No launch blocker may be waived merely because there are only three players. The tiny player count reduces scale risk, not financial-state risk.

---

## 2. Phase 0 Exit Gate

Implementation may begin only when:

- Product/Game Plan exists
- Economy Spec exists
- Discord UX Spec exists
- Market Data Spec exists
- Financial Ledger Spec exists
- Edge Cases Spec exists
- Architecture Spec exists
- Release Criteria exists
- market-data provider/license is selected or implementation explicitly remains on mocks until selection
- all remaining product decisions in the Phase 0 tracking issue are closed

Provider-dependent production integration is blocked until licensing is confirmed.

---

## 3. Minimum Private-Launch Feature Set

Private launch must include:

### Player / UX

- `/stockpile` launcher
- first-run account creation
- optional onboarding tour
- Home dashboard
- Portfolio
- Security Detail
- Trade flow
- Markets/search/watchlist
- Bank
- League
- Reports
- Profile
- Settings

### Trading

- US stocks/ETFs
- Canadian TSX stocks/ETFs
- fractional shares
- market orders
- limit orders
- queued closed-market orders
- cross-currency CAD/USD execution
- deterministic delayed-price handling if feed is delayed

### Financial Life

- career account
- system loans
- player loans
- gifts/transfers
- credit
- financial status
- margin
- distress/default
- bankruptcy/recovery
- prestige assets

### Competition / Social

- monthly League
- weekly statistics
- Friday Weekly Wrap
- Monday Opening Bell
- achievements/records required by shipped rules
- standardized predictions/challenges if enabled for launch
- one clearly labelled fictional NPC with deterministic predictions and trading

### Reporting

- portfolio report
- performance report
- transaction history
- debt/credit report
- monthly statement
- career/net-worth timeline

### Operations

- durable jobs
- ledger reconciliation
- projection rebuild
- admin inspection/correction tools
- backups
- restore procedure
- provider health
- structured logs

A deliberate feature flag may defer a non-core feature only if all specifications and UI clearly reflect the disabled state.

---

## 4. Automated Test Baseline

Release branch must pass all automated tests with no ignored critical failures.

Required test groups:

- unit tests
- domain policy tests
- ledger tests
- database integration tests
- market provider contract tests
- Discord interaction tests
- job/idempotency tests
- report tests
- visual snapshot/layout tests
- end-to-end tests
- long-running simulation tests

---

## 5. Ledger Release Tests

Mandatory assertions:

1. every posted monetary event balances by currency
2. posted events cannot be mutated through normal application paths
3. full reversals preserve original history
4. compensating corrections preserve original history
5. same idempotency key cannot post twice
6. simultaneous spending cannot exceed available cash
7. simultaneous selling cannot exceed available quantity
8. security quantity projection equals immutable quantity subledger
9. weighted-average cost basis survives repeated partial buys/sells
10. realized gain/loss is correct
11. ordinary mark-to-market changes do not create cash journal entries
12. reservations release/consume correctly
13. player-loan receivable reconciles with borrower liability
14. wager escrow is zero-sum
15. career and league accounts never cross
16. bankruptcy distributions cannot exceed estate resources
17. recovery grant posts once
18. projection rebuild reproduces authoritative current balances

Any failure is a launch blocker.

---

## 6. Trading Release Tests

Required scenarios:

- domestic CAD stock buy/sell
- US security buy/sell from CAD account
- FX spread calculation
- fractional buy by currency amount
- fractional sell
- pending market-open order
- gap-up affordability reduction
- gap-down sell proceeds
- limit buy
- limit sell
- order expiration
- order cancellation
- cancellation/execution race
- duplicate confirmation
- simultaneous orders competing for cash
- stale quote rejection
- missing FX rejection
- market halt
- holiday
- early close
- provider-delayed execution anti-exploit

No trade may settle from an observation whose market timestamp makes it ineligible under the Market Data Spec.

---

## 7. Market Data Provider Certification

Before production data is enabled, document evidence for the chosen provider.

Required:

- license permits private Discord display to intended users
- US coverage verified
- TSX coverage verified
- ETF coverage verified
- intraday freshness measured
- timestamps understood
- FX verified
- dividends verified
- splits verified
- symbol/listing metadata verified
- market calendar/status strategy verified
- retention rights sufficient for audit history
- provider rate limits tested under expected workload

### 7.1 Live Comparison

For a representative test window, compare provider observations against a trusted human-visible market reference for:

- at least 10 US securities
- at least 10 Canadian securities/ETFs
- USD/CAD

The goal is not cross-provider millisecond equality; it is confirming timestamps, delays, currencies, listing identity, and obvious data integrity.

---

## 8. Corporate Action Release Tests

Must test at minimum:

- 2:1 split
- 1:10 reverse split
- split with fractional starting quantity
- split while orders pending
- cash dividend
- late dividend
- corrected dividend
- ticker change
- cash acquisition
- stock-for-stock merger
- mixed consideration merger
- spin-off
- unsupported spin-off child
- delisting without terminal value
- authoritative worthless cancellation
- company bankruptcy filing without immediate zero value
- duplicate corporate-action processing

Structured high-impact actions with insufficient terms must enter manual review rather than guess.

---

## 9. Loan / Credit Release Tests

Must test:

- each system-loan credit tier
- loan eligibility limits
- fixed APR schedule
- weekly repayment
- bullet repayment
- early repayment
- automatic due-date payment
- partial payment
- late stages
- default
- credit score changes
- credit monthly farming cap
- player loan offer/accept/decline/expire
- player loan exposure limits
- restructure
- forgiveness
- borrower/lender inactivity
- lender loss through borrower bankruptcy

Credit rating must be explainable from stored credit events.

---

## 10. Margin Release Tests

Must test:

- eligibility
- enable confirmation
- 50% initial requirement
- interest accrual
- Healthy -> Elevated Risk
- Elevated -> Margin Call
- Margin Call recovery
- Margin Call timeout
- Forced Liquidation
- multi-position liquidation ordering
- fractional minimum liquidation amount
- largest security halted
- market closes during liquidation
- overnight gap
- post-liquidation insolvency
- provider outage during margin stress

Never liquidate on stale valuation data.

---

## 11. Bankruptcy Release Tests

Must test:

- voluntary bankruptcy
- mandatory three-day/default trigger
- margin-deficit trigger
- pending-order cancellation
- security liquidation
- prestige liquidation
- creditor priority
- multiple player lenders pro-rata
- insufficient estate
- residual system debt discharge
- residual player debt discharge
- lender realized default loss
- first recovery grant
- second/third bankruptcy reduced grant
- recovery restrictions
- post-bankruptcy credit cap
- gift received after bankruptcy
- no duplicate recovery grant

Player must return to usable gameplay after case closure.

---

## 12. League Release Tests

Must test:

- monthly automatic creation
- equal starting capital
- no career transfer into league
- no loans/gifts/margin/prestige in league
- provisional mid-month player
- return calculation
- benchmark calculation
- max drawdown
- tie-breakers
- league finalization delay when prices unavailable
- final holding reveal
- champion record/trophy
- next-month automatic rollover
- duplicate rollover retry

NPC-specific assertions:

- NPC receives the same League capital and execution treatment as humans
- active NPC holdings remain private until League close
- NPC decisions cannot read private human state or future market data
- identical policy version, inputs, and seed reproduce the same proposed action
- duplicate decision jobs do not create duplicate predictions, orders, or wagers
- disabling the NPC creates no new decisions and does not corrupt pending obligations
- every NPC order and prediction retains its policy version, inputs, and structured rationale
- NPC labels remain visible on every public and private surface
- any enabled staked challenge is funded from NPC Career cash and reconciles as zero-sum

---

## 13. Weekly Wrap Tests

Test each award rule individually and in combination.

Required:

- Trader of the Week
- Best Trade
- Biggest Bag
- Diamond Hands
- Paper Hands
- YOLO
- Cash Goblin
- Comeback Kid
- Perfect Entry
- Perfect Exit
- Market Beater
- Contrarian
- Dividend Leader
- Debt Collector
- Loan Shark
- Most Active
- Quiet Week
- Worst Timing Imaginable
- Uh Oh
- Survivor

Selection tests:

- 0 interesting awards
- fewer than 5
- >8 candidates
- one player dominates all candidates
- category diversity
- deterministic repeat generation
- gift does not create performance win
- borrowed principal does not create performance win

A Weekly Wrap generated twice from the same finalized weekly data must choose the same winners.

---

## 14. Discord UX Release Tests

Every major surface from `DISCORD_UX.md` must be reviewed on:

- Discord desktop
- Discord mobile

Validate:

- one-command navigation
- Back/Home paths
- no dead ends
- no requirement to remember secondary commands
- private data remains private
- public share cards sanitize private data
- active league holdings hidden
- financial confirmation clearly identifies consequence
- stale UI revalidation
- wrong-user button rejection
- double-click behavior
- expired/old panel behavior
- DM-failure loan fallback
- accessible text for visual cards

---

## 15. Visual Quality Gate

Visuals are a first-class requirement.

Review at minimum:

- Home hierarchy
- portfolio summary
- stock card/chart
- loan offer
- margin warning
- Weekly Wrap
- monthly statement
- career timeline
- achievement
- bankruptcy
- recovery
- league championship

Reject visuals that are:

- illegible on mobile
- overstuffed
- casino-like
- inconsistent in spacing/typography
- dependent on colour alone
- generic walls of Discord embed text

Snapshot/golden tests should detect accidental renderer regressions.

---

## 16. Notification Tests

Validate:

- critical private alerts
- 24h payment reminder
- credit rating change
- corporate action alert
- public major market-impact threshold
- public alert daily cap
- deduplication
- routine price movement does not ping
- inactive player does not receive repeated spam
- critical debt notice cannot be silently lost from dashboard

---

## 17. Scheduler / Idempotency Tests

For every recurring financial job:

1. run once
2. run same job again
3. kill worker mid-run
4. restart/retry
5. run two workers concurrently

Result must equal one correct execution.

Apply to:

- interest
- loan payment
- dividend
- corporate action
- snapshot
- Weekly Wrap
- monthly statement
- league rollover
- bankruptcy stage
- reconciliation

---

## 18. Failure Injection Tests

Simulate:

- database temporarily unavailable
- provider timeout
- provider returns malformed JSON
- provider returns absurd price
- provider rate limit
- provider broad outage
- Discord API timeout before response
- Discord API failure after DB commit
- visual renderer failure
- worker crash
- process restart
- partial network outage

Financial mutation must either commit completely or not commit.

---

## 19. Projection Corruption Test

Deliberately corrupt a derived projection in a non-production test database.

Required recovery:

1. reconciliation detects mismatch
2. financial writes can be paused if necessary
3. rebuild from immutable history
4. shadow comparison passes
5. corrected projection replaces bad projection
6. player final balance matches authoritative event history

No manual balance arithmetic should be required.

---

## 20. Backup / Restore Drill

Before private launch:

1. create realistic multi-month simulated database
2. take production-style backup
3. destroy/discard test database
4. restore backup into clean environment
5. run migrations/check versions
6. rebuild projections
7. run reconciliation
8. regenerate selected reports
9. resume job processing
10. post new test financial event

Pass condition:

No unexplained balance/position divergence.

---

## 21. Long-Running Simulation

Run accelerated simulation covering at least:

**2 virtual years**

with:

- 3–5 players
- hundreds/thousands of trades
- USD/CAD positions
- player loans
- system loans
- gifts
- margin
- dividends
- corporate actions
- monthly leagues
- weekly reports
- prestige purchases
- defaults
- multiple bankruptcies
- inactivity
- provider outages
- process restarts

### 21.1 Simulation Assertions

At completion:

- ledger balances
- no negative available cash outside defined states
- no negative owned quantity
- no orphan loan payable/receivable
- no duplicate dividends/corporate actions
- league accounts isolated
- all closed bankruptcies reconcile
- all published reports reference valid finalized periods
- projections rebuild identically

---

## 22. Economic Abuse Simulation

Automated/adversarial strategies should attempt:

- stale-price arbitrage
- simultaneous double spend
- circular gifts
- circular loans
- tiny-loan credit farming
- bankruptcy cycling
- loan-and-gift before bankruptcy
- wager abuse
- achievement dust-trade farming
- limit-order timing abuse
- cross-currency rounding abuse

Expected outcome:

No strategy creates money/performance credit outside intentionally permitted game mechanics.

---

## 23. Performance Expectations

For a 2–5 player private environment:

- `/stockpile` Home should normally respond within a few seconds
- non-provider financial actions should normally commit within a few seconds
- direct real-time provider trade may settle promptly when data available
- delayed-feed trade may intentionally remain pending for provider delay
- reports may render asynchronously but finalized data should be accessible even if image generation takes longer

Correctness beats arbitrary low latency.

---

## 24. Operational Readiness

Before launch confirm:

- production secrets configured
- bot permissions minimal/sufficient
- public Stockpile channel configured
- admin users configured
- provider credentials configured
- provider health visible
- database backups active
- restore instructions documented
- logs/metrics accessible
- admin alert destination configured
- trading safe modes tested
- projection rebuild tested
- corporate-action review queue tested

---

## 25. Security Checklist

- Discord bot token not in repo
- provider keys not in repo
- DB credentials not in repo
- no private financial state in component IDs
- server-side authorization on every mutation
- exact decimal validation
- numeric range limits
- SQL parameterization/query-layer safety
- dependency lockfile
- dependency vulnerability scan
- container runs without unnecessary privileges
- admin corrections audited

---

## 26. Documentation Readiness

Repo must contain:

- README
- Product/Game Plan
- Economy Spec
- Discord UX Spec
- Market Data Spec
- Financial Ledger Spec
- Edge Cases Spec
- Architecture Spec
- Release Criteria
- deployment/runbook before production
- provider/license record before production

The README should identify the current project phase and link the canonical documents.

---

## 27. Private Alpha Soak

Before declaring Stockpile stable:

Run a private alpha/soak with the actual three-player server.

Recommended minimum:

- at least 4 full market weeks
- at least one monthly league close if timing permits

During soak:

- use real fictional balances
- do not manually fix gameplay outcomes unless a bug is proven
- log every required intervention

Any routine manual intervention is evidence that the zero-touch design is incomplete.

### 27.1 Intervention Budget

Target after initial bug fixes:

**0 routine interventions per week.**

Every intervention should be categorized:

- software defect
- external provider issue
- ambiguous corporate action
- operational infrastructure issue
- missing product rule

A `missing product rule` found during soak must be added to specs/tests before stable release.

---

## 28. Stable Release Gate

Stockpile may be called stable for the private server only when:

- all launch-critical automated tests pass
- 2-year simulation passes
- backup restore drill passes
- no unresolved financial reconciliation failures exist
- market-data license is confirmed
- provider production behavior is certified
- all core UX surfaces pass desktop/mobile review
- four-week soak does not reveal recurring manual operation
- known defects cannot create/corrupt money, shares, debt, credit, league results, or bankruptcy state

Cosmetic issues may remain if they do not compromise clarity/usability.

---

## 29. Automatic No-Go Conditions

Do not launch or reopen trading if any of the following is true:

- uncertain market-data display rights
- ledger imbalance
- projection rebuild does not reconcile
- provider timestamps/freshness are not understood
- Canadian intraday data unavailable under the selected execution model
- cross-currency accounting mismatch
- duplicate financial events observed
- corporate actions can silently corrupt holdings
- backup restore untested
- bankruptcy can strand a player permanently
- stale quotes can be exploited

---

## 30. What Is Not Required for Private Launch

Stockpile does not need:

- public Discord bot listing
- multi-guild onboarding UI
- billing/subscriptions
- web dashboard
- options
- crypto
- short selling
- taxes
- real-money connections
- brokerage integration
- machine-learning recommendations
- LLM-generated game logic
- mobile app

Do not let these delay a correct private game.

---

## 31. Definition of Done

The project is done enough to play when the following story works without intervention:

1. three friends create accounts through `/stockpile`
2. they trade real US and Canadian securities with fictional CAD
3. prices move in the real world
4. one player borrows and another lends
5. somebody makes a terrible concentrated bet
6. league standings change automatically
7. Friday Weekly Wrap accurately roasts everyone
8. dividends/corporate actions occur correctly
9. someone eventually experiences margin trouble or bankruptcy
10. Stockpile settles everything and provides a comeback path
11. the bot restarts/upgrades without losing or duplicating money
12. nobody needs to remember how the database works to keep the game running

That is the private-launch quality bar.
