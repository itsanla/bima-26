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

// ===== Dashboard Real-time WebSockets (/sim800) =====
app.get('/sim800', (_req: Request, res: Response) => {
  res.type('html').send(`
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SIM800 IoT Dashboard</title>
    <style>
        :root {
            --bg-color: #f4f7f6;
            --text-color: #333;
            --card-bg: #fff;
            --accent: #007bff;
            --success: #28a745;
            --danger: #dc3545;
            --border: #e1e4e8;
        }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: var(--bg-color); color: var(--text-color); margin: 0; padding: 2rem; line-height: 1.6; }
        .container { max-width: 1000px; margin: 0 auto; }
        header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid var(--border); }
        h1 { margin: 0; color: #2c3e50; }
        .status-badge { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border-radius: 50px; background: var(--card-bg); border: 1px solid var(--border); font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background-color: var(--danger); margin-right: 8px; transition: background-color 0.3s; }
        .status-dot.connected { background-color: var(--success); }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; }
        .card { background: var(--card-bg); border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid var(--border); transition: transform 0.2s; }
        .card:hover { transform: translateY(-2px); }
        .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
        .card-title { font-weight: bold; font-size: 1.1rem; color: #2c3e50; }
        .badge { font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 4px; background: #e9ecef; color: #495057; }
        .badge.online { background: #d4edda; color: #155724; }
        .data-list { list-style: none; padding: 0; margin: 0; font-size: 0.9rem; }
        .data-list li { display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px dashed #eee; }
        .data-list li:last-child { border-bottom: none; }
        .data-label { color: #6c757d; font-weight: 500; }
        .data-value { font-family: monospace; font-weight: 600; color: #212529; }
        .empty-state { text-align: center; padding: 3rem; color: #6c757d; background: var(--card-bg); border-radius: 12px; border: 1px dashed #ccc; }
        .json-pre { background: #f8f9fa; padding: 10px; border-radius: 6px; font-size: 0.8rem; overflow-x: auto; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <h1>Dashboard SIM800</h1>
                <p style="margin: 0; color: #6c757d;">Monitoring Status & Data IoT Real-time</p>
            </div>
            <div class="status-badge">
                <div class="status-dot" id="ws-dot"></div>
                <span id="ws-status">Menghubungkan...</span>
            </div>
        </header>

        <div id="devices-grid" class="grid"></div>
        
        <div id="empty-state" class="empty-state" style="display: none;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1rem; color: #adb5bd;"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>
            <h3>Belum ada modul IoT yang terhubung</h3>
            <p>Pastikan modul SIM800 Anda melakukan koneksi ke endpoint WebSocket.</p>
        </div>
    </div>

    <script>
        const wsStatus = document.getElementById('ws-status');
        const wsDot = document.getElementById('ws-dot');
        const grid = document.getElementById('devices-grid');
        const emptyState = document.getElementById('empty-state');

        function connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host + '/sim800/ws';
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                wsStatus.textContent = 'Dashboard Real-time Aktif';
                wsDot.classList.add('connected');
            };

            ws.onclose = () => {
                wsStatus.textContent = 'Terputus. Menghubungkan ulang...';
                wsDot.classList.remove('connected');
                setTimeout(connect, 3000);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.devices) renderDevices(data.devices);
                } catch (e) { console.error('Error parsing WS message', e); }
            };
        }

        function formatTime(isoString) {
            if (!isoString) return '-';
            return new Date(isoString).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }

        function renderDevices(devices) {
            if (devices.length === 0) {
                grid.innerHTML = '';
                emptyState.style.display = 'block';
                return;
            }
            emptyState.style.display = 'none';
            grid.innerHTML = devices.map(dev => {
                let dataHtml = '';
                if (dev.lastData && typeof dev.lastData === 'object') {
                    dataHtml = '<ul class="data-list">';
                    for (const [key, val] of Object.entries(dev.lastData)) {
                        dataHtml += \`<li><span class="data-label">\${key}</span> <span class="data-value">\${val}</span></li>\`;
                    }
                    dataHtml += '</ul>';
                } else if (dev.lastData) {
                    dataHtml = \`<pre class="json-pre">\${JSON.stringify(dev.lastData, null, 2)}</pre>\`;
                } else {
                    dataHtml = '<p style="color: #adb5bd; font-size: 0.9rem; text-align: center; margin: 1rem 0;">Belum ada data masuk</p>';
                }
                return \`
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">Device \${dev.id.substring(7).toUpperCase()}</div>
                        <span class="badge online">Online</span>
                    </div>
                    <div style="margin-bottom: 1rem; font-size: 0.85rem; color: #6c757d; display: flex; justify-content: space-between;">
                        <span>IP: \${dev.ip}</span>
                        <span>Update: \${formatTime(dev.lastUpdate)}</span>
                    </div>
                    <div>\${dataHtml}</div>
                </div>\`;
            }).join('');
        }
        connect();
    </script>
</body>
</html>
  `);
});

app.use('/api', api);

// Vercel zero-config Express: file ini dideteksi otomatis dan
// memerlukan Express app sebagai default export.
export default app;
