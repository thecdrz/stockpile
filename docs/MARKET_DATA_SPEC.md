# Stockpile Market Data Specification

**Status:** Synthetic provider contract frozen; production provider selection remains gated on licensing confirmation
**Version:** 0.1  
**Scope:** Security universe, provider abstraction, quote freshness, execution pricing, FX, calendars, dividends, corporate actions, outages, data retention, and provider-selection criteria.

Stockpile uses the real market as its economic engine. Market data is therefore not decorative content; it is authoritative game input.

The core principle is:

> Stockpile may delay a transaction when trustworthy data is unavailable, but it must never invent a price.

---

## 1. Launch Security Universe

Launch support is intentionally narrower than whatever a provider happens to expose.

### United States

Supported:

- NYSE-listed common stocks
- NASDAQ-listed common stocks
- NYSE/NASDAQ-listed ETFs

### Canada

Supported:

- Toronto Stock Exchange (TSX) common stocks
- TSX-listed ETFs

Initially excluded:

- TSX Venture Exchange
- Canadian Securities Exchange
- OTC securities
- preferred shares
- mutual funds
- options
- futures
- crypto
- bonds
- leveraged/inverse ETFs
- other derivatives

A later release may broaden the universe only after the same corporate-action, licensing, execution, and data-quality guarantees are available.

---

## 2. Market Data Is a Licensed Dependency

Stockpile must not assume that paying for an API subscription automatically grants the right to display that provider's data to Discord users.

Before production launch, the selected provider must explicitly permit the intended use:

- one private Discord server
- approximately 2–5 human players initially
- non-commercial game use
- display of quotes/charts/security information to those players
- storage of enough normalized data to settle trades and reconstruct financial history
- derived portfolio/league statistics and visual reports

### 2.1 Release Gate

Production launch is blocked until Stockpile has either:

1. a provider plan/agreement whose published terms clearly allow the use, or
2. written confirmation/license from the provider covering the use.

Stockpile will not evade display/redistribution restrictions by:

- scraping finance websites
- using unofficial/private endpoints
- rotating free API keys
- disguising redistributed quotes as derived game data
- relying on undocumented tolerance from a provider

### 2.2 Why This Is Explicit

As of September 2026:

- EODHD personal-use terms prohibit sharing, retransmitting, redistributing, or displaying its information to others.
- Twelve Data states that individual plans do not permit redistribution to third parties.
- Financial Modeling Prep states that displaying/redistributing its data requires a specific Data Display and Licensing Agreement.

Reference material reviewed during Phase 0:

- https://eodhd.com/financial-apis/terms-conditions
- https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage
- https://site.financialmodelingprep.com/pricing-plans
- https://site.financialmodelingprep.com/terms-of-service

Licensing terms can change; provider compliance must be rechecked before purchase/launch.

---

## 3. Provider Abstraction

No game-domain code should call a market-data vendor directly.

Stockpile uses a provider interface that exposes normalized capabilities.

Conceptual interface:

```text
searchSecurities(query)
getSecurity(securityId)
getQuote(securityId)
getQuotes(securityIds)
getIntradayBars(securityId, start, end, interval)
getDailyBars(securityId, start, end)
getFxQuote(base, quote)
getMarketStatus(mic)
getExchangeCalendar(mic, range)
getDividends(securityId, range)
getSplits(securityId, range)
getCorporateActions(securityId, range)
getEarningsCalendar(securityIds, range)
getSymbolChanges(range)
getDelistedSecurities(range)
```

Capabilities may come from more than one licensed provider, but the game engine sees one normalized interface.

### 3.1 Capability Declaration

Each adapter declares supported capabilities and freshness.

Example:

```text
US_QUOTES = REALTIME
CA_QUOTES = DELAYED_15_MIN
FX = DELAYED_1_MIN
DIVIDENDS = DAILY
SPLITS = DAILY
MARKET_CALENDAR = AUTHORITATIVE
```

Game behavior is driven by declared capability, not vendor name.

