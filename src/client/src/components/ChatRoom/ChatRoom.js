import React, { useState, useRef, useEffect } from 'react';
import '../Styling/ChatRoom.css';

const ChatRoom = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState('');
    const messagesEndRef = useRef(null);

    // Auto-scroll to the latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        const userText = input.trim();
        if (!userText || isStreaming) return;

        setInput('');
        setError('');

        // Show user bubble immediately
        const historySnapshot = messages.map(m => ({ role: m.role, content: m.content }));
        setMessages(prev => [...prev, { role: 'user', content: userText }]);

        // Add empty assistant bubble as placeholder
        setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);
        setIsStreaming(true);

        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ message: userText, history: historySnapshot }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `Server error ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE lines from the buffer
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep any incomplete trailing line

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const payload = line.slice(6).trim();
                    if (payload === '[DONE]') break;

                    try {
                        const parsed = JSON.parse(payload);
                        if (parsed.error) {
                            throw new Error(parsed.error);
                        }
                        if (typeof parsed.token === 'string') {
                            setMessages(prev => {
                                const updated = prev.map((m, i) =>
                                    i === prev.length - 1
                                        ? { ...m, content: m.content + parsed.token }
                                        : m
                                );
                                return updated;
                            });
                        }
                    } catch (parseErr) {
                        // Skip malformed SSE lines
                    }
                }
            }
        } catch (err) {
            setError(err.message || 'Failed to reach the server.');
            // Remove the empty assistant bubble on error
            setMessages(prev => prev.slice(0, -1));
        } finally {
            // Mark the last assistant bubble as done streaming
            setMessages(prev =>
                prev.map((m, i) =>
                    i === prev.length - 1 && m.role === 'assistant'
                        ? { ...m, streaming: false }
                        : m
                )
            );
            setIsStreaming(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="chatroom">
            <h1 className="chatroom-title">Chat</h1>

            <div className="chatroom-messages">
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`chatroom-bubble chatroom-bubble--${msg.role}${msg.streaming ? ' chatroom-bubble--streaming' : ''}`}
                    >
                        {msg.content}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="chatroom-input-bar">
                <textarea
                    className="chatroom-input"
                    rows={2}
                    placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isStreaming}
                />
                <button
                    className="chatroom-send"
                    onClick={sendMessage}
                    disabled={isStreaming || !input.trim()}
                >
                    Send
                </button>
            </div>

            {error && <p className="chatroom-error">{error}</p>}
        </div>
    );
};

export default ChatRoom;
