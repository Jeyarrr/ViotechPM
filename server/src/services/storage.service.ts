import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/errors.js';

export interface PrivateStorage {
  put(data: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export function localStorage(
  root = process.env.UPLOAD_DIRECTORY || resolve(process.cwd(), '../.local/uploads'),
): PrivateStorage {
  const path = (key: string) => {
    if (!/^[0-9a-f-]{36}$/.test(key))
      throw new AppError(400, 'INVALID_OBJECT_KEY', 'Invalid storage key.');
    return resolve(root, key);
  };
  return {
    async put(data) {
      await mkdir(root, { recursive: true });
      const key = randomUUID();
      await writeFile(path(key), data, { flag: 'wx', mode: 0o600 });
      return key;
    },
    read: (key) => readFile(path(key)),
    remove: (key) => unlink(path(key)),
  };
}
export function uploadLimit() {
  const value = Number(process.env.UPLOAD_MAX_BYTES ?? 10485760);
  if (!Number.isInteger(value) || value < 1 || value > 50 * 1024 * 1024)
    throw Error('UPLOAD_MAX_BYTES must be between 1 and 52428800.');
  return value;
}
export function inspectUpload(name: string, data: Buffer, limit = uploadLimit()) {
  // eslint-disable-next-line no-control-regex -- Reject unsafe control characters in filenames.
  if (!name || name.length > 180 || /[/\\\x00-\x1f]/u.test(name) || name.startsWith('.'))
    throw new AppError(
      422,
      'INVALID_FILENAME',
      'Use a filename without paths or control characters.',
    );
  if (!data.length || data.length > limit)
    throw new AppError(413, 'FILE_SIZE', 'File is empty or exceeds the upload limit.');
  const ext = extname(name).toLowerCase();
  const starts = (hex: string) => data.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  if (ext === '.png' && starts('89504e470d0a1a0a')) return 'image/png';
  if (['.jpg', '.jpeg'].includes(ext) && starts('ffd8ff')) return 'image/jpeg';
  if (
    ext === '.webp' &&
    data.subarray(0, 4).toString() === 'RIFF' &&
    data.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp';
  if (
    ext === '.pdf' &&
    data.subarray(0, 5).toString() === '%PDF-' &&
    data.subarray(-1024).includes(Buffer.from('%%EOF'))
  )
    return 'application/pdf';
  if (['.txt', '.csv'].includes(ext)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(data);
    } catch {
      throw new AppError(422, 'INVALID_FILE', 'Text documents must use UTF-8.');
    }
    if (!data.includes(0) && !starts('4d5a') && !starts('7f454c46'))
      return ext === '.csv' ? 'text/csv' : 'text/plain';
  }
  throw new AppError(
    422,
    'INVALID_FILE',
    'Supported files: PDF, PNG, JPEG, WebP, UTF-8 TXT and CSV. File content must match its type.',
  );
}
