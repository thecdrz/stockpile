# Stockpile Architecture Specification

**Status:** Draft for Phase 0 specification freeze  
**Version:** 0.1  
**Scope:** Runtime topology, tenancy, application boundaries, persistence, jobs, Discord integration, market-data adapters, visual rendering, deployment, configuration, observability, backups, security, and operational recovery.

Stockpile is a small private game with unusually strict financial correctness requirements.

The architecture should therefore optimize for:

1. correctness
2. low operational complexity
3. recoverability
4. testability
5. provider replaceability
6. long unattended operation

It should **not** optimize for hypothetical millions of users.

---

## 1. Architecture Decision

Stockpile launches as:

> **A single private Discord deployment with a multi-server-safe domain model.**

This means:

- only the private server needs to be configured/deployed initially
- no public self-service onboarding or billing system is built
- no SaaS control plane is built
- no cross-guild global economy exists
- every persistent domain record is still scoped to an immutable `environment_id` / Discord guild context

This costs very little architecturally and prevents future schema assumptions that would make a second server unsafe.

### 1.1 Environment

An `environment` represents one independent Stockpile game world.

It owns:

- Discord guild ID
- base currency
- benchmark
- public Stockpile channel
- admins
- economy ruleset/config
- players
- career economy
- leagues
- reports
- scheduler state

A Discord user who exists in two environments has two independent player careers.

---

## 2. Recommended Technology Direction

Recommended implementation language:

**TypeScript on Node.js**

Reasons:

- first-class Discord ecosystem
- strong typing
- excellent HTTP/API ecosystem
- good PostgreSQL libraries
- easy deterministic SVG/image generation
- shared types across bot/domain/jobs
- straightforward container deployment

Recommended primary datastore:

**PostgreSQL**

Reasons:

- ACID transactions
- row locking
- exact numeric/decimal support
- strong constraints
- reliable relational modeling
- advisory locks
- JSONB for non-authoritative metadata
- mature backups/recovery

### 2.1 Redis

Redis is **not required for launch**.

Avoiding it removes an infrastructure dependency.

Use PostgreSQL-backed durable jobs/locks/cache tables where practical.

Redis may be introduced later only if measurement proves it necessary.

### 2.2 ORM / Query Layer

Use a strongly typed SQL/query layer that preserves explicit transaction control and PostgreSQL numeric semantics.

The exact library can be chosen at implementation start, but the financial domain must not be hidden behind abstractions that make:

- row locking
- isolation levels
- constraints
- transactions
- decimal serialization

hard to reason about.

---

## 3. Repository Layout

Target monorepo:

```text
/apps
  /bot                 Discord gateway and interaction delivery
  /worker              Durable jobs / scheduled processing

/packages
  /core                Pure domain logic and policies
  /database            Schema, migrations, repositories, transactions
  /market-data         Provider interface + adapters
  /ledger              Financial event/journal posting + reconciliation
  /visuals             Deterministic visual rendering
  /discord-ui          Component builders / navigation surfaces
  /reports             Weekly/monthly/career report generation
  /config              Versioned environment/economy configuration
  /testing             Simulators, fixtures, fake clocks/providers

/infra                  Container/deployment configuration
/docs                   Product and engineering specifications
```

For the private launch, `/apps/bot` and `/apps/worker` may run in one container/process supervisor if desired, but they remain logically separated.

---

## 4. Layer Boundaries

Stockpile should have explicit boundaries.

### 4.1 Domain Core

`packages/core`

Contains pure business rules such as:

- credit calculations
- status transitions
- loan schedules
- margin thresholds
- bankruptcy policy
- league scoring
- award qualification
- portfolio math
- economy restrictions

Domain code must not depend directly on:

- Discord
- HTTP clients
- provider SDKs
- image rendering

It should be testable with plain input objects and deterministic clocks.

### 4.2 Ledger

`packages/ledger`

Owns:

- financial event posting
- double-entry validation
- quantity subledger
- reservations
- idempotency
- reversals/corrections
- reconciliation
- projection rebuild

