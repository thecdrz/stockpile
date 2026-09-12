# Stockpile Discord UX Specification

**Status:** Draft for Phase 0 specification freeze  
**Version:** 0.1  
**Scope:** Onboarding, one-command navigation, privacy, Discord-native interaction patterns, visual presentation, notifications, social surfaces, reporting UX, weekly awards, and failure/stale-state behavior.

Stockpile should feel like a small polished financial game embedded inside Discord, not a traditional command-driven bot.

The UX goal is simple:

> A player should need to remember one command, `/stockpile`, and should be able to do everything else by navigating the interface.

---

## 1. Platform Direction

Stockpile should target Discord's current **Components V2** interaction model rather than designing around legacy embed-only bot messages.

Discord currently supports richer native app layouts including:

- Containers
- Sections
- Text Displays
- Buttons
- String/User/Role/Channel selects
- Thumbnails
- Media Galleries
- Separators
- Modal text inputs
- Modal radio groups
- Modal checkbox groups
- Modal checkboxes
- Modal file uploads

Components V2 allows up to 40 total components in a message, but Stockpile should treat that as a ceiling, not a design target. Most Stockpile surfaces should remain well below it.

Official references:

- https://docs.discord.com/developers/components/overview
- https://docs.discord.com/developers/components/reference
- https://docs.discord.com/developers/components/using-message-components
- https://docs.discord.com/developers/platform/components

### 1.1 Native First

Stockpile should prefer native Discord components for:

- navigation
- selection
- confirmations
- forms
- lightweight summaries
- settings

Stockpile should use generated visual images/cards when they materially improve understanding or delight, especially for:

- charts
- Weekly Wrap
- monthly statements
- portfolio allocation
- career timeline
- league championship
- milestone celebrations
- bankruptcy/recovery events

The native interface remains functional even if an image-generation/rendering subsystem fails.

---

## 2. One-Command Requirement

The only normal player command a user must remember is:

`/stockpile`

It serves as the application launcher.

After launch, all normal player actions must be reachable through buttons, selects, modals, and navigable Stockpile surfaces.

Optional power-user commands may exist later, but:

- no feature may require them
- documentation should not assume players remember them
- all power-user actions must have an equivalent UI path from `/stockpile`

Administrative controls may be exposed only to authorized users through an Admin entry point inside the Stockpile UI or a separate restricted command if operationally necessary.

---

## 3. Private Workspace + Public Game Model

Stockpile has two presentation modes.

### 3.1 Private Player Workspace

Running `/stockpile` opens a personalized **ephemeral/private interaction surface** by default.

This is where the player sees and manages:

- exact cash
- exact holdings
- exact debt
- loan terms
- watchlists
- trade tickets
- reports
- settings
- credit details
- private alerts

Using a private workspace prevents the Discord channel from filling with dashboard navigation messages.

### 3.2 Public Stockpile Channel

Each Discord environment may configure one **Stockpile game channel** for social and automated output.

Examples:

- Monday Opening Bell
- Friday Weekly Wrap
- league standings
- championships
- major achievements
- selected milestones
- public challenges
- bankruptcy events
- player-shared portfolio/security cards

If no dedicated channel is configured, an administrator selects a permitted default channel during setup.

### 3.3 Share Intentionally

Private views that make sense socially should include a **Share** action.

Examples:

- share a stock card
- share a portfolio summary without holdings
- share an achievement
- share a career milestone
- share a chart

Sharing creates a sanitized public version rather than copying the private screen verbatim.

---

## 4. Information Visibility Defaults

Competition benefits from some public information and some secrecy.

### 4.1 Public by Default

The following are public game information:

- display name
- current financial status
- current career net worth
- league rank
- league percentage return
- weekly awards
- achievements
- championships
- selected career records
- bankruptcy count
- public milestones
- player-shared cards

### 4.2 Private by Default

The following are private unless explicitly shared or required to resolve a public event:

- exact career holdings
- exact career cash
- exact debt balances
- exact credit score number
- player loan contract terms
- watchlists
- pending orders
- personal monthly statements
- detailed transaction ledger
- margin calculations

