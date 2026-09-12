import type { ClaimedOutboxEvent } from "@stockpile/database";
import { calculateRetryAt } from "./worker.js";

export interface OutboxDeliveryQueue {
  claim(
    destination: string,
    workerId: string,
    now: string,
    leaseSeconds: number,
  ): Promise<ClaimedOutboxEvent | null>;
  delivered(event: ClaimedOutboxEvent, workerId: string, deliveredAt: string): Promise<void>;
  failed(
    event: ClaimedOutboxEvent,
    workerId: string,
    failedAt: string,
    error: string,
    retryAt: string,
  ): Promise<void>;
}

export interface OutboxDeliveryTransport {
  /**
   * Deliver the event using its stable idempotency key. Implementations must
   * treat a repeated key as the same external delivery, never a new message.
   */
  deliver(event: ClaimedOutboxEvent): Promise<void>;
}

export interface OutboxDeliveryWorkerOptions {
  readonly destination: string;
  readonly workerId: string;
  readonly leaseSeconds: number;
  readonly now: () => string;
  readonly retryBaseSeconds: number;
  readonly retryMaximumSeconds: number;
}

export type OutboxDeliveryResult = "IDLE" | "DELIVERED" | "RETRY" | "DEAD";

export class OutboxDeliveryWorker {
  constructor(
    private readonly queue: OutboxDeliveryQueue,
    private readonly transport: OutboxDeliveryTransport,
    private readonly options: OutboxDeliveryWorkerOptions,
  ) {
    if (options.destination.trim().length === 0 || options.workerId.trim().length === 0) {
      throw new Error("Outbox destination and worker ID are required");
    }
  }

  async runOne(): Promise<OutboxDeliveryResult> {
    const event = await this.queue.claim(
      this.options.destination,
      this.options.workerId,
      this.options.now(),
      this.options.leaseSeconds,
    );
    if (!event) return "IDLE";

    try {
      await this.transport.deliver(event);
      await this.queue.delivered(event, this.options.workerId, this.options.now());
      return "DELIVERED";
    } catch (error) {
      const failedAt = this.options.now();
      const retryAt = calculateRetryAt(
        failedAt,
        event.attempt,
        this.options.retryBaseSeconds,
        this.options.retryMaximumSeconds,
      );
      await this.queue.failed(event, this.options.workerId, failedAt, describeError(error), retryAt);
      return event.attempt >= event.maxAttempts ? "DEAD" : "RETRY";
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 2000);
  return `Unknown error: ${String(error)}`.slice(0, 2000);
}
