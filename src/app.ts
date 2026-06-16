import express from 'express';
import type { Express, Request, Response, Router } from 'express';
import morgan from 'morgan';
import { redis, COUNTER_KEY, ROWS_KEY } from './redis.js';

export const app: Express = express();

app.use(morgan('common'));
app.use(express.json());
// Terima juga payload non-JSON (mis. dari modul GSM) sebagai teks mentah
app.use(express.text({ type: '*/*' }));

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

// Ambil semua row terurut berdasarkan number
async function getAllRows(): Promise<{ number: number; data: unknown }[]> {
  const rows = (await redis.hgetall<Record<string, unknown>>(ROWS_KEY)) ?? {};
  return Object.entries(rows)
    .map(([number, data]) => ({ number: Number(number), data }))
    .sort((a, b) => a.number - b.number);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ===== Halaman utama: tabel data =====
app.get('/', async (_req: Request, res: Response) => {
  const rows = await getAllRows();

  const tableBody = rows.length
    ? rows
        .map((row) => {
          const json =
            typeof row.data === 'string' ? row.data : JSON.stringify(row.data, null, 2);
          return `<tr><td class="num">${row.number}</td><td><pre>${escapeHtml(json)}</pre></td></tr>`;
        })
        .join('')
    : '<tr><td colspan="2" class="empty">Belum ada data. POST ke /api untuk menambah.</td></tr>';

  res.type('html').send(`<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="5" />
  <title>IoT Test Server</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 900px; padding: 0 1rem; color: #1a1a1a; }
    h1 { margin-bottom: .25rem; }
    .sub { color: #666; margin-top: 0; font-size: .9rem; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th, td { border: 1px solid #ddd; padding: .5rem .75rem; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; }
    td.num { width: 70px; font-weight: 600; text-align: center; }
    td.empty { text-align: center; color: #888; padding: 2rem; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: .85rem; }
    code { background: #f0f0f0; padding: .1rem .3rem; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>IoT Test Server</h1>
  <p class="sub">Total data: ${rows.length} &middot; halaman auto-refresh tiap 5 detik</p>
  <p class="sub">CRUD endpoint: <code>POST/GET/PUT/DELETE /api</code></p>
  <table>
    <thead><tr><th>number</th><th>data</th></tr></thead>
    <tbody>${tableBody}</tbody>
  </table>
</body>
</html>`);
});

// ===== CRUD di /api =====
const api: Router = express.Router();

// CREATE: 1 POST = 1 row (number, data)
api.post('/', async (req: Request, res: Response) => {
  const data = parseBody(req.body);
  const number = await redis.incr(COUNTER_KEY);
  await redis.hset(ROWS_KEY, { [number]: data });
  res.status(201).json({ number, data });
});

// READ all
api.get('/', async (_req: Request, res: Response) => {
  res.json(await getAllRows());
});

// READ one
api.get('/:number', async (req: Request, res: Response) => {
  const number = String(req.params['number']);
  const data = await redis.hget(ROWS_KEY, number);
  if (data === null || data === undefined) {
    res.status(404).json({ error: `data dengan number ${number} tidak ditemukan` });
    return;
  }
  res.json({ number: Number(number), data });
});

// UPDATE
api.put('/:number', async (req: Request, res: Response) => {
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
api.delete('/:number', async (req: Request, res: Response) => {
  const number = String(req.params['number']);
  const removed = await redis.hdel(ROWS_KEY, number);
  if (removed === 0) {
    res.status(404).json({ error: `data dengan number ${number} tidak ditemukan` });
    return;
  }
  res.json({ deleted: Number(number) });
});

app.use('/api', api);

// Vercel zero-config Express: file ini dideteksi otomatis dan
// memerlukan Express app sebagai default export.
export default app;
