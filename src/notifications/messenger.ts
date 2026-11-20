import { Logger } from '@nestjs/common';

export const MESSENGER = Symbol('MESSENGER');

export interface Messenger {
  /** Sends one message and returns the provider's id for it. Throws if the provider refuses or is down. */
  send(toPhone: string, body: string, channel: 'WHATSAPP' | 'SMS'): Promise<{ providerMessageId: string | null }>;
}

/** Writes messages to the log instead of sending them. Swap for a Twilio or Unifonic adapter in NotificationsModule. */
export class LogMessenger implements Messenger {
  private readonly logger = new Logger('Messenger');

  async send(toPhone: string, body: string, channel: 'WHATSAPP' | 'SMS') {
    this.logger.log(`[${channel}] to ${toPhone}: ${body}`);
    return { providerMessageId: null };
  }
}
