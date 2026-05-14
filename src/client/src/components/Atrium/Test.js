import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { HeaderTest } from './parts/Headers';
import { Chevron } from './parts/Icons';
import { TEST_DETAIL, KIND_LABEL } from './data/mockData';
import '../Styling/Atrium.css';

// Test (mid-term) screen — question list + free-response card.
//
// TODO (data): fetch the test by `sectionId` from the URL.
//   const { schoolId, sectionId } = useParams();
//   fetch(`${process.env.REACT_APP_URL}/atrium/tests/${sectionId}`, ...)
//
// TODO (autosave): debounce-PUT the response.
//   PUT ${REACT_APP_URL}/atrium/tests/${sectionId}/responses/${currentQuestion.num}
//   body: { response: draftResponse }
const AtriumTest = () => {
    // eslint-disable-next-line no-unused-vars
    const { schoolId, sectionId } = useParams();
    const test = TEST_DETAIL; // TODO: derive from `sectionId`
    const [response, setResponse] = useState(test.currentQuestion.draftResponse);

    return (
        <div className="atrium-screen">
            <HeaderTest section={test.section} current={test.current} total={test.total} />
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
                        {test.questions.map((q) => (
                            <li key={q.num} className={`qrow qrow-${q.status}`}>
                                {/* TODO: clicking a row should jump to that question. */}
                                <span className="qrow-num mono">{String(q.num).padStart(2, '0')}</span>
                                <span className="qrow-stem">{q.stem}</span>
                                <span className={`qrow-mark mark-${q.status}`} />
                            </li>
                        ))}
                    </ul>
                    <div className="qlegend">
                        <span><span className="dot dot-answered" /> Answered</span>
                        <span><span className="dot dot-current" /> Current</span>
                        <span><span className="dot dot-flagged" /> Flagged</span>
                        <span><span className="dot dot-open" /> Open</span>
                    </div>
                </aside>

                {/* Question module */}
                <main className="qmain">
                    <div className="qcard card">
                        <div className="qcard-head">
                            <div>
                                <div className="tag">
                                    Question {String(test.currentQuestion.num).padStart(2, '0')} of {String(test.total).padStart(2, '0')} · {KIND_LABEL[test.currentQuestion.kind]}
                                </div>
                                <h2 className="qstem">{test.currentQuestion.stem}</h2>
                            </div>
                            {/* TODO: toggle flagged status via PATCH .../responses/:num/flag */}
                            <button className="btn ghost tiny">⚑ Flag</button>
                        </div>

                        <div className="qcard-body">
                            <label className="qfr-label">Your response</label>
                            <textarea
                                className="qfr"
                                rows={8}
                                value={response}
                                onChange={(e) => setResponse(e.target.value)}
                            />
                            <div className="qfr-foot">
                                <span className="tick">
                                    Min 60 words · auto-saved {test.currentQuestion.autoSavedSec}s ago
                                </span>
                                <span className="tick mono">
                                    {test.currentQuestion.wordCount} / {test.currentQuestion.wordLimit} words
                                </span>
                            </div>
                        </div>

                        <div className="qcard-aside">
                            <div className="tag">Hint</div>
                            <p>{test.currentQuestion.hint}</p>
                        </div>
                    </div>

                    <div className="qnav">
                        <div className="qnav-l">
                            {/* TODO: prev/next handlers + URL state for ?q=04 */}
                            <button className="qarrow" aria-label="Previous"><Chevron dir="left" size={16} /></button>
                            <button className="qarrow" aria-label="Next"><Chevron dir="right" size={16} /></button>
                            <div className="qnav-dots">
                                {test.questions.map((q) => (
                                    <span key={q.num} className={`qnav-dot dot-${q.status}`} />
                                ))}
                            </div>
                        </div>
                        <div className="qnav-r">
                            {/* TODO: save-and-exit / submit handlers */}
                            <button className="btn ghost">Save & exit</button>
                            <button className="btn primary" style={{ paddingRight: 18 }}>
                                Finish test
                                <span style={{ marginLeft: 8, fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.7 }}>⏎</span>
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default AtriumTest;
