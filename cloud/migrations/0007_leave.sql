-- Cloud sync turned off (ADR 0102): the account's copy of a collection is deleted after this time, unless a
-- device syncs it again first (any pull or push clears it).
ALTER TABLE shared_collections ADD COLUMN delete_after INTEGER;
CREATE INDEX IF NOT EXISTS shared_collections_delete_after ON shared_collections (delete_after) WHERE delete_after IS NOT NULL;
