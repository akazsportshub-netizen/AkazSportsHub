import { CurrencyCode, minorToMajorString } from '../common/money';

export type MessageKind = 'SHARE_INVITE' | 'RINGER_INVITE' | 'RINGER_JOINED' | 'SHARE_REFUND';
export type Locale = 'en' | 'ar';
export const LOCALES: readonly Locale[] = ['en', 'ar'];

export function toLocale(value: unknown): Locale {
  return value === 'ar' ? 'ar' : 'en';
}

export interface MessageVars {
  /** Name of the other person involved (the organizer, or the ringer who joined). */
  who?: string;
  court?: string;
  venue?: string;
  /** Database value, e.g. PADEL. */
  sport?: string;
  /** Slot start; shown in the venue's own time zone and the reader's language. */
  startsAt?: Date | string;
  timezone?: string;
  amountMinor?: number;
  currency?: CurrencyCode;
  holdMinutes?: number;
}

const SPORT_NAMES: Record<Locale, Record<string, string>> = {
  en: {
    FOOTBALL: 'football',
    PADEL: 'padel',
    BADMINTON: 'badminton',
    BASKETBALL: 'basketball',
    VOLLEYBALL: 'volleyball',
    TENNIS: 'tennis',
    CRICKET: 'cricket',
  },
  ar: {
    FOOTBALL: 'كرة القدم',
    PADEL: 'البادل',
    BADMINTON: 'الريشة الطائرة',
    BASKETBALL: 'كرة السلة',
    VOLLEYBALL: 'الكرة الطائرة',
    TENNIS: 'التنس',
    CRICKET: 'الكريكت',
  },
};

function sportName(sport: string | undefined, locale: Locale): string | undefined {
  return sport ? (SPORT_NAMES[locale][sport] ?? sport.toLowerCase()) : undefined;
}

function money(vars: MessageVars): string {
  if (vars.amountMinor === undefined || !vars.currency) return '';
  return `${vars.currency} ${minorToMajorString(vars.amountMinor, vars.currency)}`;
}

/** Slot start in the venue's own time zone. Arabic uses Arabic words with Western digits, as is common in the Gulf. */
export function formatWhen(startsAt: Date | string, timezone: string, locale: Locale = 'en'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(startsAt));
}

/** Plain-text bodies, short enough for SMS. */
export function renderMessage(kind: MessageKind, vars: MessageVars, locale: Locale = 'en'): string {
  const place = [vars.court, vars.venue].filter(Boolean).join(locale === 'ar' ? '، ' : ', ');
  const when = vars.startsAt && vars.timezone ? formatWhen(vars.startsAt, vars.timezone, locale) : '';
  const sport = sportName(vars.sport, locale);
  const minutes = vars.holdMinutes ?? 15;

  if (locale === 'ar') {
    switch (kind) {
      case 'SHARE_INVITE':
        return `AKAZ: أضافك ${vars.who ?? 'أحد الأصدقاء'} إلى حجز ملعب في ${place}، ${when}. حصتك ${money(vars)}. افتح التطبيق وادفع خلال ${minutes} دقيقة للحفاظ على الموعد.`;
      case 'RINGER_INVITE':
        return `AKAZ: مباراة ${sport ?? ''} بالقرب منك تحتاج لاعبًا إضافيًا: ${place}، ${when}. افتح التطبيق ثم الدعوات للانضمام (حوالي ${money(vars)}).`;
      case 'RINGER_JOINED':
        return `AKAZ: انضم ${vars.who ?? 'لاعب'} إلى مباراتك في ${place}، ${when}. ستنخفض حصة كل لاعب ويتم رد الفرق تلقائيًا.`;
      case 'SHARE_REFUND':
        return `AKAZ: انضم لاعب إلى مباراتك في ${place}، ${when}، لذلك انخفضت حصتك. سيتم رد ${money(vars)} إليك.`;
    }
  }

  switch (kind) {
    case 'SHARE_INVITE':
      return (
        `AKAZ: ${vars.who ?? 'A friend'} added you to a court booking at ${place}, ${when}. ` +
        `Your share is ${money(vars)}. Open AKAZ and pay within ${minutes} minutes to keep the slot.`
      );
    case 'RINGER_INVITE':
      return (
        `AKAZ: a ${sport ?? 'game'} near you needs one more player: ${place}, ${when}. ` +
        `Open AKAZ > Invites to join (about ${money(vars)}).`
      );
    case 'RINGER_JOINED':
      return `AKAZ: ${vars.who ?? 'A player'} joined your game at ${place}, ${when}. Everyone's share will drop and refunds are sent automatically.`;
    case 'SHARE_REFUND':
      return `AKAZ: someone joined your game at ${place}, ${when}, so your share is lower. ${money(vars)} is being refunded to you.`;
  }
}
