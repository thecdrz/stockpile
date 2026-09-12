# AGENTS.md

This repository is intentionally specification-first.

Before changing code or project structure, read this file, `docs/CURRENT_STATUS.md`, and `docs/IMPLEMENTATION_STATUS.md`.

## Current phase

Stockpile is in **Phase 1 — Financial Engine (synthetic-market development)**.

The core specification freeze is closed for synthetic-market development. Production market-data provider/licensing selection (GitHub Issue #2) remains open and blocks real-market integration and launch, not implementation against synthetic fixtures.

Implementation must use the normalized market-data contract with synthetic or license-safe fixtures. Do not connect, scrape, or redistribute real market data until Issue #2 is resolved with an acceptable license.

There is intentionally no production application scaffold yet.

## Product summary

Stockpile is a private Discord financial-life game using real US/Canadian stocks and ETFs with fictional money.

Core idea:

> Real markets underneath. Game systems on top.

The game combines real market movements with persistent portfolios, loans, player lending, credit, leverage, bankruptcy/recovery, prestige, achievements, leagues, reporting, and social weekly recaps.

Initial audience: approximately 2–5 friends in one private Discord guild.

## Mandatory read order

1. `README.md`
2. `docs/CURRENT_STATUS.md`
3. `docs/IMPLEMENTATION_STATUS.md`
4. GitHub Issue #1 — Phase 0 specification freeze
5. GitHub Issue #2 — licensed market-data provider blocker
6. `docs/PRODUCT_GAME_PLAN.md`
7. `docs/ECONOMY_SPEC.md`
8. `docs/DISCORD_UX.md`
9. `docs/MARKET_DATA_SPEC.md`
10. `docs/FINANCIAL_LEDGER.md`
11. `docs/EDGE_CASES.md`
12. `docs/ARCHITECTURE.md`
13. `docs/RELEASE_CRITERIA.md`

More-specific specs override tentative language in the older product plan.

`docs/CURRENT_STATUS.md` and the active Phase 0 issues override obsolete TODO/checklist language in earlier drafts.

## Hard product constraints

Do not casually change these without an explicit design decision:

- real US and Canadian stocks/ETFs
- fictional money only
- one private guild at launch
- environment-scoped/multi-server-safe domain model
- CAD base currency for the initial environment
- persistent Career Account
- separate monthly standardized League Account
- one-command `/stockpile` UX
- visual/interactive Discord interface instead of command memorization
- deterministic financial outcomes
- append-only/auditable financial history
- no guessed market prices
- bankruptcy must preserve a comeback path
- automated Monday/Friday/monthly game loops
- zero-touch operation as a design goal

## Zero-touch test

For every feature, ask:

> Could this still operate correctly two years from now if nobody touched the code?

Features requiring routine editorial content, manual resets, hand settlement, or frequent balance tuning are suspect by default.

## Financial correctness rules

Treat financial correctness as safety-critical within the game even though all money is fictional.

Never:

- mutate player wealth without an authoritative ledger event
- use floating-point arithmetic for monetary accounting
- execute against an untrustworthy/stale price
- silently rewrite historical transactions
- make scheduled processing non-idempotent
- let Discord retries duplicate a transaction
- let Career money leak into League accounts or vice versa
- let a UI-rounded number become accounting truth
- make AI/LLM output authoritative for settlement, pricing, credit, bankruptcy, or ranking

Corrections should be compensating entries, not destructive history edits.

## Market-data production blocker

Before real-market integration or launch, Issue #2 must identify an exact provider and plan/license that permits Stockpile's use.

Do not solve this by:

- scraping consumer finance sites
- using undocumented endpoints
- ignoring display/redistribution terms
- assuming a personal API subscription permits a multi-user bot
- using end-of-day-only Canadian pricing for normal intraday trading

The provider must satisfy the technical contract in `docs/MARKET_DATA_SPEC.md` and explicitly permit the intended private multi-user display/retention use.

## Architecture guardrails

Follow `docs/ARCHITECTURE.md`.

Key direction:

- strongly typed backend
- PostgreSQL as authoritative persistence
- domain logic isolated from Discord transport
- market-data provider adapter
- append-only financial events / journal
- security quantity subledger
- durable idempotent jobs
- durable outbox for Discord publication
- deterministic report/visual rendering
- structured logging, health, backup, reconciliation
- no unnecessary Kubernetes/Redis/microservice sprawl for the initial private deployment

Do not introduce infrastructure merely because it is fashionable.

## Discord UX guardrails

Follow `docs/DISCORD_UX.md`.

A normal player should remember only `/stockpile`.

Normal gameplay must be navigable through Discord interactive components.

Prioritize:

- private personalized dashboard/workspace
- clear Back/Home navigation
- explicit confirmations for financial actions
- public social reporting only where the privacy spec allows it
- polished hierarchy, charts, cards, and concise copy
- low notification noise

Do not turn Stockpile into a wall of slash commands or raw embeds.

## Edge cases

Before inventing behavior for a failure case, search `docs/EDGE_CASES.md`.

The edge-case catalogue is deliberately broad. If behavior is already specified, implement it rather than inventing a different rule.

If an uncovered edge case would affect economic correctness, data licensing, irreversible player state, or ledger invariants, document the rule before implementing it.

## Testing expectation

The project intentionally has a higher-than-normal validation bar because the goal is low maintenance after launch.

Follow `docs/RELEASE_CRITERIA.md`.

Implementation work should include tests for every new financial invariant and failure mode. Long-running simulation, restart/retry behavior, reconciliation, provider failure, and backup/restore matter as much as happy-path UI tests.

## Development workflow

Implementation should proceed broadly in this order:

1. Financial Engine
2. Financial Life
3. Game Layer
4. Discord Experience
5. Automated Operations
6. Simulation & Hardening
7. Private Launch

Do not jump directly to a flashy Discord dashboard while the ledger/trading invariants are missing.

## Repo hygiene

- Keep specifications updated when a design decision changes.
- Link implementation PRs/issues back to the applicable spec sections.
- Avoid undocumented behavior.
- Avoid secrets in the repository.
- Prefer small, reviewable changes with tests.
- Preserve auditability and reproducibility.

## Immediate handoff task

Unless explicitly told otherwise, an agent receiving this repository today should continue **Phase 1 — Financial Engine** using synthetic market data. Real-provider work remains blocked by Issue #2.
