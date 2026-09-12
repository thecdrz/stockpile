CREATE TABLE players (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  player_type text NOT NULL CHECK (player_type IN ('HUMAN', 'NPC')),
  discord_user_id text,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((player_type = 'HUMAN') = (discord_user_id IS NOT NULL)),
  UNIQUE (id, environment_id)
);

CREATE UNIQUE INDEX players_discord_identity_idx
  ON players(environment_id, discord_user_id)
  WHERE discord_user_id IS NOT NULL;

CREATE UNIQUE INDEX players_npc_name_idx
  ON players(environment_id, display_name)
  WHERE player_type = 'NPC';

CREATE TABLE player_profiles (
  player_id uuid PRIMARY KEY REFERENCES players(id),
  environment_id uuid NOT NULL,
  credit_score integer NOT NULL DEFAULT 40 CHECK (credit_score BETWEEN 0 AND 100),
  credit_rating text NOT NULL DEFAULT 'C',
  financial_status text NOT NULL DEFAULT 'New Investor',
  bankruptcy_count integer NOT NULL DEFAULT 0 CHECK (bankruptcy_count >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (player_id, environment_id) REFERENCES players(id, environment_id)
);
