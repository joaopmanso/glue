---
status: accepted
date: 2026-09-28
---
# 0092. The first question: how GLUE is used on this device

Phase O of the [plan for one shared collection](../product/plan-shared-collection.md). Keeps
[ADR 0002](0002-static-client-only-app.md)'s promise ("nothing leaves the machine") as the default.

## Context
The user (2026-09-28): GLUE must work without a cloud account and without GLUE Home. Onboarding
should make the options easy to understand: local only, or with GLUE Home. A local-only user can opt
into cloud sync later, with or without GLUE Home.

Before this, first run only asked where to save GLUE's data. Signing in, cloud sync (on by default
once signed in) and GLUE Home were found elsewhere (the start page's GLUE Cloud panel, Devices).

## Decision
- **The welcome step asks one question first**, "How will you use GLUE here?", with four choices,
  each saying in a line what it means:
  - **Just this computer** (the default on a computer): no account, nothing leaves it. It leads to
    the folder choice.
  - **This computer, synced:** sign in (GLUE Cloud panel below), then the folder choice. Cloud sync
    is on for its profiles.
  - **This computer, with GLUE Home:** the installer for this OS, sign in, a pairing code (with the
    `gluehome://` link), then the folder choice, which is GLUE Home's own window once it's connected.
  - **Open my library from another device** (the default on a phone): sign in only. The account's
    library opens by itself (ADR 0077), and the device is a session, not a device (ADR 0091).
- **The choice is kept** (pref `onboard`).
- **"Just this computer" creates its profiles with cloud sync off**, so nothing is uploaded even if
  the user is signed in.
- **The profile screen's "This computer" card** says which of the three it is now (local, synced, or
  with GLUE Home), with the next step:
  - "Turn on cloud sync";
  - "Add GLUE Home" (the installer, then "+ GLUE Home" in Devices);
  - or how to stop syncing a profile (its switch).

  No choice is final.

## Consequences
- A new user sees at once that GLUE works with nothing uploaded, and what an account or GLUE Home
  would add.
- Existing users see nothing new until the profile screen's card. Their mode is worked out from
  sign-in and pairing.
- Moving the local library into the shared collection when sync is turned on later is phase 2's
  seeding (the plan).
