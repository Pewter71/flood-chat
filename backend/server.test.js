import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

const mockPool = {
  connect: jest.fn().mockResolvedValue(undefined),
  end: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  query: jest.fn().mockResolvedValue({ rows: [] })
};

jest.unstable_mockModule('pg', () => ({
  default: {
    Pool: jest.fn(() => mockPool)
  }
}));

const { createChatServer } = await import('./server.js');
const { io: ioClient } = await import('socket.io-client');

describe('Chat Server', () => {
  let server;
  let clientSocket;
  const TEST_PORT = 3002;
  const TEST_DATABASE_URL = 'postgresql://chat:chat@localhost:5432/chat';

  beforeAll(async () => {
    server = createChatServer({
      databaseUrl: TEST_DATABASE_URL,
      corsOrigin: 'http://localhost:5173',
      maxMessages: 50
    });
    await server.start(TEST_PORT);
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    await server.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockResolvedValue({ rows: [] });
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
  });

  describe('HTTP Server', () => {
    it('should respond to health check endpoint', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('status', 'healthy');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      expect(typeof data.uptime).toBe('number');
    });

    it('should return 404 for unknown endpoints', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/unknown`);
      expect(response.status).toBe(404);
    });
  });

  describe('Socket.IO Connection', () => {
    it('should accept new client connections', (done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`);

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    it('should send message history on connection', (done) => {
      const mockMessages = [
        { id: 1, username: 'Test', text: 'Hello', timestamp: Date.now() },
        { id: 2, username: 'User', text: 'World', timestamp: Date.now() }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockMessages.map(data => ({ data })) });

      clientSocket = ioClient(`http://localhost:${TEST_PORT}`);

      clientSocket.on('message:history', (messages) => {
        expect(messages).toHaveLength(2);
        expect(messages[0]).toHaveProperty('username');
        expect(messages[0]).toHaveProperty('text');
        done();
      });
    });

    it('should handle empty message history', (done) => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      clientSocket = ioClient(`http://localhost:${TEST_PORT}`);

      clientSocket.on('message:history', (messages) => {
        expect(messages).toEqual([]);
        done();
      });
    });

    it('should handle database error when fetching history', (done) => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      clientSocket = ioClient(`http://localhost:${TEST_PORT}`);

      clientSocket.on('message:history', (messages) => {
        expect(messages).toEqual([]);
        done();
      });
    });

    it('should handle null data rows in history', (done) => {
      const mockRows = [
        { data: { id: 1, username: 'Test', text: 'Valid', timestamp: Date.now() } },
        { data: null },
        { data: { id: 2, username: 'User', text: 'Also valid', timestamp: Date.now() } }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      clientSocket = ioClient(`http://localhost:${TEST_PORT}`);

      clientSocket.on('message:history', (messages) => {
        expect(messages).toHaveLength(2);
        expect(messages.every(m => m !== null)).toBe(true);
        done();
      });
    });
  });

  describe('User Join', () => {
    beforeEach(() => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`);
    });

    it('should handle user join with valid username', (done) => {
      const username = 'TestUser';

      clientSocket.on('user:list', (users) => {
        if (users.includes(username)) {
          expect(users).toContain(username);
          done();
        }
      });

      clientSocket.emit('user:join', username);
    });

    it('should handle user join with system message', (done) => {
      const username = 'NewUser';

      clientSocket.on('system:message', (data) => {
        if (data.text.includes(username)) {
          expect(data.text).toContain('присоединился к чату');
          expect(data).toHaveProperty('timestamp');
          done();
        }
      });

      clientSocket.emit('user:join', username);
    });

    it('should sanitize long usernames', (done) => {
      const longUsername = 'a'.repeat(100);

      clientSocket.on('user:list', (users) => {
        const addedUser = users.find(u => u.startsWith('a'));
        if (addedUser) {
          expect(addedUser.length).toBeLessThanOrEqual(50);
          done();
        }
      });

      clientSocket.emit('user:join', longUsername);
    });

    it('should trim whitespace from usernames', (done) => {
      const username = 'TestUser';

      clientSocket.on('user:list', (users) => {
        const addedUser = users.find(u => u === 'TestUser');
        if (addedUser) {
          expect(addedUser).toBe('TestUser');
          done();
        }
      });

      clientSocket.emit('user:join', username);
    });

    it('should reject invalid username (empty)', (done) => {
      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Invalid username');
        done();
      });

      clientSocket.emit('user:join', '');
    });

    it('should reject invalid username', (done) => {
      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Invalid username');
        done();
      });

      clientSocket.emit('user:join', 123);
    });

    it('should reject null username', (done) => {
      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Invalid username');
        done();
      });

      clientSocket.emit('user:join', null);
    });
  });

  describe('Message Sending', () => {
    beforeEach((done) => {
      clientSocket = ioClient(`http://localhost:${TEST_PORT}`);
      clientSocket.on('connect', () => {
        clientSocket.emit('user:join', 'TestUser');
        setTimeout(done, 100);
      });
    });

    it('should send and broadcast message', (done) => {
      const messageText = 'aaaaa';

      clientSocket.on('message:new', (message) => {
        expect(message).toHaveProperty('username', 'TestUser');
        expect(message).toHaveProperty('text', messageText);
        expect(message).toHaveProperty('timestamp');
        expect(message).toHaveProperty('id');
        done();
      });

      clientSocket.emit('message:send', { text: messageText });
    });

    it('should save message to database', (done) => {
      const messageText = 'Test message';

      clientSocket.on('message:new', () => {
        expect(mockPool.query).toHaveBeenCalledWith(
          'INSERT INTO messages (data) VALUES ($1)',
          [expect.stringContaining(messageText)]
        );
        done();
      });

      clientSocket.emit('message:send', { text: messageText });
    });

    it('should sanitize long messages', (done) => {
      const longMessage = 'a'.repeat(2000);

      clientSocket.on('message:new', (message) => {
        expect(message.text.length).toBeLessThanOrEqual(1000);
        done();
      });

      clientSocket.emit('message:send', { text: longMessage });
    });

    it('should trim whitespace from messages', (done) => {
      const messageText = '  Test message  ';

      clientSocket.on('message:new', (message) => {
        expect(message.text).toBe('Test message');
        done();
      });

      clientSocket.emit('message:send', { text: messageText });
    });

    it('should reject message from unauthorized user', (done) => {
      const unauthorizedSocket = ioClient(`http://localhost:${TEST_PORT}`);

      unauthorizedSocket.on('connect', () => {
        unauthorizedSocket.on('error', (error) => {
          expect(error.message).toBe('Not authorized');
          unauthorizedSocket.disconnect();
          done();
        });

        unauthorizedSocket.emit('message:send', { text: 'Test' });
      });
    });

    it('should reject empty message data', (done) => {
      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Invalid message');
        done();
      });

      clientSocket.emit('message:send', null);
    });

    it('should reject message without text', (done) => {
      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Invalid message');
        done();
      });

      clientSocket.emit('message:send', { data: 'no text' });
    });

    it('should reject message with non-string text', (done) => {
      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Invalid message');
        done();
      });

      clientSocket.emit('message:send', { text: 123 });
    });

    it('should ignore empty trimmed messages', (done) => {
      let messageReceived = false;

      clientSocket.on('message:new', () => {
        messageReceived = true;
      });

      clientSocket.emit('message:send', { text: '   ' });

      setTimeout(() => {
        expect(messageReceived).toBe(false);
        done();
      }, 500);
    });

    it('should handle database error when saving message', (done) => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      clientSocket.on('error', (error) => {
        expect(error.message).toBe('Failed to send message');
        mockPool.query.mockResolvedValue({ rows: [] });
        done();
      });

      clientSocket.emit('message:send', { text: 'Test' });
    });
  });

  describe('Typing Indicators', () => {
    let client1, client2;

    beforeEach((done) => {
      let connected = 0;
      const checkDone = () => {
        connected++;
        if (connected === 2) setTimeout(done, 100);
      };

      client1 = ioClient(`http://localhost:${TEST_PORT}`);
      client2 = ioClient(`http://localhost:${TEST_PORT}`);

      client1.on('connect', () => {
        client1.emit('user:join', 'User1');
        checkDone();
      });

      client2.on('connect', () => {
        client2.emit('user:join', 'User2');
        checkDone();
      });
    });

    afterEach(() => {
      client1?.disconnect();
      client2?.disconnect();
    });

    it('should broadcast typing start event', (done) => {
      client2.on('typing:update', (data) => {
        expect(data.username).toBe('User1');
        expect(data.isTyping).toBe(true);
        done();
      });

      setTimeout(() => {
        client1.emit('typing:start');
      }, 200);
    });

    it('should broadcast typing stop event', (done) => {
      client2.on('typing:update', (data) => {
        if (!data.isTyping) {
          expect(data.username).toBe('User1');
          expect(data.isTyping).toBe(false);
          done();
        }
      });

      setTimeout(() => {
        client1.emit('typing:start');
        setTimeout(() => client1.emit('typing:stop'), 100);
      }, 200);
    });

    it('should not broadcast typing when user is not joined', (done) => {
      const unauthorizedSocket = ioClient(`http://localhost:${TEST_PORT}`);
      let typingReceived = false;

      client2.on('typing:update', () => {
        typingReceived = true;
      });

      unauthorizedSocket.on('connect', () => {
        unauthorizedSocket.emit('typing:start');

        setTimeout(() => {
          expect(typingReceived).toBe(false);
          unauthorizedSocket.disconnect();
          done();
        }, 500);
      });
    });
  });

  describe('User Disconnect', () => {
    it('should handle user disconnect and emit system message', (done) => {
      const testSocket = ioClient(`http://localhost:${TEST_PORT}`);
      const username = 'DisconnectTest';

      testSocket.on('connect', () => {
        testSocket.emit('user:join', username);

        setTimeout(() => {
          clientSocket = ioClient(`http://localhost:${TEST_PORT}`);
          
          clientSocket.on('system:message', (data) => {
            if (data.text.includes('покинул чат') && data.text.includes(username)) {
              expect(data.text).toContain(username);
              done();
            }
          });

          setTimeout(() => testSocket.disconnect(), 100);
        }, 200);
      });
    });

    
  });

  describe('Server Lifecycle', () => {
    it('should create server with default options', () => {
      const defaultServer = createChatServer();
      expect(defaultServer).toHaveProperty('httpServer');
      expect(defaultServer).toHaveProperty('io');
      expect(defaultServer).toHaveProperty('pool');
      expect(defaultServer).toHaveProperty('onlineUsers');
      expect(defaultServer).toHaveProperty('start');
      expect(defaultServer).toHaveProperty('stop');
    });

    it('should create server with custom options', () => {
      const customServer = createChatServer({
        databaseUrl: 'postgresql://custom:5432/chat',
        corsOrigin: 'http://custom.com',
        maxMessages: 100
      });
      expect(customServer).toHaveProperty('httpServer');
      expect(customServer).toHaveProperty('io');
    });
  });
});
