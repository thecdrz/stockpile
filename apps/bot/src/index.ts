import { randomUUID } from "node:crypto";
import { CareerDashboardService, SubmitTradeService } from "@stockpile/application";
import { Rate } from "@stockpile/core";
import {
  PostgresEnvironmentService,
  PostgresInteractionRequestStore,
  PostgresJobQueue,
  PostgresOrderLifecycleService,
  PostgresOrderService,
  PostgresOutbox,
  PostgresPlayerService,
  PostgresPortfolioReader,
  PostgresSecurityDirectory,
  PostgresTradeSettlementService,
  PostgresTradingContextResolver,
  PostgresTransactionReader,
  migrateDatabase,
  type ClaimedOutboxEvent,
  type PgPoolLike,
} from "@stockpile/database";
import {
  JobWorker,
  OutboxDeliveryWorker,
  createOrderVerificationHandler,
  type OutboxDeliveryTransport,
} from "@stockpile/jobs";
import type { EnvironmentId, JsonObject } from "@stockpile/ledger";
import type { Security } from "@stockpile/market-data";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  ModalSubmitInteraction,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import pg from "pg";
import { loadConfig } from "./config.js";
import { formatDiscordTime, formatMoney, formatQuantity, transactionLabel } from "./presentation.js";
import { MVP_SECURITIES, MvpAlwaysOpenSessionPolicy, MvpSyntheticMarketDataProvider } from "./synthetic-market.js";

const { Pool } = pg;
const config = loadConfig();
const now = (): string => new Date().toISOString();
const pool = new Pool({ connectionString: config.databaseUrl });
const database = pool as unknown as PgPoolLike;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const market = new MvpSyntheticMarketDataProvider();
const sessions = new MvpAlwaysOpenSessionPolicy();
const environments = new PostgresEnvironmentService(database, randomUUID);
const players = new PostgresPlayerService(database, randomUUID, now);
const portfolios = new PostgresPortfolioReader(database);
const dashboard = new CareerDashboardService(portfolios, market, now);
const transactions = new PostgresTransactionReader(database);
const requests = new PostgresInteractionRequestStore(database, randomUUID);
const jobQueue = new PostgresJobQueue(database, randomUUID);
const outbox = new PostgresOutbox(database, randomUUID);
const orders = new PostgresOrderService(database, randomUUID);
const lifecycle = new PostgresOrderLifecycleService(database, randomUUID);
const settlement = new PostgresTradeSettlementService(database, randomUUID);
const submitTrade = new SubmitTradeService({
  contexts: new PostgresTradingContextResolver(database),
  marketData: market,
  sessions,
  expirations: sessions,
  orders,
  nextId: randomUUID,
  now,
  fxSpreadRate: Rate.of("0.0025"),
  verificationMaximumAttempts: 12,
});

let environmentId: EnvironmentId;
let workerTimer: NodeJS.Timeout | undefined;
let workerRunning = false;

async function start(): Promise<void> {
  await migrateDatabase(database);
  const environment = await environments.ensure(config.guildId, "CAD");
  environmentId = environment.id;
  await seedSecurities();
  await registerCommand();
  attachInteractionHandler();
  await client.login(config.discordToken);
  startWorkers();
  console.log(`Stockpile MVP ready in guild ${config.guildId} with synthetic market data only.`);
}

async function seedSecurities(): Promise<void> {
  const directory = new PostgresSecurityDirectory(database, randomUUID);
  for (const security of MVP_SECURITIES) {
    await directory.synchronize({
      securityId: security.id,
      symbol: security.symbol,
      name: security.name,
      exchange: security.exchange,
      mic: security.mic,
      currency: security.currency,
      countryCode: security.currency === "CAD" ? "CA" : "US",
      kind: security.kind,
      provider: "SYNTHETIC_MVP",
      providerSecurityId: security.symbol,
      eligibleForTrading: true,
      observedAt: now(),
    });
  }
}

