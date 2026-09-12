# Stockpile — Current Status

**As of:** 2026-09-12  
**Phase:** Phase 1 — Financial Engine (synthetic-market development)
**Implementation state:** Playable synthetic Discord MVP implemented; private-guild smoke test and real-market integration remain externally gated.

**Deployment state:** Paused by owner on 2026-09-12. The `stockpile.service` system service is disabled and the bot has been removed from the Discord guild. Code and PostgreSQL data are preserved for a future restart.

**Current delivery target:** a small playable private-guild Discord MVP using deterministic synthetic data. Advanced financial-life and game systems remain specified but are deferred until play feedback after the MVP is introduced to the channel.

Detailed code progress and verification evidence are maintained in `docs/IMPLEMENTATION_STATUS.md`.

This file is the authoritative short-form project status for handoff. It exists so an agent can understand where Stockpile stands without access to the originating ChatGPT conversation.

---

## 1. Executive Status

Stockpile's product/game design and implementation specifications are substantially complete.

Completed specification documents:

- `PRODUCT_GAME_PLAN.md`
- `ECONOMY_SPEC.md`
- `DISCORD_UX.md`
- `MARKET_DATA_SPEC.md`
- `FINANCIAL_LEDGER.md`
- `EDGE_CASES.md`
- `ARCHITECTURE.md`
- `RELEASE_CRITERIA.md`

The specification freeze is closed for implementation using synthetic market data. A production provider/license must still be selected before any real-market integration or launch.

Tracking issues:

- **#1** Phase 0: Complete specification freeze before implementation
- **#2** Phase 0 blocker: select licensed market-data provider

Issue #2 must be resolved before production feature implementation begins.

---

## 2. Product Definition

Stockpile is a persistent multiplayer financial-life simulator running in Discord.

Core premise:

> **Real markets underneath. Game systems on top.**

Players use fictional money to buy and sell real US and Canadian stocks and ETFs. Real market behavior powers a persistent social game involving portfolios, competition, loans, credit, leverage, financial distress, bankruptcy, recovery, prestige, achievements, reports, and long-term career history.

It is designed first for one private Discord server containing approximately 2–5 friends.

The initial game includes one clearly labelled fictional NPC participant so a group of 1–3 humans still has an active rival. The NPC makes deterministic, explainable fictional predictions and trades through the same financial rules and ledger as humans; it is never presented as a real Discord member.

The project is intentionally not a real brokerage, financial-advice product, tax simulator, or exact legal/financial simulation.

---

## 3. Non-Negotiable Product Principles

1. **Zero-touch operation.** Normal gameplay should not require ongoing developer/admin content work.
2. **Real market data; fictional economy.** No real money or cash-out mechanism.
3. **Persistent career.** Player history and career economy survive indefinitely.
4. **Fair competition.** Monthly League Accounts are isolated from Career wealth.
5. **One-command UX.** `/stockpile` launches the interactive application surface.
6. **Visual quality is first-class.** Stockpile should feel like a polished application, not a pile of slash-command responses.
7. **Deterministic finance.** AI never decides prices, settlements, credit, bankruptcy, rankings, or financial outcomes.
8. **Everything financial is auditable.** No unexplained money mutations.
9. **Do not guess market prices.** Missing/stale/unlicensed data pauses affected behavior safely.
10. **Failure must be recoverable.** Bankruptcy is gameplay, not permanent player lockout.

Zero-touch test:

> **Could this still operate correctly two years from now if nobody touched the code?**

---

## 4. Locked Initial Scope

### Markets and instruments

- US stocks and ETFs
- Canadian stocks and ETFs
- NYSE / NASDAQ
- TSX
- TSXV only if reliable/licensed coverage is justified later
- No options, futures, crypto, bonds, or general forex trading at launch

### Currency

- Environment-configurable base currency
- Initial private environment defaults to **CAD**
- No separate persistent USD/CAD cash wallets at launch
- Foreign holdings/trades use authoritative FX conversion
- Default game FX spread: **0.20% each way**

### Career account

Initial state:

- cash: **100,000 base-currency units**
- holdings: none
- debt: none
- credit: **40/100 (C)**
- status: **New Investor**

### League account

