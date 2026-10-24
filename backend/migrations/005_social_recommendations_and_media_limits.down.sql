ALTER TABLE post_media DROP CONSTRAINT IF EXISTS post_media_position_max;
DROP INDEX IF EXISTS notifications_duplicate_check_idx;
DROP INDEX IF EXISTS creator_follows_reverse_lookup_idx;
