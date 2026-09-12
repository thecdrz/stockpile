# Stockpile

## Product & Game Plan — Draft v0.1

### 1. Product Vision

**Stockpile** is a persistent multiplayer financial-life simulator for Discord powered by the real US and Canadian stock markets.

Players trade real stocks and ETFs using entirely fictional money. Real-world market movements drive the underlying economy, while Stockpile adds the game around it: wealth, competition, borrowing, lending, credit, financial status, achievements, bankruptcy, recovery, prestige, reporting, and long-term career history.

Stockpile is not intended to teach professional investing or reproduce a brokerage exactly.

It should be:

- easy to understand
- fun with only 2–5 players
- competitive without requiring constant attention
- deep enough to remain interesting for years
- highly visual and polished
- driven by real-world market activity
- capable of operating unattended after deployment

The guiding principle is:

> **Real markets underneath. Game systems on top.**

---

# 2. Zero-Touch Requirement

Stockpile must be designed to operate indefinitely without routine developer or administrator involvement.

After release, normal operation must not require:

- manually creating challenges
- manually resetting competitions
- writing new events
- adjusting player balances
- adding new public companies
- updating weekly reports
- manually processing dividends
- settling bets
- servicing loans
- managing bankruptcy
- changing progression thresholds regularly
- manually fixing normal corporate actions

Developer intervention should normally occur only for:

- software defects
- security issues
- Discord API changes
- market-data-provider changes
- infrastructure failures
- unforeseen financial-data edge cases

Every proposed feature must pass the following test:

> **Could this still operate correctly two years from now if nobody touched the code?**

---

# 3. Core Player Fantasy

A player begins with virtual capital and gradually creates a financial history.

Their career may include:

- first investments
- major gains
- terrible trades
- market crashes
- accumulating wealth
- borrowing money
- lending to friends
- collecting interest
- improving credit
- becoming overleveraged
- defaults
- bankruptcy
- rebuilding
- league championships
- purchasing prestige assets
- reaching millionaire status
- becoming the wealthiest player in the server

Stockpile should create stories naturally from the interaction between real markets and player decisions.

---

# 4. Supported Markets

Stockpile will support:

### United States

- NYSE
- NASDAQ
- major US-listed ETFs

### Canada

- Toronto Stock Exchange
- Canadian-listed ETFs

TSX Venture Exchange support will be evaluated separately based on reliable market-data availability.

Supported securities at launch:

- common stocks
- ETFs

Initially excluded:

- options
- futures
- forex trading
- crypto
- bonds
- leveraged derivatives

These can be reconsidered only if they clearly improve gameplay without dramatically increasing maintenance or settlement complexity.

---

# 5. Player Account

Every player receives a persistent **Career Account**.

Recommended initial state:

- **Starting cash:** $100,000 virtual currency
- **Holdings:** none
- **Debt:** none
- **Credit rating:** C
- **Status:** New Investor

The starting amount should ultimately be configurable globally, but all players in the same game environment begin under identical rules.

The Career Account never resets during normal gameplay.

---

# 6. Net Worth

Net worth is one of Stockpile's central measurements.

Conceptually:

**Cash**

+ market value of securities

+ prestige/financial assets

+ loans owed to player

− outstanding debt

− other liabilities

= **Net Worth**

Players should always be able to understand exactly how Stockpile calculated this number.

Historical net worth should be preserved so that players can see their entire financial career over time.

---

# 7. One-Command UX

Players should need to remember exactly one command:

`/stockpile`

This opens the player's **Stockpile Home**.

Every normal game feature must then be reachable through Discord's interactive interface using:

- buttons
- menus
- selection controls
- modal forms
- pagination
- interactive cards

Optional direct commands may eventually exist for expert users, but they are conveniences rather than requirements.

A player should never need to memorize `/buy`, `/loan`, `/reports`, `/portfolio`, etc.

---

# 8. Stockpile Home

The Home interface should immediately answer:

- How wealthy am I?
- How did I perform today?
- Where do I rank?
- What needs my attention?
- What can I do next?

