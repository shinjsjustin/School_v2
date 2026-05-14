# AGENTS.md — Shop Template

A guide for AI agents and developers extending this template.

---

## Directory Tree

```
shop-template/
├── package.json                    # Root: server deps + dev scripts
├── .env.example                    # Root env vars (DB, JWT, session)
├── .gitignore
├── AGENTS.md                       # ← you are here
└── src/
    ├── server.js                   # Express entry point
    ├── db/
    │   └── db.js                   # MySQL2 pool (promise-based)
    ├── middleware/
    │   └── isAuth.js               # JWT Bearer token validator
    └── routes/
        ├── auth.js                 # POST /api/auth/register, /api/auth/login
        └── user.js                 # GET  /api/user/me  (protected)
    └── client/                     # React app (Create React App)
        ├── package.json
        ├── .env.example            # REACT_APP_URL
        └── src/
            ├── index.js            # ReactDOM root + App + BrowserRouter
            ├── index.css           # CSS custom properties (design tokens)
            ├── routes.js           # Flat route array — all pages defined here
            ├── reportWebVitals.js
            ├── config/
            │   ├── ProtectedRoute.js   # Redirects to /login if no valid JWT
            │   └── UnprotectedRoute.js # Redirects to /dashboard if logged in
            └── components/
                ├── Navbar.js           # Profile icon + dropdown panel
                ├── Home.js             # Public landing page
                ├── Authentication/
                │   ├── Login.js
                │   ├── Register.js
                │   ├── Logout.js
                │   ├── AccessDenied.js
                │   └── PostRegisterPage.js
                ├── Dashboard/
                │   └── Dashboard.js    # Protected home after login
                └── Styling/
                    ├── Form.css        # Auth/form container styles
                    ├── Home.css        # Landing page + .industrial-button
                    └── Navbar.css      # Profile icon + dropdown panel
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18 (Create React App) | Bootstrapped quickly, widely understood |
| Routing (client) | React Router DOM v6 | Declarative, nested routes, loaders |
| HTTP client | `fetch` (native) | No extra deps; consistent with browser APIs |
| Auth token storage | `localStorage` | Simple; survives page refresh |
| Token decoding | `jwt-decode` | Reads JWT payload without a round-trip |
| Backend | Express.js | Lightweight, large ecosystem |
| Database | MySQL2 (promise pool) | Matches the original codebase |
| Password hashing | bcryptjs | Industry standard for at-rest credentials |
| JWT signing | jsonwebtoken | Stateless auth; 8h expiry |
| Session (optional) | express-session | Required if you add OAuth (passport) |
| Environment config | dotenv | Keeps secrets out of source |

---

## Auth Flow

```
1. User fills Register form
   └─ POST /api/auth/register  { name, email, password }
      ├─ bcrypt.hash(password, 10)
      ├─ INSERT INTO admin (access_level = 0)   ← pending approval
      └─ 201 → redirect to /post-register

2. Admin grants access_level >= 1 (out of band — direct DB or admin UI)

3. User fills Login form
   └─ POST /api/auth/login  { email, password }
      ├─ SELECT * FROM admin WHERE email = ?
      ├─ bcrypt.compare(password, hash)
      └─ jwt.sign({ email, id, access }, JWT_SECRET, { expiresIn: '8h' })
         └─ 200 { token } → localStorage.setItem('token', token)
                          → navigate('/dashboard')

4. Protected API calls
   └─ fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      └─ isAuth middleware: jwt.verify(token, JWT_SECRET)
         ├─ 401 if token missing
         ├─ 403 if token invalid/expired
         └─ sets req.user = decoded payload → next()

5. Logout
   └─ localStorage.removeItem('token') → navigate('/')
```

---

## How to Add a New Page

### Client side

1. Create the component: `src/client/src/components/FeatureName/FeatureName.js`
2. Import it in `src/client/src/routes.js`
3. Add an entry to the routes array:
   ```js
   { path: '/feature', element: <ProtectedRoute><FeatureName /></ProtectedRoute> }
   ```
   - Wrap with `<ProtectedRoute>` for JWT-gated pages
   - Wrap with `<UnprotectedRoute>` for pages that redirect logged-in users away
   - No wrapper = fully public

### Server side (new API route)

1. Create `src/routes/featureName.js` following the pattern in `src/routes/user.js`
2. Import and mount it in `src/server.js`:
   ```js
   const featureRoutes = require('./routes/featureName');
   app.use('/api/feature', isAuth, featureRoutes);   // protected
   // or
   app.use('/api/feature', featureRoutes);             // public
   ```
3. Call it from the frontend:
   ```js
   fetch(`${process.env.REACT_APP_URL}/feature/endpoint`, {
       headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
   })
   ```

---

## CSS Variable System

All design tokens live in `:root` in `src/client/src/index.css`. Component CSS
files reference variables by name — change a token once, it applies everywhere.

Key groups:

```css
--color-primary / --color-primary-hover / --color-primary-active  /* main action color */
--color-accent  / --color-accent-hover                             /* secondary action */
--color-danger                                                     /* errors */
--bg-dark / --bg-card / --bg-alt / --bg-input                     /* backgrounds */
--text-primary / --text-secondary / --text-muted / --text-white   /* type */
--space-xs through --space-xl                                       /* spacing scale */
--radius-sm / --radius-md / --radius-lg                            /* border radius */
--shadow-sm / --shadow-md / --shadow-lg                            /* box shadows */
--font-sm / --font-base / --font-md / --font-lg / --font-xl        /* type scale */
```

To theme the app, only edit the `:root` block. Do not hardcode color or spacing
values in component CSS — always reference a variable.

---

## Conventions

- **Components** — PascalCase filenames, one component per file, under `src/components/<Domain>/`
- **CSS** — one `.css` per domain in `src/components/Styling/`, imported by the component that owns it
- **Routes** — all client routes defined in `routes.js` as a flat array; never use `<Route>` directly in components
- **API calls** — always use `process.env.REACT_APP_URL` as the base; never hardcode `localhost`
- **Auth header** — always `Authorization: Bearer ${localStorage.getItem('token')}`
- **Error handling** — handle every HTTP status code explicitly; never silently swallow errors
- **Immutability** — use spread `{ ...obj, field: value }` for state updates; never mutate state directly
- **No console.log in production** — remove debug logs before committing