No other package may mutate authoritative financial balances directly.

### 4.3 Database

`packages/database`

Owns:

- PostgreSQL schema
- migrations
- transactional repositories
- locking/versioning helpers
- persisted job state

Database package exposes purpose-specific repositories/services rather than arbitrary table mutation throughout the app.

### 4.4 Market Data

`packages/market-data`

Owns normalized provider contracts:

- securities
- quotes
- bars
- FX
- calendars
- corporate actions
- earnings context

Vendor-specific code remains inside adapters.

### 4.5 Discord UI

`packages/discord-ui`

Owns:

- Components V2 builders
- navigation states
- modal definitions
- authorization context
- sanitized public/private presentation

It calls application/domain services but never computes financial truth itself.

### 4.6 Reports

`packages/reports`

Owns deterministic report models:

- Weekly Wrap
- Monday Opening Bell
- monthly statement
- league close
- career report

A report is finalized as structured data before visual/Discord delivery.

### 4.7 Visuals

`packages/visuals`

Transforms finalized report/domain view models into deterministic images.

Visual rendering never decides financial results.

---

## 5. Application Services

Use explicit application services/use cases between Discord and domain code.

Examples:

```text
CreateCareerAccount
SearchSecurities
PreviewTrade
SubmitTrade
CancelOrder
CreateSystemLoan
OfferPlayerLoan
AcceptPlayerLoan
MakeLoanPayment
SendGift
CreateChallenge
EnableMargin
RunMarginEvaluation
OpenBankruptcy
BuyPrestigeAsset
GenerateWeeklyWrap
CloseLeague
```

Each use case owns:

- authorization
- validation
- transaction boundary
- idempotency context
- domain invocation
- ledger posting
- returned result model

Discord handlers should be thin.

---

## 6. Discord Runtime

The bot process maintains the Discord connection and handles:

- `/stockpile`
- component interactions
- modal submissions
- public/private delivery
- permission checks
- public game channel events

### 6.1 No Financial State in Discord Messages

Discord message/custom-component payloads may carry opaque IDs and view versions, but never authoritative balances/prices/permissions.

On every action:

1. authenticate Discord user
2. resolve environment/player
3. load authoritative current state
4. validate interaction target/version
5. execute application service

### 6.2 Interaction Tokens

Component custom IDs should be compact opaque references to stored/encoded interaction context.

Never place private loan terms or mutable financial assumptions directly in a public button custom ID.

### 6.3 Expired Interfaces

Expired ephemeral UI is harmless because `/stockpile` reconstructs current state from the database.

---

## 7. PostgreSQL Data Domains

Conceptual schema groups:

### Identity / Environment

- environments
- environment_settings
- players
- admin_memberships

### Market Reference

- securities
- security_aliases
- provider_security_mappings
- exchange_calendars/cache
- corporate_actions

### Trading

- orders
- executions
- position_projections
- cost_basis_projections
- security_quantity_entries
- reservations

### Ledger

- financial_events
- journal_entries
- ledger_accounts
- idempotency_keys
- reconciliation_runs

### Credit / Debt

- credit_events
- credit_projection
- loans
- loan_schedules
- loan_payments
- margin_accounts/projection

### Game

- prestige_assets_catalog
- player_prestige_assets
- achievements
- player_achievements
- career_records
- challenges
- wagers

### Competition

- leagues
- league_players
- weekly_periods
- weekly_statistics
- weekly_awards

### Reporting

- net_worth_snapshots
- reports
- report_publications
- visual_artifacts

### Operations

- durable_jobs
- job_runs
- provider_health
- operational_alerts
- admin_actions

All player/game tables include `environment_id` directly or inherit it through a parent with enforceable uniqueness constraints.

---

## 8. Tenancy Safety

Even in one private server:

- unique constraints include environment scope where appropriate
- service methods require environment context
- queries never rely on Discord user ID alone
- market reference data may be globally shared only when it contains no player/game state

