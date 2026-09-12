# Stockpile Economy Specification

**Status:** Draft for Phase 0 specification freeze  
**Version:** 0.1  
**Scope:** Career economy, trading economics, credit, borrowing, lending, transfers, leverage, financial distress, bankruptcy, recovery, prestige assets, competition isolation, and economic reporting rules.

This document converts the product plan into deterministic economic rules. Unless superseded by a later approved specification, these defaults are the intended implementation behavior.

---

## 1. Goals

Stockpile is a persistent financial-life game powered by real US and Canadian markets. Its economy must make real market movements socially interesting without requiring manual content creation or routine administrator intervention.

The economy should create meaningful stories through the interaction of:

- real security prices
- player portfolios
- cash and liquidity
- borrowing
- player-to-player lending
- credit
- leverage
- financial status
- gifts and transfers
- friendly wagers
- bankruptcy and recovery
- prestige spending
- leagues and career records

The economic model must prioritize four properties:

1. **Understandable.** A player should be able to understand why their money or status changed.
2. **Deterministic.** The same inputs and market data must produce the same financial result.
3. **Recoverable.** A catastrophic failure must create a comeback path rather than ending the game.
4. **Zero-touch.** Routine economic progression, settlement, distress, bankruptcy, and recovery must not require an administrator.

Stockpile intentionally models a game economy, not the exact rules of a real brokerage, lender, bankruptcy court, tax system, or securities regulator.

---

## 2. Economic Accounts

Each player has two conceptually separate financial worlds.

### 2.1 Career Account

The Career Account is permanent.

It contains or references:

- career cash
- investment positions
- cost basis
- realized gains/losses
- accrued and paid dividends
- system debt
- player-to-player debt
- loans receivable
- prestige assets
- margin obligations if enabled
- wager escrow
- financial status
- credit score/rating
- career statistics

The Career Account does not reset during normal gameplay.

### 2.2 League Account

The League Account is a temporary competitive portfolio with standardized starting capital.

It is isolated from the Career Account. Career money cannot be transferred into a League Account and league money cannot leave it.

At the start of each monthly league period:

- every eligible player receives **100,000 units of league cash**
- league holdings reset to zero
- league debt resets to zero
- no gifts or player loans are permitted
- no prestige assets exist inside the league

League performance is judged on investment performance, not career wealth.

### 2.3 Economic Isolation Invariant

A Career Account transaction must never change League Account buying power, and a League Account transaction must never change Career Account net worth.

Trophies, records, achievements, and profile prestige may cross from league results into the career profile, but cash does not.

---

## 3. Base Currency

Each Stockpile Discord environment has one configured **base currency**.

Supported base currencies:

- CAD
- USD

For the initial private Stockpile deployment, the default base currency is **CAD**.

All of the following are represented in the configured base currency:

- player cash
- net worth
- loan principal
- prestige asset prices
- league starting balance
- reporting totals
- career milestones

Players may still buy both Canadian and US securities.

Stockpile does not maintain separate persistent USD and CAD cash wallets at launch.

### 3.1 Foreign Security Conversion

When a security is denominated in a currency different from the environment base currency:

1. Stockpile retrieves an authoritative FX quote at execution time.
2. The transaction is converted into the base currency.
3. The FX rate used is permanently stored on the transaction.
4. A small game FX spread is applied.

Default FX spread:

**0.20% each way**

This creates modest friction without turning Stockpile into a forex simulator.

The FX spread is configurable.

### 3.2 Valuation

Foreign positions are marked to market using:

- the latest valid security price
- the latest valid FX conversion rate

Historical reports retain the valuation inputs used at the time of each snapshot.

---

## 4. Starting State

A newly created Career Account starts with:

- Cash: **100,000 base-currency units**
- Securities: none
- Prestige assets: none
- System debt: zero
- Player debt: zero
- Loans receivable: zero
- Credit score: **40 / 100**
- Credit rating: **C**
- Financial status: **New Investor**
- Bankruptcy count: zero

The starting grant is a system-created ledger event and is permanently auditable.

A player may not create more than one Career Account in a Discord environment.

---

## 5. Net Worth

Career net worth is defined as:

```text
cash
+ market value of long security positions
+ eligible prestige asset liquidation value
+ principal and accrued collectible value of player loans receivable
+ other recognized financial assets
- system loan balances
- player loan balances
- margin debt
- accrued payable interest and fees
- other recognized liabilities
= net worth
```