Example information:

**Scott**

Status: Active Investor  
Credit: A

Net Worth: **$184,230**

Today: **+1.6%**

Portfolio: $141,820  
Cash: $31,410  
Assets: $20,000  
Debt: $9,000

Season Rank: **#2**

Attention:

- loan payment due Friday
- one holding reports earnings tomorrow
- portfolio concentration has exceeded 45%

Primary navigation:

- **Portfolio**
- **Trade**
- **Markets**
- **Bank**
- **League**
- **Reports**
- **Profile**
- **More**

Navigation conventions must remain consistent throughout Stockpile.

Every secondary screen should provide obvious access to **Back** and **Home**.

---

# 9. Trading

Trading must use authoritative real-world market prices.

Players can:

- search securities by company name
- search by ticker
- browse owned securities
- browse watchlists
- browse league-owned securities
- browse relevant market movers

Fractional shares should be supported.

Players should be able to purchase by monetary amount:

> Invest $5,000 in NVDA

rather than being forced to calculate a whole number of shares.

## Initial order types

Launch should support:

- **Market Orders**
- **Limit Orders**

Market orders submitted while the relevant exchange is closed should normally enter a pending state for execution when the exchange reopens.

Exact execution-price rules must be deterministic and documented.

Players should never receive a trade at a stale quote simply because Discord displayed an old price.

---

# 10. Currency

US and Canadian securities introduce FX complexity.

Recommended model:

Each Stockpile environment has one configurable **account base currency**.

Foreign-listed securities are transparently converted when calculating:

- purchases
- sales
- portfolio value
- net worth
- reports

FX rates are recorded with transactions for auditing.

Stockpile should not become a forex game unless that is explicitly added later.

---

# 11. Portfolio

Portfolio should display:

- total market value
- total cost basis
- unrealized profit/loss
- realized profit/loss
- daily movement
- allocation
- cash
- individual positions
- concentration risk
- historical return

Each position should provide:

- company
- ticker
- exchange
- current real-world price
- quantity
- average cost
- total value
- return
- daily movement
- historical chart
- recent player transactions

---

# 12. Watchlists and Discovery

Players should not need prior knowledge of ticker symbols.

Stockpile should support:

- search
- personal watchlists
- major indices
- top relevant movers
- recently viewed securities
- securities owned by league players
- securities reporting earnings soon
- popular stocks within the league

Market discovery should favour information relevant to the players rather than dumping the entire financial market into Discord.

---

# 13. Financial Status

Stockpile should use meaningful financial states rather than traditional RPG levels.

Possible positive progression:

- New Investor
- Retail Investor
- Active Investor
- Established Investor
- Accredited Investor
- High Net Worth
- Market Elite
- Tycoon

Exact names and thresholds will be finalized later.

Players may also enter negative financial states:

- Overleveraged
- Distressed
- In Default
- Insolvent
- Bankrupt
- Recovering

Status is calculated from actual player condition rather than XP alone.

---

# 14. Credit

Every player has a credit rating:

D → C → B → A → AA → AAA

Credit should respond to factors such as:

- net worth
- debt-to-assets
- liquidity
- repayment history
- defaults
- prior bankruptcy
- account history

Credit affects:

- system borrowing limits
- borrowing interest rates
- available loan durations
- leverage eligibility
- certain financial privileges

Credit should be recalculated automatically.

---

# 15. System Banking

Stockpile contains a fictional financial institution that can lend virtual money.

Players may qualify for loans based on financial status and credit.

Loans contain:

- principal
- interest rate
- term
- payment schedule
- remaining balance
- status
- penalties/default conditions

Payments occur automatically where possible.

Borrowing should provide opportunity while meaningfully increasing risk.

---

# 16. Player-to-Player Lending

Players can offer loans to each other.

Example:

**Loan Offer**

Lender: Scott  
Borrower: Mark

Principal: $20,000  
Interest: 8%  
Duration: 30 days

Total repayment: $21,600

**Accept** / **Decline**

