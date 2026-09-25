---
status: shipped
milestone: M2
updated: 2026-09-24
adrs: [0018, 0009]
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
