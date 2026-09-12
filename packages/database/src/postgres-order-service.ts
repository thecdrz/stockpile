import {
  Money,
  Quantity,
  convertForeignTrade,
  assertCanReserveCash,
  assertCanReserveShares,
  requiredBuyReservation,
  type AcceptedOrder,
  type Price,
  type Rate,
} from "@stockpile/core";
import type { LedgerAccountId } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresJobQueue, type EnqueueJobCommand } from "./postgres-job-queue.js";

interface ExistingOrderRow extends QueryResultRow {
  id: string;
}

interface CashAccountRow extends QueryResultRow {
  kind: string;
  base_currency: "CAD" | "USD";
}

interface AmountRow extends QueryResultRow {
  amount: string;
}

export interface AcceptOrderPersistenceCommand {
  readonly order: AcceptedOrder;
  readonly playerCashAccountId: LedgerAccountId;
  readonly idempotencyKey: string;
  readonly expiresAt: string;
  readonly estimatedMarketPrice?: Price;
  readonly estimatedFx?: {
    readonly basePerForeignRate: Rate;
    readonly spreadRate: Rate;
  };
  /** Scheduled atomically with order acceptance so an accepted order cannot be stranded. */
  readonly verificationJob: EnqueueJobCommand;
}

export interface AcceptedOrderPersistenceResult {
  readonly orderId: string;
  readonly created: boolean;
  readonly reservationId?: string;
}

export class PostgresOrderService {
  readonly #jobs: PostgresJobQueue;

  constructor(
    private readonly pool: PgPoolLike,
    private readonly nextId: () => string,
  ) {
    this.#jobs = new PostgresJobQueue(pool, nextId);
  }

