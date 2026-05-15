import React, { useEffect, useState } from 'react';
import { HeaderDashboard } from './parts/Headers';
import { Folder, NewFolder } from './parts/Folder';
import { fetchSchools, fetchStats } from './data/api';
import '../Styling/Atrium.css';

const EMPTY_STATS = { monthHours: 0, streak: 0, overallPct: 0 };

// Atrium Dashboard — folder grid of the user's schools.
//
// On mount we hydrate from /atrium/schools and /atrium/stats. An empty
// library renders just the "new folder" tile, prompting the user to build
// their first school via the Roadmap flow.
const AtriumDashboard = () => {
    const [schools, setSchools] = useState([]);
    const [stats, setStats] = useState(EMPTY_STATS);

    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchSchools(), fetchStats()]).then(([s, st]) => {
            if (cancelled) return;
            if (s.ok && Array.isArray(s.data)) setSchools(s.data);
            if (st.ok && st.data) setStats(st.data);
        });
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="atrium-screen">
            <HeaderDashboard />
            <div className="dash">
                <div className="dash-top">
                    <div>
                        <div className="tag">Your library · {schools.length} schools</div>
                        <h1 className="dash-title">Continue learning</h1>
                        <p className="dash-sub">Pick a folder to open a school. Hover to peek inside.</p>
                    </div>
                    <div className="dash-stats">
                        <div className="dash-stat">
                            <div className="dash-stat-num">{stats.monthHours}<span>h</span></div>
                            <div className="dash-stat-lbl">This month</div>
                        </div>
                        <div className="dash-stat">
                            <div className="dash-stat-num">{stats.streak}</div>
                            <div className="dash-stat-lbl">Day streak</div>
                        </div>
                        <div className="dash-stat">
                            <div className="dash-stat-num">{stats.overallPct}<span>%</span></div>
                            <div className="dash-stat-lbl">Across all</div>
                        </div>
                    </div>
                </div>

                <div className="folder-grid">
                    {schools.map((s, i) => (
                        <Folder
                            key={s.id}
                            name={s.name}
                            progress={s.progress}
                            tone={i % 2 === 0 ? 'var(--folder)' : '#dcb084'}
                            to={`/atrium/school/${s.id}`}
                        />
                    ))}
                    <NewFolder to="/atrium/roadmap" />
                </div>
            </div>
        </div>
    );
};

export default AtriumDashboard;
