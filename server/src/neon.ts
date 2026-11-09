import { upgradeWebSocket } from '@neon/functions';
import WebSocket from 'ws';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createDatabase } from './config/database.js';
import { assertProductionAccounts } from './services/production-security.service.js';

// Keep the existing Express and Socket.IO authorization on a private loopback server.
// Only the Neon fetch handler is exposed publicly.
let startup: Promise<string> | undefined;
async function start() {
  const config = parseEnv(process.env);
  const db = createDatabase(config.DATABASE_URL);
  try {
    await db.$connect();
    await assertProductionAccounts(db, config.HOSTED_TEST_MODE === 'true');
    const runtime = await createApp(config, db);
    await new Promise<void>((resolve, reject) => {
      runtime.server.once('error', reject);
      runtime.server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = runtime.server.address();
    if (!address || typeof address === 'string') throw Error('API listener unavailable');
    return `http://127.0.0.1:${address.port}`;
  } catch (error) {
    await db.$disconnect();
    startup = undefined;
    throw error;
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/socket.io/')
      return new Response('Not found', { status: 404 });
    const origin = await (startup ??= start());
    const target = `${origin}${url.pathname}${url.search}`;
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('content-length');
    headers.set('x-forwarded-proto', 'https');

    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      if (url.pathname !== '/socket.io/' || headers.get('origin') !== process.env.CLIENT_ORIGIN)
        return new Response('Forbidden', { status: 403 });
      const upstream = new WebSocket(target.replace('http:', 'ws:'), {
        headers: {
          origin: headers.get('origin')!,
          cookie: headers.get('cookie') ?? '',
          'x-forwarded-proto': 'https',
        },
        handshakeTimeout: 10000,
        maxPayload: 8192,
      });
      const pending: { data: Buffer; binary: boolean }[] = [];
      const connection: { downstream?: ReturnType<typeof upgradeWebSocket>['socket'] } = {};
      upstream.on('message', (data, binary) => {
        const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (connection.downstream?.readyState === 1)
          connection.downstream.send(binary ? bytes : bytes.toString());
        else pending.push({ data: bytes, binary });
      });
      upstream.on('error', () => connection.downstream?.close(1011, 'Connection interrupted'));
      upstream.on('close', () => connection.downstream?.close(1000, 'Connection closed'));
      try {
        await new Promise<void>((resolve, reject) => {
          upstream.once('open', resolve);
          upstream.once('error', reject);
          upstream.once('unexpected-response', () => reject(Error('Handshake refused')));
        });
      } catch {
        upstream.terminate();
        return new Response('Connection unavailable', { status: 503 });
      }
      const upgraded = upgradeWebSocket(request);
      const downstream = upgraded.socket;
      connection.downstream = downstream;
      downstream.addEventListener('open', () => {
        for (const { data, binary } of pending) downstream!.send(binary ? data : data.toString());
        pending.length = 0;
      });
      downstream.addEventListener('message', (event) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(event.data);
      });
      downstream.addEventListener('close', () => upstream.close());
      downstream.addEventListener('error', () => upstream.terminate());
      return upgraded.response;
    }
    headers.delete('upgrade');
    return fetch(target, {
      method: request.method,
      headers,
      body: request.body,
      duplex: 'half',
      redirect: 'manual',
      signal: request.signal,
    } as RequestInit);
  },
};
