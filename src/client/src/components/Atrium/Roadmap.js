import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chevron } from './parts/Icons';
import { SubTab } from './parts/SubTab';
import {
    fetchRoadmapDraft,
    submitRoadmapDraft,
    updateRoadmapDraft,
    roadmapStreamUrl,
} from './data/api';
import { useChatStream } from '../ChatRoom/useChatStream';
import MarkdownMessage from '../ChatRoom/MarkdownMessage';
import '../Styling/Atrium.css';

// Map a server-shaped chat row ({ who, text }) into the hook's role/content
// shape so the streaming hook and the rest of the UI agree on history.
const fromServerMsg = (m) => ({
    role: m.who === 'tutor' ? 'assistant' : 'user',
    content: m.text || '',
    pin_label: m.pin_label || null,
});

const EMPTY_DRAFT = { title: '', subtitle: '', sections: [] };

const WELCOME_MESSAGE = `Hi! I'm Magister. Before I build your roadmap, I have five quick questions:

1. What is the topic you want to learn?
2. What is your current background with this topic?
3. What is your goal — deep mastery, working knowledge, or something specific?
4. Are there any sub-areas you especially want to cover or skip?
5. How much depth do you want per module — broad survey or deep dive?

Answer as many or as few as you like. Even a short reply is enough for me to propose a first draft roadmap right away.`;

