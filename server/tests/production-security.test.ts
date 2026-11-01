import { describe, expect, it, vi } from 'vitest';
import argon2 from 'argon2';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  productionPasswordAllowed,
  assertProductionTarget,
  assertProductionAccounts,
} from '../src/services/production-security.service.js';

describe('production password and target safeguards', () => {
  it('blocks missing administrators, obsolete hashes and known default credentials at startup', async () => {
    const findMany = vi.fn();
    const db = { user: { findMany } } as unknown as PrismaClient;
    findMany.mockResolvedValue([]);
    await expect(assertProductionAccounts(db)).rejects.toThrow();
    findMany.mockResolvedValue([{ passwordHash: 'obsolete' }]);
    await expect(assertProductionAccounts(db)).rejects.toThrow();
    findMany.mockResolvedValue([{ passwordHash: await argon2.hash('admin') }]);
    await expect(assertProductionAccounts(db)).rejects.toThrow();
    findMany.mockResolvedValue([
      { passwordHash: await argon2.hash('river copper lantern meadow 72') },
    ]);
    await expect(assertProductionAccounts(db)).resolves.toBeUndefined();
  });
  it('rejects development, placeholder, short and repetitive passwords', () => {
    for (const password of [
      'admin',
      'password1234567890123',
      'a'.repeat(24),
      'REPLACE_WITH_A_RANDOM_PASSWORD',
      'short',
      'abc'.repeat(10),
      'passwordpassword',
    ])
      expect(productionPasswordAllowed(password)).toBe(false);
    expect(productionPasswordAllowed('river copper lantern meadow 72')).toBe(true);
    expect(productionPasswordAllowed('x'.repeat(129))).toBe(false);
  });
  const input = {
    NODE_ENV: 'production',
    DIRECT_DATABASE_URL:
      'postgresql://owner:private@db.example.test/private_test?sslmode=verify-full',
    PROVISION_TARGET_HOST: 'db.example.test',
    PROVISION_TARGET_DATABASE: 'private_test',
  };
  it('requires an exact confirmed remote TLS target without printing credentials', () => {
    expect(assertProductionTarget(input).hostname).toBe('db.example.test');
    for (const override of [
      { NODE_ENV: 'development' },
      { PROVISION_TARGET_DATABASE: 'wrong' },
      { PROVISION_TARGET_HOST: 'wrong' },
      { DIRECT_DATABASE_URL: 'postgresql://owner:private@localhost/private_test?sslmode=require' },
      { DIRECT_DATABASE_URL: 'postgresql://owner:private@db.example.test/private_test' },
      {
        DIRECT_DATABASE_URL:
          'postgresql://owner:private@db-pooler.example.test/private_test?sslmode=require',
      },
    ]) {
      expect(() => assertProductionTarget({ ...input, ...override })).toThrow();
      try {
        assertProductionTarget({ ...input, ...override });
      } catch (error) {
        expect(String(error)).not.toContain('owner:private');
      }
    }
  });
});

import { parseEnv } from '../src/config/env.js';
describe('production environment fails closed', () => {
  const valid = {
    NODE_ENV: 'production',
    CLIENT_ORIGIN: 'https://app.example.test',
    DATABASE_URL: 'postgresql://user:private@db-pooler.example.test/app?sslmode=require',
    DIRECT_DATABASE_URL: 'postgresql://user:private@db.example.test/app?sslmode=verify-full',
    SESSION_SECRET: '0123456789abcdefABCDEF'.repeat(3),
    PRODUCTION_READY_ACK: 'true',
    UPLOAD_STORAGE: 'durable-local',
    UPLOAD_DIRECTORY: '/var/private/uploads',
  };
  it('accepts explicit TLS and durable storage configuration', () =>
    expect(parseEnv(valid).NODE_ENV).toBe('production'));
  it('rejects unsafe, incomplete and pooled listener configurations', () => {
    for (const override of [
      { SESSION_SECRET: 'a'.repeat(64) },
      { PRODUCTION_READY_ACK: 'false' },
      { UPLOAD_STORAGE: 'local' },
      { UPLOAD_DIRECTORY: 'relative' },
      { REALTIME_DATABASE_URL: valid.DATABASE_URL },
      { DATABASE_URL: 'postgresql://user:private@db.example.test/app' },
      { DIRECT_DATABASE_URL: '' },
    ])
      expect(() => parseEnv({ ...valid, ...override })).toThrow();
  });
  it('does not allow cross-site cookies without HTTPS', () =>
    expect(() =>
      parseEnv({ ...valid, NODE_ENV: 'development', COOKIE_SAME_SITE: 'none' }),
    ).toThrow());
});