  async accept(command: AcceptOrderPersistenceCommand): Promise<AcceptedOrderPersistenceResult> {
    if (command.idempotencyKey.trim().length === 0) throw new Error("Order idempotency key is required");
    if (Number.isNaN(Date.parse(command.expiresAt))) throw new Error("Invalid order expiration time");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<ExistingOrderRow>(
        `SELECT id FROM orders
         WHERE environment_id = $1 AND scope = $2 AND idempotency_key = $3`,
        [command.order.environmentId, command.order.scope, command.idempotencyKey],
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return Object.freeze({ orderId: existing.rows[0].id, created: false });
      }

      const reservation =
        command.order.side === "BUY"
          ? await this.reserveCash(client, command)
          : await this.reserveShares(client, command);
      const inserted = await this.insertOrder(client, command);
      if (!inserted) {
        const winner = await client.query<ExistingOrderRow>(
          `SELECT id FROM orders
           WHERE environment_id = $1 AND scope = $2 AND idempotency_key = $3`,
          [command.order.environmentId, command.order.scope, command.idempotencyKey],
        );
        const winnerId = winner.rows[0]?.id;
        if (!winnerId) throw new Error("Order idempotency conflict did not resolve");
        await client.query("COMMIT");
        return Object.freeze({ orderId: winnerId, created: false });
      }
      await this.insertReservation(client, command, reservation);
      await client.query(
        `INSERT INTO order_events (id, order_id, from_status, to_status, reason, effective_at, idempotency_key)
         VALUES ($1, $2, NULL, $3, 'ORDER_ACCEPTED', $4, $5)`,
        [this.nextId(), command.order.id, command.order.status, command.order.acceptedAt, `order-accepted:${command.order.id}`],
      );
      await this.#jobs.enqueueUsingClient(client, command.verificationJob);
      await client.query("COMMIT");
      return Object.freeze({ orderId: command.order.id, created: true, reservationId: reservation.id });
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async reserveCash(
    client: PgClientLike,
    command: AcceptOrderPersistenceCommand,
  ): Promise<{ readonly id: string; readonly cashAmount: Money }> {
    const account = await client.query<CashAccountRow>(
      `SELECT la.kind, environment.base_currency
       FROM ledger_accounts la
       JOIN environments environment ON environment.id = la.environment_id
       WHERE la.id = $1 AND la.environment_id = $2 AND la.scope = $3
       FOR UPDATE OF la`,
      [command.playerCashAccountId, command.order.environmentId, command.order.scope],
    );
    const accountRow = account.rows[0];
    if (!accountRow || accountRow.kind !== "PLAYER_CASH") throw new Error("Invalid player cash account");
    const listingReservation = requiredBuyReservation(command.order, command.estimatedMarketPrice);
    const required =
      command.order.listingCurrency === accountRow.base_currency
        ? listingReservation
        : command.estimatedFx
          ? convertForeignTrade(
              listingReservation,
              accountRow.base_currency,
              command.estimatedFx.basePerForeignRate,
              command.estimatedFx.spreadRate,
              "BUY",
            ).playerCashEffect
          : (() => {
              throw new Error("Cross-currency order reservation requires FX support");
            })();
    const [cash, reserved] = await Promise.all([
      client.query<AmountRow>(
        `SELECT COALESCE(sum(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END), 0)::text AS amount
         FROM journal_entries WHERE ledger_account_id = $1 AND currency = $2`,
        [command.playerCashAccountId, accountRow.base_currency],
      ),
      client.query<AmountRow>(
        `SELECT COALESCE(sum(amount), 0)::text AS amount
         FROM cash_reservations WHERE ledger_account_id = $1 AND currency = $2 AND status = 'ACTIVE'`,
        [command.playerCashAccountId, accountRow.base_currency],
      ),
    ]);
    assertCanReserveCash(
      {
        totalCash: Money.of(cash.rows[0]?.amount ?? "0", accountRow.base_currency),
        reservedCash: Money.of(reserved.rows[0]?.amount ?? "0", accountRow.base_currency),
      },
      required,
    );
    return Object.freeze({ id: this.nextId(), cashAmount: required });
  }

  private async reserveShares(
    client: PgClientLike,
    command: AcceptOrderPersistenceCommand,
  ): Promise<{ readonly id: string }> {
    const locked = await client.query(
      `SELECT id FROM position_accounts
       WHERE id = $1 AND environment_id = $2 AND scope = $3
       FOR UPDATE`,
      [command.order.tradingAccountId, command.order.environmentId, command.order.scope],
    );
    if (locked.rowCount !== 1) throw new Error("Invalid position account");
    const [owned, reserved] = await Promise.all([
      client.query<AmountRow>(
        `SELECT COALESCE(sum(quantity_delta), 0)::text AS amount
         FROM security_quantity_entries WHERE position_account_id = $1 AND security_id = $2`,
        [command.order.tradingAccountId, command.order.securityId],
      ),
      client.query<AmountRow>(
        `SELECT COALESCE(sum(quantity), 0)::text AS amount
         FROM share_reservations
         WHERE position_account_id = $1 AND security_id = $2 AND status = 'ACTIVE'`,
        [command.order.tradingAccountId, command.order.securityId],
      ),
    ]);
    assertCanReserveShares(
      {
        ownedQuantity: Quantity.of(owned.rows[0]?.amount ?? "0"),
        reservedQuantity: Quantity.of(reserved.rows[0]?.amount ?? "0"),
      },
      command.order.quantity,
    );
    return Object.freeze({ id: this.nextId() });
  }

  private async insertOrder(client: PgClientLike, command: AcceptOrderPersistenceCommand): Promise<boolean> {
    const inserted = await client.query(
      `INSERT INTO orders (
         id, environment_id, scope, position_account_id, player_cash_account_id, security_id,
         side, order_type, status, quantity, limit_price, listing_currency, time_in_force,
         accepted_at, expires_at, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (environment_id, scope, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        command.order.id,
        command.order.environmentId,
        command.order.scope,
        command.order.tradingAccountId,
        command.playerCashAccountId,
        command.order.securityId,
        command.order.side,
        command.order.type,
        command.order.status,
        command.order.quantity.toString(),
        command.order.limitPrice?.toString() ?? null,
        command.order.listingCurrency,
        command.order.timeInForce,
        command.order.acceptedAt,
        command.expiresAt,
        command.idempotencyKey,
      ],
    );
    return inserted.rowCount === 1;
  }

  private async insertReservation(
    client: PgClientLike,
    command: AcceptOrderPersistenceCommand,
    reservation: { readonly id: string; readonly cashAmount?: Money },
  ): Promise<void> {
    if (command.order.side === "BUY") {
      const amount = reservation.cashAmount;
      if (!amount) throw new Error("Buy order cash reservation is missing");
      await client.query(
        `INSERT INTO cash_reservations
           (id, environment_id, scope, ledger_account_id, order_id, amount, currency, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')`,
        [
          reservation.id,
          command.order.environmentId,
          command.order.scope,
          command.playerCashAccountId,
          command.order.id,
          amount.toString(),
          amount.currency,
        ],
      );
      return;
    }
    await client.query(
      `INSERT INTO share_reservations
         (id, environment_id, scope, position_account_id, security_id, order_id, quantity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')`,
      [
        reservation.id,
        command.order.environmentId,
        command.order.scope,
        command.order.tradingAccountId,
        command.order.securityId,
        command.order.id,
        command.order.quantity.toString(),
      ],
    );
  }
}

async function rollbackQuietly(client: PgClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original failure.
  }
}
