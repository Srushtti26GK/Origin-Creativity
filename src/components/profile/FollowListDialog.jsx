import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserCheck, Users, X } from 'lucide-react';
import Avatar from '../common/Avatar.jsx';
import { followCreator, getFollowList, unfollowCreator } from '../../services/profileApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function FollowListDialog({ username, direction, onClose }) {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const { user: currentUser } = useAuth();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getFollowList(username, direction, page)
      .then((result) => {
        if (cancelled) return;
        setUsers(result.users);
        setPagination(result.pagination);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [username, direction, page]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const handleToggleFollow = async (targetUsername) => {
    const targetUser = users.find((u) => u.username === targetUsername);
    if (!targetUser) return;

    setActionLoading((prev) => ({ ...prev, [targetUsername]: true }));
    try {
      if (targetUser.isFollowing) {
        await unfollowCreator(targetUsername);
        setUsers((prev) => prev.map((u) => (
          u.username === targetUsername
            ? { ...u, isFollowing: false, isMutual: false }
            : u
        )));
      } else {
        await followCreator(targetUsername);
        setUsers((prev) => prev.map((u) => (
          u.username === targetUsername
            ? { ...u, isFollowing: true, isMutual: Boolean(u.followsYou) }
            : u
        )));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update follow status.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUsername]: false }));
    }
  };

  const title = direction === 'followers' ? 'Followers' : 'Following';

  return (
    <div className="follow-dialog__backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="follow-dialog" role="dialog" aria-modal="true" aria-labelledby="follow-dialog-title">
        <header className="follow-dialog__header">
          <h2 id="follow-dialog-title">{title}</h2>
          <button type="button" className="outline-btn" onClick={onClose} aria-label={`Close ${title.toLowerCase()} list`}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {loading ? <p aria-busy="true">Loading {title.toLowerCase()}…</p> : null}
        {error && <p className="notice notice--error" role="alert">{error}</p>}
        {!loading && !error && users.length === 0 && <p className="muted">No {title.toLowerCase()} yet.</p>}
        {!loading && !error && users.length > 0 && (
          <ul className="follow-dialog__list">
            {users.map((creator) => {
              const isSelf = currentUser && currentUser.username === creator.username;
              const isActioning = actionLoading[creator.username];
              return (
                <li key={creator.id} className="follow-dialog__item">
                  <Link to={`/profile/${creator.username}`} onClick={onClose} className="follow-dialog__user">
                    <Avatar creator={{ name: creator.displayName, avatarUrl: creator.avatarUrl }} size={42} />
                    <span className="follow-dialog__user-meta">
                      <strong>{creator.displayName}</strong>
                      <small>@{creator.username}</small>
                    </span>
                  </Link>

                  <div className="follow-dialog__badges">
                    {creator.isMutual ? (
                      <span className="follow-dialog__badge follow-dialog__badge--mutual" title="You follow each other">
                        <Users size={12} aria-hidden="true" /> Mutual
                      </span>
                    ) : creator.followsYou ? (
                      <span className="follow-dialog__badge follow-dialog__badge--follows-you">
                        Follows you
                      </span>
                    ) : null}

                    {currentUser && !isSelf && (
                      <button
                        type="button"
                        className={creator.isFollowing ? 'outline-btn follow-dialog__btn' : 'solid-btn follow-dialog__btn'}
                        onClick={() => handleToggleFollow(creator.username)}
                        disabled={isActioning}
                      >
                        {isActioning
                          ? '…'
                          : creator.isFollowing
                            ? 'Following'
                            : 'Follow'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {pagination && pagination.totalPages > 1 && (
          <nav className="follow-dialog__pagination" aria-label={`${title} pages`}>
            <button type="button" className="outline-btn" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <span>Page {page} of {pagination.totalPages}</span>
            <button type="button" className="outline-btn" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</button>
          </nav>
        )}
      </section>
    </div>
  );
}
