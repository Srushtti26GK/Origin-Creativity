import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import ArtworkImage from '../common/ArtworkImage.jsx';
import AttributionLabel from '../attribution/AttributionLabel.jsx';
import { CATEGORIES } from '../../data/categories.js';
import { usePosts } from '../../hooks/usePosts.js';
import { parseTags, validateImageFile, validatePostForm, LIMITS } from '../../utils/validators.js';
import { API_BASE_URL } from '../../services/apiConfig.js';
import { uploadImage } from '../../services/imageUploadService.js';

function Field({ id, label, error, hint, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="field__hint">{hint}</p>}
      {error && <p className="field__error" id={`${id}-error`} role="alert">{error}</p>}
    </div>
  );
}

// Serves both /create (mode="create") and /post/:id/edit (mode="edit").
export default function PostForm({ mode = 'create', initialPost = null, presetSourceId = '', onSubmit }) {
  const { posts, postsById, creatorsById } = usePosts();
  const isEdit = mode === 'edit';
  const [values, setValues] = useState(() => ({
    title: initialPost?.title ?? '',
    description: initialPost?.description ?? '',
    category: initialPost?.category ?? 'painting',
    tags: (initialPost?.tags ?? []).join(', '),
    workType: initialPost?.workType ?? (presetSourceId ? 'inspired' : 'original'),
    sourcePostId: initialPost?.sourcePostId ?? presetSourceId,
    inspirationNote: initialPost?.inspirationNote ?? '',
    declaration: false,
  }));
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [mediaItems, setMediaItems] = useState(initialPost?.mediaItems ?? (initialPost?.media?.url ? [initialPost.media] : []));
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const uploadFilesRef = useRef(uploadFiles);
  uploadFilesRef.current = uploadFiles;
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => uploadFilesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));
  const inspired = values.workType === 'inspired';
  const source = postsById.get(values.sourcePostId);
  const aria = (name) => ({ 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `${name}-error` : undefined });

  function handleFile(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    const problem = validateImageFile(chosen);
    if (problem) { setErrors((e) => ({ ...e, media: problem })); return; }
    setErrors((e) => ({ ...e, media: undefined }));
    setFile(chosen);
    setPreviewUrl(URL.createObjectURL(chosen));
  }

  function handleAdditionalFiles(event) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (mediaItems.length + uploadFiles.length + files.length > 10) {
      setErrors((previous) => ({ ...previous, media: 'You can attach up to 10 images.' }));
      return;
    }
    const valid = [];
    const rejected = [];
    for (const chosen of files) {
      const problem = validateImageFile(chosen);
      if (problem) rejected.push(`${chosen.name}: ${problem}`);
      else valid.push({
        file: chosen,
        uploadId: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(chosen),
        asset: null,
      });
    }
    setUploadFiles((previous) => [...previous, ...valid]);
    setErrors((previous) => ({ ...previous, media: rejected.join(' ') }));
  }

  function removeAdditionalFile(uploadId) {
    setUploadFiles((previous) => {
      const removed = previous.find((item) => item.uploadId === uploadId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return previous.filter((item) => item.uploadId !== uploadId);
    });
  }

  function removeMediaItem(index) {
    setMediaItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const found = validatePostForm(values, { mode });
    setErrors(found);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      const payload = { ...values, tags: parseTags(values.tags) };
      if (!isEdit) payload.media = { type: 'image', url: file ? previewUrl : '', alt: `Artwork titled “${values.title.trim()}”`, aspect: 'portrait' };
      if (isEdit && API_BASE_URL) {
        const attached = [...mediaItems];
        const selected = [...uploadFiles];
        for (const [index, item] of selected.entries()) {
          if (!item.asset) {
            const asset = await uploadImage(item.file, item.uploadId, (progress) => {
              setUploadProgress((previous) => ({ ...previous, [item.uploadId]: progress }));
            });
            selected[index] = { ...item, asset };
            setUploadFiles((previous) => previous.map((current) => (
              current.uploadId === item.uploadId ? { ...current, asset } : current
            )));
          }
          attached.push({
            ...selected[index].asset,
            alt: `Artwork titled “${values.title.trim()}”`,
            aspect: 'landscape',
          });
        }
        payload.media = attached;
      }
      await onSubmit(payload);
    } catch (error) {
      setErrors({ form: error.message });
      setSubmitting(false);
    }
  }

  return (
    <form className="post-form" onSubmit={handleSubmit} noValidate>
      {errors.form && <p className="notice notice--error" role="alert">{errors.form}</p>}

      {!isEdit && (
        <Field id="media" label="Artwork image" error={errors.media} hint="Optional. Previewed in your browser only; permanent upload needs the backend. Without an image, Origin generates placeholder art.">
          <label className="dropzone" htmlFor="media">
            {previewUrl ? <ArtworkImage post={{ id: 'preview', category: values.category, title: values.title, media: { url: previewUrl, alt: 'Preview of your chosen image', aspect: 'portrait' } }} /> : <span><ImagePlus size={28} aria-hidden="true" /> Choose an image</span>}
          </label>
          <input id="media" className="sr-only" type="file" accept="image/*" onChange={handleFile} />
        </Field>
      )}
      {isEdit && API_BASE_URL && (
        <Field id="additional-media" label="Images" error={errors.media} hint="Add or remove images. JPEG, PNG, WebP, or GIF; up to 5 MB each.">
          <div className="upload-preview-grid">
            {mediaItems.map((item, index) => (
              <div key={`${item.url}-${index}`}>
                <img src={item.url} alt={item.alt ?? `Attached image ${index + 1}`} />
                <button type="button" className="outline-btn" onClick={() => removeMediaItem(index)}>Remove image</button>
              </div>
            ))}
            {uploadFiles.map((item) => (
              <div key={item.uploadId}>
                <img src={item.previewUrl} alt={`Preview of ${item.file.name}`} />
                <span>{item.file.name}</span>
                {uploadProgress[item.uploadId] !== undefined && (
                  <progress max="100" value={uploadProgress[item.uploadId]} aria-label={`Uploading ${item.file.name}`} />
                )}
                {item.asset && <span role="status">Uploaded</span>}
                <button type="button" className="outline-btn" onClick={() => removeAdditionalFile(item.uploadId)}>Remove image</button>
              </div>
            ))}
          </div>
          <label className="dropzone" htmlFor="additional-media">
            <span><ImagePlus size={28} aria-hidden="true" /> Add images from your device</span>
          </label>
          <input id="additional-media" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={handleAdditionalFiles} />
        </Field>
      )}

      <Field id="title" label="Title" error={errors.title}>
        <input id="title" value={values.title} maxLength={LIMITS.title} onChange={(e) => set('title', e.target.value)} {...aria('title')} />
      </Field>
      <Field id="description" label="Description" error={errors.description} hint="What is it, how did you make it, what should people notice?">
        <textarea id="description" rows={4} value={values.description} maxLength={LIMITS.description} onChange={(e) => set('description', e.target.value)} {...aria('description')} />
      </Field>
      <div className="form-row">
        <Field id="category" label="Category" error={errors.category}>
          <select id="category" value={values.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field id="tags" label="Tags" hint="Separate with commas.">
          <input id="tags" value={values.tags} onChange={(e) => set('tags', e.target.value)} />
        </Field>
      </div>

      {isEdit ? (
        initialPost?.workType === 'inspired' && (
          <>
            <AttributionLabel post={initialPost} />
            <Field id="inspirationNote" label="Your contribution" error={errors.inspirationNote}>
              <textarea id="inspirationNote" rows={3} maxLength={600} value={values.inspirationNote} onChange={(e) => set('inspirationNote', e.target.value)} />
            </Field>
          </>
        )
      ) : (
        <>
          <fieldset className="field">
            <legend>Work type</legend>
            <label className="choice"><input type="radio" name="workType" checked={!inspired} onChange={() => set('workType', 'original')} /> Original</label>
            <label className="choice"><input type="radio" name="workType" checked={inspired} onChange={() => set('workType', 'inspired')} /> Inspired by another work</label>
          </fieldset>

          {inspired && (
            <div className="inspiration-panel">
              <Field id="sourcePostId" label="Source work" hint="Choose the work that inspired yours to link it.">
                <select id="sourcePostId" value={values.sourcePostId} onChange={(e) => set('sourcePostId', e.target.value)}>
                  <option value="">No linked source</option>
                  {posts.map((p) => <option key={p.id} value={p.id}>{p.title} · {creatorsById.get(p.creatorId)?.name}</option>)}
                </select>
              </Field>
              {source && (
                <div className="source-preview">
                  <div className="source-preview__thumb"><ArtworkImage post={source} /></div>
                  <div>
                    <strong>{source.title}</strong>
                    <p className="muted">by {creatorsById.get(source.creatorId)?.name}. This stays their work. Yours will be a separate post that links back to it.</p>
                  </div>
                </div>
              )}
              <Field id="inspirationNote" label="What did you bring of your own?" error={errors.inspirationNote} hint="Explain your contribution in your own words.">
                <textarea id="inspirationNote" rows={3} value={values.inspirationNote} onChange={(e) => set('inspirationNote', e.target.value)} />
              </Field>
              {source && <div><p className="muted">Attribution preview</p><AttributionLabel post={{ workType: 'inspired', sourcePostId: values.sourcePostId }} /></div>}
            </div>
          )}

          <div className="field">
            <label className="choice"><input type="checkbox" checked={values.declaration} onChange={(e) => set('declaration', e.target.checked)} aria-describedby="declaration-hint" />
              I declare this is my own creative expression{inspired ? ' and I have credited what inspired it' : ''}.</label>
            <p id="declaration-hint" className="field__hint">A declaration is not verification. Your work will show as “{inspired ? 'Creator Declared Inspired' : 'Creator Declared Original'}” until a verification process says otherwise.</p>
            {errors.declaration && <p className="field__error" id="declaration-error" role="alert">{errors.declaration}</p>}
          </div>
        </>
      )}

      <button className="btn btn--primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Publish work'}</button>
    </form>
  );
}