- separate from Career Account
- monthly period
- **100,000 league cash** at each reset
- holdings reset each league
- no gifts/player loans/prestige assets inside league
- career cash cannot enter or leave league
- performance judged primarily by return, not existing career wealth

### Trading

- common stocks and ETFs
- fractional shares
- weighted-average cost basis
- market orders
- limit orders
- no stock/ETF commission by default
- minimum default trade notional: 10 base-currency units
- closed-market market orders queue for next executable observation
- stale/untrustworthy prices never execute

---

## 5. Financial-Life Systems Locked in the Specs

Stockpile includes deterministic rules for:

- cash and holdings
- dividends/distributions
- FX conversion
- net-worth snapshots
- investment-performance measurement separated from transfers/financing
- financial status progression
- credit score and D/C/B/A/AA/AAA ratings
- system-bank borrowing
- player-to-player loans
- gifts/transfers
- friendly wagers/challenges
- leverage and margin
- margin warnings/calls
- forced liquidation
- delinquency/default
- insolvency
- bankruptcy
- post-bankruptcy recovery
- prestige assets
- achievements and career records
- monthly fair leagues
- weekly awards and social reporting

The economy spec, ledger spec, and edge-case catalogue—not the early product-plan examples—are authoritative for implementation details.

---

## 6. Discord UX Direction

A normal player should need to remember only:

`/stockpile`

That opens a private/personal Stockpile workspace. From there, interactive Discord components provide access to:

- Home
- Portfolio
- Trade
- Markets
- Bank
- League
- Reports
- Profile
- secondary/detail flows

The server also has a public game/social surface for appropriate shared events such as:

- Monday market/opening context
- Friday Weekly Wrap
- league standings/results
- meaningful achievements/milestones
- selected financial events according to privacy rules

The UI specification defines:

- onboarding
- navigation patterns
- Discord Components usage
- trade confirmation
- loan flows
- privacy boundaries
- notification severity
- visual hierarchy
- weekly report structure
- deterministic award selection

---

## 7. Weekly / Monthly / Long-Term Rhythm

### Monday

Compact Opening Bell context, limited to information relevant to players and their holdings/competition.

### During the week

Mostly quiet. Surface meaningful events, not routine market noise.

### Friday

Automated **Weekly Wrap** is a primary social loop.

It selects relevant awards/statistics such as:

- Trader of the Week
- best/worst trade
- Diamond Hands / Paper Hands
- YOLO Award
- Cash Goblin
- Comeback Kid
- Market Beater
- Contrarian
- dividend leader
- debt/lending awards
- relevant embarrassing records

Approximately 5–8 meaningful categories are selected dynamically rather than posting every possible statistic.

### Monthly

- League settlement/reset
- personal monthly financial statement
- longer-period performance and career reporting

### Long term

- persistent wealth
- credit history
- prestige
- assets
- records
- bankruptcies/comebacks
- championships
- net-worth timeline

---

## 8. Architecture Decision

**Launch deployment:** one private Discord guild.

**Data model:** multi-server-safe/environment-scoped from the beginning.

This avoids premature SaaS complexity while preventing an irreversible single-guild schema.

Architecture principles:

- strongly typed backend
- PostgreSQL is authoritative
- financial/game domain separate from Discord transport
- append-only event/journal model for financial mutations
- security quantity subledger
- atomic settlement
- durable scheduled jobs
- durable outbox for Discord publication
- market-data provider abstraction
- deterministic visual/report renderer
- no Redis/Kubernetes/LLM dependency required for initial deployment
- structured logs, health checks, backups, and reconciliation

Application scaffolding and financial-engine work may now proceed against the normalized synthetic provider.

---

## 9. Ledger Invariants

The financial ledger specification requires, among other things:

- append-only financial events
- balanced monetary journal entries
- immutable security-quantity history
- deterministic decimal arithmetic
- explicit reservations for cash/shares
- atomic order settlement
- idempotency for Discord retries and scheduled jobs
- projection/rebuild capability from authoritative records
- compensating transactions instead of destructive history edits
- full administrative audit trail

An implementation must never treat a mutable `balance` column as the sole source of financial truth.

---

## 10. Failure/Edge-Case Coverage

`EDGE_CASES.md` contains the defined behavior catalogue for normal and abnormal scenarios, including:

