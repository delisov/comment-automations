import { describe, expect, it } from 'vitest';
import { isPrivateAddress, webhookHeaders } from './webhook.js';

describe('isPrivateAddress', () => {
  it('refuses loopback, private, link-local, shared and metadata ranges', () => {
    const blocked = [
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '127.0.0.1',
      '0.0.0.0',
      '169.254.169.254',
      '100.64.0.1',
      '100.127.255.255',
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:c0a8:1',
    ];
    expect(blocked.map((address) => [address, isPrivateAddress(address)])).toEqual(
      blocked.map((address) => [address, true]),
    );
  });

  it('allows public addresses', () => {
    const open = ['8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '::ffff:808:808'];
    expect(open.map((address) => [address, isPrivateAddress(address)])).toEqual(
      open.map((address) => [address, false]),
    );
  });
});

describe('webhookHeaders', () => {
  it('lets the engine idempotency key replace a creator header of any letter case', () => {
    const headers = new Headers(
      webhookHeaders(
        { 'x-idempotency-key': 'creator-a', 'X-IDEMPOTENCY-KEY': 'creator-b', 'x-other': 'kept' },
        'engine-key',
      ),
    );
    expect([headers.get('x-idempotency-key'), headers.get('x-other')]).toEqual([
      'engine-key',
      'kept',
    ]);
  });
});
