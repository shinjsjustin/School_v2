import React from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { Ring, Chevron, Monogram } from './Icons';

// Header variants for each Atrium screen. They share the same layout primitives
// but vary the center "breadcrumb" and the right-hand widget.

const getUserName = () => {
    try {
        const token = localStorage.getItem('token');
        if (!token) return 'User';
        const decoded = jwtDecode(token);
        return decoded.name || decoded.email?.split('@')[0] || 'User';
    } catch {
        return 'User';
    }
};

const getDateLabel = () => {
    const d = new Date();
    const day = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const mon = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    return `${day} · ${mon} ${d.getDate()}`;
};

export const HeaderDashboard = () => {
    const navigate = useNavigate();
    const userName = getUserName();
    const dateLabel = getDateLabel();

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/');
    };

    return (
        <header className="hdr">
            <div className="hdr-left">
                <Monogram onClick={() => navigate('/atrium')} />
                <div>
                    <div className="hdr-brand">Atrium</div>
                </div>
            </div>
            <div className="hdr-center" style={{ justifyContent: 'center' }}>
                <span className="hdr-welcome">Welcome back, {userName}.</span>
            </div>
            <div className="hdr-right">
                <span className="tick">{dateLabel}</span>
                <div className="hdr-avatar-wrap">
                    <div className="hdr-avatar">{userName.charAt(0).toUpperCase()}</div>
                    <button className="hdr-logout-btn" onClick={handleLogout}>Logout</button>
                </div>
            </div>
        </header>
    );
};

export const HeaderSchool = ({ schoolName, progress, onBack }) => {
    const navigate = useNavigate();
    return (
        <header className="hdr">
            <div className="hdr-left">
                <button className="hdr-back" title="Back" onClick={onBack || (() => navigate('/atrium'))}>
                    <Chevron dir="left" />
                </button>
                <Monogram onClick={() => navigate('/atrium')} />
            </div>
            <div className="hdr-center">
                <div className="hdr-crumb">
                    <span className="label">School</span>
                    <span className="title">{schoolName}</span>
                </div>
            </div>
            <div className="hdr-right">
                <Ring value={progress} size={34} stroke={3.5} labelText="Overall" />
            </div>
        </header>
    );
};

export const HeaderTeacher = ({ section, topic, progress, onBack }) => {
    const navigate = useNavigate();
    return (
        <header className="hdr">
            <div className="hdr-left">
                <button className="hdr-back" title="Back" onClick={onBack || (() => navigate(-1))}>
                    <Chevron dir="left" />
                </button>
                <Monogram onClick={() => navigate('/atrium')} />
            </div>
            <div className="hdr-center">
                <div className="hdr-crumb">
                    <span className="label">Section</span>
                    <span className="title">{section}</span>
                    <span className="sep">/</span>
                    <span className="label">Topic</span>
                    <span className="title" style={{ color: 'var(--accent)' }}>{topic}</span>
                </div>
            </div>
            <div className="hdr-right">
                <Ring value={progress} size={34} stroke={3.5} labelText="Topic" />
            </div>
        </header>
    );
};

export const HeaderTest = ({ section, current, total, onBack }) => {
    const navigate = useNavigate();
    return (
        <header className="hdr">
            <div className="hdr-left">
                <button className="hdr-back" title="Back" onClick={onBack || (() => navigate(-1))}>
                    <Chevron dir="left" />
                </button>
                <Monogram onClick={() => navigate('/atrium')} />
            </div>
            <div className="hdr-center">
                <div className="hdr-crumb">
                    <span className="label">Mid-term</span>
                    <span className="title">{section}</span>
                </div>
            </div>
            <div className="hdr-right">
                <span className="hdr-pill">
                    <span>Question</span>
                    <span className="num">{String(current).padStart(2, '0')}</span>
                    <span style={{ color: 'var(--ink-4)' }}>/</span>
                    <span>{String(total).padStart(2, '0')}</span>
                </span>
            </div>
        </header>
    );
};
