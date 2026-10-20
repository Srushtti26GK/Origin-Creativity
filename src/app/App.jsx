import { RouterProvider } from 'react-router-dom';
import { PostProvider } from '../context/PostContext.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { router } from './router.jsx';

export default function App() {
  return (
    <AuthProvider>
      <PostProvider>
        <RouterProvider router={router} />
      </PostProvider>
    </AuthProvider>
  );
}
