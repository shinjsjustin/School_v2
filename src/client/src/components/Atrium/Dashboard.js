import React from 'react';
import { HeaderDashboard } from './parts/Headers';
import { Folder, NewFolder } from './parts/Folder';
import { SCHOOLS, DASHBOARD_STATS } from './data/mockData';
import '../Styling/Atrium.css';

// Atrium Dashboard — folder grid of the user's schools.
//
// TODO (data): replace SCHOOLS / DASHBOARD_STATS imports with a real fetch
//   useEffect(() => {
//     const token = localStorage.getItem('token');
//     fetch(`${process.env.REACT_APP_URL}/atrium/schools`, {
//       headers: { Authorization: `Bearer ${token}` },
//     }).then(r => r.json()).then(setSchools);
//   }, []);
const AtriumDashboard = () => {
    return (
        <div className="atrium-screen">
            <HeaderDashboard />
            <div className="dash">
                <div className="dash-top">
                    <div>
                        <div className="tag">Your library · {SCHOOLS.length} schools</div>
                        <h1 className="dash-title">Continue learning</h1>
                        <p className="dash-sub">Pick a folder to open a school. Hover to peek inside.</p>
                    </div>
                    <div className="dash-stats">
                        <div className="dash-stat">
                            <div className="dash-stat-num">{DASHBOARD_STATS.monthHours}<span>h</span></div>
                            <div className="dash-stat-lbl">This month</div>
                        </div>
                        <div className="dash-stat">
                            <div className="dash-stat-num">{DASHBOARD_STATS.streak}</div>
                            <div className="dash-stat-lbl">Day streak</div>
                        </div>
                        <div className="dash-stat">
                            <div className="dash-stat-num">{DASHBOARD_STATS.overallPct}<span>%</span></div>
                            <div className="dash-stat-lbl">Across all</div>
                        </div>
                    </div>
                </div>

                <div className="folder-grid">
                    {SCHOOLS.map((s, i) => (
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
