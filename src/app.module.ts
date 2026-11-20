import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { BookingsModule } from './bookings/bookings.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { MatchesModule } from './matches/matches.module';
import { PaymentsModule } from './payments/payments.module';
import { QueuesModule } from './queues/queues.module';
import { RingersModule } from './ringers/ringers.module';
import { UsersModule } from './users/users.module';
import { VenuesModule } from './venues/venues.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WorkersModule } from './workers/workers.module';

/**
 * Modular monolith: one deployable, with each domain in its own module.
 * Every route requires an access token unless it is marked @Public().
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    QueuesModule,
    AuthModule,
    VenuesModule,
    UsersModule,
    PaymentsModule,
    BookingsModule,
    WebhooksModule,
    MatchesModule,
    RingersModule,
    WorkersModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate first, then check roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