async function registerCommand(): Promise<void> {
  const command = new SlashCommandBuilder()
    .setName("stockpile")
    .setDescription("Open your private Stockpile dashboard");
  await new REST({ version: "10" }).setToken(config.discordToken).put(
    Routes.applicationGuildCommands(config.applicationId, config.guildId),
    { body: [command.toJSON()] },
  );
}

function attachInteractionHandler(): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.inGuild() || interaction.guildId !== config.guildId) {
        if (interaction.isRepliable()) await interaction.reply({ content: "Stockpile is limited to its configured private server.", ephemeral: true });
        return;
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "stockpile") await openHome(interaction);
      else if (interaction.isButton()) await handleButton(interaction);
      else if (interaction.isStringSelectMenu() && interaction.customId === "stockpile:security") await chooseSecurity(interaction);
      else if (interaction.isModalSubmit() && interaction.customId.startsWith("stockpile:trade-modal:")) await previewTrade(interaction);
    } catch (error) {
      console.error(error);
      const content = `Couldn’t complete that action: ${friendlyError(error)}`;
      if (!interaction.isRepliable()) return;
      if (interaction.replied || interaction.deferred) await interaction.editReply({ content, embeds: [], components: [] });
      else await interaction.reply({ content, ephemeral: true });
    }
  });
}

async function ensurePlayer(userId: string, displayName: string): Promise<void> {
  await players.createHuman({
    environmentId,
    discordUserId: userId,
    displayName,
    effectiveAt: now(),
    correlationId: randomUUID() as never,
    economyRulesetVersion: "mvp-1",
  });
}

async function openHome(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  await ensurePlayer(interaction.user.id, interaction.user.globalName ?? interaction.user.username);
  await interaction.editReply(await dashboardMessage(interaction.user.id, false));
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId === "stockpile:trade") {
    await interaction.deferUpdate();
    await interaction.editReply(await tradeMenuMessage());
    return;
  }
  if (interaction.customId.startsWith("stockpile:side:")) {
    await interaction.deferUpdate();
    const [, , securityId, side] = interaction.customId.split(":");
    await interaction.editReply(await orderTypeMessage(securityId!, side as "BUY" | "SELL"));
    return;
  }
  if (interaction.customId.startsWith("stockpile:type:")) {
    const [, , securityId, side, type] = interaction.customId.split(":");
    await interaction.showModal(tradeModal(securityId!, side as "BUY" | "SELL", type as "MARKET" | "LIMIT"));
    return;
  }
  await interaction.deferUpdate();
  if (interaction.customId === "stockpile:home") await interaction.editReply(await dashboardMessage(interaction.user.id, false));
  else if (interaction.customId === "stockpile:portfolio") await interaction.editReply(await dashboardMessage(interaction.user.id, true));
  else if (interaction.customId === "stockpile:history") await interaction.editReply(await historyMessage(interaction.user.id));
  else if (interaction.customId.startsWith("stockpile:confirm:")) await confirmTrade(interaction, interaction.customId.slice(18));
  else if (interaction.customId.startsWith("stockpile:cancel:")) await cancelTrade(interaction, interaction.customId.slice(17));
}

async function tradeMenuMessage() {
  const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle("↗️ Make a trade")
    .setDescription("Choose one of the fictional securities currently available in the practice market.")
    .addFields({
      name: "Available now",
      value: MVP_SECURITIES.map((security) => `**${security.symbol}** · ${security.name}\n${security.currency} · ${security.kind === "ETF" ? "Fund" : "Stock"}`).join("\n\n"),
    }).setFooter({ text: "Synthetic fixtures only • Real tickers such as NVDA are not connected yet" });
  const select = new StringSelectMenuBuilder().setCustomId("stockpile:security").setPlaceholder("Choose a security…")
    .addOptions(MVP_SECURITIES.map((security) => ({
      label: `${security.symbol} · ${security.name}`,
      description: `${security.currency} ${security.kind === "ETF" ? "fund" : "stock"} · practice market`,
      value: security.id,
      emoji: security.currency === "CAD" ? "🇨🇦" : "🇺🇸",
    })));
  return { content: "", embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), navigationRow("trade")] };
}