Net worth is a financial state, not an XP score.

### 5.1 Intraday Net Worth

The Home interface may show an intraday estimate using the latest valid market prices.

### 5.2 Official Net-Worth Snapshots

Official historical snapshots are recorded:

- after the relevant North American market close on trading days
- after bankruptcy
- after a major corporate action that materially changes holdings
- after a prestige purchase or sale
- at league/month-end reporting boundaries

These snapshots power the long-term net-worth timeline.

### 5.3 Loans Receivable Valuation

A performing player loan is initially valued at outstanding principal plus accrued interest.

Once delinquent, its reported collectible value is discounted:

- Current: 100%
- 1–3 days delinquent: 90%
- 4–7 days delinquent: 70%
- 8+ days delinquent / Default: 40%
- Borrower bankrupt: actual expected bankruptcy recovery only

This prevents a lender from appearing wealthier simply because another player owes money that is unlikely to be repaid.

---

## 6. Trading Economics

Stockpile supports common stocks and ETFs on supported US and Canadian exchanges.

### 6.1 Fractional Shares

Fractional shares are supported to at least six decimal places internally.

UI presentation may round quantities for readability, but accounting must not use UI-rounded values.

### 6.2 Stock Commission

Default stock/ETF commission:

**0.00**

The game should not punish frequent experimentation merely to imitate legacy brokerage fees.

FX spreads and debt costs provide sufficient economic friction.

### 6.3 Cost Basis

Stockpile uses **weighted-average cost basis per security and account** for gameplay and reporting.

This is deliberately simpler than jurisdiction-specific tax-lot accounting.

Stockpile does not model capital-gains taxation.

### 6.4 Market Orders

If the relevant exchange is open and Stockpile has a fresh executable quote, a market order may execute immediately according to the market-data execution policy.

If the exchange is closed, the order becomes **Pending Market Open**.

A queued market order does not reserve an execution price.

Cash required for a pending buy order is reserved so the player cannot double-spend it.

If the opening execution price would exceed available reserved cash because the price gapped upward, Stockpile reduces the fractional quantity to the maximum affordable amount unless that would fall below the minimum trade size.

### 6.5 Limit Orders

A buy limit order reserves sufficient cash for the requested quantity at the limit price plus any expected FX spread.

A sell limit order reserves the requested quantity of shares.

Limit orders remain active until one of:

- filled
- manually cancelled
- expired according to the selected duration
- invalidated by a corporate action

Default durations:

- Day
- Good for 7 calendar days

Longer-lived order types may be added only if the corporate-action handling remains deterministic.

### 6.6 Minimum Trade Size

Default minimum notional trade size:

**10 base-currency units**

This avoids meaningless fractional dust and reporting noise.

### 6.7 Stale or Missing Prices

If Stockpile cannot obtain a trustworthy executable price, the trade does not execute.

The player's economic state is never mutated using a guessed price.

---

## 7. Dividends and Distributions

Cash dividends and ETF distributions are credited automatically.

Entitlement is based on the player's eligible share quantity according to the provider's corporate-action/ex-date data.

Fractional shares receive proportional distributions.

Dividend cash is converted into the environment base currency using the authoritative FX rate applicable to the payment event.

Dividend income is separately tracked for:

- current month
- current year
- career
- weekly awards and records

Stockpile does not model dividend withholding tax at launch.

---

## 8. External Cash Flows and Performance Measurement

Career net worth may change because of gifts, transfers, loans, and market performance. These must not be confused.

Stockpile therefore separates:

- **Net Worth** — how wealthy the player currently is
- **Investment Performance** — how well the player's invested capital performed
- **Net External Transfers** — gifts/transfers received minus sent
- **Financing Activity** — borrowed/lent capital and interest

### 8.1 Performance Calculation

Career and league return reporting should use a cash-flow-adjusted time-weighted method so a player cannot create an impressive return merely by receiving money from another player.

Daily sub-period returns are chained into week, month, year, and all-time results.

Gifts and direct transfers are treated as external cash flows for the recipient and sender.

Loan principal is treated as financing, not investment return.

Interest paid/received remains part of financial-life reporting but is not treated as stock-market alpha.

---

## 9. Financial Status Ladder

Positive financial status is derived from the player's current economic condition rather than XP.

Negative distress states override positive status.

### 9.1 Positive Status Defaults

#### New Investor

