---
status: in-progress
milestone: M6
updated: 2026-09-25
adrs: [0036, 0040, 0041, 0042, 0043, 0037, 0038]
---
# GLUE Cloud: accounts, GLUE Home and devices

## What it does
An optional tier. You sign in with Google or Apple. On the computer with your main collection you
run **GLUE Home**, a small app. From the GLUE website on any other computer you can see that
collection, play its tracks, download tracks or playlists, and upload new music into GLUE Home's
incoming folder. Your devices appear in the library, and duplicates are found across them. Without
an account GLUE works exactly as today, all local.

## Behaviour
- **Accounts are optional.** The website never requires one; the local library, folders and backups
  are unchanged. An account is needed only for GLUE Home and for seeing other devices.
- **Sign-in:** Google first; Apple later, once there's an Apple Developer membership (user,
  2026-09-25). The cloud keeps only who you are and which devices you have.
- **Pairing GLUE Home** (two ways):
  - **Code:** the signed-in website shows a short code (e.g. `GLUE-7KQ4-M2`, valid 10 minutes,
    single use), and you type it into GLUE Home. This also works on a headless machine or NAS.
  - **Same account:** GLUE Home opens the browser to sign in with Google (Apple doesn't allow it).
- **Devices** in the sidebar:
  - "This browser", plus each GLUE Home ("Studio PC · online", "NAS · last seen 2 days ago");
  - rename or revoke a device from the website.
- **A remote library:**
  - Open a device to see its collections, playlists, tags, ratings and analysis, read-only in the
    first release.
  - ▶ streams with seeking, and the mini spectrograms scrub as locally.
  - Download: one track, a selection, or a playlist (files plus M3U8, or a zip).
  - "Copy to this computer" adds the files to a local collection.
- **Upload:** drop files on a GLUE Home device (or pick it in "Add songs"). They're written into
  GLUE Home's **incoming folder** (configurable; default `Music/GLUE Incoming`) with a progress bar,
  resume and a checksum. GLUE Home scans them into its library.
- **Duplicates across devices:** the same recording (acoustic fingerprint) or the same file (size and
  a partial hash) on two devices. Rows get a "Also on Studio PC" badge, and the Duplicates view gets
  a device column.
- **Offline devices:** the last snapshot of their library stays browsable (marked stale). Playing
  and downloading need the device online.

## How it works (proposed; see the ADRs)
- **Cloud** ([ADR 0036](../adr/0036-optional-accounts-and-cloud-signaling.md)):
  - Cloudflare's free tier: a Worker API, a D1 SQL database, and a Durable Object per user for
    signaling;
  - tables: users, identities, devices (name, public key, last seen, revoked), pairing codes
    (stored hashed), plan / relay quota;
  - No library data, file names or audio is stored in the cloud.
- **Transport** ([ADR 0037](../adr/0037-p2p-webrtc-transport.md)):
  - WebRTC data channels between the browser and GLUE Home, direct when possible (LAN or the
    internet) and through a TURN relay when not; DTLS-encrypted end to end;
  - each device's key signs its DTLS fingerprint, so the signaling server can't sit in the middle;
  - a small request/response protocol over the channel (list, get file range, put file chunk…);
  - a Service Worker turns `…/remote/<device>/<track>` URLs into Range responses, so the normal
    `<audio>` element plays and seeks.
- **GLUE Home** ([ADR 0038](../adr/0038-glue-home-app.md)):
  - a Node.js / TypeScript app that reuses `src/core` (parsers, verdicts, fingerprints, playlists),
    packaged as a single executable (Windows and macOS first; Linux / NAS later), with a tray icon
    and optional start at login;
  - it opens the same GLUE folder format;
  - it serves only its GLUE folder, music folders and incoming folder, never arbitrary paths.
  - First release: it reads the store and files, and writes only into the incoming folder. The
    GLUE tab on that computer imports incoming files as usual, so there's never a second writer
    of the JSON store.
- **In the website:**
  - `src/platform/remote.ts`, a new platform provider (ADR 0007): a remote collection behaves like
    a read-only local one;
  - `src/lib/devices.svelte.ts` for devices, presence and pairing;
  - `src/lib/account.svelte.ts` for sign-in.

## Accounts, tiers and admin (built 2026-09-25, [ADR 0041](../adr/0041-passwords-tiers-admin.md))
- **Sign-in:** Google, or email + password with a short register form (header › Sign in, and the
  GLUE Cloud panel). The password is stretched in the browser, and only a salted hash of that is
  stored. No email check yet.
- **Tiers:** free / paid / admin; everyone is on paid. The account menu shows the plan.
- **Admin:** joao.pedro.manso@gmail.com through Google only (`ADMIN_EMAILS`). The **Admin** tab
  opens `#/admin`: statistics, users (tier, clear cloud data, delete), maintenance.
- **Code:**
  - `cloud/src/admin.ts`, `cloud/migrations/0003_tiers_passwords.sql`;
  - `src/ui/EmailSignIn.svelte`, `src/ui/AdminView.svelte`;
  - `passwordKey` in `src/lib/account.svelte.ts`.

## Merged collection in the library (built 2026-09-25, [ADR 0042](../adr/0042-merged-collection-in-the-local-library.md))
- **Sync by default:** signed in, every profile syncs unless its Cloud sync button is turned off.
- **Merges by itself:** a collection opens → it's merged with the same-named one on another device
  (or the only one there is). Unmerge in the cloud panel sticks.
- **One library:** the other devices' songs and playlists show in this computer's own library,
  from a copy in the GLUE folder (`cloud/<device>-<profile>.json`): instant, and offline too.
  "Updating from Desktop… 3,200 of 7,000 songs" while it refreshes: only files that changed, many
  per request, playlists and songs first, shown as they arrive
  ([ADR 0043](../adr/0043-batched-sync-and-progressive-loading.md)).
- **Device column** (only with several devices' songs): coloured chips, click to filter; also in
  Filter › Device. Sidebar › Devices: each device's colour, songs, when it synced, a streaming-off
  mark, and click to show only its songs. The ⋯ menu floats where it fits.
- **Other devices' songs:** no play button; the track page says where the file is (no permission
  step) and shows the analysis summary from there. Ratings, notes, tags and shared playlists edited
  here are sent to the device that has the song.
- **Code:** `core/library/overlay.ts`, `lib.applyOverlay`, `CollectionStore.ephemeral`,
  `lib/sync.svelte.ts` (`syncCollection`, `autoLink`, `mirror`), `lib/devices.ts`.
- **Tests:** `tests/overlay.test.ts` (overlay, edits to owners, nothing saved); e2e "cloud sync…"
  (default on, automatic merge, loading signal, Device column and filters, track page, offline
  reload from the copy).

## Cloud sync and merged collections (built 2026-09-25, [ADR 0040](../adr/0040-cloud-sync-and-merged-collections.md))
Parts of this were replaced by the section above (ADR 0042): sync is no longer opt-in, and the
setup dialog is gone.
- **Profile screen:**
  - **Cloud sync** per profile ("Synced 2 min ago"; a problem shows in the tooltip);
  - the **GLUE Cloud** panel: Google sign-in; every device's synced collections and the merged ones,
    with **Open**; delete a profile's cloud copy; "Delete everything in my cloud".
  - The same panel is on the start page, so a new browser can open the collection without any setup.
- **Linking a second device:** when the account has other devices' collections, the setup dialog
  asks, per collection, "keep separate" or "merge with …" (same name suggested).
- **Cloud view:**
  - a banner says whose collection it is and when it was last synced, with Back / Close;
  - rows show the devices that have them ("Laptop · Desktop");
  - ratings, notes, tags and playlists can be edited; they're queued for the owning device(s),
    which apply them on open.
  - Playing, analysis, music folders and imports are this-computer only.
- **Code:**
  - `src/lib/sync.svelte.ts`: push, pull and views;
  - `core/library/cloudEdits.ts`, `core/library/mergeCollections.ts`;
  - `cloud/src/sync.ts`, `cloud/migrations/0002_sync.sql`;
  - UI: `CloudPanel` (`SyncSetup` was removed with ADR 0042).
- **Tests:**
  - `tests/cloudsync.test.ts`: edits, merge, translate;
  - `tests/cloud.test.ts`: sync, links, ops, clean-up, on SQLite;
  - e2e "cloud sync…": upload, open, edit reaches the device, merge, clean up, against a stand-in
    API.
- **Found while testing:** a `File` goes stale if the library saves that file meanwhile
  (`NotReadableError`), so uploads read each file fresh and retry. The setup dialog must run once:
  saving the profile re-triggered it.

## Built (phase 1, 2026-09-25, live)
- **Live:**
  - the API, D1 (`glue`) and the signaling room are deployed, and push-to-deploy runs from GitHub;
  - a live smoke test with a temporary user passed (pair → online → signal → revoke → kicked);
  - deleting a user cascades on D1;
  - the Google button loads on the live site without origin errors.
  - Sign-in with a real Google account is for the user to try: while the Google app is in "Testing",
    only listed test users can sign in.
- **API**, a Cloudflare Worker in `cloud/`:
  - `src/api.ts`: Google sign-in (ID token checked against Google's keys), rotating refresh
    tokens, devices, pairing codes, account deletion;
  - `src/crypto.ts`: tokens and signatures;
  - `src/signal.ts`: the per-user room (a Durable Object with hibernating WebSockets), for presence
    and relayed signals;
  - `migrations/0001_init.sql` for D1;
  - deployed by `.github/workflows/cloud.yml`, which skips until the D1 database exists.
  - Address: `glue-api.joaopmanso.workers.dev`.
  - Secrets: GitHub secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`; a local copy outside the
    repo in `%USERPROFILE%\.glue-secrets\cloudflare.env`; `SESSION_KEY` as a Worker secret.
- **Website:**
  - `src/lib/account.svelte.ts` handles sign-in, sessions, devices, pairing and presence;
  - the header's **Sign in** (`AccountButton`) appears only when the API answers;
  - Sidebar › **Devices** (`DevicesSection`): online dots, rename, remove, "+ GLUE Home" with
    the pairing code (the dialog closes when GLUE Home joins).
- **GLUE Home preview** (`home/src/`), Node 24 running the TypeScript directly:
  `node home/src/main.ts pair CODE`, then `run`. It keeps a private device credential in
  `~/.glue-home/config.json`, stays online, reconnects, and stops when removed.
- **Tests:**
  - `tests/cloud.test.ts`: the API on real SQLite, with test-signed Google tokens;
  - `tests/home.test.ts`: pairing;
  - e2e "GLUE account…": Google, API and room stand-ins;
  - `cloud/smoke-local.ts` against `wrangler dev`: pair, presence, signal, revoke.
- **Local-runtime quirk:** close handshakes from the room didn't reach clients in `wrangler dev`.
  The room now sends `removed` / `replaced` messages before closing, and clients act on those.

## Phases
First release: phases 1–3 (user, 2026-09-25).

1. **Accounts & devices** (built, deploy pending):
   - optional Google sign-in, a device list, pairing codes;
   - GLUE Home skeleton: pair, stay online, show status.
2. **Remote library:** browse, stream with seeking, download, copy to this computer; TURN
   fallback.
3. **Upload** into the incoming folder; GLUE Home watches it.
4. **Cross-device duplicates:** GLUE Home shares its fingerprint index; matching runs in the
   browser.
5. **Later:**
   - remote edits (playlists, ratings, tags from anywhere): needs a sync design with GLUE Home as
     the single writer;
   - GLUE Home analyses new music on its own (wasm decoders), reads rekordbox's master.db and knows
     absolute paths (the desktop-client items on the roadmap).

## Acceptance (phase 2, draft)
- [ ] From another network, a paired GLUE Home's collection lists within 3 s.
- [ ] A 50 MB WAV starts playing within 2 s and seeks anywhere.
- [ ] Download of a 20-track playlist as a zip with an M3U8.
- [ ] Works with no account on the local side; revoking a device cuts it off at once.

## Limits & open questions
- **Cloud service:** Cloudflare free tier, proposed after the user asked for a free SQL database
  (ADR 0036).
- **Relay costs:** direct connections are free; relayed traffic costs money per GB. This is where
  a paid tier makes sense (a relay quota).
- **Apple sign-in** needs an Apple Developer membership and verified domains; a custom domain for
  GLUE would help with this and with the rename.
- **Fingerprints** live in the browser's own storage today, which GLUE Home can't read. Either
  store them in the GLUE folder (tens of MB for 10k tracks), or let GLUE Home compute them.
- **Two writers:** the phase-1 rule (GLUE Home writes only files) avoids JSON conflicts. Remote
  edits need a real sync design.
