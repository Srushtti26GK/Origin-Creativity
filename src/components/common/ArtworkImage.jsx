import { useMemo, useState } from 'react';
import { generateArtwork } from '../../utils/artwork.js';

// Shows the creator's image when there is one, otherwise (or if it fails to load) generated placeholder art.
export default function ArtworkImage({ post, priority = false }) {
  const [failed, setFailed] = useState(false);
  const { id, category, media, title } = post;
  const fallback = useMemo(() => generateArtwork({ seed: id, category, aspect: media?.aspect }), [id, category, media?.aspect]);
  const src = media?.url && !failed ? media.url : fallback;
  return <img className="artwork" src={src} alt={media?.alt || title} loading={priority ? 'eager' : 'lazy'} onError={() => setFailed(true)} />;
}
