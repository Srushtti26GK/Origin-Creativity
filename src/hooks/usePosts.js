import { useContext } from 'react';
import { PostContext } from '../context/PostContext.jsx';

export function usePosts() {
  const context = useContext(PostContext);
  if (!context) throw new Error('usePosts must be used inside <PostProvider>.');
  return context;
}