Example player uniqueness:

```text
UNIQUE(environment_id, discord_user_id)
```

This resolves the Phase 0 single-vs-multi-server decision without adding public-platform complexity.

---

## 9. Transaction Isolation

Financial writes use explicit PostgreSQL transactions.

Recommended default:

- `READ COMMITTED` for ordinary read/report work
- row locks / explicit version checks for mutations
- stronger isolation where a specific invariant benefits from it

Do not globally use SERIALIZABLE without need; retry complexity can be introduced selectively around highly contended financial operations.

For a three-player server, correctness matters more than throughput.

---

## 10. Durable Job System

Stockpile requires durable scheduling but should avoid unnecessary infrastructure.

Recommended model:

**PostgreSQL-backed job queue/scheduler.**

The implementation may use a mature Postgres-backed job library or a small explicit job table/worker abstraction, provided required semantics are testable.

Required job capabilities:

- durable enqueue
- scheduled run time
- retries with backoff
- lease/lock
- unique/idempotency key
- dead-letter/failed state
- job history
- manual retry

### 10.1 Worker Responsibilities

Examples:

- order price verification
- pending market-open orders
- dividends
- corporate actions
- loan payments
- interest accrual
- credit recalculation
- margin evaluation
- bankruptcy stages
- daily snapshots
- Monday Opening Bell
- Weekly Wrap
- month-end statements
- league rollover
- reconciliation
- backups/verification triggers

### 10.2 Financial Idempotency

Job-level deduplication is not enough.

Every financial job also uses ledger idempotency keys so duplicate workers/retries cannot duplicate money.

---

## 11. Time Model

Inject a Clock abstraction into domain/services.

Production clock uses real UTC time.

Tests/simulations use a controllable fake clock.

Store:

- timestamps in UTC
- local exchange timezone/context separately where required

Never write business rules using server-local timezone assumptions.

---

## 12. Market Data Architecture

Application/domain code depends on normalized `MarketDataProvider`, not vendors.

### 12.1 Adapter

Provider adapter:

- authenticates
- performs requests
- rate limits
- retries safe reads
- normalizes symbols/types
- attaches market timestamps/freshness
- exposes capability declarations
- honors provider storage/licensing restrictions

### 12.2 Caching

Cache normalized public market data to reduce API usage.

Cache keys include provider/security/data type/timeframe.

Caching must never extend an observation beyond its executable freshness.

### 12.3 Batch Fetching

Prefer batch quotes where provider/license supports them.

Weekly/report valuations should batch held securities rather than request one per player/position.

### 12.4 Provider Migration

Provider mappings are separate from internal securities.

Replacing provider should require:

- new adapter
- mapping/symbol reconciliation
- capability configuration
- regression tests

not migration of every player holding.

---

## 13. Market Data Licensing Boundary

Provider licensing is operational configuration.

Store provider-specific credentials in secrets, never repository/config tables.

The selected adapter also defines what raw data may be cached/retained.

If provider terms change incompatibly:

- disable unsafe data use
- preserve player financial history
- migrate adapter/provider before reopening affected trading

---

## 14. Trading Pipeline

Conceptual market-buy lifecycle:

```text
Discord Trade Preview
  -> SubmitTrade use case
  -> validate player/account/security/order
  -> reserve cash
  -> create Order
  -> enqueue/attempt execution verification
  -> MarketDataProvider returns eligible observation
  -> database transaction:
       lock order/player assets
       revalidate eligibility/price/FX
       post ledger event
       post security quantity event
       release reservation
       mark execution/order
  -> emit domain/outbox event
  -> Discord result/notification
```

The Discord request does not hold a database transaction open while waiting 15 minutes for a delayed market feed.

---

## 15. Transactional Outbox

Financial state changes often need downstream delivery:

- Discord notification
- report statistic update
- achievement evaluation
- analytics/operational event

Use a transactional **outbox** table.

When a financial transaction commits, associated domain/outbox events commit in the same database transaction.

