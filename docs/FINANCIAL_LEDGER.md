# Stockpile Financial Ledger Specification

**Status:** Draft for Phase 0 specification freeze  
**Version:** 0.1  
**Scope:** Immutable journal, accounting identities, monetary and security subledgers, idempotency, reservations, settlement, corrections, reconciliation, audit history, projection rebuilds, and financial event examples.

Stockpile's permanent player economy depends on one non-negotiable property:

> Every financial result must be explainable from immutable recorded events.

The database must never rely on mutable balance fields as the sole source of truth.

---

## 1. Design Goals

The ledger must make the following possible:

- reconstruct a player's cash history
- reconstruct debt and loan history
- explain every portfolio quantity change
- explain where every virtual dollar came from or went
- prove that a scheduled event did not run twice
- rebuild derived balances after corruption
- reverse an incorrect event without deleting history
- distinguish market-value movement from actual cash movement
- support career and league economies independently
- audit corporate actions
- settle bankruptcy deterministically
- retain evidence of the ruleset and external market inputs used

The financial ledger should be deliberately boring. Game personality belongs in presentation; accounting belongs here.

---

## 2. Source-of-Truth Model

Stockpile uses an append-only **financial event journal** plus deterministic projections.

Conceptually:

```text
Financial Event
  -> Journal Entries
  -> Security Quantity Entries where applicable
  -> Derived Projections / Balances / Reports
```

The authoritative history is the immutable event + journal entries.

Cached/projection state may include:

- current cash
- reserved cash
- current positions
- weighted-average cost basis
- debt balances
- loan receivables
- interest accruals
- prestige assets
- wager escrow
- current credit state
- net-worth snapshots

These projections may be rebuilt from authoritative history.

---

## 3. Ledger Scope

Every financial mutation must belong to exactly one Stockpile environment/guild and one economic scope.

Economic scopes:

- `CAREER`
- `LEAGUE`
- `SYSTEM`

Career and League entries must never share player cash accounts.

All ledger records include an immutable `environment_id` even for the initial one-server deployment.

This provides tenant safety without requiring Stockpile to become a public multi-tenant service.

---

## 4. Monetary Representation

### 4.1 No Binary Floating Point

Money, rates, quantities, and prices must use exact decimal arithmetic.

Never use IEEE floating-point values for authoritative accounting.

### 4.2 Precision

Recommended internal precision:

- money: `DECIMAL(24,8)` or equivalent
- security quantity: `DECIMAL(28,12)`
- price: `DECIMAL(24,10)`
- FX rate: `DECIMAL(24,12)`
- interest/rates: `DECIMAL(18,12)`

UI output may round according to currency/display rules, but stored values retain full supported precision.

### 4.3 Currency

Each monetary journal line contains an explicit currency.

For Career/League player balances, the normal settlement currency is the configured environment base currency.

Foreign-security execution evidence retains listing-currency values even though player cash accounting posts in base currency.

---

## 5. Financial Event

A **Financial Event** represents one business action or system outcome.

Example event types:

- account opening grant
- stock buy
- stock sell
- dividend
- FX spread
- system loan disbursement
- system loan payment
- player loan disbursement
- player loan payment
- interest accrual/payment
- gift
- wager escrow
- wager settlement
- prestige purchase
- prestige sale
- margin borrowing
- margin interest
- forced liquidation
- split
- merger
- cash acquisition
- spin-off
- bankruptcy liquidation
- debt discharge
- recovery grant
- administrator correction

Required event metadata:

```text
id
UUID/ULID or similarly collision-safe identifier

environment_id
scope
player/account context where applicable
event_type
status
business_effective_at
created_at
posted_at
source_type
source_id
idempotency_key
correlation_id
economy_ruleset_version
market_data_reference where applicable
initiating_discord_user_id where applicable
metadata_json
```

### 5.1 Effective Time Versus Posting Time

Stockpile distinguishes:

- `business_effective_at` — when the economic event is considered to have occurred
- `posted_at` — when Stockpile committed it to the ledger

