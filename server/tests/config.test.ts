import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { permissionsFor } from '../src/config/permissions.js';

describe('configuration and permissions', () => {
  const valid = {
    CLIENT_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgresql://user:private-password@localhost/test',
    SESSION_SECRET: 'a'.repeat(48),
  };
  it('rejects missing or weak configuration without exposing values', () => {
    expect(() => parseEnv({})).toThrow('Invalid environment variables');
    expect(() => parseEnv({ ...valid, SESSION_SECRET: 'short' })).toThrow('SESSION_SECRET');
    expect(() => parseEnv({ ...valid, CLIENT_ORIGIN: 'http://localhost:5173/' })).toThrow(
      'CLIENT_ORIGIN',
    );
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'private-password' })).toThrow('DATABASE_URL');
    try {
      parseEnv({ ...valid, DATABASE_URL: 'private-password' });
    } catch (error) {
      expect(String(error)).not.toContain('private-password');
    }
  });
  it('requires HTTPS origins in production', () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: 'production' })).toThrow('HTTPS');
    expect(
      parseEnv({ ...valid, NODE_ENV: 'production', CLIENT_ORIGIN: 'https://pm.viotech.test' })
        .NODE_ENV,
    ).toBe('production');
  });
  it('uses least privilege for all five roles and denies unknown roles', () => {
    expect(permissionsFor('super_admin')).toContain('system:manage');
    expect(permissionsFor('project_manager')).toContain('approvals:read');
    expect(permissionsFor('project_manager')).not.toContain('system:manage');
    for (const role of ['developer', 'it_support', 'employee']) {
      expect(permissionsFor(role)).toContain('tasks:read');
      expect(permissionsFor(role)).not.toContain('system:manage');
      expect(permissionsFor(role)).not.toContain('audit:read');
    }
    expect(permissionsFor('unrecognized')).toEqual([]);
  });
});
