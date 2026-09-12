import type { CorrelationId, EnvironmentId } from "@stockpile/ledger";
import type { QueryResultRow } from "pg";
import type { PgClientLike, PgPoolLike } from "./pg-types.js";
import { PostgresCareerAccountService, type OpenedCareerAccount } from "./postgres-career-account-service.js";

interface PlayerRow extends QueryResultRow {
  id: string;
  display_name: string;
  player_type: "HUMAN" | "NPC";
}

export interface CreateHumanPlayerCommand {
  readonly environmentId: EnvironmentId;
  readonly discordUserId: string;
  readonly displayName: string;
  readonly effectiveAt: string;
  readonly correlationId: CorrelationId;
  readonly economyRulesetVersion: string;
}

export interface CreatedPlayer {
  readonly id: string;
  readonly displayName: string;
  readonly playerType: "HUMAN" | "NPC";
  readonly created: boolean;
  readonly career: OpenedCareerAccount;
}

export class PostgresPlayerService {
  readonly #career: PostgresCareerAccountService;

  constructor(
    private readonly pool: PgPoolLike,
    private readonly nextId: () => string,
    now: () => string,
  ) {
    this.#career = new PostgresCareerAccountService({ pool, nextId, now });
  }

  async createHuman(command: CreateHumanPlayerCommand): Promise<CreatedPlayer> {
    if (command.discordUserId.trim().length === 0 || command.displayName.trim().length === 0) {
      throw new Error("Discord user ID and display name are required");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const proposedId = this.nextId();
      const inserted = await client.query<PlayerRow>(
        `INSERT INTO players (id, environment_id, player_type, discord_user_id, display_name)
         VALUES ($1, $2, 'HUMAN', $3, $4)
         ON CONFLICT (environment_id, discord_user_id) WHERE discord_user_id IS NOT NULL DO NOTHING
         RETURNING id, display_name, player_type`,
        [proposedId, command.environmentId, command.discordUserId, command.displayName.trim()],
      );
      let player = inserted.rows[0];
      const created = player !== undefined;
      if (!player) {
        const existing = await client.query<PlayerRow>(
          `SELECT id, display_name, player_type FROM players
           WHERE environment_id = $1 AND discord_user_id = $2`,
          [command.environmentId, command.discordUserId],
        );
        player = existing.rows[0];
      }
      if (!player) throw new Error("Player identity conflict did not resolve");
      await client.query(
        `INSERT INTO player_profiles (player_id, environment_id)
         VALUES ($1, $2) ON CONFLICT (player_id) DO NOTHING`,
        [player.id, command.environmentId],
      );
      const career = await this.#career.openUsingClient(client, {
        environmentId: command.environmentId,
        playerId: player.id,
        businessEffectiveAt: command.effectiveAt,
        correlationId: command.correlationId,
        economyRulesetVersion: command.economyRulesetVersion,
      });
      await client.query("COMMIT");
      return Object.freeze({
        id: player.id,
        displayName: player.display_name,
        playerType: player.player_type,
        created,
        career,
      });
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function rollbackQuietly(client: PgClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original failure.
  }
}
