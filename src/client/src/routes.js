import { Navigate } from 'react-router-dom';

import Login from './components/Authentication/Login';
import Register from './components/Authentication/Register';
import AccessDenied from './components/Authentication/AccessDenied';
import PostRegisterPage from './components/Authentication/PostRegisterPage';
import ChatRoom from './components/ChatRoom/ChatRoom';

// Atrium · personal AI tutor screens
import AtriumDashboard from './components/Atrium/Dashboard';
import AtriumRoadmap from './components/Atrium/Roadmap';
import AtriumSchool from './components/Atrium/School';
import AtriumTeacher from './components/Atrium/Teacher';
import AtriumTest from './components/Atrium/Test';

import ProtectedRoute from './config/ProtectedRoute';
import UnprotectedRoute from './config/UnprotectedRoute';

// Route definitions — consumed by index.js via BrowserRouter + Routes.
// Each entry: { path: string, element: JSX }
//
// To add a new page:
//   1. Create the component under src/components/
//   2. Import it here
//   3. Add an entry to this array, wrapping with ProtectedRoute or
//      UnprotectedRoute as appropriate
const routes = [
    // Root — logged-in users land directly in the Atrium; everyone else goes to /login.
    { path: '/',              element: <ProtectedRoute><Navigate to="/atrium" replace /></ProtectedRoute> },
    { path: '/access-denied', element: <AccessDenied /> },
    { path: '/post-register', element: <PostRegisterPage /> },

    // Auth pages — redirect to /atrium if already logged in
    { path: '/login',    element: <UnprotectedRoute><Login /></UnprotectedRoute> },
    { path: '/register', element: <UnprotectedRoute><Register /></UnprotectedRoute> },

    // Protected pages — redirect to /login if no valid token
    // requiredAccessLevel defaults to 1 (approved user)
    { path: '/chat',      element: <ProtectedRoute><ChatRoom /></ProtectedRoute> },

    // Atrium · personal AI tutor
    // TODO: tighten access controls (e.g. requiredAccessLevel) once roles
    // are defined for tutors / admins.
    { path: '/atrium',                                  element: <ProtectedRoute><AtriumDashboard /></ProtectedRoute> },
    { path: '/atrium/roadmap',                          element: <ProtectedRoute><AtriumRoadmap /></ProtectedRoute> },
    { path: '/atrium/school/:schoolId',                 element: <ProtectedRoute><AtriumSchool /></ProtectedRoute> },
    { path: '/atrium/school/:schoolId/topic/:topicId',  element: <ProtectedRoute><AtriumTeacher /></ProtectedRoute> },
    { path: '/atrium/school/:schoolId/test/:sectionId', element: <ProtectedRoute><AtriumTest /></ProtectedRoute> },
];

export default routes;
