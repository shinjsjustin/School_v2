import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HeaderSchool } from './parts/Headers';
import { SubTab } from './parts/SubTab';
import { TopicDot } from './parts/Folder';
import { fetchSchool, generateTest } from './data/api';
import '../Styling/Atrium.css';

// School page — sections + topics grid.
//
// Hydrates from /atrium/schools/:schoolId. While the request is in flight
// (or if the school doesn't exist) we render a minimal placeholder so the
// header still appears.
const AtriumSchool = () => {
    const { schoolId } = useParams();
    const navigate = useNavigate();
    const [school, setSchool] = useState(null);
    // Per-section AI generation state: { [sectionId]: 'idle' | 'generating' | 'error' }
    const [genState, setGenState] = useState({});
    // Mobile-only: 'left' = course outline, 'right' = sections grid.
    const [mobilePane, setMobilePane] = useState('left');

    useEffect(() => {
        let cancelled = false;
        fetchSchool(schoolId).then((r) => {
            if (!cancelled && r.ok && r.data) setSchool(r.data);
        });
        return () => { cancelled = true; };
    }, [schoolId]);

    // Kick off AI test generation for a section. While the request is in flight
    // the button shows a spinner ("Generating…"); on success we flip the
    // section's hasTest flag locally so the next render shows "Take test".
    const handleGenerate = async (sectionId) => {
        setGenState((s) => ({ ...s, [sectionId]: 'generating' }));
        const r = await generateTest(schoolId, sectionId);
        if (r.ok) {
            setSchool((s) => s ? {
                ...s,
                sections: s.sections.map((sec) =>
                    sec.id === sectionId ? { ...sec, hasTest: true } : sec,
                ),
            } : s);
            setGenState((s) => ({ ...s, [sectionId]: 'idle' }));
        } else {
            setGenState((s) => ({ ...s, [sectionId]: 'error' }));
        }
    };

    if (!school) {
        return (
            <div className="atrium-screen">
                <HeaderSchool schoolName="—" progress={0} />
                <div className="school"><div className="school-main"><p style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading school…</p></div></div>
            </div>
        );
    }

    const meta = school.meta || {};
    const tagline = school.tagline || '';
    const sections = Array.isArray(school.sections) ? school.sections : [];

    return (
        <div className="atrium-screen">
            <HeaderSchool schoolName={school.name} progress={school.progress} />
            <SubTab
                left="Outline"
                right="Sections"
                active={mobilePane}
                onChange={setMobilePane}
            />
            <div className="school" data-pane={mobilePane}>
                <aside className="school-side">
                    <div className="tag">Course folder</div>
                    <h2 className="school-title">
                        {tagline.split('\n').map((line, i, arr) => (
                            <React.Fragment key={i}>
                                {line}
                                {i < arr.length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </h2>
                    <div className="school-meta">
                        <div className="school-meta-row">
                            <span className="meta-k">Tutor</span>
                            <span className="meta-v">{meta.tutor || '—'}</span>
                        </div>
                        <div className="school-meta-row">
                            <span className="meta-k">Sections</span>
                            <span className="meta-v mono">{String(meta.sections || 0).padStart(2, '0')}</span>
                        </div>
                        <div className="school-meta-row">
                            <span className="meta-k">Topics</span>
                            <span className="meta-v mono">{String(meta.topics || 0).padStart(2, '0')}</span>
                        </div>
                        <div className="school-meta-row">
                            <span className="meta-k">Completed</span>
                            <span className="meta-v mono">{String(meta.completed || 0).padStart(2, '0')}</span>
                        </div>
                        <div className="school-meta-row">
                            <span className="meta-k">Next test</span>
                            <span className="meta-v">{meta.nextTest || '—'}</span>
                        </div>
                    </div>
                    {meta.resumeTopicId && (
                        <button
                            className="btn primary"
                            style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
                            onClick={() => navigate(`/atrium/school/${schoolId}/topic/${meta.resumeTopicId}`)}
                        >
                            Resume topic {meta.resumeTopicId}
                        </button>
                    )}
                </aside>

                <div className="school-main">
                    {sections.map((sec, i) => (
                        <section key={sec.id} className="section card">
                            <div className="section-head">
                                <div className="section-head-l">
                                    <span className="section-idx mono">§ {String(i + 1).padStart(2, '0')}</span>
                                    <h3 className="section-name">{sec.name}</h3>
                                </div>
                                <div className="section-head-r">
                                    <div className="section-bar">
                                        <span style={{ width: `${sec.progress}%` }} />
                                    </div>
                                    <span className="section-pct mono">{sec.progress}%</span>
                                    {(() => {
                                        const state = genState[sec.id] || 'idle';
                                        const isGenerating = state === 'generating';
                                        if (!sec.hasTest) {
                                            return (
                                                <button
                                                    className="btn test"
                                                    disabled={isGenerating}
                                                    onClick={() => handleGenerate(sec.id)}
                                                >
                                                    {isGenerating ? (
                                                        <>
                                                            <span className="spinner" aria-hidden />
                                                            Generating…
                                                        </>
                                                    ) : state === 'error' ? 'Retry generate' : 'Generate test'}
                                                </button>
                                            );
                                        }
                                        return (
                                            <>
                                                <button
                                                    className="btn test"
                                                    onClick={() => navigate(`/atrium/school/${schoolId}/test/${sec.id}`)}
                                                >
                                                    Take test
                                                </button>
                                                <button
                                                    className="btn ghost tiny"
                                                    disabled={isGenerating}
                                                    onClick={() => handleGenerate(sec.id)}
                                                    title="Discard the current test and generate a new one"
                                                >
                                                    {isGenerating ? (
                                                        <>
                                                            <span className="spinner" aria-hidden />
                                                            Regenerating…
                                                        </>
                                                    ) : 'Regenerate'}
                                                </button>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                            <div className="topic-row">
                                {sec.topics.map((t) => (
                                    <TopicDot
                                        key={t.id}
                                        {...t}
                                        to={`/atrium/school/${schoolId}/topic/${t.id}`}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AtriumSchool;
