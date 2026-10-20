import { Link } from 'react-router-dom';
import { GitBranch, Link2Off } from 'lucide-react';
import { usePosts } from '../../hooks/usePosts.js';
import '../../styles/PostCard.css';

export default function AttributionLabel({ post, compact = false }) {
  const { postsById, creatorsById } = usePosts();

  const isInspired = post.workType === 'inspired' || Boolean(post.sourcePostId);
  if (!isInspired) return null;

  const source = post.sourcePostId ? postsById.get(post.sourcePostId) : null;

  // Source was deleted or never existed: handle gracefully instead of breaking.
  if (!source) {
    return (
      <p className="attribution attribution--missing">
        <Link2Off size={16} aria-hidden="true" />
        <span>Inspired by a work that is no longer available.</span>
      </p>
    );
  }

  const sourceCreator = creatorsById.get(source.creatorId);

  return (
    <>
      <p className="attribution">
        <GitBranch size={16} aria-hidden="true" />
        <span>
          Inspired by <Link to={`/post/${source.id}`}>{source.title}</Link>
          {sourceCreator && <> by <Link to={`/profile/${sourceCreator.id}`}>{sourceCreator.name}</Link></>}
        </span>
      </p>
      {!compact && post.inspirationNote && (
        <blockquote className="attribution-note">
          <strong>This creator’s contribution</strong>
          {post.inspirationNote}
        </blockquote>
      )}
    </>
  );
}