---

## 4. Security Identity

Ticker symbols are not permanent identities.

Stockpile assigns every supported listing an immutable internal `security_id`.

Normalized security metadata should include where available:

- internal security ID
- current ticker
- historical ticker aliases
- company/fund name
- security type
- exchange
- MIC
- listing currency
- country
- ISIN
- FIGI/share-class FIGI if licensed/available
- active/delisted status
- provider identifiers
- first/last supported date

### 4.1 Cross-Listed Securities

The same company listed in Canada and the United States is treated as two tradable listings.

Example conceptually:

- SHOP · XTSE · CAD
- SHOP · XNAS · USD

They have separate listing IDs, prices, currencies, and positions.

### 4.2 Ticker Changes

A ticker change does not create a new economic holding when the underlying listing remains the same.

The internal security ID remains stable and the new ticker becomes current display metadata.

---

## 5. Symbol Directory Synchronization

Stockpile maintains a local normalized directory of eligible securities.

Refresh schedule:

- incremental refresh daily before market open
- full reconciliation at least weekly

The sync detects:

- newly listed securities
- delistings
- ticker changes
- security-type changes
- provider identifier changes

A newly discovered security is not automatically enabled for trading until it passes Stockpile's universe eligibility rules.

---

## 6. Quote Model

Every normalized quote used by Stockpile contains enough metadata to assess trustworthiness.

Required fields:

```text
security_id
price
currency
market_timestamp
provider_received_at
stockpile_received_at
freshness_class
bid (optional)
ask (optional)
last_trade (optional)
source_provider
source_reference/hash
```

### 6.1 Two Clocks

Stockpile distinguishes:

- **market timestamp** — when the market observation actually occurred
- **receipt timestamp** — when Stockpile received it

This distinction is critical for delayed feeds.

### 6.2 Display Label

The UI must clearly identify delayed or stale data.

Examples:

- Real-time
- Delayed ~15 min
- Last updated 10:43 AM ET
- Stale — trading unavailable

---

## 7. Freshness Classes

Normalized freshness classes:

- `REALTIME`
- `DELAYED`
- `END_OF_DAY`
- `STALE`
- `UNAVAILABLE`

### 7.1 Real-Time Trading Freshness

During an open session, a real-time executable quote is considered fresh by default when:

```text
now - market_timestamp <= 30 seconds
```

The exact threshold is configurable per provider/feed.

### 7.2 Delayed Feed Freshness

For a declared 15-minute delayed feed, Stockpile expects observations to arrive within a configured tolerance beyond the advertised delay.

Example default:

```text
expected delay: 15 minutes
tolerance: 5 minutes
```

A quote older than the declared delay plus tolerance is stale.

### 7.3 Valuation Versus Trading

A stale last-known quote may be used for a clearly labeled estimated portfolio display when no better data is available.

A stale quote may **not** be used to execute a trade.

Margin liquidation and bankruptcy valuation that depend on securities prices must pause rather than act on materially stale pricing unless a separate explicit emergency valuation rule applies.

---

## 8. Execution Principle

A market order must never execute against a market observation that occurred before the player submitted the order simply because the provider feed is delayed.

This is the central anti-stale-price rule.

### 8.1 Real-Time Feed Execution

For a certified real-time feed, a market order executes using the first eligible executable market observation received after order acceptance where:

```text
market_timestamp >= order_accepted_at
```

The specific price field used (trade, midpoint, ask/bid, provider execution proxy) must be defined by the selected feed before release.

### 8.2 Delayed Feed Execution

Delayed data is acceptable for gameplay only if settlement waits for a market observation whose **market timestamp is at or after the order acceptance time**.

Example:

- Provider delay: 15 minutes
- Player submits market buy: 10:15 ET
- Stockpile may display a 10:00 delayed quote for context
- Stockpile does **not** execute at the 10:00 quote
- The order remains Pending Verified Price
- When the provider later delivers an observation representing 10:15 ET or later, that observation becomes eligible for execution

