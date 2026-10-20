CREATE TABLE users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  CONSTRAINT users_email_normalized CHECK (email = lower(email) AND email = btrim(email)),
  CONSTRAINT users_display_name_length CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  CONSTRAINT users_bio_length CHECK (bio IS NULL OR char_length(bio) <= 500)
);

CREATE UNIQUE INDEX users_username_lower_unique ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));

CREATE TABLE session (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);

CREATE INDEX session_expire_idx ON session (expire);

CREATE TABLE posts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  work_type TEXT NOT NULL,
  source_post_id UUID,
  inspiration_note TEXT,
  authenticity_declaration TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT posts_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  CONSTRAINT posts_description_length CHECK (char_length(btrim(description)) BETWEEN 10 AND 600),
  CONSTRAINT posts_category_valid CHECK (
    category IN ('painting', 'illustration', 'photography', 'pottery', 'poetry', 'music', 'dance', 'digital', 'crafts')
  ),
  CONSTRAINT posts_tags_limit CHECK (cardinality(tags) <= 8),
  CONSTRAINT posts_work_type_valid CHECK (work_type IN ('original', 'inspired')),
  CONSTRAINT posts_verification_status_valid CHECK (
    verification_status IN ('unverified', 'pending', 'verified')
  ),
  CONSTRAINT posts_declaration_valid CHECK (
    authenticity_declaration IS NULL OR authenticity_declaration IN ('original', 'inspired')
  ),
  CONSTRAINT posts_declaration_matches_work_type CHECK (
    authenticity_declaration IS NULL OR authenticity_declaration = work_type
  ),
  CONSTRAINT posts_source_not_self CHECK (source_post_id IS NULL OR source_post_id <> id),
  CONSTRAINT posts_attribution_consistent CHECK (
    (work_type = 'original' AND source_post_id IS NULL AND inspiration_note IS NULL)
    OR
    (work_type = 'inspired' AND source_post_id IS NOT NULL AND inspiration_note IS NOT NULL
      AND char_length(btrim(inspiration_note)) > 0)
  ),
  CONSTRAINT posts_source_post_fk FOREIGN KEY (source_post_id)
    REFERENCES posts (id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX posts_feed_idx ON posts (created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_category_feed_idx ON posts (category, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX posts_owner_feed_idx ON posts (user_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX posts_source_idx ON posts (source_post_id)
  WHERE source_post_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE post_media (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  media_url TEXT NOT NULL,
  alt_text TEXT,
  aspect TEXT,
  position SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT post_media_type_valid CHECK (media_type IN ('image', 'audio', 'video')),
  CONSTRAINT post_media_url_nonempty CHECK (char_length(btrim(media_url)) > 0),
  CONSTRAINT post_media_position_nonnegative CHECK (position >= 0),
  CONSTRAINT post_media_position_unique UNIQUE (post_id, position)
);

CREATE TABLE likes (
  user_id UUID NOT NULL REFERENCES users (id),
  post_id UUID NOT NULL REFERENCES posts (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT likes_pkey PRIMARY KEY (user_id, post_id)
);

CREATE INDEX likes_post_idx ON likes (post_id, created_at DESC);

CREATE TABLE comments (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id),
  post_id UUID NOT NULL REFERENCES posts (id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT comments_content_length CHECK (char_length(btrim(content)) BETWEEN 1 AND 300)
);

CREATE INDEX comments_post_created_idx ON comments (post_id, created_at, id);
CREATE INDEX comments_user_created_idx ON comments (user_id, created_at DESC);
