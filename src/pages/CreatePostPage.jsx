import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, ImagePlus, Sparkles, X } from 'lucide-react';
import { CATEGORIES } from '../data/categories.js';
import ArtworkImage from '../components/common/ArtworkImage.jsx';
import { usePosts } from '../hooks/usePosts.js';
import { fileToResizedDataUrl } from '../utils/image.js';
import { LIMITS, parseTags, validateImageFile, validatePostForm } from '../utils/validators.js';
import { API_BASE_URL } from '../services/apiConfig.js';
import { uploadImage } from '../services/imageUploadService.js';
import '../styles/pages.css';
import '../styles/CreatePostPage.css';
const EMPTY_FORM = {
  title: '',
  description: '',
  category: '',
  tags: '',
  workType: 'original',
  sourcePostId: '',
  inspirationNote: '',
  declared: false,
};

export default function CreatePostPage() {
  const location = useLocation();
  // "Create From This" passes the source via route state: navigate('/create', { state: { sourcePostId } })
  const incomingSourceId = location.state?.sourcePostId ?? new URLSearchParams(location.search).get('source') ?? '';

  const { status, posts, creatorsById, createPost } = usePosts();

  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    workType: incomingSourceId ? 'inspired' : 'original',
    sourcePostId: incomingSourceId,
  }));
  const [previewUrl, setPreviewUrl] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  const sourcePost = useMemo(
    () => posts.find((p) => p.id === form.sourcePostId) ?? null,
    [posts, form.sourcePostId],
  );
  const sourceCreator = sourcePost ? creatorsById.get(sourcePost.creatorId) : null;
  const sourceMissing = status === 'ready' && incomingSourceId && !posts.some((p) => p.id === incomingSourceId);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleFile = async (event) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    const fileError = validateImageFile(picked);
    if (fileError) {
      setErrors((prev) => ({ ...prev, media: fileError }));
      event.target.value = '';
      return;
    }
    setProcessing(true);
    try {
      setPreviewUrl(await fileToResizedDataUrl(picked));
      setErrors((prev) => ({ ...prev, media: undefined }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, media: err instanceof Error ? err.message : 'Could not prepare the image.' }));
    } finally {
      setProcessing(false);
    }
  };

  const handleApiFiles = (event) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = '';
    if (selectedImages.length + picked.length > 10) {
      setErrors((previous) => ({ ...previous, media: 'You can attach up to 10 images.' }));
      return;
    }
    const valid = [];
    const errorsForFiles = [];
    for (const file of picked) {
      const issue = validateImageFile(file);
      if (issue) errorsForFiles.push(`${file.name}: ${issue}`);
      else valid.push({ file, uploadId: crypto.randomUUID(), previewUrl: URL.createObjectURL(file), asset: null });
    }
    setSelectedImages((previous) => [...previous, ...valid]);
    setErrors((previous) => ({
      ...previous,
      media: errorsForFiles.join(' '),
    }));
  };

  const removeApiImage = (uploadId) => {
    setSelectedImages((previous) => {
      const removed = previous.find((item) => item.uploadId === uploadId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return previous.filter((item) => item.uploadId !== uploadId);
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validatePostForm({
      ...form,
      declaration: form.declared,
      hasMedia: Boolean(API_BASE_URL ? selectedImages.length : previewUrl),
    }, { mode: 'create', requireMedia: false });
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload = {
      title: form.title,
      description: form.description,
      category: form.category,
      tags: parseTags(form.tags, { stripHash: false }),
      media: [],
      workType: form.workType,
      sourcePostId: form.sourcePostId,
      inspirationNote: form.inspirationNote,
    };

    setSubmitting(true);
    try {
      if (API_BASE_URL) {
        const uploaded = [...selectedImages];
        for (const [index, image] of uploaded.entries()) {
          if (!image.asset) {
            const asset = await uploadImage(image.file, image.uploadId, (progress) => {
              setUploadProgress((previous) => ({ ...previous, [image.uploadId]: progress }));
            });
            uploaded[index] = { ...image, asset };
            setSelectedImages((previous) => previous.map((item) => (
              item.uploadId === image.uploadId ? { ...item, asset } : item
            )));
          }
          if (uploaded[index].asset) {
            payload.media.push({
              ...uploaded[index].asset,
              alt: `Artwork titled ${form.title.trim()}`,
              aspect: 'landscape',
            });
          }
        }
      } else if (previewUrl) {
        payload.media = {
          type: 'image',
          url: previewUrl,
          alt: `Artwork titled ${form.title.trim()}`,
        };
      }
      setCreated(await createPost(payload));
    } catch (error) {
      setErrors((previous) => ({ ...previous, form: error.message || 'Could not save your post. Please try again.' }));
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setForm({ ...EMPTY_FORM });
    setPreviewUrl('');
    selectedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setSelectedImages([]);
    setUploadProgress({});
    setErrors({});
    setCreated(null);
  };
  const removeSource = () =>
  setForm((prev) => ({ ...prev, workType: 'original', sourcePostId: '', inspirationNote: '' }));

  if (created) {
    return (
      <div className="page-wrap page-wrap--narrow">
        <div className="success-panel" role="status">
          <CheckCircle2 size={40} aria-hidden="true" />
          <h2>Your work is live</h2>
          <p>
            {API_BASE_URL
              ? 'It is now saved and available in the community feed.'
              : 'This is a prototype: the image is stored in this browser only.'}
          </p>
          <div className="form-actions">
            <Link className="solid-btn" to={`/post/${created.id}`}>View your post</Link>
            <button type="button" className="outline-btn" onClick={resetAll}>Create another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap page-wrap--medium">
      <header className="page-head">
        <div className="page-head__text">
          <p className="eyebrow">Share your work</p>
          <h1 className="page-title">
          {form.workType === 'inspired' && sourcePost ? 'Recreate from original' : form.workType === 'inspired' ? 'Create from inspiration' : 'Create a post'}
          </h1>          
          <p className="page-sub">Every creation has a creator. Every inspiration has a story.</p>
        </div>
      </header>

      <div className="create">
        <form className="create__form" onSubmit={handleSubmit} noValidate>
          {errors.form && <p className="notice notice--warn" role="alert">{errors.form}</p>}
          {form.workType === 'inspired' && sourcePost && (
  <div className="recreate-banner">
    <ArtworkImage post={sourcePost} />
    <div className="recreate-banner__text">
      <span className="recreate-banner__label">Recreating from original</span>
      <Link
        to={`/post/${sourcePost.id}`}
        className="recreate-banner__title"
        target="_blank"
        rel="noreferrer"
      >
        {sourcePost.title} <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
      <span className="recreate-banner__by">
        by{' '}
        {sourceCreator
          ? <Link to={`/profile/${sourceCreator.username ?? sourceCreator.id}`} target="_blank" rel="noreferrer">{sourceCreator.name}</Link>
          : 'an unknown creator'}
      </span>
      </div>
      <button type="button" className="recreate-banner__remove" onClick={removeSource}>
        Remove link
      </button>
    </div>  
     )}
          {sourceMissing && (
            <p className="notice notice--warn" role="alert">
              The work you wanted to build on is no longer available. You can still create an original post.
            </p>
          )}

          <div className="form-field">
            <span className="form-legend">Artwork</span>
            {API_BASE_URL ? (
              <>
                <label className="dropzone" htmlFor="api-images">
                  <span><strong>Add images from your device</strong> · optional, up to 10 files</span>
                  <input id="api-images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={handleApiFiles} />
                </label>
                {selectedImages.length > 0 && (
                  <ul className="upload-preview-grid" aria-label="Selected images">
                    {selectedImages.map((image) => (
                      <li key={image.uploadId}>
                        <img src={image.previewUrl} alt={`Preview of ${image.file.name}`} />
                        <span>{image.file.name}</span>
                        {uploadProgress[image.uploadId] !== undefined && (
                          <progress max="100" value={uploadProgress[image.uploadId]} aria-label={`Uploading ${image.file.name}`} />
                        )}
                        {image.asset && <span role="status">Uploaded</span>}
                        <button type="button" className="outline-btn" onClick={() => removeApiImage(image.uploadId)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="form-hint">JPEG, PNG, WebP, or GIF. Maximum 5 MB per image. Text-only posts are supported.</p>
              </>
            ) : previewUrl ? (
              <div className="media-preview">
                <img src={previewUrl} alt="Preview of your selected artwork" />
                <button type="button" className="media-preview__remove" onClick={() => setPreviewUrl('')} aria-label="Remove image">
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <label className="dropzone">
                <ImagePlus size={30} aria-hidden="true" />
                <span>
                  {processing ? 'Preparing image…' : <><strong>Choose an image</strong> to preview your work</>}
                </span>
                <input type="file" accept="image/*" onChange={handleFile} disabled={processing} aria-describedby="media-error" />
              </label>
            )}
            {errors.media && <p id="media-error" className="field-error" role="alert">{errors.media}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="title">Title</label>
            <input
              id="title" type="text" maxLength={LIMITS.title} value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title && <p className="field-error" role="alert">{errors.title}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description" maxLength={LIMITS.description} value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              aria-invalid={Boolean(errors.description)}
            />
            {errors.description && <p className="field-error" role="alert">{errors.description}</p>}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="category">Category</label>
              <select
                id="category" value={form.category}
                onChange={(e) => setField('category', e.target.value)}
                aria-invalid={Boolean(errors.category)}
              >
                <option value="">Select a category</option>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {errors.category && <p className="field-error" role="alert">{errors.category}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="tags">Tags</label>
              <input
                id="tags" type="text" value={form.tags} placeholder="watercolor, landscape"
                onChange={(e) => setField('tags', e.target.value)}
              />
              <p className="form-hint">Separate with commas. Up to 8.</p>
            </div>
          </div>

          <fieldset className="form-field segmented">
            <legend className="form-legend">Work type</legend>
            <label>
              <input
                type="radio" name="workType" value="original"
                checked={form.workType === 'original'}
                onChange={() => setForm((p) => ({ ...p, workType: 'original', sourcePostId: '' }))}
              />
              Original
            </label>
            <label>
              <input
                type="radio" name="workType" value="inspired"
                checked={form.workType === 'inspired'}
                onChange={() => setField('workType', 'inspired')}
              />
              <Sparkles size={16} aria-hidden="true" /> Inspired
            </label>
          </fieldset>

          {form.workType === 'inspired' && (
            <>
              <div className="form-field">
                <label htmlFor="source">Inspired by</label>
                <select
                  id="source" value={form.sourcePostId}
                  onChange={(e) => setField('sourcePostId', e.target.value)}
                  aria-invalid={Boolean(errors.sourcePostId)}
                >
                  <option value="">Select a work</option>
                  {posts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {creatorsById.get(p.creatorId)?.name ?? 'Unknown creator'}
                    </option>
                  ))}
                </select>
                {errors.sourcePostId && <p className="field-error" role="alert">{errors.sourcePostId}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="note">What is yours in this work?</label>
                <textarea
                  id="note" value={form.inspirationNote}
                  placeholder="Explain what you took as inspiration and what you made new."
                  onChange={(e) => setField('inspirationNote', e.target.value)}
                  aria-invalid={Boolean(errors.inspirationNote)}
                />
                {errors.inspirationNote && <p className="field-error" role="alert">{errors.inspirationNote}</p>}
              </div>
            </>
          )}

          <div className="form-field">
            <label className="check">
              <input
                type="checkbox" checked={form.declared}
                onChange={(e) => setField('declared', e.target.checked)}
                aria-invalid={Boolean(errors.declared)}
              />
              <span>
                I declare this is my own creative expression
                {form.workType === 'inspired' ? ', and I have credited the work that inspired it' : ''}.
                I understand this is a declaration, not independent verification.
              </span>
            </label>
            {errors.declared && <p className="field-error" role="alert">{errors.declared}</p>}
          </div>

          <div className="form-actions">
            <button type="submit" className="solid-btn" disabled={submitting || processing}>
              {submitting ? 'Publishing…' : 'Publish work'}
            </button>
            <Link to="/" className="outline-btn">Cancel</Link>
          </div>
        </form>

        <aside className="create__aside" aria-label="Attribution preview">
          <div className="aside-card">
            <h2>Attribution preview</h2>
            {form.workType === 'inspired' && sourcePost ? (
              <>
                <div className="source-card">
                  <ArtworkImage post={sourcePost} />
                  <div>
                    <strong>{sourcePost.title}</strong>
                    <span>by {sourceCreator?.name ?? 'Unknown creator'}</span>
                  </div>
                </div>
                <p style={{ marginTop: 'var(--space-3)' }}>
                  Your work will be shown as inspired by{' '}
                  <Link to={`/post/${sourcePost.id}`}>{sourcePost.title}</Link>
                  {sourceCreator && <> by <Link to={`/profile/${sourceCreator.username ?? sourceCreator.id}`}>{sourceCreator.name}</Link></>}.
                  The source stays separate from your contribution.
                </p>
              </>
            ) : (
              <p>
                {form.workType === 'inspired'
                  ? 'Choose a source work and its attribution will appear here.'
                  : 'Original works are shown as creator declared original. Verification is separate and happens later.'}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}