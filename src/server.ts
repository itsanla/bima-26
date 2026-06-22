import dotenv from 'dotenv';
import http from 'http';
import { app } from './app.js';
import { setupWebSocket } from './websocket.js';

dotenv.config();

const PORT = process.env['PORT'] ?? 3000;

const server = http.createServer(app);

setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server is ready`);
});
