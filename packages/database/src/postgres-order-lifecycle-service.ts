import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";

interface LifecycleOrderRow extends QueryResultRow {
  id: string;
  side: "BUY" | "SELL";
  status: string;
  expires_at: Date;
}

export type CloseOrderResult =
  | { readonly outcome: "CANCELLED" | "EXPIRED"; readonly changed: boolean }
  | { readonly outcome: "ALREADY_FILLED" | "ALREADY_CLOSED"; readonly changed: false };

export class PostgresOrderLifecycleService {
  constructor(
    private readonly pool: PgPoolLike,
    private readonly nextId: () => string,
  ) {}

  cancel(orderId: string, effectiveAt: string, idempotencyKey: string): Promise<CloseOrderResult> {
    return this.close(orderId, "CANCELLED", effectiveAt, idempotencyKey);
  }

  expire(orderId: string, effectiveAt: string, idempotencyKey: string): Promise<CloseOrderResult> {
    return this.close(orderId, "EXPIRED", effectiveAt, idempotencyKey);
  }

  private async close(
    orderId: string,
    target: "CANCELLED" | "EXPIRED",
    effectiveAt: string,
    idempotencyKey: string,
  ): Promise<CloseOrderResult> {
    if (Number.isNaN(Date.parse(effectiveAt))) throw new Error("Invalid order close time");
    if (idempotencyKey.trim().length === 0) throw new Error("Order close idempotency key is required");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<LifecycleOrderRow>(
        "SELECT id, side, status, expires_at FROM orders WHERE id = $1 FOR UPDATE",
        [orderId],
      );
      const order = result.rows[0];
      if (!order) throw new Error("Order not found");
      if (order.status === "FILLED") {
        await client.query("COMMIT");
        return Object.freeze({ outcome: "ALREADY_FILLED", changed: false });
      }
      if (["CANCELLED", "EXPIRED", "REJECTED"].includes(order.status)) {
        await client.query("COMMIT");
        return Object.freeze({ outcome: "ALREADY_CLOSED", changed: false });
      }
      if (target === "EXPIRED" && Date.parse(effectiveAt) < order.expires_at.getTime()) {
        throw new Error("Order has not reached its expiration time");
      }

      const reservationTable = order.side === "BUY" ? "cash_reservations" : "share_reservations";
      const released = await client.query(
        `UPDATE ${reservationTable}
         SET status = 'RELEASED', resolved_at = $2, version = version + 1
         WHERE order_id = $1 AND status = 'ACTIVE'`,
        [order.id, effectiveAt],
      );
      if (released.rowCount !== 1) throw new Error("Active order reservation not found");
      await client.query(
        `UPDATE orders
         SET status = $2, updated_at = $3, version = version + 1
         WHERE id = $1`,
        [order.id, target, effectiveAt],
      );
      await client.query(
        `INSERT INTO order_events (id, order_id, from_status, to_status, reason, effective_at, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          this.nextId(),
          order.id,
          order.status,
          target,
          target === "CANCELLED" ? "PLAYER_CANCELLED" : "TIME_IN_FORCE_EXPIRED",
          effectiveAt,
          idempotencyKey,
        ],
      );
      await client.query("COMMIT");
      return Object.freeze({ outcome: target, changed: true });
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function rollbackQuietly(client: PgClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original failure.
  }
}
