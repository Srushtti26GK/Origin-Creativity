CREATE TABLE creator_follows (
  follower_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT creator_follows_pkey PRIMARY KEY (follower_id, followed_id),
  CONSTRAINT creator_follows_not_self CHECK (follower_id <> followed_id)
);

CREATE INDEX creator_follows_followed_idx
  ON creator_follows (followed_id, created_at DESC, follower_id);

CREATE INDEX creator_follows_follower_idx
  ON creator_follows (follower_id, created_at DESC, followed_id);
