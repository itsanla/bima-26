import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { redis, COUNTER_KEY, ROWS_KEY } from './redis.js';
import type { IncomingMessage } from 'http';

function parseMessage(message: string): unknown {
  if (message.trim() === '') return {};
  try {
    return JSON.parse(message);
  } catch {
    return message;
  }
}

export const connectedDevices = new Map<string, { id: string; ip: string; connectedAt: string; lastUpdate: string; lastData: any }>();
const dashboardClients = new Set<WebSocket>();

export function broadcastDashboard() {
  const data = JSON.stringify({
    type: 'update',
    devices: Array.from(connectedDevices.values())
  });
  for (const client of dashboardClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function setupWebSocket(server: Server) {
  // WSS untuk IoT Devices
  const iotWss = new WebSocketServer({ server, path: '/api/v1/sim800' });
  // WSS untuk Dashboard Real-time
  const dashboardWss = new WebSocketServer({ server, path: '/sim800/ws' });

  iotWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const forwarded = req.headers['x-forwarded-for'];
    let ip = 'unknown';
    if (typeof forwarded === 'string') {
      ip = forwarded.split(',')[0] || 'unknown';
    } else if (req.socket.remoteAddress) {
      ip = req.socket.remoteAddress;
    }
    
    // Generate simple ID
    const id = `device_${Math.random().toString(36).substring(2, 9)}`;
    
    connectedDevices.set(id, {
      id,
      ip,
      connectedAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      lastData: null
    });
    
    console.log(`[IoT] Device connected: ${id} from ${ip}`);
    broadcastDashboard();

    ws.on('message', async (data: Buffer | string) => {
      try {
        const messageString = data.toString('utf-8');
        const parsedData = parseMessage(messageString);
        
        // Update dashboard state
        const device = connectedDevices.get(id);
        if (device) {
          device.lastData = parsedData;
          device.lastUpdate = new Date().toISOString();
          broadcastDashboard();
        }

        // Save to Redis
        const number = await redis.incr(COUNTER_KEY);
        await redis.hset(ROWS_KEY, { [number]: parsedData });
        
        ws.send(JSON.stringify({ success: true, number, data: parsedData }));
      } catch (error) {
        console.error('Error handling WS message:', error);
        ws.send(JSON.stringify({ error: 'Failed to process message' }));
      }
    });

    ws.on('close', () => {
      console.log(`[IoT] Device disconnected: ${id}`);
      connectedDevices.delete(id);
      broadcastDashboard();
    });
  });

  // Handler untuk koneksi Dashboard UI
  dashboardWss.on('connection', (ws: WebSocket) => {
    dashboardClients.add(ws);
    
    // Kirim data awal saat dashboard baru dibuka
    ws.send(JSON.stringify({
      type: 'init',
      devices: Array.from(connectedDevices.values())
    }));

    ws.on('close', () => {
      dashboardClients.delete(ws);
    });
  });

  return { iotWss, dashboardWss };
}
