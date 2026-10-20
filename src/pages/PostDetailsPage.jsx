import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart, MessageCircle, Pencil, Plus, Repeat2, SearchX, Trash2 } from 'lucide-react';
import ArtworkImage from '../components/common/ArtworkImage.jsx';
import Avatar from '../components/common/Avatar.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import AuthenticityBadge from '../components/attribution/AuthenticityBadge.jsx';
import AttributionLabel from '../components/attribution/AttributionLabel.jsx';
import { usePosts } from '../hooks/usePosts.js';
import { getCategoryLabel } from '../data/categories.js';
import { CURRENT_USER_ID } from '../data/mockCreators.js';
import { useAuth } from '../context/AuthContext.jsx';
import { postsApiEnabled } from '../services/postService.js';
import { cleanHandle, resolveAuthor } from '../utils/creators.js';
import { formatDate } from '../utils/format.js';
import '../styles/pages.css';
import '../styles/PostDetailsPage.css';

export default function PostDetailsPage() {
  const { user } = useAuth();
  const { postId } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const {
    status, postsById, creatorsById, commentsByPostId, likedIds, loadedCommentPosts,
    toggleLike, toggleRepost, addComment, deleteComment, deletePost, getInspiredWorks, loadPostById, loadComments,
  } = usePosts();

  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [likeError, setLikeError] = useState('');
  const [repostError, setRepostError] = useState('');
  const [commentLoadError, setCommentLoadError] = useState('');
  const [inspiredLoadError, setInspiredLoadError] = useState('');
  const [sending, setSending] = useState(false);
  const [liking, setLiking] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [inspiredLoading, setInspiredLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [inspiredWorks, setInspiredWorks] = useState([]);

  const post = postsById.get(postId);
  const mediaItems = post?.mediaItems?.length
    ? post.mediaItems
    : post?.media?.url ? [post.media] : [];
  const postComments = commentsByPostId.get(postId) ?? [];

  useEffect(() => {
    if (status !== 'ready' || post || !postsApiEnabled) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');
    loadPostById(postId)
      .catch((requestError) => {
        if (!cancelled) setDetailError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [status, post, postId, loadPostById]);

  useEffect(() => {
    if (!post || loadedCommentPosts.has(post.id)) return;
    let cancelled = false;
    setCommentsLoading(true);
    setCommentLoadError('');
    loadComments(post.id)
      .catch((requestError) => {
        if (!cancelled) setCommentLoadError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => { cancelled = true; };
  }, [post, loadedCommentPosts, loadComments]);

  useEffect(() => {
    if (!post) return;
    let cancelled = false;
    setInspiredLoading(true);
    setInspiredLoadError('');
    getInspiredWorks(post.id)
      .then((works) => { if (!cancelled) setInspiredWorks(works); })
      .catch((requestError) => { if (!cancelled) setInspiredLoadError(requestError.message); })
      .finally(() => { if (!cancelled) setInspiredLoading(false); });
    return () => { cancelled = true; };
  }, [post?.id, getInspiredWorks]);

  // Jump to comments when arriving from the comment icon (/post/:id#comments)
  useEffect(() => {
    if (status === 'ready' && post && hash === '#comments') {
      document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [status, post, hash]);

  if (status === 'loading' || detailLoading) {
    return (
      <div className="page-wrap">
        <div className="pd pd--loading" aria-busy="true">
          <div className="pd__skeleton" />
          <div className="pd__skeleton pd__skeleton--short" />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="page-wrap page-wrap--narrow">
        <EmptyState
          icon={SearchX}
          title={detailError ? 'Could not load this work' : 'This work isn’t available'}
          action={<Link className="outline-btn" to="/explore">Back to Explore</Link>}
        >
          {detailError || 'It may have been deleted, or the link is incorrect.'}
        </EmptyState>
      </div>
    );
  }

  const creator = creatorsById.get(post.creatorId);
  const handle = cleanHandle(creator);
  const liked = likedIds.has(post.id);
  const isOwn = postsApiEnabled ? post.creatorId === user?.id : post.creatorId === CURRENT_USER_ID;
  const date = formatDate(post.createdAt, navigator.language);

  const submitComment = async (event) => {
    event.preventDefault();
    if (!text.trim()) { setError('Write something before posting.'); return; }
    setSending(true);
    try {
      await addComment(post.id, text.trim());
      setText('');
      setError('');
    } catch {
      setError('Could not post your comment.');
    } finally {
      setSending(false);
    }
  };

  const submitLike = async () => {
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
  };

  const submitRepost = async () => {
    if (reposting) return;
    setReposting(true);
    setRepostError('');
    try {
      await toggleRepost(post.id);
    } catch (requestError) {
      setRepostError(requestError.message || 'Could not update repost. Please try again.');
    } finally {
      setReposting(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deletePost(post.id);
      navigate('/', { replace: true });
    } catch {
      setDeleting(false);
      setConfirming(false);
      setError('Could not delete this work.');
    }
  };

  return (
    <div className="page-wrap page-wrap--medium">
      <button type="button" className="pd__back" onClick={() => navigate(-1)}>
        <ArrowLeft size={18} aria-hidden="true" /> Back
      </button>

      <article className="pd">
        {/* Artwork */}
        <div className="pd__media">
          {mediaItems.length ? mediaItems.map((media, index) => (
            media.type === 'video'
              ? <video key={`${media.url}-${index}`} src={media.url} controls />
              : media.type === 'audio'
                ? <audio key={`${media.url}-${index}`} src={media.url} controls />
                : <ArtworkImage key={`${media.url}-${index}`} post={{ ...post, media }} />
          )) : <ArtworkImage post={post} />}
        </div>

        {/* Information */}
        <div className="pd__info">
          <Link to={`/profile/${creator?.username ?? post.creatorId}`} className="pd__creator">
            <Avatar creator={creator} size={44} />
            <span>
              <strong>{creator?.name ?? 'Unknown creator'}</strong>
              {handle && <small>@{handle}</small>}
            </span>
          </Link>

          <h1 className="pd__title">{post.title}</h1>
          <p className="pd__meta">{getCategoryLabel(post.category)} · {date}</p>
          <p className="pd__desc">{post.description}</p>

          {post.tags?.length > 0 && (
            <ul className="pd__tags">
              {post.tags.map((t) => <li key={t}>#{t}</li>)}
            </ul>
          )}

          <div className="pd__badge"><AuthenticityBadge post={post} /></div>
          <AttributionLabel post={post} />

          {/* Actions */}
          <div className="pd__actions">
            <button
              type="button"
              className={`pd__btn${liked ? ' is-liked' : ''}`}
              onClick={submitLike}
              disabled={liking || !postsApiEnabled || !user}
              aria-pressed={liked}
              aria-label={liked ? 'Unlike' : 'Like'}
            >
              <Heart size={20} aria-hidden="true" /> {post.likesCount ?? '—'}
            </button>
            <a href="#comments" className="pd__btn" aria-label={`${post.commentsCount ?? 'not connected'} comments`}>
              <MessageCircle size={20} aria-hidden="true" /> {post.commentsCount ?? '—'}
            </a>
            <button type="button" className={`pd__btn${post.repostedByMe ? ' is-reposted' : ''}`} onClick={submitRepost} disabled={reposting || !postsApiEnabled || !user} aria-pressed={Boolean(post.repostedByMe)} aria-label={`${post.repostedByMe ? 'Undo repost' : 'Repost'} (${post.repostsCount ?? 'not connected'} reposts)`}>
              <Repeat2 size={18} aria-hidden="true" /> {post.repostsCount ?? '—'}
            </button>
            <Link to="/create" state={{ sourcePostId: post.id }} className="pd__create">
              <Plus size={18} aria-hidden="true" /> Recreate
            </Link>
          </div>
          {likeError && <p className="field-error" role="alert">{likeError}</p>}
          {repostError && <p className="field-error" role="alert">{repostError}</p>}
          {post.repostedByMe && <p className="muted">You reposted this work by {creator?.name ?? 'the original creator'}.</p>}

          {isOwn && (
            <div className="pd__owner">
              <Link to={`/post/${post.id}/edit`} className="outline-btn"><Pencil size={16} aria-hidden="true" /> Edit</Link>
              <button type="button" className="outline-btn pd__delete" onClick={() => setConfirming(true)}>
                <Trash2 size={16} aria-hidden="true" /> Delete
              </button>
            </div>
          )}

          {confirming && (
            <div className="pd__confirm" role="alertdialog" aria-label="Confirm delete">
              <p>Delete “{post.title}”? Works inspired by it will show “source no longer available”.</p>
              <div>
                <button type="button" className="outline-btn" onClick={() => setConfirming(false)} disabled={deleting}>Cancel</button>
                <button type="button" className="solid-btn pd__danger" onClick={confirmDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete work'}
                </button>
              </div>
            </div>
          )}

          {/* Comments, Instagram style */}
          <section className="pd__comments" id="comments" aria-label="Comments">
            <h2>Comments <span>{post.commentsCount ?? '—'}</span></h2>
            {commentsLoading && <p aria-busy="true">Loading comments…</p>}
            {commentLoadError && <p className="field-error" role="alert">{commentLoadError}</p>}
            {!commentsLoading && !commentLoadError && postComments.length === 0 && <p className="pd__none">No comments yet. Start the conversation.</p>}
            <ul>
              {postComments.map((c) => {
                const a = resolveAuthor(c, creatorsById);
                const name = c.author?.displayName ?? a.label;
                const username = c.author?.username ?? a.creator?.username;
                return (
                  <li key={c.id}>
                    <Avatar creator={c.author ? { name, avatarUrl: c.author.avatarUrl } : a.creator} size={32} />
                    <p>
                      {username
                        ? <Link to={`/profile/${username}`}>{name}</Link>
                        : <strong>{name}</strong>}{' '}
                      {c.text}
                      <small className="muted"> · {formatDate(c.createdAt, navigator.language)}</small>
                    </p>
                    {user?.id === (c.userId ?? c.authorId) && (
                      <button type="button" className="outline-btn" onClick={async () => {
                        try {
                          await deleteComment(post.id, c.id);
                        } catch (requestError) {
                          setCommentLoadError(requestError.message);
                        }
                      }}>Delete</button>
                    )}
                  </li>
                );
              })}
            </ul>

            <form className="pd__form" onSubmit={submitComment} noValidate>
              <label className="sr-only" htmlFor="comment">Add a comment</label>
              <input
                id="comment" type="text" value={text} maxLength={300} placeholder="Add a comment…"
                onChange={(e) => { setText(e.target.value); setError(''); }}
                aria-invalid={Boolean(error)}
              />
              <button type="submit" disabled={sending || !text.trim() || !postsApiEnabled || !user}>Post</button>
            </form>
            {error && <p className="field-error" role="alert">{error}</p>}
            {!user && <p className="muted"><Link to="/login">Sign in</Link> to comment.</p>}
          </section>
        </div>
      </article>

      {/* Inspired works */}
      <section className="pd__inspired" aria-labelledby="inspired-title">
        <p className="eyebrow">Spark</p>
        <h2 id="inspired-title">Inspired works</h2>
        {inspiredLoading && <p aria-busy="true">Loading inspired works…</p>}
        {inspiredLoadError && <p className="field-error" role="alert">{inspiredLoadError}</p>}
        {inspiredWorks.length ? (
          <ul className="pd__grid">
            {inspiredWorks.map((w) => {
              const wc = creatorsById.get(w.creatorId);
              return (
                <li key={w.id}>
                  <Link to={`/post/${w.id}`} className="pd__tile">
                    <span className="pd__tile-img"><ArtworkImage post={w} /></span>
                    <strong>{w.title}</strong>
                    <small>{wc?.name ?? 'Unknown creator'} · {getCategoryLabel(w.category)}</small>
                    <small>Inspired by “{post.title}”</small>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : !inspiredLoading && !inspiredLoadError ? (
          <p className="pd__none">
            Nothing has been inspired by this work yet. <Link to="/create" state={{ sourcePostId: post.id }}>Be the first to respond.</Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}