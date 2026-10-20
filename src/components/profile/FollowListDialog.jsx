import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import Avatar from '../common/Avatar.jsx';
import { getFollowList } from '../../services/profileApi.js';

export default function FollowListDialog({ username, direction, onClose }) {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
            {users.map((creator) => (
              <li key={creator.id}>
                <Link to={`/profile/${creator.username}`} onClick={onClose} className="follow-dialog__user">
                  <Avatar creator={{ name: creator.displayName, avatarUrl: creator.avatarUrl }} size={42} />
                  <span>
                    <strong>{creator.displayName}</strong>
                    <small>@{creator.username}</small>
                  </span>
                </Link>
              </li>
            ))}
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
