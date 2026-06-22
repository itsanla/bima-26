import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { redis, COUNTER_KEY, ROWS_KEY } from './redis.js';

function parseMessage(message: string): unknown {
  if (message.trim() === '') return {};
  try {
    return JSON.parse(message);
  } catch {
    return message;
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/api/v1/sim800' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket connection');

    ws.on('message', async (data: Buffer | string) => {
      try {
        const messageString = data.toString('utf-8');
        console.log('Received via WS:', messageString);
        
        const parsedData = parseMessage(messageString);
        
        // Save to Redis
        const number = await redis.incr(COUNTER_KEY);
        await redis.hset(ROWS_KEY, { [number]: parsedData });
        
        // Acknowledge back to the client
        ws.send(JSON.stringify({ success: true, number, data: parsedData }));
      } catch (error) {
        console.error('Error handling WS message:', error);
        ws.send(JSON.stringify({ error: 'Failed to process message' }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });
  });

  return wss;
}