Once accepted, Stockpile becomes the authoritative ledger for the contract.

Loans should support:

- scheduled repayments
- early repayment
- partial payments
- term extensions
- restructuring
- forgiveness
- delinquency
- default

The lender's outstanding loan counts as a financial asset.

The borrower's obligation counts as debt.

Player lending history contributes to career statistics.

---

# 17. Gifts and Transfers

Players may transfer virtual cash.

Transfers must be recorded permanently.

Game design must prevent transfers from trivially destroying competitive modes.

Career transfers may therefore be unrestricted within sensible safety limits while competitive league accounts remain isolated.

Statistics may include:

- lifetime money sent
- lifetime money received
- money gifted
- loans made
- interest collected

---

# 18. Leverage and Margin

Stockpile should eventually support leverage because it creates meaningful financial risk.

Margin rules must be fully deterministic.

Players approaching dangerous leverage levels receive warnings.

Possible progression:

Healthy → Elevated Risk → Margin Warning → Margin Call → Forced Liquidation → Insolvent

A real market crash should therefore be capable of triggering genuine game consequences.

Example:

NVDA falls 20%.

Scott's portfolio drops significantly.

His debt ratio rises.

His account enters Margin Warning.

If collateral continues falling, Stockpile automatically sells enough assets according to predetermined liquidation rules.

No administrator intervention should be required.

---

# 19. Bankruptcy

Bankruptcy is a gameplay state rather than game over.

Potential triggers include:

- liabilities exceeding permitted thresholds
- inability to satisfy debt obligations
- unrecoverable margin deficit

Bankruptcy may:

- liquidate investment holdings
- liquidate eligible assets
- settle secured liabilities
- restructure or discharge eligible debt
- destroy credit
- record the bankruptcy permanently
- move player into Recovering status
- grant protected restart capital

Recommended recovery capital: **$10,000**

A recovering player should immediately have meaningful gameplay available.

Long-term comeback achievements should exist.

Example:

**Back From the Dead** — Reach $1,000,000 net worth after bankruptcy.

---

# 20. Prestige Assets

Players eventually need reasons to use accumulated wealth beyond buying more stock.

Stockpile should include prestige assets such as:

- homes
- luxury cars
- art
- boats
- aircraft
- commercial property
- increasingly absurd endgame purchases

These should primarily represent:

- wealth sinks
- status
- collection
- profile customization
- visual progression

Economic effects should remain relatively lightweight to avoid Stockpile turning into a property-management simulator.

---

# 21. Career History

Stockpile preserves meaningful career history permanently.

Examples:

- date joined
- current net worth
- peak net worth
- lifetime market return
- realized investment profit
- dividend income
- interest received
- interest paid
- money transferred
- money loaned
- largest loan
- defaults
- bankruptcies
- largest single-day gain
- largest single-day loss
- best trade
- worst trade
- championships
- weekly awards
- achievements
- prestige assets

The player's financial history effectively becomes their save file.

---

# 22. Competitive League

Career wealth must not make competition permanently unwinnable for new players.

Stockpile therefore includes a separate **League Portfolio**.

Each league period begins with identical standardized capital for every participant.

Example:

Career Account:

- Scott: $4.2M
- Mark: $810K
- Dan: $95K

League:

- Scott: $100K
- Mark: $100K
- Dan: $100K

League accounts are isolated from career transfers, loans and gifts.

Performance is based primarily on percentage return rather than absolute career wealth.

Recommended initial league duration: **Monthly**

Longer seasonal/championship structures may aggregate multiple monthly competitions.

Career rewards from league wins should primarily be:

- trophies
- achievements
- profile prestige
- permanent records

rather than enormous cash rewards that distort the persistent economy.

---

# 23. Weekly Gameplay Rhythm

Stockpile should have a natural weekly heartbeat.

## Monday — Opening Bell

A compact automatically generated message may include:

- current league standings
- relevant earnings this week
- loans/payments due
- players approaching milestones
- securities relevant to league members
- important market schedule changes

Only personally relevant information should be shown.

