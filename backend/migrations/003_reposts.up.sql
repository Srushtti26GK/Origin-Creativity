CREATE TABLE reposts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reposts_user_post_unique UNIQUE (user_id, post_id)
);

CREATE INDEX reposts_post_created_idx ON reposts (post_id, created_at DESC);
CREATE INDEX reposts_user_created_idx ON reposts (user_id, created_at DESC);