This matters for delayed dividends, corporate-action corrections, and replayed jobs.

---

## 6. Event Status

Financial event lifecycle states:

- `PENDING`
- `POSTED`
- `FAILED`
- `REVERSED`

A `POSTED` event is immutable.

A reversal does not edit the original event. It posts a new compensating event linked by `reverses_event_id`.

A failed event posts no authoritative journal effect unless an explicit partial-settlement model exists.

---

## 7. Double-Entry Monetary Journal

Stockpile should use balanced journal entries for monetary/account-value movements.

Each posted financial event produces one or more journal lines.

Each line contains:

```text
journal_entry_id
financial_event_id
ledger_account_id
direction (DEBIT/CREDIT)
amount
currency
created_at
metadata
```

For every financial event and currency:

```text
sum(debits) == sum(credits)
```

The database/application must reject an unbalanced event.

### 7.1 Why Double Entry

Double-entry accounting gives Stockpile a deterministic way to detect:

- money creation bugs
- incomplete transfers
- duplicated settlement
- broken loan postings
- incorrect bankruptcy distributions

This is useful even though Stockpile is a fictional economy.

---

## 8. Ledger Accounts

Ledger accounts are internal accounting buckets, not necessarily UI concepts.

Typical player Career accounts:

- `PLAYER_CASH`
- `PLAYER_RESERVED_CASH`
- `PLAYER_WAGER_ESCROW`
- `PLAYER_LOAN_RECEIVABLE`
- `PLAYER_INTEREST_RECEIVABLE`
- `PLAYER_SYSTEM_LOAN_PAYABLE`
- `PLAYER_P2P_LOAN_PAYABLE`
- `PLAYER_INTEREST_PAYABLE`
- `PLAYER_MARGIN_PAYABLE`
- `PLAYER_PRESTIGE_ASSET_VALUE`
- `PLAYER_SETTLEMENT_DEFICIT`

System/counterparty accounts may include:

- `SYSTEM_EQUITY`
- `SYSTEM_BANK_CASH`
- `SYSTEM_INTEREST_INCOME`
- `SYSTEM_FX_SPREAD_INCOME`
- `SYSTEM_RECOVERY_GRANT_EXPENSE`
- `SYSTEM_BANKRUPTCY_WRITE_OFF`
- `MARKET_SECURITIES_CLEARING`
- `CORPORATE_ACTION_CLEARING`
- `WAGER_CLEARING`

The exact chart of accounts may evolve during implementation but the balancing model must not.

---

## 9. Security Quantity Subledger

Cash double-entry alone cannot represent shares.

Stockpile therefore maintains an immutable **security quantity subledger**.

Each quantity event records:

```text
security_entry_id
financial_event_id
position_account_id
security_id
quantity_delta
quantity_after (optional validated projection)
unit_cost_in_base_currency where meaningful
effective_at
entry_type
metadata
```

Examples:

- `TRADE_BUY`
- `TRADE_SELL`
- `SPLIT`
- `MERGER_OUT`
- `MERGER_IN`
- `SPINOFF_IN`
- `BANKRUPTCY_LIQUIDATION`
- `CORRECTION`

Position quantity is the sum of immutable quantity deltas.

A position projection caches the current result for speed.

---

## 10. Cost Basis Subledger

Stockpile uses weighted-average cost basis.

The projection tracks for each player/scope/security:

- total quantity
- total remaining base-currency cost basis
- weighted average cost
- realized gain/loss to date

### 10.1 Buy

For a buy:

```text
new_total_cost = old_total_cost + executed_base_currency_cost
new_quantity = old_quantity + acquired_quantity
average_cost = new_total_cost / new_quantity
```

### 10.2 Sell

For a sell:

```text
cost_removed = average_cost_before_sale × quantity_sold
realized_gain_loss = net_sale_proceeds - cost_removed
remaining_cost = old_total_cost - cost_removed
```

