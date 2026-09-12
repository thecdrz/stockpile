import type { FinancialEvent, JournalEntry, PostedFinancialEvent } from "./event.js";
import type { EconomicScope, EnvironmentId } from "./types.js";

export interface LedgerStore {
  commit(event: FinancialEvent, entries: readonly JournalEntry[]): Promise<PostedFinancialEvent>;
  findByIdempotencyKey(
    environmentId: EnvironmentId,
    scope: EconomicScope,
    idempotencyKey: string,
  ): Promise<PostedFinancialEvent | null>;
}

export class InMemoryLedgerStore implements LedgerStore {
  readonly #events = new Map<string, PostedFinancialEvent>();

  async commit(event: FinancialEvent, entries: readonly JournalEntry[]): Promise<PostedFinancialEvent> {
    const key = this.key(event.environmentId, event.scope, event.idempotencyKey);
    const existing = this.#events.get(key);
    if (existing) return existing;

    const posted = Object.freeze({ event, entries: Object.freeze([...entries]) });
    this.#events.set(key, posted);
    return posted;
  }

  async findByIdempotencyKey(
    environmentId: EnvironmentId,
    scope: EconomicScope,
    idempotencyKey: string,
  ): Promise<PostedFinancialEvent | null> {
    return this.#events.get(this.key(environmentId, scope, idempotencyKey)) ?? null;
  }

  private key(environmentId: EnvironmentId, scope: EconomicScope, idempotencyKey: string): string {
    return `${environmentId}\u0000${scope}\u0000${idempotencyKey}`;
  }
}
