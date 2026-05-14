import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Chevron } from './parts/Icons';
import { ROADMAP_CHAT, ROADMAP_DRAFT } from './data/mockData';
import '../Styling/Atrium.css';

// Roadmap screen — user describes what they want to learn, AI proposes a
// roadmap, user edits it inline before submitting.
//
// TODO (data): on first load, GET the in-progress draft (if any) for the user.
//   GET  ${REACT_APP_URL}/atrium/roadmap/draft
// TODO (chat): POST chat messages to the planner.
//   POST ${REACT_APP_URL}/atrium/roadmap/chat       body: { message }
// TODO (regen): POST to regenerate the roadmap from the current chat.
//   POST ${REACT_APP_URL}/atrium/roadmap/regenerate
// TODO (submit): POST the final roadmap to spin up the school, then navigate
//   POST ${REACT_APP_URL}/atrium/schools             body: { title, subtitle, sections }
const AtriumRoadmap = () => {
    const navigate = useNavigate();

    const totalTopics = ROADMAP_DRAFT.sections.reduce((sum, s) => sum + s.topics.length, 0);

    const handleCreate = () => {
        // TODO: POST the (possibly edited) roadmap, then navigate to the new
        // school's page using the returned id.
        navigate('/atrium');
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

            <div className="roadmap">
                {/* Proposed roadmap — editable */}
                <aside className="rmap">
                    <div className="rmap-head">
                        <div>
                            <div className="tag">Proposed roadmap</div>
                            <div className="rmap-meta mono">
                                {String(ROADMAP_DRAFT.sections.length).padStart(2, '0')} sections · {String(totalTopics).padStart(2, '0')} topics · ~6 weeks
                            </div>
                        </div>
                        {/* TODO: regenerate handler */}
                        <button className="btn ghost tiny">↻ Regenerate</button>
                    </div>

                    <div className="rmap-body">
                        <div className="rmap-school" contentEditable suppressContentEditableWarning>
                            <div className="rmap-school-name">{ROADMAP_DRAFT.title}</div>
                            <div className="rmap-school-sub">{ROADMAP_DRAFT.subtitle}</div>
                        </div>

                        <ol className="rmap-sections">
                            {ROADMAP_DRAFT.sections.map((s, i) => (
                                <li key={s.name} className={`rmap-section ${s.highlight ? 'highlight' : ''}`}>
                                    <div className="rmap-section-head">
                                        <span className="rmap-section-idx mono">§ {String(i + 1).padStart(2, '0')}</span>
                                        <span className="rmap-section-name" contentEditable suppressContentEditableWarning>
                                            {s.name}
                                        </span>
                                        {/* TODO: remove-section handler */}
                                        <button className="rmap-x" title="Remove section">×</button>
                                    </div>
                                    <ul className="rmap-topics">
                                        {s.topics.map((t, j) => (
                                            <li key={j} className="rmap-topic">
                                                <span className="rmap-topic-mark mono">{i + 1}.{j + 1}</span>
                                                <span className="rmap-topic-text" contentEditable suppressContentEditableWarning>
                                                    {t}
                                                </span>
                                                {/* TODO: remove-topic handler */}
                                                <button className="rmap-x rmap-x-sm" title="Remove topic">×</button>
                                            </li>
                                        ))}
                                        {/* TODO: add-topic handler */}
                                        <li className="rmap-add">
                                            <span className="rmap-topic-mark">+</span>
                                            <span className="rmap-add-text">Add topic</span>
                                        </li>
                                    </ul>
                                </li>
                            ))}
                            {/* TODO: add-section handler */}
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
                        <button className="btn primary rmap-submit" onClick={handleCreate}>
                            Create school
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
                            {/* TODO: start-over handler — clear chat + draft */}
                            <button className="btn ghost tiny">Start over</button>
                        </div>
                    </div>

                    <div className="chat-body">
                        <div className="chat-day">Today · 11:02 am</div>
                        {ROADMAP_CHAT.map((m, i) => (
                            <div key={i} className={`msg msg-${m.who}`}>
                                {m.who === 'tutor' && <div className="msg-av">M</div>}
                                <div className="msg-bubble">
                                    <p>{m.text}</p>
                                    {i === 2 && (
                                        <div className="msg-pin">
                                            <span className="tick">↖ Proposed</span>
                                            Roman History · 4 sections, 15 topics
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {/* TODO: typing indicator only while awaiting tutor */}
                        <div className="msg msg-tutor">
                            <div className="msg-av">M</div>
                            <div className="msg-bubble typing">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>

                    <div className="chat-input">
                        <div className="chat-input-bar">
                            {/* TODO: controlled state + send handler */}
                            <textarea
                                placeholder="Reply or ask the tutor to expand a section…"
                                rows={2}
                                defaultValue=""
                            />
                            <div className="chat-input-row">
                                <div className="chat-input-tools">
                                    <button className="btn ghost tiny">+ Pin source</button>
                                    <button className="btn ghost tiny">⤴ Upload syllabus</button>
                                </div>
                                <button className="btn primary">
                                    Send
                                    <span style={{ opacity: .6, fontFamily: 'var(--mono)', fontSize: 11, marginLeft: 6 }}>↵</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default AtriumRoadmap;
