import { CATEGORIES } from '../data/categories.js';

export const LIMITS = { title: 80, description: 600, tags: 8, imageBytes: 5 * 1024 * 1024 };

export const parseTags = (raw, { stripHash = true } = {}) =>
  [...new Set(raw.split(',').map((tag) => {
    const normalized = tag.trim().toLowerCase();
    return stripHash ? normalized.replace(/^#/, '') : normalized;
  }).filter(Boolean))].slice(0, LIMITS.tags);

export function validateImageFile(file) {
  if (!file.type.startsWith('image/')) return 'Choose an image file (JPG, PNG, WebP or GIF).';
  if (file.size > LIMITS.imageBytes) return 'Choose an image under 5 MB.';
  return '';
}

export function validatePostForm(values, { mode = 'create', requireMedia = false } = {}) {
  const errors = {};
  const title = values.title.trim();
  const description = values.description.trim();
  if (!title) errors.title = 'Give your work a title.';
  else if (title.length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`;
  if (description.length < 10) errors.description = 'Describe your work in at least 10 characters.';
  else if (description.length > LIMITS.description) errors.description = `Keep the description under ${LIMITS.description} characters.`;
  if (!CATEGORIES.some((c) => c.id === values.category)) errors.category = 'Choose a category.';
  if (mode === 'create') {
    if (!values.declaration) errors.declaration = 'Confirm the declaration to publish.';
    if (requireMedia && !values.hasMedia) errors.media = 'Choose an image to preview your work.';
    if (values.workType === 'inspired') {
      if (!values.sourcePostId) errors.sourcePostId = 'Choose the work that inspired you.';
      if (!values.inspirationNote.trim()) errors.inspirationNote = 'Describe what is yours in this work.';
    }
  }
  if (mode === 'edit' && values.workType === 'inspired') {
    if (!values.inspirationNote?.trim()) errors.inspirationNote = 'Describe what is yours in this work.';
    else if (values.inspirationNote.length > 600) errors.inspirationNote = 'Keep the contribution under 600 characters.';
  }
  return errors;
}

export const validateComment = (text) => (text.trim() ? '' : 'Write something before posting.');