Cost-basis allocations round to the ledger money scale using decimal round-half-to-even. A sale of the entire remaining quantity removes the entire remaining cost basis exactly so rounding dust cannot strand value. The rounding policy is versioned with the economy ruleset.

### 10.3 Split

A pure split changes quantity but not aggregate remaining cost basis.

### 10.4 Corporate Reorganization

Merger/spin-off basis allocation follows the Market Data Specification and records explicit basis-transfer events.

---

## 11. Market Value Is Not Journaled Profit

Ordinary price movement does not create journal entries.

If NVDA rises 10%:

- security quantity is unchanged
- cash is unchanged
- cost basis is unchanged
- no realized gain is posted
- current marked portfolio value increases as a derived valuation

Unrealized gains/losses are computed from market prices and snapshots.

This prevents Stockpile from generating millions of accounting entries merely because prices tick.

---

## 12. Reservations

Some actions reserve resources before settlement.

Reserved resources are unavailable for a competing action.

Examples:

- pending buy-order cash
- pending sell-order shares
- player-loan offer principal
- wager stake

### 12.1 Cash Reservation

Reservation moves value from available cash to reserved cash through a balanced event.

When the action settles:

- reserved cash is consumed/released

When cancelled/expires:

- reserved cash returns to available cash

### 12.2 Share Reservation

Share reservation may be represented by a reservation table/subprojection tied to immutable order events rather than moving legal ownership to another security account.

The invariant is:

```text
available_quantity = owned_quantity - reserved_quantity
```

Available quantity may never be negative.

---

## 13. Idempotency

Every externally triggered or scheduled financial mutation requires an idempotency key.

Examples:

```text
trade:{order_id}:{execution_reference}
dividend:{provider}:{corporate_action_id}:{player_id}
loan-payment:{loan_id}:{scheduled_payment_number}
weekly-interest:{loan_id}:{period_end}
league-rollover:{environment_id}:{year-month}
bankruptcy:{case_id}:{stage}
```

The database enforces uniqueness within the appropriate environment/scope.

Reprocessing the same command/job returns or references the original result rather than posting a duplicate event.

---

## 14. Atomicity

A financial mutation is committed atomically.

For a trade, for example, the following must either all commit or none commit:

- order execution record
- cash journal
- security quantity entry
- cost-basis update/projection
- FX evidence where applicable
- realized gain/loss projection
- reservation release

A process crash between those steps must not leave half a trade.

---

## 15. Concurrency Control

Player financial operations must be serialized where they compete for the same assets.

Implementation should use database transactions with row-level locks and/or optimistic version checks.

Examples requiring protection:

- two simultaneous buys using the same cash
- gift + buy at the same time
- sell + margin liquidation on the same shares
- loan offer accepted while lender spends reserved cash
- two clicks on Confirm

The authoritative transaction re-checks balances/reservations inside the database transaction.

UI state is never trusted.

---

## 16. Account Opening Example

New Career Account:

```text
Event: ACCOUNT_OPENING_GRANT
Debit:  Player Cash                  100,000 CAD
Credit: System Equity                100,000 CAD
```

Credit score/status initialization is domain state linked to the event but does not require monetary journal lines beyond the grant.

---

## 17. Domestic Stock Buy Example

Player buys 100 CAD-denominated units for total 5,000 CAD.

```text
Event: SECURITY_BUY
Debit:  Market Securities Clearing    5,000 CAD
Credit: Player Cash                    5,000 CAD
```

Security subledger:

```text
+100 units SECURITY_X
+5,000 CAD aggregate cost basis
```

The clearing account represents the fictional external market counterparty.

No other player's money is involved.

---

## 18. Domestic Stock Sell Example

Player sells shares for 6,200 CAD with removed cost basis 5,000 CAD.

Monetary journal:

```text
Debit:  Player Cash                    6,200 CAD
Credit: Market Securities Clearing     6,200 CAD
```

Security subledger:

```text
-quantity sold
```

Cost basis projection records:

```text
cost removed: 5,000
realized gain: 1,200
```

