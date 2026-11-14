import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/decorators';
import { apiError } from '../common/api-error';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { PaymentsService } from '../payments/payments.service';
import { normalizeCheckoutEvent, verifyCheckoutSignature } from './checkout-webhook';
import { normalizeTapEvent, verifyTapHashstring } from './tap-webhook';

function parseJsonObject(raw: Buffer | undefined): Record<string, unknown> {
  if (!raw || raw.length === 0) throw new BadRequestException(apiError('INVALID_BODY', 'Empty body'));
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new BadRequestException(apiError('INVALID_BODY', 'Body is not valid JSON'));
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BadRequestException(apiError('INVALID_BODY', 'Body must be a JSON object'));
  }
  return parsed as Record<string, unknown>;
}

/**
 * Payment-provider webhooks. Both routes are public (no access token) and rely on the
 * provider's HMAC signature instead; an unsigned or tampered request gets 401 and
 * changes nothing. A 200 is returned for every verified notification — including
 * duplicates and ones we do not act on — so providers stop retrying.
 *
 * Requires `rawBody: true` on the Nest application (see main.ts).
 */
@Public()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly payments: PaymentsService,
  ) {}

  @Post('tap')
  @HttpCode(200)
  async tap(@Req() request: RawBodyRequest<Request>, @Headers('hashstring') hashstring?: string) {
    const secret = this.config.tap.secretKey;
    if (!secret) throw new ServiceUnavailableException(apiError('PROVIDER_NOT_CONFIGURED', 'Tap is not configured'));

    const body = parseJsonObject(request.rawBody);
    if (!verifyTapHashstring(body, hashstring, secret)) {
      this.logger.warn('Rejected Tap webhook with a missing or invalid hashstring');
      throw new UnauthorizedException(apiError('INVALID_SIGNATURE', 'Invalid signature'));
    }

    const outcome = await this.payments.applyProviderEvent(normalizeTapEvent(body));
    return { received: true, outcome };
  }

  @Post('checkout')
  @HttpCode(200)
  async checkout(@Req() request: RawBodyRequest<Request>, @Headers('cko-signature') signature?: string) {
    const secret = this.config.checkout.webhookSecret;
    if (!secret) throw new ServiceUnavailableException(apiError('PROVIDER_NOT_CONFIGURED', 'Checkout.com is not configured'));

    if (!verifyCheckoutSignature(request.rawBody, signature, secret)) {
      this.logger.warn('Rejected Checkout.com webhook with a missing or invalid signature');
      throw new UnauthorizedException(apiError('INVALID_SIGNATURE', 'Invalid signature'));
    }

    const envelope = parseJsonObject(request.rawBody);
    const outcome = await this.payments.applyProviderEvent(normalizeCheckoutEvent(envelope));
    return { received: true, outcome };
  }
}
