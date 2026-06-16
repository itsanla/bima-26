# IoT Test Server

Service CRUD sederhana untuk testing kirim data dari modul IoT/GSM ke server.
Tiap POST = 1 baris data `(number, data)` di Redis (Upstash). Body bebas: JSON atau teks mentah.

**Base URL:** `https://bima.anla.works`

## Endpoint

| Method | Path | Keterangan |
|--------|------|------------|
| `GET` | `/` | Halaman HTML berisi tabel semua data (auto-refresh 5 detik) |
| `POST` | `/api` | Tambah data baru (body bebas). Balas `{ number, data }` |
| `GET` | `/api` | Ambil semua data (array) |
| `GET` | `/api/:number` | Ambil 1 data berdasarkan number |
| `PUT` | `/api/:number` | Ubah data pada number tertentu |
| `DELETE` | `/api/:number` | Hapus data pada number tertentu |

## Contoh

```bash
# Tambah data (JSON)
curl -X POST https://bima.anla.works/api \
  -H 'Content-Type: application/json' \
  -d '{"suhu":28.5,"kelembaban":70,"device":"gsm-01"}'
# -> {"number":1,"data":{"suhu":28.5,"kelembaban":70,"device":"gsm-01"}}

# Tambah data (teks mentah, mis. dari modul GSM)
curl -X POST https://bima.anla.works/api -d 'T=30;H=65'
# -> {"number":2,"data":"T=30;H=65"}

# Ambil semua
curl https://bima.anla.works/api

# Ambil satu
curl https://bima.anla.works/api/1

# Ubah
curl -X PUT https://bima.anla.works/api/1 \
  -H 'Content-Type: application/json' -d '{"suhu":99}'

# Hapus
curl -X DELETE https://bima.anla.works/api/1
```

Lihat semua data masuk secara realtime di `https://bima.anla.works/`.

## Jalankan lokal

```bash
pnpm install
pnpm run dev    # compile + jalankan di http://localhost:3000
```

Butuh env `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` (lihat `.env.example`).

## Stack

Express 5 · TypeScript · Upstash Redis · deploy di Vercel.
