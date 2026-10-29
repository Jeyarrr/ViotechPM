import { it, expect } from 'vitest';
import { inspectUpload, localStorage } from '../src/services/storage.service.js';
import { manilaDay } from '../src/services/reminder.service.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('checks file signatures rather than trusting extension or MIME', () => {
  expect(inspectUpload('report.txt', Buffer.from('Project notes'))).toBe('text/plain');
  expect(inspectUpload('image.png', Buffer.from('89504e470d0a1a0a0000', 'hex'))).toBe('image/png');
  expect(() => inspectUpload('image.png', Buffer.from('MZ executable'))).toThrow();
  expect(() => inspectUpload('script.exe', Buffer.from('text'))).toThrow();
  expect(() => inspectUpload('../private.txt', Buffer.from('text'))).toThrow();
  expect(() => inspectUpload('binary.txt', Buffer.from([0, 1, 2]))).toThrow();
  expect(() => inspectUpload('huge.txt', Buffer.from('12345'), 4)).toThrow();
  expect(() => inspectUpload('empty.txt', Buffer.alloc(0))).toThrow();
});
it('keeps objects private under generated keys and rejects traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'viotech-storage-'));
  try {
    const storage = localStorage(root),
      key = await storage.put(Buffer.from('private data'));
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect((await storage.read(key)).toString()).toBe('private data');
    expect(() => storage.read('../secret')).toThrow();
    await storage.remove(key);
    await expect(storage.read(key)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true });
  }
});
it('uses the Manila business day across UTC midnight boundaries', () => {
  expect(manilaDay(new Date('2026-10-29T15:59:59Z'))).toBe('2026-10-29');
  expect(manilaDay(new Date('2026-10-29T16:00:00Z'))).toBe('2026-10-30');
});