This prevents a player from looking at a current live quote elsewhere and buying from Stockpile at a known stale price.

The trade may therefore take roughly the provider delay to settle.

### 8.3 UX Requirement

When delayed execution applies, the confirmation explicitly states:

> This market uses delayed data. Your order will settle when Stockpile receives a verified market price from at or after your submission time. The displayed delayed price is not your guaranteed execution price.

---

## 9. Market Orders Outside Trading Hours

A market order accepted while the exchange is closed becomes `PENDING_MARKET_OPEN`.

Execution uses the first eligible observation from the next regular session whose market timestamp is at or after the official session open.

The player does not receive the previous close as an execution price.

Cash/shares are reserved according to the Economy Spec.

---

## 10. Limit Order Resolution

Limit orders require ordered intraday observations after the order becomes active.

### 10.1 Real-Time Feed

A limit order may fill when an eligible quote/trade crosses the limit according to the defined execution model.

### 10.2 Delayed Intraday Feed

A delayed limit order is evaluated only after Stockpile receives market observations/bars covering times after the order became active.

Stockpile never looks backward into already-known price history and pretends the order had been active earlier.

### 10.3 Bar-Based Fallback

If the licensed feed supplies bars rather than trade/quote events, a deterministic fill model may use the first post-order bar that crosses the limit.

Default conservative rule:

- buy limit fills at the limit price when bar low <= limit
- sell limit fills at the limit price when bar high >= limit

If a bar opens through the limit in the player's favor, the configured model may use the bar open rather than the limit, but this rule must be consistent and tested.

### 10.4 Corporate Actions

Open limit orders affected by a split, merger, ticker replacement, or similar action are cancelled rather than silently transformed unless the corporate-action spec explicitly defines safe adjustment.

---

## 11. Price Precision

Provider price precision is preserved internally.

Stockpile uses decimal arithmetic, never binary floating-point, for transaction accounting.

UI rounding must not alter the underlying trade value.

---

## 12. FX Data

The initial private environment uses CAD as its base currency.

USD securities therefore require USD/CAD conversion.

Required FX capabilities:

- current USD/CAD quote
- historical USD/CAD observations for transaction reconstruction/reporting
- market timestamp
- freshness metadata

### 12.1 FX Execution

For a foreign-security transaction, Stockpile records:

- security execution price in listing currency
- gross listing-currency amount
- authoritative FX rate
- FX market timestamp
- configured Stockpile spread
- final base-currency amount

### 12.2 FX Freshness

Default maximum FX age for a new trade:

**5 minutes**

unless the selected provider declares a different supported freshness target.

If FX is unavailable/stale, a cross-currency trade does not execute.

---

## 13. Exchange Calendars

Stockpile requires authoritative calendars for each supported MIC.

Launch MICs are expected to include:

- XNYS
- XNAS
- XTSE

Calendar data must represent:

- regular trading sessions
- holidays
- early closes
- exceptional closures when published
- timezone
- daylight-saving transitions

Stockpile must not approximate holidays using "Monday through Friday except common holidays" logic.

### 13.1 Time Zones

US and Canadian launch markets are modeled in their authoritative exchange timezone, generally Eastern Time for these listings.

Stored event timestamps are UTC plus explicit market timezone/context where needed.

### 13.2 Weekly Boundaries

The Weekly Wrap waits until the final relevant supported regular session for the week has completed and market data needed for official valuation is available.

---

## 14. Market Status

Normalized market states:

- PREMARKET (informational only at launch)
- OPEN
- HALTED
- CLOSED
- EARLY_CLOSED
- UNKNOWN

Stockpile launch trading occurs during regular sessions only.

Premarket and after-hours data may be displayed if licensed but do not create launch-version trade executions.

---

## 15. Trading Halts

When a security is halted:

- new market/limit orders are rejected or held according to order state
- existing unfilled limit orders remain pending unless the venue/provider rules require cancellation
- no synthetic fill occurs
- portfolio value may continue showing the last known valid price with a Halted label