The public profile may show the **credit letter rating** without exposing the numeric score.

### 4.3 League Holdings

During an active monthly league:

- each player's exact league holdings are private
- league net asset value and percentage return are public

After the league closes:

- final portfolio composition becomes available in the historical league report

This makes copying another player's active strategy less attractive while preserving post-game comparison.

### 4.4 No Hidden Economic Rules

Privacy never hides how a rule works.

Interest formulas, bankruptcy rules, margin thresholds, ranking rules, and award criteria remain documented even when individual player details are private.

---

## 5. First-Run Onboarding

A first-time player should be able to understand Stockpile without reading external documentation.

Target onboarding duration:

**60–120 seconds**

### 5.1 Step 1 — Welcome

After `/stockpile`, a player without an account sees:

**STOCKPILE**

> Real markets. Fake money. Questionable decisions.

Key facts:

- Starting career cash: 100,000 CAD in the initial private environment
- US and Canadian stocks/ETFs supported
- Money is fictional and has no real-world value
- Career progress persists
- A separate monthly league keeps competition fair

Actions:

- **Create Account**
- **How It Works**

### 5.2 Step 2 — Account Creation

Creating the account should require a single deliberate confirmation.

The confirmation should show:

- base currency
- starting cash
- starting status
- starting credit rating

No unnecessary questionnaire is required.

### 5.3 Step 3 — 60-Second Tour

After account creation, offer:

- **Take the Tour**
- **Skip — Show My Dashboard**

The tour is not mandatory.

The tour explains only five concepts:

1. **Trade real stocks with fake money.**
2. **Career wealth persists.**
3. **Monthly League starts everyone equal.**
4. **Debt and loans have real game consequences.**
5. **Friday Weekly Wrap is where everyone gets judged.**

### 5.4 Step 4 — First Market Discovery

The tour may present several recognizable securities plus Search.

This is not a recommendation engine.

Example choices may be based on:

- major US/Canadian securities
- broad ETFs
- current league-owned securities
- player search

Buttons/actions:

- **View a Stock**
- **Search Market**
- **Go Home**

Stockpile must not force the player to make a trade merely to finish onboarding.

### 5.5 First Trade Moment

When the player eventually completes their first trade:

- New Investor onboarding progress completes
- show the resulting position clearly
- explain average cost and current value briefly
- offer **View Portfolio** and **Home**

No additional tutorial popups should appear unless requested through Help.

---

## 6. Stockpile Home

Home is the most important surface in the product.

It should answer at a glance:

1. How wealthy am I?
2. How am I doing today?
3. Where do I rank?
4. Does anything need attention?
5. What can I do next?

### 6.1 Home Information Hierarchy

The recommended structure is:

#### Identity

Player name  
Financial status · Credit rating

#### Primary Number

**Net Worth**

with:

- today's absolute move
- today's percentage move

#### Compact Breakdown

- Portfolio
- Cash
- Prestige Assets
- Debt

#### Competition

- League rank
- Current league return
- gap to player above/below when useful

#### Attention Center

Show only actionable/relevant items.

Examples:

- Loan payment due tomorrow
- Margin health entered Elevated Risk
- A held company reports earnings tomorrow
- Limit order filled
- Credit rating changed
- League lead changed

Maximum visible Home attention items:

**3**

If more exist, show **View All Alerts**.

### 6.2 Primary Navigation

Top-level destinations:

- **Portfolio**
- **Trade**
- **Markets**
- **Bank**
- **League**
- **Reports**
- **Profile**
- **More**

Depending on Discord layout constraints, these may be represented using a combination of a primary select menu and a small set of context buttons rather than eight equal buttons.

### 6.3 Context Actions

Home may include one or two context-sensitive quick actions such as:

- **Buy Stock**
- **Pay Loan**
- **View Weekly Wrap**

Context actions must not cause navigation to become inconsistent.

---

## 7. Navigation Model

Every Stockpile flow should follow:

**Home → Area → Detail → Action → Confirmation/Result**

Examples:

