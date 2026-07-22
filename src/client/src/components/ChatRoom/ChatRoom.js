import React, { useEffect, useRef } from 'react';
import { useChatStream } from './useChatStream';
import MarkdownMessage from './MarkdownMessage';
import '../Styling/ChatRoom.css';

// Standalone chat page. Uses the shared streaming hook so behaviour stays in
// sync with the Roadmap and Teacher chat panes.
const ChatRoom = () => {
    const {
        messages,
        input,
        setInput,
        isStreaming,
        error,
        sendMessage,
    } = useChatStream({
        endpoint: `${process.env.REACT_APP_URL}/chat`,
    });

    const messagesEndRef = useRef(null);
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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
                        <MarkdownMessage content={msg.content} />
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
                    onClick={() => sendMessage()}
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
