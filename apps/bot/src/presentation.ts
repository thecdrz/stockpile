export function formatMoney(amount: string, currency: string, signed = false): string {
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = `${fraction}00`.slice(0, 2);
  const sign = negative ? "−" : signed && amount !== "0" ? "+" : "";
  return `${sign}$${grouped}.${decimals} ${currency}`;
}

export function formatQuantity(quantity: string): string {
  if (!quantity.includes(".")) return quantity;
  return quantity.replace(/0+$/u, "").replace(/\.$/u, "");
}

export function formatDiscordTime(timestamp: string): string {
  return `<t:${Math.floor(Date.parse(timestamp) / 1_000)}:R>`;
}

export function transactionLabel(eventType: string): string {
  const labels: Readonly<Record<string, string>> = {
    ACCOUNT_OPENING_GRANT: "Opening balance",
    SECURITY_BUY: "Stock purchase",
    SECURITY_SELL: "Stock sale",
    DIVIDEND: "Dividend",
  };
  return labels[eventType] ?? eventType.toLowerCase().replaceAll("_", " ");
}