- Home → Portfolio → NVDA → Sell → Confirm
- Home → Bank → Loans → Loan from Mark → Pay
- Home → League → Standings → Mark → Compare
- Home → Reports → Career → Net-Worth Timeline

### 7.1 Persistent Navigation Expectations

Every non-modal secondary surface provides obvious access to:

- **Back**
- **Home**

A player should never reach a dead-end screen requiring another slash command.

### 7.2 Stale Navigation

If a player leaves a Stockpile panel open and later interacts with it after the underlying state changed:

- never trust the old displayed numbers for mutation
- re-read current state
- revalidate authorization
- refresh or show a concise stale-state explanation

Example:

> That price/order state has changed. I refreshed the trade ticket before you continue.

Old panels may remain useful for navigation, but no stale panel may create a stale-price trade or duplicate financial action.

---

## 8. Portfolio UX

Portfolio should prioritize financial understanding over density.

### 8.1 Portfolio Summary

Show:

- market value
- cost basis
- unrealized gain/loss
- realized gain/loss
- today's movement
- available cash
- concentration warning if relevant

### 8.2 Allocation

A generated visual may show:

- top holdings
- cash
- sectors when reliable classification exists

Do not create an unreadable 18-slice pie chart.

Small holdings should collapse into **Other**.

### 8.3 Holdings List

Each row/card should show:

- ticker
- company
- current value
- today's move
- total return

Selecting a holding opens Security Detail.

### 8.4 Sorting

Holdings can be sorted by:

- value
- daily move
- total return
- ticker

The default is value descending.

---

## 9. Security Detail UX

Security Detail is a compact market terminal, not an encyclopedia.

Display:

- company name
- ticker
- exchange
- security type
- listing currency
- latest valid price
- daily absolute/percentage change
- quote timestamp/status
- compact price chart

If owned, also display:

- shares
- average cost
- position value
- unrealized return
- portfolio weight

Primary actions:

- **Buy**
- **Sell** if owned
- **Watch / Unwatch**
- **Chart**
- **Position Details** if owned

Market status should be explicit:

- Open
- Closed
- Halted
- Quote unavailable

---

## 10. Trade Flow

Trading must feel fast while still protecting against accidental or stale transactions.

### 10.1 Entry Paths

A player can enter Trade from:

- Home
- Portfolio
- Security Detail
- Watchlist
- Markets search

### 10.2 Search

Trade search accepts:

- company name
- ticker

When multiple listings exist, clearly show exchange and currency.

Example:

**SHOP · TSX · CAD**  
Shopify Inc.

**SHOP · NASDAQ · USD**  
Shopify Inc.

### 10.3 Trade Ticket

Trade ticket fields:

- Buy / Sell
- Market / Limit
- amount in base currency or share quantity
- optional limit price
- duration where applicable

Modal controls should use native radio/select inputs where supported.

### 10.4 Trade Preview

Before committing, show:

- security
- side
- estimated/current quote
- quote timestamp
- requested notional
- estimated shares
- FX rate/spread if applicable
- cash after trade
- position after trade
- warning if concentration crosses a defined threshold

For a closed market:

> This market order will queue for the next eligible market open. The execution price is not guaranteed.

### 10.5 Confirmation

Financial mutations require an explicit **Confirm** action.

Buttons:

- **Confirm Buy / Confirm Sell**
- **Cancel**

### 10.6 Result

After execution or queueing, show:

- status
- final/estimated amount
- position impact
- available cash

Actions:

- **View Position**
- **Portfolio**
- **Home**

---

## 11. Markets UX

Markets should help players find relevant action rather than recreate a general-purpose market website.

Sections:

- Search
- Watchlist
- League-owned securities
- Portfolio movers
- Broad US/Canadian market context
- Relevant earnings/events

### 11.1 Relevance First

For a 2–5 player server, a stock that affects two players matters more than the 30th-largest market mover nobody owns.

Default ordering should therefore prioritize:

1. owned/watchlisted securities
2. league-owned securities
3. major broad-market context
4. notable supported-market movers

### 11.2 No Recommendation Language

Stockpile displays facts and game context.

