---
status: shipped
milestone: M2
updated: 2026-09-30
adrs: [0018, 0009, 0113]
---
# Profiles

## What it does
Local users without passwords: each profile has a name and a colour and its own collections and
playlists. Several people, or personas ("Club", "Weddings"), can share one computer and GLUE folder.

## Behaviour
- First run, after choosing the GLUE folder: "Who's using GLUE?" → create a profile (name; colour picked
  automatically, changeable).
- Header shows the current profile; its menu lists the others, "New profile", "Rename".
- GLUE remembers the last profile and opens it directly next time.
- Deleting a profile asks for confirmation in the page and removes its folder.

## How it works
`GLUE/mco.json` lists profiles; `GLUE/profiles/<pid>/profile.json` holds the profile and its
collections list. See [ADR 0018](../adr/0018-local-profiles.md).

## Acceptance
- [ ] Create two profiles, each with its own collection; switching shows the right one.
- [ ] Reload opens the last profile without asking.

## Shipped in M2 (2026-09-24)
- First run: choose the GLUE folder, then "Who's using GLUE?" to create a profile; its first collection
  ("My collection") is created with it. The last profile and collection open directly next time.
- The header chip switches profile; the profile screen renames and deletes (with confirmation).
- Code: `src/store/home.ts`, `src/lib/library.svelte.ts`, `src/ui/library/Welcome.svelte`.
- Not yet: changing a profile's colour.

- 2026-09-24: per-profile Backup / Rename / Delete buttons, restore from a backup zip, and a three-step
  first run ending with an "Add your music" step ([ADR 0026](../adr/0026-profile-backups-and-wipe.md)).

## Back to the library (2026-09-27)
- **"Who's using GLUE?"** has "← Back to the library", which reopens the profile it was opened from
  (`lib.lastProfile`, `backToLibrary()`).
- **The header's GLUE logo** does the same there. It used to stay on the profile screen, and clicking
  the profile's name was the only way back.

## Profiles are the account's artist aliases (2026-09-30, [ADR 0113](../adr/0113-profiles-are-the-accounts-aliases.md))
- An alias: id, name, colour, BPM range. The account keeps the list (GLUE Cloud migration 0010,
  `/v1/profiles`); `mco.json` keeps a copy (`aliases`, `lastAlias`) for offline.
- Seeded once, with their ids, by the first computer with a GLUE folder of its own (`lib/profiles.svelte.ts`);
  a phone never seeds. After that the account's list is the truth; the alias in use becomes its namesake or
  the only one, else "Who's using GLUE?" asks.
- One library per GLUE folder: the profile folder named in `mco.json.container`; every alias opens it
  (`lib.useAlias`). Nothing moved on disk; `profiles`/`lastProfile` stay for older readers. More than one
  profile folder from before: a "Library" choice on "This computer" (`#library-pick`).
- "Who's using GLUE?": pick, create, rename, delete an alias, its BPM range. Backup (`#backup-library`) and
  Cloud sync (`[data-sync]`) are the library's, on "This computer". Deleting an alias never deletes the library.
- Tests: `tests/aliases.test.ts` (the migration, one and two profile folders, read-only), `tests/cloud.test.ts`
  (seed once, CRUD), e2e `phone.spec` (the phone is 404), `shared.spec` (namesake, rename and a new alias
  across devices, the same library).
