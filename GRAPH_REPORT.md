# Graph Report - glue  (2026-10-03)

## Corpus Check
- 735 files · ~604,639 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5447 nodes · 13891 edges · 246 communities (197 shown, 49 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 357 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- parse.rs
- main.rs
- analysis.rs
- guide.svelte.ts
- events.svelte.ts
- vitest
- Track
- collection.ts
- interop/types.ts
- core/types.ts
- stems.svelte.ts
- App.svelte
- importActions.ts
- service.ts
- local.rs
- LibSidebar.svelte
- ADR 0094: One shared collection in GLUE Cloud, the same on every device
- ui/analysis.ts
- store/types.ts
- shared/engine.ts
- sharedSync.ts
- parse.ts
- merge.ts
- api.ts
- remoteFiles.svelte.ts
- GLUE vault overview and conventions
- ADR 0150: GLUE Home's connections to other devices are Rust's
- cache.ts
- edits.ts
- auto.svelte.ts
- .serve()
- covers.svelte.ts
- menu.svelte.ts
- platform/index.ts
- protocol.rs
- thumbs.svelte.ts
- folders.ts
- ws.rs
- writePref()
- app.svelte.ts
- Welcome.svelte
- handle()
- ADR 0103: GLUE Home analyses its computer's songs; the tab takes the results; Stop, Analyse now, and
- rtc.rs
- view.svelte.ts
- incoming.svelte.ts
- localHome.svelte.ts
- verdict.rs
- shared.svelte.ts
- fsx.ts
- GLUE Cloud: accounts, GLUE Home and devices
- ADR 0082: Other devices get songs' covers from GLUE Home, and keep them; GLUE Cloud never has them
- dupes.svelte.ts
- bundle
- library/analysis.ts
- linked.ts
- GLUE: how it works now
- files.rs
- themes.svelte.ts
- account
- library.svelte.ts
- Roadmap
- analyze.rs
- types.rs
- disk.rs
- lib/analysis.ts
- trackMenu.ts
- Disk
- ADR 0136: Analysis limits are the user's to set, with the speed shown and a suggestion from it
- ADR 0108: One id per computer: GLUE Home learns it, only the computer's GLUE folder writes its parts
- crypto.ts
- backup.ts
- launch()
- ADR 0067: One context menu for the library page: right-click (or ⋯) on anything there
- format.ts
- remoteFiles
- player
- users
- dsd.rs
- lookup.ts
- DuplicatesView.svelte
- homeDisk.ts
- admin.ts
- library.ts
- make-audio.ts
- nowPlaying
- player.svelte.ts
- CollectionStore
- verdict.ts
- Library
- ui/engine.ts
- PrepareView.svelte
- flac.ts
- analyse()
- signal.ts
- js.rs
- duplicates.ts
- nowPlaying.svelte.ts
- smoke-local.ts
- Stem separation
- shared.spec.ts
- phone.spec.ts
- ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address
- tags.rs
- lib/perf.ts
- HomeStore
- Player
- libraries.rs
- prepare.svelte.ts
- cover.rs
- dock.rs
- ADR 0147: GLUE Home analyses natively, in Rust
- @playwright/test
- graph_docs.py
- bridge.ts
- package.json
- homeMode()
- merge3.ts
- golden.test.ts
- lib/ice.ts
- dupes.rs
- relink.ts
- DevicesSection.svelte
- PlayerPanel.svelte
- glue-rtc/src/lib.rs
- golden.rs
- compilerOptions
- engineClient
- ADR 0091: A device is a computer; signing in only to browse is a session
- ADR 0113: Profiles are the account's artist aliases; a GLUE folder keeps one library that every alia
- js
- ADR 0033: Tolerate gentle top-end roll-offs; re-check stored verdicts when the rules change
- graph.mjs
- fakeHome.ts
- homemode.spec.ts
- perf.spec.ts
- ADR 0133: A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what
- anywhere.svelte.ts
- phone
- PhoneSongs.svelte
- homeHandover.ts
- lossy-fixtures.mjs
- HomeSocket
- summary.rs
- dependencies
- versions.test.ts
- auto
- activity.rs
- src/profiles.ts
- ADR 0106: Keep the shared collection in GLUE Cloud as a snapshot and a log of changes
- ADR 0144: FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so
- ADR 0052: A Prepare tab: waveform, beat grid, metronome and the user's corrections
- devDependencies
- lib/bpm.ts
- account.svelte.ts
- columns
- homeAnalysis.svelte.ts
- fingerprint.rs
- GLUE Home
- ADR 0141: Songs played get their own port, and a file read looks up only its own folder
- library.spec.ts
- drag
- incoming
- Waterfall3D
- lossy.rs
- ADR 0044: GLUE Home is a Tauri tray app; the website sends songs to it over WebRTC
- cloud/package.json
- ADR 0076: Songs stream by byte range: the local link in Home mode, a service worker for other comput
- ADR 0086: GLUE Home looks up missing covers on public services
- ADR 0138: What the user asks for goes first: background requests gated, playing ahead of the analysi
- capture.ts
- browse.ts
- names.ts
- types
- lossy_golden.rs
- scripts
- rtc-probe.mjs
- wave.ts
- Gate
- metronome
- HomeFile
- control.rs
- guide.spec.ts
- ADR 0068: A full player: a queue, an open view with the visualiser, the sound output; drivers throug
- 0132. Connections to GLUE Home are bounded: abandoned set-ups let go, failures said, reconnects paced
- ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put
- Arriving
- Handler<H>
- ref_node_path
- tsconfig.test.json
- Help: DJ libraries
- 0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it
- EditInfo.svelte
- Vision
- dock.ts
- engine.svelte.ts
- sidebar
- tabs
- turn.ts
- default.json
- ADR 0088: Another computer's AIFF songs stream, as WAV worked out a piece at a time
- output
- 0137. This computer's browser is never a remote session, and isn't counted; the direct link isn't dropped on one slow answer
- 0139. A socket for the background loads from GLUE Home, and a list that stays put
- 0140. A song played pauses the analysis's reads, not only its new songs
- 0145. Judge "the same name" one way, in `core/library/names.ts`
- sorted()
- Help: Getting started
- anywhere
- glue-home
- @sveltejs/vite-plugin-svelte
- Help: Adding music
- Tour: analyze
- Tour: calendar
- Help: Backups and restoring
- Help: gluey
- Help: phone
- Help: playlists
- Help: themes
- Deploy GLUE Cloud workflow
- End-to-end tests workflow
- Follow threejs-visualisers workflow
- GLUE Home release notes (installers, unsigned)
- GLUE Home settings page
- legacy/index.html
- Profile
- Collections
- Library filter
- Library search
- Pool: background analysis worker orchestration
- Local home platform
- Thumbnails, waveforms, covers loader
- Library class

## God Nodes (most connected - your core abstractions)
1. `GLUE vault overview and conventions` - 151 edges
2. `Track` - 114 edges
3. `vitest` - 61 edges
4. `CollectionStore` - 58 edges
5. `handle()` - 52 edges
6. `shardOf()` - 52 edges
7. `Roadmap` - 52 edges
8. `account` - 44 edges
9. `writePref()` - 44 edges
10. `GLUE Cloud: accounts, GLUE Home and devices` - 41 edges

## Surprising Connections (you probably didn't know these)
- `Alternatives considered` --references--> `trackKey()`  [INFERRED]
  vault/adr/0130-same-file-on-two-computers-is-one-song.md → src/core/shared/match.ts
- `Context` --references--> `applyScan()`  [INFERRED]
  vault/adr/0130-same-file-on-two-computers-is-one-song.md → src/store/merge.ts
- `Context` --references--> `connectHome()`  [INFERRED]
  vault/adr/0132-connections-to-glue-home-are-bounded.md → src/lib/homeLink.ts
- `Context` --references--> `fillInfo()`  [INFERRED]
  vault/adr/0135-analysis-around-network-folders-and-tags-by-glue-home.md → src/core/library/tags.ts
- `Alternatives considered` --references--> `companionOf()`  [INFERRED]
  vault/adr/0143-a-sync-takes-in-what-it-wrote-and-looking-for-glue-home-needs-a-reason.md → src/lib/remoteFiles.svelte.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Stored analysis evolution** — vault_adr_0019_background_analysis_decoding_decision, vault_adr_0023_store_track_page_analysis_decision, vault_adr_0024_background_stores_full_analysis_decision [EXTRACTED 0.75]
- **GLUE Home engine and dropped files decisions** — vault_adr_0122_stop_stops_everything_dropped_folders_found_decision, vault_adr_0123_music_folders_that_come_and_go_decision, vault_adr_0125_dropped_songs_placed_by_glue_home_decision [EXTRACTED 0.85]
- **Client-side stem separation pipeline** — vault_adr_0003_client_side_stems_webgpu, vault_adr_0004_float64_model_patch, vault_adr_0005_model_from_huggingface [EXTRACTED 0.90]
- **Analysis flow: concurrency -> speed tracking -> suggestion** — network_folder_concurrency, speed_suggestion_algorithm [EXTRACTED 1.00]
- **Analysis storage lifecycle: background summary then track page full storage** — vault_adr_0019_background_analysis_decoding_decision, vault_adr_0023_store_track_page_analysis_decision, track_page_analysis_storage_concept [EXTRACTED 1.00]
- **Background analysis: worker pool processes songs through analysis pipeline** — vault_features_background_analysis_feature, worker_pool_mechanism, analysis_pipeline_concept [EXTRACTED 1.00]
- **FLAC analysis and failure handling** — vault_adr_0144_flac_decoded_by_glue_and_a_song_given_up_on_says_so_decision, src_core_formats_flac_code [EXTRACTED 1.00]
- **Player bar and queue UI system** — full_player_bar_ui, queue_system, visualiser_feature [EXTRACTED 1.00]
- **Library refactoring for tokenization** — vault_adr_0146_the_library_in_parts_by_concern_decision, src_lib_library_svelte, vault_adr_0146_glue_folder_part, vault_adr_0146_profiles_part, vault_adr_0146_collections_part [EXTRACTED 1.00]
- **Cloud sync lineage** — vault_adr_0036_optional_accounts_and_cloud_signaling_decision, vault_adr_0040_cloud_sync_and_merged_collections_decision, vault_adr_0042_merged_collection_in_the_local_library_decision, vault_adr_0043_batched_sync_and_progressive_loading_decision [INFERRED 0.85]
- **Multi-device sync workflow: account, collection, shared sync** — account_concept [INFERRED 0.85]
- **Direct link reliability under load** — remote_session_concept [INFERRED 0.85]
- **DJ library importers** — vault_features_import_rekordbox_feature, vault_features_import_engine_feature, vault_features_import_traktor_feature, vault_features_import_serato_feature, vault_features_import_apple_icloud_feature [INFERRED 0.85]
- **Remote playback flow** — src_help_glue_home_device, device_remote_playback, streaming_remote_songs [INFERRED 0.85]
- **GLUE Home as engine decisions** — vault_adr_0103_glue_home_analyses_its_computers_songs_decision, vault_adr_0104_glue_home_is_the_librarys_engine_decision, vault_adr_0108_one_id_per_computer_decision, vault_adr_0110_screen_takes_glue_homes_analyses_decision, vault_adr_0115_any_browser_takes_glue_homes_link_decision [INFERRED 0.85]
- **Streaming songs to other devices through GLUE Home** — rtcpeerconnection_concept, vault_adr_0132_connections_to_glue_home_are_bounded_decision [INFERRED 0.85]
- **Playback prioritization system** — src_help_glue_home_device, playback_prioritization, glue_home_streaming_port [INFERRED 0.85]
- **Quality assessment: analysis produces verdicts and findings via quality verdict mechanism** — analysis_pipeline_concept, vault_features_background_analysis_feature [INFERRED 0.85]
- **Shared collection and account sync decisions** — vault_adr_0096_move_merged_collections_into_the_shared_one_decision, vault_adr_0097_glue_home_syncs_shared_collections_decision, vault_adr_0101_cloud_sync_is_the_accounts_collections_decision, vault_adr_0106_shared_collection_as_a_snapshot_and_a_log_decision, vault_adr_0107_sync_looks_only_at_what_changed_decision, vault_adr_0112_the_accounts_collections_decision [INFERRED 0.85]
- **GLUE Home as local engine and companion** — vault_adr_0044_glue_home_tauri_tray_app_decision, vault_adr_0045_glue_home_companion_decision, vault_adr_0051_glue_home_as_local_engine_decision [INFERRED 0.90]
- **Duplicate detection pipeline** — fingerprint_mechanism, name_groups_mechanism, best_copy_selection_mechanism [INFERRED 0.95]
- **Network folder analysis optimization** — unified_progress_count_concept, network_folder_song_queuing_mechanism, tag_batch_reading_mechanism [INFERRED 0.95]
- **On-screen data loading and retry flow** — on_screen_helper_concept, retries_mechanism_concept, remote_data_fetch_concept [INFERRED 0.95]
- **Performance optimization phases** — data_pipeline_phase_concept, gpu_drawing_phase_concept, analysis_threading_phase_concept [INFERRED 0.95]
- **Playback performance: separate port and folder-scoped lookups** — play_port_mechanism, folder_lookup_optimization_mechanism [INFERRED 0.95]

## Communities (246 total, 49 thin omitted)

### Community 0 - "parse.rs"
Cohesion: 0.08
Nodes (44): decode(), Decoded, keep_range(), mp4_edit(), push(), AAC_SR, add_tag(), apply_stream_info() (+36 more)

### Community 1 - "main.rs"
Cohesion: 0.08
Nodes (55): a_folder_is_looked_up_once(), activity_now(), allowed(), cache_list(), cache_path(), cache_put(), cache_read(), cache_write() (+47 more)

### Community 2 - "analysis.rs"
Cohesion: 0.06
Nodes (42): AUDIO, b64(), main(), one(), songs(), Bits, BLOCK, decode_flac() (+34 more)

### Community 3 - "guide.svelte.ts"
Cohesion: 0.06
Nodes (42): ADR-0126, ADR-0126, FNS, GRIDS, Article, esc(), inline(), parseArticle() (+34 more)

### Community 4 - "events.svelte.ts"
Cohesion: 0.06
Nodes (42): notify(), status(), checkReminders(), message(), Reminded, songsOf(), @tauri-apps/plugin-notification, blankEvent() (+34 more)

### Community 5 - "vitest"
Cohesion: 0.08
Nodes (30): vitest, DamagedFile, Dir, readJSON(), writeJSON(), asDir(), MemDir, MemFile (+22 more)

### Community 6 - "Track"
Cohesion: 0.08
Nodes (5): covers, dock, prepare, thumbs, Track

### Community 7 - "collection.ts"
Cohesion: 0.09
Nodes (50): here(), record(), timeAsync(), adopt(), Adopted, empty(), freeId(), listPath() (+42 more)

### Community 8 - "interop/types.ts"
Cohesion: 0.10
Nodes (53): sql.js, isAppleLibrary(), parseAppleLibrary(), plistValue(), PV, cols(), combineEngine(), engineKey() (+45 more)

### Community 9 - "core/types.ts"
Cohesion: 0.07
Nodes (49): analyzeMusic(), analyzeSamples(), computeSpectrum(), decimate(), FrameReader, makePcmReader(), monoOf(), onsetEnvelope() (+41 more)

### Community 10 - "stems.svelte.ts"
Cohesion: 0.06
Nodes (41): ADR-0003, ADR-0004, fmtEta(), encodeWav(), LEGACY_MODEL_CACHE, MODEL_CACHE, MODEL_FILE, MODEL_SIZE (+33 more)

### Community 11 - "App.svelte"
Cohesion: 0.04
Nodes (26): note(), dropIntoLibrary(), hasFiles(), needing, onDrop(), pick(), Facet, isAction() (+18 more)

### Community 12 - "importActions.ts"
Cohesion: 0.06
Nodes (48): ADR-0090, ADR-0090, ADR-0063, ADR-0063, AnyFile, Dir, DjState, djWatch (+40 more)

### Community 13 - "service.ts"
Cohesion: 0.09
Nodes (52): ADR-0137, analyseIncoming(), access(), stayOnline(), forget(), iceServers(), apiOf(), boot() (+44 more)

### Community 14 - "local.rs"
Cohesion: 0.06
Nodes (34): an_analysis_read_waits_while_a_song_plays_then_goes_on(), answer(), busy_for_test(), BUSY_UNTIL, decode(), EDITS, FOREGROUND_AT, handle() (+26 more)

### Community 15 - "LibSidebar.svelte"
Cohesion: 0.05
Nodes (26): ColDef, ColKey, DEFAULT_HIDDEN, DEFAULT_ORDER, overview, OverviewScheme, ADR-0061, Payload (+18 more)

### Community 16 - "ADR 0094: One shared collection in GLUE Cloud, the same on every device"
Cohesion: 0.04
Nodes (49): ADR-0094, ADR-0094, ADR-0040, ADR-0089, ADR-0087, ADR-0097, ADR-0095, ADR-0087 (+41 more)

### Community 17 - "ui/analysis.ts"
Cohesion: 0.07
Nodes (46): ADR-0149, active, add(), added(), AnalysisState, changed(), count(), delegate() (+38 more)

### Community 18 - "store/types.ts"
Cohesion: 0.06
Nodes (34): djValues, listsByTrack(), ListEntry, listTree, describeRemoval(), orphans(), removalImpact, ADR-0111 (+26 more)

### Community 19 - "shared/engine.ts"
Cohesion: 0.10
Nodes (33): setAt(), agreedDir(), applyChange(), base(), checkpoint(), diffFile(), DIRS, entryOf() (+25 more)

### Community 20 - "sharedSync.ts"
Cohesion: 0.08
Nodes (32): ADR-0102, ADR-0102, backupDaily(), bridge, HomeConfig, glueDir(), computersHere(), Identity (+24 more)

### Community 21 - "parse.ts"
Cohesion: 0.09
Nodes (42): ADR-0060, KeepInput, keepRange(), ADR-0060, AAC_SR, addTag(), decodeId3Text(), ext80() (+34 more)

### Community 22 - "merge.ts"
Cohesion: 0.08
Nodes (42): ADR-0134, ADR-0134, baseName(), normPath(), FileEntry, Linkable, matchTracks(), segs() (+34 more)

### Community 23 - "api.ts"
Cohesion: 0.14
Nodes (34): ACCESS_TTL, attach(), authed(), bad(), browserSession(), claim(), CODE_TTL, computerOf() (+26 more)

### Community 24 - "remoteFiles.svelte.ts"
Cohesion: 0.09
Nodes (35): Conn, MockHome, putKeys(), rtc(), serve(), safe(), shard(), candidateType() (+27 more)

### Community 25 - "GLUE vault overview and conventions"
Cohesion: 0.09
Nodes (41): Analysis pipeline: spectrum, cutoff detection, classification, music analysis, fingerprinting, ADR-0030, ADR-0100, ADR-0100, ADR-0020, ADR-0100, ADR 0008: TypeScript, Svelte, Vite, ADR 0010: Read-only import and file export before any write-back (+33 more)

### Community 26 - "ADR 0150: GLUE Home's connections to other devices are Rust's"
Cohesion: 0.05
Nodes (41): Project instructions and standards, Code map: graphify knowledge graph, crates/glue-audio: native analysis engine, crates/glue-rtc: GLUE Home's connections to other devices, ADR-0127, ADR-0129, e2e/home-rtc.ts: RTC e2e stand-in, ADR-0150 (+33 more)

### Community 27 - "cache.ts"
Cohesion: 0.09
Nodes (44): autoPool(), aKey(), art(), artKept(), background(), cacheFile(), cKey(), coverHash() (+36 more)

### Community 28 - "edits.ts"
Cohesion: 0.09
Nodes (33): insights, tagOverlap(), ADR-0032, addTags(), cleanTag(), foundTags(), hasTag(), MAX_TAG (+25 more)

### Community 29 - "auto.svelte.ts"
Cohesion: 0.10
Nodes (36): ADR-0029, camelotNum(), fifthsPos(), harmonicNeighbours(), keyAt(), keyLabel(), MAJOR_NAMES, MINOR_NAMES (+28 more)

### Community 30 - ".serve()"
Cohesion: 0.14
Nodes (9): Chan, Handler, Host, now_ms(), put_keys(), Server<H>, settings(), Song (+1 more)

### Community 31 - "covers.svelte.ts"
Cohesion: 0.10
Nodes (30): analyseIncoming(), analyseSong(), coverFromImage(), coverHash(), enc(), keep(), Put, waveFromDetails() (+22 more)

### Community 32 - "menu.svelte.ts"
Cohesion: 0.09
Nodes (32): ADR-0042, filterMenu(), shownFilters(), titleOf(), ADR-0067, MenuAction, MenuAt, MenuColors (+24 more)

### Community 33 - "platform/index.ts"
Cohesion: 0.08
Nodes (30): idbDel(), idbGet(), idbSet(), tx(), addLibraryPlace(), browserHome(), canKeepFiles(), Dir (+22 more)

### Community 34 - "protocol.rs"
Cohesion: 0.09
Nodes (7): a_device_asks_and_sends(), Client, H, Mem, next_text(), Sink, the_relays_servers_are_taken()

### Community 35 - "thumbs.svelte.ts"
Cohesion: 0.09
Nodes (25): OnScreen helper, On-screen loading mechanism, Remote data fetch from another computer, Retries mechanism, makeThumb(), makeWaveThumb(), THUMB_H, THUMB_W (+17 more)

### Community 36 - "folders.ts"
Cohesion: 0.09
Nodes (32): Detected, Entries, findLibraries(), head(), libraryAt(), ADR-0030, fileHead(), fileMeta() (+24 more)

### Community 37 - "ws.rs"
Cohesion: 0.07
Nodes (15): allowed(), get(), HOSTS, IMAGE_HOSTS, MAX, a_cancelled_request_isnt_answered(), allowed(), answer() (+7 more)

### Community 38 - "writePref()"
Cohesion: 0.08
Nodes (16): threejs-visualisers, AppState, OverviewPrefs, OutputDevice, readPref(), writePref(), TrackTabs, LibView (+8 more)

### Community 39 - "app.svelte.ts"
Cohesion: 0.10
Nodes (22): blankInfo(), pcmToWav(), wavBytes(), wavView, PcmLayout, analyzeFile(), app, errorMessage() (+14 more)

### Community 40 - "Welcome.svelte"
Cohesion: 0.06
Nodes (20): HOME_DOWNLOADS, RELEASES, ADR-0044, aliases, busy, chooseHome(), collectionName, confirmText (+12 more)

### Community 41 - "handle()"
Cohesion: 0.12
Nodes (34): handle(), MAX_BUNDLE, MAX_BUNDLE_PATHS, MAX_BYTES, MAX_FILE, SyncError, append(), bin() (+26 more)

### Community 42 - "ADR 0103: GLUE Home analyses its computer's songs; the tab takes the results; Stop, Analyse now, and"
Cohesion: 0.06
Nodes (35): ADR-0125, ADR-0103, ADR-0104, ADR-0103, ADR-0104, ADR-0103, ADR-0110, ADR-0104 (+27 more)

### Community 43 - "rtc.rs"
Cohesion: 0.12
Nodes (10): App, new(), Playing, rtc_answer(), rtc_close(), rtc_error(), rtc_ice(), rtc_reply() (+2 more)

### Community 44 - "view.svelte.ts"
Cohesion: 0.08
Nodes (23): KeyNotation, asShown(), APP_NAMES, BY_LIST, devicesOf(), djTracks(), FILES, formatOf() (+15 more)

### Community 45 - "incoming.svelte.ts"
Cohesion: 0.06
Nodes (32): ADR-0045, ADR-0047, ADR-0045, ADR-0085, ADR-0046, ADR-0046, ADR-0045, ADR-0045 (+24 more)

### Community 46 - "localHome.svelte.ts"
Cohesion: 0.11
Nodes (18): GLUE Home shared sync, ADR-0143, attachHere(), ADR-0108, homeOs, connect(), discover(), hello() (+10 more)

### Community 47 - "verdict.rs"
Cohesion: 0.14
Nodes (26): article(), at(), Beyond, beyond_wall(), classify(), detect_cutoff(), expected_cutoff(), expected_table() (+18 more)

### Community 48 - "shared.svelte.ts"
Cohesion: 0.13
Nodes (13): Shared form, Clash, askDeleteShared(), at(), cloudFor(), ComputerStats, holdsMusic(), shared (+5 more)

### Community 49 - "fsx.ts"
Cohesion: 0.14
Nodes (25): SongInput, autoBackup(), decodeFingerprint(), decodePack(), encodePack(), packPath(), path(), readFingerprint() (+17 more)

### Community 50 - "GLUE Cloud: accounts, GLUE Home and devices"
Cohesion: 0.08
Nodes (31): cloud/: GLUE Cloud Worker and D1, ADR-0036, ADR-0036, ADR-0036, ADR-0027, ADR-0054, ADR-0054, ADR-0054 (+23 more)

### Community 51 - "ADR 0082: Other devices get songs' covers from GLUE Home, and keep them; GLUE Cloud never has them"
Cohesion: 0.07
Nodes (32): ADR-0023, ADR-0024, ADR-0072, ADR-0082, ADR-0082, ADR-0082, ADR-0082, ADR-0071 (+24 more)

### Community 52 - "dupes.svelte.ts"
Cohesion: 0.11
Nodes (14): ADR-0098, ADR-0121, Match, time(), dupes, DupGroup, Saved, savedPath() (+6 more)

### Community 53 - "bundle"
Cohesion: 0.06
Nodes (33): app, security, windows, build, devUrl, frontendDist, bundle, active (+25 more)

### Community 54 - "library/analysis.ts"
Cohesion: 0.10
Nodes (21): ADR-0109, afterAnalysis(), analysisState, isTransient(), needsAnalysis(), ADR-0109, counts(), Grade (+13 more)

### Community 55 - "linked.ts"
Cohesion: 0.09
Nodes (28): NO_LINKED, ADR-0063, ADR-0099, ADR-0099, copies(), gluePath(), GONE_AFTER, importLists() (+20 more)

### Community 56 - "GLUE: how it works now"
Cohesion: 0.07
Nodes (27): Best copy: quality, format, main folder, resolution, cloud/, Collection, CollectionStore, ADR-0007, ADR-0070, ADR-0070, Fingerprint: chroma-based 32-bit codes (+19 more)

### Community 57 - "files.rs"
Cohesion: 0.09
Nodes (20): analysed(), analysed_failed(), decode_details(), details(), DETAILS_VERSION, fingerprint_file(), format_of(), MAX_ROWS (+12 more)

### Community 58 - "themes.svelte.ts"
Cohesion: 0.08
Nodes (19): ADR-0028, GLUE website entry page, svelte, glueFolder, ADR-0051, ADR-0108, ADR-0113, loadedFonts (+11 more)

### Community 59 - "account"
Cohesion: 0.12
Nodes (3): passwordKey(), account, browserName()

### Community 60 - "library.svelte.ts"
Cohesion: 0.07
Nodes (21): bySource, cuesFor(), index(), allGenres(), GENRE_PRESETS, GenreItem, setGenre(), collections (+13 more)

### Community 61 - "Roadmap"
Cohesion: 0.10
Nodes (32): Analysis off main thread phase, Data pipeline phase, ADR-0074, GPU drawing phase, ADR-0074, ADR-0074, ADR-0074, Narrow window freeze fix (+24 more)

### Community 62 - "analyze.rs"
Cohesion: 0.12
Nodes (19): analyze_music(), analyze_samples(), compute_spectrum(), decimate(), gauss(), Job, Demo, Float (+11 more)

### Community 63 - "types.rs"
Cohesion: 0.15
Nodes (26): AnalysisResult, AnalysisSummary, Clue, Cutoff, Depth, Expected, FileInfo, Finding (+18 more)

### Community 64 - "disk.rs"
Cohesion: 0.16
Nodes (15): cfg_path(), check(), colons_and_backslashes_only_matter_on_windows(), describe(), fail(), handle(), inside(), io_fail() (+7 more)

### Community 65 - "lib/analysis.ts"
Cohesion: 0.13
Nodes (23): ADR-0019, FileInfo, analysisWorker(), analyze(), decodeAudio(), decodedByWorker(), fingerprintOf(), NeedsPageDecode (+15 more)

### Community 66 - "trackMenu.ts"
Cohesion: 0.11
Nodes (24): safeName(), absolutePath(), MIME, mimeOf(), playlistM3u8(), ready, startPlaylistDrag(), startTrackDrag() (+16 more)

### Community 67 - "Disk"
Cohesion: 0.13
Nodes (4): Disk, Fwd, main(), Probe

### Community 68 - "ADR 0136: Analysis limits are the user's to set, with the speed shown and a suggestion from it"
Cohesion: 0.08
Nodes (24): GLUE Home analysis (fillInfo), ADR-0135, ADR-0136, ADR-0136, isNetwork(), pickNext(), ADR-0135, ADR-0136 (+16 more)

### Community 69 - "ADR 0108: One id per computer: GLUE Home learns it, only the computer's GLUE folder writes its parts"
Cohesion: 0.07
Nodes (29): Account: optional sign-in for syncing, ADR-0108, ADR-0112, ADR-0108, ADR-0112, Device: computer or phone running GLUE, ADR-0101, ADR-0108 (+21 more)

### Community 70 - "crypto.ts"
Cohesion: 0.13
Nodes (24): Deps, Env, b64url(), enc, GoogleClaims, googleKeys(), hmacKey(), json() (+16 more)

### Community 71 - "backup.ts"
Cohesion: 0.12
Nodes (24): ADR-0026, crc32(), CRC_TABLE, createZip(), dec, dosTime(), enc, pipe() (+16 more)

### Community 72 - "launch()"
Cohesion: 0.11
Nodes (16): test, ADR-0091, test, EDGE_ARGS, launch(), OFF, Opts, test (+8 more)

### Community 73 - "ADR 0067: One context menu for the library page: right-click (or ⋯) on anything there"
Cohesion: 0.09
Nodes (27): ADR-0062, ADR-0078, ADR-0077, ADR-0078, ADR-0049, ADR-0062, ADR-0077, ADR-0049 (+19 more)

### Community 74 - "format.ts"
Cohesion: 0.17
Nodes (18): fmtDb(), fmtKHz(), fmtTime(), freqLabel(), niceStep(), niceTimeStep(), Cutoff, sent (+10 more)

### Community 75 - "remoteFiles"
Cohesion: 0.16
Nodes (4): incomingKey(), companionOf(), companionOnline(), remoteFiles

### Community 76 - "player"
Cohesion: 0.14
Nodes (4): mediaError(), player, refusal(), toSink()

### Community 77 - "users"
Cohesion: 0.12
Nodes (21): attempts, credentials, credentials_device, devices, devices_user, identities, pairing_codes, users (+13 more)

### Community 78 - "dsd.rs"
Cohesion: 0.16
Nodes (22): a_dsf_file_is_analysed(), a_dsf_sine_comes_out_as_that_sine_at_88_2_khz(), BYTES1, channel_bytes(), decode(), Dsd, dsf_sine(), factor() (+14 more)

### Community 79 - "lookup.ts"
Cohesion: 0.16
Nodes (25): ask(), counts, find(), fKey(), GAP, known(), last, queue (+17 more)

### Community 80 - "DuplicatesView.svelte"
Cohesion: 0.07
Nodes (20): cleanUpPlan(), manyDevices(), shown, cleaning, doubtful, fmt(), hidden, includeDoubtful (+12 more)

### Community 81 - "homeDisk.ts"
Cohesion: 0.13
Nodes (8): domError(), Entry, HomeDir, HomeDown, HomeRoots, join(), ADR-0051, ADR-0104

### Community 82 - "admin.ts"
Cohesion: 0.11
Nodes (23): AdminError, count(), maintenance(), N, route(), sessions(), stats(), TIERS (+15 more)

### Community 83 - "library.ts"
Cohesion: 0.13
Nodes (22): collectionKey(), FolderAway, folderOf(), folders, found, join(), json(), LibraryInfo (+14 more)

### Community 84 - "make-audio.ts"
Cohesion: 0.09
Nodes (22): DUPLICATE, encode(), entries, EXT, ff(), fileName(), FILES, hz() (+14 more)

### Community 85 - "nowPlaying"
Cohesion: 0.11
Nodes (6): facetInfo(), remoteFileMessage(), nowPlaying, plural(), viewTitle(), copies

### Community 86 - "player.svelte.ts"
Cohesion: 0.13
Nodes (15): Live, SourceOpts, TapMaker, MONO, create3D(), TICKS, ADR-0073, View3D (+7 more)

### Community 87 - "CollectionStore"
Cohesion: 0.18
Nodes (3): CollectionStore, shardOf(), saved()

### Community 88 - "verdict.ts"
Cohesion: 0.13
Nodes (25): Analysis, crates/glue-audio, article(), beyondWall(), classify(), declaredLabel(), detectCutoff(), EXPECTED (+17 more)

### Community 89 - "Library"
Cohesion: 0.09
Nodes (17): ADR-0146, Library, Parts, LoadOpts, lib(), analysis part, collections part, djLibraries part (+9 more)

### Community 90 - "ui/engine.ts"
Cohesion: 0.14
Nodes (25): addJob(), Change, changed(), drop(), edit(), EngineStatus, flushEdit(), Job (+17 more)

### Community 91 - "PrepareView.svelte"
Cohesion: 0.12
Nodes (21): addMemory(), autoLoop(), byTime(), HOT_COLORS, hotCue(), importable(), LETTERS, removeCue() (+13 more)

### Community 92 - "flac.ts"
Cohesion: 0.16
Nodes (14): Bits, BLOCK, decodeFlac(), fixed(), flacHeader(), FlacInfo, FlacPcm, frame() (+6 more)

### Community 93 - "analyse()"
Cohesion: 0.14
Nodes (8): analyse(), analyse_demo(), Analysis, ext_of(), Failure, Broken, Unsupported, file_info()

### Community 94 - "signal.ts"
Cohesion: 0.14
Nodes (10): ClientMsg, Env, prepare(), RoomMsg, Signal, State, ADR-0036, ADR-0091 (+2 more)

### Community 95 - "js.rs"
Cohesion: 0.10
Nodes (4): fixed_num(), grouped(), num_str(), to_fixed()

### Community 96 - "duplicates.ts"
Cohesion: 0.13
Nodes (19): nameGroups: same name split into same-version copies, ber(), FP_FRAME_SEC, FP_HOP, FP_N, FP_RATE, FP_SECONDS, popcount() (+11 more)

### Community 97 - "nowPlaying.svelte.ts"
Cohesion: 0.20
Nodes (20): advance(), back(), clear(), dequeue(), EMPTY_QUEUE, enqueue(), jump(), placeLater() (+12 more)

### Community 98 - "smoke-local.ts"
Cohesion: 0.10
Nodes (16): both, got, homeLog, kicked, room, say(), signalled, stop() (+8 more)

### Community 99 - "Stem separation"
Cohesion: 0.10
Nodes (15): ADR-0006, GLUE README, Speklone, HT-Demucs stem separation on WebGPU, Help: prepare, Beat grid and cues, Help: song-page, ADR 0001: Record architecture decisions (+7 more)

### Community 100 - "shared.spec.ts"
Cohesion: 0.15
Nodes (10): ADR-0114, browserFor(), D, fakeCloud(), fixture(), MUSIC, seed(), ADR-0094 (+2 more)

### Community 101 - "phone.spec.ts"
Cohesion: 0.10
Nodes (17): LIBRARY, ADR-0136, test, texts(), ADR-0108, test, ADR-0046, ADR-0094 (+9 more)

### Community 102 - "ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address"
Cohesion: 0.09
Nodes (20): ADR-0051, ADR-0051, ADR-0051, ADR-0051, ADR-0092, ADR-0051, ADR-0092, ADR-0051 (+12 more)

### Community 103 - "tags.rs"
Cohesion: 0.15
Nodes (8): apply(), FIELDS, fixture(), read_info(), read_many(), reads_many_songs_info_in_order(), write_tags(), writes_into_every_format_and_reads_back()

### Community 104 - "lib/perf.ts"
Cohesion: 0.16
Nodes (15): enablePerf(), perfStats(), resetPerf(), Stat, stats, takeFrameWork(), ADR-0058, describe() (+7 more)

### Community 105 - "HomeStore"
Cohesion: 0.19
Nodes (4): HomeStore, now(), Alias, Profile

### Community 106 - "Player"
Cohesion: 0.10
Nodes (21): Audio element management, Deferred track page loading, Remote device playback, GLUE Home song port, iPhone playback support, lib.mediaFor, lib/nowPlaying, lib/output (+13 more)

### Community 107 - "libraries.rs"
Cohesion: 0.20
Nodes (10): CACHE, find(), Found, home(), is_library(), json(), look(), picked() (+2 more)

### Community 108 - "prepare.svelte.ts"
Cohesion: 0.19
Nodes (15): beatGrid(), anchorAt(), downbeat(), Grid, mod(), nudge(), retempo(), tapBpm() (+7 more)

### Community 109 - "cover.rs"
Cohesion: 0.17
Nodes (9): Cover, cover_of(), from_image(), jpeg(), LARGE, picture(), picture_from(), SMALL (+1 more)

### Community 110 - "dock.rs"
Cohesion: 0.22
Nodes (13): changed(), clear(), current(), DOCK, dock_add(), dock_clear(), dock_items(), dock_remove() (+5 more)

### Community 111 - "ADR 0147: GLUE Home analyses natively, in Rust"
Cohesion: 0.11
Nodes (20): ADR-0148, ADR-0147, ADR-0147, analyse(), step(), ADR-0147, ADR-0147, ADR-0147 (+12 more)

### Community 112 - "@playwright/test"
Cohesion: 0.13
Nodes (11): errors, files, FIX, OUT, ADR-0147, Device, fixture(), start() (+3 more)

### Community 113 - "graph_docs.py"
Cohesion: 0.16
Nodes (9): adr_files(), digest(), finish(), node_id(), link(), prepare(), rel(), stem_id() (+1 more)

### Community 114 - "bridge.ts"
Cohesion: 0.11
Nodes (13): Activity, API, askYesNo(), openFolder(), openUrl(), pickFolder(), Received, Status (+5 more)

### Community 115 - "package.json"
Cohesion: 0.10
Nodes (19): autostart(), onPairLink(), allowScripts, github:festanqueiro/threejs-visualisers#3a85cac1d9db9d8c3ba30a5f65d90831f137944b, description, name, private, type (+11 more)

### Community 116 - "homeMode()"
Cohesion: 0.14
Nodes (20): fmtBytes(), cleanUp(), canPickFolders(), cleanDuplicates(), fileLink(), folderHandle(), folderReachable(), homeLibraries() (+12 more)

### Community 117 - "merge3.ts"
Cohesion: 0.15
Nodes (12): isObj(), kind(), merge3(), mergeBoth(), Merged, mergeSequence(), mergeSets(), mergeValue() (+4 more)

### Community 118 - "golden.test.ts"
Cohesion: 0.20
Nodes (17): decodeDetails(), encodeDetails(), hasDetails(), loadDetails(), MAX_ROWS, paths(), pipe(), removeDetails() (+9 more)

### Community 119 - "lib/ice.ts"
Cohesion: 0.15
Nodes (14): ADR-0081, ADR-0037, ADR-0081, ice, iceNow, ADR-0081, iceCache(), ADR-0037 (+6 more)

### Community 120 - "dupes.rs"
Cohesion: 0.21
Nodes (9): default_duplicates(), duplicates_dir(), free(), move_into(), moves_under_the_folder_name_and_path_and_numbers_clashes(), music_roots(), refuses_paths_that_leave_the_folder_and_folders(), run() (+1 more)

### Community 121 - "relink.ts"
Cohesion: 0.21
Nodes (14): versionOf(), artistsOf(), fileStem(), nameOf(), overlap(), RelinkMatch, relinkMatches(), relinkScore() (+6 more)

### Community 122 - "DevicesSection.svelte"
Cohesion: 0.14
Nodes (16): #each(), ago(), copied, deviceMenu(), left, now, only, openMenu() (+8 more)

### Community 123 - "PlayerPanel.svelte"
Cohesion: 0.12
Nodes (15): i(), a, dropOn, full, fullscreen(), h, played, press() (+7 more)

### Community 124 - "glue-rtc/src/lib.rs"
Cohesion: 0.15
Nodes (9): CHUNK, Conn, frame(), HIGH_WATER, MAX_FILE, MAX_RANGE, safe_part(), Server (+1 more)

### Community 125 - "golden.rs"
Cohesion: 0.24
Nodes (9): b64(), check(), check_files(), golden(), lossless_fixtures_match_javascript(), result_json(), root(), same() (+1 more)

### Community 126 - "compilerOptions"
Cohesion: 0.12
Nodes (16): @tsconfig/svelte/tsconfig.json, compilerOptions, isolatedModules, lib, module, moduleResolution, noFallthroughCasesInSwitch, noImplicitOverride (+8 more)

### Community 128 - "ADR 0091: A device is a computer; signing in only to browse is a session"
Cohesion: 0.12
Nodes (15): ADR-0091, ADR-0091, ADR-0091, ADR-0115, ADR-0091, ADR-0091, ADR-0091, ADR-0091 (+7 more)

### Community 129 - "ADR 0113: Profiles are the account's artist aliases; a GLUE folder keeps one library that every alia"
Cohesion: 0.14
Nodes (15): ADR-0113, ADR-0113, ADR-0018, ADR-0113, src/lib/library.svelte, ADR-0113, ADR-0113, ADR-0113 (+7 more)

### Community 130 - "js"
Cohesion: 0.19
Nodes (6): Fft, grid(), math_within_2_ulp_of_v8(), outputs(), v8(), where_it_differs()

### Community 131 - "ADR 0033: Tolerate gentle top-end roll-offs; re-check stored verdicts when the rules change"
Cohesion: 0.20
Nodes (12): ADR-0119, ADR-0033, ADR-0033, Steep top end lowpass verdict, ADR-0033, ADR 0033: Tolerate gentle top-end roll-offs; re-check stored verdicts when the rules change, ADR 0034: Count quiet content above a gentle fade (peak-hold reach), ADR 0069: Content beyond a wall that follows the music isn't an encoder's cut; specks far under it a (+4 more)

### Community 132 - "graph.mjs"
Cohesion: 0.13
Nodes (10): fixtures, ADR-0060, FETCHED, gitDir, inOut(), KEEP, OUT, own (+2 more)

### Community 133 - "fakeHome.ts"
Cohesion: 0.12
Nodes (13): FakeHomeDirs, ADR-0061, ADR-0065, ADR-0071, ADR-0104, ADR-0141, ADR-0065, ADR-0065 (+5 more)

### Community 134 - "homemode.spec.ts"
Cohesion: 0.14
Nodes (7): FakeHome, errors, MUSIC, test, ADR-0056, ADR-0061, ADR-0108

### Community 135 - "perf.spec.ts"
Cohesion: 0.13
Nodes (12): afterPaint(), BUDGET, errors, Long, over, results, SIZES, Stat (+4 more)

### Community 136 - "ADR 0133: A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what"
Cohesion: 0.12
Nodes (15): ADR-0133, ADR-0133, ADR-0133, ADR-0133, ADR-0133, ADR-0133, ADR-0133, ADR-0133 (+7 more)

### Community 137 - "anywhere.svelte.ts"
Cohesion: 0.19
Nodes (10): ADR-0077, ADR-0108, ADR-0113, CloudAlias, isAlias(), Listed, profiles, toCloud() (+2 more)

### Community 139 - "PhoneSongs.svelte"
Cohesion: 0.15
Nodes (12): down(), follow(), grab(), held, more(), moving, off, picked (+4 more)

### Community 140 - "homeHandover.ts"
Cohesion: 0.14
Nodes (12): ADR-0048, ADR-0048, ADR-0048, ADR-0048, ADR-0048, bytesAt(), done, handOver() (+4 more)

### Community 141 - "lossy-fixtures.mjs"
Cohesion: 0.13
Nodes (10): ADR-0044, vite, { channels, sr }, data, head, make, ADR-0147, out (+2 more)

### Community 142 - "HomeSocket"
Cohesion: 0.16
Nodes (4): HomeSocket, ADR-0139, Waiting, FakeSocket

### Community 143 - "summary.rs"
Cohesion: 0.20
Nodes (7): ANALYSIS_VERSION, ENGINE, failed(), iso(), now_iso(), summarize(), VERDICT_VERSION

### Community 144 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @crabnebula/tauri-plugin-drag, mediabunny, sql.js, @tauri-apps/api, @tauri-apps/plugin-autostart, @tauri-apps/plugin-deep-link, @tauri-apps/plugin-dialog (+6 more)

### Community 145 - "versions.test.ts"
Cohesion: 0.25
Nodes (11): certainty(), concerns(), copyScore(), nameGroups(), nameKey(), pairKey(), sameVersion(), similarLength() (+3 more)

### Community 147 - "activity.rs"
Cohesion: 0.26
Nodes (6): Act, counts_calls_time_and_bytes(), note(), snapshot(), start(), STARTED

### Community 148 - "src/profiles.ts"
Cohesion: 0.29
Nodes (11): Alias, color(), create(), list(), merge(), name(), one(), out() (+3 more)

### Community 149 - "ADR 0106: Keep the shared collection in GLUE Cloud as a snapshot and a log of changes"
Cohesion: 0.17
Nodes (12): ADR-0106, ADR-0105, ADR-0106, ADR-0106, ADR-0106, ADR-0107, ADR-0106, ADR-0107 (+4 more)

### Community 150 - "ADR 0144: FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so"
Cohesion: 0.15
Nodes (12): ADR-0144, ADR-0144, FLAC decoder, ADR-0144, Library views, Analysis decode worker, ADR-0144, 0144. FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so (+4 more)

### Community 151 - "ADR 0052: A Prepare tab: waveform, beat grid, metronome and the user's corrections"
Cohesion: 0.15
Nodes (13): legacy/index.html, ADR-0052, ADR-0052, ADR-0052, ADR-0052, ADR-0052, ADR-0052, ADR-0052 (+5 more)

### Community 152 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, svelte, svelte-check, @sveltejs/vite-plugin-svelte, @tauri-apps/cli, @tsconfig/svelte, @types/node (+5 more)

### Community 153 - "lib/bpm.ts"
Cohesion: 0.24
Nodes (8): bpmInUse(), BpmRange, fmtBpm(), foldInto(), shownBpm(), bpmOf(), bpmShown(), st()

### Community 154 - "account.svelte.ts"
Cohesion: 0.18
Nodes (7): API_BASE, CloudUser, GOOGLE_CLIENT_ID, GoogleId, Session, tabConn, Tier

### Community 156 - "homeAnalysis.svelte.ts"
Cohesion: 0.28
Nodes (4): homeAnalysis, HomeState, ADR-0103, ADR-0104

### Community 157 - "fingerprint.rs"
Cohesion: 0.18
Nodes (9): BANDS, F_HI, F_LO, fingerprint(), FP_HOP, FP_N, FP_RATE, FP_SECONDS (+1 more)

### Community 158 - "GLUE Home"
Cohesion: 0.18
Nodes (12): crates/glue-rtc, ADR-0140, Drag dock, No folder permissions required, Hard disk wake-up latency, Incoming folder, Library analysis engine, Network folder analysis optimization (+4 more)

### Community 159 - "ADR 0141: Songs played get their own port, and a file read looks up only its own folder"
Cohesion: 0.17
Nodes (10): ADR-0141, File read folder lookup: resolve each folder only once, remember for 10 min, PLAY_PORT: separate 127.0.0.1 port for song playback, ADR-0141, ADR-0141, 0141. Songs played get their own port, and a file read looks up only its own folder, Alternatives considered, Consequences (+2 more)

### Community 160 - "library.spec.ts"
Cohesion: 0.18
Nodes (8): errors, fixture(), MUSIC, seed(), test, ADR-0063, ADR-0067, ADR-0076

### Community 164 - "lossy.rs"
Cohesion: 0.27
Nodes (6): a_damaged_mp3_frame_keeps_the_time(), a_deadline_stops_the_analysis(), alac_is_the_same_as_flac(), fixture(), lossy_files_decode(), run()

### Community 165 - "ADR 0044: GLUE Home is a Tauri tray app; the website sends songs to it over WebRTC"
Cohesion: 0.18
Nodes (10): Away music folder, GLUE Home Stop semantics, ADR-0044, ADR-0044, ADR-0044, ADR-0044, ADR-0044, ADR-0044 (+2 more)

### Community 166 - "cloud/package.json"
Cohesion: 0.18
Nodes (10): description, devDependencies, wrangler, name, private, scripts, deploy, dev (+2 more)

### Community 167 - "ADR 0076: Songs stream by byte range: the local link in Home mode, a service worker for other comput"
Cohesion: 0.18
Nodes (10): ADR-0076, ADR-0076, ADR-0076, ADR-0076, ADR-0076, ADR-0076, ADR-0076, ADR-0076 (+2 more)

### Community 168 - "ADR 0086: GLUE Home looks up missing covers on public services"
Cohesion: 0.18
Nodes (10): ADR-0086, ADR-0086, ADR-0086, ADR-0086, ADR-0086, ADR-0086, ADR-0086, ADR-0086 (+2 more)

### Community 169 - "ADR 0138: What the user asks for goes first: background requests gated, playing ahead of the analysi"
Cohesion: 0.18
Nodes (10): ADR-0138, ADR-0138, ADR-0138, ADR-0138, ADR-0138, 0138. What the user asks for goes first: background requests gated, playing ahead of the analysis, songs read whole, Alternatives considered, Consequences (+2 more)

### Community 170 - "capture.ts"
Cohesion: 0.27
Nodes (10): clip(), cursor(), DEMO, ff(), OUT, profile, shot(), ADR-0063 (+2 more)

### Community 171 - "browse.ts"
Cohesion: 0.33
Nodes (8): FacetItem, facetItems(), facetKey(), FACETS, facetValue(), inFacet(), sortFacet(), T

### Community 172 - "names.ts"
Cohesion: 0.47
Nodes (8): bare(), fold(), lower(), SAME_MARK, saysNothing(), songName(), spaced(), trackKey()

### Community 173 - "types"
Cohesion: 0.27
Nodes (3): CLUES, patterns(), scan_clues()

### Community 174 - "lossy_golden.rs"
Cohesion: 0.38
Nodes (6): bytes_b64(), FILES, json(), lossy_files_match_the_browser(), root(), same()

### Community 175 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, check, dev, home:dev, home:preview, home:ui, preview (+2 more)

### Community 176 - "rtc-probe.mjs"
Cohesion: 0.20
Nodes (6): child, dir, out, results, song, waiting

### Community 177 - "wave.ts"
Cohesion: 0.27
Nodes (9): beatsBetween(), CuePoint, column(), drawWave(), GridView, Scheme, SCHEMES, ADR-0052 (+1 more)

### Community 178 - "Gate"
Cohesion: 0.22
Nodes (3): Gate, ADR-0138, ADR-0138

### Community 179 - "metronome"
Cohesion: 0.36
Nodes (3): Grid, metronome, ADR-0052

### Community 181 - "control.rs"
Cohesion: 0.25
Nodes (3): check(), set_deadline(), TOO_LONG

### Community 182 - "guide.spec.ts"
Cohesion: 0.25
Nodes (5): errors, fixture(), libraryWithASong(), test, ADR-0126

### Community 183 - "ADR 0068: A full player: a queue, an open view with the visualiser, the sound output; drivers throug"
Cohesion: 0.22
Nodes (9): Full player bar, ADR-0068, ADR-0068, ADR-0068, ADR-0068, ADR-0068, ADR 0068: A full player: a queue, an open view with the visualiser, the sound output; drivers throug, Audio output research (+1 more)

### Community 184 - "0132. Connections to GLUE Home are bounded: abandoned set-ups let go, failures said, reconnects paced"
Cohesion: 0.22
Nodes (7): ADR-0132, RTCPeerConnection, ADR-0132, 0132. Connections to GLUE Home are bounded: abandoned set-ups let go, failures said, reconnects paced, Alternatives considered, Consequences, Context

### Community 185 - "ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put"
Cohesion: 0.25
Nodes (7): cacheFile(), ADR-0139, ADR-0139, ADR-0139, ADR-0139, ADR-0139, ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put

### Community 186 - "Arriving"
Cohesion: 0.25
Nodes (3): Arriving, ReadSeek, T

### Community 188 - "ref_node_path"
Cohesion: 0.29
Nodes (6): FORBIDDEN, FORBIDDEN_PACKAGES, reach(), resolveImport(), ROOT, ADR-0147

### Community 189 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, allowImportingTsExtensions, noEmit, types, extends, include

### Community 190 - "Help: DJ libraries"
Cohesion: 0.25
Nodes (8): Tour: dj-libraries, Tour: Duplicates, Help: DJ libraries, No file linked, Duplicates and the best copy, The library and its views, No file linked help article, Quality help article

### Community 191 - "0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it"
Cohesion: 0.25
Nodes (7): ADR-0142, ADR-0142, 0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it, Alternatives considered, Consequences, Context, ADR 0142: A row on screen always gets what it asked for: held by its song's id, and asked again when

### Community 192 - "EditInfo.svelte"
Cohesion: 0.32
Nodes (7): changed, close(), focus(), lists, save(), suggest(), values

### Community 193 - "Vision"
Cohesion: 0.25
Nodes (6): ADR 0010: Import/export before write-back, ADR 0011 (live export file), Vision, Speklone, Browser capabilities research, File System Access API, Chromium only

### Community 194 - "dock.ts"
Cohesion: 0.29
Nodes (5): Dock, GLUE drag dock page, ADR-0056, @crabnebula/tauri-plugin-drag, @tauri-apps/api

### Community 195 - "engine.svelte.ts"
Cohesion: 0.29
Nodes (6): cacheGate, Change, EngineState, ADR-0108, homeSocket, waves

### Community 198 - "turn.ts"
Cohesion: 0.40
Nodes (5): Ice, TURN_TTL, TurnEnv, turnServers(), usable()

### Community 199 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 200 - "ADR 0088: Another computer's AIFF songs stream, as WAV worked out a piece at a time"
Cohesion: 0.40
Nodes (4): AIFF format handling, ADR-0088, ADR-0088, ADR-0088

### Community 202 - "0137. This computer's browser is never a remote session, and isn't counted; the direct link isn't dropped on one slow answer"
Cohesion: 0.40
Nodes (4): 0137. This computer's browser is never a remote session, and isn't counted; the direct link isn't dropped on one slow answer, Alternatives considered, Consequences, Context

### Community 203 - "0139. A socket for the background loads from GLUE Home, and a list that stays put"
Cohesion: 0.40
Nodes (4): 0139. A socket for the background loads from GLUE Home, and a list that stays put, Alternatives considered, Consequences, Context

### Community 204 - "0140. A song played pauses the analysis's reads, not only its new songs"
Cohesion: 0.40
Nodes (4): 0140. A song played pauses the analysis's reads, not only its new songs, Alternatives considered, Consequences, Context

### Community 205 - "0145. Judge "the same name" one way, in `core/library/names.ts`"
Cohesion: 0.40
Nodes (4): 0145. Judge "the same name" one way, in `core/library/names.ts`, Alternatives considered, Consequences, Context

### Community 207 - "Help: Getting started"
Cohesion: 0.50
Nodes (4): Tour: welcome, Help: Getting started, GLUE folder, GLUE Home (optional companion app)

### Community 209 - "glue-home"
Cohesion: 0.67
Nodes (3): glue-audio, glue-home, glue-rtc

### Community 211 - "Help: Adding music"
Cohesion: 0.67
Nodes (3): tour: adding-music, Help: Adding music, TO BE SORTED: incoming folder for sent songs

## Knowledge Gaps
- **888 isolated node(s):** `Phase`, `D`, `Stat`, `Interaction`, `LongFrame` (+883 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1447 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GLUE vault overview and conventions` connect `GLUE vault overview and conventions` to `ADR 0091: A device is a computer; signing in only to browse is a session`, `ADR 0113: Profiles are the account's artist aliases; a GLUE folder keeps one library that every alia`, `ADR 0033: Tolerate gentle top-end roll-offs; re-check stored verdicts when the rules change`, `fakeHome.ts`, `ADR 0133: A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what`, `importActions.ts`, `ADR 0094: One shared collection in GLUE Cloud, the same on every device`, `ui/analysis.ts`, `sharedSync.ts`, `ADR 0106: Keep the shared collection in GLUE Cloud as a snapshot and a log of changes`, `merge.ts`, `ADR 0052: A Prepare tab: waveform, beat grid, metronome and the user's corrections`, `ADR 0144: FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so`, `ADR 0150: GLUE Home's connections to other devices are Rust's`, `edits.ts`, `ADR 0141: Songs played get their own port, and a file read looks up only its own folder`, `thumbs.svelte.ts`, `folders.ts`, `ADR 0044: GLUE Home is a Tauri tray app; the website sends songs to it over WebRTC`, `ADR 0138: What the user asks for goes first: background requests gated, playing ahead of the analysi`, `ADR 0103: GLUE Home analyses its computer's songs; the tab takes the results; Stop, Analyse now, and`, `incoming.svelte.ts`, `localHome.svelte.ts`, `GLUE Cloud: accounts, GLUE Home and devices`, `ADR 0082: Other devices get songs' covers from GLUE Home, and keep them; GLUE Cloud never has them`, `dupes.svelte.ts`, `ADR 0068: A full player: a queue, an open view with the visualiser, the sound output; drivers throug`, `linked.ts`, `0132. Connections to GLUE Home are bounded: abandoned set-ups let go, failures said, reconnects paced`, `themes.svelte.ts`, `GLUE: how it works now`, `Roadmap`, `0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it`, `lib/analysis.ts`, `Vision`, `ADR 0136: Analysis limits are the user's to set, with the speed shown and a suggestion from it`, `ADR 0108: One id per computer: GLUE Home learns it, only the computer's GLUE folder writes its parts`, `ADR 0067: One context menu for the library page: right-click (or ⋯) on anything there`, `0137. This computer's browser is never a remote session, and isn't counted; the direct link isn't dropped on one slow answer`, `0139. A socket for the background loads from GLUE Home, and a list that stays put`, `0140. A song played pauses the analysis's reads, not only its new songs`, `0145. Judge "the same name" one way, in `core/library/names.ts``, `admin.ts`, `make-audio.ts`, `player.svelte.ts`, `Library`, `Stem separation`, `ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address`, `lib/ice.ts`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `ADR 0141: Songs played get their own port, and a file read looks up only its own folder` connect `ADR 0141: Songs played get their own port, and a file read looks up only its own folder` to `main.rs`, `fakeHome.ts`, `ADR 0138: What the user asks for goes first: background requests gated, playing ahead of the analysi`, `Player`, `local.rs`, `localHome.svelte.ts`, `homeDisk.ts`, `ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put`, `themes.svelte.ts`, `GLUE Home`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `GLUE Home` connect `GLUE Home` to `GLUE: how it works now`, `Player`, `service.ts`, `local.rs`, `Help: Getting started`, `verdict.ts`, `ui/engine.ts`, `ADR 0141: Songs played get their own port, and a file read looks up only its own folder`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **What connects `Phase`, `D`, `Stat` to the rest of the system?**
  _888 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `parse.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.07787114845938375 - nodes in this community are weakly interconnected._
- **Should `main.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.07904789891272407 - nodes in this community are weakly interconnected._
- **Should `analysis.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06296656929568321 - nodes in this community are weakly interconnected._