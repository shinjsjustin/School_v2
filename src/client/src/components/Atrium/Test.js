import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HeaderTest } from './parts/Headers';
import { Chevron } from './parts/Icons';
import {
    fetchTest,
    saveResponse,
    flagResponse,
    setCurrentQuestion,
    submitTest,
    retakeTest,
} from './data/api';
import '../Styling/Atrium.css';

const KIND_LABEL = { mc: 'Multiple choice', tf: 'True / False', fr: 'Free response' };

const EMPTY_TEST = {
    section: '',
    current: 1,
    total: 0,
    questions: [],
    currentQuestion: null,
    attempt: null,
};

// Test (mid-term) screen — question list + free-response card.
//
// Hydrates from /atrium/schools/:schoolId/tests/:sectionId. Every keystroke
// in the response textarea is debounced and PUT to the autosave endpoint.
// Once the attempt is submitted the page flips to a read-only results view
// with the grader AI's per-question feedback overlaid on each question.
const AUTOSAVE_DEBOUNCE_MS = 600;

const AtriumTest = () => {
    const { schoolId, sectionId } = useParams();
    const navigate = useNavigate();
    const [test, setTest] = useState(EMPTY_TEST);
    const [status, setStatus] = useState('loading');   // loading | not_generated | ready
    const [response, setResponse] = useState('');
    const [savedAgo, setSavedAgo] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const debounceRef = useRef(null);

    const applyPayload = (data) => {
        setTest(data);
        setResponse(data.currentQuestion?.draftResponse || '');
        setSavedAgo(data.currentQuestion?.autoSavedSec || 0);
        setStatus('ready');
    };

    // Hydrate from the API on mount + whenever the URL params change.
    useEffect(() => {
        let cancelled = false;
        fetchTest(schoolId, sectionId).then((r) => {
            if (cancelled || !r.ok || !r.data) return;
            if (r.data.status === 'not_generated') {
                setStatus('not_generated');
                setTest((t) => ({ ...t, section: r.data.section || '' }));
                return;
            }
            applyPayload(r.data);
        });
        return () => { cancelled = true; };
    }, [schoolId, sectionId]);

    // Tick the "saved Xs ago" counter every second.
    useEffect(() => {
        const t = setInterval(() => setSavedAgo((s) => s + 1), 1000);
        return () => clearInterval(t);
    }, []);

    if (status === 'loading') {
        return (
            <div className="atrium-screen">
                <HeaderTest section="—" current={0} total={0} />
                <div className="test"><main className="qmain"><p style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading test…</p></main></div>
            </div>
        );
    }

    if (status === 'not_generated') {
        return (
            <div className="atrium-screen">
                <HeaderTest section={test.section || '—'} current={0} total={0} />
                <div className="test">
                    <main className="qmain">
                        <div className="qcard card" style={{ gridTemplateColumns: '1fr' }}>
                            <div className="qcard-head">
                                <h2 className="qstem">No test has been generated for this section yet.</h2>
                            </div>
                            <div className="qcard-body" style={{ gap: 12 }}>
                                <p style={{ color: 'var(--text-secondary)' }}>
                                    Head back to the school page and click <strong>Generate test</strong> on this section.
                                </p>
                                <button
                                    className="btn primary"
                                    style={{ alignSelf: 'flex-start' }}
                                    onClick={() => navigate(`/atrium/school/${schoolId}`)}
                                >
                                    ← Back to school
                                </button>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    const cur = test.currentQuestion;
    const wordCount = response.trim().split(/\s+/).filter(Boolean).length;
    const readOnly = !!test.attempt?.readOnly;
    const graded = !!test.attempt?.gradedAt;

    if (!cur) {
        return (
            <div className="atrium-screen">
                <HeaderTest section={test.section || '—'} current={0} total={0} />
                <div className="test"><main className="qmain"><p style={{ padding: 24, color: 'var(--text-secondary)' }}>This test has no questions yet.</p></main></div>
            </div>
        );
    }

    // Debounced autosave — disabled in read-only mode.
    const onResponseChange = (e) => {
        const value = e.target.value;
        setResponse(value);
        if (readOnly) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            const r = await saveResponse(schoolId, sectionId, cur.num, value);
            if (r.ok) setSavedAgo(0);
        }, AUTOSAVE_DEBOUNCE_MS);
    };

    const goTo = async (num) => {
        if (num < 1 || num > test.total) return;
        if (!readOnly) await setCurrentQuestion(schoolId, sectionId, num);
        const r = await fetchTest(schoolId, sectionId);
        if (r.ok && r.data && r.data.status === 'ready') applyPayload(r.data);
    };

    const toggleFlag = async () => {
        if (readOnly) return;
        const isFlagged = test.questions.find((q) => q.num === cur.num)?.status === 'flagged';
        await flagResponse(schoolId, sectionId, cur.num, !isFlagged);
        setTest((t) => ({
            ...t,
            questions: t.questions.map((q) =>
                q.num === cur.num ? { ...q, status: !isFlagged ? 'flagged' : 'open' } : q,
            ),
        }));
    };

    const onSubmit = async () => {
        if (submitting || readOnly) return;
        setSubmitting(true);
        const r = await submitTest(schoolId, sectionId);
        setSubmitting(false);
        if (r.ok && r.data && r.data.status === 'ready') applyPayload(r.data);
    };

    const onRetake = async () => {
        const r = await retakeTest(schoolId, sectionId);
        if (r.ok && r.data && r.data.status === 'ready') applyPayload(r.data);
    };

    const curGrade = cur.grade;

    return (
        <div className="atrium-screen">
            <HeaderTest section={test.section} current={test.current} total={test.total} />

            {graded && (
                <div className="grade-banner card">
                    <div className="grade-banner-l">
                        <div className="tag">Graded</div>
                        <div className="grade-score mono">{test.attempt.scorePct}%</div>
                    </div>
                    <div className="grade-banner-r">
                        <div className="tag">Summary</div>
                        <p>{test.attempt.graderSummary || '—'}</p>
                    </div>
                    <button className="btn primary" onClick={onRetake}>Retake test</button>
                </div>
            )}

            <div className="test">
                {/* Question list */}
                <aside className="qlist">
                    <div className="qlist-head">
                        <span className="tag">Questions</span>
                        <span className="tick mono">
                            {String(test.current).padStart(2, '0')} / {String(test.total).padStart(2, '0')}
                        </span>
                    </div>
                    <ul className="qlist-list">
                        {test.questions.map((q) => {
                            const gradeClass = q.grade
                                ? (q.grade.isCorrect ? ' qrow-correct' : ' qrow-incorrect')
                                : '';
                            return (
                                <li
                                    key={q.num}
                                    className={`qrow qrow-${q.status}${gradeClass}`}
                                    onClick={() => goTo(q.num)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <span className="qrow-num mono">{String(q.num).padStart(2, '0')}</span>
                                    <span className="qrow-stem">{q.stem}</span>
                                    {q.grade ? (
                                        <span className="qrow-mark mono">
                                            {q.grade.scorePct}%
                                        </span>
                                    ) : (
                                        <span className={`qrow-mark mark-${q.status}`} />
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <div className="qlegend">
                        {graded ? (
                            <>
                                <span><span className="dot dot-correct" /> Correct</span>
                                <span><span className="dot dot-incorrect" /> Incorrect</span>
                            </>
                        ) : (
                            <>
                                <span><span className="dot dot-answered" /> Answered</span>
                                <span><span className="dot dot-current" /> Current</span>
                                <span><span className="dot dot-flagged" /> Flagged</span>
                                <span><span className="dot dot-open" /> Open</span>
                            </>
                        )}
                    </div>
                </aside>

                {/* Question module */}
                <main className="qmain">
                    <div className="qcard card">
                        <div className="qcard-head">
                            <div>
                                <div className="tag">
                                    Question {String(cur.num).padStart(2, '0')} of {String(test.total).padStart(2, '0')} · {KIND_LABEL[cur.kind]}
                                    {curGrade && (
                                        <span className={`grade-pill ${curGrade.isCorrect ? 'grade-pill-correct' : 'grade-pill-incorrect'}`}>
                                            {curGrade.scorePct}%
                                        </span>
                                    )}
                                </div>
                                <h2 className="qstem">{cur.stem}</h2>
                            </div>
                            {!readOnly && (
                                <button className="btn ghost tiny" onClick={toggleFlag}>⚑ Flag</button>
                            )}
                        </div>

                        <div className="qcard-body">
                            <label className="qfr-label">{readOnly ? 'Your response' : 'Your response'}</label>
                            <textarea
                                className="qfr"
                                rows={8}
                                value={response}
                                onChange={onResponseChange}
                                readOnly={readOnly}
                            />
                            <div className="qfr-foot">
                                <span className="tick">
                                    {readOnly
                                        ? 'Read-only · attempt submitted'
                                        : `Min 60 words · auto-saved ${savedAgo}s ago`}
                                </span>
                                <span className="tick mono">
                                    {wordCount} / {cur.wordLimit} words
                                </span>
                            </div>

                            {curGrade && (
                                <div className="qgrade">
                                    <div className="tag">Grader feedback</div>
                                    <p>{curGrade.feedback || 'No feedback provided.'}</p>
                                </div>
                            )}
                        </div>

                        <div className="qcard-aside">
                            <div className="tag">Hint</div>
                            <p>{cur.hint}</p>
                        </div>
                    </div>

                    <div className="qnav">
                        <div className="qnav-l">
                            <button className="qarrow" aria-label="Previous" onClick={() => goTo(cur.num - 1)}>
                                <Chevron dir="left" size={16} />
                            </button>
                            <button className="qarrow" aria-label="Next" onClick={() => goTo(cur.num + 1)}>
                                <Chevron dir="right" size={16} />
                            </button>
                            <div className="qnav-dots">
                                {test.questions.map((q) => (
                                    <span key={q.num} className={`qnav-dot dot-${q.status}`} />
                                ))}
                            </div>
                        </div>
                        <div className="qnav-r">
                            {readOnly ? (
                                <button className="btn primary" onClick={onRetake}>Retake test</button>
                            ) : (
                                <>
                                    <button className="btn ghost" onClick={() => navigate(`/atrium/school/${schoolId}`)}>Save & exit</button>
                                    <button
                                        className="btn primary"
                                        style={{ paddingRight: 18 }}
                                        onClick={onSubmit}
                                        disabled={submitting}
                                    >
                                        {submitting ? (
                                            <>
                                                <span className="spinner" aria-hidden />
                                                Grading…
                                            </>
                                        ) : 'Finish test'}
                                        {!submitting && (
                                            <span style={{ marginLeft: 8, fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.7 }}>⏎</span>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default AtriumTest;
