import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
/** At most this many codes per phone number in the window below, so nobody can be spammed with codes. */
export const OTP_MAX_REQUESTS = 3;
export const OTP_REQUEST_WINDOW_MINUTES = 10;

const E164 = /^\+[1-9][0-9]{7,14}$/;

/** Calling code → ISO country, for the GCC countries AKAZ launches in. Longest prefix wins. */
const GCC_PREFIXES: Record<string, string> = {
  '+974': 'QA',
  '+966': 'SA',
  '+971': 'AE',
  '+965': 'KW',
  '+973': 'BH',
  '+968': 'OM',
};

/** Spaces and dashes are removed. Returns null unless the result is a valid international number. */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, '');
  return E164.test(cleaned) ? cleaned : null;
}

export function countryForPhone(phone: string): string | null {
  const prefix = Object.keys(GCC_PREFIXES).find((candidate) => phone.startsWith(candidate));
  return prefix ? GCC_PREFIXES[prefix] : null;
}

/** Six digits, from a cryptographically secure source. */
export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Keyed with the server secret and the phone number, so a leaked table cannot be searched offline. */
export function hashCode(code: string, phone: string, secret: string): string {
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

export function codeMatches(code: string, phone: string, secret: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashCode(code, phone, secret), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export function otpMessage(code: string, locale: 'en' | 'ar' = 'en'): string {
  const minutes = OTP_TTL_SECONDS / 60;
  return locale === 'ar'
    ? `AKAZ: رمز الدخول ${code} صالح ${minutes} دقائق. لا تشاركه مع أحد.`
    : `AKAZ: your sign-in code is ${code}. It expires in ${minutes} minutes. Do not share it with anyone.`;
}
