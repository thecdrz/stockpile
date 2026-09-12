export type ObservationFreshness = "REALTIME" | "DELAYED" | "END_OF_DAY" | "STALE" | "UNAVAILABLE";

export interface ExecutionObservation {
  readonly marketTimestamp: string;
  readonly receivedAt: string;
  readonly freshness: ObservationFreshness;
}

export interface ObservationEligibilityPolicy {
  readonly acceptedAt: string;
  readonly now: string;
  readonly maximumObservationAgeSeconds: number;
}

export type ObservationEligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: "PRE_ORDER" | "STALE" | "UNTRUSTWORTHY" | "INVALID_TIME" };

export function assessObservationEligibility(
  observation: ExecutionObservation,
  policy: ObservationEligibilityPolicy,
): ObservationEligibility {
  const marketTimestamp = Date.parse(observation.marketTimestamp);
  const receivedAt = Date.parse(observation.receivedAt);
  const acceptedAt = Date.parse(policy.acceptedAt);
  const now = Date.parse(policy.now);
  if ([marketTimestamp, receivedAt, acceptedAt, now].some(Number.isNaN) || receivedAt > now || marketTimestamp > receivedAt) {
    return Object.freeze({ eligible: false, reason: "INVALID_TIME" });
  }
  if (observation.freshness === "STALE" || observation.freshness === "UNAVAILABLE") {
    return Object.freeze({ eligible: false, reason: "UNTRUSTWORTHY" });
  }
  if (observation.freshness === "END_OF_DAY") {
    return Object.freeze({ eligible: false, reason: "UNTRUSTWORTHY" });
  }
  if (marketTimestamp < acceptedAt) return Object.freeze({ eligible: false, reason: "PRE_ORDER" });
  if (now - marketTimestamp > policy.maximumObservationAgeSeconds * 1000) {
    return Object.freeze({ eligible: false, reason: "STALE" });
  }
  return Object.freeze({ eligible: true });
}
