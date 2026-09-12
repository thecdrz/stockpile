import type { ClaimedJob } from "@stockpile/database";

export interface JobQueue {
  claim(workerId: string, now: string, leaseSeconds: number): Promise<ClaimedJob | null>;
  complete(job: ClaimedJob, workerId: string, finishedAt: string): Promise<void>;
  fail(job: ClaimedJob, workerId: string, failedAt: string, error: string, retryAt: string): Promise<void>;
}

export type JobHandler = (job: ClaimedJob) => Promise<void>;

export interface JobWorkerOptions {
  readonly workerId: string;
  readonly leaseSeconds: number;
  readonly now: () => string;
  readonly retryBaseSeconds: number;
  readonly retryMaximumSeconds: number;
}

export type RunOneResult = "IDLE" | "COMPLETED" | "RETRY" | "DEAD";

export class JobWorker {
  readonly #handlers: ReadonlyMap<string, JobHandler>;

  constructor(
    private readonly queue: JobQueue,
    handlers: Readonly<Record<string, JobHandler>>,
    private readonly options: JobWorkerOptions,
  ) {
    this.#handlers = new Map(Object.entries(handlers));
  }

  async runOne(): Promise<RunOneResult> {
    const claimedAt = this.options.now();
    const job = await this.queue.claim(this.options.workerId, claimedAt, this.options.leaseSeconds);
    if (!job) return "IDLE";

    try {
      const handler = this.#handlers.get(job.jobType);
      if (!handler) throw new Error(`No handler registered for job type ${job.jobType}`);
      await handler(job);
      await this.queue.complete(job, this.options.workerId, this.options.now());
      return "COMPLETED";
    } catch (error) {
      const failedAt = this.options.now();
      const retryAt = calculateRetryAt(
        failedAt,
        job.attempt,
        this.options.retryBaseSeconds,
        this.options.retryMaximumSeconds,
      );
      await this.queue.fail(job, this.options.workerId, failedAt, describeError(error), retryAt);
      return job.attempt >= job.maxAttempts ? "DEAD" : "RETRY";
    }
  }
}

export function calculateRetryAt(
  failedAt: string,
  attempt: number,
  baseSeconds: number,
  maximumSeconds: number,
): string {
  const timestamp = Date.parse(failedAt);
  if (Number.isNaN(timestamp)) throw new Error("Invalid failure time");
  if (!Number.isInteger(attempt) || attempt <= 0) throw new Error("Attempt must be positive");
  if (baseSeconds <= 0 || maximumSeconds < baseSeconds) throw new Error("Invalid retry policy");
  const exponent = Math.min(attempt - 1, 30);
  const delaySeconds = Math.min(baseSeconds * 2 ** exponent, maximumSeconds);
  return new Date(timestamp + delaySeconds * 1000).toISOString();
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 2000);
  return `Unknown error: ${String(error)}`.slice(0, 2000);
}
