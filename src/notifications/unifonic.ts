import type { Messenger } from './messenger';

export interface UnifonicSettings {
  appSid: string;
  senderId: string;
  username: string;
  password: string;
  /** Override only for testing. */
  endpoint?: string;
}

const DEFAULT_ENDPOINT = 'https://el.cloud.unifonic.com/rest/SMS/messages';

/** Unifonic wants the number in international format without "+" or "00". */
export function unifonicRecipient(phone: string): string {
  return phone.replace(/[^0-9]/g, '').replace(/^00/, '');
}

/** Builds the adapter from environment variables, or null when Unifonic is not configured. */
export function unifonicSettingsFromEnv(env: NodeJS.ProcessEnv): UnifonicSettings | null {
  const appSid = env.UNIFONIC_APP_SID?.trim();
  if (!appSid) return null;
  const senderId = env.UNIFONIC_SENDER_ID?.trim() ?? '';
  const username = env.UNIFONIC_USERNAME?.trim() ?? '';
  const password = env.UNIFONIC_PASSWORD ?? '';
  const missing = [
    !senderId && 'UNIFONIC_SENDER_ID',
    !username && 'UNIFONIC_USERNAME',
    !password && 'UNIFONIC_PASSWORD',
  ].filter(Boolean);
  if (missing.length > 0) throw new Error(`UNIFONIC_APP_SID is set but ${missing.join(', ')} is missing`);
  return { appSid, senderId, username, password, endpoint: env.UNIFONIC_ENDPOINT?.trim() || undefined };
}

/**
 * Sends SMS through Unifonic. WhatsApp is not wired yet (it needs Meta-approved templates),
 * so WHATSAPP messages go out as SMS until it is.
 */
export class UnifonicMessenger implements Messenger {
  constructor(
    private readonly settings: UnifonicSettings,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(toPhone: string, body: string, channel: 'WHATSAPP' | 'SMS') {
    if (channel === 'WHATSAPP') console.warn('[UnifonicMessenger] WhatsApp is not set up yet; sending as SMS');
    const { appSid, senderId, username, password } = this.settings;
    const form = new URLSearchParams({
      AppSid: appSid,
      SenderID: senderId,
      Recipient: unifonicRecipient(toPhone),
      Body: body,
      responseType: 'JSON',
    });

    let response: Response;
    try {
      response = await this.fetchImpl(this.settings.endpoint ?? DEFAULT_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new Error(`Unifonic request failed: ${(error as Error).message}`);
    }

    const text = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON; handled below */
    }

    // Never put the message body in errors: it can hold a sign-in code.
    if (!response.ok || json?.success === false) {
      const reason = json?.message || json?.errorCode || `HTTP ${response.status}`;
      throw new Error(`Unifonic refused the message: ${reason}`);
    }
    const id = json?.data?.MessageID ?? json?.data?.messageId ?? null;
    return { providerMessageId: id == null ? null : String(id) };
  }
}