Worker then processes outbox asynchronously.

This prevents:

> money changed, but the event that should trigger follow-up disappeared because the process crashed.

Outbox consumers are idempotent.

---

## 16. Domain Events

Example domain events:

- `TradeExecuted`
- `DividendCredited`
- `LoanAccepted`
- `LoanPaymentMissed`
- `CreditRatingChanged`
- `MarginStateChanged`
- `BankruptcyOpened`
- `BankruptcyClosed`
- `NetWorthMilestoneReached`
- `LeagueRankChanged`

Domain events carry identifiers/facts, not pre-rendered Discord messages.

Consumers decide presentation/side effects.

---

## 17. Reporting Architecture

Reports are deterministic records.

Example Weekly Wrap pipeline:

1. final market valuations verified
2. weekly statistics calculated
3. award candidates calculated
4. report model finalized and stored
5. visual renderer receives finalized model
6. Discord public publication occurs
7. publication status stored

If rendering/delivery fails, steps 1–4 remain complete and retryable.

Report regeneration from the same finalized model should produce equivalent information.

---

## 18. Visual Rendering Architecture

Recommended approach:

**Programmatic SVG/HTML-like vector composition rendered to PNG/WebP**, using deterministic server-side libraries.

Prefer an SVG-first renderer plus an image encoder (for example a Sharp/libvips-class approach) over browser automation where possible.

Reasons:

- lower memory
- fewer moving parts
- deterministic typography/layout
- fast
- easy snapshots
- no headless-browser runtime dependency

### 18.1 Renderer Inputs

Renderer receives only finalized view models.

Example:

```text
WeeklyWrapViewModel
MonthlyStatementViewModel
NetWorthChartViewModel
AchievementViewModel
```

No database queries inside drawing code.

### 18.2 Accessibility Fallback

Every visual report has a native Discord text/component representation.

If renderer fails, report still posts/opens.

### 18.3 Fonts

Use redistributable fonts packaged/deployed with the application according to their license, or platform-safe supported font resources.

Do not depend on remote runtime font downloads.

---

## 19. Generated Artifact Storage

For a private deployment, generated report images may be:

- rendered on demand and uploaded directly to Discord, or
- cached in object storage/filesystem with metadata

Avoid permanent binary storage unless needed.

The authoritative report is structured database data, not its PNG.

If persistent artifact storage is used, it must not contain secrets/private reports accessible by predictable public URLs.

---

## 20. Configuration System

Configuration categories:

### Deployment Secrets

- Discord token
- market provider credentials
- database credentials
- encryption/signing keys

Stored in deployment secret manager/environment, never committed.

### Environment Configuration

- guild ID
- public channel ID
- base currency
- benchmark
- tone
- admin users/roles
- report enablement

Stored in database/config and editable through authorized setup/admin tooling.

### Economy Ruleset

- starting cash
- status thresholds
- credit bands
- loan rates/limits
- margin thresholds
- bankruptcy grants
- transfer/wager limits

Versioned and immutable once superseded.

---

## 21. Feature Flags

Feature flags may be used for controlled rollout, especially:

- margin
- wagers
- prestige assets
- automated public market alerts

Flags must not create ambiguous ledger semantics.

A feature disabled after existing contracts/positions exist must continue servicing those obligations safely.

---

## 22. Security

### 22.1 Secrets

Never log or store API tokens/Discord bot token in plaintext application tables.

### 22.2 Authorization

Every financial action checks:

- Discord identity
- environment membership
- player ownership
- current permissions/state

### 22.3 Admin

Admin financial corrections require explicit privileged role/user and immutable audit record.

### 22.4 Input Validation

Do not trust:

- ticker strings
- modal numeric strings
- component IDs
- Discord display names
- provider JSON

Validate/normalize at boundaries.

### 22.5 Dependency Security

Use lockfiles, automated dependency scanning, and deliberate version updates.

Avoid runtime downloads of executable code.

---

## 23. Privacy

