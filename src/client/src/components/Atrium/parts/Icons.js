import React from 'react';

// Small SVG/UI primitives used across the Atrium screens.

export const Ring = ({ value = 0, size = 36, stroke = 3.5, showLabel = true, labelText }) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c * (1 - value / 100);
    return (
        <span className="ring">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke="var(--rule-2)" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke="var(--ink)" strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={off}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            </svg>
            {showLabel && (
                <span>
                    {labelText && (
                        <div className="ring-label" style={{ lineHeight: 1.1, marginBottom: 1 }}>
                            {labelText}
                        </div>
                    )}
                    <span className="ring-num">{value}%</span>
                </span>
            )}
        </span>
    );
};

export const Chevron = ({ dir = 'left', size = 14 }) => {
    const rot = { left: 180, right: 0, up: -90, down: 90 }[dir];
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" style={{ transform: `rotate(${rot}deg)` }}>
            <path d="M6 3l5 5-5 5"
                fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

export const Check = ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16">
        <path d="M3.5 8.5l3 3 6-7"
            fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// TODO: Replace 'A' with the user's initial pulled from the JWT once the
// Atrium screens are wired to the auth context.
export const Monogram = ({ initial = 'A', onClick }) => (
    <div className="hdr-mono" onClick={onClick} role={onClick ? 'button' : undefined}>
        {initial}
    </div>
);