## During the Week

Stockpile remains relatively quiet.

It surfaces meaningful events such as:

- major portfolio movement
- margin warning
- credit change
- loan activity
- milestone
- relevant corporate action
- major ranking movement

Routine market fluctuations should not spam Discord.

## Friday — Weekly Wrap

The weekly report is one of Stockpile's primary social moments.

It should contain both useful statistics and light humour.

Potential categories include:

- Trader of the Week
- Best Trade
- Worst Trade
- Biggest Winner
- Biggest Loser
- Diamond Hands
- Paper Hands
- YOLO Award
- Cash Goblin
- Comeback Kid
- Perfect Exit
- Perfect Entry
- Market Beater
- Contrarian
- Dividend Leader
- Debt Collector
- Loan Shark
- Most Active
- Quiet Week
- Worst Timing Imaginable

Stockpile dynamically chooses only the categories that produced interesting results that week.

Approximately 5–8 awards should appear rather than every available statistic.

---

# 24. Weekly Statistics Become Career Statistics

Weekly achievements should accumulate.

Example profile:

- Weekly Wins: 17
- Trader of the Week: 9×
- Diamond Hands: 14×
- Paper Hands: 6×
- YOLO Awards: 11×
- Best Weekly Return: +18.7%
- Worst Weekly Return: −21.3%
- Longest Winning Streak: 5 weeks
- Market-Beating Weeks: 61%

Both flattering and embarrassing records should be preserved.

---

# 25. Monthly Statements

Every player receives a polished automated monthly financial statement.

Potential contents:

- Opening Net Worth
- Closing Net Worth
- Monthly Change
- Investment Return
- Realized Gains
- Unrealized Gains
- Dividend Income
- Loan Interest Received
- Interest Paid
- Asset Activity
- Debt Change
- Credit Change
- Best Position
- Worst Position
- League Performance
- Milestones
- Net-worth history

Personal statements should generally remain private/on-demand while the weekly social recap is public.

---

# 26. Reporting

Stockpile must provide substantial on-demand reporting.

Primary report categories:

### Portfolio

Current holdings and allocation.

### Performance

Day, week, month, year, league, and all time.

### Benchmark Comparison

Player return versus major relevant market benchmarks.

### Transactions

Complete financial ledger.

### Income

Dividends, interest, and other recurring income.

### Debt & Credit

Balances, payments, interest, and credit changes.

### Career

Historical wealth and major events.

Every report should prioritize visual presentation over raw text whenever practical.

---

# 27. Net-Worth Timeline

Players should have a visual historical net-worth chart.

Major financial events may be marked:

- First $100K
- First $1M
- Major loan
- League championship
- Margin call
- Bankruptcy
- Recovery
- Career high

The timeline should make a player's long-term journey visible at a glance.

---

# 28. Achievements

Achievements should be condition-based so new achievements do not need to be manually authored continuously.

Some are visible. Some should remain secret until unlocked.

Examples:

- Diamond Hands
- Paper Hands
- Full Send
- Market Beater
- Bag Holder
- Back From the Dead
- Cash Gang
- Perfect Exit
- Perfect Entry
- Debt Free
- Loan Shark
- Millionaire
- Comeback Kid

Achievements remain permanently associated with the player's career.

---

# 29. Predictions and Friendly Challenges

Predictions provide gameplay without requiring portfolio changes.

Examples:

- Will AAPL close higher Friday than Monday?
- Which performs better this week: AMD or NVDA?
- Will SHOP.TO finish above a specified price?
- Which league member finishes the week highest?

Players may also challenge each other using standardized templates.

Stockpile automatically:

- records predictions
- locks them at the appropriate deadline
- retrieves authoritative market results
- determines winners
- updates records

Prediction systems must remain secondary to the financial-life simulation.

Stockpile should not devolve into a casino game.

---

# 30. Personality

Stockpile should have personality.

Default tone: **Playful**

Optional server tone settings may eventually include:

- Professional
- Playful
- Unhinged

Humour should generally derive from actual player behaviour.