Applies until the player completes their first trade or the account reaches seven days old.

#### Retail Investor

- account has passed New Investor state
- net worth at least 50,000

#### Established Investor

- net worth at least 250,000
- credit rating at least B

#### Accredited Investor

- net worth at least 500,000
- credit rating at least B

#### High Net Worth

- net worth at least 1,000,000
- credit rating at least A

#### Market Elite

- net worth at least 5,000,000
- credit rating at least AA

#### Tycoon

- net worth at least 25,000,000
- credit rating at least AA

Thresholds are environment configuration values, not hard-coded UI assumptions.

### 9.2 Downgrade Grace

Positive status does not immediately downgrade because of a one-day market fluctuation.

A player has a **five trading-day grace period** after falling below a positive-status threshold.

If they remain below the threshold at the end of the grace period, status is downgraded.

Negative states do not receive this grace period.

### 9.3 Negative Status Overrides

Possible override states:

- Overleveraged
- Distressed
- In Default
- Insolvent
- Bankrupt
- Recovering

A player may still retain a historical record of the highest positive status ever achieved.

---

## 10. Credit Model

Stockpile maintains an internal credit score from **0 to 100**.

The UI normally shows the letter rating prominently while reports may expose the numeric score.

### 10.1 Rating Bands

- **D:** 0–24
- **C:** 25–44
- **B:** 45–59
- **A:** 60–74
- **AA:** 75–89
- **AAA:** 90–100

New players begin at score **40 / C**.

### 10.2 Credit Philosophy

Credit is historical and event-driven. A player cannot instantly become AAA simply by receiving a large gift.

Credit responds to:

- timely debt repayment
- missed payments
- delinquency
- defaults
- leverage stress
- forced liquidation
- bankruptcy
- sustained healthy debt usage
- account history

### 10.3 Positive Credit Events

Default score adjustments:

- System loan fully repaid on time: **+3**
- Player loan fully repaid on time: **+2**
- 30 consecutive days with debt, no late payment, and debt/assets below 25%: **+1**
- 90 consecutive days without any delinquency/default: **+2**

Positive stability bonuses are capped so a player cannot farm tiny loans rapidly.

A player may receive at most **+4 stability/repayment points in a rolling 30-day period**, excluding one-time major recovery milestones defined elsewhere.

### 10.4 Negative Credit Events

Default score adjustments:

- Payment 1–3 days late: **−2**
- Payment 4–7 days late: **−5 additional**
- Loan default: **−15**
- Margin call: **−4**
- Forced liquidation: **−8**
- Bankruptcy: score becomes **min(current score, 10)**

The same underlying event must not be double-penalized beyond the explicit staged rules.

### 10.5 Post-Bankruptcy Credit Floor

After bankruptcy:

- credit score is capped at 24 for 30 calendar days
- system unsecured borrowing is disabled for 30 calendar days
- margin is disabled for at least 90 calendar days

The player can still trade with their own cash immediately.

---

## 11. System Bank Loans

The fictional Stockpile Bank provides unsecured career loans.

System loans create temporary purchasing power but introduce scheduled obligations and interest expense.

### 11.1 Eligibility

A player is ineligible for a new system loan while any of the following is true:

- credit rating D
- account is Bankrupt or Recovering within the initial 30-day recovery lockout
- any loan is in default
- a margin call is active
- the player is Insolvent
- requested loan would exceed the player's credit limit

### 11.2 Credit Limits

Default maximum aggregate unsecured system debt:

| Rating | Limit as % of Net Worth | Absolute Cap |
|---|---:|---:|
| C | 5% | 10,000 |
| B | 10% | 25,000 |
| A | 20% | 100,000 |
| AA | 30% | 500,000 |
| AAA | 40% | 2,000,000 |

The applicable limit is the lower of the percentage-based limit and absolute cap.

A minimum loan amount of **500** applies.

### 11.3 Default APR

| Rating | APR |
|---|---:|
| C | 22% |
| B | 14% |
| A | 9% |
| AA | 6% |
| AAA | 4% |

Rates are game parameters and may be tuned before final release.

### 11.4 Maximum Term

| Rating | Maximum Term |
|---|---:|
| C | 14 days |
| B | 30 days |
| A | 60 days |
| AA | 90 days |
| AAA | 180 days |

### 11.5 Interest Calculation

System loans use simple daily interest based on Actual/365:

```text
interest = outstanding_principal × APR × elapsed_days / 365
```