Trading resumes only when the provider reports a valid reopened state/observation.

---

## 16. Daily Close

Stockpile distinguishes:

- raw/unadjusted market close
- adjusted historical close

### 16.1 Accounting

Holdings/accounting use actual corporate-action events plus unadjusted transaction economics.

### 16.2 Charts

Long-term price charts may use adjusted historical series so splits do not appear as false crashes.

The chart must not be used as the accounting ledger.

### 16.3 Official Weekly/Monthly Valuation

Official period-end valuations use the final valid regular-session close after corporate-action processing for the effective date.

---

## 17. Dividends and ETF Distributions

The provider must expose enough data to identify at minimum:

- security
- ex-date
- amount per share/unit
- currency
- payment date where available
- record/declaration dates where available
- event identifier/source

### 17.1 Entitlement Rule

For game purposes, entitlement is based on eligible quantity held at the close of the trading session immediately preceding the ex-date.

Stockpile does not model brokerage settlement timing separately at launch.

### 17.2 Late Event Arrival

If a provider publishes/corrects a dividend after its intended processing date:

- Stockpile processes it when verified
- ledger entries retain the true effective date and actual processing timestamp
- the monthly/weekly reporting engine may issue a correction marker if the affected period was already closed

No event is silently back-edited.

---

## 18. Stock Splits and Reverse Splits

Required event fields:

- effective date
- ratio
- security identity
- provider event ID

Processing:

```text
new_quantity = old_quantity × ratio
new_average_cost = old_average_cost / ratio
```

Economic value should remain equivalent aside from normal market movement and rounding.

Fractional quantities are supported, so Stockpile does not need to simulate broker cash-in-lieu solely because a split produces a fraction.

Open orders are cancelled and players are notified.

---

## 19. Ticker/Symbol Changes

A pure symbol change:

- preserves the internal security ID
- preserves quantity
- preserves cost basis
- updates display symbol/history
- does not create realized gain/loss

Reports referencing older dates may display the historical ticker with the current identity available on detail views.

---

## 20. Mergers and Acquisitions

Stockpile supports deterministic corporate-action terms when the provider supplies sufficient structured data.

### 20.1 Cash Acquisition

On effective settlement:

- position is removed
- cash consideration is credited per eligible share
- gain/loss is realized against cost basis
- security becomes non-tradable/delisted when appropriate

### 20.2 Stock-for-Stock Acquisition

If an exchange ratio is supplied:

- old position is removed
- new security position is created using the defined ratio
- cost basis transfers according to the game corporate-action accounting rule

### 20.3 Mixed Consideration

Cash + stock actions apply both components.

The normalized action must include the percentage of the old aggregate cost basis allocated to replacement stock. The remaining basis is allocated to cash consideration. If this allocation is absent or contradictory, the terms are incomplete and the action enters `CORPORATE_ACTION_REVIEW`; Stockpile does not invent a tax-style allocation.

### 20.4 Incomplete Terms

If provider data identifies a merger/acquisition but lacks trustworthy settlement terms:

- affected security becomes `CORPORATE_ACTION_REVIEW`
- trading is suspended
- no guessed conversion is applied
- administrators are alerted

This is an allowed zero-touch exception because incorrect merger settlement can corrupt permanent wealth.

---

## 21. Spin-Offs

When a structured spin-off ratio is available:

- parent position remains/adjusts as defined
- child position is created at the supplied ratio

Game cost-basis allocation:

1. use provider-supplied allocation when available and trustworthy
2. otherwise allocate original cost basis proportionally using parent/child fair market values from the first jointly tradable valid close after the spin-off

The chosen basis method is stored on the corporate-action ledger entry.

---

## 22. Delisting

Delisting is not automatically equivalent to a zero-value bankruptcy.

When delisting is confirmed:

- new trading is disabled
- open orders are cancelled
- position remains until a cash/stock settlement, new listing mapping, or terminal-value event is known

