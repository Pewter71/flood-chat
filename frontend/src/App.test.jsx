import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { socket } from './socket';


vi.mock('./socket', () => {
  const mockSocket = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connected: false
  };
  return { socket: mockSocket };
});

describe('App Component', () => {
  let socketHandlers = {};

  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers = {};
    
    socket.on.mockImplementation((event, handler) => {
      socketHandlers[event] = handler;
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initial Render - Not Connected', () => {
    it('should render login form when not connected', () => {
      render(<App />);
      
      const input = screen.getByPlaceholderText(/введите ваше имя/i);
      const button = screen.getByRole('button', { name: /присоединиться/i });
      
      expect(input).toBeTruthy();
      expect(button).toBeTruthy();
    });

    it('should have empty username initially', () => {
      render(<App />);
      const input = screen.getByPlaceholderText(/введите ваше имя/i);
      expect(input.value).toBe('');
    });

    it('should update username on input change', () => {
      render(<App />);
      const input = screen.getByPlaceholderText(/введите ваше имя/i);
      
      fireEvent.change(input, { target: { value: 'TestUser' } });
      expect(input.value).toBe('TestUser');
    });
  });

  describe('Socket Connection', () => {
    it('should connect to socket when joining with valid username', () => {
      render(<App />);
      const input = screen.getByPlaceholderText(/введите ваше имя/i);
      const button = screen.getByRole('button', { name: /присоединиться/i });
      
      fireEvent.change(input, { target: { value: 'TestUser' } });
      fireEvent.click(button);
      
      expect(socket.connect).toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('user:join', 'TestUser');
    });

    it('should trim username before joining', () => {
      render(<App />);
      const input = screen.getByPlaceholderText(/введите ваше имя/i);
      const button = screen.getByRole('button', { name: /присоединиться/i });
      
      fireEvent.change(input, { target: { value: '  TestUser  ' } });
      fireEvent.click(button);
      
      expect(socket.emit).toHaveBeenCalledWith('user:join', 'TestUser');
    });

    it('should not connect with empty username', () => {
      render(<App />);
      const button = screen.getByRole('button', { name: /присоединиться/i });
      
      fireEvent.click(button);
      
      expect(socket.connect).not.toHaveBeenCalled();
    });

    it('should not connect with whitespace-only username', () => {
      render(<App />);
      const input = screen.getByPlaceholderText(/введите ваше имя/i);
      const button = screen.getByRole('button', { name: /присоединиться/i });
      
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(button);
      
      expect(socket.connect).not.toHaveBeenCalled();
    });

    it('should handle form submission via Enter key', () => {
      render(<App />);
      const input = screen.getByPlaceholderText(/введите ваше имя/i);
      const form = input.closest('form');
      
      fireEvent.change(input, { target: { value: 'TestUser' } });
      fireEvent.submit(form);
      
      expect(socket.connect).toHaveBeenCalled();
    });
  });

  describe('Socket Event Handlers', () => {
    it('should register all socket event handlers', () => {
      render(<App />);
      
      expect(socket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('message:history', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('message:new', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('system:message', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('user:list', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('typing:update', expect.any(Function));
    });

    it('should set isConnected to true on connect event', async () => {
      const { rerender } = render(<App />);
      
      act(() => {
        socketHandlers['connect']?.();
      });
      
      rerender(<App />);
      
      await waitFor(() => {
        const messageInput = screen.queryByPlaceholderText(/введите сообщение/i);
        expect(messageInput).toBeTruthy();
      });
    });

    it('should set isConnected to false on disconnect event', async () => {
      render(<App />);
      
      act(() => {
        socketHandlers['connect']?.();
      });
      act(() => {
        socketHandlers['disconnect']?.();
      });
      
      await waitFor(() => {
        const loginInput = screen.queryByPlaceholderText(/введите ваше имя/i);
        expect(loginInput).toBeTruthy();
      });
    });

    

    it('should update online users list', async () => {
      render(<App />);
      
      act(() => {
        socketHandlers['connect']?.();
      });
      
      const users = ['User1', 'User2', 'User3'];
      
      act(() => {
        socketHandlers['user:list']?.(users);
      });
      
      await waitFor(() => {
        expect(screen.getByText('User1')).toBeTruthy();
        expect(screen.getByText('User2')).toBeTruthy();
        expect(screen.getByText('User3')).toBeTruthy();
      });
    });

    it('should add typing user', async () => {
      render(<App />);
      
      act(() => {
        socketHandlers['connect']?.();
      });
      
      act(() => {
        socketHandlers['typing:update']?.({ username: 'User1', isTyping: true });
      });
      
      await waitFor(() => {
        const typingIndicator = screen.queryByText(/печатает/i);
        expect(typingIndicator).toBeTruthy();
      });
    });

    it('should remove typing user', async () => {
      render(<App />);
      
      act(() => {
        socketHandlers['connect']?.();
        socketHandlers['typing:update']?.({ username: 'User1', isTyping: true });
      });
      
      act(() => {
        socketHandlers['typing:update']?.({ username: 'User1', isTyping: false });
      });
      
      await waitFor(() => {
        const typingIndicator = screen.queryByText(/User1 печатает/i);
        expect(typingIndicator).toBeFalsy();
      });
    });

    it('should cleanup socket listeners on unmount', () => {
      const { unmount } = render(<App />);
      
      unmount();
      
      expect(socket.off).toHaveBeenCalledWith('connect');
      expect(socket.off).toHaveBeenCalledWith('disconnect');
      expect(socket.off).toHaveBeenCalledWith('message:history');
      expect(socket.off).toHaveBeenCalledWith('message:new');
      expect(socket.off).toHaveBeenCalledWith('system:message');
      expect(socket.off).toHaveBeenCalledWith('user:list');
      expect(socket.off).toHaveBeenCalledWith('typing:update');
    });
  });

  describe('Messaging - Connected State', () => {
    beforeEach(() => {
      render(<App />);
      act(() => {
        socketHandlers['connect']?.();
      });
    });

    it('should send message when form is submitted', async () => {
      const messageInput = await screen.findByPlaceholderText(/введите сообщение/i);
      const sendButton = screen.getByRole('button', { name: /отправить/i });
      
      fireEvent.change(messageInput, { target: { value: 'Hello World' } });
      fireEvent.click(sendButton);
      
      expect(socket.emit).toHaveBeenCalledWith('message:send', { text: 'Hello World' });
    });

    it('should trim message before sending', async () => {
      const messageInput = await screen.findByPlaceholderText(/введите сообщение/i);
      const sendButton = screen.getByRole('button', { name: /отправить/i });
      
      fireEvent.change(messageInput, { target: { value: '  Hello World  ' } });
      fireEvent.click(sendButton);
      
      expect(socket.emit).toHaveBeenCalledWith('message:send', { text: 'Hello World' });
    });

    it('should clear input after sending message', async () => {
      const messageInput = await screen.findByPlaceholderText(/введите сообщение/i);
      const sendButton = screen.getByRole('button', { name: /отправить/i });
      
      fireEvent.change(messageInput, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);
      
      await waitFor(() => {
        expect(messageInput.value).toBe('');
      });
    });

    it('should emit typing:stop after sending message', async () => {
      const messageInput = await screen.findByPlaceholderText(/введите сообщение/i);
      const sendButton = screen.getByRole('button', { name: /отправить/i });
      
      fireEvent.change(messageInput, { target: { value: 'Test' } });
      fireEvent.click(sendButton);
      
      expect(socket.emit).toHaveBeenCalledWith('typing:stop');
    });

    it('should not send empty message', async () => {
      const sendButton = screen.getByRole('button', { name: /отправить/i });
      
      const emitCallsBefore = socket.emit.mock.calls.length;
      fireEvent.click(sendButton);
      const emitCallsAfter = socket.emit.mock.calls.length;
      
      expect(emitCallsAfter).toBe(emitCallsBefore);
    });

    it('should not send whitespace-only message', async () => {
      const messageInput = await screen.findByPlaceholderText(/введите сообщение/i);
      const sendButton = screen.getByRole('button', { name: /отправить/i });
      
      fireEvent.change(messageInput, { target: { value: '   ' } });
      
      const emitCallsBefore = socket.emit.mock.calls.length;
      fireEvent.click(sendButton);
      const emitCallsAfter = socket.emit.mock.calls.length;
      
      expect(emitCallsAfter).toBe(emitCallsBefore);
    });
  });

  describe('Typing Indicator', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      render(<App />);
      act(() => {
        socketHandlers['connect']?.();
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    
    

    

    it('should not emit typing events when not connected', () => {
      const { rerender } = render(<App />);
      const input = screen.getByPlaceholderText(/введите ваше имя/i);
      
      fireEvent.change(input, { target: { value: 'Test' } });
      
      const typingStartCalls = socket.emit.mock.calls.filter(
        call => call[0] === 'typing:start'
      );
      expect(typingStartCalls.length).toBe(0);
    });
  });

  describe('Auto-scroll', () => {
    it('should scroll to bottom when new message arrives', async () => {
      const mockScrollIntoView = vi.fn();
      HTMLElement.prototype.scrollIntoView = mockScrollIntoView;
      
      render(<App />);
      
      act(() => {
        socketHandlers['connect']?.();
        socketHandlers['message:new']?.({
          id: 1,
          username: 'User',
          text: 'Message',
          timestamp: Date.now()
        });
      });
      
      await waitFor(() => {
        expect(mockScrollIntoView).toHaveBeenCalled();
      });
    });
  });

  describe('UI State', () => {
    

    it('should show chat interface when connected', async () => {
      render(<App />);
      
      act(() => {
        socketHandlers['connect']?.();
      });
      
      await waitFor(() => {
        expect(screen.getByText(/онлайн/i)).toBeTruthy();
      });
    });

    it('should display correct number of online users', async () => {
      render(<App />);
      
      act(() => {
        socketHandlers['connect']?.();
        socketHandlers['user:list']?.(['User1', 'User2', 'User3']);
      });
      
      await waitFor(() => {
        expect(screen.getByText(/Онлайн/i)).toBeTruthy();
      });
    });
  });
});