Examples:

Selling shortly before a major rally:

> An inspiring commitment to avoiding profit.

Remaining almost entirely in cash during a market rally:

> Successfully avoided nearly all financial risk, including the risk of making money.

Humour should be generated through deterministic templates and statistics rather than depending on an AI service.

AI may eventually enhance flavour text but must never control:

- trading
- prices
- settlements
- financial calculations
- credit
- bankruptcy
- competition results

---

# 31. Notifications

Notifications should be meaningful rather than frequent.

Possible notification classes:

### Critical

- Margin call
- Forced liquidation
- Default
- Bankruptcy

### Important

- Loan due
- Major credit change
- Corporate action affecting player
- League deadline

### Interesting

- Large portfolio move
- Major ranking change
- Milestone
- Achievement

### Routine

- Normal price changes
- Routine trading activity

Routine messages should generally remain inside the Stockpile interface rather than being pushed automatically.

---

# 32. Public vs Private Information

Recommended principle:

Public:

- league ranking
- weekly performance
- major achievements
- financial status
- selected profile statistics
- weekly awards

Potentially private:

- exact holdings
- exact cash
- detailed debt
- specific loan terms
- watchlists
- personal reports

Visibility preferences should be defined during final UX design.

Some financial secrecy creates better competition and social gameplay.

---

# 33. Real Corporate Actions

Corporate actions must be considered a core subsystem.

Stockpile must correctly handle:

- stock splits
- reverse splits
- ticker changes
- mergers
- acquisitions
- spin-offs
- cash acquisitions
- dividends
- delistings
- security suspensions
- company bankruptcy

Corporate actions must preserve player economic value appropriately.

All resulting account changes must enter the ledger.

---

# 34. Market Calendar

Stockpile must understand:

- US market holidays
- Canadian market holidays
- different exchange schedules
- trading halts
- market closures
- early closes
- daylight-saving changes

Trading availability must be based on the exchange on which the selected security trades.

---

# 35. Market Data Reliability

The game must never blindly trust a single returned quote.

Stockpile requires:

- quote timestamps
- stale-data detection
- validation
- provider-error handling
- trade suspension when authoritative pricing is unavailable

If Stockpile cannot determine a trustworthy execution price, trading pauses for that instrument rather than inventing a result.

---

# 36. Data Provider Independence

Market-data access must exist behind an internal provider abstraction.

The rest of the game should request:

- quote
- security metadata
- market status
- historical prices
- dividend data
- corporate actions
- FX rates

without knowing which external company supplies the information.

Changing market providers later should require replacing an adapter rather than rewriting the game.

Provider selection will be researched before implementation.

---

# 37. Immutable Financial Ledger

Every financial mutation must produce a ledger transaction.

Examples:

- BUY
- SELL
- DIVIDEND
- LOAN_DISBURSEMENT
- LOAN_PAYMENT
- INTEREST
- TRANSFER
- GIFT
- ASSET_PURCHASE
- ASSET_SALE
- MARGIN_LIQUIDATION
- CORPORATE_ACTION
- BANKRUPTCY_ADJUSTMENT

Ledger entries should be append-only.

Corrections occur through compensating transactions rather than silently rewriting history.

This allows Stockpile to answer:

> Where did my money go?

with certainty.

---

# 38. Anti-Exploit Requirements

The system must prevent:

- trading against stale prices
- race-condition double spending
- buying after a known market movement using an old quote
- gift manipulation of competitive accounts
- borrowing immediately before an exploitable bankruptcy
- rounding exploits
- duplicate settlement
- replayed Discord interactions
- unauthorized player actions
- abuse during market-data outages

Every monetary operation should be atomic and idempotent.

---

# 39. Visual Design

Visual quality is a first-class requirement.

Stockpile should not resemble a wall of Discord bot text.

Design language:

- polished dark financial UI
- restrained colour
- excellent spacing
- strong typography hierarchy
- clean icons
- clear positive/negative movement
- charts
- consistent cards
- limited clutter

Major visual surfaces include:

