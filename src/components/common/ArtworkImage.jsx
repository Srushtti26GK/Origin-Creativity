import { useMemo, useState } from 'react';
import { generateArtwork } from '../../utils/artwork.js';
import { getOptimizedImageUrl, getResponsiveSrcSet, IMAGE_SIZES, isCloudinaryUrl } from '../../utils/cloudinary.js';

/**
 * Responsive, high-quality Artwork Image component.
 * Leverages Cloudinary format negotiation (f_auto -> WebP/AVIF) and quality preservation.
 * Provides srcset & sizes to adapt to device pixel ratio (Retina/mobile AMOLED).
 * Employs lazy loading below-the-fold and eager loading for prioritized hero/active works.
 */
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

  const fallback = useMemo(
    () => generateArtwork({ seed: id, category, aspect }),
    [id, category, aspect],
  );

  const rawUrl = media?.url;
  const isCloudinary = isCloudinaryUrl(rawUrl);

  const src = useMemo(() => {
    if (!rawUrl || failed) return fallback;
    if (isCloudinary) {
      // High-res baseline optimized for sharp rendering
      return getOptimizedImageUrl(rawUrl, { width: 1200 });
    }
    return rawUrl;
  }, [rawUrl, failed, isCloudinary, fallback]);

  const srcSet = useMemo(() => {
    if (!rawUrl || failed || !isCloudinary) return undefined;
    return getResponsiveSrcSet(rawUrl, [360, 640, 960, 1200, 1600]);
  }, [rawUrl, failed, isCloudinary]);

  const resolvedSizes = sizes || IMAGE_SIZES[sizeVariant] || IMAGE_SIZES.feed;

  const aspectStyle = useMemo(() => {
    if (aspect === 'portrait') return '3 / 4';
    if (aspect === 'square') return '1 / 1';
    if (aspect === 'landscape') return '4 / 3';
    return undefined;
  }, [aspect]);

  return (
    <div
      className={`artwork-container ${loaded ? 'is-loaded' : 'is-loading'} ${className}`}
      style={{
        aspectRatio: aspectStyle,
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
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          setLoaded(true);
        }}
      />
    </div>
  );
}
