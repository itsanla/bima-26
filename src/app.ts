import express from 'express';
import type { Express, Request, Response } from 'express';
import morgan from 'morgan';
import { redis, COUNTER_KEY, ROWS_KEY } from './redis.js';

export const app: Express = express();

app.use(morgan('common'));
app.use(express.json());
// Terima juga payload non-JSON (mis. dari modul GSM) sebagai teks mentah
app.use(express.text({ type: '*/*' }));

// Health check / info
app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'IoT test server siap. CRUD ke /data',
    endpoints: {
      create: 'POST /data  (body bebas: json apapun)',
      list: 'GET /data',
      get: 'GET /data/:number',
      update: 'PUT /data/:number',
      delete: 'DELETE /data/:number',
    },
  });
});

// Normalisasi body: bisa berupa object (json), string (text), atau kosong
function parseBody(body: unknown): unknown {
  if (typeof body === 'string') {
    if (body.trim() === '') return {};
    try {
      return JSON.parse(body);
    } catch {
      return body; // simpan apa adanya kalau bukan json valid
    }
  }
  return body ?? {};
}

// CREATE: 1 POST = 1 row (number, data)
app.post('/data', async (req: Request, res: Response) => {
  const data = parseBody(req.body);
  const number = await redis.incr(COUNTER_KEY);
  await redis.hset(ROWS_KEY, { [number]: data });
  res.status(201).json({ number, data });
});

// READ all
app.get('/data', async (_req: Request, res: Response) => {
  const rows = (await redis.hgetall<Record<string, unknown>>(ROWS_KEY)) ?? {};
  const result = Object.entries(rows)
    .map(([number, data]) => ({ number: Number(number), data }))
    .sort((a, b) => a.number - b.number);
  res.json(result);
});

// READ one
app.get('/data/:number', async (req: Request, res: Response) => {
  const number = String(req.params['number']);
  const data = await redis.hget(ROWS_KEY, number);
  if (data === null || data === undefined) {
    res.status(404).json({ error: `data dengan number ${number} tidak ditemukan` });
    return;
  }
  res.json({ number: Number(number), data });
});

// UPDATE
app.put('/data/:number', async (req: Request, res: Response) => {
  const number = String(req.params['number']);
  const exists = await redis.hexists(ROWS_KEY, number);
  if (!exists) {
    res.status(404).json({ error: `data dengan number ${number} tidak ditemukan` });
    return;
  }
  const data = parseBody(req.body);
  await redis.hset(ROWS_KEY, { [number]: data });
  res.json({ number: Number(number), data });
});

// DELETE
app.delete('/data/:number', async (req: Request, res: Response) => {
  const number = String(req.params['number']);
  const removed = await redis.hdel(ROWS_KEY, number);
  if (removed === 0) {
    res.status(404).json({ error: `data dengan number ${number} tidak ditemukan` });
    return;
  }
  res.json({ deleted: Number(number) });
});
