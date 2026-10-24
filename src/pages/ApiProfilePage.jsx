import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, LayoutGrid, List, Sparkles, UserPlus, Users, UserX } from 'lucide-react';
import Avatar from '../components/common/Avatar.jsx';
import ArtworkImage from '../components/common/ArtworkImage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import FeedPost from '../components/posts/FeedPost.jsx';
import PostImageViewer from '../components/posts/PostImageViewer.jsx';
import FollowListDialog from '../components/profile/FollowListDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  followCreator,
  getFollowStatus,
  getCsrfToken,
  getCurrentUser,
  getPublicProfile,
  getRecommendations,
  getUserPosts,
  updateCurrentProfile,
  unfollowCreator,
} from '../services/profileApi.js';
import '../styles/FollowListDialog.css';
import '../styles/ProfilePage.css';

const TABS = [
  { id: 'all', label: 'All Works' },
  { id: 'original', label: 'Originals' },
  { id: 'inspired', label: 'Inspired' },
];

export default function ApiProfilePage({ username }) {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('all');
  const [view, setView] = useState('grid'); // 'grid' | 'feed'
  const [imageViewerPost, setImageViewerPost] = useState(null);
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
    followsYou: false,
    isMutual: false,
    mutualFollowingCount: 0,
  });
  const [followLoading, setFollowLoading] = useState(false);
  const [followError, setFollowError] = useState('');
  const [followList, setFollowList] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recFollowLoading, setRecFollowLoading] = useState({});
  const { user: authUser } = useAuth();
  const tabRefs = useRef([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setFollowError('');
    setFollowStats({
      followersCount: 0,
      followingCount: 0,
      isFollowing: false,
      followsYou: false,
      isMutual: false,
      mutualFollowingCount: 0,
    });

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
          followsYou: Boolean(followResult.followsYou),
          isMutual: Boolean(followResult.isMutual),
          mutualFollowingCount: followResult.mutualFollowingCount ?? 0,
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
    if (!currentUser) {
      setRecommendations([]);
      return;
    }
    let cancelled = false;
    getRecommendations(1, 4)
      .then((res) => {
        if (!cancelled && res?.creators) {
          setRecommendations(res.creators);
        }
      })
      .catch(() => {
        // Recommendations are an enhancement; ignore transient error
      });
    return () => { cancelled = true; };
  }, [currentUser]);

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
      setFollowStats((prev) => ({
        ...prev,
        followersCount: result.followersCount,
        followingCount: result.followingCount,
        isFollowing: result.isFollowing,
        isMutual: result.isFollowing && prev.followsYou,
      }));
    } catch (requestError) {
      setFollowError(requestError.message);
    } finally {
      setFollowLoading(false);
    }
  }

  async function handleRecFollow(recUsername) {
    setRecFollowLoading((prev) => ({ ...prev, [recUsername]: true }));
    try {
      await followCreator(recUsername);
      setRecommendations((prev) => prev.filter((r) => r.username !== recUsername));
    } catch {
      // Ignore
    } finally {
      setRecFollowLoading((prev) => ({ ...prev, [recUsername]: false }));
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

  const filteredPosts = useMemo(() => {
    if (tab === 'original') return posts.filter((p) => p.workType === 'original');
    if (tab === 'inspired') return posts.filter((p) => p.workType === 'inspired');
    return posts;
  }, [posts, tab]);

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

          <div className="profile__connection-badges">
            {followStats.isMutual && (
              <span className="profile__badge profile__badge--mutual">
                <Users size={14} aria-hidden="true" /> Mutual connection
              </span>
            )}
            {!followStats.isMutual && followStats.followsYou && (
              <span className="profile__badge">Follows you</span>
            )}
            {followStats.mutualFollowingCount > 0 && (
              <span className="profile__mutual-note">
                Followed by {followStats.mutualFollowingCount} creators you follow
              </span>
            )}
          </div>

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
              <button
                type="button"
                className={followStats.isFollowing ? 'outline-btn' : 'solid-btn'}
                onClick={toggleFollow}
                disabled={followLoading}
              >
                {followLoading
                  ? 'Please wait…'
                  : followStats.isFollowing
                    ? 'Following'
                    : 'Follow'}
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

      {/* Recommended creators section */}
      {isOwn && recommendations.length > 0 && (
        <section className="profile__recommendations" aria-label="Suggested creators">
          <div className="profile__recommendations-head">
            <Sparkles size={18} className="profile__rec-icon" aria-hidden="true" />
            <div>
              <h3>Creators to connect with</h3>
              <p className="muted">Based on creators you follow</p>
            </div>
          </div>
          <ul className="profile__recommendations-grid">
            {recommendations.map((creator) => (
              <li key={creator.id} className="profile__rec-card">
                <Link to={`/profile/${creator.username}`} className="profile__rec-link">
                  <Avatar creator={{ name: creator.displayName, avatarUrl: creator.avatarUrl }} size={52} />
                  <strong>{creator.displayName}</strong>
                  <small>@{creator.username}</small>
                </Link>
                <p className="profile__rec-explanation">{creator.explanation}</p>
                <button
                  type="button"
                  className="solid-btn profile__rec-btn"
                  onClick={() => handleRecFollow(creator.username)}
                  disabled={recFollowLoading[creator.username]}
                >
                  <UserPlus size={14} aria-hidden="true" /> Follow
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tabs and view toggle */}
      <div className="profile__toolbar">
        <div className="profile__tabs" role="tablist" aria-label="Profile sections">
          {TABS.map((t, index) => (
            <button
              key={t.id}
              ref={(element) => { tabRefs.current[index] = element; }}
              id={`profile-tab-${t.id}`}
              type="button"
              role="tab"
              className="profile__tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="view-toggle" role="group" aria-label="Layout">
          <button
            type="button"
            aria-pressed={view === 'grid'}
            aria-label="Grid view"
            onClick={() => setView('grid')}
          >
            <LayoutGrid size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={view === 'feed'}
            aria-label="Feed view"
            onClick={() => setView('feed')}
          >
            <List size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {filteredPosts.length === 0 ? (
        <EmptyState icon={ImageOff} title="Nothing here yet">
          {tab === 'inspired'
            ? 'No inspired works shared yet.'
            : 'No works shared yet.'}
        </EmptyState>
      ) : view === 'feed' ? (
        <div className="profile-feed">
          {filteredPosts.map((post) => {
            const feedPost = {
              ...post,
              creatorId: profile.id ?? post.userId,
              creator: {
                id: profile.id ?? post.userId,
                username: profile.username,
                name: profile.displayName,
                handle: profile.username,
                avatarUrl: profile.avatarUrl,
              },
              mediaItems: post.media,
              media: post.media?.find((item) => item.type === 'image') ?? {
                type: 'image',
                url: '',
                alt: `Artwork titled “${post.title}”`,
                aspect: 'square',
              },
              authenticity: {
                declaration: post.authenticityDeclaration,
                verificationStatus: post.verificationStatus,
              },
            };
            return <FeedPost key={post.id} post={feedPost} />;
          })}
        </div>
      ) : (
        <ul className="explore-grid">
          {filteredPosts.map((post) => {
            const displayPost = {
              ...post,
              creatorId: profile.id ?? post.userId,
              creator: { username: profile.username, name: profile.displayName },
              mediaItems: post.media,
              media: post.media?.[0] ?? {
                type: 'image',
                url: '',
                alt: `Artwork titled “${post.title}”`,
                aspect: 'square',
              },
              authenticity: {
                declaration: post.authenticityDeclaration,
                verificationStatus: post.verificationStatus,
              },
            };
            return (
              <li key={post.id}>
                <button type="button" className="explore-tile" aria-label={`View image for ${post.title}`} onClick={() => setImageViewerPost(displayPost)}>
                  <ArtworkImage post={displayPost} sizeVariant="grid" />
                  <span className="explore-tile__overlay">
                    <span>{post.title}</span>
                  </span>
                </button>
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
      {imageViewerPost && <PostImageViewer post={imageViewerPost} creator={{ username: profile.username, name: profile.displayName }} onClose={() => setImageViewerPost(null)} />}
    </div>
  );
}