Avoid language such as:

- You should buy
- Strong opportunity
- Recommended stock

Playful commentary may discuss player behavior, not provide real financial advice.

---

## 12. Bank UX

Bank is the financial-life center.

Primary destinations:

- **My Debt**
- **Borrow**
- **Player Loans**
- **Send Money**
- **Credit**
- **Margin** when eligible

### 12.1 Borrow Screen

Show before any loan application:

- current credit rating
- available borrowing limit
- current system debt
- current player debt
- indicative APR
- maximum term

The player can inspect **Why this rate?** for an explanation of credit factors.

### 12.2 Loan Confirmation

A loan confirmation must make time-bound consequences difficult to miss.

Display:

- principal
- APR
- payment schedule
- first payment date
- maturity date
- total expected interest if held as scheduled

Prominent note:

> Debt continues while you're away from Discord.

### 12.3 Player Loan Offer

Lender flow:

Bank → Player Loans → **Offer Loan**

Select borrower using Discord User Select.

Configure:

- principal
- APR
- term
- repayment style

Preview should show the borrower status/credit rating and lender exposure after the loan.

### 12.4 Receiving a Loan Offer

Exact loan terms are private by default.

Preferred delivery:

1. private Discord DM from Stockpile when permitted
2. if DM is unavailable, a minimal public addressed notification in the Stockpile channel with an **Open Offer** control restricted to the intended borrower

Public fallback must not expose principal/APR unless both players intentionally share the contract.

### 12.5 Loan Actions

An active loan detail screen supports context-appropriate actions:

Borrower:

- Pay Now
- View Schedule
- Request Restructure

Lender:

- View Schedule
- Offer Extension
- Restructure
- Forgive Interest
- Forgive Principal

Actions require appropriate confirmation.

---

## 13. Credit UX

Credit should feel meaningful without pretending to be a real consumer credit bureau.

Credit screen shows:

- letter rating
- numeric score
- previous rating if recently changed
- borrowing limit
- indicative system APR
- margin eligibility

### 13.1 Why Did My Credit Change?

Show recent credit events such as:

- +3 system loan repaid on time
- −4 margin call
- −5 delinquent payment

This explanation is mandatory whenever a rating changes.

Do not use vague statements such as "your financial behavior affected your score."

---

## 14. Margin UX

Margin is deliberately gated and should look more dangerous than ordinary borrowing.

First-time enablement requires a dedicated explanation and confirmation.

Margin screen shows:

- margin debt
- margin-supported portfolio value
- account equity
- current equity ratio
- current state
- next warning threshold
- next liquidation threshold
- daily accrued margin interest

### 14.1 Margin State Presentation

Healthy — neutral/positive  
Elevated Risk — warning  
Margin Call — urgent  
Forced Liquidation — critical

Never rely on colour alone; always display the state label and numbers.

### 14.2 Margin Call

Margin Call view must answer:

- why the call exists
- current ratio
- required target ratio
- estimated amount of cash/position reduction needed
- deadline
- what happens if unresolved

Available actions may include:

- Sell Holdings
- Repay Margin
- View Portfolio

---

## 15. Gifts / Send Money UX

Bank → **Send Money**

Flow:

1. select player
2. enter amount
3. optional short note
4. preview transfer
5. confirm

The confirmation should state that a gift:

- is permanent
- does not create debt
- affects net worth
- does not count as investment performance

Blocked transfers must explain the exact economic rule preventing them.

---

## 16. Predictions and Challenges UX

Predictions should feel like a social side game, not the main navigation focus.

Entry points:

- Markets
- League
- More → Predictions

### 16.1 Prediction

A no-stake prediction displays:

- market question
- choices
- lock time
- settlement basis

### 16.2 Challenge

A player can create a standardized head-to-head challenge.

Public challenge cards are encouraged because they create conversation.

Example:

**Scott challenged Mark**

> Which performs better this week: AMD or NVDA?

Scott: AMD  
Mark: waiting

**Accept Challenge**

Optional equal cash stakes use career cash under Economy Spec limits.

The card should clearly show when the challenge locks and how it settles.