Stockpile stores Discord user IDs and fictional financial-game records.

Do not collect unnecessary personal information.

No real brokerage credentials, payment data, real bank information, or real financial accounts are ever required.

Logs should use internal IDs and avoid dumping private account payloads.

---

## 24. Observability

Structured logging is mandatory.

Important log dimensions:

- environment_id
- player_id when appropriate
- request/action ID
- job ID
- financial event ID
- provider
- security ID
- correlation ID

### 24.1 Metrics

Minimum operational metrics:

- Discord interaction failures
- command latency
- DB connection/transaction failures
- queued/failed jobs
- oldest pending job
- financial reconciliation failures
- provider success/latency/rate-limit
- stale market observations
- pending orders age
- corporate action review queue
- report delivery failures
- backup verification status

### 24.2 Alerts

High-priority operational alerts:

- ledger imbalance/invariant failure
- reconciliation failure
- repeated DB failures
- market provider broad outage
- corporate action blocked with player exposure
- backup failure
- worker backlog beyond threshold

Alerts should go to an admin-only Discord channel and/or external operational notification mechanism selected at deployment.

Do not spam the public game channel with infrastructure alerts.

---

## 25. Health Endpoints

Expose lightweight authenticated/private deployment health endpoints or equivalent checks:

- liveness
- readiness
- database connectivity
- worker heartbeat
- provider status summary

Readiness should fail if Stockpile cannot safely process core interactions.

Trading-specific provider degradation should be surfaced separately rather than necessarily killing the entire bot readiness state.

---

## 26. Backups

PostgreSQL must have automated backups.

Minimum target for private launch:

- daily automated backup
- point-in-time recovery when deployment provider supports it affordably
- retention of multiple restore points
- encrypted storage

### 26.1 Restore Testing

A backup that has never been restored is not trusted.

Before launch and periodically thereafter:

1. restore to isolated database
2. run migrations if needed
3. rebuild projections
4. run reconciliation
5. verify selected accounts/reports

---

## 27. Deployment Model

Recommended private deployment:

- one always-on container/service for bot
- one worker process (same container host or separate logical service)
- managed PostgreSQL where practical
- outbound HTTPS to Discord + market provider
- optional private artifact/object storage

### 27.1 Prefer Managed Database

For the zero-touch goal, managed PostgreSQL is preferable to self-hosting the database on the same VM if cost is reasonable.

The database is much more valuable than the replaceable bot container.

### 27.2 Containerization

Ship a reproducible Docker image.

Do not depend on manual package installation on the server.

---

## 28. Deployment Environments

At minimum:

- `development`
- `test/simulation`
- `production`

Production uses separate:

- Discord application/bot token where practical
- database
- provider credentials if provider supports sandbox/test separation

Simulation never posts financial events into production.

---

## 29. Migrations

Database migrations are versioned and committed.

Rules:

- migrations are forward-reviewed
- never casually drop financial-history columns/tables
- destructive changes require backup/verification
- large projection changes can rebuild from ledger

Schema migration and economy-rules changes are distinct concepts.

---

## 30. Simulation Harness

`packages/testing` should support accelerated game time.

Capabilities:

- fake Discord players
- fake controllable clock
- synthetic/recorded market provider
- deterministic market scenarios
- months/years of scheduled jobs
- random player strategies
- fault injection

Scenarios should include:

- bull market
- bear market
- sideways market
- crashes/gaps
- provider outage
- corporate actions
- leverage
- player lending network
- bankruptcies
- inactive players

The simulation harness is part of the product's zero-maintenance strategy, not optional QA garnish.

---

## 31. Recorded Market Fixtures

Tests should not depend on live market APIs.

Capture/license-permitting normalized fixtures for:

- normal quote sequence
- delayed quote sequence
- market gap
- split
- dividend
- ticker change
- merger
- halt

Where provider licensing prohibits fixture retention, build synthetic equivalent fixtures matching normalized contracts.

---

## 32. Provider Sandbox Boundary

