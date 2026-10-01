-- What Gluey has shown the person (ADR 0126): the tours and feature tips seen, as JSON ({ seen, tips, quiet, quietAt }),
-- so the first tour shows on their first login, not on each device's.
ALTER TABLE users ADD COLUMN guide TEXT;
