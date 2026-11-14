/**
 * Money is handled as integers in minor units everywhere inside the platform
 * (QAR 250.00 = 25000, BHD 30.000 = 30000). Conversion to "major" decimal
 * amounts happens only at the edge, when talking to a payment provider.
 */
export const CURRENCY_DECIMALS = {
  QAR: 2,
  SAR: 2,
  AED: 2,
  BHD: 3,
  OMR: 3,
} as const;

export type CurrencyCode = keyof typeof CURRENCY_DECIMALS;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CURRENCY_DECIMALS, value);
}

function assertMinor(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Minor-unit amount must be a safe integer, got ${amountMinor}`);
  }
}

/** 25000, 'QAR' → "250.00"; 30000, 'BHD' → "30.000". */
export function minorToMajorString(amountMinor: number, currency: CurrencyCode): string {
  assertMinor(amountMinor);
  const decimals = CURRENCY_DECIMALS[currency];
  const sign = amountMinor < 0 ? '-' : '';
  const digits = Math.abs(amountMinor).toString().padStart(decimals + 1, '0');
  return `${sign}${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

/** Same as above as a JS number, for providers whose API takes a decimal number (Tap). */
export function minorToMajorNumber(amountMinor: number, currency: CurrencyCode): number {
  return Number(minorToMajorString(amountMinor, currency));
}

/** 250, 'QAR' → 25000. Rounds to the nearest minor unit to absorb float noise such as 19.99 * 100. */
export function majorToMinor(amountMajor: number | string, currency: CurrencyCode): number {
  const value = typeof amountMajor === 'string' ? Number(amountMajor) : amountMajor;
  if (!Number.isFinite(value)) {
    throw new RangeError(`Amount must be a finite number, got ${amountMajor}`);
  }
  const minor = Math.round(value * 10 ** CURRENCY_DECIMALS[currency]);
  assertMinor(minor);
  return minor;
}

/** Price of a slot: hourly price pro-rated by minutes, rounded to the nearest minor unit. */
export function slotPriceMinor(pricePerHourMinor: number, minutes: number): number {
  assertMinor(pricePerHourMinor);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new RangeError(`Slot length must be a positive whole number of minutes, got ${minutes}`);
  }
  return Math.round((pricePerHourMinor * minutes) / 60);
}

/** Platform commission in minor units; 1000 bps = 10 %. */
export function platformFeeMinor(totalMinor: number, commissionBps: number): number {
  assertMinor(totalMinor);
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
    throw new RangeError(`Commission must be between 0 and 10000 bps, got ${commissionBps}`);
  }
  return Math.round((totalMinor * commissionBps) / 10_000);
}
