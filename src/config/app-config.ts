export const APP_CONFIG = Symbol('APP_CONFIG');

export type PaymentProviderName = 'tap' | 'checkout' | 'mock';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  databasePoolMax: number;
  redisUrl: string;
  jwtSecret: string;
  /** Public origin of this API, used to build webhook URLs (no trailing slash). */
  publicBaseUrl: string;
  /** Where the payment page sends the customer back to (app deep link or web page). */
  paymentReturnUrl: string;
  paymentProvider: PaymentProviderName;
  /** Length of the split-pay soft hold. */
  holdMinutes: number;
  /** Set RUN_WORKERS=false on API-only replicas. */
  runWorkers: boolean;
  tap: {
    secretKey: string | null;
    apiBase: string;
  };
  checkout: {
    secretKey: string | null;
    webhookSecret: string | null;
    processingChannelId: string | null;
    apiBase: string;
  };
}

type Env = Record<string, string | undefined>;

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function optional(env: Env, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

/**
 * Reads and validates the environment. Throws one error listing every problem,
 * so a bad deployment fails at boot instead of at the first payment.
 */
export function loadConfig(env: Env): AppConfig {
  const problems: string[] = [];

  const required = (key: string): string => {
    const value = optional(env, key);
    if (!value) problems.push(`${key} is required`);
    return value ?? '';
  };

  const integer = (key: string, fallback: number, min: number, max: number): number => {
    const raw = optional(env, key);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      problems.push(`${key} must be an integer between ${min} and ${max}`);
      return fallback;
    }
    return value;
  };

  const nodeEnvRaw = optional(env, 'NODE_ENV') ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnvRaw)) {
    problems.push('NODE_ENV must be development, test or production');
  }
  const nodeEnv = nodeEnvRaw as AppConfig['nodeEnv'];

  const providerRaw = optional(env, 'PAYMENT_PROVIDER') ?? 'mock';
  if (!['tap', 'checkout', 'mock'].includes(providerRaw)) {
    problems.push('PAYMENT_PROVIDER must be tap, checkout or mock');
  }
  const paymentProvider = providerRaw as PaymentProviderName;

  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret && jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters');
  }

  const config: AppConfig = {
    nodeEnv,
    port: integer('PORT', 3000, 1, 65535),
    databaseUrl: required('DATABASE_URL'),
    databasePoolMax: integer('DATABASE_POOL_MAX', 10, 1, 100),
    redisUrl: required('REDIS_URL'),
    jwtSecret,
    publicBaseUrl: trimSlash(required('PUBLIC_BASE_URL')),
    paymentReturnUrl: required('PAYMENT_RETURN_URL'),
    paymentProvider,
    holdMinutes: integer('HOLD_MINUTES', 15, 1, 120),
    runWorkers: (optional(env, 'RUN_WORKERS') ?? 'true').toLowerCase() !== 'false',
    tap: {
      secretKey: optional(env, 'TAP_SECRET_KEY'),
      apiBase: trimSlash(optional(env, 'TAP_API_BASE') ?? 'https://api.tap.company/v2'),
    },
    checkout: {
      secretKey: optional(env, 'CHECKOUT_SECRET_KEY'),
      webhookSecret: optional(env, 'CHECKOUT_WEBHOOK_SECRET'),
      processingChannelId: optional(env, 'CHECKOUT_PROCESSING_CHANNEL_ID'),
      apiBase: trimSlash(optional(env, 'CHECKOUT_API_BASE') ?? 'https://api.sandbox.checkout.com'),
    },
  };

  if (paymentProvider === 'tap' && !config.tap.secretKey) {
    problems.push('TAP_SECRET_KEY is required when PAYMENT_PROVIDER=tap');
  }
  if (paymentProvider === 'checkout') {
    if (!config.checkout.secretKey) problems.push('CHECKOUT_SECRET_KEY is required when PAYMENT_PROVIDER=checkout');
    if (!config.checkout.webhookSecret) problems.push('CHECKOUT_WEBHOOK_SECRET is required when PAYMENT_PROVIDER=checkout');
    if (!config.checkout.processingChannelId) {
      problems.push('CHECKOUT_PROCESSING_CHANNEL_ID is required when PAYMENT_PROVIDER=checkout');
    }
  }
  if (nodeEnv === 'production' && paymentProvider === 'mock') {
    problems.push('PAYMENT_PROVIDER=mock is not allowed in production');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  }
  return config;
}
