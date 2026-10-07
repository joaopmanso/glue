---
status: accepted
date: 2026-10-07
---
# 0161. Never write a computer's own form into a shared collection; give a record without copies its writer's copy

## Context
Found 2026-10-02: a song of a shared collection (ADR 0094) can reach another computer with no `copies`, its file
fields (`status`, `rootId`, `importPath`, `sources`…) at the top of the record, as a collection of a computer's own
holds them. There `toLocal` found no copy at all: the song had no `remote`, so it was taken for the reading computer's
own song with no file. "No file linked" offered to remove it, on every device, and a save there gave it an empty copy
of that computer's.

Who writes that form: a store opened as the computer's own (a collection not shared yet) that saves after the
collection became shared. `makeShared` converts the files and writes `collection.json` last. The website closes its
store first (`share`). But a store opened elsewhere stays open in the old form: another tab, or GLUE Home's engine,
which keeps its store for the whole run. Its next save writes its songs, analyses and DJ libraries (without their
`computer`) over the converted files, and the sync sends them to every device. The e2e test "the desktop's DJ library"
showed it about once in seven runs **[the reproduction was in that test; the writer above is the explanation that
fits, not caught in the act]**.

## Decision
- **No writes from a store opened as the computer's own once the collection is shared.** Before every save, such a
  store (`CollectionStore.flush`, `glue_store::Store::flush`) reads `collection.json`. When it says `shared`, it drops
  what it had to write and fails (`OutdatedStore` on the website, `OUTDATED` in Rust). The website opens the collection
  again (in the shared form); GLUE Home's engine lets go of the store, and the next request reads it again. The website
  remembers it (`store.outdated`), so it never reads twice.
- **A record without copies is put right where it's read** (`withCopies`, `project::with_copies`, in `takeTracks` /
  `take_tracks`, so on load and on every file a sync brings). Its copy is the computer's that wrote it:
  1. the member whose music folders (`rootsBy`) hold its `rootId`;
  2. else the member whose DJ libraries (`sources`, read before the songs now) it came from;
  3. else the only member.
  When one of these names a single computer, the record is saved so and the sync carries it to the other devices.
  Otherwise it's nobody's (`copies: {}`), never a guess. The old stand-in id (`this-computer`) never counts.
- Both stores do the same, held together by the store goldens `without-copies` and `without-copies-two`.

## Alternatives considered
- **Mark the collection "being shared" in `collection.json` first, so a save during `makeShared` is refused too:** the
  website's own store is closed during it. A crash in the middle would leave a collection no store writes until it's
  shared again, which needs `makeShared` to run again over half-converted files. Not worth it for a window the website
  already closes.
- **`toLocal` showing a record without copies as nobody's:** the record would stay broken in the files, and a save
  anywhere would still claim it with an empty copy. Putting it right on read fixes the files for every device.
- **Repairing only by "the only member":** by the time another device reads the record, it's usually a member too. The
  music folder or DJ library names the writer.

## Consequences
- A store opened as the computer's own reads `collection.json` before each save: one small read per save, only for
  collections not shared.
- What such a store had to write when it found the collection shared is lost: an edit made in that moment, an
  analysis (GLUE Home's queue does it again).
- A record whose writer can't be told stays nobody's, and the first device that saves its file takes it as its own
  with no file (as for any song with no copies left).