Realized gain is a reporting calculation tied to the event; Stockpile does not need to create a second cash journal entry for profit because the sale proceeds already contain it.

---

## 19. Cross-Currency Buy Example

Player base currency is CAD and buys a USD security.

Execution evidence stores:

- USD execution price
- USD notional
- USD/CAD FX rate
- configured FX spread
- final CAD cost

Player journal posts only the final CAD economic effect plus explicit spread if modeled separately.

Example:

```text
Converted market cost: 6,800 CAD
FX spread:               13.60 CAD
Total player cost:     6,813.60 CAD

Debit:  Market Securities Clearing   6,800.00 CAD
Debit:  System FX Spread Income          13.60 CAD
Credit: Player Cash                   6,813.60 CAD
```

Security basis includes the total acquisition cost defined by the Economy Spec.

---

## 20. Dividend Example

Player receives 120 CAD-equivalent dividend.

```text
Debit:  Corporate Action Clearing       120 CAD
Credit: Player Cash                      120 CAD
```

Reporting metadata classifies it as dividend income.

Entitlement and per-share details reference the corporate-action event.

---

## 21. System Loan Disbursement

A 10,000 CAD system loan:

```text
Debit:  Player Cash                    10,000 CAD
Credit: Player System Loan Payable     10,000 CAD
```

The system-side balancing chart may use mirrored internal bank accounts depending on implementation, but the event must balance globally.

Loan contract records principal, APR, dates, and schedule.

---

## 22. System Loan Interest

Accrued interest of 50 CAD:

```text
Debit:  Player Interest Expense / Payable    50 CAD
Credit: System Interest Income                50 CAD
```

If the chosen chart avoids expense accounts on player subledgers, equivalent payable/income accounts may be used. The important invariant is explicit accrual plus deterministic settlement.

Payment of principal + interest reduces the corresponding payable and player cash in one atomic event.

---

## 23. Player-to-Player Loan Example

Scott lends Mark 20,000 CAD.

```text
Debit:  Scott Loan Receivable          20,000 CAD
Credit: Scott Cash                     20,000 CAD

Debit:  Mark Cash                      20,000 CAD
Credit: Mark P2P Loan Payable          20,000 CAD
```

This can be represented in one balanced multi-party event.

The contract links Scott's receivable and Mark's payable.

### 23.1 Repayment

Mark repays 20,000 principal + 1,000 interest.

```text
Debit:  Mark P2P Loan Payable          20,000 CAD
Debit:  Mark Interest Payable           1,000 CAD
Credit: Mark Cash                      21,000 CAD

Debit:  Scott Cash                     21,000 CAD
Credit: Scott Loan Receivable          20,000 CAD
Credit: Scott Interest Receivable       1,000 CAD
```

Accrual and payment structure may vary, but lender/borrower balances must reconcile exactly.

---

## 24. Gift Example

Scott gives Mark 5,000 CAD.

```text
Debit:  Mark Cash                        5,000 CAD
Credit: Scott Cash                       5,000 CAD
```

No loan asset/liability is created.

Transfer metadata records giver, recipient, note, and external-cash-flow classification for performance reporting.

---

## 25. Wager Escrow Example

Scott and Mark each stake 1,000 CAD.

Escrow:

```text
Debit:  Scott Wager Escrow               1,000 CAD
Credit: Scott Cash                        1,000 CAD

Debit:  Mark Wager Escrow                1,000 CAD
Credit: Mark Cash                         1,000 CAD
```

If Scott wins:

```text
Debit:  Scott Cash                        2,000 CAD
Credit: Scott Wager Escrow                1,000 CAD
Credit: Mark Wager Escrow                 1,000 CAD
```

The exact account-normal-balance orientation will be fixed in schema design; the essential result is balanced, zero-sum escrow.

---

## 26. Prestige Purchase Example

Player pays 100,000 CAD for a prestige asset whose voluntary resale value is 75,000.

Cash transaction:

```text
Debit:  Prestige Asset Cost             100,000 CAD
Credit: Player Cash                      100,000 CAD
```

