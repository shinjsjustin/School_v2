import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../Styling/Form.css';

const Register = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [anthropicApiKey, setAnthropicApiKey] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, anthropic_api_key: anthropicApiKey || undefined }),
            });

            const data = await response.json();

            if (response.status === 201) {
                navigate('/post-register');
            } else if (response.status === 409) {
                setError('An account with that email already exists.');
            } else {
                setError(data.error || 'Server error — please try again.');
            }
        } catch (err) {
            console.error(err);
            setError('Network error — could not reach the server.');
        }
    };

    return (
        <div className="container">
            <h1 className="header">Register</h1>
            <form className="container-form" onSubmit={handleRegister}>
                <input
                    type="text"
                    placeholder="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                />
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
                <input
                    type="password"
                    placeholder="Password (min 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                <input
                    type="password"
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                />
                <input
                    type="text"
                    placeholder="Anthropic API Key (optional)"
                    value={anthropicApiKey}
                    onChange={(e) => setAnthropicApiKey(e.target.value)}
                />
                <button type="submit">Create Account</button>
                <Link to="/login">Already have an account? Log in</Link>
                <Link to="/">Home</Link>
            </form>
            {error && <p>{error}</p>}
        </div>
    );
};

export default Register;
