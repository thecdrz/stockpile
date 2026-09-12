import type { ClaimedOutboxEvent } from "@stockpile/database";
import { describe, expect, it, vi } from "vitest";
import {
  OutboxDeliveryWorker,
  type OutboxDeliveryQueue,
  type OutboxDeliveryTransport,
} from "./outbox-delivery-worker.js";

const event: ClaimedOutboxEvent = {
  id: "outbox:1",
  environmentId: "environment:1" as never,
  eventType: "TradeExecuted",
  payload: { orderId: "order:1" },
  destination: "DISCORD",
  attempt: 1,
  maxAttempts: 3,
  idempotencyKey: "trade:order:1",
};

function queueReturning(claimed: ClaimedOutboxEvent | null): OutboxDeliveryQueue & {
  delivered: ReturnType<typeof vi.fn>;
  failed: ReturnType<typeof vi.fn>;
} {
  return {
    claim: vi.fn(async () => claimed),
    delivered: vi.fn(async () => undefined),
    failed: vi.fn(async () => undefined),
  };
}

const options = {
  destination: "DISCORD",
  workerId: "discord-worker:1",
  leaseSeconds: 60,
  now: () => "2026-09-12T12:00:00.000Z",
  retryBaseSeconds: 10,
  retryMaximumSeconds: 300,
};

describe("OutboxDeliveryWorker", () => {
  it("is idle when no delivery is due", async () => {
    const queue = queueReturning(null);
    const transport: OutboxDeliveryTransport = { deliver: vi.fn(async () => undefined) };
    await expect(new OutboxDeliveryWorker(queue, transport, options).runOne()).resolves.toBe("IDLE");
    expect(transport.deliver).not.toHaveBeenCalled();
  });

  it("marks a successfully delivered event using the claimed lease", async () => {
    const queue = queueReturning(event);
    const transport: OutboxDeliveryTransport = { deliver: vi.fn(async () => undefined) };
    await expect(new OutboxDeliveryWorker(queue, transport, options).runOne()).resolves.toBe("DELIVERED");
    expect(transport.deliver).toHaveBeenCalledWith(event);
    expect(queue.delivered).toHaveBeenCalledWith(event, options.workerId, options.now());
  });

  it("records a deterministic retry without losing the stable delivery key", async () => {
    const queue = queueReturning(event);
    const transport: OutboxDeliveryTransport = {
      deliver: vi.fn(async (claimed) => {
        expect(claimed.idempotencyKey).toBe("trade:order:1");
        throw new Error("Discord unavailable");
      }),
    };
    await expect(new OutboxDeliveryWorker(queue, transport, options).runOne()).resolves.toBe("RETRY");
    expect(queue.failed).toHaveBeenCalledWith(
      event,
      options.workerId,
      options.now(),
      "Error: Discord unavailable",
      "2026-09-12T12:00:10.000Z",
    );
  });

  it("dead-letters a failed final attempt", async () => {
    const finalAttempt = { ...event, attempt: 3 };
    const queue = queueReturning(finalAttempt);
    const transport: OutboxDeliveryTransport = {
      deliver: vi.fn(async () => {
        throw new Error("permanent");
      }),
    };
    await expect(new OutboxDeliveryWorker(queue, transport, options).runOne()).resolves.toBe("DEAD");
  });
});
