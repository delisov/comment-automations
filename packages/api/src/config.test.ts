import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = {
  GATEWAY_URL: 'http://stand:3100',
  SERVICE_TOKEN: 'secret',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/app',
};

describe('loadConfig', () => {
  it('defaults to real mode with the system clock, port 3000 and a 500 ms worker poll', () => {
    expect(loadConfig(base)).toEqual({
      gatewayMode: 'real',
      gatewayUrl: 'http://stand:3100',
      serviceToken: 'secret',
      databaseUrl: 'postgres://postgres:postgres@localhost:5432/app',
      port: 3000,
      gitSha: 'dev',
      clockMode: 'system',
      workerPollMs: 500,
    });
  });

  it('test mode turns the controlled clock on unless told otherwise', () => {
    expect(loadConfig({ ...base, GATEWAY_MODE: 'test' }).clockMode).toBe('controlled');
    expect(loadConfig({ ...base, GATEWAY_MODE: 'test', CLOCK_MODE: 'system' }).clockMode).toBe(
      'system',
    );
  });

  it('refuses real mode together with the controlled clock', () => {
    expect(() => loadConfig({ ...base, GATEWAY_MODE: 'real', CLOCK_MODE: 'controlled' })).toThrow(
      'GATEWAY_MODE=real cannot run with CLOCK_MODE=controlled',
    );
  });

  it('refuses a missing gateway url, token or database url and a bad mode', () => {
    expect(() => loadConfig({ ...base, GATEWAY_URL: '' })).toThrow('GATEWAY_URL is required');
    expect(() => loadConfig({ ...base, SERVICE_TOKEN: undefined })).toThrow(
      'SERVICE_TOKEN is required',
    );
    expect(() => loadConfig({ ...base, DATABASE_URL: undefined })).toThrow(
      'DATABASE_URL is required',
    );
    expect(() => loadConfig({ ...base, GATEWAY_MODE: 'fake' })).toThrow(
      'GATEWAY_MODE must be one of real, test',
    );
    expect(() => loadConfig({ ...base, WORKER_POLL_MS: '0' })).toThrow(
      'WORKER_POLL_MS must be a positive integer',
    );
  });

  it('reads port, sha and poll interval from the environment', () => {
    const config = loadConfig({ ...base, PORT: '4000', GIT_SHA: 'abc', WORKER_POLL_MS: '50' });
    expect([config.port, config.gitSha, config.workerPollMs]).toEqual([4000, 'abc', 50]);
  });
});
