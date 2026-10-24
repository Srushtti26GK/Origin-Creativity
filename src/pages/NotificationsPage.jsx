import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellOff, CheckCheck, Heart, MessageCircle, UserPlus } from 'lucide-react';
import EmptyState from '../components/common/EmptyState.jsx';
import Avatar from '../components/common/Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE_URL } from '../services/apiConfig.js';
import { getNotificationsPage, markAllNotificationsRead, markNotificationRead, subscribeToNotificationEvents } from '../services/notificationService.js';
import '../styles/pages.css';
import '../styles/NotificationsPage.css';

const ICONS = { like: Heart, comment: MessageCircle, follow: UserPlus };
const TABS = [
  { id: 'all', label: 'All' },
  { id: 'like', label: 'Likes' },
  { id: 'comment', label: 'Comments' },
  { id: 'follow', label: 'Follows' },
];

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(Boolean(API_BASE_URL));
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadNotifications = useCallback(async (signal) => {
    if (!API_BASE_URL || !user) {
      setItems([]);
      setUnreadCount(0);
      setLoading(false);
      setError('');
      return;
    }
    setItems([]);
    setUnreadCount(0);
    setLoading(true);
    setError('');
    try {
      const result = await getNotificationsPage(1, 50);
      if (signal.aborted) return;
      setItems(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch (requestError) {
      if (!signal.aborted) setError(requestError.message || 'Could not load notifications.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return undefined;
    const controller = new AbortController();
    void loadNotifications(controller.signal);
    return () => controller.abort();
  }, [authLoading, loadNotifications]);

  useEffect(() => {
    if (authLoading || !user) return undefined;
    const unsubscribe = subscribeToNotificationEvents((newNotification) => {
      setItems((prev) => {
        if (prev.some((item) => item.id === newNotification.id)) return prev;
        return [newNotification, ...prev];
      });
      setUnreadCount((count) => count + 1);
    });
    return unsubscribe;
  }, [authLoading, user]);

  const visible = useMemo(
    () => tab === 'all' ? items : items.filter((item) => item.eventType === tab),
    [items, tab],
  );

  async function markRead(id) {
    const notification = items.find((item) => item.id === id);
    if (!notification || notification.readAt) return true;
    setActionError('');
    try {
      await markNotificationRead(id);
      setItems((previous) => previous.map((item) => item.id === id
        ? { ...item, readAt: new Date().toISOString() }
        : item));
      setUnreadCount((count) => Math.max(0, count - 1));
      return true;
    } catch (requestError) {
      setActionError(requestError.message || 'Could not mark notification as read.');
      return false;
    }
  }

  async function followNotificationLink(event, id, href) {
    event.preventDefault();
    if (await markRead(id)) navigate(href);
  }

  async function markAllRead() {
    if (!unreadCount || saving) return;
    setSaving(true);
    setActionError('');
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setItems((previous) => previous.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
      setUnreadCount(0);
    } catch (requestError) {
      setActionError(requestError.message || 'Could not mark notifications as read.');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return <div className="page-wrap page-wrap--narrow"><p aria-busy="true">Checking your session…</p></div>;
  }

  return (
    <div className="page-wrap page-wrap--narrow">
      <header className="page-head">
        <div className="page-head__text">
          <p className="eyebrow">Activity</p>
          <h1 className="page-title">Notifications</h1>
          <p className="page-sub">{unreadCount ? `${unreadCount} new` : 'You are all caught up'}</p>
        </div>
        <button type="button" className="outline-btn" onClick={markAllRead} disabled={!unreadCount || saving || !user}>
          <CheckCheck size={18} aria-hidden="true" /> Mark all read
        </button>
      </header>

      {!API_BASE_URL && <p className="field__error" role="alert">Configure VITE_API_BASE_URL to load notifications.</p>}
      {!user && API_BASE_URL && <p className="muted"><Link to="/login">Sign in</Link> to view your notifications.</p>}
      {actionError && <p className="field__error" role="alert">{actionError}</p>}

      <div className="notif__tabs" role="group" aria-label="Filter notifications">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="notif__tab"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && <p aria-busy="true">Loading notifications…</p>}
      {error && (
        <div>
          <p className="field__error" role="alert">{error}</p>
          <button type="button" className="outline-btn" onClick={() => {
            const controller = new AbortController();
            void loadNotifications(controller.signal);
          }}>Try again</button>
        </div>
      )}
      {!loading && !error && user && visible.length === 0 && (
        <EmptyState icon={BellOff} title="Nothing here yet">
          When someone likes, comments on, or follows you, it will show up here.
        </EmptyState>
      )}
      {!loading && !error && visible.length > 0 && (
        <ul className="notif__list">
          {visible.map((item) => {
            const Icon = ICONS[item.eventType];
            const action = {
              like: 'liked your work',
              comment: 'commented on your work',
              follow: 'started following you',
            }[item.eventType];
            const content = (
              <>
                <Avatar creator={{ name: item.actor.displayName, avatarUrl: item.actor.avatarUrl }} size={44} />
                <span className="notif__icon"><Icon size={20} aria-hidden="true" /></span>
                <p className="notif__text">
                  <strong>{item.actor.displayName}</strong> {action}
                  {item.post && <>: <strong>{item.post.title}</strong></>}
                  <span>{formatTimestamp(item.createdAt)}</span>
                </p>
                <span className="notif__meta">
                  {!item.readAt ? <span className="notif__dot" aria-label="Unread" /> : <span className="notif__empty-meta" />}
                </span>
              </>
            );
            const className = `notif__item${item.readAt ? '' : ' is-unread'}`;
            const href = item.post
              ? `/post/${item.post.id}`
              : `/profile/${encodeURIComponent(item.actor.username)}`;
            return (
              <li key={item.id}>
                <Link to={href} className={className} onClick={(event) => {
                  void followNotificationLink(event, item.id, href);
                }}>
                  {content}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
