---
status: shipped
milestone: M2
updated: 2026-09-24
adrs: [0018, 0009]
---
# Profiles

## What it does
Local users without passwords: each profile has a name and a colour and its own collections and
playlists. Several people, or personas ("Club", "Weddings"), can share one computer and MCO folder.

## Behaviour
- First run, after choosing the MCO folder: "Who's using MCO?" → create a profile (name; colour picked
  automatically, changeable).
- Header shows the current profile; its menu lists the others, "New profile", "Rename".
- MCO remembers the last profile and opens it directly next time.
- Deleting a profile asks for confirmation in the page and removes its folder.

## How it works
`MCO/mco.json` lists profiles; `MCO/profiles/<pid>/profile.json` holds the profile and its
collections list. See [ADR 0018](../adr/0018-local-profiles.md).

## Acceptance
- [ ] Create two profiles, each with its own collection; switching shows the right one.
- [ ] Reload opens the last profile without asking.

## Shipped in M2 (2026-09-24)
- First run: choose the MCO folder, then "Who's using MCO?" to create a profile; its first collection
  ("My collection") is created with it. The last profile and collection open directly next time.
- The header chip switches profile; the profile screen renames and deletes (with confirmation).
- Code: `src/store/home.ts`, `src/lib/library.svelte.ts`, `src/ui/library/Welcome.svelte`.
- Not yet: changing a profile's colour.
