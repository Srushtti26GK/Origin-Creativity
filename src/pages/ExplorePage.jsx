import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { Heart, MessageCircle, Repeat2, SearchX } from 'lucide-react';
import SearchBar from '../components/common/SearchBar.jsx';
import CategoryFilter from '../components/common/CategoryFilter.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ArtworkImage from '../components/common/ArtworkImage.jsx';
import PostImageViewer from '../components/posts/PostImageViewer.jsx';
import { usePosts } from '../hooks/usePosts.js';
import { filterPosts, SORT_OPTIONS } from '../utils/filters.js';
import '../styles/pages.css';
import '../styles/ExplorePage.css';

// Filters live in the URL (?q=&category=&sort=) so results are shareable and survive refresh.
export default function ExplorePage() {
  const [imageViewerPost, setImageViewerPost] = useState(null);
  const {
    status, posts, creatorsById, commentCounts, pagination,
    loadingMore, loadMoreError, loadMorePosts,
  } = usePosts();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? 'all';
  const sort = params.get('sort') ?? 'newest';

  const update = (key, value, fallback = '') => {
    const next = new URLSearchParams(params);
    if (value && value !== fallback) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const clearFilters = () => setParams({}, { replace: true });
  const hasFilters = query || category !== 'all' || sort !== 'newest';
  const results = filterPosts(posts, { query, category, sort }, { creatorsById, commentCounts });

  return (
    <div className="page-wrap explore">
      <header className="page-head">
        <div className="page-head__text">
          <p className="eyebrow">Discover</p>
          <h1 className="page-title">Explore</h1>
          <p className="page-sub">Tap any work to open it. Like, comment and create from it there or on your feed.</p>
        </div>
      </header>

      <div className="explore__toolbar">
        <div className="explore__search">
          <SearchBar value={query} onChange={(v) => update('q', v)} />
        </div>
        <div className="explore__sort">
          <label htmlFor="sort">Sort</label>
          <select id="sort" value={sort} onChange={(e) => update('sort', e.target.value, 'newest')}>
            {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        {hasFilters && <button type="button" className="outline-btn" onClick={clearFilters}>Clear filters</button>}
      </div>

      <CategoryFilter value={category} onChange={(v) => update('category', v, 'all')} />

      {status === 'loading' ? (
        <div className="explore-grid" aria-busy="true" aria-label="Loading works">
          {Array.from({ length: 9 }, (_, i) => <div key={i} className="explore-tile skeleton" />)}
        </div>
      ) : (
        <>
          <p className="explore__count" aria-live="polite">
            {results.length} {results.length === 1 ? 'work' : 'works'}{query && <> for “{query}”</>}
          </p>
          {results.length ? (
            <ul className="explore-grid">
              {results.map((post) => (
                <li key={post.feedEntryId ?? post.id}>
                  <button type="button" className="explore-tile" aria-label={`View image for ${post.title}`} onClick={() => setImageViewerPost(post)}>
                    <ArtworkImage post={post} />
                    <span className="explore-tile__overlay">
                      <span><Heart size={18} aria-hidden="true" /> {post.likesCount ?? '—'}</span>
                      <span><MessageCircle size={18} aria-hidden="true" /> {commentCounts[post.id] ?? '—'}</span>
                      <span><Repeat2 size={18} aria-hidden="true" /> {post.repostsCount ?? '—'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={SearchX}
              title="No works match"
              action={<button type="button" className="outline-btn" onClick={clearFilters}>Clear filters</button>}
            >
              Check the spelling, or try a broader word like a medium or a creator’s first name.
            </EmptyState>
          )}
          {pagination && pagination.page < pagination.totalPages && (
            <div className="explore__pagination">
              {loadMoreError && <p className="notice notice--error" role="alert">{loadMoreError}</p>}
              <button className="outline-btn" type="button" onClick={() => { void loadMorePosts(); }} disabled={loadingMore}>
                {loadingMore ? 'Loading more…' : 'Load more works'}
              </button>
            </div>
          )}
        </>
      )}
      {imageViewerPost && <PostImageViewer post={imageViewerPost} creator={creatorsById.get(imageViewerPost.creatorId)} onClose={() => setImageViewerPost(null)} />}
    </div>
  );
}