The owned asset record stores:

- purchase price 100,000
- recognized current liquidation value 75,000

The immediate 25,000 reduction in reported net worth comes from valuation policy, not a fabricated cash expense beyond the purchase itself.

---

## 27. Margin Borrowing

Margin debt is created only as part of a margin-supported purchase or explicit financing event.

The monetary journal clearly separates:

- player cash contribution
- margin principal
- security acquisition cost

Margin interest accrues as explicit events.

Forced liquidation uses ordinary security-sale events plus margin-paydown journal entries.

---

## 28. Corporate Actions

Every corporate action has a stable event key from normalized market data.

Examples:

```text
split:{security_id}:{effective_date}:{ratio}:{provider_event_id}
dividend:{security_id}:{ex_date}:{amount}:{provider_event_id}
merger:{security_id}:{effective_date}:{provider_event_id}
```

Corporate-action processing must be idempotent across all players.

### 28.1 Split

A split produces security quantity/cost-basis transformation events but no cash movement unless an explicit cash component exists.

### 28.2 Cash Acquisition

Cash acquisition removes security quantity, realizes basis, and credits player cash through corporate-action clearing.

### 28.3 Stock Merger/Spin-Off

Security quantities and basis are transferred according to structured action terms.

The basis-allocation method is recorded in event metadata.

---

## 29. Bankruptcy Accounting

Bankruptcy is a sequence of linked financial events under one `bankruptcy_case_id`.

Suggested stages:

1. `BANKRUPTCY_OPENED`
2. `ORDERS_CANCELLED`
3. `SECURITY_LIQUIDATION`
4. `PRESTIGE_LIQUIDATION`
5. `ESTATE_CASH_FINALIZED`
6. `CREDITOR_DISTRIBUTION`
7. `DEBT_DISCHARGE`
8. `RECOVERY_GRANT`
9. `BANKRUPTCY_CLOSED`

Each stage has its own idempotency key.

### 29.1 Creditor Distribution

The distribution algorithm creates explicit payment events by creditor priority.

Player lenders receive actual cash recoveries, not a synthetic receivable valuation adjustment.

### 29.2 Debt Discharge

Residual discharged debt is removed through explicit write-off/discharge journal events.

The original loan and missed-payment history remains immutable.

### 29.3 Recovery Grant

Example 10,000 CAD grant:

```text
Debit:  Player Cash                      10,000 CAD
Credit: System Recovery Grant Equity     10,000 CAD
```

The event references the bankruptcy case and repeat-bankruptcy grant tier.

---

## 30. Credit and Status Events

Credit-score and financial-status changes are not monetary journal entries, but they must still be immutable domain events.

Record:

- previous value
- new value
- triggering event
- ruleset version
- explanation code
- effective time

Examples:

- `CREDIT_SCORE_CHANGED`
- `CREDIT_RATING_CHANGED`
- `FINANCIAL_STATUS_CHANGED`
- `MARGIN_STATE_CHANGED`

This enables the UI to answer exactly why a rating/status changed.

---

## 31. Net-Worth Snapshots

Net-worth snapshots are derived records, not the ledger source of truth.

A snapshot stores:

- timestamp/effective market close
- cash
- security market value
- prestige liquidation value
- collectible loan receivables
- system debt
- player debt
- margin debt
- accrued interest
- total net worth
- market/FX data references
- valuation ruleset version

Snapshots can be recomputed when source data permits, but previously published reports should retain their original snapshot/version and receive explicit corrections rather than silent history changes.

---

## 32. Daily Reconciliation

At least once per trading day, Stockpile runs reconciliation.

Checks include:

- all posted monetary events balance
- no account has impossible available cash
- position projection equals quantity subledger sum
- reserved shares <= owned shares
- reserved cash <= relevant total cash state
- loan receivable matches borrower payable where applicable
- loan payment schedule totals reconcile to contract
- margin payable matches margin transactions
- wager escrow matches unresolved wagers
- prestige inventory matches asset ledger
- league accounts contain no Career-only transaction types
- idempotency keys are unique

