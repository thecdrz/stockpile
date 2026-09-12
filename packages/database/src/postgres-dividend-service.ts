import { Money, Quantity, Rate, convertForeignTrade, type Currency } from "@stockpile/core";
import type { DividendAction } from "@stockpile/market-data";
import type { EnvironmentId } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresOutbox } from "./postgres-outbox.js";

interface EntitlementRow extends QueryResultRow {
  position_account_id: string;
  scope: "CAREER" | "LEAGUE";
  owner_id: string;
  cash_account_id: string;
  base_currency: Currency;
  quantity: string;
}

export interface CreditDividendCommand {
  readonly environmentId: EnvironmentId;
  readonly action: DividendAction;
  /** Close of the trading session immediately preceding the ex-date. */
  readonly entitlementCutoff: string;
  readonly processedAt: string;
  readonly economyRulesetVersion: string;
  readonly basePerForeignRate?: Rate;
  readonly fxReference?: string;
}

export interface CreditDividendResult {
  readonly playersCredited: number;
}

export class PostgresDividendService {
  readonly #outbox: PostgresOutbox;
  constructor(private readonly pool: PgPoolLike, private readonly nextId: () => string) {
    this.#outbox = new PostgresOutbox(pool, nextId);
  }

  async credit(command: CreditDividendCommand): Promise<CreditDividendResult> {
    validate(command);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO corporate_actions (
           source_action_id, security_id, action_type, effective_date, terms,
           market_data_reference, detected_at
         ) VALUES ($1, $2, 'DIVIDEND', $3, $4, $5, $6)
         ON CONFLICT (source_action_id) DO NOTHING`,
        [command.action.id, command.action.securityId, command.action.exDate,
          { amountPerShare: command.action.amountPerShare.toString(), currency: command.action.amountPerShare.currency,
            paymentDate: command.action.paymentDate ?? null }, command.action.reference, command.processedAt],
      );
      const entitlements = await client.query<EntitlementRow>(
        `SELECT account.id AS position_account_id, account.scope, account.owner_id,
                cash.id AS cash_account_id, environment.base_currency,
                sum(entry.quantity_delta)::text AS quantity
         FROM position_accounts account
         JOIN environments environment ON environment.id = account.environment_id
         JOIN security_quantity_entries entry ON entry.position_account_id = account.id
         JOIN ledger_accounts cash ON cash.environment_id = account.environment_id
           AND cash.scope = account.scope AND cash.owner_id = account.owner_id AND cash.kind = 'PLAYER_CASH'
         WHERE account.environment_id = $1 AND entry.security_id = $2 AND entry.effective_at <= $3
         GROUP BY account.id, account.scope, account.owner_id, cash.id, environment.base_currency
         HAVING sum(entry.quantity_delta) > 0
         ORDER BY account.id FOR UPDATE OF account, cash`,
        [command.environmentId, command.action.securityId, command.entitlementCutoff],
      );
      let playersCredited = 0;
      for (const entitlement of entitlements.rows) {
        const existing = await client.query(
          `SELECT 1 FROM corporate_action_applications
           WHERE environment_id = $1 AND scope = $2 AND source_action_id = $3 AND position_account_id = $4`,
          [command.environmentId, entitlement.scope, command.action.id, entitlement.position_account_id],
        );
        if (existing.rowCount === 1) continue;
        const foreignAmount = command.action.amountPerShare.notional(Quantity.of(entitlement.quantity));
        const amount = convertAmount(foreignAmount, entitlement.base_currency, command);
        if (amount.isZero()) continue;
        const clearingAccountId = await ensureClearingAccount(client, command.environmentId, entitlement.scope, this.nextId());
        const eventId = this.nextId();
        const effectiveAt = command.action.paymentDate
          ? `${command.action.paymentDate}T00:00:00.000Z`
          : `${command.action.exDate}T00:00:00.000Z`;
        await client.query(
          `INSERT INTO financial_events (
             id, environment_id, scope, event_type, status, business_effective_at, created_at, posted_at,
             source_type, source_id, idempotency_key, correlation_id, economy_ruleset_version,
             market_data_reference, metadata
           ) VALUES ($1, $2, $3, 'DIVIDEND', 'POSTED', $4, $5, $5, 'CORPORATE_ACTION', $6, $7, $8, $9, $10, $11)`,
          [eventId, command.environmentId, entitlement.scope, effectiveAt, command.processedAt,
            command.action.id, `dividend:${command.action.id}:${entitlement.position_account_id}`,
            this.nextId(), command.economyRulesetVersion, command.action.reference,
            { quantity: entitlement.quantity, amountPerShare: command.action.amountPerShare.toString(),
              listingCurrency: command.action.amountPerShare.currency, fxReference: command.fxReference ?? null }],
        );
        for (const [accountId, direction] of [[entitlement.cash_account_id, "DEBIT"], [clearingAccountId, "CREDIT"]] as const) {
          await client.query(
            `INSERT INTO journal_entries (
               id, financial_event_id, ledger_account_id, environment_id, scope,
               direction, amount, currency, created_at, metadata
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [this.nextId(), eventId, accountId, command.environmentId, entitlement.scope,
              direction, amount.toString(), amount.currency, command.processedAt, { actionId: command.action.id }],
          );
        }
        await client.query(
          `INSERT INTO corporate_action_applications (
             id, environment_id, scope, source_action_id, position_account_id, financial_event_id, applied_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [this.nextId(), command.environmentId, entitlement.scope, command.action.id,
            entitlement.position_account_id, eventId, command.processedAt],
        );
        await this.#outbox.enqueueUsingClient(client, {
          environmentId: command.environmentId,
          eventType: "DividendCredited",
          payload: {
            financialEventId: eventId,
            positionAccountId: entitlement.position_account_id,
            securityId: command.action.securityId,
            amount: amount.toString(),
            currency: amount.currency,
          },
          destination: "DISCORD",
          availableAt: command.processedAt,
          maxAttempts: 8,
          idempotencyKey: `dividend:${command.action.id}:${entitlement.position_account_id}`,
        });
        playersCredited += 1;
      }
      await client.query("COMMIT");
      return Object.freeze({ playersCredited });
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally { client.release(); }
  }
}

function convertAmount(amount: Money, baseCurrency: Currency, command: CreditDividendCommand): Money {
  if (amount.currency === baseCurrency) return amount;
  if (!command.basePerForeignRate || !command.fxReference) throw new Error("Foreign dividend requires authoritative FX evidence");
  return convertForeignTrade(amount, baseCurrency, command.basePerForeignRate, Rate.of("0"), "SELL").grossBaseAmount;
}

async function ensureClearingAccount(client: PgClientLike, environmentId: EnvironmentId, scope: string, proposedId: string): Promise<string> {
  const inserted = await client.query<{ id: string } & QueryResultRow>(
    `INSERT INTO ledger_accounts (id, environment_id, scope, kind, owner_id)
     VALUES ($1, $2, $3, 'CORPORATE_ACTION_CLEARING', NULL)
     ON CONFLICT (environment_id, scope, kind) WHERE owner_id IS NULL DO NOTHING RETURNING id`,
    [proposedId, environmentId, scope],
  );
  if (inserted.rows[0]) return inserted.rows[0].id;
  const existing = await client.query<{ id: string } & QueryResultRow>(
    `SELECT id FROM ledger_accounts WHERE environment_id = $1 AND scope = $2
       AND kind = 'CORPORATE_ACTION_CLEARING' AND owner_id IS NULL`, [environmentId, scope]);
  if (!existing.rows[0]) throw new Error("Corporate-action clearing account conflict did not resolve");
  return existing.rows[0].id;
}

function validate(command: CreditDividendCommand): void {
  if (Number.isNaN(Date.parse(command.entitlementCutoff)) || Number.isNaN(Date.parse(command.processedAt))) {
    throw new Error("Invalid dividend processing time");
  }
  if (command.economyRulesetVersion.trim().length === 0) throw new Error("Economy ruleset version is required");
}

async function rollbackQuietly(client: PgClientLike): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
}
