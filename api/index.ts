// Entrypoint serverless untuk Vercel.
// Express app adalah request handler (req, res), jadi cukup di-export default.
import { app } from '../src/app.js';

export default app;
