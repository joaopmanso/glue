---
status: accepted
date: 2026-09-30
---
# 0114. The account's profiles are every device's; each device picks its own

Amends [ADR 0113](0113-profiles-are-the-accounts-aliases.md): replaces "seeded once, then the account's list is
the truth, a device's own drop out".

## Context
With 0113 deployed, the user (2026-09-30): "the goal is to unify the profiles. If 3 exist at the moment then it
should show all three on all devices, so I can choose the one I prefer as default for that device. If I then
want to delete some extra ones I can manage it myself."

0113 did the opposite: the first computer's list won, and every other device's own profiles (the laptop's "404",
the iPhone's "Joao Manso") dropped out of its list.

## Decision
- **The account's list is the union of every device's profiles.** Signed in, a device sends the profiles it has
  that the account doesn't, with their ids (`POST /v1/profiles/merge`, which adds only ids it has never had),
  and takes the account's list. Two of the same name both stay; the user deletes the extra.
- **A deletion is final for every device.** The account keeps the deleted id (`gone` in `GET /v1/profiles`).
  A device that still has it drops it and never sends it again; making it again under the same id is refused.
- **Each device keeps its own choice** (`mco.json` `lastAlias`). If that profile is deleted elsewhere, the device
  takes the only one left, or "Who's using GLUE?" asks.
- **Put back once:** the profiles 0113 dropped from a device's list come back, from its profile folders
  (`mco.json` `aliasesV: 2`). A "Library" folder that a device with no library made that day was never a
  profile, so it isn't one now.
- `POST /v1/profiles/seed` (0113's) now does the same as `merge`, for tabs from before.

## Consequences
- The user sees "404" (desktop), "404" (laptop) and "Joao Manso" (iPhone) on every device, picks one per
  device, and deletes the others.
- A profile made while signed out joins the account at the next sign-in (0113 dropped it).
