DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM posts
    WHERE work_type = 'inspired' AND source_post_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot roll back while inspired posts have detached source references.';
  END IF;
  IF EXISTS (SELECT 1 FROM post_media WHERE cloudinary_public_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot roll back while post media has stored Cloudinary IDs.';
  END IF;
  IF EXISTS (SELECT 1 FROM cloudinary_cleanup) THEN
    RAISE EXCEPTION 'Cannot roll back while Cloudinary cleanup is pending.';
  END IF;
  IF EXISTS (SELECT 1 FROM cloudinary_cleanup_unresolved) THEN
    RAISE EXCEPTION 'Cannot roll back while legacy Cloudinary media needs manual cleanup.';
  END IF;
END $$;

ALTER TABLE posts
  DROP CONSTRAINT posts_attribution_consistent;

ALTER TABLE posts
  ADD CONSTRAINT posts_attribution_consistent CHECK (
    (work_type = 'original' AND source_post_id IS NULL AND inspiration_note IS NULL)
    OR
    (work_type = 'inspired' AND source_post_id IS NOT NULL AND inspiration_note IS NOT NULL
      AND char_length(btrim(inspiration_note)) > 0)
  );

DROP TABLE cloudinary_cleanup;
DROP TABLE cloudinary_cleanup_unresolved;
DROP INDEX post_media_cloudinary_public_id_idx;
ALTER TABLE post_media DROP COLUMN cloudinary_public_id;
