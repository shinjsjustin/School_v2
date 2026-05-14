import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HeaderSchool } from './parts/Headers';
import { TopicDot } from './parts/Folder';
import { SCHOOL_DETAIL } from './data/mockData';
import '../Styling/Atrium.css';

// School page — sections + topics grid.
//
// TODO (data): fetch the school by `schoolId` from the URL.
//   const { schoolId } = useParams();
//   useEffect(() => {
//     fetch(`${process.env.REACT_APP_URL}/atrium/schools/${schoolId}`, {
//       headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
//     }).then(r => r.json()).then(setSchool);
//   }, [schoolId]);
const AtriumSchool = () => {
    const { schoolId = SCHOOL_DETAIL.id } = useParams();
    const navigate = useNavigate();
    const school = SCHOOL_DETAIL; // TODO: derive from `schoolId`

    return (
        <div className="atrium-screen">
            <HeaderSchool schoolName={school.name} progress={school.progress} />
            <div className="school">
                <aside className="school-side">
                    <div className="tag">Course folder</div>
                    <h2 className="school-title">
                        {school.tagline.split('\n').map((line, i, arr) => (
                            <React.Fragment key={i}>
                                {line}
                                {i < arr.length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </h2>
                    <div className="school-meta">
                        <div className="school-meta-row">
                            <span className="meta-k">Tutor</span>
                            <span className="meta-v">{school.meta.tutor}</span>
                        </div>
                        <div className="school-meta-row">
                            <span className="meta-k">Sections</span>
                            <span className="meta-v mono">{String(school.meta.sections).padStart(2, '0')}</span>
                        </div>
                        <div className="school-meta-row">
                            <span className="meta-k">Topics</span>
                            <span className="meta-v mono">{String(school.meta.topics).padStart(2, '0')}</span>
                        </div>
                        <div className="school-meta-row">
                            <span className="meta-k">Completed</span>
                            <span className="meta-v mono">{String(school.meta.completed).padStart(2, '0')}</span>
                        </div>
                        <div className="school-meta-row">
                            <span className="meta-k">Next test</span>
                            <span className="meta-v">{school.meta.nextTest}</span>
                        </div>
                    </div>
                    <button
                        className="btn primary"
                        style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
                        onClick={() => navigate(`/atrium/school/${schoolId}/topic/${school.meta.resumeTopicId}`)}
                    >
                        Resume topic {school.meta.resumeTopicId}
                    </button>
                </aside>

                <div className="school-main">
                    {school.sections.map((sec, i) => (
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
                                    <button
                                        className="btn test"
                                        onClick={() => navigate(`/atrium/school/${schoolId}/test/${sec.id}`)}
                                    >
                                        {sec.progress === 100 ? '✓ Retake test' : 'Test section'}
                                    </button>
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
