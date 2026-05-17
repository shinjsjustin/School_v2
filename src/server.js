
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '../.env')
});

console.log("DB_HOST:", process.env.DB_HOST);

const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const chatRoutes = require('./routes/chat');
const atriumRoutes = require('./routes/atrium');

const isAuth = require('./middleware/isAuth');

const app = express();

// Allow requests from the React dev server.
// In production the server serves the built React app directly, so CORS
// is only needed during development.
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
}));

app.use(bodyParser.json());

// Session is used by OAuth strategies (e.g. passport-google-oauth20).
// If you're not adding OAuth, you can remove this block.
app.use(session({
    // TODO: SESSION_SECRET must be set in .env
    secret: process.env.SESSION_SECRET || 'TODO_replace_with_strong_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
    },
}));

// ── Public routes (no auth required) ────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ── Protected routes (JWT required via isAuth middleware) ────────────────────
// All routes mounted after isAuth will require a valid Bearer token.
app.use('/api/user', isAuth, userRoutes);
app.use('/api/chat', isAuth, chatRoutes);
app.use('/api/atrium', isAuth, atriumRoutes);

// ── Serve the built React app in production ──────────────────────────────────
// During development `npm run dev` runs the React dev server separately.
app.use(express.static(path.join(__dirname, 'client/build')));

// Catch-all: send any unmatched GET to the React app so client-side routing works.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    console.error(`404: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
