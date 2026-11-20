import { CurrencyCode, minorToMajorString } from '../common/money';

export type MessageKind = 'SHARE_INVITE' | 'RINGER_INVITE' | 'RINGER_JOINED' | 'SHARE_REFUND';

export interface MessageVars {
  /** Name of the other person involved (the organizer, or the ringer who joined). */
  who?: string;
  court?: string;
  venue?: string;
  sport?: string;
  /** Already formatted in the venue's time zone, e.g. "Sat 21 Nov, 7:00 PM". */
  when?: string;
  amountMinor?: number;
  currency?: CurrencyCode;
  holdMinutes?: number;
}

function money(vars: MessageVars): string {
  if (vars.amountMinor === undefined || !vars.currency) return '';
  return `${vars.currency} ${minorToMajorString(vars.amountMinor, vars.currency)}`;
}

/** Plain-text bodies, short enough for SMS. English for now; Arabic comes with a user language setting. */
export function renderMessage(kind: MessageKind, vars: MessageVars): string {
  const place = [vars.court, vars.venue].filter(Boolean).join(', ');
  switch (kind) {
    case 'SHARE_INVITE':
      return (
        `AKAZ: ${vars.who ?? 'A friend'} added you to a court booking at ${place}, ${vars.when}. ` +
        `Your share is ${money(vars)}. Open AKAZ and pay within ${vars.holdMinutes ?? 15} minutes to keep the slot.`
      );
    case 'RINGER_INVITE':
      return (
        `AKAZ: a ${vars.sport ?? 'game'} near you needs one more player: ${place}, ${vars.when}. ` +
        `Open AKAZ > Invites to join (about ${money(vars)}).`
      );
    case 'RINGER_JOINED':
      return `AKAZ: ${vars.who ?? 'A player'} joined your game at ${place}, ${vars.when}. Everyone's share will drop and refunds are sent automatically.`;
    case 'SHARE_REFUND':
      return `AKAZ: someone joined your game at ${place}, ${vars.when}, so your share is lower. ${money(vars)} is being refunded to you.`;
  }
}

/** Slot start in the venue's own time zone. */
export function formatWhen(startsAt: Date | string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(startsAt));
}