Failures create operational alerts.

No automatic repair should hide an invariant violation.

---

## 33. Projection Rebuild

Derived financial projections must be rebuildable from authoritative events.

Required rebuild targets:

- cash balances
- reservations
- security positions
- cost basis
- realized gains
- debt balances
- loan receivables
- accrued interest
- prestige ownership/value
- wager escrow

A rebuild can run into shadow tables/views and compare against live projections before replacement.

This becomes a critical recovery/admin tool.

---

## 34. Corrections and Reversals

Posted events are never edited/deleted for ordinary correction.

### 34.1 Full Reversal

A reversal posts exact opposite journal/quantity effects and links to the original event.

### 34.2 Compensating Adjustment

If only part of an event is wrong, create a new explicit correction event for the difference.

### 34.3 Reason Codes

Administrator corrections require:

- authorized actor
- reason code
- human-readable reason
- reference to affected event(s)
- timestamp

Example reasons:

- `PROVIDER_CORRECTION`
- `CORPORATE_ACTION_REPAIR`
- `SOFTWARE_DEFECT`
- `DATA_MIGRATION_REPAIR`

Direct SQL balance editing is not an acceptable normal recovery mechanism.

---

## 35. Admin Visibility

Admins require read-only tools to inspect:

- event timeline
- journal lines
- security quantity events
- reservations
- loan contract state
- idempotency keys
- source market-data references
- projection-vs-ledger reconciliation

Any write/correction action must create audited financial events.

---

## 36. Scheduled Job Ledger Rules

Scheduled jobs must generate deterministic idempotency keys before mutation.

Examples:

- dividend processing
- interest accrual
- payment attempt
- monthly league opening/closing
- weekly snapshot
- bankruptcy stage

A job may be retried indefinitely without duplicating economic effects.

The scheduler records operational execution separately from the financial event journal so a job failure can be retried without pretending a financial event occurred.

---

## 37. Discord Interaction Ledger Rules

Each financial Discord interaction generates a unique action request ID.

The confirmation button submits that request ID to the authoritative transaction service.

If Discord retries an interaction or the player clicks twice:

- same request ID returns the existing result
- no second financial event is created

A confirmation UI should display the final immutable transaction/event ID in Details for audit/support use.

---

## 38. Audit Retention

Permanent career financial events should be retained for the life of the environment unless legal/provider requirements require otherwise.

Raw market-provider payload retention may be limited by license, but Stockpile must retain the normalized evidence permitted by the provider and required for transaction reconstruction.

Audit history includes:

- ruleset version
- provider identity/reference
- actor/source
- effective/posted timestamps
- event links
- correction/reversal links

---

## 39. Privacy

The ledger contains private financial-game information.

Players may inspect their own detailed ledger.

Public game surfaces receive only sanitized projections defined in the Discord UX spec.

One player cannot query another player's:

- detailed cash journal
- exact loans
- transaction history
- pending orders

unless a specific game rule exposes the information.

Admins may inspect it for operational recovery.

---

## 40. Database Constraints

The database should enforce as many financial invariants as practical.

Examples:

- immutable posted event rows through application permissions/policies
- unique idempotency key scoped appropriately
- non-null currency/amount
- amount > 0 for normal journal lines
- valid debit/credit enum
- event cannot transition from POSTED back to PENDING
- security quantity precision constraints
- unique corporate-action settlement key per player/event
- unique scheduled loan-payment settlement key

Application code is not the only defense against duplication.

---

## 41. Ruleset Versioning

Each policy-dependent event records:

- economy ruleset version
- ledger schema/semantic version where necessary

Historical events continue to be explainable after rules change.

A rule change does not retroactively rewrite old transactions unless an explicit migration/correction process says so.

---

## 42. Reporting Semantics

Reports should distinguish:

### Cash Flow

Actual money movement.

### Realized Investment Result

Result created by sales/cash corporate actions.