---

## 17. League UX

League is primarily social/public.

### 17.1 League Home

Show:

- current month
- time remaining
- player's return/rank
- benchmark return
- standings

Example:

1. Mark +8.2%
2. Scott +5.4%
3. Dan −1.7%

Exact active holdings remain hidden.

### 17.2 Player Comparison

Selecting another player offers **Compare**.

During active league, comparison may show:

- return
- rank
- max drawdown
- cash percentage
- number of trades
- benchmark difference

but not exact holdings.

### 17.3 League Close

At month-end:

- final standings become immutable
- champion is announced publicly
- final portfolios become inspectable historically
- career trophy/records update
- next league starts automatically according to scheduler rules

---

## 18. Reports UX

Reports is a major product area, not an afterthought.

Primary categories:

- **Today**
- **Week**
- **Month**
- **Portfolio**
- **Performance**
- **Transactions**
- **Income**
- **Debt & Credit**
- **Career**

### 18.1 Portfolio Report

Show:

- net worth
- portfolio value
- cash
- debt
- prestige asset value
- unrealized P/L
- realized P/L
- allocation
- concentration

### 18.2 Performance Report

Selectable periods:

- Day
- Week
- Month
- Year
- All Time

Show:

- investment return
- benchmark return
- difference
- league/friend comparison when meaningful

### 18.3 Transactions

Ledger UX supports filters:

- Trades
- Dividends
- Interest
- Loans
- Gifts
- Assets
- Corporate Actions
- Bankruptcy

Each entry may be expanded to show exact accounting details.

### 18.4 Debt & Credit

Show:

- total debt
- system debt
- player debt
- loans receivable
- next payments
- interest paid/received
- credit history

### 18.5 Career

Show:

- current and peak net worth
- all-time market return
- best/worst trade
- championships
- bankruptcies
- highest status achieved
- notable achievements
- weekly award counts

---

## 19. Net-Worth Timeline

Career Reports should include a generated visual net-worth chart.

The timeline may annotate:

- first 100K / 250K / 500K / 1M / higher milestones
- league championships
- large loans
- margin calls
- bankruptcy
- recovery
- new all-time high

Annotations should be sparse enough to remain readable.

The detailed event list remains available separately.

---

## 20. Monthly Statement UX

Monthly statements are private by default.

A statement should feel like a polished financial-game summary rather than a raw database export.

Recommended sections:

- opening net worth
- closing net worth
- net change
- investment return
- benchmark comparison
- realized/unrealized contribution
- dividends
- interest received
- interest paid
- debt change
- prestige activity
- best/worst position
- league result
- milestones
- net-worth chart

Actions:

- **Share Summary**
- **Transactions**
- **Career**
- **Home**

Share Summary omits private holdings/debt details unless explicitly selected.

---

## 21. Monday Opening Bell

A concise public Opening Bell appears on the first supported trading day of the week.

It should not attempt to summarize the entire financial world.

Candidate content:

- current league leader/gap
- relevant earnings for securities owned/watchlisted by players
- player loan/payment deadlines this week without revealing private terms
- players near career milestones
- unusual market schedule/holiday notes

Recommended maximum:

**5 short items**

If nothing interesting exists, Stockpile may post only league standings and market schedule or skip the briefing rather than manufacture filler.

---

## 22. Friday Weekly Wrap

The Weekly Wrap is a core social retention mechanic.

It posts publicly after the final relevant market session of the week has closed and official weekly values can be calculated.

### 22.1 Weekly Wrap Structure

Recommended visual hierarchy:

1. **Stockpile — Weekly Wrap**
2. Week/date range
3. League standings
4. Career performance summary
5. 5–8 dynamic awards
6. milestones/status/credit movement if interesting
7. brief closing line

A generated image card is preferred for the hero summary, accompanied by native components/text for accessibility and navigation.

### 22.2 Always-Eligible Core Awards

#### Trader of the Week

Highest qualifying weekly investment return among active players.

Requires at least one invested position during the week.

#### Best Trade

Completed trade with the strongest realized or marked-to-week-end percentage outcome, subject to minimum notional/impact thresholds.

