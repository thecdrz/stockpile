# Stockpile

Stockpile is a persistent multiplayer financial-life simulator for Discord powered by the real US and Canadian stock markets.

Players trade real stocks and ETFs with fictional money while Stockpile layers on long-term game systems: wealth, competition, borrowing, lending, credit, financial status, achievements, bankruptcy, recovery, prestige, reporting, and career history.

> **Real markets underneath. Game systems on top.**

## Current status

**Phase 0 — Specification Freeze is effectively complete except for one external blocker: production market-data provider/licensing selection.**

All core product, economy, Discord UX, accounting, edge-case, architecture, and release-gate specifications are now committed.

Do **not** begin production feature implementation until the market-data provider is selected and its license explicitly permits Stockpile's private multi-user Discord display/retention requirements.

Tracking:

- [Issue #1 — Phase 0 specification freeze](https://github.com/thecdrz/stockpile/issues/1)
- [Issue #2 — Market-data provider/licensing blocker](https://github.com/thecdrz/stockpile/issues/2)
- [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md) — authoritative handoff/status summary
- [`AGENTS.md`](AGENTS.md) — instructions for coding/research agents

## Locked product direction

- Real US and Canadian stocks and ETFs
- Fictional money only
- Initial private deployment for roughly 2–5 friends
- CAD base currency for the initial environment
- Persistent Career Account starting with 100,000 virtual CAD-equivalent units
- Separate standardized monthly League Account for fair competition
- Fractional shares
- Market and limit orders
- Persistent credit, system loans, player-to-player lending, gifts/transfers, leverage, financial distress, bankruptcy, recovery, and prestige assets
- One-command Discord UX: `/stockpile`
- Interactive Discord components rather than command memorization
- Strong automated Monday/Friday social rhythm, including the Friday Weekly Wrap
- Polished visual dashboards, charts, reports, milestones, and event cards
- Immutable auditable financial ledger
- Deterministic financial/game rules
- AI may add optional flavour but never controls financial outcomes
- Single-guild deployment at launch with an environment-scoped data model that remains multi-server-safe
- Zero-touch operation as a primary requirement

## Zero-touch operating goal

After launch, normal gameplay, progression, trading settlement, loans, credit, corporate actions, competitions, reporting, bankruptcy/recovery, and scheduled processing should run without routine developer or administrator intervention.

Every feature should satisfy:

> **Could this still operate correctly two years from now if nobody touched the code?**

## Specification set

These documents are authoritative for implementation. More-specific specs override tentative language in the original product plan.

- [`docs/PRODUCT_GAME_PLAN.md`](docs/PRODUCT_GAME_PLAN.md) — original product/game vision and overall scope
- [`docs/ECONOMY_SPEC.md`](docs/ECONOMY_SPEC.md) — deterministic economic rules, credit, lending, margin, bankruptcy, leagues, prestige
- [`docs/DISCORD_UX.md`](docs/DISCORD_UX.md) — onboarding, `/stockpile` workspace, navigation, privacy, notifications, visual system, Weekly Wrap
- [`docs/MARKET_DATA_SPEC.md`](docs/MARKET_DATA_SPEC.md) — market execution policy, exchanges, quote freshness, FX, calendars, corporate actions, provider abstraction
- [`docs/FINANCIAL_LEDGER.md`](docs/FINANCIAL_LEDGER.md) — accounting model, journal rules, quantity ledger, reservations, idempotency, reconciliation, corrections
- [`docs/EDGE_CASES.md`](docs/EDGE_CASES.md) — defined behavior for market, Discord, debt, bankruptcy, job, provider, and exploit failure modes
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — runtime boundaries, PostgreSQL authority, jobs/outbox, deployment, observability, environment scoping
- [`docs/RELEASE_CRITERIA.md`](docs/RELEASE_CRITERIA.md) — test matrix, simulation, restore/recovery, and private-launch gate
- [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md) — current project state and next action

## Architecture direction

The intended repository shape remains:

- `/apps/bot` — Discord application
- `/packages/core` — domain/game/financial logic
- `/packages/database` — schema, migrations, persistence
- `/packages/market-data` — provider contract and adapters
- `/packages/visuals` — deterministic charts/cards/report rendering
- `/packages/jobs` — durable scheduled processing
- `/packages/testing` — simulations, fixtures, invariant testing
- `/infra` — deployment configuration

No production application scaffolding has been created yet by design.

## Development phases

1. **Specification Freeze** — complete except provider/license selection
2. Financial Engine
3. Financial Life
4. Game Layer
5. Discord Experience
6. Automated Operations
7. Simulation & Hardening
8. Private Launch

## Immediate next action

Resolve Issue #2 by selecting a market-data provider and exact licensed plan that permits the intended private multi-user Discord use, including required display and retention rights.

Only after Issue #2 is resolved should Issue #1 be closed and active implementation begin.

## License

Private project. No license is currently granted.
