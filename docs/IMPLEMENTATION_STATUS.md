# Stockpile — Implementation Status

**As of:** 2026-09-12
**Active phase:** Phase 1 — Financial Engine
**Market mode:** Deterministic synthetic data only

**Deployment:** Intentionally paused on 2026-09-12. The persistent bot service is disabled and the Discord guild installation was removed; source code and database state remain preserved.

**Delivery target:** playable private-guild Discord stock-bot MVP first; advanced loans, margin, bankruptcy, leagues, NPC, prestige, and elaborate reporting are deferred for play-feedback-driven development.

This is the implementation checkpoint for agents and maintainers. Product behavior remains authoritative in the domain specifications.

## Completed

- npm workspaces with strict TypeScript project references
- exact-decimal Money, Price, Quantity, QuantityDelta, and Rate value objects
- normalized market-data contract and deterministic synthetic provider
- immutable financial-event and journal-entry domain models
- per-currency double-entry validation
- environment and Career/League scope validation
- idempotent in-memory ledger posting
- rebuildable monetary balance and security-quantity projections
- weighted-average cost basis with versioned round-half-to-even allocation
- exact residual-cost removal on final sale
- initial PostgreSQL schema for environments, ledger accounts, financial events, journal entries, and security quantity entries
- PostgreSQL uniqueness and foreign-key constraints for idempotency and scope isolation
- deferred database balance guard and append-only history triggers
- transactional PostgreSQL ledger repository and account catalogue
- advisory-lock migration runner with transactional application and checksum verification
- atomic Career-account opening with idempotent 100,000 CAD grant posting
- deterministic market/limit order acceptance states and expiration inputs
- exact cash and share availability/reservation policies
- transactional PostgreSQL order acceptance with row locking and idempotency race handling
- persistent cash/share reservations and immutable order transition events
- anti-stale execution-observation eligibility policy
- atomic domestic synthetic trade settlement across journal, quantity subledger, cost basis, execution evidence, reservation, and order state
- gap-up fractional-quantity reduction constrained by reserved cash
- transactional cancellation and expiration with reservation release under the settlement order lock
- deterministic cancellation-versus-execution race outcomes
- exact USD/CAD conversion and configurable buy/sell spread calculation
- cross-currency affordability reduction and complete persisted FX execution evidence
- durable PostgreSQL jobs with scheduled runs, leases, skip-locked claims, retries, dead-letter handling, and immutable run history
- deterministic capped-exponential worker retries with injected time
- transactional outbox with destination-scoped idempotency, leasing, retry, delivery, and dead-letter states
- atomic `TradeExecuted` outbox publication alongside financial settlement
- automated synthetic order verification with FX retrieval, expiration, settlement, and durable limit-order rescheduling
- trading reconciliation with persisted run history and deduplicated operational alerts
- environment-scoped player identity and Career portfolio query services
- synthetic Career dashboard valuation with explicit stale/unavailable states
- lease-aware transport-neutral outbox delivery worker with deterministic retries and dead-lettering
- interaction-safe trade submission that re-resolves authorization, price, FX, and market-session state
- atomic order acceptance, reservation, audit event, and durable verification-job scheduling
- normalized synthetic dividend/split event contract and split-safe weighted-average cost-basis transformation
- transactional split application with open-order cancellation, immutable quantity history, and durable notification
- ex-date dividend entitlement rebuilt from quantity history with balanced domestic/FX settlement and durable notification
- immutable official net-worth snapshots with per-position market/FX evidence and incomplete-valuation rejection
- normalized security directory with immutable listing identity, ticker aliases, provider mappings, lifecycle state, and explicit trading eligibility
- durable corporate-action orchestration with stable ordering, calendar-derived dividend entitlement, and FX trust checks
- deterministic cost-basis projection audit/rebuild from immutable buy, sell, and split history
- explicit synthetic exchange calendars covering holidays, early closes, DST-aware UTC sessions, and fail-closed missing-calendar behavior
- normalized merger, spin-off, symbol-change, and delisting contracts
- atomic symbol-change/delisting/manual-review lifecycle handling with order cancellation, immutable status history, alerts, and outbox delivery
- exact stock-reorganization basis transfer and versioned spin-off basis allocation primitives
- explicit mixed-merger basis allocation contract; missing allocation fails into corporate-action review
- transactional pure-cash, stock-for-stock, and explicitly allocated mixed-merger settlement
- transactional spin-off settlement with exact fractional child quantity and immutable basis-transfer evidence
- private-guild Discord runtime with `/stockpile`, automatic Career onboarding, and button-driven Home/Portfolio/Trade/History navigation
- license-safe three-security synthetic sandbox feed with deterministic minute prices and explicit synthetic labelling
- durable trade-preview ownership/expiry state, market/limit confirmation, idempotent submission, automatic verification/settlement, and Discord fill delivery
- repeatable PostgreSQL-backed MVP smoke flow covering onboarding, order acceptance, worker settlement, dashboard holdings, and transaction history

## Verification

- strict TypeScript check: passing
- production build: passing
- automated tests: 98 passing across 37 files
- production dependency audit: zero known vulnerabilities at last check
- whitespace/error check: passing

All 13 PostgreSQL migrations and the complete MVP financial loop passed against a fresh temporary PostgreSQL 18.6 cluster in this environment. Discord command registration and interaction delivery still require the private guild credentials and therefore remain the final external smoke test.

## Active Increment

1. run the playable Discord MVP against a real PostgreSQL service and private test guild
2. corporate-action correction/compensation workflow
3. PostgreSQL integration-test harness when a server becomes available
4. close Phase 1 verification gaps, then begin Phase 2 Financial Life

## Production Data Gate

No real market endpoint or data is permitted yet. A free endpoint is not automatically acceptable: Issue #2 still requires display, derivation, timestamp, and retention rights suitable for the private Discord game.
