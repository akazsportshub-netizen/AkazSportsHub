import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { Public } from '../auth/decorators';
import { PaymentsService } from './payments.service';

class SimulateOutcomeDto {
  @IsIn(['AUTHORIZED', 'CAPTURED', 'FAILED'])
  outcome!: 'AUTHORIZED' | 'CAPTURED' | 'FAILED';
}

/**
 * Local-development stand-in for a provider's payment page and webhook.
 * Every route answers 404 unless PAYMENT_PROVIDER=mock and NODE_ENV is not production.
 */
@Public()
@Controller('dev/payments')
export class DevPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('attempts/:attemptId')
  describe(@Param('attemptId', ParseUUIDPipe) attemptId: string) {
    this.payments.assertMockEnabled();
    return {
      attempt_id: attemptId,
      how_to_pay: `POST /v1/dev/payments/attempts/${attemptId}/simulate with {"outcome":"AUTHORIZED"}, {"outcome":"CAPTURED"} or {"outcome":"FAILED"}`,
    };
  }

  @Post('attempts/:attemptId/simulate')
  @HttpCode(200)
  async simulate(@Param('attemptId', ParseUUIDPipe) attemptId: string, @Body() body: SimulateOutcomeDto) {
    const outcome = await this.payments.simulateMockOutcome(attemptId, body.outcome);
    return { outcome };
  }
}