Interest calculations use precise decimal arithmetic.

### 11.6 Repayment Plans

System loans support:

- Single payment at maturity
- Equal weekly principal payments plus accrued interest

A player may repay early without penalty.

### 11.7 Automatic Payment

On a scheduled due date, Stockpile attempts to pay the amount from available career cash.

Stockpile does **not** automatically sell ordinary investment positions to satisfy an unsecured loan payment.

If cash is insufficient, the obligation becomes delinquent.

This preserves the distinction between unsecured debt and margin collateral.

---

## 12. Player-to-Player Loans

Player lending is intended to create social gameplay and real consequences without administrator involvement.

### 12.1 Loan Offer

A lender specifies:

- borrower
- principal
- APR
- term
- repayment style

Allowed terms at launch:

- 7 days
- 14 days
- 30 days
- 60 days
- 90 days

Allowed repayment styles:

- Single payment at maturity
- Weekly installments

Allowed APR range:

**0% to 50%**

The APR is prominently displayed before acceptance.

### 12.2 Escrow and Acceptance

When a loan offer is created, the principal is reserved from the lender's available cash.

If the borrower declines or the offer expires, the reservation is released.

On acceptance:

- principal moves to borrower cash
- borrower liability is created
- lender receivable is created
- the contract becomes immutable except through defined restructure/forgiveness actions

### 12.3 Lender Exposure Limits

A player may not create a new player loan if:

- they are Distressed, In Default, Insolvent, Bankrupt, or under Margin Call
- the new principal would exceed 25% of lender net worth to a single borrower
- aggregate player-loan principal outstanding would exceed 50% of lender net worth
- the loan would reduce the lender's cash below already-due obligations

These limits prevent a lender from transferring nearly all wealth into illiquid receivables merely to game status or bankruptcy.

### 12.4 Borrower Limits

A borrower may accept a loan only if:

- they are not Bankrupt
- they are not currently in unresolved default to the same lender
- acceptance would not push total non-margin debt above 75% of current net worth unless the borrower is already in a defined restructuring flow

A player loan does not require a particular credit rating because friends are allowed to make bad decisions.

The borrower's credit rating and distress state are displayed prominently to the lender.

### 12.5 Delinquency Stages

- Due date through +3 days: **Late**
- +4 through +7 days: **Delinquent**
- +8 days: **Default**

Partial payments reduce principal/interest but do not automatically reset the delinquency clock unless the contract is formally restructured.

### 12.6 Restructuring

Before bankruptcy, lender and borrower may mutually agree to:

- extend maturity
- reduce APR prospectively
- convert a bullet loan into installments
- forgive part of principal
- forgive accrued interest

Restructuring creates new ledger entries and preserves the original contract history.

### 12.7 No Debt Marketplace at Launch

Loans cannot be sold to a third player at launch.

This may be reconsidered only if it adds clear social value without excessive complexity.

---

## 13. Gifts and Cash Transfers

Players may transfer career cash as a gift.

Gifts are permanent and do not create debt.

### 13.1 Transfer Limits

Default limits:

- Maximum single gift: **20% of giver net worth**
- Maximum aggregate gifts sent in rolling 7 days: **30% of giver net worth at the time of each transfer**

### 13.2 Transfer Restrictions

A player cannot send a gift while:

- Margin Call is active
- In Default
- Insolvent
- Bankrupt
- within the first 7 days of Recovering status
- the transfer would make an already-due debt payment impossible with current cash

### 13.3 Ranking Treatment

Gift receipt increases net worth because the player genuinely has more virtual money.

However, gifts are excluded from investment-return calculations.

Career reports separately show:

- gross gifts sent
- gross gifts received
- net transfers

Competitive League Accounts do not permit gifts.

---

## 14. Friendly Wagers and Predictions

Stockpile supports market predictions without allowing the entire game to become a casino.

### 14.1 Prediction Mode

A standard prediction may carry no cash stake and records only:

- result
- accuracy
- streak
- achievement/weekly award eligibility

### 14.2 Wager Challenge

A player may optionally challenge one or more friends with equal career-cash stakes on a standardized market question.

Examples:

- AAPL closes up or down this week
- AMD versus NVDA weekly return
- SHOP.TO finishes above/below a target

Stockpile acts as escrow and automated resolver.

### 14.3 Wager Limits

Maximum stake per participant is the lower of:

