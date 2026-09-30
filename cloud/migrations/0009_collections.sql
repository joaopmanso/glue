-- The account's collections (ADR 0112). A collection deleted from one device is kept as a tombstone: every
-- device learns it's gone (410, and `gone` in the list), backs it up and forgets it; the daily purge removes it
-- with its files after 30 days (delete_after). `stats` holds each computer's numbers:
-- { tracks, by: { <device>: { songs, at, changed } } }.
ALTER TABLE shared_collections ADD COLUMN deleted_at INTEGER;
