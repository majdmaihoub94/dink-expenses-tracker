const SYMBOLS: Record<string, string> = {
  GBP: "£",
  EUR: "€",
  USD: "$",
};

export function currencySymbol(currency = "GBP"): string {
  return SYMBOLS[currency] ?? currency + " ";
}

/** "£1,234.56" — always two decimals, always the absolute value. */
export function money(amount: number, currency = "GBP"): string {
  return (
    currencySymbol(currency) +
    Math.abs(amount).toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** "− £734.00" / "+ £2,400.00" — the signed form used in transaction rows. */
export function signedMoney(amount: number, kind: "expense" | "income", currency = "GBP"): string {
  return `${kind === "expense" ? "−" : "+"} ${money(amount, currency)}`;
}

/** "£12,560" for headline figures, "£12.5k" once it stops fitting. */
export function compactMoney(amount: number, currency = "GBP"): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${currencySymbol(currency)}${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 100_000) return `${currencySymbol(currency)}${(abs / 1_000).toFixed(0)}k`;
  return (
    currencySymbol(currency) +
    abs.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  );
}

/** Splits an amount so the pence can be rendered smaller, as in the mockup. */
export function moneyParts(amount: number, currency = "GBP") {
  const abs = Math.abs(amount);
  const whole = Math.floor(abs);
  const pence = Math.round((abs - whole) * 100);
  return {
    symbol: currencySymbol(currency),
    whole: whole.toLocaleString("en-GB"),
    pence: String(pence).padStart(2, "0"),
  };
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** Parses a free-typed amount ("1,234.5", "£20", "20") into a number. */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
