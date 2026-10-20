import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, UserX } from 'lucide-react';
import Avatar from '../components/common/Avatar.jsx';
import ArtworkImage from '../components/common/ArtworkImage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import FollowListDialog from '../components/profile/FollowListDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  followCreator,
  getFollowStatus,
  getCsrfToken,
  getCurrentUser,
  getPublicProfile,
  getUserPosts,
  updateCurrentProfile,
  unfollowCreator,
} from '../services/profileApi.js';
import '../styles/FollowListDialog.css';

export default function ApiProfilePage({ username }) {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ displayName: '', bio: '', avatarUrl: '' });
  const [followStats, setFollowStats] = useState({
    followersCount: 0,
    followingCount: 0,
    isFollowing: false,
  });
  const [followLoading, setFollowLoading] = useState(false);
  const [followError, setFollowError] = useState('');
  const [followList, setFollowList] = useState(null);
  const { user: authUser } = useAuth();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setFollowError('');
    setFollowStats({ followersCount: 0, followingCount: 0, isFollowing: false });

    Promise.all([
      getPublicProfile(username),
      getUserPosts(username, page),
      getCurrentUser().catch((requestError) => {
        if (requestError.status === 401) return null;
        throw requestError;
      }),
      getFollowStatus(username).catch((requestError) => {
        if (cancelled) return null;
        setFollowError(requestError.message);
        return null;
      }),
    ]).then(([profileResult, postsResult, meResult, followResult]) => {
      if (cancelled) return;
      setProfile(profileResult.user);
      setPosts(postsResult.posts);
      setPagination(postsResult.pagination);
      setCurrentUser(meResult?.user ?? null);
      if (followResult) {
        setFollowStats({
          followersCount: followResult.followersCount,
          followingCount: followResult.followingCount,
          isFollowing: followResult.isFollowing,
        });
      }
    }).catch((requestError) => {
      if (!cancelled) setError(requestError.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [username, page]);

  useEffect(() => {
    if (!profile) return;
    setForm({
      displayName: profile.displayName ?? '',
      bio: profile.bio ?? '',
      avatarUrl: profile.avatarUrl ?? '',
    });
  }, [profile]);

  const isOwn = Boolean(currentUser && profile && currentUser.username === profile.username);
  const signedInUser = currentUser ?? authUser;

  async function toggleFollow() {
    setFollowLoading(true);
    setFollowError('');
    try {
      const result = followStats.isFollowing
        ? await unfollowCreator(username)
        : await followCreator(username);
      setFollowStats({
        followersCount: result.followersCount,
        followingCount: result.followingCount,
        isFollowing: result.isFollowing,
      });
    } catch (requestError) {
      setFollowError(requestError.message);
    } finally {
      setFollowLoading(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const { csrfToken } = await getCsrfToken();
      const { user } = await updateCurrentProfile({
        displayName: form.displayName,
        bio: form.bio,
        avatarUrl: form.avatarUrl,
      }, csrfToken);
      setProfile((previous) => ({
        ...previous,
        displayName: user.displayName,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
      }));
      setEditOpen(false);
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="page-wrap" aria-busy="true">Loading profile…</div>;
  }

  if (error) {
    return (
      <div className="page-wrap page-wrap--narrow" role="alert">
        <EmptyState icon={UserX} title="Could not load profile">
          {error}
        </EmptyState>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-wrap page-wrap--narrow">
        <EmptyState
          icon={UserX}
          title="Creator not found"
          action={<Link className="outline-btn" to="/explore">Explore creators</Link>}
        >
          This profile doesn’t exist or may have been removed.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <header className="profile__header">
        <div className="profile__avatar">
          {profile.avatarUrl
            ? <img className="api-profile__avatar-image" src={profile.avatarUrl} alt="" />
            : <Avatar creator={{ name: profile.displayName }} size={96} />}
        </div>
        <div className="profile__info">
          <p className="eyebrow">{isOwn ? 'Your profile' : 'Creator'}</p>
          <h1 className="profile__name">{profile.displayName}</h1>
          <p className="profile__handle">@{profile.username}</p>
          {profile.bio && <p className="profile__bio">{profile.bio}</p>}
          {isOwn && (
            <div className="profile__actions">
              <button type="button" className="outline-btn" onClick={() => setEditOpen((open) => !open)}>
                {editOpen ? 'Cancel edit' : 'Edit profile'}
              </button>
            </div>
          )}
          {!isOwn && signedInUser && (
            <div className="profile__actions">
              <button type="button" className={followStats.isFollowing ? 'outline-btn' : 'solid-btn'} onClick={toggleFollow} disabled={followLoading}>
                {followLoading ? 'Please wait…' : followStats.isFollowing ? 'Following' : 'Follow'}
              </button>
            </div>
          )}
          {!isOwn && !signedInUser && (
            <div className="profile__actions">
              <Link className="solid-btn" to="/login">Sign in to follow</Link>
            </div>
          )}
        </div>
        <dl className="profile__stats">
          <div className="profile__stat"><dt>Works</dt><dd>{profile.postCount}</dd></div>
          <div className="profile__stat">
            <dd><button type="button" className="profile__stat-button" onClick={() => setFollowList('followers')}>{followStats.followersCount}</button></dd>
            <dt><button type="button" className="profile__stat-label" onClick={() => setFollowList('followers')}>Followers</button></dt>
          </div>
          <div className="profile__stat">
            <dd><button type="button" className="profile__stat-button" onClick={() => setFollowList('following')}>{followStats.followingCount}</button></dd>
            <dt><button type="button" className="profile__stat-label" onClick={() => setFollowList('following')}>Following</button></dt>
          </div>
        </dl>
      </header>

      {followError && <p className="notice notice--error" role="alert">{followError}</p>}
      {followList && (
        <FollowListDialog
          username={username}
          direction={followList}
          onClose={() => setFollowList(null)}
        />
      )}
      {isOwn && editOpen && (
        <form className="api-profile__form" onSubmit={saveProfile}>
          <label>
            Display name
            <input
              required
              maxLength={80}
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            />
          </label>
          <label>
            Bio
            <textarea
              maxLength={500}
              value={form.bio}
              onChange={(event) => setForm({ ...form, bio: event.target.value })}
            />
          </label>
          <label>
            Avatar URL
            <input
              type="url"
              maxLength={2048}
              value={form.avatarUrl}
              onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })}
            />
          </label>
          {formError && <p role="alert">{formError}</p>}
          <button className="solid-btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      )}

      {posts.length === 0 ? (
        <EmptyState icon={ImageOff} title="Nothing here yet">No public works shared yet.</EmptyState>
      ) : (
        <ul className="explore-grid">
          {posts.map((post) => {
            const displayPost = {
              ...post,
              media: post.media?.[0] ?? {
                type: 'image',
                url: '',
                alt: `Artwork titled “${post.title}”`,
                aspect: 'landscape',
              },
              authenticity: {
                declaration: post.authenticityDeclaration,
                verificationStatus: post.verificationStatus,
              },
            };
            return (
              <li key={post.id}>
                <Link to={`/post/${post.id}`} className="explore-tile" aria-label={`Open “${post.title}”`}>
                  <ArtworkImage post={displayPost} />
                  <span className="explore-tile__overlay">
                    <span>{post.title}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pagination && pagination.totalPages > 1 && (
        <nav className="api-profile__pagination" aria-label="Profile posts pagination">
          <button
            type="button"
            className="outline-btn"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button
            type="button"
            className="outline-btn"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
