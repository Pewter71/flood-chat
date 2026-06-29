import { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import './App.css';

export default function App() {
  const [username, setUsername] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected');
      setIsConnected(false);
    });

    socket.on('message:history', (history) => {
      setMessages(history);
    });

    socket.on('message:new', (message) => {
      setMessages(prev => [...prev, message]);
    });

    socket.on('system:message', (data) => {
      setMessages(prev => [...prev, { ...data, isSystem: true }]);
    });

    socket.on('user:list', (users) => {
      setOnlineUsers(users);
    });

    socket.on('typing:update', ({ username, isTyping }) => {
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        if (isTyping) {
          newSet.add(username);
        } else {
          newSet.delete(username);
        }
        return newSet;
      });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('message:history');
      socket.off('message:new');
      socket.off('system:message');
      socket.off('user:list');
      socket.off('typing:update');
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      socket.connect();
      socket.emit('user:join', username.trim());
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && isConnected) {
      socket.emit('message:send', { text: inputMessage.trim() });
      setInputMessage('');
      socket.emit('typing:stop');
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleTyping = (e) => {
    setInputMessage(e.target.value);
    
    if (e.target.value && isConnected) {
      socket.emit('typing:start');
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing:stop');
      }, 1000);
    }
  };

  if (!isConnected) {
    return (
      <div className="container">
        <div className="join-box">
          <h1>Чат</h1>
          <form onSubmit={handleJoin}>
            <input
              type="text"
              placeholder="Введите ваше имя"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              autoFocus
              required
            />
            <button type="submit" className="btn-primary" style={{ marginTop: '20px', width: '100%' }}>
              Присоединиться к чату
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="chat-container">
        <aside className="sidebar">
          <h3>Онлайн ({onlineUsers.length})</h3>
          <ul className="user-list">
            {onlineUsers.map((user, idx) => (
              <li key={idx} className="user-item">
                {user}
              </li>
            ))}
          </ul>
        </aside>

        <main className="chat-box">
          <header className="chat-header">
            <h2>Чат</h2>
            <span className={`connection-status ${isConnected ? 'status-connected' : 'status-disconnected'}`}>
              {isConnected ? 'Подключен' : 'Отключен'}
            </span>
          </header>

          <div className="messages-container">
            {messages.map((msg, idx) => {
              const isOwn = msg.username === username;
              const isSystem = msg.isSystem;
              
              return (
                <div
                  key={idx}
                  className={`message ${isSystem ? 'message-system' : isOwn ? 'message-own' : 'message-other'}`}
                >
                  {!isSystem && (
                    <>
                      <div className="message-username">{msg.username}</div>
                      <div className="message-text">{msg.text}</div>
                      <div className="message-timestamp">
                        {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </>
                  )}
                  {isSystem && <div className="message-text">{msg.text}</div>}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="typing-indicator">
            {typingUsers.size > 0 && (
              <span>{Array.from(typingUsers).join(', ')} печатает...</span>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="input-form">
            <input
              type="text"
              value={inputMessage}
              onChange={handleTyping}
              placeholder="Введите сообщение..."
              className="input-field"
              autoFocus
            />
            <button type="submit" className="btn-primary btn-submit">
              Отправить
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
