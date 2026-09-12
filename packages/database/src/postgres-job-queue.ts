import type { EnvironmentId, JsonObject } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";

interface JobRow extends QueryResultRow {
  id: string;
  environment_id: string;
  job_type: string;
  payload: JsonObject;
  run_at: Date;
  attempts: number;
  max_attempts: number;
  idempotency_key: string;
}

export interface EnqueueJobCommand {
  readonly environmentId: EnvironmentId;
  readonly jobType: string;
  readonly payload: JsonObject;
  readonly runAt: string;
  readonly maxAttempts: number;
  readonly idempotencyKey: string;
}

export interface ClaimedJob {
  readonly id: string;
  readonly runId: string;
  readonly environmentId: EnvironmentId;
  readonly jobType: string;
  readonly payload: JsonObject;
  readonly runAt: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly idempotencyKey: string;
}

export class PostgresJobQueue {
  constructor(
    private readonly pool: PgPoolLike,
    private readonly nextId: () => string,
  ) {}

  async enqueue(command: EnqueueJobCommand): Promise<{ readonly id: string; readonly created: boolean }> {
    return this.enqueueUsingExecutor(this.pool, command);
  }

  enqueueUsingClient(
    client: PgClientLike,
    command: EnqueueJobCommand,
  ): Promise<{ readonly id: string; readonly created: boolean }> {
    return this.enqueueUsingExecutor(client, command);
  }

  private async enqueueUsingExecutor(
    executor: Pick<PgPoolLike, "query"> | Pick<PgClientLike, "query">,
    command: EnqueueJobCommand,
  ): Promise<{ readonly id: string; readonly created: boolean }> {
    validateEnqueue(command);
    const proposedId = this.nextId();
    const inserted = await executor.query<{ id: string } & QueryResultRow>(
      `INSERT INTO durable_jobs (
         id, environment_id, job_type, payload, status, run_at, max_attempts, idempotency_key
       ) VALUES ($1, $2, $3, $4, 'SCHEDULED', $5, $6, $7)
       ON CONFLICT (environment_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        proposedId,
        command.environmentId,
        command.jobType,
        command.payload,
        command.runAt,
        command.maxAttempts,
        command.idempotencyKey,
      ],
    );
    if (inserted.rows[0]) return Object.freeze({ id: inserted.rows[0].id, created: true });
    const existing = await executor.query<{ id: string } & QueryResultRow>(
      "SELECT id FROM durable_jobs WHERE environment_id = $1 AND idempotency_key = $2",
      [command.environmentId, command.idempotencyKey],
    );
    if (!existing.rows[0]) throw new Error("Job idempotency conflict did not resolve");
    return Object.freeze({ id: existing.rows[0].id, created: false });
  }

  async claim(workerId: string, now: string, leaseSeconds: number): Promise<ClaimedJob | null> {
    if (workerId.trim().length === 0) throw new Error("Worker ID is required");
    if (Number.isNaN(Date.parse(now))) throw new Error("Invalid claim time");
    if (!Number.isInteger(leaseSeconds) || leaseSeconds <= 0) throw new Error("Lease seconds must be positive");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE job_runs run
         SET finished_at = $1, outcome = 'DEAD', error = 'lease expired after final attempt'
         FROM durable_jobs job
         WHERE run.job_id = job.id AND run.finished_at IS NULL
           AND job.status = 'RUNNING' AND job.lease_expires_at <= $1 AND job.attempts >= job.max_attempts`,
        [now],
      );
      await client.query(
        `UPDATE durable_jobs
         SET status = 'DEAD', lease_owner = NULL, lease_expires_at = NULL,
             last_error = 'lease expired after final attempt', updated_at = $1
         WHERE status = 'RUNNING' AND lease_expires_at <= $1 AND attempts >= max_attempts`,
        [now],
      );
      const claimed = await client.query<JobRow>(
        `WITH candidate AS (
           SELECT id FROM durable_jobs
           WHERE (
             (status IN ('SCHEDULED', 'RETRY') AND run_at <= $1)
             OR (status = 'RUNNING' AND lease_expires_at <= $1)
           ) AND attempts < max_attempts
           ORDER BY run_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE durable_jobs job
         SET status = 'RUNNING', attempts = attempts + 1, lease_owner = $2,
             lease_expires_at = $1::timestamptz + make_interval(secs => $3), updated_at = $1
         FROM candidate
         WHERE job.id = candidate.id
         RETURNING job.id, job.environment_id, job.job_type, job.payload, job.run_at,
                   job.attempts, job.max_attempts, job.idempotency_key`,
        [now, workerId, leaseSeconds],
      );
      const row = claimed.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return null;
      }
      await client.query(
        `UPDATE job_runs SET finished_at = $2, outcome = 'RETRY', error = 'lease expired'
         WHERE job_id = $1 AND finished_at IS NULL`,
        [row.id, now],
      );
      const runId = this.nextId();
      await client.query(
        `INSERT INTO job_runs (id, job_id, attempt, worker_id, started_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [runId, row.id, row.attempts, workerId, now],
      );
      await client.query("COMMIT");
      return freezeClaimed(row, runId);
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  complete(job: ClaimedJob, workerId: string, finishedAt: string): Promise<void> {
    return this.finish(job, workerId, finishedAt, null, finishedAt);
  }

  fail(job: ClaimedJob, workerId: string, failedAt: string, error: string, retryAt: string): Promise<void> {
    if (error.trim().length === 0) throw new Error("Job failure error is required");
    return this.finish(job, workerId, failedAt, error, retryAt);
  }

  private async finish(
    job: ClaimedJob,
    workerId: string,
    finishedAt: string,
    error: string | null,
    retryAt: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const outcome = error === null ? "COMPLETED" : job.attempt >= job.maxAttempts ? "DEAD" : "RETRY";
      const updated = await client.query(
        `UPDATE durable_jobs
         SET status = $4, run_at = $5, lease_owner = NULL, lease_expires_at = NULL,
             last_error = $6, updated_at = $3
         WHERE id = $1 AND status = 'RUNNING' AND lease_owner = $2 AND attempts = $7`,
        [job.id, workerId, finishedAt, outcome, retryAt, error, job.attempt],
      );
      if (updated.rowCount !== 1) throw new Error("Job lease is no longer owned by this worker");
      const run = await client.query(
        `UPDATE job_runs SET finished_at = $2, outcome = $3, error = $4
         WHERE id = $1 AND finished_at IS NULL`,
        [job.runId, finishedAt, outcome, error],
      );
      if (run.rowCount !== 1) throw new Error("Active job run not found");
      await client.query("COMMIT");
    } catch (finishError) {
      await rollbackQuietly(client);
      throw finishError;
    } finally {
      client.release();
    }
  }
}

function validateEnqueue(command: EnqueueJobCommand): void {
  if (command.jobType.trim().length === 0) throw new Error("Job type is required");
  if (command.idempotencyKey.trim().length === 0) throw new Error("Job idempotency key is required");
  if (Number.isNaN(Date.parse(command.runAt))) throw new Error("Invalid job run time");
  if (!Number.isInteger(command.maxAttempts) || command.maxAttempts <= 0) throw new Error("Max attempts must be positive");
}

function freezeClaimed(row: JobRow, runId: string): ClaimedJob {
  return Object.freeze({
    id: row.id,
    runId,
    environmentId: row.environment_id as EnvironmentId,
    jobType: row.job_type,
    payload: deepFreeze(structuredClone(row.payload)),
    runAt: row.run_at.toISOString(),
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

async function rollbackQuietly(client: PgClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original failure.
  }
}
