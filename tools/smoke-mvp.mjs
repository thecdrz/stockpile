import { randomUUID } from "node:crypto";
import { CareerDashboardService, SubmitTradeService } from "@stockpile/application";
import { Rate } from "@stockpile/core";
import {
  PostgresEnvironmentService,
  PostgresJobQueue,
  PostgresOrderLifecycleService,
  PostgresOrderService,
  PostgresPlayerService,
  PostgresPortfolioReader,
  PostgresSecurityDirectory,
  PostgresTradeSettlementService,
  PostgresTradingContextResolver,
  PostgresTransactionReader,
  migrateDatabase,
} from "@stockpile/database";
import { JobWorker, createOrderVerificationHandler } from "@stockpile/jobs";
import pg from "pg";
import {
  MVP_SECURITIES,
  MvpAlwaysOpenSessionPolicy,
  MvpSyntheticMarketDataProvider,
} from "../apps/bot/dist/synthetic-market.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: databaseUrl });
const now = () => new Date().toISOString();

try {
  await migrateDatabase(pool);
  const environment = await new PostgresEnvironmentService(pool, randomUUID).ensure("smoke-test-guild", "CAD");
  const securityDirectory = new PostgresSecurityDirectory(pool, randomUUID);
  for (const security of MVP_SECURITIES) {
    await securityDirectory.synchronize({
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
  await new PostgresPlayerService(pool, randomUUID, now).createHuman({
    environmentId: environment.id,
    discordUserId: "smoke-test-user",
    displayName: "Smoke Test",
    effectiveAt: now(),
    correlationId: randomUUID(),
    economyRulesetVersion: "mvp-1",
  });
  const market = new MvpSyntheticMarketDataProvider();
  const sessions = new MvpAlwaysOpenSessionPolicy();
  const jobs = new PostgresJobQueue(pool, randomUUID);
  const lifecycle = new PostgresOrderLifecycleService(pool, randomUUID);
  const settlement = new PostgresTradeSettlementService(pool, randomUUID);
  const submitted = await new SubmitTradeService({
    contexts: new PostgresTradingContextResolver(pool),
    marketData: market,
    sessions,
    expirations: sessions,
    orders: new PostgresOrderService(pool, randomUUID),
    nextId: randomUUID,
    now,
    fxSpreadRate: Rate.of("0.0025"),
    verificationMaximumAttempts: 12,
  }).submit({
    environmentId: environment.id,
    discordUserId: "smoke-test-user",
    actionRequestId: randomUUID(),
    scope: "CAREER",
    securityId: MVP_SECURITIES[0].id,
    side: "BUY",
    type: "MARKET",
    quantity: "10",
    timeInForce: "DAY",
  });
  const worker = new JobWorker(jobs, {
    VERIFY_ORDER: createOrderVerificationHandler({
      marketData: market,
      settlement,
      lifecycle,
      queue: jobs,
      now,
      verificationIntervalSeconds: 30,
      maximumObservationAgeSeconds: 120,
      maximumFxAgeSeconds: 120,
      fxSpreadRate: Rate.of("0.0025"),
      economyRulesetVersion: "mvp-1",
      executionPolicyVersion: "synthetic-mvp-1",
    }),
  }, { workerId: "smoke-worker", leaseSeconds: 30, now, retryBaseSeconds: 1, retryMaximumSeconds: 10 });
  if (await worker.runOne() !== "COMPLETED") throw new Error("Order verification did not complete");
  const dashboard = await new CareerDashboardService(new PostgresPortfolioReader(pool), market, now).get(
    environment.id,
    "smoke-test-user",
  );
  const history = await new PostgresTransactionReader(pool).recentCareer(environment.id, "smoke-test-user");
  if (!dashboard || dashboard.holdings[0]?.symbol !== "MAPL") throw new Error("Settled holding missing from dashboard");
  if (!history.some((entry) => entry.eventType === "SECURITY_BUY")) throw new Error("Trade missing from transaction history");
  console.log(`MVP smoke passed: order ${submitted.orderId}, ${dashboard.holdings[0].quantity.toString()} MAPL, ${history.length} transactions.`);
} finally {
  await pool.end();
}
