import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout.jsx';
import HomePage from '../pages/HomePage.jsx';
import ExplorePage from '../pages/ExplorePage.jsx';
import CreatePostPage from '../pages/CreatePostPage.jsx';
import EditPostPage from '../pages/EditPostPage.jsx';
import PostDetailsPage from '../pages/PostDetailsPage.jsx';
import ProfilePage from '../pages/ProfilePage.jsx';
import NotificationsPage from '../pages/NotificationsPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import AuthPage from '../pages/AuthPage.jsx';
import { API_BASE_URL } from '../services/apiConfig.js';
import { useAuth } from '../context/AuthContext.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (!API_BASE_URL) return children;
  if (loading) return <div className="page-wrap" aria-busy="true">Checking your session…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/login', element: <AuthPage mode="login" /> },
      { path: '/signup', element: <AuthPage mode="signup" /> },
      { path: '/', element: <HomePage /> },
      { path: '/explore', element: <ExplorePage /> },
      { path: '/create', element: <RequireAuth><CreatePostPage /></RequireAuth> },
      { path: '/notifications', element: <NotificationsPage /> },
      { path: '/post/:postId', element: <PostDetailsPage /> },
      { path: '/post/:postId/edit', element: <RequireAuth><EditPostPage /></RequireAuth> },
      { path: '/profile/:creatorId', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
