import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from './app-config';

const base = {
  DATABASE_URL: 'postgres://akaz:akaz@localhost:5432/akaz',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'x'.repeat(48),
  PUBLIC_BASE_URL: 'https://api.example.test/',
  PAYMENT_RETURN_URL: 'akaz://payment-complete',
};

describe('loadConfig', () => {
  it('applies safe defaults for local development', () => {
    const config = loadConfig(base);
    assert.equal(config.nodeEnv, 'development');
    assert.equal(config.port, 3000);
    assert.equal(config.paymentProvider, 'mock');
    assert.equal(config.holdMinutes, 15);
    assert.equal(config.runWorkers, true);
    assert.equal(config.publicBaseUrl, 'https://api.example.test');
    assert.equal(config.tap.apiBase, 'https://api.tap.company/v2');
  });

  it('lists every missing variable at once', () => {
    assert.throws(
      () => loadConfig({}),
      (error: Error) =>
        ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'PUBLIC_BASE_URL', 'PAYMENT_RETURN_URL'].every((key) => error.message.includes(key)),
    );
  });

  it('refuses a short signing secret', () => {
    assert.throws(() => loadConfig({ ...base, JWT_SECRET: 'short' }), /JWT_SECRET must be at least 32 characters/);
  });

  it('refuses the mock provider in production', () => {
    assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production' }), /mock is not allowed in production/);
  });

  it('requires the keys of the selected provider', () => {
    assert.throws(() => loadConfig({ ...base, PAYMENT_PROVIDER: 'tap' }), /TAP_SECRET_KEY is required/);
    assert.throws(() => loadConfig({ ...base, PAYMENT_PROVIDER: 'checkout' }), /CHECKOUT_WEBHOOK_SECRET is required/);
    const config = loadConfig({ ...base, NODE_ENV: 'production', PAYMENT_PROVIDER: 'tap', TAP_SECRET_KEY: 'sk_live_x' });
    assert.equal(config.paymentProvider, 'tap');
    assert.equal(config.tap.secretKey, 'sk_live_x');
  });

  it('validates numbers and switches', () => {
    assert.throws(() => loadConfig({ ...base, PORT: 'abc' }), /PORT must be an integer/);
    assert.throws(() => loadConfig({ ...base, HOLD_MINUTES: '0' }), /HOLD_MINUTES must be an integer/);
    assert.equal(loadConfig({ ...base, HOLD_MINUTES: '10' }).holdMinutes, 10);
    assert.equal(loadConfig({ ...base, RUN_WORKERS: 'false' }).runWorkers, false);
    assert.equal(loadConfig({ ...base, RUN_WORKERS: 'FALSE' }).runWorkers, false);
  });

  it('rejects unknown modes', () => {
    assert.throws(() => loadConfig({ ...base, PAYMENT_PROVIDER: 'stripe' }), /PAYMENT_PROVIDER must be/);
    assert.throws(() => loadConfig({ ...base, NODE_ENV: 'staging' }), /NODE_ENV must be/);
  });
});
