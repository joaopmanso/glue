---
status: accepted
amended-by: 0025
date: 2026-09-24
---
# 0013. Three tiers of duplicate detection

## Context
DJ collections hold the same song several times: identical copies on two drives, a FLAC and an MP3 of
the same release, re-downloads with different tags. File hashes alone miss cross-format duplicates;
tags alone produce false matches (same title, different song).

## Decision
1. **Exact**: size + quick hash (SHA-1 over size and first/last 64 KB).
2. **Same recording**: chroma audio fingerprints (Chromaprint-style 32-bit codes over ~30 s from the
   middle), compared by bit error rate at the best alignment, candidates via locality-sensitive hashing.
3. **Probable**: normalised artist + title and duration within ±3 s, flagged "check these".
The preferred copy is the best quality tier, then higher bitrate/sample rate, then most used. The user
can override. v1 never deletes files.

## Consequences
- Catches cross-format duplicates, the case DJs most need (to drop the MP3 in favour of the FLAC).
- Fingerprints cost analysis time and ~1–2 KB per track (stored in the rebuildable cache).
