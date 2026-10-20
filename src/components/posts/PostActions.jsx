import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Repeat2 } from 'lucide-react';
import { usePosts } from '../../hooks/usePosts.js';
import { postsApiEnabled } from '../../services/postService.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function PostActions({ post }) {
  const { likedIds, toggleLike, toggleRepost, commentCounts } = usePosts();
  const { user } = useAuth();
  const [likeError, setLikeError] = useState('');
  const [repostError, setRepostError] = useState('');
  const [liking, setLiking] = useState(false);
  const [reposting, setReposting] = useState(false);
  const liked = likedIds.has(post.id);
  const commentCount = commentCounts[post.id];

  async function handleLike() {
    if (liking) return;
    setLiking(true);
    setLikeError('');
    try {
      await toggleLike(post.id);
    } catch {
      setLikeError('Could not update your like. Please try again.');
    } finally {
      setLiking(false);
    }
  }

  async function handleRepost() {
    if (reposting) return;
    setReposting(true);
    setRepostError('');
    try {
      await toggleRepost(post.id);
    } catch (error) {
      setRepostError(error.message || 'Could not update repost. Please try again.');
    } finally {
      setReposting(false);
    }
  }

  return (
    <div className="post-actions">
      <button type="button" className={`action${liked ? ' is-liked' : ''}`} aria-pressed={liked} aria-label={`${liked ? 'Unlike' : 'Like'} (${post.likesCount ?? 'not connected'} likes)`} onClick={handleLike} disabled={liking || !postsApiEnabled || !user}>
        <Heart size={20} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" /><span>{post.likesCount ?? '—'}</span>
      </button>
      <Link to={`/post/${post.id}#comments`} className="action" aria-label={`${commentCount ?? 'not connected'} comments`}>
        <MessageCircle size={20} aria-hidden="true" /><span>{commentCount ?? '—'}</span>
      </Link>
      <button type="button" className={`action${post.repostedByMe ? ' is-reposted' : ''}`} aria-pressed={Boolean(post.repostedByMe)} aria-label={`${post.repostedByMe ? 'Undo repost' : 'Repost'} (${post.repostsCount ?? 'not connected'} reposts)`} onClick={handleRepost} disabled={reposting || !postsApiEnabled || !user}>
        <Repeat2 size={19} aria-hidden="true" /><span>{post.repostsCount ?? '—'}</span>
      </button>
      {likeError && <p className="field-error" role="alert">{likeError}</p>}
      {repostError && <p className="field-error" role="alert">{repostError}</p>}
      {postsApiEnabled && !user && <Link to="/login" className="muted">Sign in to interact</Link>}
    </div>
  );
}