async function chooseSecurity(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();
  const securityId = interaction.values[0];
  const security = MVP_SECURITIES.find((candidate) => candidate.id === securityId);
  if (!security) throw new Error("That security is unavailable.");
  const observation = await market.getLatestObservation(security.id);
  if (!observation) throw new Error("Practice quote unavailable.");
  const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`${security.symbol} · ${security.name}`)
    .setDescription(`### ${formatMoney(observation.price.toString(), security.currency)}\nPractice quote updated ${formatDiscordTime(observation.marketTimestamp.toISOString())}`)
    .addFields(
      { name: "Market", value: security.exchange === "SYNTHETIC_CA" ? "Canada practice exchange" : "US practice exchange", inline: true },
      { name: "Type", value: security.kind === "ETF" ? "Fund" : "Stock", inline: true },
    ).setFooter({ text: "Fictional security • Synthetic price • No real money" });
  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`stockpile:side:${security.id}:BUY`).setEmoji("🟢").setLabel("Buy").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`stockpile:side:${security.id}:SELL`).setEmoji("🔵").setLabel("Sell").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("stockpile:trade").setLabel("Back").setStyle(ButtonStyle.Secondary),
  );
  await interaction.editReply({ content: "", embeds: [embed], components: [actions] });
}

async function orderTypeMessage(securityId: string, side: "BUY" | "SELL") {
  const security = MVP_SECURITIES.find((candidate) => candidate.id === securityId);
  if (!security) throw new Error("That security is unavailable.");
  const embed = new EmbedBuilder().setColor(side === "BUY" ? 0x2ecc71 : 0x3498db)
    .setTitle(`${side === "BUY" ? "Buy" : "Sell"} ${security.symbol}`)
    .setDescription("How should this order execute?")
    .addFields(
      { name: "Market", value: "Use the next verified practice price. Fastest and simplest." },
      { name: "Limit", value: side === "BUY" ? "Only buy at or below your chosen price." : "Only sell at or above your chosen price." },
    );
  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`stockpile:type:${security.id}:${side}:MARKET`).setLabel("Market order").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`stockpile:type:${security.id}:${side}:LIMIT`).setLabel("Limit order").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("stockpile:trade").setLabel("Back").setStyle(ButtonStyle.Secondary),
  );
  return { content: "", embeds: [embed], components: [actions] };
}

function tradeModal(securityId: string, side: "BUY" | "SELL", type: "MARKET" | "LIMIT"): ModalBuilder {
  const security = MVP_SECURITIES.find((candidate) => candidate.id === securityId);
  if (!security) throw new Error("Security is unavailable.");
  const modal = new ModalBuilder().setCustomId(`stockpile:trade-modal:${securityId}:${side}:${type}`)
    .setTitle(`${side === "BUY" ? "Buy" : "Sell"} ${security.symbol} · ${type === "MARKET" ? "Market" : "Limit"}`)
    .addComponents(inputRow("quantity", "How many shares?", "Example: 1 or 2.5"));
  if (type === "LIMIT") modal.addComponents(inputRow("limit", `${side === "BUY" ? "Maximum" : "Minimum"} price per share (${security.currency})`, "Example: 52.25"));
  return modal;
}

function inputRow(id: string, label: string, placeholder: string, required = true): ActionRowBuilder<TextInputBuilder> {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder).setRequired(required).setStyle(TextInputStyle.Short),
  );
}

