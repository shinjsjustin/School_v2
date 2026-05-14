import React from 'react';
import { Link } from 'react-router-dom';
import { Ring, Check } from './Icons';

// Manila folder card used on the Dashboard. Wraps in a Link so clicking the
// folder navigates into a school.
export const Folder = ({ name, progress, tone, to }) => {
    const fill = tone || 'var(--folder)';
    const lidFill = tone || 'var(--folder-lid)';

    const inner = (
        <>
            <div className="folder">
                <svg viewBox="0 0 200 150" width="100%" height="100%" className="folder-svg">
                    {/* back wall */}
                    <path
                        d="M 6 28 L 70 28 L 82 18 L 194 18 L 194 142 L 6 142 Z"
                        fill={fill}
                        stroke="var(--folder-edge)"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                    />
                    {/* paper peek */}
                    <rect x="14" y="36" width="172" height="96" rx="2"
                        fill="#f7efdc" stroke="#caa570" strokeWidth="0.6" />
                    <line x1="26" y1="50" x2="170" y2="50" stroke="#caa570" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.7" />
                    <line x1="26" y1="62" x2="150" y2="62" stroke="#caa570" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.6" />
                    <line x1="26" y1="74" x2="160" y2="74" stroke="#caa570" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
                    {/* front lid */}
                    <g className="folder-lid">
                        <path
                            d="M 6 40 L 194 40 L 194 142 L 6 142 Z"
                            fill={lidFill}
                            stroke="var(--folder-edge)"
                            strokeWidth="1.3"
                            strokeLinejoin="round"
                        />
                        <rect x="22" y="120" width="60" height="14" rx="2" fill="rgba(255,255,255,0.35)" />
                    </g>
                </svg>
            </div>
            <div className="folder-meta">
                <div className="folder-name">{name}</div>
                <div className="folder-prog">
                    <Ring value={progress} size={22} stroke={2.5} showLabel={false} />
                    <span className="folder-prog-num">{progress}%</span>
                    <span className="folder-prog-bar">
                        <span style={{ width: `${progress}%` }} />
                    </span>
                </div>
            </div>
        </>
    );

    if (to) {
        return <Link to={to} className="folder-wrap">{inner}</Link>;
    }
    return <div className="folder-wrap">{inner}</div>;
};

// Dashed "new school" placeholder that links to the Roadmap flow.
export const NewFolder = ({ to = '/atrium/roadmap' }) => (
    <Link to={to} className="folder-wrap new-folder">
        <div className="folder new-folder-ic">
            <svg viewBox="0 0 200 150" width="100%" height="100%">
                <path
                    d="M 6 28 L 70 28 L 82 18 L 194 18 L 194 142 L 6 142 Z"
                    fill="none"
                    stroke="var(--ink-4)"
                    strokeWidth="1.3"
                    strokeDasharray="6 5"
                    strokeLinejoin="round"
                />
                <g transform="translate(100 88)" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="-10" y1="0" x2="10" y2="0" />
                    <line x1="0" y1="-10" x2="0" y2="10" />
                </g>
            </svg>
        </div>
        <div className="folder-meta">
            <div className="folder-name muted">New school</div>
            <div className="folder-prog muted" style={{ opacity: 0.6 }}>
                <span className="tick">Start something</span>
            </div>
        </div>
    </Link>
);

// Topic indicator on the School page — clickable circular check or "START".
export const TopicDot = ({ status, label, num, to }) => {
    const isDone = status === 'done';
    const inner = (
        <>
            <button type="button" className={`topic-dot ${isDone ? 'done' : 'start'}`} title={label}>
                {isDone ? <Check size={14} /> : <span className="topic-start-label">START</span>}
            </button>
            <div className="topic-meta">
                <div className="topic-num">{num}</div>
                <div className="topic-label">{label}</div>
            </div>
        </>
    );
    if (to) {
        return <Link to={to} className="topic">{inner}</Link>;
    }
    return <div className="topic">{inner}</div>;
};
