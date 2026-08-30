export const MIN_BID_USDT = BigInt(5);

const MAX_SAFE_DISPLAY_DECIMALS = 18;

export function pow10(decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_SAFE_DISPLAY_DECIMALS) {
    throw new Error(`Unsupported decimal precision: ${decimals}`);
  }

  return BigInt(10) ** BigInt(decimals);
}

export function parseWholeUsdt(input: unknown): bigint {
  if (typeof input !== "string" && typeof input !== "number" && typeof input !== "bigint") {
    throw new Error("Bid must be a whole USDT amount.");
  }

  const value = String(input).trim();
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("Bid must be a whole USDT integer.");
  }

  const amount = BigInt(value);
  if (amount < MIN_BID_USDT) {
    throw new Error("Minimum bid is 5 USDT.");
  }

  return amount;
}

export function parseBoostTarget(currentTotalUsdt: bigint, targetInput: unknown): bigint {
  const target = parseWholeUsdt(targetInput);
  if (target <= currentTotalUsdt) {
    throw new Error("Boost target must be higher than the current bid.");
  }

  if (target - currentTotalUsdt < BigInt(1)) {
    throw new Error("Boosts must increase a listing by at least 1 USDT.");
  }

  return target;
}

export function bidIncrementForTarget(currentTotalUsdt: bigint, targetTotalUsdt: bigint): bigint {
  if (targetTotalUsdt <= currentTotalUsdt) {
    throw new Error("Target bid must exceed the current bid.");
  }

  return targetTotalUsdt - currentTotalUsdt;
}

export function wholeUsdtToAtomic(amountUsdt: bigint, decimals: number): bigint {
  return amountUsdt * pow10(decimals);
}

export function parseAtomicDecimal(input: string, decimals: number): bigint {
  const value = input.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) {
    throw new Error("Amount must be a positive decimal.");
  }

  const [whole, fractional = ""] = value.split(".");
  if (fractional.length > decimals) {
    throw new Error(`Amount has more than ${decimals} decimals.`);
  }

  return BigInt(whole) * pow10(decimals) + BigInt(fractional.padEnd(decimals, "0"));
}

export function formatAtomicAmount(amountAtomic: bigint, decimals: number): string {
  const scale = pow10(decimals);
  const whole = amountAtomic / scale;
  const fraction = amountAtomic % scale;

  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  const fractionalText = fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");

  return `${whole.toString()}.${fractionalText}`;
}

export function formatUsdt(amountUsdt: bigint | number): string {
  const normalized = typeof amountUsdt === "bigint" ? amountUsdt : BigInt(amountUsdt);
  return `${new Intl.NumberFormat("en-US").format(normalized)} USDT`;
}

export function stableNumericSuffix(seed: string, digits: number): bigint {
  if (!Number.isInteger(digits) || digits < 1 || digits > 6) {
    throw new Error("Unique suffix supports between 1 and 6 digits.");
  }

  let hash = BigInt(2166136261);
  for (const char of seed) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = (hash * BigInt(16777619)) % BigInt(4294967296);
  }

  const min = BigInt(10) ** BigInt(digits - 1);
  const maxSpan = BigInt(9) * min;
  return min + (hash % maxSpan);
}

export function createUniqueTransferAmountAtomic(args: {
  bidCreditUsdt: bigint;
  tokenDecimals: number;
  orderPublicId: string;
}): bigint {
  const suffixDigits = Math.min(args.tokenDecimals, 6);
  if (suffixDigits < 1) {
    throw new Error("Token decimals must support a unique payment amount.");
  }

  const wholeAtomic = wholeUsdtToAtomic(args.bidCreditUsdt, args.tokenDecimals);
  const suffix = stableNumericSuffix(args.orderPublicId, suffixDigits);
  const suffixScale = pow10(args.tokenDecimals - suffixDigits);
  return wholeAtomic + suffix * suffixScale;
}
