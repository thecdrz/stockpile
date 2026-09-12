import type { TimeInForce } from "@stockpile/core";
import type { Security, SecurityId } from "./provider.js";

export interface SyntheticMarketSession {
  readonly mic: Security["mic"];
  readonly opensAt: string;
  readonly closesAt: string;
  readonly earlyClose?: boolean;
}

export type SyntheticMarketStatus = "OPEN" | "CLOSED" | "EARLY_CLOSED" | "UNKNOWN";

export class SyntheticExchangeCalendar {
  readonly #securityMic: ReadonlyMap<SecurityId, Security["mic"]>;
  readonly #sessions: readonly SyntheticMarketSession[];

  constructor(securities: readonly Security[], sessions: readonly SyntheticMarketSession[]) {
    this.#securityMic = new Map(securities.map((security) => [security.id, security.mic]));
    this.#sessions = Object.freeze([...sessions].sort((a, b) => a.opensAt.localeCompare(b.opensAt)));
    validateSessions(this.#sessions);
  }

  async getSession(securityId: SecurityId, at: string): Promise<{ readonly isOpen: boolean; readonly nextOpenAt?: string }> {
    const timestamp = parseTimestamp(at);
    const sessions = this.sessionsFor(securityId);
    const current = sessions.find((session) => timestamp >= Date.parse(session.opensAt) && timestamp < Date.parse(session.closesAt));
    if (current) return Object.freeze({ isOpen: true });
    const next = sessions.find((session) => Date.parse(session.opensAt) > timestamp);
    if (!next) throw new Error("Authoritative future market session is unavailable");
    return Object.freeze({ isOpen: false, nextOpenAt: next.opensAt });
  }

  async expirationFor(securityId: SecurityId, acceptedAt: string, timeInForce: TimeInForce): Promise<string> {
    const timestamp = parseTimestamp(acceptedAt);
    if (timeInForce === "GOOD_FOR_7_DAYS") return new Date(timestamp + 7 * 86_400_000).toISOString();
    const sessions = this.sessionsFor(securityId);
    const session = sessions.find((candidate) => timestamp < Date.parse(candidate.closesAt));
    if (!session) throw new Error("Authoritative order-expiration session is unavailable");
    return session.closesAt;
  }

  async priorSessionClose(securityId: SecurityId, exDate: string): Promise<string> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exDate)) throw new Error("Invalid ex-date");
    const boundary = Date.parse(`${exDate}T00:00:00.000Z`);
    const prior = this.sessionsFor(securityId).filter((session) => Date.parse(session.closesAt) < boundary).at(-1);
    if (!prior) throw new Error("Authoritative prior session is unavailable");
    return prior.closesAt;
  }

  status(securityId: SecurityId, at: string): SyntheticMarketStatus {
    const timestamp = parseTimestamp(at);
    const sessions = this.sessionsFor(securityId);
    const open = sessions.find((session) => timestamp >= Date.parse(session.opensAt) && timestamp < Date.parse(session.closesAt));
    if (open) return "OPEN";
    const justClosed = sessions.find((session) => timestamp === Date.parse(session.closesAt));
    if (justClosed?.earlyClose) return "EARLY_CLOSED";
    return sessions.some((session) => timestamp < Date.parse(session.opensAt)) ? "CLOSED" : "UNKNOWN";
  }

  private sessionsFor(securityId: SecurityId): readonly SyntheticMarketSession[] {
    const mic = this.#securityMic.get(securityId);
    if (!mic) throw new Error("Security calendar mapping is unavailable");
    return this.#sessions.filter((session) => session.mic === mic);
  }
}

function validateSessions(sessions: readonly SyntheticMarketSession[]): void {
  const priorClose = new Map<Security["mic"], number>();
  for (const session of sessions) {
    const opens = parseTimestamp(session.opensAt);
    const closes = parseTimestamp(session.closesAt);
    if (opens >= closes) throw new Error("Market session must close after it opens");
    if (opens < (priorClose.get(session.mic) ?? -Infinity)) throw new Error(`Overlapping market sessions for ${session.mic}`);
    priorClose.set(session.mic, closes);
  }
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new Error("Invalid market session time");
  return timestamp;
}
