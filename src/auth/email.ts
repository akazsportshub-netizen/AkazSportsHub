import type { Locale } from '../notifications/templates';
import { OTP_TTL_SECONDS } from './otp';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Trimmed and lower-cased, or null unless it looks like an email address. */
export function normalizeEmail(input: string): string | null {
  const cleaned = input.trim().toLowerCase();
  return cleaned.length <= 254 && EMAIL.test(cleaned) ? cleaned : null;
}

/** Emails and phone numbers hash into separate spaces, so a code for one can never match the other. */
export function emailHashKey(email: string): string {
  return `email:${email}`;
}

export function emailOtpMessage(code: string, locale: Locale): { subject: string; text: string } {
  const minutes = Math.round(OTP_TTL_SECONDS / 60);
  if (locale === 'ar') {
    return {
      subject: 'رمز الدخول إلى AKAZ',
      text: `رمز الدخول إلى AKAZ هو ${code}\nالرمز صالح لمدة ${minutes} دقائق. لا تشاركه مع أحد.\nإذا لم تطلب الرمز فتجاهل هذه الرسالة.`,
    };
  }
  return {
    subject: 'Your AKAZ sign-in code',
    text: `Your AKAZ sign-in code is ${code}\nIt is valid for ${minutes} minutes. Do not share it with anyone.\nIf you did not ask for it, you can ignore this email.`,
  };
}

export const GCC_COUNTRIES = ['QA', 'SA', 'AE', 'KW', 'BH', 'OM'] as const;