- 5% of the least-wealthy participant's net worth
- 25,000 base-currency units

A player may not wager while Distressed, In Default, Insolvent, Bankrupt, Recovering within 7 days, or under Margin Call.

League cash cannot be wagered.

### 14.4 Settlement

Wagers are zero-sum between players.

Stockpile does not provide house odds and does not create additional payout money.

Ties return escrowed stakes.

---

## 15. Leverage and Margin

Margin is an advanced career feature and is separate from unsecured system loans.

It exists to create meaningful risk, margin calls, and forced-liquidation stories.

### 15.1 Margin Eligibility

Default requirements:

- positive status at least Established Investor
- net worth at least 250,000
- credit rating A or better
- account age at least 30 days
- no default in previous 30 days
- no bankruptcy in previous 90 days

Margin must be explicitly enabled by the player after viewing a risk explanation.

### 15.2 Margin-Eligible Securities

At launch, margin may be used only for supported common stocks and non-leveraged ETFs that:

- trade on NYSE, NASDAQ, or TSX
- have a valid market price of at least 5 units in their listing currency
- are not halted, suspended, or delisted
- are not identified as leveraged/inverse products

TSXV securities are not margin eligible.

### 15.3 Initial Margin Requirement

Default initial equity requirement:

**50%**

A player therefore cannot use margin to exceed approximately 2× gross long exposure.

### 15.4 Maintenance Levels

Margin health is evaluated using account equity divided by margin-supported market value.

Default states:

- **Healthy:** 45% or greater
- **Elevated Risk:** 35% to <45%
- **Margin Call:** 30% to <35%
- **Forced Liquidation:** below 30%

A Margin Call also triggers if a call remains unresolved for one full trading day even if the ratio remains between 30% and 35%.

### 15.5 Margin Interest

Default margin APR:

- A: 10%
- AA: 7%
- AAA: 5%

Interest accrues daily.

### 15.6 Forced Liquidation

When forced liquidation is required, Stockpile automatically sells positions until projected maintenance equity reaches at least **40%**.

Liquidation order:

1. largest margin-supported position by current market value
2. next largest position
3. ticker symbol as deterministic tie-breaker

Only the minimum quantity needed to restore the target is sold where fractional trading permits.

If the relevant market is closed, liquidation orders are queued for the next available execution opportunity.

A market gap may therefore produce losses beyond the amount anticipated at the time the call was created.

### 15.7 Margin and Gifts

Players with margin debt may not gift money or issue new player loans if doing so would reduce margin equity or free cash below safe thresholds.

---

## 16. Short Selling

**Decision for the initial private release: short selling is excluded.**

Reasoning:

- reliable borrow availability is not part of ordinary market-price feeds
- borrow fees and hard-to-borrow states would otherwise be fictional
- unlimited-loss behavior significantly increases distress complexity
- long-only leverage already provides substantial risk and social drama

The architecture should avoid assumptions that make short positions impossible to add later, but short selling is not a launch requirement.

No release criterion should depend on short selling.

---

## 17. Financial Distress Model

Distress states are deterministic and may override the player's positive financial status.

### 17.1 Overleveraged

A player becomes Overleveraged when either:

- total debt exceeds 50% of gross recognized assets, or
- margin health enters Elevated Risk

Overleveraged is a warning state, not default.

### 17.2 Distressed

A player becomes Distressed when any of:

- total debt exceeds 75% of gross recognized assets
- available cash cannot cover obligations due within the next 3 calendar days and liquid unencumbered assets are insufficient to cover them at current value
- any debt becomes Delinquent

### 17.3 In Default

A player becomes In Default when any loan reaches its defined default threshold.

### 17.4 Insolvent

A player is Insolvent when:

```text
net worth <= 0
```

and the condition is confirmed using current valid valuation data.

Temporary inability to obtain a market quote does not itself make the player insolvent.

### 17.5 Distress Recovery

Negative status automatically clears when its underlying conditions no longer apply, except Default and Bankruptcy consequences that have explicit recovery rules.

---

## 18. Bankruptcy

Bankruptcy is a formal career-state transition, not merely negative net worth.

### 18.1 Mandatory Bankruptcy Trigger

Bankruptcy is automatically initiated when either:

1. the player remains Insolvent for **three consecutive calendar days** while having at least one defaulted debt, or
2. a margin liquidation completes and remaining recognized liabilities still exceed recognized assets by at least **5,000** base-currency units.

