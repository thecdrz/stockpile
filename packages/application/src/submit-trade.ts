import {
  Price,
  Quantity,
  Rate,
  acceptOrder,
  type Currency,
  type OrderSide,
  type OrderType,
  type TimeInForce,
  type TradingAccountId,
} from "@stockpile/core";
import type {
  AcceptedOrderPersistenceResult,
  AcceptOrderPersistenceCommand,
} from "@stockpile/database";
import type { EnvironmentId, LedgerAccountId } from "@stockpile/ledger";
import type { MarketDataProvider, SecurityId } from "@stockpile/market-data";

export interface AuthorizedTradingContext {
  readonly tradingAccountId: TradingAccountId;
  readonly playerCashAccountId: LedgerAccountId;
  readonly securityId: SecurityId;
  readonly listingCurrency: Currency;
  readonly baseCurrency: Currency;
}

export interface TradingContextResolver {
  resolve(
    environmentId: EnvironmentId,
    discordUserId: string,
    scope: "CAREER" | "LEAGUE",
    securityId: SecurityId,
  ): Promise<AuthorizedTradingContext | null>;
}

export interface MarketSessionReader {
  getSession(securityId: SecurityId, at: string): Promise<{
    readonly isOpen: boolean;
    readonly nextOpenAt?: string;
  }>;
}

export interface OrderExpirationPolicy {
  expirationFor(securityId: SecurityId, acceptedAt: string, timeInForce: TimeInForce): Promise<string>;
}

export interface OrderAcceptanceStore {
  accept(command: AcceptOrderPersistenceCommand): Promise<AcceptedOrderPersistenceResult>;
}

export interface SubmitTradeCommand {
  readonly environmentId: EnvironmentId;
  readonly discordUserId: string;
  readonly actionRequestId: string;
  readonly scope: "CAREER" | "LEAGUE";
  readonly securityId: SecurityId;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly quantity: string;
  readonly limitPrice?: string;
  readonly timeInForce: TimeInForce;
}

export interface SubmitTradeOptions {
  readonly contexts: TradingContextResolver;
  readonly marketData: MarketDataProvider;
  readonly sessions: MarketSessionReader;
  readonly expirations: OrderExpirationPolicy;
  readonly orders: OrderAcceptanceStore;
  readonly nextId: () => string;
  readonly now: () => string;
  readonly fxSpreadRate: Rate;
  readonly verificationMaximumAttempts: number;
}

export class SubmitTradeService {
  constructor(private readonly options: SubmitTradeOptions) {}

  async submit(command: SubmitTradeCommand): Promise<AcceptedOrderPersistenceResult> {
    validateRequest(command);
    const context = await this.options.contexts.resolve(
      command.environmentId,
      command.discordUserId,
      command.scope,
      command.securityId,
    );
    if (!context) throw new Error("Trading account or security is unavailable");
    if (context.securityId !== command.securityId) throw new Error("Trading context security mismatch");

    const acceptedAt = this.options.now();
    const [observation, session, expiresAt] = await Promise.all([
      this.options.marketData.getLatestObservation(command.securityId),
      this.options.sessions.getSession(command.securityId, acceptedAt),
      this.options.expirations.expirationFor(command.securityId, acceptedAt, command.timeInForce),
    ]);
    if (!observation || observation.freshness === "UNAVAILABLE" || observation.freshness === "STALE") {
      throw new Error("A trustworthy price is required to submit an order");
    }
    if (observation.price.currency !== context.listingCurrency) throw new Error("Market price currency mismatch");

    const requiresUsdCad = context.listingCurrency !== context.baseCurrency;
    const fx = requiresUsdCad ? await this.options.marketData.getLatestFxObservation("USD/CAD") : null;
    if (requiresUsdCad && (!fx || fx.freshness === "UNAVAILABLE" || fx.freshness === "STALE")) {
      throw new Error("A trustworthy USD/CAD rate is required to submit this order");
    }

    const orderId = this.options.nextId();
    const quantity = Quantity.of(command.quantity);
    const limitPrice = command.limitPrice === undefined
      ? undefined
      : Price.of(command.limitPrice, context.listingCurrency);
    const order = acceptOrder({
      id: orderId as never,
      environmentId: command.environmentId,
      scope: command.scope,
      tradingAccountId: context.tradingAccountId,
      securityId: command.securityId as never,
      listingCurrency: context.listingCurrency,
      side: command.side,
      type: command.type,
      quantity,
      ...(limitPrice === undefined ? {} : { limitPrice }),
      timeInForce: command.timeInForce,
      acceptedAt,
      exchangeIsOpen: session.isOpen,
    });
    if (Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(acceptedAt)) {
      throw new Error("Order expiration policy returned an invalid time");
    }
    if (!session.isOpen && (session.nextOpenAt === undefined || Number.isNaN(Date.parse(session.nextOpenAt)))) {
      throw new Error("Closed exchange requires a known next open time");
    }

    return this.options.orders.accept({
      order,
      playerCashAccountId: context.playerCashAccountId,
      idempotencyKey: `discord:${command.actionRequestId}`,
      expiresAt,
      estimatedMarketPrice: observation.price,
      ...(fx
        ? { estimatedFx: { basePerForeignRate: fx.basePerForeignRate, spreadRate: this.options.fxSpreadRate } }
        : {}),
      verificationJob: {
        environmentId: command.environmentId,
        jobType: "VERIFY_ORDER",
        payload: {
          orderId,
          securityId: command.securityId,
          expiresAt,
          requiresUsdCad,
          ...(session.nextOpenAt === undefined ? {} : { sessionOpenAt: session.nextOpenAt }),
        },
        runAt: session.isOpen ? acceptedAt : session.nextOpenAt!,
        maxAttempts: this.options.verificationMaximumAttempts,
        idempotencyKey: `verify-order:${orderId}`,
      },
    });
  }
}

function validateRequest(command: SubmitTradeCommand): void {
  if (command.discordUserId.trim().length === 0 || command.actionRequestId.trim().length === 0) {
    throw new Error("Discord user ID and action request ID are required");
  }
  if (command.type === "LIMIT" && command.limitPrice === undefined) throw new Error("Limit price is required");
  if (command.type === "MARKET" && command.limitPrice !== undefined) throw new Error("Market order cannot have a limit price");
}