async function previewTrade(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  await ensurePlayer(interaction.user.id, interaction.user.globalName ?? interaction.user.username);
  const [, , securityId, side, type] = interaction.customId.split(":");
  const quantity = interaction.fields.getTextInputValue("quantity").trim();
  const rawLimit = type === "LIMIT" ? interaction.fields.getTextInputValue("limit").trim() : "";
  if (side !== "BUY" && side !== "SELL") throw new Error("Side must be BUY or SELL.");
  if (type !== "MARKET" && type !== "LIMIT") throw new Error("Order type must be MARKET or LIMIT.");
  if (!/^\d+(?:\.\d{1,8})?$/.test(quantity) || Number(quantity) <= 0) throw new Error("Quantity must be a positive number with at most 8 decimals.");
  if (type === "LIMIT" && (!/^\d+(?:\.\d{1,8})?$/.test(rawLimit) || Number(rawLimit) <= 0)) throw new Error("A positive limit price is required.");
  const security = MVP_SECURITIES.find((candidate) => candidate.id === securityId);
  if (!security) throw new Error("That security is no longer available.");
  const observation = await market.getLatestObservation(security.id);
  if (!observation) throw new Error("Synthetic quote unavailable.");
  const payload = {
    securityId: security.id,
    symbol: security.symbol,
    side,
    type,
    quantity,
    ...(type === "LIMIT" ? { limitPrice: rawLimit } : {}),
  } as JsonObject;
  const createdAt = now();
  const request = await requests.createTrade(environmentId, interaction.user.id, payload, createdAt, new Date(Date.parse(createdAt) + 10 * 60_000).toISOString());
  const estimated = (Number(quantity) * Number(type === "LIMIT" ? rawLimit : observation.price.toString())).toFixed(2);
  const fxNote = security.currency === "USD" ? "USD trade; CAD conversion and 0.25% synthetic FX spread apply." : "CAD trade; no FX conversion.";
  const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle("🧾 Review your order").setDescription(
    `### ${side === "BUY" ? "Buy" : "Sell"} ${formatQuantity(quantity)} ${security.symbol}\n${security.name}`,
  ).addFields(
    { name: "Order type", value: type === "MARKET" ? "Market" : `Limit · ${formatMoney(rawLimit, security.currency)}`, inline: true },
    { name: "Practice quote", value: formatMoney(observation.price.toString(), security.currency), inline: true },
    { name: "Estimated value", value: formatMoney(estimated, security.currency), inline: true },
    { name: "Settlement", value: `${fxNote}\nQuote updated ${formatDiscordTime(observation.marketTimestamp.toISOString())}.` },
  ).setFooter({ text: "Practice market • Expires in 10 minutes • No real money" });
  await interaction.editReply({ embeds: [embed], components: [confirmRow(request.id)] });
}

async function confirmTrade(interaction: ButtonInteraction, requestId: string): Promise<void> {
  const request = await requests.getTrade(environmentId, interaction.user.id, requestId, now());
  if (!request) throw new Error("This preview expired or does not belong to you. Start a new trade.");
  const payload = request.payload;
  const securityId = requiredPayload(payload, "securityId");
  const result = await submitTrade.submit({
    environmentId,
    discordUserId: interaction.user.id,
    actionRequestId: request.id,
    scope: "CAREER",
    securityId: securityId as never,
    side: requiredPayload(payload, "side") as "BUY" | "SELL",
    type: requiredPayload(payload, "type") as "MARKET" | "LIMIT",
    quantity: requiredPayload(payload, "quantity"),
    ...(typeof payload["limitPrice"] === "string" ? { limitPrice: payload["limitPrice"] } : {}),
    timeInForce: "DAY",
  });
  await requests.markSubmitted(request.id, result.orderId, now());
  const symbol = requiredPayload(payload, "symbol");
  const side = requiredPayload(payload, "side");
  const quantity = requiredPayload(payload, "quantity");
  const submittedEmbed = new EmbedBuilder().setColor(0x2ecc71).setTitle("✅ Order received").setDescription(
    `**${side === "BUY" ? "Buy" : "Sell"} ${formatQuantity(quantity)} ${symbol}** is queued for automatic settlement.`,
  ).addFields({ name: "What happens next?", value: "We’ll verify the latest practice price, settle the order, and send you a fill receipt." })
    .setFooter({ text: `Order ${result.orderId.slice(0, 8)} • Practice market` });
  await interaction.editReply({ content: "", embeds: [submittedEmbed], components: [navigationRow("trade")] });
  void pumpWorkers();
}

