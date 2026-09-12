import {
  Money,
  Price,
  Quantity,
  QuantityDelta,
  Rate,
  assessObservationEligibility,
  convertForeignTrade,
  maximumAffordableForeignQuantity,
  type AcceptedOrder,
} from "@stockpile/core";
import { applyBuy, applySell, emptyPositionCostBasis, type FinancialEvent, type JournalEntry } from "@stockpile/ledger";
import type { Currency } from "@stockpile/core";
import type { FinancialEventId, JournalEntryId, LedgerAccountId } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresLedgerStore } from "./postgres-ledger-store.js";
import { PostgresOutbox } from "./postgres-outbox.js";

interface OrderRow extends QueryResultRow {
  id: string;
  environment_id: string;
  scope: "CAREER" | "LEAGUE";
  position_account_id: string;
  player_cash_account_id: string;
  security_id: string;
  side: "BUY" | "SELL";
  order_type: "MARKET" | "LIMIT";
  status: AcceptedOrder["status"] | "FILLED" | "CANCELLED" | "EXPIRED" | "REJECTED";
  quantity: string;
  limit_price: string | null;
  listing_currency: Currency;
  accepted_at: Date;
  base_currency: Currency;
}

interface ReservationRow extends QueryResultRow {
  id: string;
  amount?: string;
  currency?: Currency;
  quantity?: string;
}

interface CostBasisRow extends QueryResultRow {
  currency: Currency;
  quantity: string;
  remaining_cost: string;
  realized_gain_loss: string;
  version: string;
}

export interface SettlementObservation {
  readonly securityId: string;
  readonly price: Price;
  readonly marketTimestamp: string;
  readonly receivedAt: string;
  readonly freshness: "REALTIME" | "DELAYED" | "END_OF_DAY" | "STALE" | "UNAVAILABLE";
  readonly reference: string;
}

export interface SettleTradeCommand {
  readonly orderId: string;
  readonly observation: SettlementObservation;
  readonly now: string;
  readonly maximumObservationAgeSeconds: number;
  readonly economyRulesetVersion: string;
  readonly executionPolicyVersion: string;
  readonly sessionOpenAt?: string;
  readonly fx?: {
    readonly basePerForeignRate: Rate;
    readonly spreadRate: Rate;
    readonly marketTimestamp: string;
    readonly receivedAt: string;
    readonly freshness: "REALTIME" | "DELAYED" | "STALE" | "UNAVAILABLE";
    readonly reference: string;
  };
  readonly maximumFxAgeSeconds?: number;
}

interface SettlementAmounts {
  readonly foreignNotional?: Money;
  readonly grossBaseAmount: Money;
  readonly spreadAmount: Money;
  readonly playerCashEffect: Money;
}

export type SettleTradeResult =
  | { readonly settled: false; readonly reason: "LIMIT_NOT_CROSSED" }
  | {
      readonly settled: true;
      readonly executionId: string;
      readonly financialEventId: FinancialEventId;
      readonly executedQuantity: Quantity;
      readonly baseNotional: Money;
      readonly idempotentReplay: boolean;
    };

export class PostgresTradeSettlementService {
  readonly #ledgerStore: PostgresLedgerStore;
  readonly #outbox: PostgresOutbox;

  constructor(
    private readonly pool: PgPoolLike,
    private readonly nextId: () => string,
  ) {
    this.#ledgerStore = new PostgresLedgerStore(pool);
    this.#outbox = new PostgresOutbox(pool, nextId);
  }

  async settle(command: SettleTradeCommand): Promise<SettleTradeResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const replay = await this.findExecution(client, command.orderId);
      if (replay) {
        await client.query("COMMIT");
        return { ...replay, idempotentReplay: true };
      }

      const orderResult = await client.query<OrderRow>(
        `SELECT orders.*, environments.base_currency
         FROM orders JOIN environments ON environments.id = orders.environment_id
         WHERE orders.id = $1 FOR UPDATE OF orders`,
        [command.orderId],
      );
      const order = orderResult.rows[0];
      if (!order) throw new Error("Order not found");
      if (!["PENDING_VERIFIED_PRICE", "PENDING_MARKET_OPEN", "OPEN"].includes(order.status)) {
        throw new Error(`Order cannot settle from status ${order.status}`);
      }
      this.validateObservation(order, command);
      this.validateFx(order, command);
      if (!this.limitCrossed(order, command.observation.price)) {
        await client.query("COMMIT");
        return Object.freeze({ settled: false, reason: "LIMIT_NOT_CROSSED" });
      }

