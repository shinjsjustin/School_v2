import {jwtDecode} from 'jwt-decode'
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import profileicon from '../profile-icon.svg'
import './Styling/Navbar.css'
import './Styling/Home.css'

import Logout from './Authentication/Logout';

const Navbar = () => {
    const [authorized, setAuthorized] = useState(false);
    const [openPanel, setOpenPanel] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;

    const adminButtonConfig = [
        { label: 'Dashboard', path: '/dashboard', minAccess: 1 },
        { label: 'Atrium',    path: '/atrium',    minAccess: 1 },
        { label: 'Chat Room', path: '/chat',      minAccess: 1 },
    ];

    useEffect(() => {
        // Check for token in URL parameters (from OAuth redirect)
        const urlParams = new URLSearchParams(location.search);
        const tokenFromUrl = urlParams.get('token');
        
        if (tokenFromUrl) {
            localStorage.setItem('token', tokenFromUrl);
            // Remove token from URL
            window.history.replaceState({}, document.title, window.location.pathname);
            window.location.reload(); // Refresh to update state
        }

        const currentToken = localStorage.getItem('token');
        if (currentToken) {
            try {
                const decoded = jwtDecode(currentToken);
                const currentTime = Math.floor(Date.now() / 1000);
                if (decoded.exp && decoded.exp > currentTime) {
                    setAuthorized(true);
                } else {
                    localStorage.removeItem('token');
                    setAuthorized(false);
                }
            } catch (error) {
                console.error('Invalid token:', error);
                localStorage.removeItem('token');
                setAuthorized(false);
            }
        }
    }, [location, token]);

    const profileClick = () => {
        if (!authorized) {
            navigate("/login-admin");
        } else {
            setOpenPanel(!openPanel)
        }
    }

    const navigateTo = (path) => {
        if (!authorized) {
            navigate('/login-admin');
        } else {
            navigate(path);
        }
    };

    return (
        <div>
            <div className="profile-icon">
                <img 
                    src={profileicon} 
                    alt="User Profile" 
                    onClick={profileClick} 
                />
                {openPanel && (
                    <div className='profile-background'>
                        <div className='profile-panel'>
                            {adminButtonConfig
                                .filter(({ minAccess, maxAccess }) => 
                                    accessLevel >= minAccess && 
                                    (maxAccess === undefined || accessLevel <= maxAccess)
                                )
                                .map(({ label, path }) => (
                                    <button 
                                        key={label} 
                                        className='industrial-button' 
                                        onClick={() => {
                                            setOpenPanel(false);
                                            navigateTo(path);
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))
                            }
                            
                            <Logout />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Navbar;