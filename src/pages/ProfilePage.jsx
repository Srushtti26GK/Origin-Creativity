import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Heart, ImageOff, LayoutGrid, List, MessageCircle, Plus, UserX } from 'lucide-react';
import Avatar from '../components/common/Avatar.jsx';
import ArtworkImage from '../components/common/ArtworkImage.jsx';
import PostImageViewer from '../components/posts/PostImageViewer.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import PostGrid from '../components/posts/PostGrid.jsx';
import FeedPost from '../components/posts/FeedPost.jsx';
import { usePosts } from '../hooks/usePosts.js';
import { useAuth } from '../context/AuthContext.jsx';
import { profileApiEnabled } from '../services/profileApi.js';
import ApiProfilePage from './ApiProfilePage.jsx';
import '../styles/pages.css';
import '../styles/ExplorePage.css';
import '../styles/ProfilePage.css';

const TABS = [
  { id: 'works', label: 'Works' },
  { id: 'inspired', label: 'Inspired works' },
  { id: 'sources', label: 'Inspirations' },
];

export default function ProfilePage() {
  const { creatorId } = useParams();
  if (profileApiEnabled) return <ApiProfilePage username={creatorId} />;

  return <MockProfilePage creatorId={creatorId} />;
}

function MockProfilePage({ creatorId }) {
  const { user } = useAuth();
  const { status, posts, creatorsById, commentCounts } = usePosts();
  const [tab, setTab] = useState('works');
  const [view, setView] = useState('grid'); // 'feed' | 'grid' (grid matches the mockup)
  const [imageViewerPost, setImageViewerPost] = useState(null);
  const tabRefs = useRef([]);

  const creator = creatorsById.get(creatorId);
  const isOwn = user?.id ? creatorId === user.id : false;

  const works = useMemo(() => posts.filter((p) => p.creatorId === creatorId), [posts, creatorId]);
  const inspiredWorks = useMemo(() => works.filter((p) => p.workType === 'inspired'), [works]);
  // Works this creator credited as inspiration. Deleted sources are skipped safely.
  const sourceWorks = useMemo(() => {
    const ids = new Set(inspiredWorks.map((p) => p.sourcePostId).filter(Boolean));
    return posts.filter((p) => ids.has(p.id));
  }, [posts, inspiredWorks]);

  const totalLikes = works.reduce((sum, p) => sum + (p.likesCount ?? 0), 0);

  if (status === 'loading') {
    return <div className="page-wrap"><PostGrid loading /></div>;
  }

  if (!creator) {
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

  const shown = tab === 'works' ? works : tab === 'inspired' ? inspiredWorks : sourceWorks;
  const emptyCopy = {
    works: isOwn ? 'You haven’t shared any work yet.' : 'No works shared yet.',
    inspired: 'No inspired works yet. When this creator builds from another work, it will appear here.',
    sources: 'No inspirations credited yet.',
  }[tab];

  const handleTabKeyDown = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;
    else return;

    event.preventDefault();
    setTab(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="page-wrap">
      <header className="profile__header">
        {/* Cover banner comes from .profile__header::before in the CSS */}
        <div className="profile__who">
          <div className="profile__avatar"><Avatar creator={creator} size={96} /></div>

          <div className="profile__info">
            <h1 className="profile__name">{creator.name}</h1>
            {creator.handle && <p className="profile__handle">@{String(creator.handle).replace(/^@/, '')}</p>}
          </div>

          {isOwn && (
            <div className="profile__actions">
              <Link to="/create" className="solid-btn"><Plus size={18} aria-hidden="true" /> New post</Link>
            </div>
          )}
        </div>

        {creator.bio && <p className="profile__bio">{creator.bio}</p>}

        <dl className="profile__stats">
          <div className="profile__stat"><dt>Works</dt><dd>{works.length}</dd></div>
          <div className="profile__stat"><dt>Likes</dt><dd>{totalLikes}</dd></div>
          <div className="profile__stat"><dt>Inspired</dt><dd>{inspiredWorks.length}</dd></div>
        </dl>
      </header>

      <div className="profile__toolbar">
        <div className="profile__tabs" role="tablist" aria-label="Profile sections">
          {TABS.map((t, index) => (
            <button
              key={t.id} ref={(element) => { tabRefs.current[index] = element; }}
              id={`profile-tab-${t.id}`} type="button" role="tab" className="profile__tab"
              aria-selected={tab === t.id} aria-controls="profile-tabpanel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="view-toggle" role="group" aria-label="Layout">
          <button type="button" aria-pressed={view === 'feed'} aria-label="Feed view" onClick={() => setView('feed')}>
            <List size={18} aria-hidden="true" />
          </button>
          <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')}>
            <LayoutGrid size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div id="profile-tabpanel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`} tabIndex={0}>
        {!shown.length ? (
          <EmptyState
            icon={ImageOff}
            title="Nothing here yet"
            action={isOwn && tab === 'works' ? <Link className="solid-btn" to="/create">Create your first post</Link> : null}
          >
            {emptyCopy}
          </EmptyState>
        ) : view === 'feed' ? (
          <div className="profile-feed">
            {shown.map((post) => <FeedPost key={post.id} post={post} />)}
          </div>
        ) : (
          <ul className="explore-grid">
            {shown.map((post) => (
              <li key={post.id}>
                <button type="button" className="explore-tile" aria-label={`View image for ${post.title}`} onClick={() => setImageViewerPost(post)}>
                  <ArtworkImage post={post} />
                  <span className="explore-tile__overlay">
                    <span><Heart size={18} aria-hidden="true" /> {post.likesCount}</span>
                    <span><MessageCircle size={18} aria-hidden="true" /> {commentCounts[post.id] ?? 0}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {imageViewerPost && <PostImageViewer post={imageViewerPost} creator={creator} onClose={() => setImageViewerPost(null)} />}
    </div>
  );
}