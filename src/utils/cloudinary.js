/**
 * Utilities for Cloudinary image optimization and responsive delivery.
 */

const CLOUDINARY_REGEX = /^https?:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(.*)$/;

/**
 * Checks if a given URL is a Cloudinary image URL.
 */
export function isCloudinaryUrl(url) {
  return typeof url === 'string' && CLOUDINARY_REGEX.test(url.trim());
}

/**
 * Injects transformation parameters into a Cloudinary image URL.
 * Preserves existing asset version and public ID.
 * Defaults to f_auto,q_auto:good to ensure WebP/AVIF format negotiation
 * without sacrificing fine artwork detail.
 */
export function getOptimizedImageUrl(url, options = {}) {
  if (!isCloudinaryUrl(url)) return url;

  const match = url.trim().match(CLOUDINARY_REGEX);
  if (!match) return url;

  const [, cloudName, rest] = match;

  const transforms = [];
  const format = options.format || 'f_auto';
  const quality = options.quality || 'q_auto:good';
  transforms.push(format, quality);

  if (options.width) {
    transforms.push(`w_${Math.round(options.width)}`, 'c_limit');
  }

  if (options.dpr && options.dpr > 1) {
    transforms.push(`dpr_${options.dpr}`);
  }

  const transformString = transforms.join(',');

  // Check if `rest` already contains transformations (e.g. before /v1234/ or before publicId)
  // Clean out any duplicate leading transform
  const cleanRest = rest.replace(/^v\d+\//, (v) => v);

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformString}/${cleanRest}`;
}

/**
 * Generates a responsive srcset string for Cloudinary images.
 */
export function getResponsiveSrcSet(url, widths = [360, 640, 960, 1200, 1600]) {
  if (!isCloudinaryUrl(url)) return '';

  return widths
    .map((w) => `${getOptimizedImageUrl(url, { width: w })} ${w}w`)
    .join(', ');
}

/**
 * Responsive sizes presets for different UI contexts
 */
export const IMAGE_SIZES = {
  feed: '(max-width: 640px) 100vw, (max-width: 1024px) 680px, 680px',
  grid: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px',
  details: '(max-width: 768px) 100vw, (max-width: 1200px) 800px, 1100px',
  avatar: '(max-width: 640px) 72px, 96px',
};
