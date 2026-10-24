import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BadgeCheck, Heart, MessageCircle, Pencil, Plus, Repeat2, Trash2 } from 'lucide-react';
import ArtworkImage from '../common/ArtworkImage.jsx';
import PostImageViewer from './PostImageViewer.jsx';
import Avatar from '../common/Avatar.jsx';
import AuthenticityBadge from '../attribution/AuthenticityBadge.jsx';
import AttributionLabel from '../attribution/AttributionLabel.jsx';
import { usePosts } from '../../hooks/usePosts.js';
import { getCategoryLabel } from '../../data/categories.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { postsApiEnabled } from '../../services/postService.js';
import { cleanHandle, resolveAuthor } from '../../utils/creators.js';
import { formatDate } from '../../utils/format.js';
import '../../styles/HomeFeed.css';

export default function FeedPost({ post }) {
  const location = useLocation();
  const { creatorsById, commentsByPostId, likedIds, commentCounts, loadedCommentPosts, toggleLike, toggleRepost, loadComments, addComment, deleteComment } = usePosts();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [likeError, setLikeError] = useState('');
  const [repostError, setRepostError] = useState('');
  const [commentLoadError, setCommentLoadError] = useState('');
  const [deletingCommentIds, setDeletingCommentIds] = useState(() => new Set());
  const [commentDeleteErrors, setCommentDeleteErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [liking, setLiking] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const inputRef = useRef(null);
  const pendingCommentDeletes = useRef(new Set());

  const creator = creatorsById.get(post.creatorId) ?? post.creator ?? null;
  const reposter = post.repostedBy
    ? creatorsById.get(post.repostedBy.id) ?? {
      id: post.repostedBy.id,
      username: post.repostedBy.username,
      name: post.repostedBy.displayName,
      avatarUrl: post.repostedBy.avatarUrl,
    }
    : null;
  const liked = likedIds.has(post.id);
  const isOwn = Boolean(user?.id && post.creatorId === user.id);
  const verified = post.authenticity?.verificationStatus === 'verified';
  const handle = cleanHandle(creator);

  const postComments = commentsByPostId.get(post.id) ?? [];
  const commentCount = commentCounts[post.id];
  const visibleComments = expanded ? postComments : postComments.slice(-2);
  const hiddenCount = commentCount - visibleComments.length;

  const focusComment = async () => {
    setExpanded(true);
    inputRef.current?.focus();
    if (!loadedCommentPosts.has(post.id) && !loadingComments) {
      setLoadingComments(true);
      setCommentLoadError('');
      try {
        await loadComments(post.id);
      } catch (requestError) {
        setCommentLoadError(requestError.message);
      } finally {
        setLoadingComments(false);
      }
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

  const removeComment = async (commentId) => {
    if (pendingCommentDeletes.current.has(commentId)) return;
    pendingCommentDeletes.current.add(commentId);
    setDeletingCommentIds((current) => new Set(current).add(commentId));
    setCommentDeleteErrors((current) => {
      const next = { ...current };
      delete next[commentId];
      return next;
    });
    try {
      await deleteComment(post.id, commentId);
    } catch (requestError) {
      setCommentDeleteErrors((current) => ({
        ...current,
        [commentId]: requestError.message || 'Could not delete this comment. Please try again.',
      }));
    } finally {
      pendingCommentDeletes.current.delete(commentId);
      setDeletingCommentIds((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    }
  };

  return (
    <article className="fpost">
      {reposter && (
        <p className="fpost__repost-attribution">
          <Repeat2 size={15} aria-hidden="true" />
          <Link to={`/profile/${reposter.username}`}>{reposter.name}</Link>
          {' reposted work by '}
          <Link to={`/profile/${creator?.username ?? post.creatorId}`}>{creator?.name ?? 'the original creator'}</Link>
          {' · '}{formatDate(post.repostedBy.createdAt, navigator.language)}
        </p>
      )}
      <header className="fpost__head">
        <Link to={`/profile/${creator?.username ?? post.creatorId}`} className="fpost__who">
          <Avatar creator={creator} size={44} />
          <span className="fpost__text">
            <span className="fpost__name">
              {creator?.name ?? 'Unknown creator'}
              {verified && <BadgeCheck size={16} className="fpost__verified" aria-label="Verified" />}
            </span>
            <span className="fpost__meta">
              {[handle && `@${handle}`, getCategoryLabel(post.category), post.createdAt && formatDate(post.createdAt, navigator.language)].filter(Boolean).join(' · ')}
            </span>
          </span>
        </Link>
        {isOwn && (
          <Link
            to={`/post/${post.id}/edit`}
            state={{ returnTo: `${location.pathname}${location.search}${location.hash}` }}
            className="fpost__edit"
            aria-label={`Edit ${post.title}`}
          >
            <Pencil size={16} aria-hidden="true" /> Edit
          </Link>
        )}
      </header>

      <button type="button" className="fpost__media" aria-label={`View image for ${post.title}`} onClick={() => setImageViewerOpen(true)}>
        <ArtworkImage post={post} />
      </button>
      {imageViewerOpen && <PostImageViewer post={post} creator={creator} onClose={() => setImageViewerOpen(false)} />}

      <div className="fpost__bar">
        <button
          type="button"
          className={`fpost__btn${liked ? ' is-liked' : ''}`}
          onClick={submitLike}
          disabled={liking || !postsApiEnabled || !user}
          aria-pressed={liked}
          aria-label={liked ? 'Unlike' : 'Like'}
        >
          <Heart size={22} aria-hidden="true" />
          <span>{post.likesCount ?? '—'}</span>
        </button>
        {likeError && <span className="fpost__error" role="alert">{likeError}</span>}

        <button type="button" className="fpost__btn" onClick={focusComment} aria-label={`Comment, ${commentCount ?? 'not connected'} so far`}>
          <MessageCircle size={22} aria-hidden="true" />
          <span>{commentCount ?? '—'}</span>
        </button>
        <button type="button" className={`fpost__btn${post.repostedByMe ? ' is-reposted' : ''}`} onClick={submitRepost} disabled={reposting || !postsApiEnabled || !user} aria-pressed={Boolean(post.repostedByMe)} aria-label={`${post.repostedByMe ? 'Undo repost' : 'Repost'}, ${post.repostsCount ?? 'not connected'} reposts`}>
          <Repeat2 size={20} aria-hidden="true" /><span>{post.repostsCount ?? '—'}</span>
        </button>

        <Link to="/create" state={{ sourcePostId: post.id }} className="fpost__create">
          <Plus size={18} aria-hidden="true" /> Recreate
        </Link>
      </div>
      {repostError && <p className="fpost__error" role="alert">{repostError}</p>}

      <div className="fpost__body">
        <h3 className="fpost__title"><Link to={`/post/${post.id}`}>{post.title}</Link></h3>
        <p className="fpost__desc">{post.description}</p>

        <div className="fpost__tags"><AuthenticityBadge post={post} /></div>
        <AttributionLabel post={post} compact />

        {/* Instagram-style comments */}
        <div className="fpost__comments" id={`comments-${post.id}`}>
          {loadingComments && <p aria-busy="true">Loading comments…</p>}
          {commentLoadError && <p className="fpost__error" role="alert">{commentLoadError}</p>}
          {post.repostedByMe && <p className="muted">You reposted this work. Original creator: {creator?.name ?? 'Unknown creator'}.</p>}
          {hiddenCount > 0 && (
            <button type="button" className="fpost__all" onClick={() => setExpanded(true)}>
              View all {postComments.length} comments
            </button>
          )}
          {expanded && postComments.length > 2 && (
            <button type="button" className="fpost__all" onClick={() => setExpanded(false)}>
              Show fewer comments
            </button>
          )}
          <ul className="fpost__clist">
            {visibleComments.map((c) => {
              const author = resolveAuthor(c, creatorsById);
              const authorName = c.author?.displayName ?? author.label;
              const authorUsername = c.author?.username ?? author.creator?.username;
              return (
                <li key={c.id} className="fpost__c">
                  {c.author?.avatarUrl && <Avatar creator={{ name: authorName, avatarUrl: c.author.avatarUrl }} size={22} />}
                  {authorUsername
                    ? <Link to={`/profile/${authorUsername}`} className="fpost__cname">{authorName}</Link>
                    : <strong className="fpost__cname">{authorName}</strong>}{' '}
                  <span className="fpost__c-text">{c.text}</span>
                  <small className="muted">{formatDate(c.createdAt, navigator.language)}</small>
                  {user?.id === (c.userId ?? c.authorId) && (
                    <button
                      type="button"
                      className="comment-delete"
                      onClick={() => removeComment(c.id)}
                      disabled={deletingCommentIds.has(c.id)}
                      aria-label={deletingCommentIds.has(c.id) ? 'Deleting comment' : `Delete comment by ${authorName}`}
                      aria-busy={deletingCommentIds.has(c.id)}
                      title={deletingCommentIds.has(c.id) ? 'Deleting comment…' : 'Delete comment'}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                  {commentDeleteErrors[c.id] && (
                    <span className="fpost__c-delete-error" role="alert">{commentDeleteErrors[c.id]}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {!loadingComments && !commentLoadError && expanded && postComments.length === 0 && (
            <p className="muted">No comments yet. Start the conversation.</p>
          )}
        </div>

        <form className="fpost__comment" onSubmit={submitComment} noValidate>
          <label className="sr-only" htmlFor={`c-${post.id}`}>Add a comment</label>
          <input
            ref={inputRef}
            id={`c-${post.id}`} type="text" value={text} maxLength={300}
            placeholder="Add a comment…"
            onChange={(e) => { setText(e.target.value); setError(''); }}
            aria-invalid={Boolean(error)}
          />
          <button type="submit" disabled={sending || !text.trim() || !postsApiEnabled || !user}>Post</button>
        </form>
        {!postsApiEnabled
          ? <p className="muted">Configure the backend API URL to use comments.</p>
          : !user && <p className="muted"><Link to="/login">Sign in</Link> to comment.</p>}
        {error && <p className="fpost__error" role="alert">{error}</p>}
      </div>
    </article>
  );
}