      const requestedQuantity = Quantity.of(order.quantity);
      const { quantity, amounts, reservationId } =
        order.side === "BUY"
          ? await this.resolveBuy(client, order, requestedQuantity, command.observation.price, command)
          : await this.resolveSell(client, order, requestedQuantity, command.observation.price, command);
      if (amounts.playerCashEffect.compare(Money.of("10", amounts.playerCashEffect.currency)) < 0) {
        throw new Error("Final trade is below minimum notional");
      }

      const clearingAccountId = await this.ensureClearingAccount(client, order);
      const fxSpreadAccountId = amounts.spreadAmount.isZero() ? null : await this.ensureFxSpreadAccount(client, order);
      const timestamp = command.now;
      const eventId = this.nextId() as FinancialEventId;
      const event = this.createEvent(order, command, eventId);
      const entries = this.createJournalEntries(
        order,
        eventId,
        clearingAccountId,
        fxSpreadAccountId,
        amounts,
        timestamp,
      );
      await this.#ledgerStore.commitUsingClient(client, event, entries);

      const position = await this.updateCostBasis(client, order, quantity, amounts.playerCashEffect, timestamp);
      await client.query(
        `INSERT INTO security_quantity_entries (
           id, financial_event_id, environment_id, scope, position_account_id, security_id,
           quantity_delta, unit_cost_amount, unit_cost_currency, effective_at, entry_type
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          this.nextId(),
          eventId,
          order.environment_id,
          order.scope,
          order.position_account_id,
          order.security_id,
          order.side === "BUY" ? quantity.toString() : QuantityDelta.of(`-${quantity.toString()}`).toString(),
          order.side === "BUY" ? amounts.playerCashEffect.toString() : null,
          order.side === "BUY" ? amounts.playerCashEffect.currency : null,
          command.observation.marketTimestamp,
          order.side === "BUY" ? "TRADE_BUY" : "TRADE_SELL",
        ],
      );
      await this.persistCostBasis(client, order, position, timestamp);

      const executionId = this.nextId();
      await client.query(
        `INSERT INTO trade_executions (
           id, order_id, financial_event_id, security_id, executed_quantity, execution_price,
           listing_currency, base_notional, base_currency, market_timestamp, provider_received_at,
           settled_at, market_data_reference, execution_policy_version, foreign_notional,
           fx_rate, fx_market_timestamp, fx_received_at, fx_reference, fx_spread_rate, fx_spread_amount
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15, $16, $17, $18, $19, $20, $21
         )`,
        [
          executionId,
          order.id,
          eventId,
          order.security_id,
          quantity.toString(),
          command.observation.price.toString(),
          order.listing_currency,
          amounts.playerCashEffect.toString(),
          amounts.playerCashEffect.currency,
          command.observation.marketTimestamp,
          command.observation.receivedAt,
          timestamp,
          command.observation.reference,
          command.executionPolicyVersion,
          amounts.foreignNotional?.toString() ?? null,
          command.fx?.basePerForeignRate.toString() ?? null,
          command.fx?.marketTimestamp ?? null,
          command.fx?.receivedAt ?? null,
          command.fx?.reference ?? null,
          command.fx?.spreadRate.toString() ?? null,
          amounts.spreadAmount.isZero() ? null : amounts.spreadAmount.toString(),
        ],
      );
      const reservationTable = order.side === "BUY" ? "cash_reservations" : "share_reservations";
      await client.query(
        `UPDATE ${reservationTable}
         SET status = 'CONSUMED', resolved_at = $2, version = version + 1
         WHERE id = $1 AND status = 'ACTIVE'`,
        [reservationId, timestamp],
      );
      await client.query(
        `UPDATE orders SET status = 'FILLED', updated_at = $2, version = version + 1
         WHERE id = $1`,
        [order.id, timestamp],
      );
      await client.query(
        `INSERT INTO order_events (id, order_id, from_status, to_status, reason, effective_at, idempotency_key)
         VALUES ($1, $2, $3, 'FILLED', 'VERIFIED_EXECUTION', $4, $5)`,
        [this.nextId(), order.id, order.status, timestamp, `order-filled:${order.id}`],
      );
      await this.#outbox.enqueueUsingClient(client, {
        environmentId: order.environment_id as never,
        eventType: "TradeExecuted",
        destination: "DISCORD",
        availableAt: timestamp,
        maxAttempts: 8,
        idempotencyKey: `trade-executed:${order.id}`,
        payload: Object.freeze({
          orderId: order.id,
          executionId,
          financialEventId: eventId,
          securityId: order.security_id,
          side: order.side,
          executedQuantity: quantity.toString(),
          baseNotional: amounts.playerCashEffect.toString(),
          baseCurrency: amounts.playerCashEffect.currency,
        }),
      });
      await client.query("COMMIT");
      return Object.freeze({
        settled: true,
        executionId,
        financialEventId: eventId,
        executedQuantity: quantity,
        baseNotional: amounts.playerCashEffect,
        idempotentReplay: false,
      });
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private validateObservation(order: OrderRow, command: SettleTradeCommand): void {
    if (command.observation.securityId !== order.security_id) throw new Error("Observation security mismatch");
    if (command.observation.price.currency !== order.listing_currency) throw new Error("Observation currency mismatch");
    const eligibility = assessObservationEligibility(command.observation, {
      acceptedAt: order.accepted_at.toISOString(),
      now: command.now,
      maximumObservationAgeSeconds: command.maximumObservationAgeSeconds,
    });
    if (!eligibility.eligible) throw new Error(`Observation is not executable: ${eligibility.reason}`);
    if (order.status === "PENDING_MARKET_OPEN") {
      if (
        !command.sessionOpenAt ||
        Number.isNaN(Date.parse(command.sessionOpenAt)) ||
        Date.parse(command.observation.marketTimestamp) < Date.parse(command.sessionOpenAt)
      ) {
        throw new Error("Observation predates the eligible market session open");
      }
    }
  }

  private validateFx(order: OrderRow, command: SettleTradeCommand): void {
    if (order.listing_currency === order.base_currency) {
      if (command.fx) throw new Error("Domestic trade must not include FX evidence");
      return;
    }
    if (!command.fx || command.maximumFxAgeSeconds === undefined) {
      throw new Error("Cross-currency settlement requires FX evidence");
    }
    const eligibility = assessObservationEligibility(
      {
        marketTimestamp: command.fx.marketTimestamp,
        receivedAt: command.fx.receivedAt,
        freshness: command.fx.freshness,
      },
      {
        acceptedAt: order.accepted_at.toISOString(),
        now: command.now,
        maximumObservationAgeSeconds: command.maximumFxAgeSeconds,
      },
    );
    if (!eligibility.eligible) throw new Error(`FX observation is not executable: ${eligibility.reason}`);
  }

  private limitCrossed(order: OrderRow, price: Price): boolean {
    if (order.order_type !== "LIMIT" || order.limit_price === null) return true;
    const comparison = price.compare(Price.of(order.limit_price, order.listing_currency));
    return order.side === "BUY" ? comparison <= 0 : comparison >= 0;
  }

  private async resolveBuy(
    client: PgClientLike,
    order: OrderRow,
    requested: Quantity,
    price: Price,
    command: SettleTradeCommand,
  ): Promise<{ quantity: Quantity; amounts: SettlementAmounts; reservationId: string }> {
    const reservation = await client.query<ReservationRow>(
      "SELECT id, amount, currency FROM cash_reservations WHERE order_id = $1 AND status = 'ACTIVE' FOR UPDATE",
      [order.id],
    );
    const row = reservation.rows[0];
    if (!row?.amount || !row.currency) throw new Error("Active cash reservation not found");
    const reserved = Money.of(row.amount, row.currency);
    const requestedAmounts = this.settlementAmounts(order, price.notional(requested), "BUY", command);
    const quantity =
      requestedAmounts.playerCashEffect.compare(reserved) <= 0
        ? requested
        : order.listing_currency === order.base_currency
          ? price.maximumAffordableQuantity(reserved)
          : maximumAffordableForeignQuantity(
              reserved,
              price,
              this.requiredFx(command).basePerForeignRate,
              this.requiredFx(command).spreadRate,
            );
    return {
      quantity,
      amounts: this.settlementAmounts(order, price.notional(quantity), "BUY", command),
      reservationId: row.id,
    };
  }

  private async resolveSell(
    client: PgClientLike,
    order: OrderRow,
    requested: Quantity,
    price: Price,
    command: SettleTradeCommand,
  ): Promise<{ quantity: Quantity; amounts: SettlementAmounts; reservationId: string }> {
    const reservation = await client.query<ReservationRow>(
      "SELECT id, quantity FROM share_reservations WHERE order_id = $1 AND status = 'ACTIVE' FOR UPDATE",
      [order.id],
    );
    const row = reservation.rows[0];
    if (!row?.quantity || Quantity.of(row.quantity).compare(requested) !== 0) {
      throw new Error("Active share reservation does not match order quantity");
    }
    return {
      quantity: requested,
      amounts: this.settlementAmounts(order, price.notional(requested), "SELL", command),
      reservationId: row.id,
    };
  }

  private async ensureClearingAccount(client: PgClientLike, order: OrderRow): Promise<LedgerAccountId> {
    const proposedId = this.nextId();
    const inserted = await client.query<{ id: string } & QueryResultRow>(
      `INSERT INTO ledger_accounts (id, environment_id, scope, kind, owner_id)
       VALUES ($1, $2, $3, 'MARKET_SECURITIES_CLEARING', NULL)
       ON CONFLICT DO NOTHING RETURNING id`,
      [proposedId, order.environment_id, order.scope],
    );
    if (inserted.rows[0]) return inserted.rows[0].id as LedgerAccountId;
    const existing = await client.query<{ id: string } & QueryResultRow>(
      `SELECT id FROM ledger_accounts
       WHERE environment_id = $1 AND scope = $2 AND kind = 'MARKET_SECURITIES_CLEARING' AND owner_id IS NULL`,
      [order.environment_id, order.scope],
    );
    if (!existing.rows[0]) throw new Error("Market clearing account unavailable");
    return existing.rows[0].id as LedgerAccountId;
  }

  private async ensureFxSpreadAccount(client: PgClientLike, order: OrderRow): Promise<LedgerAccountId> {
    const proposedId = this.nextId();
    const inserted = await client.query<{ id: string } & QueryResultRow>(
      `INSERT INTO ledger_accounts (id, environment_id, scope, kind, owner_id)
       VALUES ($1, $2, $3, 'SYSTEM_FX_SPREAD_INCOME', NULL)
       ON CONFLICT DO NOTHING RETURNING id`,
      [proposedId, order.environment_id, order.scope],
    );
    if (inserted.rows[0]) return inserted.rows[0].id as LedgerAccountId;
    const existing = await client.query<{ id: string } & QueryResultRow>(
      `SELECT id FROM ledger_accounts
       WHERE environment_id = $1 AND scope = $2 AND kind = 'SYSTEM_FX_SPREAD_INCOME' AND owner_id IS NULL`,
      [order.environment_id, order.scope],
    );
    if (!existing.rows[0]) throw new Error("FX spread account unavailable");
    return existing.rows[0].id as LedgerAccountId;
  }

  private settlementAmounts(
    order: OrderRow,
    listingNotional: Money,
    side: "BUY" | "SELL",
    command: SettleTradeCommand,
  ): SettlementAmounts {
    if (order.listing_currency === order.base_currency) {
      return Object.freeze({
        grossBaseAmount: listingNotional,
        spreadAmount: Money.zero(order.base_currency),
        playerCashEffect: listingNotional,
      });
    }
    const fx = this.requiredFx(command);
    const converted = convertForeignTrade(
      listingNotional,
      order.base_currency,
      fx.basePerForeignRate,
      fx.spreadRate,
      side,
    );
    return Object.freeze({
      foreignNotional: listingNotional,
      grossBaseAmount: converted.grossBaseAmount,
      spreadAmount: converted.spreadAmount,
      playerCashEffect: converted.playerCashEffect,
    });
  }

  private requiredFx(command: SettleTradeCommand): NonNullable<SettleTradeCommand["fx"]> {
    if (!command.fx) throw new Error("Cross-currency settlement requires FX evidence");
    return command.fx;
  }

  private createEvent(order: OrderRow, command: SettleTradeCommand, eventId: FinancialEventId): FinancialEvent {
    return Object.freeze({
      id: eventId,
      environmentId: order.environment_id as never,
      scope: order.scope,
      eventType: order.side === "BUY" ? "SECURITY_BUY" : "SECURITY_SELL",
      status: "POSTED",
      businessEffectiveAt: command.observation.marketTimestamp,
      createdAt: command.now,
      postedAt: command.now,
      sourceType: "ORDER_EXECUTION",
      sourceId: order.id,
      idempotencyKey: `trade:${order.id}:${command.observation.reference}`,
      correlationId: this.nextId() as never,
      economyRulesetVersion: command.economyRulesetVersion,
      marketDataReference: command.observation.reference,
    });
  }

  private createJournalEntries(
    order: OrderRow,
    eventId: FinancialEventId,
    clearingAccountId: LedgerAccountId,
    fxSpreadAccountId: LedgerAccountId | null,
    amounts: SettlementAmounts,
    timestamp: string,
  ): readonly JournalEntry[] {
    const cashAccountId = order.player_cash_account_id as LedgerAccountId;
    const entries: JournalEntry[] = [];
    const add = (ledgerAccountId: LedgerAccountId, direction: "DEBIT" | "CREDIT", amount: Money) => {
      entries.push(
        Object.freeze({
          id: this.nextId() as JournalEntryId,
          financialEventId: eventId,
          ledgerAccountId,
          direction,
          amount,
          createdAt: timestamp,
        }),
      );
    };
    if (order.side === "BUY") {
      add(clearingAccountId, "DEBIT", amounts.grossBaseAmount);
      if (fxSpreadAccountId) add(fxSpreadAccountId, "DEBIT", amounts.spreadAmount);
      add(cashAccountId, "CREDIT", amounts.playerCashEffect);
    } else {
      add(cashAccountId, "DEBIT", amounts.playerCashEffect);
      if (fxSpreadAccountId) add(fxSpreadAccountId, "DEBIT", amounts.spreadAmount);
      add(clearingAccountId, "CREDIT", amounts.grossBaseAmount);
    }
    return Object.freeze(entries);
  }

  private async updateCostBasis(
    client: PgClientLike,
    order: OrderRow,
    quantity: Quantity,
    notional: Money,
    timestamp: string,
  ) {
    const result = await client.query<CostBasisRow>(
      `SELECT currency, quantity, remaining_cost, realized_gain_loss, version
       FROM position_cost_basis WHERE position_account_id = $1 AND security_id = $2 FOR UPDATE`,
      [order.position_account_id, order.security_id],
    );
    const row = result.rows[0];
    const current = row
      ? Object.freeze({
          quantity: Quantity.of(row.quantity),
          remainingCost: Money.of(row.remaining_cost, row.currency),
          realizedGainLoss: Money.of(row.realized_gain_loss, row.currency),
        })
      : emptyPositionCostBasis(notional.currency);
    const position = order.side === "BUY" ? applyBuy(current, quantity, notional) : applySell(current, quantity, notional).position;
    return { position, timestamp };
  }

  private async persistCostBasis(
    client: PgClientLike,
    order: OrderRow,
    update: {
      readonly position: ReturnType<typeof emptyPositionCostBasis>;
      readonly timestamp: string;
    },
    timestamp: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO position_cost_basis (
         position_account_id, security_id, currency, quantity, remaining_cost, realized_gain_loss, version, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 1, $7)
       ON CONFLICT (position_account_id, security_id) DO UPDATE SET
         quantity = EXCLUDED.quantity,
         remaining_cost = EXCLUDED.remaining_cost,
         realized_gain_loss = EXCLUDED.realized_gain_loss,
         version = position_cost_basis.version + 1,
         updated_at = EXCLUDED.updated_at`,
      [
        order.position_account_id,
        order.security_id,
        update.position.remainingCost.currency,
        update.position.quantity.toString(),
        update.position.remainingCost.toString(),
        update.position.realizedGainLoss.toString(),
        timestamp,
      ],
    );
  }

  private async findExecution(client: PgClientLike, orderId: string): Promise<Extract<SettleTradeResult, { settled: true }> | null> {
    const result = await client.query<{
      id: string;
      financial_event_id: string;
      executed_quantity: string;
      base_notional: string;
      base_currency: Currency;
    } & QueryResultRow>(
      `SELECT id, financial_event_id, executed_quantity, base_notional, base_currency
       FROM trade_executions WHERE order_id = $1`,
      [orderId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return Object.freeze({
      settled: true,
      executionId: row.id,
      financialEventId: row.financial_event_id as FinancialEventId,
      executedQuantity: Quantity.of(row.executed_quantity),
      baseNotional: Money.of(row.base_notional, row.base_currency),
      idempotentReplay: false,
    });
  }
}

async function rollbackQuietly(client: PgClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original failure.
  }
}
