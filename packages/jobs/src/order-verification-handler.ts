import { Rate } from "@stockpile/core";
import type {
  EnqueueJobCommand,
  SettleTradeCommand,
  SettleTradeResult,
} from "@stockpile/database";
import type { ClaimedJob } from "@stockpile/database";
import type { MarketDataProvider, SecurityId } from "@stockpile/market-data";

export interface OrderVerificationQueue {
  enqueue(command: EnqueueJobCommand): Promise<{ readonly id: string; readonly created: boolean }>;
}

export interface TradeSettlement {
  settle(command: SettleTradeCommand): Promise<SettleTradeResult>;
}

export interface OrderExpiration {
  expire(orderId: string, effectiveAt: string, idempotencyKey: string): Promise<unknown>;
}

export interface OrderVerificationOptions {
  readonly marketData: MarketDataProvider;
  readonly settlement: TradeSettlement;
  readonly lifecycle: OrderExpiration;
  readonly queue: OrderVerificationQueue;
  readonly now: () => string;
  readonly verificationIntervalSeconds: number;
  readonly maximumObservationAgeSeconds: number;
  readonly maximumFxAgeSeconds: number;
  readonly fxSpreadRate: Rate;
  readonly economyRulesetVersion: string;
  readonly executionPolicyVersion: string;
}

interface OrderVerificationPayload {
  readonly orderId: string;
  readonly securityId: string;
  readonly expiresAt: string;
  readonly requiresUsdCad: boolean;
  readonly sessionOpenAt?: string;
}

export function createOrderVerificationHandler(options: OrderVerificationOptions) {
  return async (job: ClaimedJob): Promise<void> => {
    const payload = parsePayload(job.payload);
    const now = options.now();
    if (Date.parse(now) >= Date.parse(payload.expiresAt)) {
      await options.lifecycle.expire(payload.orderId, now, `expire:${payload.orderId}`);
      return;
    }

    const [observation, fx] = await Promise.all([
      options.marketData.getLatestObservation(payload.securityId as SecurityId),
      payload.requiresUsdCad ? options.marketData.getLatestFxObservation("USD/CAD") : Promise.resolve(null),
    ]);
    if (!observation) throw new Error(`Market observation unavailable for ${payload.securityId}`);
    if (payload.requiresUsdCad && !fx) throw new Error("USD/CAD observation unavailable");

    const result = await options.settlement.settle({
      orderId: payload.orderId,
      observation: {
        securityId: observation.securityId,
        price: observation.price,
        marketTimestamp: observation.marketTimestamp.toISOString(),
        receivedAt: observation.receivedAt.toISOString(),
        freshness: observation.freshness,
        reference: observation.reference,
      },
      ...(fx
        ? {
            fx: {
              basePerForeignRate: fx.basePerForeignRate,
              spreadRate: options.fxSpreadRate,
              marketTimestamp: fx.marketTimestamp.toISOString(),
              receivedAt: fx.receivedAt.toISOString(),
              freshness: fx.freshness === "END_OF_DAY" ? "STALE" : fx.freshness,
              reference: fx.reference,
            },
            maximumFxAgeSeconds: options.maximumFxAgeSeconds,
          }
        : {}),
      now,
      maximumObservationAgeSeconds: options.maximumObservationAgeSeconds,
      economyRulesetVersion: options.economyRulesetVersion,
      executionPolicyVersion: options.executionPolicyVersion,
      ...(payload.sessionOpenAt === undefined ? {} : { sessionOpenAt: payload.sessionOpenAt }),
    });
    if (result.settled) return;

    const nextRunAt = nextVerificationTime(now, payload.expiresAt, options.verificationIntervalSeconds);
    await options.queue.enqueue({
      environmentId: job.environmentId,
      jobType: job.jobType,
      payload: job.payload,
      runAt: nextRunAt,
      maxAttempts: job.maxAttempts,
      idempotencyKey: `verify:${payload.orderId}:${nextRunAt}`,
    });
  };
}

function parsePayload(payload: ClaimedJob["payload"]): OrderVerificationPayload {
  const orderId = payload["orderId"];
  const securityId = payload["securityId"];
  const expiresAt = payload["expiresAt"];
  const requiresUsdCad = payload["requiresUsdCad"];
  const sessionOpenAt = payload["sessionOpenAt"];
  if (typeof orderId !== "string" || typeof securityId !== "string" || typeof expiresAt !== "string") {
    throw new Error("Invalid order verification payload identifiers");
  }
  if (typeof requiresUsdCad !== "boolean" || Number.isNaN(Date.parse(expiresAt))) {
    throw new Error("Invalid order verification payload settings");
  }
  if (sessionOpenAt !== undefined && typeof sessionOpenAt !== "string") {
    throw new Error("Invalid session open time");
  }
  return Object.freeze({
    orderId,
    securityId,
    expiresAt,
    requiresUsdCad,
    ...(sessionOpenAt === undefined ? {} : { sessionOpenAt }),
  });
}

function nextVerificationTime(now: string, expiresAt: string, intervalSeconds: number): string {
  if (!Number.isInteger(intervalSeconds) || intervalSeconds <= 0) throw new Error("Verification interval must be positive");
  return new Date(Math.min(Date.parse(now) + intervalSeconds * 1000, Date.parse(expiresAt))).toISOString();
}
