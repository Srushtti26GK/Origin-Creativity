-- Migration: 005_social_recommendations_and_media_limits
-- Enforce a maximum of 5 media items (positions 0, 1, 2, 3, 4) per post at the database level.
ALTER TABLE post_media
  ADD CONSTRAINT post_media_position_max CHECK (position <= 4);

-- Index to accelerate duplicate notification suppression
CREATE INDEX notifications_duplicate_check_idx
  ON notifications (recipient_id, actor_id, event_type, post_id)
  WHERE read_at IS NULL;

-- Index to support mutual follower lookups and creator recommendation queries
CREATE INDEX creator_follows_reverse_lookup_idx
  ON creator_follows (followed_id, follower_id);