#### Biggest Bag

Most materially damaging position/trade for the week, subject to minimum thresholds.

### 22.3 Conditional Awards

#### Diamond Hands

Eligible when a held position experiences at least an 8% drawdown from the player's relevant weekly reference price and the player continues holding through the drawdown; award only if the position later recovers at least half of that drawdown by week-end or produces a positive player outcome.

#### Paper Hands

Eligible when a player sells at least half of a position and the security subsequently rises at least 8% before week-end, with the avoided gain large enough to exceed 0.5% of the player's opening weekly net worth.

#### YOLO Award

Highest single-security concentration, provided concentration reached at least 50% of invested portfolio value.

#### Cash Goblin

Highest average cash allocation, provided average cash exceeded 60% and the configured benchmark finished the week at least +2%.

#### Comeback Kid

Largest recovery from an intraweek portfolio drawdown of at least 5%, provided at least 70% of that drawdown was recovered by week-end.

#### Perfect Entry

A qualifying buy executed within 2% of that security's weekly low and still materially held at week-end.

#### Perfect Exit

A qualifying sell executed within 2% of that security's weekly high.

#### Market Beater

Player weekly investment return exceeds the configured benchmark by at least 2 percentage points.

#### Contrarian

Exactly one player finishes positive while at least two other active players finish negative.

#### Dividend Leader

Highest qualifying dividend/distribution income that week.

#### Debt Collector

Highest player-loan interest actually received that week.

#### Loan Shark

Largest performing player-loan receivable exposure relative to net worth, provided exposure exceeds 20%.

#### Most Active

Highest number of qualifying trades, minimum 5 trades.

#### Quiet Week

Zero trades during a week in which the player remained eligible/active.

#### Worst Timing Imaginable

A qualifying buy or sell is followed within two trading days by an adverse move of at least 8%, with meaningful account impact.

#### Uh Oh

Player came closest to a margin call without entering forced liquidation.

#### Survivor

Player entered Margin Call or severe distress and recovered during the same week without forced liquidation or bankruptcy.

### 22.4 Award Selection Algorithm

Stockpile should not print every eligible award.

Process:

1. Generate all award candidates from deterministic weekly statistics.
2. Remove candidates that fail minimum impact/quality thresholds.
3. Assign each candidate an **interest score** based on magnitude, rarity, and account impact.
4. Always include Trader of the Week when qualifying competition exists.
5. Select the highest-interest remaining candidates until reaching 5–8 total awards.
6. Prefer category variety: performance, timing, risk, cash/debt, social finance.
7. Avoid more than 3 awards for one player when similarly interesting candidates exist for others.
8. If fewer than 5 genuinely interesting candidates exist, publish fewer rather than invent weak awards.

All award decisions must be reproducible from stored weekly statistics.

### 22.5 Career Recording

Award counts become permanent career statistics.

Both flattering and embarrassing awards are retained.

---

## 23. Notification Policy

Stockpile should be informative without becoming noisy.

### 23.1 Critical — Immediate Private Alert

Examples:

- Margin Call
- Forced Liquidation
- Loan Default
- Bankruptcy initiated
- unrecoverable trade/settlement issue requiring player awareness

Delivery:

- DM when available
- dashboard Attention Center
- optional public social event only where explicitly defined

### 23.2 Important — Private Alert

Examples:

- payment due within 24 hours
- credit letter rating changed
- owned security affected by material corporate action
- margin state entered Elevated Risk
- loan offer received

### 23.3 Interesting — Selective

Examples:

- career milestone
- major league rank change
- achievement
- unusually large portfolio impact from a single market move

For automatic public market-impact alerts, default threshold should require at least one of:

- security move of 15% or more in one session and owned by a player, or
- estimated impact of 5% or more of a player's career net worth

Public market-impact alerts are capped at **3 per trading day** per Stockpile environment and deduplicated by underlying market event/security where possible.

### 23.4 Routine — Dashboard Only

Examples:

- normal price moves
- ordinary filled orders
- routine dividend receipt
- everyday watchlist activity

