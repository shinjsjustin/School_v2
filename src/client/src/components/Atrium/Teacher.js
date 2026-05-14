import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { HeaderTeacher } from './parts/Headers';
import { Check } from './parts/Icons';
import { TOPIC_DETAIL } from './data/mockData';
import '../Styling/Atrium.css';

// Teacher (Socratic tutor) screen.
//
// TODO (data): fetch the topic + chat history.
//   const { schoolId, topicId } = useParams();
//   fetch(`${process.env.REACT_APP_URL}/atrium/schools/${schoolId}/topics/${topicId}`, ...)
//
// TODO (chat): POST a new user message to the tutor.
//   await fetch(`${process.env.REACT_APP_URL}/atrium/chat`, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       Authorization: `Bearer ${localStorage.getItem('token')}`,
//     },
//     body: JSON.stringify({ topicId, message: draft }),
//   });
const AtriumTeacher = () => {
    // eslint-disable-next-line no-unused-vars
    const { schoolId, topicId } = useParams();
    const topic = TOPIC_DETAIL; // TODO: derive from `topicId`

    const [draft, setDraft] = useState(topic.draftReply);
    const [messages] = useState(topic.messages); // TODO: setMessages on send

    const doneCount = topic.objectives.filter((o) => o.state === 'done').length;

    const handleSend = (e) => {
        e.preventDefault();
        // TODO: append the user message, POST to backend, then append the
        // tutor's streamed reply once the API is in place.
    };

    return (
        <div className="atrium-screen">
            <HeaderTeacher
                section={topic.section}
                topic={topic.topic}
                progress={topic.progress}
            />
            <div className="teach">
                {/* Learning objectives — 33% */}
                <aside className="lo">
                    <div className="lo-head">
                        <span className="tag">Learning objectives</span>
                        <span className="tick">{doneCount} / {topic.objectives.length}</span>
                    </div>
                    <h3 className="lo-title">By the end of this topic you'll be able to —</h3>
                    <ol className="lo-list">
                        {topic.objectives.map((o, i) => (
                            <li key={i} className={`lo-item ${o.state}`}>
                                <span className="lo-dot">
                                    {o.state === 'done' && <Check size={11} />}
                                    {o.state === 'current' && <span className="lo-dot-pulse" />}
                                </span>
                                <span className="lo-text">{o.text}</span>
                            </li>
                        ))}
                    </ol>
                    <div className="lo-foot">
                        <div className="tag" style={{ marginBottom: 8 }}>Resources</div>
                        {/* TODO: map resources to real URLs from the API. */}
                        {topic.resources.map((r, i) => (
                            <a key={i} className="lo-link" href="#resource"><span>↗</span> {r.label}</a>
                        ))}
                    </div>
                </aside>

                {/* Chat — 66% */}
                <section className="chat">
                    <div className="chat-head">
                        <div>
                            <div className="tag">Tutor · Socratic mode</div>
                            <div className="chat-tutor">
                                <span className="chat-tutor-av">M</span>
                                <span className="chat-tutor-name">Magister</span>
                                <span className="chat-tutor-status">
                                    <span className="dot" />thinking with you
                                </span>
                            </div>
                        </div>
                        <div className="chat-actions">
                            {/* TODO: hint / mode-switch / end-session handlers */}
                            <button className="btn ghost tiny">Hint</button>
                            <button className="btn ghost tiny">Switch mode</button>
                            <button className="btn tiny">End session</button>
                        </div>
                    </div>

                    <div className="chat-body">
                        <div className="chat-day">Today · 2:14 pm</div>
                        {messages.map((m, i) => (
                            <div key={i} className={`msg msg-${m.who}`}>
                                {m.who === 'tutor' && <div className="msg-av">M</div>}
                                <div className="msg-bubble">
                                    <p>{m.text}</p>
                                </div>
                            </div>
                        ))}
                        {/* Typing indicator — TODO: render only while awaiting tutor reply. */}
                        <div className="msg msg-tutor">
                            <div className="msg-av">M</div>
                            <div className="msg-bubble typing">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>

                    <form className="chat-input" onSubmit={handleSend}>
                        <div className="chat-input-bar">
                            <textarea
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                rows={2}
                            />
                            <div className="chat-input-row">
                                <div className="chat-input-tools">
                                    <button type="button" className="btn ghost tiny">+ Add note</button>
                                    <button type="button" className="btn ghost tiny">Quote source</button>
                                </div>
                                <button type="submit" className="btn primary">
                                    Send
                                    <span style={{ opacity: .6, fontFamily: 'var(--mono)', fontSize: 11, marginLeft: 6 }}>↵</span>
                                </button>
                            </div>
                        </div>
                    </form>
                </section>
            </div>
        </div>
    );
};

export default AtriumTeacher;
