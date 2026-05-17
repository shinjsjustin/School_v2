import React from 'react';
import { Chevron } from './Icons';

// Mobile-only swap tab: ◂ [Left | Right] ▸
//
// Renders on every viewport but is hidden by CSS on desktop (>768px).
// The parent owns the active state and renders both panes inside a
// `data-pane="left"|"right"` wrapper; CSS hides the inactive pane on mobile
// while desktop keeps the side-by-side split untouched.
export const SubTab = ({ left, right, active = 'left', onChange }) => {
    const set = (side) => () => {
        if (onChange && side !== active) onChange(side);
    };
    return (
        <div className="subtab" role="tablist" aria-label="Pane switcher">
            <button
                type="button"
                className={`subtab-arrow ${active === 'left' ? 'is-active' : ''}`}
                onClick={set('left')}
                aria-label={`Show ${left}`}
            >
                <Chevron dir="left" size={13} />
            </button>
            <div className="subtab-seg">
                <button
                    type="button"
                    role="tab"
                    aria-selected={active === 'left'}
                    className={`subtab-pill ${active === 'left' ? 'on' : ''}`}
                    onClick={set('left')}
                >
                    {left}
                </button>
                <span className="subtab-divider" aria-hidden />
                <button
                    type="button"
                    role="tab"
                    aria-selected={active === 'right'}
                    className={`subtab-pill ${active === 'right' ? 'on' : ''}`}
                    onClick={set('right')}
                >
                    {right}
                </button>
            </div>
            <button
                type="button"
                className={`subtab-arrow ${active === 'right' ? 'is-active' : ''}`}
                onClick={set('right')}
                aria-label={`Show ${right}`}
            >
                <Chevron dir="right" size={13} />
            </button>
        </div>
    );
};

export default SubTab;
