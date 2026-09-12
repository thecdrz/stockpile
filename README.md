# Stockpile

Stockpile is a persistent multiplayer financial-life simulator for Discord powered by the real US and Canadian stock markets.

Players trade real stocks and ETFs with fictional money while Stockpile layers on long-term game systems: wealth, competition, borrowing, lending, credit, financial status, achievements, bankruptcy, recovery, prestige, reporting, and career history.

> **Real markets underneath. Game systems on top.**

## Current status

**Phase 1 — Financial Engine is active in synthetic-market development mode.**

The immediate delivery target is now a small playable private-guild MVP. It provides `/stockpile`, automatic Career-account onboarding, a private button-driven dashboard, three fictional synthetic securities, market/limit order confirmation, durable settlement, portfolio/history views, and fill notifications. The broader financial-life game remains the long-term design, but is intentionally deferred while this slice gathers play feedback.

All core product, economy, Discord UX, accounting, edge-case, architecture, and release-gate specifications are now committed.

Implementation uses synthetic market data until an acceptable licensed source is found. Do **not** connect or launch with real market data until its license explicitly permits Stockpile's private multi-user Discord display and retention requirements.

Tracking:

- [Issue #1 — Phase 0 specification freeze](https://github.com/thecdrz/stockpile/issues/1)
- [Issue #2 — Market-data provider/licensing blocker](https://github.com/thecdrz/stockpile/issues/2)
- [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md) — authoritative handoff/status summary
- [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) — completed code, verification evidence, and next increment
- [`AGENTS.md`](AGENTS.md) — instructions for coding/research agents

## Locked product direction

- Real US and Canadian stocks and ETFs
- Fictional money only
- Initial private deployment for roughly 2–5 friends
- One clearly identified fictional NPC participant to keep a 1–3-human game lively
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
- NPC predictions and trades come from a deterministic, explainable strategy engine using only information available at decision time
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

The playable MVP runtime now lives in `/apps/bot`; the remaining package locations describe the broader planned product.

## Run the synthetic Discord MVP

Prerequisites: Node.js 24+, PostgreSQL 16+, and a Discord application installed in one private guild with the `bot` and `applications.commands` scopes. The bot needs permission to use application commands and send messages; players must allow DMs to receive fill notifications.

1. Copy `.env.example` to `.env` and fill in the Discord application token, application ID, guild ID, and database URL.
2. Start PostgreSQL. If Docker is available, `docker compose up -d postgres` provides the development database declared in this repository.
3. Export the variables from `.env` into your shell and run `npm run bot:start`.
4. In the configured Discord guild, enter `/stockpile` and use the buttons. Available fictional tickers are `MAPL`, `NSTAR`, and `ORBT`.

The command is registered directly to the configured guild at startup, so it normally appears immediately. This runtime never contacts a real market-data source.

For this machine, `infra/stockpile.service` can run the compiled bot continuously under systemd after the database is configured. Rebuild the application before restarting that service whenever code changes.

## Development phases

1. **Specification Freeze** — complete for synthetic-market development
2. **Financial Engine** — active
3. Financial Life
4. Game Layer
5. Discord Experience
6. Automated Operations
7. Simulation & Hardening
8. Private Launch

## Immediate next action

Run the synthetic Discord MVP against PostgreSQL in the private test guild, introduce it to the initial players, and use their feedback to choose the next product increment. Issue #2 must still be resolved before any real-market integration or launch.

## License

Private project. No license is currently granted.
