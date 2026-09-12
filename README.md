# Stockpile

Stockpile is a persistent multiplayer financial-life simulator for Discord powered by the real US and Canadian stock markets.

Players trade real stocks and ETFs with fictional money while Stockpile layers on long-term game systems: wealth, competition, borrowing, lending, credit, financial status, achievements, bankruptcy, recovery, prestige, reporting, and career history.

> **Real markets underneath. Game systems on top.**

## Project status

**Phase 0 — Specification Freeze**

No feature implementation should begin until the core game rules, economic invariants, Discord UX, market-data contract, financial ledger, and edge cases are documented well enough that implementation is mechanical rather than exploratory.

The operating goal is **zero-touch**: after launch, normal gameplay, progression, settlements, corporate actions, competitions, and reporting should run without routine developer or administrator intervention.

## Core product principles

- Real US and Canadian stocks and ETFs
- Fictional money only
- Persistent career economy
- Separate fair competitive league economy
- One-command Discord UX (`/stockpile`)
- Interactive buttons, menus, forms, cards, and charts instead of command memorization
- Strong weekly social loop with an automated Friday Weekly Wrap
- Long-term financial-life systems including debt, credit, lending, default, bankruptcy, recovery, and prestige
- Immutable, auditable financial ledger
- Deterministic core rules; AI may add flavour but never controls financial outcomes
- Market-data-provider abstraction to reduce long-term maintenance
- Visual quality is a first-class product requirement

## Planning documents

- [`docs/PRODUCT_GAME_PLAN.md`](docs/PRODUCT_GAME_PLAN.md) — overall product and game design
- `docs/ECONOMY_SPEC.md` — financial rules and economic invariants *(planned)*
- `docs/DISCORD_UX.md` — interaction model and screen/storyboard specification *(planned)*
- `docs/MARKET_DATA_SPEC.md` — exchanges, quotes, corporate actions, FX, calendars, and provider contract *(planned)*
- `docs/FINANCIAL_LEDGER.md` — accounting model and transaction invariants *(planned)*
- `docs/EDGE_CASES.md` — failure modes, exploits, and recovery rules *(planned)*
- `docs/ARCHITECTURE.md` — technical architecture *(planned)*
- `docs/RELEASE_CRITERIA.md` — launch gate and validation plan *(planned)*

## Development phases

1. **Specification Freeze**
2. Financial Engine
3. Financial Life
4. Game Layer
5. Discord Experience
6. Automated Operations
7. Simulation & Hardening
8. Private Launch

Implementation should not skip Phase 0.

## Initial scope

Stockpile is initially designed for a small private Discord server, especially a group of roughly 2–5 friends. The architecture decision for eventual multi-server support will be made during specification freeze.

## License

Private project. No license is currently granted.