If a security becomes worthless through an authoritative bankruptcy/liquidation event, the position may be written to zero through a specific corporate-action event.

Stockpile never writes a position to zero merely because a quote disappeared.

---

## 23. Company Bankruptcy

A real company bankruptcy may have multiple stages.

Stockpile distinguishes:

- bankruptcy filing
- trading halt/delisting
- reorganization/new security
- final liquidation/cancellation

A filing alone does not necessarily set the holding value to zero.

The provider/corporate-action pipeline determines the economic event.

When data is insufficient, trading remains suspended and the position is quarantined for review rather than guessed.

---

## 24. Earnings Calendar

Earnings information is a gameplay-context feature, not execution-critical market data.

Desired fields:

- security
- expected/report date
- time of day if known (before open/after close)
- confirmed/estimated status if supplied

Earnings feed drives:

- Monday Opening Bell relevance
- Home attention items

It does not directly alter prices or generate fictional earnings reactions.

If earnings data is unavailable, trading continues normally; only the contextual alert is omitted.

---

## 25. Market Benchmarks

The environment has one primary benchmark used for awards/performance comparisons.

For the initial CAD environment, target benchmark is a broad S&P/TSX Composite-compatible index or licensed proxy.

The selected provider must permit the benchmark data to be displayed/used under the same license.

If direct index redistribution is restricted, Stockpile may use a licensed broad-market ETF proxy if documented before release.

---

## 26. Data Caching and Retention

The selected license must explicitly permit the data retention needed to operate the game.

Stockpile should minimize retained raw vendor payloads.

Persist normalized data necessary for:

- executed trade evidence
- daily official valuations
- corporate actions
- FX execution
- financial reports
- audit/reconciliation

### 26.1 Execution Evidence

Each executed trade stores at minimum:

- provider identity
- provider symbol/reference
- market timestamp
- Stockpile receipt timestamp
- normalized execution price
- listing currency
- FX observation if applicable
- feed freshness class
- source event/response hash where permitted

This allows a future audit without depending on a mutable external API response.

### 26.2 License-Aware Retention

Provider adapters expose retention constraints.

A provider whose terms prohibit Stockpile from retaining the minimum evidence required for an auditable permanent economy is unsuitable for production.

---

## 27. Data Corrections

Providers may correct historical data.

Stockpile does not silently rewrite completed transactions after the fact.

### 27.1 Display/Chart Corrections

Historical chart caches may refresh to corrected data if licensing permits.

### 27.2 Financial Corrections

If an authoritative provider correction proves that a financial event was processed incorrectly:

- automated reconciliation flags the discrepancy
- a compensating ledger event is created when a deterministic correction rule exists
- otherwise administrators receive a repair task

Original ledger history remains immutable.

---

## 28. Outage Behavior

### 28.1 Single-Security Failure

If one security lacks a trustworthy quote:

- block new executions for that security
- retain last-known marked value with stale label where appropriate
- allow unrelated securities/actions to continue

### 28.2 Broad Quote Outage

If broad market execution data fails:

- suspend affected market trading
- keep non-market gameplay available
- continue loan/gift/report navigation where safe
- defer margin liquidation dependent on unavailable prices

### 28.3 Corporate-Action Feed Outage

Trading may continue only if the system has confidence no pending effective action makes the current listing state unsafe.

Otherwise affected securities enter review/suspension.

### 28.4 Calendar Failure

If Stockpile cannot determine whether an exchange should be open, new market executions are paused for that exchange.

Fail closed, not open.

---

## 29. Provider Health

The market-data adapter records operational metrics:

- request success rate
- latency
- quote market-age distribution
- rate-limit usage
- stale quote count
- missing symbol count
- corporate-action ingestion lag
- calendar failures
- FX failures

Threshold breaches create operational alerts before players notice corrupted behavior.

---

## 30. Provider Rate Limits

All market-data access passes through shared caching/batching so three players viewing AAPL do not create three unnecessary provider calls.