async function cancelTrade(interaction: ButtonInteraction, requestId: string): Promise<void> {
  const cancelled = await requests.cancel(environmentId, interaction.user.id, requestId, now());
  const embed = new EmbedBuilder().setColor(cancelled ? 0x95a5a6 : 0xe67e22)
    .setTitle(cancelled ? "Order cancelled" : "Preview unavailable")
    .setDescription(cancelled ? "Nothing was submitted and your balance was not changed." : "This preview was already used or expired. Start a new trade when you’re ready.");
  await interaction.editReply({ content: "", embeds: [embed], components: [navigationRow("trade")] });
}

async function dashboardMessage(userId: string, detailed: boolean) {
  const data = await dashboard.get(environmentId, userId);
  if (!data) throw new Error("Player account unavailable.");
  const holdings = data.holdings.length === 0
    ? "Your portfolio is ready. Start with **MAPL**, **NSTAR**, or **ORBT** and build your first position."
    : data.holdings.map((holding) => {
      const value = holding.marketValue ? formatMoney(holding.marketValue.toString(), data.baseCurrency) : "Price unavailable";
      const price = holding.latestPrice ? formatMoney(holding.latestPrice, holding.listingCurrency) : "Unavailable";
      const marker = holding.valuationStatus === "FRESH" ? "🟢" : holding.valuationStatus === "STALE" ? "🟡" : "⚪";
      return `${marker} **${holding.symbol}** · ${formatQuantity(holding.quantity.toString())} shares\n└ ${value}  •  ${price}/share`;
    }).join("\n\n");
  const title = detailed ? "📊 Your portfolio" : `📈 ${data.displayName}’s Stockpile`;
  const description = detailed
    ? "Your Career Account at a glance. Practice prices update every minute."
    : data.holdings.length === 0
      ? "Welcome to the market. You have **$100,000 in practice cash** and three fictional securities to explore."
      : "Your Career Account is open and the practice market is moving.";
  const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(title).setDescription(description).addFields(
    { name: "💵 Available", value: `**${formatMoney(data.availableCash.toString(), data.baseCurrency)}**`, inline: true },
    { name: "💼 Net worth", value: `**${formatMoney(data.estimatedNetWorth.toString(), data.baseCurrency)}**`, inline: true },
    { name: "🔒 Reserved", value: formatMoney(data.reservedCash.toString(), data.baseCurrency), inline: true },
    { name: data.holdings.length === 0 ? "Ready when you are" : `Holdings · ${data.holdings.length}`, value: holdings },
  ).setFooter({ text: "Practice market • Synthetic prices • No real money" });
  return { content: "", embeds: [embed], components: [navigationRow(detailed ? "portfolio" : "home")] };
}

async function historyMessage(userId: string) {
  const records = await transactions.recentCareer(environmentId, userId, 10);
  const lines = records.length === 0 ? "Your activity will appear here after your first trade." : records.map((record) => {
    const amount = formatMoney(record.cashEffect.toString(), record.cashEffect.currency, true);
    return `**${transactionLabel(record.eventType)}**  ·  ${amount}\n${formatDiscordTime(record.effectiveAt)}`;
  }).join("\n\n");
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("🧾 Account activity").setDescription(lines)
    .setFooter({ text: "Permanent, auditable Career Account history" });
  return { content: "", embeds: [embed], components: [navigationRow("history")] };
}

function navigationRow(active?: "home" | "portfolio" | "trade" | "history"): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("stockpile:home").setEmoji("🏠").setLabel("Home").setStyle(active === "home" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("stockpile:portfolio").setEmoji("📊").setLabel("Portfolio").setStyle(active === "portfolio" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("stockpile:trade").setEmoji("↗️").setLabel("Trade").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("stockpile:history").setEmoji("🧾").setLabel("Activity").setStyle(active === "history" ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

function confirmRow(requestId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`stockpile:confirm:${requestId}`).setLabel("Confirm").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`stockpile:cancel:${requestId}`).setLabel("Cancel").setStyle(ButtonStyle.Danger),
  );
}

