import type { IncomingMessage, ServerResponse } from 'http';
import { app } from '../src/app.js';

export default (req: IncomingMessage, res: ServerResponse) => app(req, res as any);