- stale/delayed/missing quotes
- delayed-feed execution exploits
- exchange closures/halts
- gaps at market open
- splits/reverse splits
- dividends
- mergers/acquisitions/spin-offs
- ticker changes
- delistings
- rounding/dust
- FX failures
- concurrent orders
- Discord duplicate/replayed interactions
- scheduler retries
- loan/default races
- margin crashes
- insolvency/bankruptcy
- player inactivity
- report corrections
- data-provider outages
- manual-review cases where safe deterministic handling is impossible

Do not invent new behavior during implementation if an existing case is defined.

---

## 11. Release Philosophy

"Trading works" is not the release bar.

`RELEASE_CRITERIA.md` requires a broad validation matrix including:

- unit/domain testing
- accounting/ledger invariant testing
- provider-adapter contract tests
- corporate-action testing
- job idempotency
- Discord interaction testing
- backup/restore testing
- reconciliation
- outage/restart recovery
- long-running economic simulation
- multi-year simulation without economic corruption

Private launch happens only after those gates are satisfied.

---

## 12. The Remaining Blocker — Market Data

The technical behavior is specified. Provider/licensing selection is not.

The selected plan must explicitly permit the intended use:

- private Discord bot
- roughly 3 initial human users
- non-commercial fictional-money game
- display of real US/Canadian stock and ETF data
- derived charts/portfolio/game statistics
- US and Canadian intraday data adequate for deterministic execution
- USD/CAD FX
- historical data needed for settlement/reporting
- dividends/splits and security metadata
- sufficient retention rights for normalized execution evidence and permanent audit history

Current provider shortlist is tracked in Issue #2.

Important finding: cheap "personal" API plans frequently prohibit redisplay/redistribution to other users. Do not assume that because an API key works technically its license is acceptable.

A licensed delayed Canadian feed can be supported using the deferred verified-price execution model defined in `MARKET_DATA_SPEC.md`, provided it is intraday. End-of-day-only Canadian data is not acceptable for normal Stockpile trading.

---

## 13. Handoff Read Order

An incoming agent should read in this order:

1. `README.md`
2. `AGENTS.md`
3. `docs/CURRENT_STATUS.md`
4. GitHub Issue #1
5. GitHub Issue #2
6. `docs/PRODUCT_GAME_PLAN.md` for original vision
7. `docs/ECONOMY_SPEC.md`
8. `docs/DISCORD_UX.md`
9. `docs/MARKET_DATA_SPEC.md`
10. `docs/FINANCIAL_LEDGER.md`
11. `docs/EDGE_CASES.md`
12. `docs/ARCHITECTURE.md`
13. `docs/RELEASE_CRITERIA.md`

If documents conflict, prefer the more-specific specification over the older general product plan. Prefer the latest explicit GitHub issue/status decision over an obsolete TODO in an earlier document.

---

## 14. Next Action

The immediate implementation task is:

> **Build Phase 1 against deterministic synthetic market data while keeping all real-provider code and data disabled.**

For real-market integration:

1. update `MARKET_DATA_SPEC.md` with the chosen provider/plan assumptions;
2. mark provider selection complete in Issue #1;
3. close Issue #2;
4. enable and certify the provider adapter only after those gates pass.

Issue #1 has been explicitly relaxed by the project owner for synthetic-market implementation. Issue #2 remains a hard gate for real data and launch.

The fictional NPC defaults are approved: one clearly disclosed fictional persona; once-daily decisions; long-only US/Canadian stocks and broad ETFs; a moderate momentum/value-quality policy; 4–8 positions; 25% maximum per position; at least 10% cash; no loans, gifts, margin, or system borrowing initially; no-stake predictions initially; staked challenges deferred; standings include the NPC while human championships/awards are tracked separately; deterministic versioned decisions with stored inputs, reason codes, and seed; administrator pause control; optional post-decision banter only.

---

## 15. Historical Note on PRODUCT_GAME_PLAN.md

`PRODUCT_GAME_PLAN.md` is the original v0.1 design document. Some of its final "Remaining Decisions" language predates the detailed Phase 0 specs.

Those decisions are resolved. Production market-data provider/licensing selection remains open, but no longer blocks synthetic-market implementation.

For current state, use this file plus Issue #1. For implementation behavior, use the domain-specific specs.
