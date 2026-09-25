---
status: in-progress
milestone: M6
updated: 2026-09-25
adrs: [0036, 0037, 0038]
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

## Built (phase 1, 2026-09-25)
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
