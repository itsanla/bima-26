import { Redis } from '@upstash/redis';

// Kredensial Upstash. Diutamakan dari environment variable (set di Vercel),
// dengan fallback ke nilai literal supaya service tetap jalan untuk testing.
export const redis = new Redis({
  url: process.env['UPSTASH_REDIS_REST_URL'] ?? 'https://verified-chicken-115944.upstash.io',
  token:
    process.env['UPSTASH_REDIS_REST_TOKEN'] ??
    'gQAAAAAAAcToAAIgcDE0NjJiZTM5NmVhYjM0N2NkOGQ3ZTgwY2EwZTY4MjRmMw',
});

// Nama key di Redis
export const COUNTER_KEY = 'rows:counter'; // auto-increment id
export const ROWS_KEY = 'rows'; // hash: field = id, value = json data