Provider SDK/client code must be replaceable in tests.

No unit/domain test makes external network requests.

Integration tests against real providers are explicitly tagged and rate-limited.

---

## 33. Admin Operations

Admin UX/service supports:

- environment health
- provider health
- job queue
- failed jobs/retry
- reconciliation runs
- player/account inspection
- event/journal inspection
- projection rebuild
- security trading suspension
- corporate-action review
- audited compensating correction

### 33.1 No God-Mode Balance Box

Do not build a generic:

> Set Scott's balance to $123,456

field.

Corrections require explicit compensating event type and reason.

---

## 34. Operational Safe Modes

Support targeted safe modes:

- `TRADING_PAUSED_GLOBAL`
- `TRADING_PAUSED_MARKET`
- `TRADING_PAUSED_SECURITY`
- `MARGIN_BUYS_PAUSED`
- `PUBLIC_REPORTS_PAUSED`

Loans/repayments and safe non-market actions can continue when unrelated.

A broad provider outage should not require taking the entire bot offline.

---

## 35. Startup Recovery

On startup:

1. run/verify migrations
2. acquire instance identity
3. verify database
4. start Discord runtime
5. start/reconnect durable worker
6. reclaim expired job leases
7. process outbox backlog
8. run lightweight reconciliation/health checks
9. resume pending orders based on current market/calendar state

No special manual startup sequence should be required after a normal restart.

---

## 36. Graceful Shutdown

On shutdown:

- stop accepting new worker jobs
- allow active DB transactions to finish
- release job leases cleanly where possible
- close Discord/DB connections

Financial correctness still relies on atomic commits/idempotency if process termination is abrupt.

---

## 37. Scaling Strategy

The private deployment does not need distributed complexity.

Initial target:

- 2–5 players
- one guild
- dozens/hundreds of held/watchlisted securities, not millions

If future usage expands:

- bot/worker can scale independently
- Postgres remains authority
- outbox/jobs support multiple workers
- environment scoping already exists

No domain rewrite should be required merely to add a second guild.

---

## 38. Cost Discipline

Zero-touch also means avoiding an architecture that costs more to keep alive than the game is worth.

Prefer:

- one application codebase
- one database
- no Redis at launch
- no Kubernetes
- no microservice network
- no always-on headless browser farm
- no LLM dependency

External recurring costs should ideally be limited to:

- hosting/container
- managed PostgreSQL
- licensed market data
- optional storage/monitoring

The market-data license is likely the largest uncertain cost.

---

## 39. Architecture Decisions Frozen by This Draft

1. Stockpile launches on one private Discord server.
2. Domain/database are environment-scoped and safe for multiple guilds from day one.
3. No public SaaS onboarding/control plane is built.
4. TypeScript/Node.js is the recommended implementation direction.
5. PostgreSQL is the authoritative database.
6. Redis is not required at launch.
7. Financial state flows through ledger/application services, not Discord handlers.
8. Market vendors are isolated behind adapters.
9. Durable scheduled work is PostgreSQL-backed.
10. Financial changes emit a transactional outbox for asynchronous side effects.
11. Reports are finalized as structured data before rendering/delivery.
12. Visual rendering is deterministic and non-authoritative.
13. Managed PostgreSQL + container deployment is preferred.
14. Every critical subsystem is testable with a fake clock/provider.
15. Simulation and restore/rebuild tooling are first-class launch requirements.
16. Admin repair uses ledger corrections/rebuilds, never arbitrary balance editing.

---

## 40. Architecture North Star

The ideal production incident looks like this:

1. the market provider fails during the afternoon
2. trading automatically pauses only where unsafe
3. loan repayment jobs continue
4. the bot dashboard remains available
5. the provider recovers
6. queued price-verification jobs resume
7. a worker crashes and restarts
8. idempotency prevents duplicate trades/dividends
9. Friday report still finalizes after verified close data arrives
10. nobody SSHs into a database and edits Scott's balance

Stockpile should be small enough to understand and strict enough to trust.
