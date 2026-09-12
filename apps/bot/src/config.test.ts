import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("requires all private-guild runtime settings", () => {
    expect(() => loadConfig({})).toThrow("DISCORD_TOKEN");
    expect(loadConfig({ DISCORD_TOKEN: "t", DISCORD_APPLICATION_ID: "a", DISCORD_GUILD_ID: "g", DATABASE_URL: "p" }))
      .toEqual({ discordToken: "t", applicationId: "a", guildId: "g", databaseUrl: "p" });
  });
});
