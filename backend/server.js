import { tracer } from './tracing.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import pg from 'pg';
import { register, Counter, Histogram, Gauge } from 'prom-client';

const { Pool } = pg;

const PORT = process.env.PORT || 3001;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://chat:chat@postgres:5432/chat';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const MAX_MESSAGES = parseInt(process.env.MAX_MESSAGES) || 50;

const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

const chatMessages = new Counter({
  name: 'chat_messages_total',
  help: 'Total number of chat messages sent',
});

const chatActiveUsers = new Gauge({
  name: 'chat_active_users',
  help: 'Number of currently connected and joined users',
});

export function createChatServer(options = {}) {
  const {
    databaseUrl = DATABASE_URL,
    corsOrigin = CORS_ORIGIN,
    maxMessages = MAX_MESSAGES
  } = options;

  const httpServer = createServer((req, res) => {
    const start = process.hrtime.bigint();
    const route = req.url?.split('?')[0] || '/';

    const span = tracer.startSpan(`${req.method} ${route}`, {
      attributes: { 'http.method': req.method, 'http.route': route },
    });

    const finish = (statusCode) => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      httpRequests.labels(req.method, route, String(statusCode)).inc();
      httpDuration.labels(req.method, route, String(statusCode)).observe(durationSeconds);
      span.setAttribute('http.status_code', statusCode);
      span.end();
    };

    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }));
      finish(200);
      return;
    }

    if (req.url === '/metrics' && req.method === 'GET') {
      register.metrics().then(data => {
        res.writeHead(200, { 'Content-Type': register.contentType });
        res.end(data);
        finish(200);
      }).catch(() => {
        res.writeHead(500);
        res.end();
        finish(500);
      });
      return;
    }

    res.writeHead(404);
    res.end();
    finish(404);
  });

  const pool = new Pool({ connectionString: databaseUrl });

  pool.on('error', (err) => console.error('PostgreSQL Pool Error:', err));

  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  const onlineUsers = new Map();

  io.on('connection', (socket) => {
    const clientId = socket.id;
    console.log(`User connected: ${clientId}`);

    pool.query(
      'SELECT data FROM messages ORDER BY created_at DESC LIMIT $1',
      [maxMessages]
    ).then(result => {
      const messages = result.rows.map(row => row.data).filter(Boolean).reverse();
      socket.emit('message:history', messages);
    }).catch(err => {
      console.error('Error fetching message history:', err);
      socket.emit('message:history', []);
    });

    socket.on('user:join', (username) => {
      if (!username || typeof username !== 'string') {
        return socket.emit('error', { message: 'Invalid username' });
      }

      const sanitizedUsername = username.trim().substring(0, 50);
      onlineUsers.set(clientId, sanitizedUsername);
      socket.username = sanitizedUsername;
      chatActiveUsers.set(onlineUsers.size);

      io.emit('user:list', Array.from(onlineUsers.values()));
      io.emit('system:message', {
        text: `${sanitizedUsername} присоединился к чату`,
        timestamp: Date.now()
      });

      console.log(`User joined: ${sanitizedUsername}`);
    });

    socket.on('message:send', async (data) => {
      if (!socket.username) {
        return socket.emit('error', { message: 'Not authorized' });
      }

      if (!data || !data.text || typeof data.text !== 'string') {
        return socket.emit('error', { message: 'Invalid message' });
      }

      const sanitizedText = data.text.trim().substring(0, 1000);
      if (!sanitizedText) return;

      const message = {
        id: Date.now() + Math.random(),
        username: socket.username,
        text: sanitizedText,
        timestamp: Date.now()
      };

      try {
        await pool.query('INSERT INTO messages (data) VALUES ($1)', [JSON.stringify(message)]);
        await pool.query(
          'DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY created_at DESC LIMIT $1)',
          [maxMessages]
        );

        chatMessages.inc();
        io.emit('message:new', message);
        console.log(`Message from ${socket.username}: ${sanitizedText.substring(0, 50)}`);
      } catch (err) {
        console.error('Error saving message:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('typing:start', () => {
      if (socket.username) {
        socket.broadcast.emit('typing:update', {
          username: socket.username,
          isTyping: true
        });
      }
    });

    socket.on('typing:stop', () => {
      if (socket.username) {
        socket.broadcast.emit('typing:update', {
          username: socket.username,
          isTyping: false
        });
      }
    });

    socket.on('disconnect', () => {
      const username = onlineUsers.get(clientId);
      if (username) {
        onlineUsers.delete(clientId);
        chatActiveUsers.set(onlineUsers.size);
        io.emit('user:list', Array.from(onlineUsers.values()));
        io.emit('system:message', {
          text: `${username} покинул чат`,
          timestamp: Date.now()
        });
        console.log(`User disconnected: ${username}`);
      }
    });
  });

  return {
    httpServer,
    io,
    pool,
    onlineUsers,
    async start(port = PORT) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('Connected to PostgreSQL');

      return new Promise((resolve) => {
        httpServer.listen(port, () => {
          console.log(`Server running on port ${port}`);
          console.log(`CORS enabled for: ${corsOrigin}`);
          resolve();
        });
      });
    },
    async stop() {
      io.close();
      await pool.end();
      httpServer.close();
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createChatServer();

  server.start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, closing connections...`);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
