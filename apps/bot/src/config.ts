export interface BotConfig {
  readonly discordToken: string;
  readonly applicationId: string;
  readonly guildId: string;
  readonly databaseUrl: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): BotConfig {
  return Object.freeze({
    discordToken: required(environment, "DISCORD_TOKEN"),
    applicationId: required(environment, "DISCORD_APPLICATION_ID"),
    guildId: required(environment, "DISCORD_GUILD_ID"),
    databaseUrl: required(environment, "DATABASE_URL"),
  });
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}
