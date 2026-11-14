import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  // Local development convenience: read ./.env if there is one. In Docker the
  // environment comes from docker-compose and no .env file exists in the image.
  try {
    process.loadEnvFile();
  } catch {
    /* no .env file — fine */
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Keeps the exact request bytes on `req.rawBody`; webhook signatures are checked against them.
    rawBody: true,
  });

  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.set('trust proxy', 1);        // one hop: NGINX terminates TLS in front of the API
  app.disable('x-powered-by');
  app.enableShutdownHooks();        // lets workers finish their job and connections close on SIGTERM

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`AKAZ Sports Hub API listening on :${config.port} (${config.nodeEnv}, payments: ${config.paymentProvider})`);
}

bootstrap().catch((error: unknown) => {
  // Most often an invalid configuration; say why and exit non-zero so the container restarts visibly.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
