-- Computers and sessions (ADR 0091). A device is a computer that holds music: a GLUE Home, or a
-- browser with its own collection. A sign-in only to browse (a phone opening the library) is a
-- session: role 'browse', listed apart and never in Devices.
ALTER TABLE devices ADD COLUMN role TEXT NOT NULL DEFAULT 'device';

-- Browsers that never uploaded a collection with songs, and serve no GLUE Home, were only sessions.
UPDATE devices SET role = 'browse'
  WHERE kind = 'browser' AND revoked_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM devices h WHERE h.kind = 'home' AND h.companion_of = devices.id AND h.revoked_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM sync_profiles p, json_each(p.stats, '$.collections') c
                    WHERE p.device_id = devices.id AND CAST(json_extract(c.value, '$.tracks') AS INTEGER) > 0);

-- Their empty collections leave the merged groups they were linked into.
DELETE FROM sync_links WHERE device_id IN (SELECT id FROM devices WHERE role = 'browse');
