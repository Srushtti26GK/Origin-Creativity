import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../common/Avatar.jsx';
import { usePosts } from '../../hooks/usePosts.js';
import { validateComment } from '../../utils/validators.js';
import { formatDate } from '../../utils/format.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function CommentSection({ postId }) {
  const { commentsByPostId, creatorsById, loadedCommentPosts, loadComments, addComment, deleteComment } = usePosts();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const list = [...(commentsByPostId.get(postId) ?? [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  useEffect(() => {
    if (loadedCommentPosts.has(postId)) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    loadComments(postId).catch((requestError) => {
      if (!cancelled) setLoadError(requestError.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [postId, loadedCommentPosts, loadComments]);

  async function handleSubmit(event) {
    event.preventDefault();
    const message = validateComment(text);
    if (message) { setError(message); return; }
    setSending(true);
    try {
      await addComment(postId, text);
      setText('');
      setError('');
    } catch {
      setError('Could not post your comment. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="comments" className="section" aria-labelledby="comments-heading">
      <h2 id="comments-heading">Comments <span className="count">{list.length}</span></h2>
      {!loading && !loadError && list.length === 0 && <p className="muted">No comments yet. Say what this work made you notice.</p>}
      {loading && <p aria-busy="true">Loading comments…</p>}
      {loadError && <p className="field__error" role="alert">{loadError}</p>}
      <ul className="comments">
        {list.map((c) => {
          const author = creatorsById.get(c.authorId ?? c.userId) ?? (c.author ? {
            id: c.userId,
            username: c.author.username,
            name: c.author.displayName,
            avatarUrl: c.author.avatarUrl,
          } : null);
          return (
            <li key={c.id}>
              <Avatar creator={author} size={32} />
              <div>
                <p>
                  {author?.username
                    ? <Link to={`/profile/${author.username}`}><strong>{author.name}</strong></Link>
                    : <strong>{author?.name ?? 'Unknown creator'}</strong>}{' '}
                  <span className="muted">{formatDate(c.createdAt)}</span>
                </p>
                <p>{c.text}</p>
                {user?.id === (c.userId ?? c.authorId) && (
                  <button type="button" className="btn btn--ghost" onClick={async () => {
                    try { await deleteComment(postId, c.id); } catch (requestError) { setError(requestError.message); }
                  }}>Delete</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <form className="comment-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor={`comment-${postId}`} className="sr-only">Add a comment</label>
        <input id={`comment-${postId}`} value={text} maxLength={300} placeholder="Add a comment…" aria-invalid={Boolean(error)} aria-describedby={error ? `comment-error-${postId}` : undefined} onChange={(e) => { setText(e.target.value); setError(''); }} />
        <button className="btn btn--primary" type="submit" disabled={sending || !user}>{sending ? 'Posting…' : 'Post'}</button>
        {error && <p id={`comment-error-${postId}`} className="field__error" role="alert">{error}</p>}
      </form>
      {!user && <p className="muted"><Link to="/login">Sign in</Link> to comment.</p>}
    </section>
  );
}
