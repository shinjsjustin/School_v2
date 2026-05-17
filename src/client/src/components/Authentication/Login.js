import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Monogram } from '../Atrium/parts/Icons';
import '../Styling/Atrium.css';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (response.status === 200) {
                localStorage.setItem('token', data.token);
                navigate('/atrium');
            } else if (response.status === 404) {
                setError('No account found with that email.');
            } else if (response.status === 400) {
                setError('Invalid password.');
            } else {
                setError('Server error — please try again.');
            }
        } catch (err) {
            setError('Network error — could not reach the server.');
        }
    };

    return (
        <div className="atrium-screen">
            <header className="hdr">
                <div className="hdr-left">
                    <Monogram onClick={() => navigate('/')} />
                    <div className="hdr-brand">Atrium</div>
                </div>
            </header>
            <div className="auth-body">
                <div className="auth-card card">
                    <div className="tag">Account</div>
                    <h1 className="auth-title">Welcome back.</h1>
                    <p className="auth-sub">Sign in to continue learning.</p>
                    <form className="auth-form" onSubmit={handleLogin}>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button className="btn primary" type="submit">Log In</button>
                    </form>
                    {error && <p className="auth-error">{error}</p>}
                    <div className="auth-links">
                        <Link to="/register">Don't have an account? Register</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
