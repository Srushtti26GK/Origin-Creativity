import PostCard from './PostCard.jsx';

const SKELETON_RATIOS = ['4/5', '1/1', '5/4', '1/1', '4/5', '5/4'];

export default function PostGrid({ posts, loading = false }) {
  if (loading) {
    return (
      <div className="masonry" aria-busy="true" aria-label="Loading works">
        {SKELETON_RATIOS.map((ratio, i) => <div key={i} className="skeleton" style={{ aspectRatio: ratio }} />)}
      </div>
    );
  }
  return <div className="masonry">{posts.map((post) => <PostCard key={post.feedEntryId ?? post.id} post={post} />)}</div>;
}
