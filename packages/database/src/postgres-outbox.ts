import type { EnvironmentId, JsonObject } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";

interface OutboxRow extends QueryResultRow {
  id: string;
  environment_id: string;
  event_type: string;
  payload: JsonObject;
  destination: string;
  attempts: number;
  max_attempts: number;
  idempotency_key: string;
}

export interface EnqueueOutboxCommand {
  readonly environmentId: EnvironmentId;
  readonly eventType: string;
  readonly payload: JsonObject;
  readonly destination: string;
  readonly availableAt: string;
  readonly maxAttempts: number;
  readonly idempotencyKey: string;
}

export interface ClaimedOutboxEvent {
  readonly id: string;
  readonly environmentId: EnvironmentId;
  readonly eventType: string;
  readonly payload: JsonObject;
  readonly destination: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly idempotencyKey: string;
}

export class PostgresOutbox {
  constructor(
    private readonly pool: PgPoolLike,
    private readonly nextId: () => string,
  ) {}

  enqueue(command: EnqueueOutboxCommand): Promise<{ readonly id: string; readonly created: boolean }> {
    return this.enqueueUsingExecutor(this.pool, command);
  }

  enqueueUsingClient(
    client: PgClientLike,
    command: EnqueueOutboxCommand,
  ): Promise<{ readonly id: string; readonly created: boolean }> {
    return this.enqueueUsingExecutor(client, command);
  }

  async claim(destination: string, workerId: string, now: string, leaseSeconds: number): Promise<ClaimedOutboxEvent | null> {
    if (destination.trim().length === 0 || workerId.trim().length === 0) throw new Error("Destination and worker ID are required");
    if (Number.isNaN(Date.parse(now))) throw new Error("Invalid outbox claim time");
    if (!Number.isInteger(leaseSeconds) || leaseSeconds <= 0) throw new Error("Lease seconds must be positive");
    await this.pool.query(
      `UPDATE outbox_events
       SET status = 'DEAD', lease_owner = NULL, lease_expires_at = NULL,
           last_error = 'lease expired after final attempt', updated_at = $1
       WHERE destination = $2 AND status = 'PROCESSING' AND lease_expires_at <= $1
         AND attempts >= max_attempts`,
      [now, destination],
    );
    const result = await this.pool.query<OutboxRow>(
      `WITH candidate AS (
         SELECT id FROM outbox_events
         WHERE destination = $1 AND attempts < max_attempts AND (
           (status IN ('PENDING', 'RETRY') AND available_at <= $3)
           OR (status = 'PROCESSING' AND lease_expires_at <= $3)
         )
         ORDER BY available_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE outbox_events event
       SET status = 'PROCESSING', attempts = attempts + 1, lease_owner = $2,
           lease_expires_at = $3::timestamptz + make_interval(secs => $4), updated_at = $3
       FROM candidate WHERE event.id = candidate.id
       RETURNING event.id, event.environment_id, event.event_type, event.payload,
                 event.destination, event.attempts, event.max_attempts, event.idempotency_key`,
      [destination, workerId, now, leaseSeconds],
    );
    const row = result.rows[0];
    return row ? freezeClaimed(row) : null;
  }

  async delivered(event: ClaimedOutboxEvent, workerId: string, deliveredAt: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE outbox_events
       SET status = 'DELIVERED', delivered_at = $3, lease_owner = NULL, lease_expires_at = NULL, updated_at = $3
       WHERE id = $1 AND status = 'PROCESSING' AND lease_owner = $2 AND attempts = $4`,
      [event.id, workerId, deliveredAt, event.attempt],
    );
    if (result.rowCount !== 1) throw new Error("Outbox lease is no longer owned by this worker");
  }

  async failed(
    event: ClaimedOutboxEvent,
    workerId: string,
    failedAt: string,
    error: string,
    retryAt: string,
  ): Promise<void> {
    const status = event.attempt >= event.maxAttempts ? "DEAD" : "RETRY";
    const result = await this.pool.query(
      `UPDATE outbox_events
       SET status = $4, available_at = $5, lease_owner = NULL, lease_expires_at = NULL,
           last_error = $6, updated_at = $7
       WHERE id = $1 AND status = 'PROCESSING' AND lease_owner = $2 AND attempts = $3`,
      [event.id, workerId, event.attempt, status, retryAt, error, failedAt],
    );
    if (result.rowCount !== 1) throw new Error("Outbox lease is no longer owned by this worker");
  }

  private async enqueueUsingExecutor(
    executor: Pick<PgPoolLike, "query"> | Pick<PgClientLike, "query">,
    command: EnqueueOutboxCommand,
  ): Promise<{ readonly id: string; readonly created: boolean }> {
    validateEnqueue(command);
    const proposedId = this.nextId();
    const inserted = await executor.query<{ id: string } & QueryResultRow>(
      `INSERT INTO outbox_events (
         id, environment_id, event_type, payload, destination, status,
         available_at, max_attempts, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8)
       ON CONFLICT (environment_id, destination, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        proposedId,
        command.environmentId,
        command.eventType,
        command.payload,
        command.destination,
        command.availableAt,
        command.maxAttempts,
        command.idempotencyKey,
      ],
    );
    if (inserted.rows[0]) return Object.freeze({ id: inserted.rows[0].id, created: true });
    const existing = await executor.query<{ id: string } & QueryResultRow>(
      `SELECT id FROM outbox_events
       WHERE environment_id = $1 AND destination = $2 AND idempotency_key = $3`,
      [command.environmentId, command.destination, command.idempotencyKey],
    );
    if (!existing.rows[0]) throw new Error("Outbox idempotency conflict did not resolve");
    return Object.freeze({ id: existing.rows[0].id, created: false });
  }
}

function validateEnqueue(command: EnqueueOutboxCommand): void {
  if (command.eventType.trim().length === 0 || command.destination.trim().length === 0) {
    throw new Error("Outbox event type and destination are required");
  }
  if (command.idempotencyKey.trim().length === 0) throw new Error("Outbox idempotency key is required");
  if (Number.isNaN(Date.parse(command.availableAt))) throw new Error("Invalid outbox availability time");
  if (!Number.isInteger(command.maxAttempts) || command.maxAttempts <= 0) throw new Error("Max attempts must be positive");
}

function freezeClaimed(row: OutboxRow): ClaimedOutboxEvent {
  return Object.freeze({
    id: row.id,
    environmentId: row.environment_id as EnvironmentId,
    eventType: row.event_type,
    payload: deepFreeze(structuredClone(row.payload)),
    destination: row.destination,
    attempt: row.attempts,
    maxAttempts: row.max_attempts,
    idempotencyKey: row.idempotency_key,
  });
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