function requiredPayload(payload: JsonObject, key: string): string {
  const value = payload[key];
  if (typeof value !== "string") throw new Error("Stored trade preview is invalid.");
  return value;
}

function startWorkers(): void {
  workerTimer = setInterval(() => void pumpWorkers(), 1_000);
  void pumpWorkers();
}

async function pumpWorkers(): Promise<void> {
  if (workerRunning || !client.isReady()) return;
  workerRunning = true;
  try {
    const jobWorker = new JobWorker(jobQueue, {
      VERIFY_ORDER: createOrderVerificationHandler({
        marketData: market,
        settlement,
        lifecycle,
        queue: jobQueue,
        now,
        verificationIntervalSeconds: 30,
        maximumObservationAgeSeconds: 120,
        maximumFxAgeSeconds: 120,
        fxSpreadRate: Rate.of("0.0025"),
        economyRulesetVersion: "mvp-1",
        executionPolicyVersion: "synthetic-mvp-1",
      }),
    }, { workerId: `bot-jobs:${process.pid}`, leaseSeconds: 30, now, retryBaseSeconds: 2, retryMaximumSeconds: 60 });
    const deliveryWorker = new OutboxDeliveryWorker(outbox, new DiscordDmTransport(database, client), {
      destination: "DISCORD", workerId: `bot-outbox:${process.pid}`, leaseSeconds: 30, now, retryBaseSeconds: 5, retryMaximumSeconds: 300,
    });
    for (let index = 0; index < 20; index += 1) if (await jobWorker.runOne() === "IDLE") break;
    for (let index = 0; index < 20; index += 1) if (await deliveryWorker.runOne() === "IDLE") break;
  } finally {
    workerRunning = false;
  }
}

class DiscordDmTransport implements OutboxDeliveryTransport {
  static readonly delivered = new Set<string>();
  constructor(private readonly poolLike: PgPoolLike, private readonly discord: Client) {}
  async deliver(event: ClaimedOutboxEvent): Promise<void> {
    if (DiscordDmTransport.delivered.has(event.idempotencyKey)) return;
    if (event.eventType !== "TradeExecuted") return;
    const orderId = requiredPayload(event.payload, "orderId");
    const result = await this.poolLike.query<{ discord_user_id: string; symbol: string }>(
      `SELECT player.discord_user_id, security.symbol FROM orders orders
       JOIN position_accounts account ON account.id=orders.position_account_id
       JOIN players player ON player.id::text=account.owner_id
       JOIN securities security ON security.id=orders.security_id
       WHERE orders.id=$1 AND orders.environment_id=$2`,
      [orderId, event.environmentId],
    );
    const recipient = result.rows[0];
    if (!recipient) throw new Error("Trade notification recipient not found");
    const side = requiredPayload(event.payload, "side");
    const quantity = requiredPayload(event.payload, "executedQuantity");
    const amount = requiredPayload(event.payload, "baseNotional");
    const currency = requiredPayload(event.payload, "baseCurrency");
    const receipt = new EmbedBuilder().setColor(side === "BUY" ? 0x2ecc71 : 0x3498db).setTitle("✅ Trade settled")
      .setDescription(`**${side === "BUY" ? "Bought" : "Sold"} ${formatQuantity(quantity)} ${recipient.symbol}**`)
      .addFields({ name: "Settled value", value: formatMoney(amount, currency), inline: true })
      .setFooter({ text: `Order ${orderId.slice(0, 8)} • Practice market` });
    await (await this.discord.users.fetch(recipient.discord_user_id)).send({ embeds: [receipt] });
    DiscordDmTransport.delivered.add(event.idempotencyKey);
  }
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unexpected error.";
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down.`);
  if (workerTimer) clearInterval(workerTimer);
  client.destroy();
  await pool.end();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
start().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});

export type { Security };
