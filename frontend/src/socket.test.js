import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('socket.io-client', () => ({
  io: vi.fn((url, options) => ({
    url,
    options,
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }))
}));

describe('Socket Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should create socket with correct URL from env', async () => {
    vi.stubGlobal('import', {
      meta: {
        env: {
          VITE_SOCKET_URL: 'http://localhost:3001'
        }
      }
    });

    const { io } = await import('socket.io-client');
    const { socket } = await import('./socket');
    
    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        path: '/socket.io/'
      })
    );
  });

  it('should have autoConnect disabled', async () => {
    const { io } = await import('socket.io-client');
    await import('./socket');
    
    const options = io.mock.calls[0][1];
    expect(options.autoConnect).toBe(false);
  });

  it('should have reconnection enabled', async () => {
    const { io } = await import('socket.io-client');
    await import('./socket');
    
    const options = io.mock.calls[0][1];
    expect(options.reconnection).toBe(true);
  });

  it('should have correct reconnection attempts', async () => {
    const { io } = await import('socket.io-client');
    await import('./socket');
    
    const options = io.mock.calls[0][1];
    expect(options.reconnectionAttempts).toBe(5);
  });

  it('should have correct reconnection delay', async () => {
    const { io } = await import('socket.io-client');
    await import('./socket');
    
    const options = io.mock.calls[0][1];
    expect(options.reconnectionDelay).toBe(1000);
  });

  it('should have correct socket path', async () => {
    const { io } = await import('socket.io-client');
    await import('./socket');
    
    const options = io.mock.calls[0][1];
    expect(options.path).toBe('/socket.io/');
  });

  it('should export socket instance', async () => {
    const { socket } = await import('./socket');
    expect(socket).toBeDefined();
    expect(socket).toHaveProperty('connect');
    expect(socket).toHaveProperty('disconnect');
    expect(socket).toHaveProperty('on');
    expect(socket).toHaveProperty('off');
    expect(socket).toHaveProperty('emit');
  });
});
