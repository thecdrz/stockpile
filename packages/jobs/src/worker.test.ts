import type { ClaimedJob } from "@stockpile/database";
import { describe, expect, it, vi } from "vitest";
import { JobWorker, calculateRetryAt, type JobQueue } from "./worker.js";

const job: ClaimedJob = {
  id: "job:1",
  runId: "run:1",
  environmentId: "environment:1" as never,
  jobType: "TEST",
  payload: {},
  runAt: "2026-09-12T12:00:00.000Z",
  attempt: 1,
  maxAttempts: 3,
  idempotencyKey: "test:1",
};

function queueReturning(claimed: ClaimedJob | null): JobQueue & {
  complete: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
} {
  return {
    claim: vi.fn(async () => claimed),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  };
}

const options = {
  workerId: "worker:1",
  leaseSeconds: 60,
  now: () => "2026-09-12T12:00:00.000Z",
  retryBaseSeconds: 10,
  retryMaximumSeconds: 300,
};

describe("JobWorker", () => {
  it("returns idle without invoking a handler when no work is due", async () => {
    const queue = queueReturning(null);
    const handler = vi.fn(async () => undefined);
    await expect(new JobWorker(queue, { TEST: handler }, options).runOne()).resolves.toBe("IDLE");
    expect(handler).not.toHaveBeenCalled();
  });

  it("completes a successfully handled job", async () => {
    const queue = queueReturning(job);
    const handler = vi.fn(async () => undefined);
    await expect(new JobWorker(queue, { TEST: handler }, options).runOne()).resolves.toBe("COMPLETED");
    expect(handler).toHaveBeenCalledWith(job);
    expect(queue.complete).toHaveBeenCalledOnce();
  });

  it("records a deterministic retry after failure", async () => {
    const queue = queueReturning(job);
    const handler = vi.fn(async () => {
      throw new Error("temporary");
    });
    await expect(new JobWorker(queue, { TEST: handler }, options).runOne()).resolves.toBe("RETRY");
    expect(queue.fail).toHaveBeenCalledWith(
      job,
      "worker:1",
      options.now(),
      "Error: temporary",
      "2026-09-12T12:00:10.000Z",
    );
  });
});

describe("calculateRetryAt", () => {
  it("uses capped exponential backoff", () => {
    expect(calculateRetryAt("2026-09-12T12:00:00.000Z", 10, 10, 300)).toBe("2026-09-12T12:05:00.000Z");
  });
});