### 18.2 Voluntary Bankruptcy

A player who is In Default or Insolvent may voluntarily file earlier through the Bank interface.

The UI must show the expected consequences before confirmation.

### 18.3 Bankruptcy Estate

On bankruptcy initiation:

1. new trading is suspended temporarily
2. open buy orders are cancelled
3. sell orders are cancelled and positions move to the bankruptcy estate
4. available cash enters the estate
5. ordinary long security positions are liquidated at the next valid execution opportunity
6. prestige assets are liquidated at their defined liquidation values
7. wager obligations already locked in escrow remain in escrow until settled
8. receivables owed to the player remain assets of the estate

### 18.4 Creditor Priority

Available estate value is distributed in this order:

1. negative cash or execution settlement deficits
2. margin debt and accrued margin interest
3. secured/system operational liabilities, if any
4. unsecured system loans
5. player-to-player loans, pro rata among player lenders of equal priority

If insufficient value exists at a priority level, creditors in that level receive pro-rata recovery.

### 18.5 Discharge

After estate distribution:

- remaining unsecured system-loan balance is discharged
- remaining player-loan balance is discharged
- discharged debt remains permanently visible in credit/career history
- lender career statistics record unrecovered principal as a default loss

There is no system insurance that makes a player lender whole.

Lending to a risky friend is supposed to contain risk.

### 18.6 Bankruptcy Recovery Grant

After settlement, Stockpile creates a protected recovery grant of:

**10,000 base-currency units**

This is new system-created game money and is recorded as `BANKRUPTCY_RECOVERY_GRANT`.

### 18.7 Recovering State

After bankruptcy:

- player status becomes Recovering
- player can immediately buy ordinary securities using owned cash
- new unsecured system borrowing is disabled for 30 days
- player borrowing from friends remains disabled for 14 days
- gifts sent are disabled for 7 days
- margin is disabled for 90 days
- credit score is capped at D for 30 days

The player may receive gifts after bankruptcy unless an anti-abuse rule blocks the sender.

### 18.8 Repeat Bankruptcy

Repeat bankruptcy is allowed.

To discourage intentionally cycling bankruptcy:

- second bankruptcy within 180 days grants only 7,500 recovery cash
- third or later bankruptcy within 180 days grants 5,000 recovery cash
- recovery grant never falls below 5,000

A clean 180-day period resets the grant to the standard 10,000.

---

## 19. Prestige Assets

Prestige assets exist primarily as visible wealth sinks and collection goals.

They are not intended to become a second investment market.

### 19.1 Economic Rules

At launch:

- prestige assets have a fixed purchase price
- prestige assets generate no passive income
- prestige assets do not appreciate
- prestige assets have no maintenance fee
- ordinary voluntary resale returns **75% of purchase price**
- bankruptcy liquidation returns **60% of purchase price**

The player's net worth values prestige assets at their current voluntary resale value, not original purchase price.

Purchasing prestige therefore immediately sacrifices some financial net worth in exchange for status and collection value.

### 19.2 Purpose

Prestige assets may contribute to:

- profile visuals
- collection completion
- achievements
- career milestones
- endgame status requirements

They should not grant large compounding economic bonuses.

### 19.3 Asset Catalogue

Exact asset names, categories, tiers, and prices belong in a later game-content specification.

The economic engine should model them generically from configuration.

---

## 20. Taxes

Stockpile does **not** model personal income tax, capital-gains tax, tax-loss harvesting, registered accounts, withholding tax, or jurisdiction-specific tax rules at launch.

Reasons:

- US and Canadian taxation differ materially
- taxes add substantial bookkeeping with limited social payoff
- taxation would make a game mechanic depend on real-world legal changes

Tax simulation is explicitly outside the zero-touch launch scope.

---

## 21. League Economy

The monthly League is designed for fair competition regardless of career wealth.

### 21.1 Standard Capital

Each ranked player begins each month with:

**100,000 league units**

League currency denomination follows the environment base currency for display.

### 21.2 Allowed League Activity

Launch league accounts support:

- long stock positions
- long ETF positions
- market orders
- limit orders
- fractional shares
- dividends/distributions
- FX conversion under the same rules as Career Accounts

Launch league accounts do not support:

- gifts
- player lending
- system loans
- margin
- wagers funded with league money
- prestige assets

This keeps the leaderboard focused on investing performance.

### 21.3 League Participation

