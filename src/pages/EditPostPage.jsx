import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Lock, ImageOff } from 'lucide-react';
import EmptyState from '../components/common/EmptyState.jsx';
import PostForm from '../components/posts/PostForm.jsx';
import PostGrid from '../components/posts/PostGrid.jsx';
import { usePosts } from '../hooks/usePosts.js';
import { useAuth } from '../context/AuthContext.jsx';
import { postsApiEnabled } from '../services/postService.js';
import '../styles/EditPostPage.css';

export default function EditPostPage() {
  const { user } = useAuth();
  const { postId } = useParams();
  const { status, postsById, creatorsById, updatePost, deletePost } = usePosts();
  const navigate = useNavigate();
  const location = useLocation();
  const post = postsById.get(postId);
  const requestedReturnTo = location.state?.returnTo;
  const returnTo = typeof requestedReturnTo === 'string'
    && requestedReturnTo.startsWith('/')
    && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : null;

  if (status === 'loading') return <PostGrid loading />;
  if (!post) return <EmptyState icon={ImageOff} title="This work isn’t available" action={<Link className="btn btn--primary" to="/">Back to the feed</Link>} />;
  // UI courtesy only. The real ownership check belongs on the server.
  if (user?.id && post.creatorId !== user.id) return <EmptyState icon={Lock} title="You can only edit your own works" action={<Link className="btn btn--ghost" to={`/post/${post.id}`}>View the work</Link>} />;

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
    const postPath = `/post/${post.id}`;
    if (returnTo?.split(/[?#]/, 1)[0] === postPath && window.history.state?.idx > 0) {
      navigate(-1);
      return;
    }
    navigate(postPath, { replace: true, state: { notice: 'Changes saved.' } });
  }

  async function handleDelete() {
    const result = await deletePost(post.id);
    navigate('/', {
      state: {
        notice: result?.cleanupPending
          ? 'Your work was deleted, but its Cloudinary media cleanup is still pending.'
          : 'Work deleted successfully.',
      },
    });
  }

  function handleCancel() {
    if (returnTo && window.history.state?.idx > 0) {
      navigate(-1);
      return;
    }

    const creator = creatorsById.get(post.creatorId);
    const profilePath = `/profile/${encodeURIComponent(creator?.username ?? post.creatorId)}`;
    navigate(returnTo ?? profilePath, { replace: true });
  }

  return (
    <section className="edit-post" aria-labelledby="edit-post-title">
      <header className="edit-post__header">
        <button className="edit-post__back" type="button" onClick={handleCancel}>← Back</button>
        <p className="edit-post__eyebrow">Your studio</p>
        <h1 id="edit-post-title">Edit your artwork</h1>
        <p className="edit-post__intro">Update the details or images for <strong>{post.title}</strong>. Your changes appear once they have been saved.</p>
      </header>
      <div className="edit-post__panel">
        <PostForm
          mode="edit"
          initialPost={post}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      </div>
    </section>
  );
}
