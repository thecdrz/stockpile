import type { Currency } from "./money.js";
import type { Price } from "./price.js";
import type { Quantity } from "./quantity.js";

export type OrderId = string & { readonly __brand: "OrderId" };
export type TradingAccountId = string & { readonly __brand: "TradingAccountId" };
export type TradingSecurityId = string & { readonly __brand: "TradingSecurityId" };
export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type TimeInForce = "DAY" | "GOOD_FOR_7_DAYS";
export type OrderStatus = "PENDING_VERIFIED_PRICE" | "PENDING_MARKET_OPEN" | "OPEN";

export interface AcceptOrderCommand {
  readonly id: OrderId;
  readonly environmentId: string;
  readonly scope: "CAREER" | "LEAGUE";
  readonly tradingAccountId: TradingAccountId;
  readonly securityId: TradingSecurityId;
  readonly listingCurrency: Currency;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly quantity: Quantity;
  readonly limitPrice?: Price;
  readonly timeInForce: TimeInForce;
  readonly acceptedAt: string;
  readonly exchangeIsOpen: boolean;
}

export interface AcceptedOrder extends Omit<AcceptOrderCommand, "exchangeIsOpen"> {
  readonly status: OrderStatus;
}

export function acceptOrder(command: AcceptOrderCommand): AcceptedOrder {
  if (command.quantity.isZero()) throw new Error("Order quantity must be positive");
  if (Number.isNaN(Date.parse(command.acceptedAt))) throw new Error("Invalid order acceptance time");
  if (command.type === "LIMIT") {
    if (!command.limitPrice) throw new Error("Limit order requires a limit price");
    if (command.limitPrice.currency !== command.listingCurrency) throw new Error("Limit price currency mismatch");
  } else if (command.limitPrice) {
    throw new Error("Market order cannot have a limit price");
  }

  const status: OrderStatus = !command.exchangeIsOpen
    ? "PENDING_MARKET_OPEN"
    : command.type === "MARKET"
      ? "PENDING_VERIFIED_PRICE"
      : "OPEN";
  const { exchangeIsOpen: _, ...fields } = command;
  return Object.freeze({ ...fields, status });
}

export function requiredBuyReservation(order: AcceptedOrder, estimatedMarketPrice?: Price): ReturnType<Price["notional"]> {
  if (order.side !== "BUY") throw new Error("Cash reservation applies only to buy orders");
  const reservationPrice = order.type === "LIMIT" ? order.limitPrice : estimatedMarketPrice;
  if (!reservationPrice) throw new Error("Estimated market price is required");
  if (reservationPrice.currency !== order.listingCurrency) throw new Error("Reservation price currency mismatch");
  return reservationPrice.notional(order.quantity);
}