### Unrealized Investment Result

Derived change in current market value versus remaining cost basis.

### External Transfers

Gifts received/sent.

### Financing

Loan principal borrowed/repaid.

### Financing Cost/Income

Interest paid/received.

### Prestige Spending

Cash converted into collectible/status assets with lower recognized liquidation value.

This keeps reports from calling borrowed or gifted money "profit."

---

## 43. Career Versus League Ledger Rules

League transactions use the same reliable ledger machinery but separate accounts/scope.

League must reject Career-only event types including:

- gift
- player loan
- system loan
- margin debt
- prestige purchase
- cash wager
- bankruptcy

League closing does not delete transactions. It marks the league period closed and freezes its financial history.

A fresh league period receives new league accounts and an opening grant event.

---

## 44. Performance Requirements

The authoritative ledger favors correctness over microsecond latency, but ordinary Discord actions should still complete quickly.

Recommended patterns:

- append events in one database transaction
- update hot projections in same transaction where possible
- generate charts/reports asynchronously from projections, never by blocking financial posting
- batch reconciliation separately

No cache may authorize a transaction without authoritative database validation.

---

## 45. Disaster Recovery

Backups must preserve both journal history and immutable identity/reference data needed to interpret it.

A restore test is successful only if Stockpile can:

1. restore database backup
2. rebuild projections
3. reconcile balances
4. reproduce selected player reports
5. verify idempotency history
6. continue posting new events without collisions

This requirement belongs in Release Criteria as well.

---

## 46. Ledger Invariants — Release Gate

The following must have automated tests before private launch:

1. Every posted monetary event balances by currency.
2. A posted event is immutable.
3. A reversal never deletes the original.
4. No idempotency key posts twice.
5. Player available cash cannot be double-spent.
6. Player available shares cannot be double-sold.
7. Position quantity equals quantity-subledger sum.
8. Weighted cost basis remains correct after partial buys/sells.
9. A split preserves aggregate cost basis and economic equivalence.
10. Gifts change wealth but not investment return.
11. Loan principal is financing, not profit.
12. P2P lender receivable reconciles with borrower payable.
13. Wager escrow is zero-sum.
14. League and Career accounts are isolated.
15. Bankruptcy creditor distributions never exceed estate cash.
16. Discharged debt remains historically auditable.
17. Recovery grants post exactly once.
18. Rebuilding projections produces the same authoritative balances.
19. Scheduled-job retries do not duplicate financial effects.
20. Discord retry/double-click does not duplicate financial effects.

---

## 47. Decisions Frozen by This Draft

Unless deliberately reopened during Phase 0:

1. Stockpile uses an append-only event journal.
2. Monetary value movements use balanced double-entry journal lines.
3. Security quantity changes use an immutable quantity subledger.
4. Market-value movement is derived, not posted as ordinary ledger profit.
5. Current balances/positions are projections that can be rebuilt.
6. Decimal arithmetic is mandatory; floating point is forbidden for authoritative finance.
7. Financial events have effective time and posting time.
8. Every scheduled/external mutation has an idempotency key.
9. Reservations prevent double spending before settlement.
10. Posted events are corrected only through reversals/compensating entries.
11. Career and League use separate ledger accounts/scopes.
12. Credit/status changes are immutable domain events linked to financial causes.
13. Daily reconciliation is mandatory.
14. Projection rebuild is a first-class admin/recovery capability.
15. Every row/event is environment-scoped from day one, even for a one-server launch.

---

## 48. Ledger North Star

A player should be able to ask:

> Why did my net worth fall by 18,423.71 this week?

and Stockpile should be able to break the answer into:

- 12,900.44 market-value loss
- 3,500.00 realized trading loss
- 640.27 interest paid
- 1,500.00 prestige purchase valuation loss
- 117.00 dividends received

with every actual cash/debt/position movement linked to immutable events.

If a bug appears six months later, we should be able to repair the projection without inventing what happened.

That is the purpose of the Stockpile ledger.
