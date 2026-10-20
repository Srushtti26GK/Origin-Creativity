import { Link } from 'react-router-dom';
import ArtworkImage from '../common/ArtworkImage.jsx';
import Avatar from '../common/Avatar.jsx';
import AuthenticityBadge from '../attribution/AuthenticityBadge.jsx';
import AttributionLabel from '../attribution/AttributionLabel.jsx';
import PostActions from './PostActions.jsx';
import { usePosts } from '../../hooks/usePosts.js';
import { getCategoryLabel } from '../../data/categories.js';
import { formatDate } from '../../utils/format.js';
import { Repeat2 } from 'lucide-react';

export default function PostCard({ post }) {
  const { creatorsById } = usePosts();
  const creator = creatorsById.get(post.creatorId);
  const reposter = post.repostedBy
    ? creatorsById.get(post.repostedBy.id) ?? {
      username: post.repostedBy.username,
      name: post.repostedBy.displayName,
    }
    : null;
  return (
    <article className="post-card">
      {reposter && (
        <p className="post-card__repost-attribution">
          <Repeat2 size={14} aria-hidden="true" />
          <Link to={`/profile/${reposter.username}`}>{reposter.name}</Link>
          {' reposted work by '}
          <Link to={`/profile/${creator?.username ?? post.creatorId}`}>{creator?.name ?? 'the original creator'}</Link>
          {' · '}{formatDate(post.repostedBy.createdAt, navigator.language)}
        </p>
      )}
      <Link to={`/post/${post.id}`} className="post-card__media" aria-label={`Open “${post.title}”`}>
        <ArtworkImage post={post} />
      </Link>
      <div className="post-card__body">
        <div className="post-card__top">
          <Link to={`/profile/${creator?.username ?? post.creatorId}`} className="creator-link">
            <Avatar creator={creator} size={28} /><span>{creator?.name ?? 'Unknown creator'}</span>
          </Link>
          <span className="chip">{getCategoryLabel(post.category)}</span>
        </div>
        <h3 className="post-card__title"><Link to={`/post/${post.id}`}>{post.title}</Link></h3>
        <p className="post-card__desc">{post.description}</p>
        <AttributionLabel post={post} compact />
        <div className="post-card__foot">
          <AuthenticityBadge post={post} />
          <PostActions post={post} />
        </div>
      </div>
    </article>
  );
}
