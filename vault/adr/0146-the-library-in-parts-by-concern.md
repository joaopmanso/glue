---
status: accepted
date: 2026-10-02
---
# 0146. Keep the library's methods in parts by concern, behind the same `lib`

## Context
`src/lib/library.svelte.ts` had grown to 1,567 lines: one `Library` class holding the GLUE folder, profiles,
collections, music folders, DJ libraries, playlists and edits, songs' files and the analysis queue. `Library` is the
code map's top hub (148 edges): most changes touch it, and a session read large parts of the file to change one of
them. The user asked for less reading (tokens) per change, 2026-10-02.

Every screen uses `lib.<method>()` and `lib.<field>`, and some modules pass `lib`'s callbacks around, so changing the
API means touching dozens of files.

## Decision
The class keeps its state, and its methods live in parts by concern:
- `src/lib/library.svelte.ts`: every field (the `$state` ones must be declared in the class, in a `.svelte.ts`
  file), the getters and setters, the constructor, and the shared helpers (`memo`, `fail`), in their order from
  before. About 200 lines.
- `src/lib/library/<part>.ts`: an object of methods with `this: Library`:
  - `glueFolder`: the GLUE folder, GLUE Home's disk and back, the writer lock;
  - `profiles`: aliases, the library, backups;
  - `collections`: opening, closing, saving, songs shown but not saved;
  - `folders`: music folders, TO BE SORTED, scanning, folders away;
  - `djLibraries`: found, imported, their playlists;
  - `edits`: playlists, tags, ratings, info, indexes;
  - `files`: playing and reading songs, songs added on their own, removing;
  - `analysis`: the queue, the pool, details, verdicts judged again.
- The class file installs them: `interface Library extends typeof <part> & …` for the types, and each part's
  property descriptors on `Library.prototype` (getters would be read, not copied, by `Object.assign`). `lib` and its
  API are unchanged.

The split was done by a script over the TypeScript syntax tree: members moved whole with their comments, `this:
Library` added, `private` dropped (a part can't reach a private member), and only the imports each part uses.

## Alternatives considered
- **Sub-objects** (`lib.analysisQueue.pump()`): clearer ownership, but every caller changes, and the state still
  crosses concerns (the analysis reads the folders' and the store's).
- **Thin delegating methods in the class** (`pump() { return analysis.pump(this); }`): explicit, but every
  signature twice, and the class file stays long.
- **Leave it**: the most-read file stays the biggest.

## Consequences
- A change to one concern reads one part (130–240 lines) and, at most, the class file's fields.
- Nothing in the class is `private` any more: "internal" is said in comments. Parts call each other through `this`.
- A new method goes in the part of its concern (`this: Library` first); a new field goes in the class. A part needing
  `$state` or another rune becomes `<part>.svelte.ts`.
- **The fields keep their order.** Regrouping them by part (no other change) made a race show in
  `e2e/shared.spec.ts` "the desktop's DJ library on the laptop" about 1 run in 7, against none in 30 with the old
  order. Not understood yet. The race itself is older: a song of the shared collection that reaches the laptop
  without `copies` (an unlinked rekordbox record, still in the local form) is shown there as having no file, and the
  "no file" bar offers to remove it (see the handoff).
- Arrow-function fields that other modules set or pass around (`remoteFile`, `onThumb`…) stay fields in the class.
