import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react';
import ArtworkImage from '../common/ArtworkImage.jsx';
import '../../styles/PostImageViewer.css';

function imagesFor(post) {
  const items = Array.isArray(post.mediaItems) && post.mediaItems.length
    ? post.mediaItems
    : Array.isArray(post.media) ? post.media : post.media ? [post.media] : [];
  return items.filter((item) => item.type === 'image');
}

export default function PostImageViewer({ post, creator, onClose }) {
  const closeButtonRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const images = imagesFor(post);
  const image = images[index] ?? post.media ?? {};
  const username = creator?.username ?? creator?.handle ?? post.creator?.username ?? post.creatorId;
  const creatorName = creator?.name ?? creator?.displayName ?? post.creator?.name ?? post.creator?.displayName ?? 'Creator';

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  function move(step) {
    setIndex((current) => (current + step + images.length) % images.length);
    setZoom(1);
  }

  function changeZoom(amount) {
    setZoom((current) => Math.min(3, Math.max(1, Math.round((current + amount) * 10) / 10)));
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (images.length > 1 && event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (images.length > 1 && event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(0.25); }
    if (event.key === '-') { event.preventDefault(); changeZoom(-0.25); }
    if (event.key === '0') { event.preventDefault(); setZoom(1); }
    if (event.key === 'Tab') {
      const focusable = event.currentTarget.querySelectorAll('button:not(:disabled), a[href]');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  return createPortal(
    <div
      className="post-image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer for ${post.title}`}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <section className="post-image-viewer__panel" onClick={(event) => event.stopPropagation()}>
        <button ref={closeButtonRef} type="button" className="post-image-viewer__close" onClick={onClose} aria-label="Close image viewer"><X size={22} aria-hidden="true" /></button>
        <div className="post-image-viewer__layout">
          <div className="post-image-viewer__visual">
            <div className="post-image-viewer__scroll" data-zoomed={zoom > 1}>
              <div className="post-image-viewer__image-frame" style={{ '--viewer-zoom': zoom }}>
                <ArtworkImage post={{ ...post, media: image }} className="post-image-viewer__artwork" sizes="(max-width: 760px) 100vw, 72vw" priority />
              </div>
            </div>
            <div className="post-image-viewer__zoom" role="group" aria-label="Image zoom controls">
              <button type="button" onClick={() => changeZoom(-0.25)} disabled={zoom <= 1} aria-label="Zoom out"><Minus size={18} aria-hidden="true" /></button>
              <span aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => changeZoom(0.25)} disabled={zoom >= 3} aria-label="Zoom in"><Plus size={18} aria-hidden="true" /></button>
              <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Fit image to screen"><RotateCcw size={17} aria-hidden="true" /> Fit</button>
            </div>
            {images.length > 1 && <>
              <button type="button" className="post-image-viewer__arrow post-image-viewer__arrow--previous" onClick={() => move(-1)} aria-label="Previous image"><ChevronLeft size={26} aria-hidden="true" /></button>
              <button type="button" className="post-image-viewer__arrow post-image-viewer__arrow--next" onClick={() => move(1)} aria-label="Next image"><ChevronRight size={26} aria-hidden="true" /></button>
              <span className="post-image-viewer__count" aria-live="polite">{index + 1} / {images.length}</span>
            </>}
          </div>
          <aside className="post-image-viewer__details">
            <p className="eyebrow">{creatorName}</p><h2>{post.title}</h2>
            <p className="post-image-viewer__creator"><Link to={`/profile/${username}`} onClick={onClose}>@{String(username).replace(/^@/, '')}</Link></p>
            {post.category && <p className="post-image-viewer__category">{post.category}</p>}
            {post.description && <p className="post-image-viewer__description">{post.description}</p>}
            <Link className="solid-btn post-image-viewer__post-link" to={`/post/${post.id}`} onClick={onClose}>Open post and actions</Link>
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}
