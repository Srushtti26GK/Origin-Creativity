CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  recipient_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  post_id UUID REFERENCES posts (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  CONSTRAINT notifications_event_type_valid CHECK (event_type IN ('like', 'comment', 'follow')),
  CONSTRAINT notifications_actor_not_recipient CHECK (actor_id <> recipient_id),
  CONSTRAINT notifications_post_type_consistent CHECK (
    event_type IN ('like', 'comment')
    OR (event_type = 'follow' AND post_id IS NULL)
  )
);

CREATE INDEX notifications_recipient_created_idx
  ON notifications (recipient_id, created_at DESC, id DESC);

CREATE INDEX notifications_unread_recipient_idx
  ON notifications (recipient_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;