Provider rate limits must never change financial semantics.

If rate limits are exhausted:

- queue/defer noncritical refreshes
- preserve execution-critical capacity where possible
- suspend execution rather than use an old price

---

## 31. Current Provider Research Shortlist

This shortlist is not a final license decision.

### 31.1 Financial Modeling Prep (FMP)

Technical strengths observed:

- Premium tier advertises US, UK, and Canada coverage
- pricing page labels paid individual tiers as real-time
- TSX quote/intraday endpoints are documented
- dividends, splits, symbol changes, delistings, earnings/corporate calendars available
- broad single-provider feature fit

Published individual Premium pricing reviewed:

- approximately **US$59/month billed annually** as of September 2026

Blocking concern:

- FMP explicitly says displaying/redistributing data requires a specific Data Display and Licensing Agreement

**Phase 0 ranking:** First provider to contact for a small private-display license because the technical fit is strong.

Sources:

- https://site.financialmodelingprep.com/pricing-plans
- https://site.financialmodelingprep.com/terms-of-service

### 31.2 EODHD

Technical strengths observed:

- broad US/global/TSX coverage
- splits/dividends
- FX
- delisted data
- market holidays/trading-hours API
- inexpensive personal All World Extended plan
- large API quotas

Published personal pricing reviewed:

- All World Extended approximately **US$29.99/month**

Tradeoff:

- global live stock data is generally delayed around 15–20 minutes; real-time WebSocket stock feed is focused on US data

Blocking concern:

- personal terms explicitly prohibit displaying/redistributing data to others
- commercial/internal plan pricing shown around US$399/month, making it unattractive unless a small-use license is negotiated

**Phase 0 ranking:** Strong technical fallback for delayed execution if compliant small-group licensing is available.

Sources:

- https://eodhd.com/pricing
- https://eodhd.com/financial-apis/live-ohlcv-stocks-api
- https://eodhd.com/financial-apis/terms-conditions
- https://eodhd.com/financial-apis/exchanges-api-trading-hours-and-stock-market-holidays

### 31.3 Twelve Data

Technical strengths observed:

- strong unified API
- real-time US data
- explicit Canadian equities support
- Canadian real-time feed sourced through Cboe Canada when appropriately licensed
- broad reference/time-series/corporate-action capabilities

Published individual pricing reviewed:

- Grow approximately **US$79/month** monthly list price
- business Venture approximately **US$499/month** list price

Tradeoff:

- ordinary TSX access on listed individual plans may be EOD depending on plan/feed
- real-time Canadian access has separate licensing/add-on considerations

Blocking concern:

- individual plans do not permit redistribution to third parties

**Phase 0 ranking:** Strongest compliance/real-time Canadian path technically, but likely too expensive for this private hobby project unless a small license is available.

Sources:

- https://twelvedata.com/pricing
- https://twelvedata.com/pricing-business
- https://support.twelvedata.com/en/articles/15303158-canadian-equities-market-data
- https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage

### 31.4 Finnhub

Finnhub offers broad global symbol/reference data and US real-time capabilities.

However, documentation reviewed lists TSX tick data as end-of-day for that feed, making it a weaker fit for Stockpile's Canadian intraday game requirement.

**Phase 0 ranking:** Not preferred for the primary launch provider.

Source:

- https://finnhub.io/docs/api/quote

---

## 32. Provider Selection Requirements

A provider cannot be selected merely because its API is pleasant.

Required launch capabilities:

### Mandatory

- licensed display to the private Discord users
- NYSE/NASDAQ stocks and ETFs
- TSX stocks and ETFs
- intraday pricing for both countries
- timestamps sufficient for anti-stale execution
- historical daily prices
- enough intraday history to resolve delayed orders/reports
- USD/CAD FX
- splits
- dividends/distributions
- delisting/symbol metadata
- sustainable rate limits
- legally permitted minimum retention for audit history

### Strongly Preferred

