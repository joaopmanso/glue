-- GLUE Home is a companion of a browser on the same computer (ADR 0045): the pairing code remembers
-- which browser made it, and the GLUE Home that claims it is that browser's companion.
ALTER TABLE pairing_codes ADD COLUMN device_id TEXT;
ALTER TABLE devices ADD COLUMN companion_of TEXT;
