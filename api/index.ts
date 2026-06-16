// @ts-expect-error Vercel will build dist/ before runtime
import { app } from '../dist/app.js';

export default (req: any, res: any) => app(req, res);