- earnings calendar
- exchange calendars/market status
- structured merger/acquisition actions
- spin-off data
- batch quotes
- status/SLA visibility

### Disqualifiers

- terms prohibit required display/storage
- Canada is end-of-day only
- no reliable market timestamps
- no split/dividend support
- inability to identify listings independently of ticker text
- pricing unreasonable for the private project with no small-use license available

---

## 33. Preferred Freshness Target

Ideal production target:

- US execution feed: real-time or near-real-time
- Canadian execution feed: real-time or near-real-time
- FX: <=1 minute

Acceptable fallback for the private game:

- delayed intraday stock data up to approximately 15–20 minutes **only when using the deferred verified-price execution model in this specification**

End-of-day-only Canadian pricing is not acceptable for normal intraday Stockpile trading.

---

## 34. Provider Decision Process

Before implementation reaches provider-specific production integration:

1. Contact FMP requesting pricing/permission for a non-commercial private Discord bot with approximately 3 users and US/Canadian display.
2. If unsuitable, request equivalent small-group licensing guidance from EODHD and Twelve Data.
3. Confirm exact Canada quote freshness, exchange coverage, corporate actions, FX, retention, and display rights in writing.
4. Record the chosen plan/license assumptions in this document.
5. Mark the Phase 0 provider-selection decision complete.

Until then, development may use mocks/fixtures and a provider adapter, but production data integration is not considered frozen.

### 34.1 Synthetic Development Mode

Phase 1 uses deterministic, explicitly fictional securities, observations, FX rates, calendars, and corporate actions produced by the normalized provider contract. Synthetic symbols and presentation must not be confused with licensed real-market observations. No external market endpoint may be added merely because it is free to access; its display, derivation, and retention rights must still pass the production licensing gate.

Synthetic scenarios must include CAD- and USD-denominated instruments and reproduce the timestamp, delay, stale-data, halt, gap, dividend, and split semantics required of a future production adapter.

For deterministic synthetic tick observations, the normalized observation price is the execution price. Limit orders execute only when that observation crosses the limit. This synthetic rule is versioned and does not preselect the execution field for a future licensed quote/trade/bar feed.

---

## 35. Decisions Frozen by This Draft

Unless deliberately reopened during Phase 0 review:

1. Launch universe is NYSE/NASDAQ/TSX common stocks and ETFs only.
2. Tickers are aliases, not permanent security identity.
3. Market and receipt timestamps are both mandatory.
4. Stale data may inform labeled display but never execute trades.
5. Delayed data cannot execute at a pre-order stale quote.
6. Delayed market orders wait for a market observation from at/after order submission.
7. Closed-market orders wait for the next regular session.
8. Launch trading is regular-hours only.
9. FX must be authoritative and stored with cross-currency executions.
10. Exchange calendars must support holidays and early closes.
11. Splits alter quantity/cost basis without creating artificial gain/loss.
12. Pure ticker changes preserve security identity.
13. Delisting does not automatically mean zero value.
14. Incomplete high-impact corporate actions suspend the security rather than guessing.
15. Financial history is never silently rewritten because provider history later changes.
16. Provider outage behavior fails closed for financial mutations.
17. Production provider selection is blocked until display/redistribution rights are confirmed.

---

## 36. Market Data North Star

Stockpile should be able to survive this sequence correctly:

1. A player submits a Canadian market order while the selected feed is delayed.
2. Stockpile shows the delayed quote but does not execute against it.
3. The provider later delivers a market observation from after the order time.
4. Stockpile settles the order at the deterministic eligible price and stores execution evidence.
5. The company later splits its shares.
6. Stockpile adjusts quantity/cost basis and cancels affected pending orders automatically.
7. The ticker changes six months later.
8. The player's holding and entire career history remain attached to the same security identity.
9. A provider outage occurs on a volatile day.
10. Trading pauses instead of inventing prices; debt and reports continue where safe.

If Stockpile can do this without corrupting anyone's permanent career, market data is serving the game rather than controlling it.
