export type GatewayMode = 'real' | 'test';

export type ClockMode = 'system' | 'controlled';

export type Config = {
  gatewayMode: GatewayMode;
  gatewayUrl: string;
  serviceToken: string;
  databaseUrl: string;
  port: number;
  gitSha: string;
  clockMode: ClockMode;
  workerPollMs: number;
  webhookAllowPrivate: boolean;
};

type Env = Record<string, string | undefined>;

const required = (env: Env, name: string): string => {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
};

const oneOf = <T extends string>(env: Env, name: string, values: readonly T[], fallback: T): T => {
  const value = env[name] ?? fallback;
  if (!values.includes(value as T)) {
    throw new Error(`${name} must be one of ${values.join(', ')}`);
  }
  return value as T;
};

const integer = (env: Env, name: string, fallback: number): number => {
  const value = env[name];
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

export const loadConfig = (env: Env): Config => {
  const gatewayMode = oneOf(env, 'GATEWAY_MODE', ['real', 'test'], 'real');
  const clockMode = oneOf(
    env,
    'CLOCK_MODE',
    ['system', 'controlled'],
    gatewayMode === 'test' ? 'controlled' : 'system',
  );
  if (gatewayMode === 'real' && clockMode === 'controlled') {
    throw new Error('GATEWAY_MODE=real cannot run with CLOCK_MODE=controlled');
  }
  const webhookAllowPrivate = env.WEBHOOK_ALLOW_PRIVATE === 'true';
  if (gatewayMode === 'real' && webhookAllowPrivate) {
    throw new Error('GATEWAY_MODE=real cannot run with WEBHOOK_ALLOW_PRIVATE=true');
  }
  return {
    gatewayMode,
    gatewayUrl: required(env, 'GATEWAY_URL'),
    serviceToken: required(env, 'SERVICE_TOKEN'),
    databaseUrl: required(env, 'DATABASE_URL'),
    port: integer(env, 'PORT', 3000),
    gitSha: env.GIT_SHA ?? 'dev',
    clockMode,
    workerPollMs: integer(env, 'WORKER_POLL_MS', 500),
    webhookAllowPrivate,
  };
};
