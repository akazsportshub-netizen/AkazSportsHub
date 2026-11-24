export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailSender {
  /** Sends one email and returns the provider's id for it. Throws if the provider refuses or is down. */
  send(to: string, subject: string, text: string): Promise<{ providerMessageId: string | null }>;
}

/** Writes emails to the log instead of sending them. Refuses in production, because sign-in codes pass through here. */
export class LogEmailSender implements EmailSender {
  async send(to: string, subject: string, text: string) {
    if (process.env.NODE_ENV === 'production') throw new Error('No email provider is configured');
    console.log(`[EmailSender] [EMAIL] to ${to}: ${subject} | ${text.replace(/\n/g, ' ')}`);
    return { providerMessageId: null };
  }
}

export interface ResendSettings {
  apiKey: string;
  /** e.g. "AKAZ <noreply@yourdomain.com>". Resend's test sender is "onboarding@resend.dev". */
  from: string;
  endpoint?: string;
}

export function resendSettingsFromEnv(env: NodeJS.ProcessEnv): ResendSettings | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  const from = env.EMAIL_FROM?.trim();
  if (!from) throw new Error('RESEND_API_KEY is set but EMAIL_FROM is missing');
  return { apiKey, from, endpoint: env.RESEND_ENDPOINT?.trim() || undefined };
}

/** Sends through Resend's HTTP API, so no extra package is needed. */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly settings: ResendSettings,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, subject: string, text: string) {
    let response: Response;
    try {
      response = await this.fetchImpl(this.settings.endpoint ?? 'https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.settings.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.settings.from, to, subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new Error(`Email request failed: ${(error as Error).message}`);
    }
    const raw = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(raw);
    } catch {
      /* not JSON */
    }
    // The message text can hold a sign-in code, so it never goes into an error.
    if (!response.ok) throw new Error(`Email provider refused the message: ${json?.message ?? json?.name ?? `HTTP ${response.status}`}`);
    return { providerMessageId: json?.id == null ? null : String(json.id) };
  }
}
