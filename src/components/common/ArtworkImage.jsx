
import { useMemo, useState } from 'react';
import { generateArtwork } from '../../utils/artwork.js';
import {
  getOptimizedImageUrl,
  getResponsiveSrcSet,
  IMAGE_SIZES,
  isCloudinaryUrl,
} from '../../utils/cloudinary.js';

export default function ArtworkImage({
  post,
  priority = false,
  sizeVariant = 'feed',
  sizes,
  className = '',
  style = {},
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { id, category, media, title } = post || {};
  const aspect = media?.aspect;
  const rawUrl = media?.url;
  const isCloudinary = isCloudinaryUrl(rawUrl);

  const fallback = useMemo(
    () => generateArtwork({ seed: id, category, aspect }),
    [id, category, aspect],
  );

  const src = useMemo(() => {
    if (!rawUrl || failed) return fallback;

    return isCloudinary
      ? getOptimizedImageUrl(rawUrl, { width: 1200 })
      : rawUrl;
  }, [rawUrl, failed, isCloudinary, fallback]);

  const srcSet = useMemo(() => {
    if (!rawUrl || failed || !isCloudinary) return undefined;

    return getResponsiveSrcSet(rawUrl, [360, 640, 960, 1200, 1600]);
  }, [rawUrl, failed, isCloudinary]);

  const resolvedSizes =
    sizes || IMAGE_SIZES[sizeVariant] || IMAGE_SIZES.feed;

  return (
    <div
      className={`artwork-container ${loaded ? 'is-loaded' : 'is-loading'} ${className}`}
      style={{
        height: 'auto',
        aspectRatio: 'auto',
        ...style,
      }}
    >
      <img
        className="artwork"
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? resolvedSizes : undefined}
        alt={media?.alt || title || 'Artwork'}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          objectFit: 'contain',
        }}
        onLoad={() => {
          setFailed(false);
          setLoaded(true);
        }}
        onError={() => {
          if (!failed) {
            setFailed(true);
          }
          setLoaded(true);
        }}
      />
    </div>
  );
}
