ALTER TABLE post_media
  ADD COLUMN cloudinary_public_id TEXT;

CREATE INDEX post_media_cloudinary_public_id_idx
  ON post_media (cloudinary_public_id)
  WHERE cloudinary_public_id IS NOT NULL;

CREATE TABLE cloudinary_cleanup (
  public_id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cloudinary_cleanup_unresolved (
  media_url TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT 'Missing stored Cloudinary public ID',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE posts
  DROP CONSTRAINT posts_attribution_consistent;

ALTER TABLE posts
  ADD CONSTRAINT posts_attribution_consistent CHECK (
    (work_type = 'original' AND source_post_id IS NULL AND inspiration_note IS NULL)
    OR
    (work_type = 'inspired' AND inspiration_note IS NOT NULL
      AND char_length(btrim(inspiration_note)) > 0)
  );