- Stockpile Home
- Portfolio
- Security Detail
- Trade Confirmation
- Market Overview
- Bank
- Loan Agreement
- League Standings
- Player Profile
- Weekly Wrap
- Monthly Statement
- Achievement
- Milestone
- Margin Call
- Bankruptcy
- Recovery
- Career Timeline
- Prestige Assets

Every surface should feel like part of the same application.

---

# 40. Automated Visual Reports

Weekly and monthly reports should ideally be rendered as polished visual cards or dashboard-style images rather than plain Discord embeds whenever practical.

Examples:

- weekly league card
- portfolio allocation graphic
- net-worth graph
- player comparison card
- monthly statement
- bankruptcy event
- season championship

The visual-report renderer should use deterministic templates so reports remain consistent and do not require generative AI.

---

# 41. Administration

Even a zero-touch system requires emergency tooling.

Authorized administrators need tools to:

- inspect account state
- inspect ledger
- suspend trading
- suspend one security
- rebuild calculated balances
- replay scheduled processing safely
- correct malformed external data
- apply compensating financial transactions
- inspect failed jobs
- repair corporate actions

Admins should not normally edit balances directly.

Administrative actions must be logged.

---

# 42. Scheduled Processing

Stockpile will require automatic scheduled jobs such as:

- market-open processing
- pending trade processing
- loan payments
- interest accrual
- corporate-action processing
- dividends
- credit recalculation
- financial-status recalculation
- margin evaluation
- weekly statistics
- Monday briefing
- Friday Weekly Wrap
- monthly statements
- league rollover
- backups
- reconciliation

Scheduled work must be idempotent.

Running a job twice must never create duplicate financial events.

---

# 43. Inactivity

Career portfolios continue existing while a player is inactive.

Therefore:

- securities continue changing value
- dividends continue being credited
- loans continue progressing
- interest continues accruing
- credit may change
- financial distress may occur

Competitive league participation may require activity or explicit enrollment so an inactive user does not continually occupy competitive slots.

Rules must be finalized before implementation.

---

# 44. Long-Term Retention

Long-term engagement comes from systems rather than manually created content.

### Immediate

- Check markets
- Trade
- Check portfolio
- Respond to alerts

### Weekly

- Compete with friends
- Watch positions
- Handle loans
- Friday Weekly Wrap

### Monthly

- League results
- Monthly statement
- Status changes
- Milestones

### Long Term

- Build wealth
- Improve credit
- Collect assets
- Set records
- Win championships
- Survive financial disasters
- Recover from bankruptcy
- Reach prestige milestones
- Maintain a permanent financial career

---

# 45. Technical Principles

Implementation should prioritize correctness over cleverness.

Recommended architecture characteristics:

- strongly typed backend
- relational database
- append-only financial ledger
- deterministic financial engine
- Discord interaction layer separated from domain logic
- market-data abstraction
- scheduled-job system
- visual-rendering service
- comprehensive automated tests
- structured logging
- health monitoring
- automated backups
- reproducible deployment

The financial/game engine should be testable without Discord.

---

# 46. Testing Requirements

Stockpile should have unusually strong automated testing because post-launch maintenance is intentionally limited.

Required categories:

- unit tests
- financial-calculation tests
- ledger invariants
- trading tests
- loan lifecycle tests
- credit tests
- bankruptcy tests
- corporate-action tests
- currency tests
- market-calendar tests
- scheduled-job idempotency tests
- Discord interaction tests
- database migration tests
- provider-adapter tests
- visual snapshot tests
- end-to-end player-flow tests
- simulation/stress tests

Before release, long-running simulated players should be used to test months or years of game time.

---

# 47. Repository Structure

Recommended initial repository: `stockpile`

Suggested top-level layout:

- `/docs` — product and game specifications
- `/apps/bot` — Discord-facing application
- `/packages/core` — game and financial domain logic
- `/packages/database` — schema, migrations and persistence
- `/packages/market-data` — provider abstraction and adapters
- `/packages/visuals` — charts, cards and report rendering
- `/packages/jobs` — scheduled processing
- `/packages/testing` — simulation fixtures and helpers
- `/infra` — deployment configuration