Routine events do not generate unsolicited pings.

### 23.5 Player Preferences

Players may reduce non-critical notifications.

Critical financial notices cannot be fully disabled while the player has active time-bound debt or margin exposure, although delivery channels may be configured where Discord permits.

---

## 24. Public Social Events

The following may produce tasteful public cards:

- league championship
- major career wealth milestone
- rare achievement
- bankruptcy
- comeback milestone
- accepted public challenge
- player-shared report/card

Ordinary borrowing, exact loan terms, gifts, and exact debt should not be publicized automatically.

### 24.1 Bankruptcy Tone

Bankruptcy may be funny, but the UI must first be clear.

Example ordering:

1. **BANKRUPTCY — MARK**
2. precise financial result
3. what was liquidated/discharged
4. recovery status
5. one playful closing line

Never bury the actual consequence under a joke.

---

## 25. Player Profile

Public profile should tell a career story.

Recommended public fields:

- status
- net worth
- credit letter rating
- league championships
- peak net worth
- bankruptcies
- best weekly return
- worst weekly return
- weekly award counts
- selected prestige assets
- selected achievements

Private self-view adds:

- exact credit score/history
- holdings
- debt
- private loan details
- detailed performance

Profile should support **Compare with Player**.

---

## 26. Prestige Assets UX

Prestige assets should feel like trophies, not inventory spreadsheet rows.

The Assets view should emphasize:

- large visual item card
- purchase price
- current resale value
- ownership date
- collection/tier

Before purchase, clearly show:

- cash after purchase
- immediate effect on recognized net worth due to resale valuation

High-tier assets may appear on the player's public profile.

---

## 27. Visual Design System

Visual quality is a first-class product requirement.

### 27.1 Visual Personality

Target feeling:

- modern financial game
- premium but not sterile
- playful in copy, disciplined in numbers
- dark/charcoal visual cards
- restrained use of colour
- crisp typography
- strong hierarchy
- clean charts
- minimal clutter

Avoid:

- casino aesthetics
- neon-everything crypto styling
- giant walls of emoji
- dense Bloomberg-terminal imitation
- generic Discord embed walls

### 27.2 Colour Semantics

Generated visual cards should use consistent semantic colours:

- positive: green
- negative: red
- warning: amber
- neutral/information: blue or neutral accent
- prestige/achievement: gold

Colour is never the only carrier of meaning. Use signs, arrows, labels, and text.

### 27.3 Typography

Generated assets should use:

- large primary financial number
- smaller contextual label
- tabular/monospaced numerals where useful
- restrained number of font sizes

Do not squeeze dense tables into image cards on mobile.

### 27.4 Charts

Charts must include enough context to understand them without hover.

Price/net-worth charts should normally show:

- timeframe
- start/end value
- percentage change
- notable event markers when relevant

Avoid decorative chart noise.

### 27.5 Visual Rendering Is Deterministic

Weekly/monthly/achievement visuals should come from templates and data.

Generative AI is not required for routine presentation.

---

## 28. Core Visual Surface Catalogue

The final UI review must storyboard at minimum:

1. First-run Welcome
2. Stockpile Home
3. Portfolio Summary
4. Security Detail
5. Trade Search
6. Trade Ticket
7. Trade Confirmation
8. Trade Result
9. Markets Overview
10. Watchlist
11. Bank Home
12. Borrow Offer
13. Active Debt Detail
14. Player Loan Offer
15. Player Loan Received
16. Credit Detail
17. Margin Detail
18. Margin Call
19. Send Money
20. League Standings
21. Player Comparison
22. Predictions/Challenge
23. Reports Home
24. Portfolio Report
25. Performance Report
26. Transaction Ledger
27. Monthly Statement
28. Career Timeline
29. Public Player Profile
30. Prestige Asset Detail
31. Monday Opening Bell
32. Friday Weekly Wrap
33. Achievement
34. Milestone
35. Bankruptcy
36. Recovery
37. Error/Stale Data
38. Settings
39. Admin Operations

Implementation must not invent major navigation patterns outside this catalogue without updating the UX specification.