// Roadmap screen — user describes what they want to learn, the planner
// proposes a roadmap (via streamline calls) and the user submits it.
const AtriumRoadmap = () => {
    const navigate = useNavigate();
    const [draftId, setDraftId] = useState(null);
    const [draft, setDraft] = useState(EMPTY_DRAFT);
    const [submitting, setSubmitting] = useState(false);
    // Mobile-only: which pane is visible — 'left' = draft, 'right' = chat.
    // Desktop ignores this since both panes are shown side-by-side.
    const [mobilePane, setMobilePane] = useState('left');

    // Streamline handler — fired automatically when the planner emits a
    // [[CALL:propose_roadmap]]…[[/CALL]] block. Updates both local state and
    // the persisted draft so a refresh keeps the latest shape.
    const onProposeRoadmap = async (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const next = {
            title: payload.title || draft.title,
            subtitle: payload.subtitle || '',
            sections: Array.isArray(payload.sections)
                ? payload.sections.map((s) => ({
                    name: String(s.name || '').trim(),
                    highlight: !!s.highlight,
                    topics: Array.isArray(s.topics) ? s.topics.map(String) : [],
                }))
                : [],
        };
        setDraft(next);
        if (draftId) {
            await updateRoadmapDraft(draftId, next);
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
        endpoint: draftId ? roadmapStreamUrl(draftId) : '',
        streamlineHandlers: { propose_roadmap: onProposeRoadmap },
        initialMessages: [],
    });

    useEffect(() => {
        let cancelled = false;
        fetchRoadmapDraft().then((r) => {
            if (cancelled || !r.ok || !r.data) return;
            setDraftId(r.data.draftId);
            if (r.data.sections?.length) {
                setDraft({
                    title: r.data.title,
                    subtitle: r.data.subtitle,
                    sections: r.data.sections,
                });
            }
            if (r.data.chat?.length) {
                setMessages(r.data.chat.map(fromServerMsg));
            } else {
                setMessages([{ role: 'assistant', content: WELCOME_MESSAGE }]);
            }
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totalTopics = draft.sections.reduce((sum, s) => sum + s.topics.length, 0);

    const handleSend = (e) => {
        e?.preventDefault?.();
        if (!draftId) return;
        sendMessage();
    };

    const handleCreate = async () => {
        if (!draftId || submitting) return navigate('/atrium');
        setSubmitting(true);
        // Make sure the draft on disk matches what's on screen before promoting.
        await updateRoadmapDraft(draftId, draft);
        const r = await submitRoadmapDraft(draftId);
        setSubmitting(false);
        if (r.ok && r.data?.id) navigate(`/atrium/school/${r.data.id}`);
        else navigate('/atrium');
    };

    return (
        <div className="atrium-screen">
            <header className="hdr roadmap-hdr">
                <div className="hdr-left">
                    <button className="hdr-back" title="Back" onClick={() => navigate('/atrium')}>
                        <Chevron dir="left" />
                    </button>
                </div>
                <div className="hdr-center" style={{ justifyContent: 'center' }}>
                    <span className="roadmap-title">What do you want to learn?</span>
                </div>
                <div className="hdr-right">
                    <span className="tick">Draft · Step 02 / 02</span>
                </div>
            </header>

            <SubTab
                left="Draft"
                right="Tutor chat"
                active={mobilePane}
                onChange={setMobilePane}
            />

            <div className="roadmap" data-pane={mobilePane}>
                {/* Proposed roadmap — editable */}
                <aside className="rmap">
                    <div className="rmap-head">
                        <div>
                            <div className="tag">Proposed roadmap</div>
                            <div className="rmap-meta mono">
                                {String(draft.sections.length).padStart(2, '0')} sections · {String(totalTopics).padStart(2, '0')} topics · ~6 weeks
                            </div>
                        </div>
                        <button className="btn ghost tiny">↻ Regenerate</button>
                    </div>

                    <div className="rmap-body">
                        <div className="rmap-school" contentEditable suppressContentEditableWarning>
                            <div className="rmap-school-name">{draft.title}</div>
                            <div className="rmap-school-sub">{draft.subtitle}</div>
                        </div>

                        <ol className="rmap-sections">
                            {draft.sections.map((s, i) => (
                                <li key={s.name + i} className={`rmap-section ${s.highlight ? 'highlight' : ''}`}>
                                    <div className="rmap-section-head">
                                        <span className="rmap-section-idx mono">§ {String(i + 1).padStart(2, '0')}</span>
                                        <span className="rmap-section-name" contentEditable suppressContentEditableWarning>
                                            {s.name}
                                        </span>
                                        <button className="rmap-x" title="Remove section">×</button>
                                    </div>
                                    <ul className="rmap-topics">
                                        {s.topics.map((t, j) => (
                                            <li key={j} className="rmap-topic">
                                                <span className="rmap-topic-mark mono">{i + 1}.{j + 1}</span>
                                                <span className="rmap-topic-text" contentEditable suppressContentEditableWarning>
                                                    {t}
                                                </span>
                                                <button className="rmap-x rmap-x-sm" title="Remove topic">×</button>
                                            </li>
                                        ))}
                                        <li className="rmap-add">
                                            <span className="rmap-topic-mark">+</span>
                                            <span className="rmap-add-text">Add topic</span>
                                        </li>
                                    </ul>
                                </li>
                            ))}
                            <li className="rmap-add-section">
                                <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>+</span>
                                <span>Add section</span>
                            </li>
                        </ol>
                    </div>

                    <div className="rmap-foot">
                        <div className="rmap-foot-meta">
                            <span className="tick">Edit anything inline. Drag to reorder.</span>
                        </div>
                        <button className="btn primary rmap-submit" onClick={handleCreate} disabled={submitting}>
                            {submitting ? 'Creating…' : 'Create school'}
                            <span style={{ marginLeft: 8, fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.7 }}>→</span>
                        </button>
                    </div>
                </aside>

                {/* Chat — 66% */}
                <section className="chat roadmap-chat">
                    <div className="chat-head">
                        <div>
                            <div className="tag">Tutor · Roadmap mode</div>
                            <div className="chat-tutor">
                                <span className="chat-tutor-av">M</span>
                                <span className="chat-tutor-name">Magister</span>
                                <span className="chat-tutor-status">
                                    <span className="dot" />shaping a course with you
                                </span>
                            </div>
                        </div>
                        <div className="chat-actions">
                            <button className="btn ghost tiny">Start over</button>
                        </div>
                    </div>

                    <div className="chat-body">
                        <div className="chat-day">Today · 11:02 am</div>
                        {messages.map((m, i) => {
                            const who = m.role === 'assistant' ? 'tutor' : 'me';
                            return (
                                <div key={i} className={`msg msg-${who}`}>
                                    {who === 'tutor' && <div className="msg-av">M</div>}
                                    <div className="msg-bubble">
                                        <MarkdownMessage content={m.content} />
                                        {m.pin_label && (
                                            <div className="msg-pin">
                                                <span className="tick">↖ Proposed</span>
                                                {m.pin_label}
                                            </div>
                                        )}
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
                                placeholder="Reply or ask the tutor to expand a section…"
                                rows={2}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={isStreaming}
                            />
                            <div className="chat-input-row">
                                <div className="chat-input-tools">
                                    <button type="button" className="btn ghost tiny">+ Pin source</button>
                                    <button type="button" className="btn ghost tiny">⤴ Upload syllabus</button>
                                </div>
                                <button type="submit" className="btn primary" disabled={isStreaming || !input.trim() || !draftId}>
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

export default AtriumRoadmap;