Players with an existing Career Account are automatically eligible for each monthly league.

A player who joins after the league has begun receives a practice league account but is marked **Provisional** and does not qualify for the current month's championship.

They become fully ranked at the next monthly reset.

### 21.4 League Scoring

Primary ranking:

**time-weighted percentage portfolio return**

Tie-breakers in order:

1. lower maximum drawdown
2. higher ending net asset value
3. earlier first completed trade in that league period

The third tie-breaker is intentionally arbitrary but deterministic and should almost never be needed.

### 21.5 Career Rewards

League championships award:

- trophy
- achievement progress
- profile history
- weekly/monthly recognition

They do not inject large cash prizes into the Career Account.

Optional small cosmetic/prestige rewards may be defined later.

---

## 22. Benchmarks

Each environment defines one primary market benchmark used for performance comparisons.

Default:

- CAD environment: S&P/TSX Composite-compatible benchmark
- USD environment: S&P 500-compatible benchmark

The exact provider symbol/index representation belongs in the market-data specification.

Stockpile may display additional US and Canadian index context, but awards such as **Market Beater** use the configured primary benchmark to remain deterministic.

---

## 23. Weekly Economic Statistics

The Friday Weekly Wrap should derive statistics from official weekly boundaries rather than arbitrary rolling windows.

Default weekly period:

- starts at the first supported market session of the week
- ends after the final supported US/Canadian market close of Friday or the week's last trading session

Potential metrics include:

- career investment return
- league return
- absolute change in net worth
- realized trading profit
- unrealized movement
- dividends received
- interest paid
- interest earned
- cash percentage
- concentration
- drawdown and recovery
- largest winning position
- largest losing position
- number of trades
- debt change
- credit change
- gifts/transfers
- player-loan activity
- proximity to margin thresholds

External gifts must not qualify a player for investment-performance awards.

The weekly award-selection algorithm belongs in the reporting/game specification, but the economy must provide the underlying metrics deterministically.

---

## 24. Money Sources and Sinks

Stockpile does not require a closed money supply because real-market valuation itself creates and destroys virtual wealth.

Still, explicit money creation/destruction should be understood.

### 24.1 System Money Sources

Examples:

- initial career grant
- bankruptcy recovery grant
- system loan disbursement
- market sale proceeds
- dividends/distributions
- corporate cash consideration
- prestige resale proceeds

### 24.2 System Money Sinks

Examples:

- investment purchases
- repayment of system-loan principal
- system-loan interest
- margin interest
- FX spread
- prestige purchases
- bankruptcy losses

### 24.3 Player-Neutral Transfers

These move wealth between players without changing aggregate player wealth before valuation effects:

- gifts
- player loans
- player-loan interest
- friendly wager settlement

Every source, sink, and transfer must map to explicit ledger entries.

---

## 25. Economic Invariants

Implementation must preserve these invariants.

### 25.1 No Negative Spendable Cash

A normal buy, gift, wager, or prestige purchase may never produce negative available cash.

Negative cash may exist only as a defined settlement deficit or debt state created by market gaps/corporate actions and must enter distress processing.

### 25.2 No Double Spending

Reserved cash/shares for pending orders, wager escrow, or accepted obligations are not available for another operation.

### 25.3 No Silent Balance Mutation

Every change to cash, debt, receivable, asset ownership, or security quantity must be explained by one or more immutable ledger entries.

### 25.4 Accounting Balance

Every multi-party internal transaction must balance across the relevant internal accounts.

### 25.5 Idempotent Settlement

Re-running a loan payment, dividend, trade settlement, wager settlement, league rollover, or bankruptcy job must not duplicate money or positions.

### 25.6 Market Data Does Not Rewrite History

Later corrections to provider data do not silently rewrite completed player transactions.

If a completed transaction must be corrected, Stockpile creates explicit compensating entries under administrator/reconciliation rules.

### 25.7 League Isolation

No Career Account transfer or debt event may affect League buying power.

### 25.8 Distress Cannot Be Escaped by Transfer

A player may not gift or lend away assets in violation of the restrictions defined here to manufacture bankruptcy or evade creditors.

---

## 26. Inactivity

Stockpile's career economy continues while a player is inactive.

If a player has no debt, inactivity is generally harmless:

- holdings continue to change value
- dividends continue to be received
- career history continues

If a player voluntarily takes on time-bound debt, its schedule continues during inactivity.

Stockpile may automatically pay scheduled obligations from available cash.

