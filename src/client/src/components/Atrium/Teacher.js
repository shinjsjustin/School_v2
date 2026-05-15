import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { HeaderTeacher } from './parts/Headers';
import { Check } from './parts/Icons';
import { fetchTopic, teacherStreamUrl, teacherObjectivesGenerateUrl, teacherEndSessionUrl, teacherHintUrl, updateObjective, addTopicNote } from './data/api';
import { useChatStream } from '../ChatRoom/useChatStream';
import '../Styling/Atrium.css';

// Server chat row → hook role/content shape.
const fromServerMsg = (m) => ({
    role: m.who === 'tutor' ? 'assistant' : 'user',
    content: m.text || '',
});

const EMPTY_TOPIC = {
    section: '',
    topic: '',
    progress: 0,
    status: 'start',
    objectives: [],
    resources: [],
    messages: [],
};

// Teacher (Socratic tutor) screen.
//
// The chat pane is powered by useChatStream pointed at the per-topic SSE
// endpoint. The streamline handler `update_progress` lets the tutor mark
// objectives as done (and, in future, persist a session note) while the user
// is mid-conversation.
const AtriumTeacher = () => {
    const { schoolId, topicId } = useParams();
    const [topic, setTopic] = useState(EMPTY_TOPIC);
    const [notes, setNotes] = useState([]);
    const [generatingObjectives, setGeneratingObjectives] = useState(false);
    const [generationError, setGenerationError] = useState('');

    // Persist any objective state changes the model proposes. Mutates local
    // state optimistically so the LO list reflects the change immediately.
    // Also persists `payload.note` (if present) as a topic_session_note.
    const onUpdateProgress = async (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const updates = Array.isArray(payload.objectives) ? payload.objectives : [];
        const noteText = typeof payload.note === 'string' ? payload.note.trim() : '';

        const allowedStates = new Set(['todo', 'current', 'done']);
        if (updates.length) {
            setTopic((prev) => ({
                ...prev,
                objectives: prev.objectives.map((o) => {
                    const u = updates.find((x) => x.id === o.id);
                    return u && allowedStates.has(u.state)
                        ? { ...o, state: u.state }
                        : o;
                }),
            }));

            await Promise.all(
                updates
                    .filter((u) => allowedStates.has(u.state) && u.id != null)
                    .map((u) => updateObjective(u.id, u.state)),
            );
        }

        if (noteText) {
            // Optimistic prepend; reconcile with server id on success.
            const tempId = `tmp-${Date.now()}`;
            setNotes((prev) => [{ id: tempId, note: noteText, createdAt: new Date().toISOString() }, ...prev]);
            const r = await addTopicNote(schoolId, topicId, noteText);
            if (r.ok && r.data?.note) {
                setNotes((prev) => prev.map((n) => (n.id === tempId ? r.data.note : n)));
            }
        }
    };

    const {
        messages,
        setMessages,
        input,
        setInput,
        isStreaming,
        error,
        sendMessage,
    } = useChatStream({
        endpoint: teacherStreamUrl(schoolId, topicId),
        streamlineHandlers: { update_progress: onUpdateProgress },
        initialMessages: [],
    });

    useEffect(() => {
        let cancelled = false;
        fetchTopic(schoolId, topicId).then((r) => {
            if (cancelled || !r.ok || !r.data) return;
            setTopic(r.data);
            setMessages((r.data.messages || []).map(fromServerMsg));
            setNotes(Array.isArray(r.data.notes) ? r.data.notes : []);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolId, topicId]);

    const doneCount = topic.objectives.filter((o) => o.state === 'done').length;

    const handleSend = (e) => {
        e.preventDefault();
        sendMessage();
    };

    // Kickoff: silent POST that asks the tutor to open the lesson. The server
    // builds the prompt from the topic + objectives + roadmap context, so all
    // we need to send is the `kickoff` flag.
    const handleStart = async () => {
        if (isStreaming || generatingObjectives) return;
        setGenerationError('');

        // Step 1 — if no objectives yet, generate + persist them via SSE.
        if (topic.objectives.length === 0) {
            setGeneratingObjectives(true);
            try {
                const res = await fetch(teacherObjectivesGenerateUrl(schoolId, topicId), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${localStorage.getItem('token')}`,
                    },
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || `Server error ${res.status}`);
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buf = '';
                let savedObjectives = null;
                let serverError = '';
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                    const lines = buf.split('\n');
                    buf = lines.pop();
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const payload = line.slice(6).trim();
                        if (payload === '[DONE]') continue;
                        let parsed;
                        try { parsed = JSON.parse(payload); } catch (_) { continue; }
                        if (parsed.error) serverError = parsed.error;
                        if (Array.isArray(parsed.objectives)) savedObjectives = parsed.objectives;
                    }
                }
                if (serverError) throw new Error(serverError);
                if (!savedObjectives || !savedObjectives.length) {
                    throw new Error('No objectives were generated');
                }
                setTopic((prev) => ({ ...prev, objectives: savedObjectives }));
            } catch (err) {
                setGenerationError(err.message || 'Failed to generate objectives');
                setGeneratingObjectives(false);
                return;
            }
            setGeneratingObjectives(false);
        }

        // Step 2 — silent kickoff to open the chat with a Socratic question.
        sendMessage('', { silent: true, body: { kickoff: true, history: [] } });
        setTopic((prev) => ({ ...prev, status: 'active' }));
    };

    // Resume: like Start but tells the server to inject prior session notes
    // into the system prompt so the tutor picks up where it left off.
    const handleResume = () => {
        if (isStreaming) return;
        sendMessage('', { silent: true, body: { kickoff: true, resume: true, history: [] } });
        setTopic((prev) => ({ ...prev, status: 'active' }));
    };

    // End Session: tutor wraps up, finalises objectives + saves a session
    // note. Server flips topic.status to 'done' or 'ended' and replies with
    // the new state in the final SSE event.
    const handleEndSession = () => {
        if (isStreaming) return;
        sendMessage('', {
            silent: true,
            body: {},
            endpoint: teacherEndSessionUrl(schoolId, topicId),
            onEvent: (parsed) => {
                if (!parsed?.sessionEnded) return;
                setTopic((prev) => ({
                    ...prev,
                    status: parsed.status || prev.status,
                    objectives: Array.isArray(parsed.objectives) ? parsed.objectives : prev.objectives,
                }));
                // Refetch notes so the wrap-up note appears in the sidebar.
                fetchTopic(schoolId, topicId).then((r) => {
                    if (r.ok && r.data && Array.isArray(r.data.notes)) {
                        setNotes(r.data.notes);
                    }
                });
            },
        });
    };

    // Hint: tap-out to explainer mode. Tutor walks through pending objectives.
    const handleHint = () => {
        if (isStreaming) return;
        sendMessage('', {
            silent: true,
            body: {},
            endpoint: teacherHintUrl(schoolId, topicId),
        });
    };

    const showStartOverlay = !isStreaming && messages.length === 0 && topic.status !== 'ended' && topic.status !== 'done';
    const showResumeOverlay = !isStreaming && topic.status === 'ended';
    const showDoneBanner = topic.status === 'done';

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
                    {topic.objectives.length === 0 && (
                        <p className="lo-empty">
                            {generatingObjectives
                                ? 'Drafting your learning objectives…'
                                : 'Click "Start lesson" to generate your learning objectives.'}
                        </p>
                    )}
                    <div className="lo-foot">
                        <div className="tag" style={{ marginBottom: 8 }}>Resources</div>
                        {topic.resources.map((r, i) => (
                            <a key={i} className="lo-link" href={r.url || '#resource'}><span>↗</span> {r.label}</a>
                        ))}
                        {notes.length > 0 && (
                            <>
                                <div className="tag" style={{ marginTop: 16, marginBottom: 8 }}>Session notes</div>
                                <ul className="lo-notes" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {notes.map((n) => (
                                        <li
                                            key={n.id}
                                            style={{
                                                fontSize: 12,
                                                lineHeight: 1.45,
                                                padding: '6px 0',
                                                borderTop: '1px solid var(--bg-alt, #2a2a2a)',
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            {n.note}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
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
                            <button
                                type="button"
                                className="btn ghost tiny"
                                onClick={handleHint}
                                disabled={isStreaming || messages.length === 0 || topic.status === 'done'}
                                title="Tap out — have Magister explain the pending objectives"
                            >
                                Hint
                            </button>
                            <button
                                type="button"
                                className="btn tiny"
                                onClick={handleEndSession}
                                disabled={isStreaming || messages.length === 0 || topic.status === 'done'}
                            >
                                End session
                            </button>
                        </div>
                    </div>

                    <div className="chat-body">
                        {showStartOverlay && (
                            <div className="chat-start-overlay">
                                <div className="chat-start-card">
                                    <div className="tag">Ready when you are</div>
                                    <h3 className="chat-start-title">{topic.topic || 'This topic'}</h3>
                                    <p className="chat-start-sub">
                                        {topic.objectives.length === 0
                                            ? 'Magister will first draft your learning objectives, then open the lesson with a Socratic question grounded in your roadmap.'
                                            : "Magister will open the lesson with a question grounded in your roadmap and the learning objectives on the left."}
                                    </p>
                                    <button
                                        type="button"
                                        className="btn primary"
                                        onClick={handleStart}
                                        disabled={generatingObjectives}
                                    >
                                        {generatingObjectives ? 'Drafting objectives…' : 'Start lesson'}
                                    </button>
                                    {generationError && (
                                        <p style={{ color: 'var(--color-danger, #c00)', fontSize: 12, marginTop: 10 }}>
                                            {generationError}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                        {showResumeOverlay && (
                            <div className="chat-start-overlay">
                                <div className="chat-start-card">
                                    <div className="tag">Session paused</div>
                                    <h3 className="chat-start-title">Pick up where you left off</h3>
                                    <p className="chat-start-sub">
                                        {doneCount} of {topic.objectives.length} objectives complete.
                                        Magister will read your prior session notes and resume
                                        with the most relevant next question.
                                    </p>
                                    <button type="button" className="btn primary" onClick={handleResume}>
                                        Resume lesson
                                    </button>
                                </div>
                            </div>
                        )}
                        {showDoneBanner && (
                            <div className="chat-start-overlay">
                                <div className="chat-start-card">
                                    <div className="tag">Topic complete</div>
                                    <h3 className="chat-start-title">All objectives done</h3>
                                    <p className="chat-start-sub">
                                        Nice work — every learning objective for this topic is
                                        checked off. Head back to the school page to continue.
                                    </p>
                                </div>
                            </div>
                        )}
                        <div className="chat-day">Today · 2:14 pm</div>
                        {messages.map((m, i) => {
                            const who = m.role === 'assistant' ? 'tutor' : 'me';
                            return (
                                <div key={i} className={`msg msg-${who}`}>
                                    {who === 'tutor' && <div className="msg-av">M</div>}
                                    <div className="msg-bubble">
                                        <p>{m.content}</p>
                                    </div>
                                </div>
                            );
                        })}
                        {isStreaming && messages[messages.length - 1]?.content === '' && (
                            <div className="msg msg-tutor">
                                <div className="msg-av">M</div>
                                <div className="msg-bubble typing">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        )}
                        {error && <p style={{ color: 'var(--color-danger, #c00)', fontSize: 12 }}>{error}</p>}
                    </div>

                    <form className="chat-input" onSubmit={handleSend}>
                        <div className="chat-input-bar">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                rows={2}
                                disabled={isStreaming}
                            />
                            <div className="chat-input-row">
                                <div className="chat-input-tools">
                                    <button type="button" className="btn ghost tiny">+ Add note</button>
                                    <button type="button" className="btn ghost tiny">Quote source</button>
                                </div>
                                <button type="submit" className="btn primary" disabled={isStreaming || !input.trim()}>
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