---

## 29. Error and Degraded-State UX

Financial software-style errors must be explicit.

### 29.1 Market Data Unavailable

Never display a guessed trade price.

Example:

> **Trading temporarily unavailable for NVDA**
> The latest executable quote could not be verified. Your portfolio is unchanged.

Actions:

- Refresh
- Back
- Home

### 29.2 Provider Outage

If broad market data is unavailable:

- Home may show last-known portfolio value labeled with timestamp
- trading is suspended where required
- non-market actions may remain available

### 29.3 Duplicate Click

Financial actions must be idempotent.

If a user double-clicks Confirm:

> This transaction was already submitted.

Show the existing result rather than creating another transaction.

### 29.4 Permission Failure

If a public button is intended for another player:

> This offer belongs to Mark.

Do not expose private details.

---

## 30. Settings UX

Player settings are reachable from:

Home → More → Settings

Player settings may include:

- non-critical DM notifications
- public milestone sharing preference where optional
- report density
- chart timeframe defaults
- playful commentary level if individual override is permitted

Environment/admin settings include:

- Stockpile public channel
- base currency
- primary benchmark
- bot tone: Professional / Playful / Unhinged
- Monday Opening Bell enabled/disabled
- Friday Weekly Wrap enabled/disabled
- admin role/users

Core economy rules should not be casually exposed as per-player settings.

---

## 31. Tone

Default environment tone:

**Playful**

Tone rules:

- jokes target game decisions, not personal traits
- never obscure important financial information
- critical events become clear before funny
- repeated jokes should rotate through a deterministic template library
- avoid pretending the bot is providing real financial advice

Example:

> **Paper Hands**
> Scott sold AMD on Tuesday. AMD then gained 11.4%.
> An inspiring commitment to avoiding profit.

---

## 32. Interaction Security and Authorization

Every financial interaction must revalidate:

- Discord user identity
- Career/League account ownership
- intended recipient when applicable
- current balance
- current reservations
- current security quantity
- current credit/margin state
- current quote freshness
- idempotency key

UI state is never authorization state.

A button that visually says **Sell 10 shares** does not grant permission to sell if the user no longer owns 10 shares when clicked.

---

## 33. Mobile Requirement

Every primary flow must be usable from Discord mobile.

Therefore:

- avoid overly wide generated tables
- use concise action labels
- put the most important number first
- keep generated report text readable on small screens
- provide accessible text alongside visual images
- do not require hover

Desktop may show richer visuals, but mobile must not become a second-class experience.

---

## 34. UX Decisions Frozen by This Draft

Unless reopened during Phase 0 review:

1. `/stockpile` is the single required player command.
2. The normal dashboard is private/ephemeral.
3. A configured Stockpile channel hosts scheduled/public social content.
4. Components V2 is the preferred Discord UI foundation.
5. Exact career holdings/cash/debt remain private by default.
6. Career net worth, financial status, league rank/return, achievements, and major records are public by default.
7. Active league holdings remain hidden until league close.
8. Weekly Wrap is a core public social surface.
9. Monthly statements are private by default.
10. Loan terms are private by default.
11. Public challenges are encouraged; private financial contracts are not automatically exposed.
12. Critical debt/margin events generate immediate private alerts.
13. Routine market movement does not ping players.
14. Public automatic market-impact alerts require material thresholds and are capped.
15. Stockpile uses deterministic visual templates and deterministic humour for routine output.
16. The Weekly Wrap selects 5–8 genuinely interesting awards rather than listing every possible category.
17. Major UI surfaces must be storyboarded before feature implementation.

---

## 35. UX North Star

A successful Friday experience looks like this:

- nobody remembers a list of bot commands
- each player can privately open Stockpile and understand their financial state in seconds
- exact holdings and debt remain private unless shared
- league standings remain visible and competitive
- the market creates a few meaningful stories during the week without channel spam
- Friday's public Weekly Wrap turns those stories into a polished, funny recap
- tapping the recap leads naturally back into the game

The interface should make Stockpile feel like an application living inside Discord, not text commands wearing a nicer coat.