It does not pause debt simply because the Discord user stopped interacting.

The UI must clearly communicate this when borrowing.

An inactivity-specific notification policy will be defined separately so Stockpile does not repeatedly ping absent players.

---

## 27. Required Player Explanations

For every important financial state, the UI must be capable of answering **why**.

Examples:

### Net Worth

Show components contributing to current net worth.

### Credit Change

Show the event that moved credit and the score/rating before/after.

### Loan Balance

Show original principal, accrued interest, payments, and current amount due.

### Margin Call

Show current equity, maintenance threshold, and required correction amount.

### Bankruptcy

Show assets liquidated, creditor recoveries, debt discharged, credit impact, and recovery grant.

The game may joke about the result, but financial explanations must remain precise.

---

## 28. Configuration Versus Code

The following should be data/configuration values rather than scattered code constants:

- starting career cash
- starting league cash
- base currency
- FX spread
- minimum trade size
- status thresholds
- credit rating bands
- credit event adjustments
- system loan limits/rates/terms
- player loan APR and term limits
- transfer limits
- wager limits
- margin eligibility and thresholds
- bankruptcy timing and recovery grants
- prestige resale/liquidation percentages
- benchmark identity

Changing configuration must be versioned so historical reports can identify which economic rules were active at the time.

---

## 29. Economy Versioning

Stockpile should attach an **economy ruleset version** to economic events that depend on configurable policy.

Example:

`economy_ruleset = 1`

A future bug fix or deliberate rule change must not make historical transactions impossible to explain.

This does not mean old players remain permanently on old rules; it means the audit trail records which rules produced each event.

---

## 30. Decisions Frozen by This Draft

Unless deliberately reopened during Phase 0 review, this document makes the following recommendations explicit:

1. Career starting cash is 100,000.
2. Private deployment base currency defaults to CAD.
3. US and Canadian stocks/ETFs share one base-currency wallet.
4. Fractional shares are supported.
5. Stock/ETF commissions are zero.
6. Cross-currency trading uses a 0.20% FX spread.
7. Weighted-average cost basis is used.
8. Taxes are not simulated.
9. Credit uses a 0–100 historical score mapped to D–AAA.
10. Both system loans and player loans exist.
11. Player loans carry real default risk to the lender.
12. Gifts exist but are constrained during distress.
13. Friendly cash wagers are allowed only through standardized, escrowed challenges with strict caps.
14. Margin exists as an advanced career feature.
15. Short selling does not ship in the initial private release.
16. Bankruptcy liquidates assets, discharges eligible residual debt, damages credit, and provides recovery capital.
17. Prestige assets are primarily wealth sinks and profile/status items, not investments.
18. Monthly League Accounts are economically isolated and long-only at launch.
19. Career investment performance excludes gift/transfer distortions.
20. All economic behavior must be reconstructable from the immutable ledger.

---

## 31. Items Still Requiring Cross-Specification Validation

The following are intentionally not fully closed until related Phase 0 documents are written:

- exact authoritative market-price execution model
- exact FX provider/rate timing
- exact corporate-action accounting cases
- exact supported exchange calendar behavior
- final prestige asset catalogue/pricing tiers
- final Discord presentation of borrowing risk
- final weekly award selection algorithm
- exact market benchmark provider symbols
- administrator compensation/reconciliation workflow
- exact database ledger schema
- notification thresholds during delinquency/distress

These are dependencies on `MARKET_DATA_SPEC.md`, `FINANCIAL_LEDGER.md`, `DISCORD_UX.md`, `EDGE_CASES.md`, and `RELEASE_CRITERIA.md`; they are not invitations to improvise during implementation.

---

## 32. Economy North Star

The economy is working when a sequence like this requires no handcrafted event:

1. Scott buys a concentrated real-market position.
2. He borrows conservatively against his growing career wealth.
3. The stock rallies and his status improves.
4. He lends part of the gains to a friend.
5. A real earnings event sends the stock sharply lower.
6. His credit and leverage metrics worsen.
7. Another player overtakes him in the monthly league.
8. His friend misses a loan payment.
9. Friday's report recognizes the best trader, worst timing, debt drama, and largest comeback.
10. If losses continue, the system handles margin liquidation or bankruptcy automatically.
11. Scott can rebuild without an administrator changing a balance.

The market supplies the uncertainty. Stockpile supplies the consequences, competition, humour, and history.
