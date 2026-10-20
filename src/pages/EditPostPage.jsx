import { Link, useNavigate, useParams } from 'react-router-dom';
import { Lock, ImageOff } from 'lucide-react';
import EmptyState from '../components/common/EmptyState.jsx';
import PostForm from '../components/posts/PostForm.jsx';
import PostGrid from '../components/posts/PostGrid.jsx';
import { usePosts } from '../hooks/usePosts.js';
import { CURRENT_USER_ID } from '../data/mockCreators.js';
import { useAuth } from '../context/AuthContext.jsx';
import { postsApiEnabled } from '../services/postService.js';

export default function EditPostPage() {
  const { user } = useAuth();
  const { postId } = useParams();
  const { status, postsById, updatePost } = usePosts();
  const navigate = useNavigate();
  const post = postsById.get(postId);

  if (status === 'loading') return <PostGrid loading />;
  if (!post) return <EmptyState icon={ImageOff} title="This work isn’t available" action={<Link className="btn btn--primary" to="/">Back to the feed</Link>} />;
  // UI courtesy only. The real ownership check belongs on the server.
  if (postsApiEnabled ? post.creatorId !== user?.id : post.creatorId !== CURRENT_USER_ID) return <EmptyState icon={Lock} title="You can only edit your own works" action={<Link className="btn btn--ghost" to={`/post/${post.id}`}>View the work</Link>} />;

  async function handleSubmit(data) {
    const changes = {
      title: data.title.trim(),
      description: data.description.trim(),
      category: data.category,
      tags: data.tags,
      ...(post.workType === 'inspired' ? { inspirationNote: data.inspirationNote.trim() } : {}),
      ...(postsApiEnabled ? { media: data.media } : {}),
    };
    await updatePost(post.id, changes);
    navigate(`/post/${post.id}`, { state: { notice: 'Changes saved.' } });
  }

  return (
    <>
      <header className="page-header"><h1>Edit “{post.title}”</h1></header>
      <div className="form-page"><PostForm mode="edit" initialPost={post} onSubmit={handleSubmit} /></div>
    </>
  );
}