Initial documentation:

- `README.md`
- `docs/PRODUCT_GAME_PLAN.md`
- `docs/ECONOMY_SPEC.md`
- `docs/DISCORD_UX.md`
- `docs/MARKET_DATA_SPEC.md`
- `docs/FINANCIAL_LEDGER.md`
- `docs/EDGE_CASES.md`
- `docs/ARCHITECTURE.md`
- `docs/RELEASE_CRITERIA.md`

---

# 48. Development Strategy

Because the goal is minimal maintenance after deployment, development should happen in deliberate stages before the real launch.

### Phase 0 — Specification Freeze

- Complete all game rules
- Research market-data providers
- Define every financial state
- Storyboard all primary Discord interfaces
- Define economic invariants
- Build exhaustive edge-case catalogue

### Phase 1 — Financial Engine

- Ledger
- Accounts
- Trading
- Securities
- FX
- Corporate actions
- Cash
- Portfolio valuation

### Phase 2 — Financial Life

- Credit
- Loans
- Player lending
- Transfers
- Margin
- Default
- Bankruptcy
- Recovery

### Phase 3 — Game Layer

- Status
- Achievements
- Career records
- League system
- Predictions
- Prestige assets
- Weekly statistics

### Phase 4 — Discord Experience

- One-command launcher
- Navigation
- Interactive trading
- Dashboards
- Reporting
- Visual cards
- Notifications

### Phase 5 — Automated Operations

- Scheduled processing
- Weekly Wrap
- Monthly statements
- League rollover
- Reconciliation
- Monitoring
- Backups

### Phase 6 — Simulation & Hardening

- Simulate months/years of activity
- Attempt economic exploits
- Test provider failures
- Test corporate actions
- Test market closures
- Test repeated bankruptcies
- Test inactive players
- Test recovery from service interruptions

### Phase 7 — Private Launch

- Deploy to the three-player Discord server
- Observe actual usage
- Fix bugs
- Do not casually add features simply because development is still fresh

---

# 49. Release Criteria

Stockpile should not be considered finished because trading works.

Launch requires confidence that:

- every financial transaction is auditable
- real stocks and ETFs trade correctly
- US and Canadian market schedules work
- FX valuation works
- dividends work
- corporate actions work
- loans settle automatically
- defaults work
- bankruptcy works
- recovery works
- league rollover works
- reports generate automatically
- weekly statistics work
- scheduled tasks are idempotent
- stale data cannot be exploited
- backups restore correctly
- UI navigation works without command memorization
- all critical operations survive process restarts
- multiple simulated years can run without economic corruption

---

# 50. Remaining Decisions Before Specification Freeze

A relatively small set of issues still needs final decisions or research:

1. Exact market-data provider.
2. Exact quote latency required and associated cost.
3. Base account currency and FX rules.
4. Whether short selling ships in initial release.
5. Exact margin model.
6. Final bankruptcy thresholds and debt-discharge rules.
7. Exact credit formula.
8. Exact status ladder.
9. League length and scoring formula.
10. Public versus private portfolio information.
11. Prediction reward model.
12. Prestige asset catalogue and whether assets appreciate.
13. Inactive-player treatment.
14. Notification thresholds.
15. Final visual design system.
16. Final weekly award catalogue and selection algorithm.
17. Whether Stockpile remains private to one server or is architected from day one for multiple Discord servers.

These should be resolved before active feature implementation.

---

# 51. North Star

Stockpile succeeds if this happens naturally:

A real company reports earnings.

Its share price moves sharply.

One player's portfolio surges.

Another player's leveraged position gets crushed.

The first player overtakes them in the league.

The second receives a margin warning.

A third offers them a loan.

Friday arrives.

Stockpile posts the week's results and makes fun of all three of them.

Nobody had to write an event.

Nobody had to reset anything.

Nobody had to administer the game.

**The real market created the story.**

That is Stockpile.
