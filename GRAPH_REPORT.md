# Graph Report - glue  (2026-11-03)

## Corpus Check
- 935 files · ~811,122 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 8255 nodes · 20696 edges · 397 communities (295 shown, 102 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 863 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- library.svelte.ts
- remoteFiles.svelte.ts
- glue-interop/src/sync.rs
- queue.rs
- trackMenu.ts
- enginedb.rs
- parse.rs
- Vault README (sections, conventions, feature index)
- writePref()
- vitest
- Playlists, folders & smart lists
- app.svelte.ts
- dsd.rs
- folders.ts
- GLUE Cloud: accounts, GLUE Home and devices
- merge.ts
- main.rs
- events.svelte.ts
- String
- files.rs
- analysis.worker.ts
- glue-engine/src/sync.rs
- CollectionStore
- nowPlaying.svelte.ts
- collection.ts
- tests/engine.rs
- account.svelte.ts
- Store<D>
- H
- Welcome.svelte
- library/analysis.ts
- api.ts
- library.spec.ts
- App
- tests/room.rs
- library.rs
- @playwright/test
- local.rs
- ADR 0094: One shared collection in GLUE Cloud, the same on every device
- js.rs
- glue-interop/src/types.rs
- read_json()
- Feature: Library & scanner
- Background analysis
- parse.ts
- .answer()
- shared/engine.ts
- store/types.ts
- store.golden.test.ts
- Player
- Store
- discogsLists.ts
- platform/index.ts
- ws.rs
- lib/analysis.ts
- protocol.rs
- rtc.rs
- glue-engine/src/tags.rs
- .serve()
- edits.ts
- covers.golden.test.ts
- keys.ts
- PrepareView.svelte
- backup.ts
- player
- signal.ts
- Engine<H>
- dupes.svelte.ts
- shared.ts
- Host
- remoteFiles
- guide.test.ts
- ADR 0036: Optional accounts and a small free cloud service (Cloudflare) for devices and signaling
- verdict.rs
- parse_engine_db()
- ADR 0187: The Discogs collection: read by GLUE Home, kept in the profile, matched on the page
- fingerprint.ts
- merge.rs
- shared.svelte.ts
- fakeHome.ts
- tests/discogs.rs
- ADR 0170: Engine DJ kept in step both ways: cues, loops and the beat grid
- engineClient
- DuplicatesView.svelte
- analyze.rs
- text()
- ref_node_fs
- relink.ts
- tests/answers.rs
- sharedCloud.ts
- src/room.rs
- Disk
- ADR 0162: With GLUE Home running, the page is only its screen: it starts none of the library's work
- ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put
- disk.rs
- dupes
- users
- .song()
- CloudError
- sync.golden.test.ts
- Engine DJ: what writing back to it involves
- DiscogsView.svelte
- src/discogs.rs
- project.rs
- Performance
- wave.ts
- Track
- glue-engine/src/dupes.rs
- parse_serato_database()
- prepare.svelte.ts
- lib/perf.ts
- HomeStore
- admin.ts
- imports.ts
- guide
- interop.test.ts
- localHome.svelte.ts
- interop.golden.test.ts
- verify.rs
- Pv
- ADR 0061: Songs go onto the drag dock by dragging them there too
- verdict.ts
- discogsBuild.ts
- PhoneSongs.svelte
- analyse()
- serde_json
- names.rs
- Engine<H>
- auto.svelte.ts
- covers
- covers.rs
- djsync.rs
- tidy.rs
- ADR 0060: Read, parse and decode audio in the worker (mediabunny + WebCodecs)
- glue-rtc/src/lib.rs
- crypto.ts
- service.rs
- downloads.svelte.ts
- bridge.ts
- package.json
- fingerprints.ts
- .dj_check()
- xml.rs
- ADR 0191: Give every theme Hallmark's Console treatment: the colours kept, the type and surfaces mad
- ADR 0065: Live sync of DJ libraries is GLUE Home's; in the browser alone, Refresh
- ref_node_url
- window.rs
- golden.test.ts
- js_keys()
- homemode.spec.ts
- dock.rs
- libraries.rs
- make-audio.ts
- djWatch.svelte.ts
- DevicesSection.svelte
- reminders.rs
- signal.rs
- backup.rs
- src-tauri/src/dupes.rs
- Query
- graph_docs.py
- flac.ts
- drag
- PlayerPanel.svelte
- merge3.ts
- HomeDir
- ADR 0102: Caches follow a collection; turning cloud sync off keeps it here, the account's copy optio
- sync
- blank_track()
- ADR 0063: DJ libraries are browsed live; playlists come into GLUE on demand and stay linked
- ADR 0174: Another computer's songs stream as they arrive, and their start says where its time went
- decodeAudio()
- importActions.ts
- glue-audio/tests/golden.rs
- repair.rs
- perf.spec.ts
- compilerOptions
- stems
- thumbs
- idbSet()
- Stem separation
- Engine
- js
- djinfo.rs
- ADR 0193: Download songs as files: ranges from GLUE Home, a zip written as it goes
- src-tauri/src/tags.rs
- dj.rs
- import_golden.rs
- types
- String
- rtc-probe.mjs
- library/bpm.ts
- zip.ts
- ZipWriter
- columns
- HomeSocket
- cover.ts
- ADR 0128: Build the code map on GitHub for every push, and use it by fixed rules
- summary.rs
- IceCache
- traktor.rs
- stems.worker.ts
- FakeHome
- ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address
- dependencies
- auto
- scratch
- HomeDisk
- details.ts
- glue-audio.rs
- .computers_here()
- phone-ui.spec.ts
- activity.rs
- bundle
- updates.ts
- devDependencies
- stems.svelte.ts
- fingerprint.rs
- super
- fs
- tauri.conf.json
- Right-click menus (feature)
- incoming
- Waterfall3D
- cloud/package.json
- confirm()
- ADR 0125: A song dropped onto the page is placed by GLUE Home; the tab analyses only what just it ca
- capture.ts
- serato.ts
- engine.svelte.ts
- .start()
- discogsBuild
- ADR 0177: Opening the library or a collection shows its progress, and waits less
- lossy.rs
- lossy_golden.rs
- ADR 0104: GLUE Home is the library's engine; the website on its computer is its screen
- scripts
- download.test.ts
- Plan: shared collection
- HomeFile
- patch.test.ts
- covers_golden.rs
- control.rs
- dupes_golden.rs
- shared.spec.ts
- GLUE Home build workflow (home.yml)
- updater
- ui/engine.ts
- relink
- platform/homeDisk.ts
- glue-interop/tests/golden.rs
- Arriving
- Handler<H>
- patchFloat64()
- ADR 0115: Any browser on GLUE Home's computer takes its link from GLUE Home itself
- tsconfig.test.json
- 0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it
- ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust
- ADR 0143: A sync takes in what it wrote, even when it fails; this computer's GLUE Home is looked for
- EditInfo.svelte
- dupeGroups.golden.test.ts
- homeBundle.test.ts
- Vision
- ADR 0129: Refresh the code map's docs in every session that changes them, without the skill; browse 
- turn.ts
- .join()
- .recheck_verdicts()
- 0098. Duplicates across computers: each computer publishes its own matches
- 0107. The shared sync looks only at the files that changed, and keeps its agreed copies file by file
- counts.ts
- sidebar
- tabs
- SharedCloud
- PageSocket
- ADR 0077: A device without a library of its own opens the account's library from GLUE Cloud, and pla
- default.json
- glue-engine
- 0130. The same file on two computers is one song, with a copy on each
- downloads
- output
- 0140. A song played pauses the analysis's reads, not only its new songs
- Help: Devices, accounts and profiles
- ADR 0163: One computer never clashes with itself
- 0114. The account's profiles are every device's; each device picks its own
- Song Page Feature
- Help: Getting started
- ADR 0049: Folders are playlists too (as in Engine DJ)
- 0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer
- 0128. Build the code map on GitHub for every push, and use it by fixed rules
- 0129. Refresh the code map's docs in every session that changes them, without the skill; browse it on the site
- 0135. Analysis around network folders: their songs take turns, GLUE Home reads tags in batches, one "left" count
- 0136. Analysis limits are the user's to set, with the speed shown and a suggestion from it
- 0137. This computer's browser is never a remote session, and isn't counted; the direct link isn't dropped on one slow answer
- 0141. Songs played get their own port, and a file read looks up only its own folder
- 0144. FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so
- 0145. Judge "the same name" one way, in `core/library/names.ts`
- 0151. GLUE opens in GLUE Home's own window, showing the live site
- 0153. GLUE Home's library engine in Rust, tested end to end against the real one
- 0154. The analysis queue in GLUE Home's engine, in Rust
- 0155. GLUE Home syncs the shared collections in Rust, held to the website's sync
- 0159-glue-homes-first-run-and-its-window-signed-in.md
- 0160. GLUE Home's service in its engine: the hidden page removed
- 0164. GLUE Home matches the duplicates' fingerprints
- 0175. Back from the background, the room and the sessions are made again at once
- 0189. Discogs playlists: vinyl and digital together, kept under Discogs
- 0193. Download songs as files: ranges from GLUE Home, a zip written as it goes
- Downloads
- The details' spectrogram: what it costs, and what would shrink it
- sorted()
- Lookups
- Pending
- Tags feature
- Code map view step in deploy
- help/discogs.md
- help/downloads.md
- anywhere
- 0074. Events: a calendar in GLUE, each event with a folder of playlists, reminders in GLUE and from GLUE Home
- 0168. DJ apps synced both ways: playlists, cues, loops and beat grids
- 0169. The main DJ library
- 0170. Engine DJ kept in step both ways: cues, loops and the beat grid
- 0186. Discogs covers, with the user's token
- 0187. The Discogs collection: read by GLUE Home, kept in the profile, matched on the page
- Help: Adding music
- 0077. A device without a library of its own opens the account's library from GLUE Cloud, and plays it
- features/discogs.md
- e2e/home-public/home.html: GLUE Home test stand-in page
- GLUE Home analysis (fillInfo)
- From each network folder at a time setting
- Tour: analyze
- Tour: calendar
- Help: Backups and restoring
- Help: gluey
- Help: themes
- DJ library formats research
- Deploy GLUE Cloud workflow
- Follow threejs-visualisers workflow
- Away music folder
- Folder listing mechanism
- GLUE Home Stop semantics
- GLUE Home release notes (installers, unsigned)
- GLUE Home settings page
- OnScreen helper
- OutdatedStore pattern
- Remote data fetch from another computer
- Remote Session
- Retries mechanism
- RTCPeerConnection
- crates/glue-engine/src/service.rs: service implementation
- Quality verdict detection logic
- analysisState function for verdict
- Quality help article
- Song Page Article
- Home mode tab logic
- Analysis worker pool
- Profiles state and methods
- Home mode disk access through local link
- Tag reading in queue
- notes.txt test fixture
- Thumbnails, waveforms, covers loader
- One 'left' count (queued + running)
- ADR 0010: Read-only import and file export before any write-back
- Found on the way: a start overtaken by Stop
- Import Engine DJ feature
- Import Rekordbox feature
- crates/glue-engine/src/verify.rs: native check
- withCopies function

## God Nodes (most connected - your core abstractions)
1. `Vault README (sections, conventions, feature index)` - 158 edges
2. `Track` - 121 edges
3. `GLUE Cloud: accounts, GLUE Home and devices` - 77 edges
4. `vitest` - 71 edges
5. `GLUE: how it works now` - 70 edges
6. `text()` - 64 edges
7. `CollectionStore` - 61 edges
8. `handle()` - 54 edges
9. `account` - 47 edges
10. `writePref()` - 44 edges

## Surprising Connections (you probably didn't know these)
- `Alternatives considered` --references--> `Source`  [INFERRED]
  vault/adr/0187-discogs-collection-read-by-glue-home.md → src/store/types.ts
- `Context` --references--> `HomeDir`  [INFERRED]
  vault/adr/0125-dropped-songs-placed-by-glue-home.md → src/platform/homeDisk.ts
- `Alternatives considered` --references--> `trackKey()`  [INFERRED]
  vault/adr/0130-same-file-on-two-computers-is-one-song.md → src/core/shared/match.ts
- `Alternatives considered` --references--> `makeShared()`  [INFERRED]
  vault/adr/0161-no-own-form-into-a-shared-collection.md → src/store/shared/seed.ts
- `Context` --references--> `discover()`  [INFERRED]
  vault/adr/0143-a-sync-takes-in-what-it-wrote-and-looking-for-glue-home-needs-a-reason.md → src/lib/localHome.svelte.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Client-side stem separation pipeline** — vault_adr_0003_client_side_stems_webgpu, vault_adr_0004_float64_model_patch, vault_adr_0005_model_from_huggingface [EXTRACTED 0.90]
- **Analysis flow: concurrency -> speed tracking -> suggestion** — network_folder_concurrency, speed_suggestion_algorithm [EXTRACTED 1.00]
- **GLUE Home cache tidy: decision, sweep and the background feature** — vault_adr_0185_the_cache_of_songs_that_left_is_tidied_decision, glue_home_cache_tidy, vault_features_background_analysis_feature [EXTRACTED 1.00]
- **Discogs playlist flow: decision, list marker, logic, view** — vault_adr_0189_discogs_playlists_decision, src_core_library_discogslists, src_ui_library_discogslistview, vault_features_discogs_feature [EXTRACTED 1.00]
- **Documentation refresh workflow** — vault_adr_0129_code_map_docs_every_session_decision, scripts_graph_docs [EXTRACTED 1.00]
- **Download flow: fetch bytes, write zip, report progress** — vault_features_downloads_byte_sources, vault_features_downloads_writing_modes, vault_features_downloads_panel [EXTRACTED 1.00]
- **Engine DJ folder repair: shipped in 0.74.0, turned off in 0.74.1** — vault_adr_0183_engine_dj_folders_kept_as_engine_dj_keeps_them_decision, enginedj_fix_folders, vault_adr_0184_engine_dj_folder_repair_turned_off_decision [EXTRACTED 1.00]
- **Discogs collection flow: read by GLUE Home, kept per profile, matched on the page, shown as a view** — vault_adr_0187_discogs_collection_read_by_glue_home_decision, vault_adr_0187_discogs_collection_read_by_glue_home_profile_file, vault_adr_0187_discogs_collection_read_by_glue_home_matching, vault_adr_0187_discogs_collection_read_by_glue_home_view [EXTRACTED 1.00]
- **Discogs cover look-up with the user's token** — vault_adr_0186_discogs_covers_with_the_users_token_decision, vault_adr_0186_discogs_token_only_to_discogs, src_help_glue_home_covers_from_discogs, vault_features_song_info_covers_looked_up [EXTRACTED 1.00]
- **Discogs playlist builder: ticked records to a saved playlist** — vault_features_discogs_playlist_builder, vault_features_discogs_playlists, vault_adr_0190_the_discogs_playlist_builder_decision, src_help_discogs_article [EXTRACTED 1.00]
- **GLUE Home engine work: analysis, DJ libraries, Engine DJ sync** — vault_system_glue_home_engine, vault_system_analysis_in_engine, vault_system_dj_libraries_in_rust, vault_system_engine_dj_two_way [EXTRACTED 1.00]
- **Home mode: local link, engine, writer lease** — vault_system_local_link, vault_system_home_mode, vault_system_writer_lease, vault_system_glue_home_engine [EXTRACTED 1.00]
- **Shared sync: push, log, pull, merge, write** — vault_system_sync, vault_system_shared_collections, vault_system_one_id_per_computer, vault_system_glue_cloud_component [EXTRACTED 1.00]
- **A DJ app's playlists: kept in its DJ collection, imported, or GLUE's own** — vault_adr_0178_dj_playlists_stay_in_the_dj_collection_decision, vault_adr_0179_engine_dj_edited_in_the_dj_collection_decision, vault_adr_0180_glues_playlists_in_engine_djs_glue_folder_decision [EXTRACTED 1.00]
- **Where an Engine DJ playlist write lands: the Collection, then each drive's copy** — vault_adr_0181_engine_dj_libraries_made_where_a_drive_has_none_decision, vault_adr_0182_engine_dj_collection_and_its_drive_copies_decision, vault_adr_0179_engine_dj_edited_in_the_dj_collection_decision [EXTRACTED 1.00]
- **Streamed song start: piece stream, reconnect after background, console timing** — vault_adr_0174_songs_stream_as_they_arrive_decision, vault_adr_0175_back_from_the_background_connected_at_once_decision, vault_adr_0176_a_songs_start_timing_in_the_console_only_decision [EXTRACTED 1.00]
- **One analysis pipeline: folder listing, tag reading, and song analysis** — folder_listing_concept, tag_reading_concept [EXTRACTED 1.00]
- **Player bar and queue UI system** — full_player_bar_ui, queue_system, visualiser_feature [EXTRACTED 1.00]
- **Discogs records matched: tracklist, track match, by hand** — vault_adr_0188_discogs_records_matched_track_by_track_tracklist, vault_adr_0188_discogs_records_matched_track_by_track_track_match, vault_adr_0188_discogs_records_matched_track_by_track_by_hand [EXTRACTED 1.00]
- **Vinyl scrub flow: the engine feeds the platter, which hands over to the player** — vault_adr_0192_vinyl_scrubbing_engine, vault_adr_0192_vinyl_scrubbing_platter, vault_adr_0192_vinyl_scrubbing_handover [EXTRACTED 1.00]
- **Verdict re-checking from stored analyses** — vault_adr_0166_glue_home_rechecks_verdicts_and_tidies_decision [EXTRACTED 1.00]
- **Library organization and discovery system** — src_help_library_article, vault_features_library_scanner_feature, vault_features_duplicates_feature [INFERRED 0.75]
- **Cloud sync lineage** — vault_adr_0036_optional_accounts_and_cloud_signaling_decision, vault_adr_0040_cloud_sync_and_merged_collections_decision, vault_adr_0042_merged_collection_in_the_local_library_decision, vault_adr_0043_batched_sync_and_progressive_loading_decision [INFERRED 0.85]
- **Direct link reliability under load** — remote_session_concept [INFERRED 0.85]
- **DJ library importers** — vault_features_import_traktor_feature, vault_features_import_serato_feature, vault_features_import_apple_icloud_feature [INFERRED 0.85]
- **File scanning with live updates and detection** — src_core_library_scan, quick_hash_mechanism, file_system_observer_mechanism, quick_tag_parsing [INFERRED 0.85]
- **GLUE Home build and release flow** — github_workflows_home_workflow, github_workflows_home_publish_job, github_workflows_home_latest_json_manifest, github_workflows_home_release_all_or_nothing [INFERRED 0.85]
- **Hallmark Console treatment: decision, shared tokens, the look it shapes, and the theme feature** — vault_adr_0191_hallmark_console_treatment_decision, vault_adr_0191_hallmark_console_treatment_tokens, vault_features_themes_feature [INFERRED 0.85]
- **Discogs: read, match, then playlists** — vault_features_discogs_reading, vault_features_discogs_track_matching, vault_features_discogs_playlists [INFERRED 0.85]
- **Integrated imported records into library with visual representation** — imported_record_matching_mechanism, waveform_thumbnails_mechanism, src_store_merge, src_core_library_thumb [INFERRED 0.85]
- **Spectrogram cache storage decision flow** — vault_research_spectrogram_size_spectrogram_storage, vault_research_spectrogram_size_encodings_tried, vault_research_spectrogram_size_compute_on_open_not_taken, vault_research_spectrogram_size_leave_as_is [INFERRED 0.85]
- **Network folder analysis optimization** — unified_progress_count_concept, network_folder_song_queuing_mechanism, tag_batch_reading_mechanism [INFERRED 0.95]
- **On-screen data loading and retry flow** — on_screen_helper_concept, retries_mechanism_concept, remote_data_fetch_concept [INFERRED 0.95]
- **Playback performance: separate port and folder-scoped lookups** — play_port_mechanism, folder_lookup_optimization_mechanism [INFERRED 0.95]

## Communities (397 total, 102 thin omitted)

### Community 0 - "library.svelte.ts"
Cohesion: 0.03
Nodes (74): needing, ids(), Facet, FacetItem, facetItems(), facetKey(), FACETS, facetValue() (+66 more)

### Community 1 - "remoteFiles.svelte.ts"
Cohesion: 0.02
Nodes (127): ADR-0045, ADR-0081, ADR-0047, ADR-0132, ADR-0048, Conn, MockHome, putKeys() (+119 more)

### Community 2 - "glue-interop/src/sync.rs"
Cohesion: 0.06
Nodes (61): base_name(), Engine<H>, GLUE_FOLDER, items_of(), keep_unsent(), kept_in(), kept_lists(), kept_lists_are_the_ones_marked_and_what_their_folders_hold() (+53 more)

### Community 3 - "queue.rs"
Cohesion: 0.06
Nodes (42): truthy(), after_analysis(), ANALYSIS_VERSION, at(), cores(), differ(), Engine<H>, failed_before() (+34 more)

### Community 4 - "trackMenu.ts"
Cohesion: 0.05
Nodes (56): ADR-0067, ADR-0042, filterMenu(), shownFilters(), titleOf(), ADR-0067, GLUEY_SINCE, whatsThis() (+48 more)

### Community 5 - "enginedb.rs"
Cohesion: 0.07
Nodes (47): ancestors(), depth(), Engine<H>, holds(), insert_with_id(), l(), tree_at(), uuid_of() (+39 more)

### Community 6 - "parse.rs"
Cohesion: 0.08
Nodes (44): decode(), Decoded, keep_range(), mp4_edit(), push(), AAC_SR, add_tag(), apply_stream_info() (+36 more)

### Community 7 - "Vault README (sections, conventions, feature index)"
Cohesion: 0.04
Nodes (61): ADR-0018, ADR-0026, ADR-0105, ADR-0072, legacy/index.html, ADR-0072, src/lib/library.svelte, ADR-0072 (+53 more)

### Community 8 - "writePref()"
Cohesion: 0.04
Nodes (38): svelte, threejs-visualisers, AppState, ColDef, ColKey, DEFAULT_HIDDEN, DEFAULT_ORDER, load() (+30 more)

### Community 9 - "vitest"
Cohesion: 0.07
Nodes (34): vitest, DamagedFile, Dir, parseJSON(), readJSON(), writeJSON(), writeText(), asDir() (+26 more)

### Community 10 - "Playlists, folders & smart lists"
Cohesion: 0.03
Nodes (66): ADR-0178, ADR-0179, ADR-0180, ADR-0062, Engine DJ backup strategy, crates/glue-interop, Playlist Order Sync, Engine DJ Songs Relinking (+58 more)

### Community 11 - "app.svelte.ts"
Cohesion: 0.06
Nodes (40): three, fmtDb(), fmtTime(), freqLabel(), niceStep(), niceTimeStep(), Cutoff, app (+32 more)

### Community 12 - "dsd.rs"
Cohesion: 0.06
Nodes (42): a_dsf_file_is_analysed(), a_dsf_sine_comes_out_as_that_sine_at_88_2_khz(), BYTES1, channel_bytes(), decode(), Dsd, dsf_sine(), factor() (+34 more)

### Community 13 - "folders.ts"
Cohesion: 0.04
Nodes (50): ADR-0146, Detected, Entries, findLibraries(), head(), libraryAt(), ADR-0030, fileHead() (+42 more)

### Community 14 - "GLUE Cloud: accounts, GLUE Home and devices"
Cohesion: 0.04
Nodes (57): ADR-0119, ADR-0120, ADR-0121, ADR-0150, ADR-0101, ADR-0150, ADR-0150, ADR-0101 (+49 more)

### Community 15 - "merge.ts"
Cohesion: 0.07
Nodes (57): parseM3u(), baseName(), blankTrack(), ImportedLibrary, ImportedTrack, normPath(), FileEntry, Linkable (+49 more)

### Community 16 - "main.rs"
Cohesion: 0.08
Nodes (43): list(), move_to(), moves_without_overwriting(), safe_name(), with_number(), File read folder lookup: resolve each folder only once, remember for 10 min, a_folder_is_looked_up_once(), activity_now() (+35 more)

### Community 17 - "events.svelte.ts"
Cohesion: 0.06
Nodes (42): ADR-0074, ADR-0074, blankEvent(), daysUntil(), eventDay(), EventStatus, folderName(), GlueEvent (+34 more)

### Community 18 - "String"
Cohesion: 0.10
Nodes (8): changed_over(), command(), Engine<H>, get(), iso(), Job, key(), now()

### Community 19 - "files.rs"
Cohesion: 0.06
Nodes (46): analysed(), analysed_failed(), decode_details(), details(), DETAILS_VERSION, fingerprint_file(), format_of(), MAX_ROWS (+38 more)

### Community 20 - "analysis.worker.ts"
Cohesion: 0.06
Nodes (50): ADR-0006, analyzeMusic(), analyzeSamples(), computeSpectrum(), decimate(), FrameReader, makePcmReader(), monoOf() (+42 more)

### Community 21 - "glue-engine/src/sync.rs"
Cohesion: 0.13
Nodes (37): agreed_dir(), apply_change(), base(), checkpoint(), diff_file(), DIRS, entry_of(), files_and_changes() (+29 more)

### Community 22 - "CollectionStore"
Cohesion: 0.08
Nodes (28): ADR-0152, InfoField, analysisHere(), collectionHere(), toLocal(), CollectionStore, readAll(), StoreOp (+20 more)

### Community 23 - "nowPlaying.svelte.ts"
Cohesion: 0.07
Nodes (33): Full player bar, facetInfo(), advance(), back(), clear(), dequeue(), EMPTY_QUEUE, enqueue() (+25 more)

### Community 24 - "collection.ts"
Cohesion: 0.09
Nodes (54): ADR-0108, ADR-0108, ADR-0108, ADR-0108, GroupInput, adopt(), Adopted, empty() (+46 more)

### Community 25 - "tests/engine.rs"
Cohesion: 0.10
Nodes (37): a_collection_deleted_from_the_account_is_backed_up_and_put_away(), a_collection_is_tidied_when_it_opens(), a_job_removes_songs_and_their_copies(), a_shared_collection_is_put_right_once_with_a_backup(), a_song_that_cant_go_to_engine_dj_stays_in_glues_playlist_and_says_why(), an_analysis_running_while_its_tags_are_written_takes_the_new_date(), an_edit_is_saved_and_told(), C (+29 more)

### Community 26 - "account.svelte.ts"
Cohesion: 0.07
Nodes (18): passwordKey(), account, API_BASE, browserName(), CloudUser, GOOGLE_CLIENT_ID, GoogleId, Session (+10 more)

### Community 27 - "Store<D>"
Cohesion: 0.11
Nodes (15): truthy(), BinEntry, get(), id_of(), LoadOpts, migrate(), num(), OUTDATED (+7 more)

### Community 28 - "H"
Cohesion: 0.09
Nodes (6): call(), H, main(), PagePeers, say(), State

### Community 29 - "Welcome.svelte"
Cohesion: 0.04
Nodes (37): ADR-0151, ADR-0151, dropIntoLibrary(), hasFiles(), onDrop(), HOME_DOWNLOADS, homePairLink(), RELEASES (+29 more)

### Community 30 - "library/analysis.ts"
Cohesion: 0.06
Nodes (44): ADR-0144, afterAnalysis(), analysed, analysisState, gaveUp(), isTransient(), needsAnalysis(), ADR-0109 (+36 more)

### Community 31 - "api.ts"
Cohesion: 0.14
Nodes (40): ACCESS_TTL, attach(), authed(), bad(), browserSession(), claim(), CODE_TTL, computerOf() (+32 more)

### Community 32 - "library.spec.ts"
Cohesion: 0.06
Nodes (33): ADR-0156, ADR-0158, ADR-0154, ADR-0156, ADR-0158, ADR-0156, LIBRARY, ADR-0136 (+25 more)

### Community 33 - "App"
Cohesion: 0.11
Nodes (13): access(), api_of(), App, cfg(), chosen(), current(), ENGINE, engine_cmd() (+5 more)

### Community 34 - "tests/room.rs"
Cohesion: 0.09
Nodes (16): a_silent_room_is_connected_again(), a_start_overtaken_by_stop_says_nothing(), Calls, FakePeers, FakeSocket, full_refused_and_the_same_tab_replaces_its_own(), H, offer() (+8 more)

### Community 35 - "library.rs"
Cohesion: 0.11
Nodes (16): away(), Engine<H>, exists(), HEX, INCOMING_ROOT, is_away(), join(), Known (+8 more)

### Community 36 - "@playwright/test"
Cohesion: 0.07
Nodes (30): errors, test, test, ADR-0074, errors, fixture(), libraryWithASong(), test (+22 more)

### Community 37 - "local.rs"
Cohesion: 0.07
Nodes (31): an_analysis_read_waits_while_a_song_plays_then_goes_on(), answer(), busy_for_test(), BUSY_UNTIL, decode(), EDITS, FOREGROUND_AT, handle() (+23 more)

### Community 38 - "ADR 0094: One shared collection in GLUE Cloud, the same on every device"
Cohesion: 0.05
Nodes (43): ADR-0094, ADR-0094, ADR-0040, ADR-0089, ADR-0094, ADR-0097, ADR-0095, src_core_library_cloudEdits (+35 more)

### Community 39 - "js.rs"
Cohesion: 0.07
Nodes (19): fixed_num(), grouped(), num_str(), to_fixed(), arr(), Clash, Kind, Analysis (+11 more)

### Community 40 - "glue-interop/src/types.rs"
Cohesion: 0.09
Nodes (23): parse_library_files(), array_index(), base_name(), CuePoint, decode_uri_component(), EngineSet, Grid, grid_at() (+15 more)

### Community 41 - "read_json()"
Cohesion: 0.12
Nodes (10): Dir, FsDir, MemDir, read_json(), ReadError, Damaged, Io, temp_for() (+2 more)

### Community 42 - "Feature: Library & scanner"
Cohesion: 0.05
Nodes (32): describeRemoval(), orphans(), removalImpact, ADR-0111, Help: No file linked, ADR-0111, ADR-0100, ADR-0009 (+24 more)

### Community 43 - "Background analysis"
Cohesion: 0.05
Nodes (37): analysisState, Background analysis worker pool, follow_moves, GLUE Home native analysis engine (glue-audio), ADR-0024, tidy_cache (GLUE Home service), ADR-0103, ADR-0147 (+29 more)

### Community 44 - "parse.ts"
Cohesion: 0.11
Nodes (37): AAC_SR, addTag(), decodeId3Text(), ext80(), latin1(), latin1Dec, MP3_BR, mp3Gapless() (+29 more)

### Community 45 - ".answer()"
Cohesion: 0.12
Nodes (12): Answer, Data, Background, data(), Devices, Engine<H>, HEX, ids() (+4 more)

### Community 46 - "shared/engine.ts"
Cohesion: 0.12
Nodes (33): COMPACT_AFTER, setAt(), agreedDir(), applyChange(), base(), checkpoint(), diffFile(), DIRS (+25 more)

### Community 47 - "store/types.ts"
Cohesion: 0.06
Nodes (35): ListEntry, listTree, Severity, ADR-0090, collections, ADR-0058, ADR-0090, ADR-0094 (+27 more)

### Community 48 - "store.golden.test.ts"
Cohesion: 0.05
Nodes (42): ADR-0169, ADR-0169, ADR-0169, ADR-0169, ADR-0169, common(), copy(), damaged (+34 more)

### Community 49 - "Player"
Cohesion: 0.06
Nodes (38): AIFF format handling, Audio element management, Deferred track page loading, ADR-0083, ADR-0076, ADR-0076, ADR-0088, GLUE Home song port (+30 more)

### Community 50 - "Store"
Cohesion: 0.16
Nodes (22): arr(), copies(), get(), glue_path(), GONE_AFTER, import_lists(), Importer, Importer<'_, D> (+14 more)

### Community 51 - "discogsLists.ts"
Cohesion: 0.09
Nodes (27): discogsAuto(), DiscogsRules, isVinyl(), itemOf(), lower(), NO_RULES, parseRef(), plainName() (+19 more)

### Community 52 - "platform/index.ts"
Cohesion: 0.08
Nodes (34): ADR-0007, canPickFolders(), Dir, droppedFolder(), fileLink(), FilePicker, firstSong(), folderHandle() (+26 more)

### Community 53 - "ws.rs"
Cohesion: 0.07
Nodes (19): allowed(), get(), get_with(), host_of(), HOSTS, IMAGE_HOSTS, MAX, sends() (+11 more)

### Community 54 - "lib/analysis.ts"
Cohesion: 0.10
Nodes (29): pick(), timeAsync(), FileInfo, analysisWorker(), analyze(), decodedByWorker(), fingerprintOf(), NeedsPageDecode (+21 more)

### Community 55 - "protocol.rs"
Cohesion: 0.08
Nodes (7): a_device_asks_and_sends(), Client, H, Mem, next_text(), Sink, the_relays_servers_are_taken()

### Community 56 - "rtc.rs"
Cohesion: 0.09
Nodes (8): File, answer(), App, Conns, new(), Playing, RECEIVING, SERVING

### Community 57 - "glue-engine/src/tags.rs"
Cohesion: 0.09
Nodes (17): Cover, cover_of(), from_image(), jpeg(), LARGE, picture(), picture_from(), SMALL (+9 more)

### Community 58 - ".serve()"
Cohesion: 0.16
Nodes (7): Chan, Host, now_ms(), put_keys(), Server<H>, Song, unframe()

### Community 59 - "edits.ts"
Cohesion: 0.10
Nodes (32): djValues, listsByTrack(), ADR-0059, insights, tagOverlap(), ADR-0032, addTags(), cleanTag() (+24 more)

### Community 60 - "covers.golden.test.ts"
Cohesion: 0.10
Nodes (30): ADR-0086, ADR-0086, CoverQuery, lookupKey(), norm(), pick(), queryOf(), quote() (+22 more)

### Community 61 - "keys.ts"
Cohesion: 0.09
Nodes (22): camelotNum(), fifthsPos(), harmonicNeighbours(), keyAt(), keyLabel(), KeyNotation, MAJOR_NAMES, MINOR_NAMES (+14 more)

### Community 62 - "PrepareView.svelte"
Cohesion: 0.06
Nodes (25): byRecord, bySource, cuesFor(), fromApps(), index(), mainOf(), mainSource(), records() (+17 more)

### Community 63 - "backup.ts"
Cohesion: 0.10
Nodes (29): profiles, AUTO_DIR, AUTO_KEEP, autoBackup(), BACKUP_FORMAT, BACKUP_VERSION, BackupManifest, buildBackup() (+21 more)

### Community 64 - "player"
Cohesion: 0.10
Nodes (7): Grid, metronome, ADR-0052, mediaError(), player, refusal(), toSink()

### Community 65 - "signal.ts"
Cohesion: 0.10
Nodes (15): Att, ClientMsg, Env, prepare(), RoomMsg, Signal, STALE, State (+7 more)

### Community 66 - "Engine<H>"
Cohesion: 0.15
Nodes (3): Engine<H>, now(), room_loop()

### Community 67 - "dupes.svelte.ts"
Cohesion: 0.10
Nodes (32): fmtBytes(), buildGroups(), certainty(), concerns(), Copy, copyScore(), GRADE, groupKey() (+24 more)

### Community 68 - "shared.ts"
Cohesion: 0.10
Nodes (34): MAX_BUNDLE, MAX_BUNDLE_PATHS, MAX_BYTES, MAX_FILE, SyncError, append(), bin(), bundle() (+26 more)

### Community 69 - "Host"
Cohesion: 0.08
Nodes (4): Feed, FULL_EVERY, Host, JOBS

### Community 70 - "remoteFiles"
Cohesion: 0.13
Nodes (6): incomingKey(), companionOf(), companionOnline(), describeStart(), remoteFiles, streamsReady()

### Community 71 - "guide.test.ts"
Cohesion: 0.09
Nodes (29): ADR-0126, ADR-0126, Article, esc(), inline(), parseArticle(), renderMarkdown(), safeHref() (+21 more)

### Community 72 - "ADR 0036: Optional accounts and a small free cloud service (Cloudflare) for devices and signaling"
Cohesion: 0.06
Nodes (28): both, got, homeLog, kicked, signalled, stop(), ws, ADR-0091 (+20 more)

### Community 73 - "verdict.rs"
Cohesion: 0.14
Nodes (26): article(), at(), Beyond, beyond_wall(), classify(), detect_cutoff(), expected_cutoff(), expected_table() (+18 more)

### Community 74 - "parse_engine_db()"
Cohesion: 0.13
Nodes (14): Cell, Blob, Null, Num, Text, cols(), combine_engine(), combine_engine_with_tree() (+6 more)

### Community 75 - "ADR 0187: The Discogs collection: read by GLUE Home, kept in the profile, matched on the page"
Cohesion: 0.07
Nodes (29): ADR-0186, ADR-0188, ADR-0186, ADR-0187, Discogs help article, Covers from Discogs (help), ADR-0187, ADR-0187 (+21 more)

### Community 76 - "fingerprint.ts"
Cohesion: 0.09
Nodes (27): ber(), fingerprint, FP_FRAME_SEC, FP_HOP, FP_N, FP_RATE, FP_SECONDS, popcount() (+19 more)

### Community 77 - "merge.rs"
Cohesion: 0.14
Nodes (18): apply_import(), blank_lib_track(), carried_engine(), CuePoint, fill_info(), has_file(), ImportedLibrary, ImportedTrack (+10 more)

### Community 78 - "shared.svelte.ts"
Cohesion: 0.14
Nodes (10): askDeleteShared(), at(), cloudFor(), ComputerStats, holdsMusic(), ownDevices(), shared, SharedInfo (+2 more)

### Community 79 - "fakeHome.ts"
Cohesion: 0.06
Nodes (26): ADR-0159, FakeHomeDirs, ADR-0070, ADR-0071, ADR-0087, ADR-0141, ADR-0157, ADR-0159 (+18 more)

### Community 80 - "tests/discogs.rs"
Cohesion: 0.12
Nodes (13): a_collection_read_today_without_its_tracklists_gets_them_without_reading_the_list_again(), discogs_is_asked_last_with_the_token_and_only_its_api_gets_it(), engine(), H, item(), looked_up(), nothing_found_before_the_token_is_looked_up_again(), PNG (+5 more)

### Community 81 - "ADR 0170: Engine DJ kept in step both ways: cues, loops and the beat grid"
Cohesion: 0.14
Nodes (25): ADR-0168, beatData(), colour(), hex(), loops(), performance(), quickCues(), Reader (+17 more)

### Community 82 - "engineClient"
Cohesion: 0.16
Nodes (3): engineClient, setLeaseHeld(), Found on the way: an analysis landing after its file's tags were written

### Community 83 - "DuplicatesView.svelte"
Cohesion: 0.06
Nodes (19): isAction(), load(), find(), tick(), cleaning, fmt(), hidden, includeDoubtful (+11 more)

### Community 84 - "analyze.rs"
Cohesion: 0.12
Nodes (19): analyze_music(), analyze_samples(), compute_spectrum(), decimate(), gauss(), Job, Demo, Float (+11 more)

### Community 85 - "text()"
Cohesion: 0.21
Nodes (14): edits_show_on_the_tree(), Engine<H>, find(), insert(), items_in(), names(), OPS, order_before() (+6 more)

### Community 86 - "ref_node_fs"
Cohesion: 0.07
Nodes (20): fixtures, ADR-0060, FETCHED, gitDir, inOut(), KEEP, OUT, own (+12 more)

### Community 87 - "relink.ts"
Cohesion: 0.15
Nodes (27): bare(), fold(), lower(), SAME_MARK, saysNothing(), songName(), spaced(), artistsOf() (+19 more)

### Community 88 - "tests/answers.rs"
Cohesion: 0.13
Nodes (12): a_songs_parts_made_when_asked_then_kept(), C, covers_looked_up_once_gently_and_refused_for_good(), data(), H, put(), Seen, setup() (+4 more)

### Community 89 - "sharedCloud.ts"
Cohesion: 0.09
Nodes (25): DB, ADR-0113, Access, Alias, color(), create(), list(), merge() (+17 more)

### Community 90 - "src/room.rs"
Cohesion: 0.09
Nodes (12): API, enc(), Peers, Received, Closed, Nothing, Text, Room (+4 more)

### Community 91 - "Disk"
Cohesion: 0.13
Nodes (4): Disk, Fwd, main(), Probe

### Community 92 - "ADR 0162: With GLUE Home running, the page is only its screen: it starts none of the library's work"
Cohesion: 0.07
Nodes (26): ADR-0162, ADR-0162, ADR-0162, ADR-0130, ADR-0162, ADR-0162, ADR-0130, ADR-0162 (+18 more)

### Community 93 - "ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put"
Cohesion: 0.08
Nodes (20): ADR-0139, cacheFile(), ADR-0138, ADR-0139, Gate, ADR-0138, ADR-0139, ADR-0139 (+12 more)

### Community 94 - "disk.rs"
Cohesion: 0.17
Nodes (15): cfg_path(), check(), colons_and_backslashes_only_matter_on_windows(), describe(), fail(), handle(), inside(), io_fail() (+7 more)

### Community 95 - "dupes"
Cohesion: 0.13
Nodes (12): bestLists(), DupGroup, time(), jobOf(), dupes, savedPath(), cacheDir(), 0165. GLUE Home makes the duplicate groups and points playlists at the best copies (+4 more)

### Community 96 - "users"
Cohesion: 0.11
Nodes (22): attempts, credentials, credentials_device, devices, devices_user, identities, pairing_codes, users (+14 more)

### Community 97 - ".song()"
Cohesion: 0.18
Nodes (9): Engine<H>, kbps(), origin(), parent_id(), real_path(), repoint(), Songs, Songs<'a> (+1 more)

### Community 98 - "CloudError"
Cohesion: 0.15
Nodes (6): Engine<H>, HttpCloud, HttpCloud<'_, H>, own_devices(), send_counts(), CloudError

### Community 99 - "sync.golden.test.ts"
Cohesion: 0.14
Nodes (18): fakeCloud(), syncShared(), SharedCloudServer, asDir(), Call, Golden, J(), lapEdit() (+10 more)

### Community 100 - "Engine DJ: what writing back to it involves"
Cohesion: 0.08
Nodes (23): membershipReference, Engine DJ cue, loop and beat-grid blobs, Playlist tree copied into every Engine DJ database, enginedj::fix_folders, folders_own, 0182. Engine DJ's playlists written as Engine DJ writes them: its Collection, then each drive's copy, Alternatives considered, Consequences (+15 more)

### Community 101 - "DiscogsView.svelte"
Cohesion: 0.09
Nodes (23): addToDiscogsList(), discogsListPicker(), newDiscogsListWith(), openDiscogsList(), plural(), ADR-0189, var(), choose() (+15 more)

### Community 102 - "src/discogs.rs"
Cohesion: 0.18
Nodes (12): AGAIN_MS, API, cached_of(), Engine<H>, file_of(), lacks(), NO_ART, PAGE (+4 more)

### Community 103 - "project.rs"
Cohesion: 0.20
Nodes (21): analysis_here(), analysis_shared(), collection_here(), collection_shared(), COPY_FIELDS, dedup(), get(), Here (+13 more)

### Community 104 - "Performance"
Cohesion: 0.08
Nodes (14): OnScreen and Retries, ?perf performance panel, OnScreen, Retries, ADR-0131, Why, bytes, state (+6 more)

### Community 105 - "wave.ts"
Cohesion: 0.09
Nodes (25): beatsBetween(), ADR-0052, Waveform, CuePoint, ADR-0052, ADR-0052, ADR-0052, ADR-0052 (+17 more)

### Community 106 - "Track"
Cohesion: 0.16
Nodes (5): Grid, dock, prepare, Row, Track

### Community 107 - "glue-engine/src/dupes.rs"
Cohesion: 0.17
Nodes (21): a_fingerprint_reads_as_the_website_writes_it(), build_groups(), certainty(), concerns(), copy_score(), decode(), FP_FRAME_SEC, group_key() (+13 more)

### Community 108 - "parse_serato_database()"
Cohesion: 0.16
Nodes (18): build_serato_library(), get(), minutes(), parse_serato(), parse_serato_crate(), parse_serato_database(), serato_path(), SField (+10 more)

### Community 109 - "prepare.svelte.ts"
Cohesion: 0.14
Nodes (22): addMemory(), autoLoop(), byTime(), HOT_COLORS, hotCue(), importable(), LETTERS, removeCue() (+14 more)

### Community 110 - "lib/perf.ts"
Cohesion: 0.14
Nodes (17): enablePerf(), perfStats(), record(), resetPerf(), Stat, stats, takeFrameWork(), ADR-0058 (+9 more)

### Community 111 - "HomeStore"
Cohesion: 0.14
Nodes (8): glueFolder, ADR-0051, ADR-0108, ADR-0113, HomeStore, now(), Alias, Profile

### Community 112 - "admin.ts"
Cohesion: 0.11
Nodes (23): AdminError, count(), maintenance(), N, route(), sessions(), stats(), TIERS (+15 more)

### Community 113 - "imports.ts"
Cohesion: 0.13
Nodes (22): sql.js, isAppleLibrary(), cols(), combineEngine(), engineKey(), isSqlite(), libOf(), linkedOrder() (+14 more)

### Community 114 - "guide"
Cohesion: 0.15
Nodes (9): cleanGuide(), emptyGuide(), guideAdds(), GuideState, mergeGuide(), ADR-0126, tourById(), guide (+1 more)

### Community 115 - "interop.test.ts"
Cohesion: 0.20
Nodes (21): parseAppleLibrary(), plistValue(), PV, parseRekordboxXml(), MAJOR, nmlPath(), parseTraktorNml(), primaryKey() (+13 more)

### Community 116 - "localHome.svelte.ts"
Cohesion: 0.16
Nodes (10): attachHere(), homeOs, connect(), discover(), hello(), localHome, LocalLink, ports() (+2 more)

### Community 117 - "interop.golden.test.ts"
Cohesion: 0.15
Nodes (23): be64(), beats(), cases(), cat(), cp1252, crate(), enc(), engineDrive() (+15 more)

### Community 118 - "verify.rs"
Cohesion: 0.14
Nodes (11): bit_errors(), bytes_off(), Check, Engine<H>, fresh(), HEX, near(), same() (+3 more)

### Community 119 - "Pv"
Cohesion: 0.15
Nodes (12): HEAD, parse_apple_library(), Pv, Arr, Bool, Dict, Null, Num (+4 more)

### Community 120 - "ADR 0061: Songs go onto the drag dock by dragging them there too"
Cohesion: 0.10
Nodes (23): ADR-0027, ADR-0054, ADR-0061, ADR-0054, ADR-0056, ADR-0061, ADR-0054, ADR-0056 (+15 more)

### Community 121 - "verdict.ts"
Cohesion: 0.13
Nodes (24): article(), beyondWall(), classify(), declaredLabel(), detectCutoff(), EXPECTED, expectedCutoff(), findResample() (+16 more)

### Community 122 - "discogsBuild.ts"
Cohesion: 0.13
Nodes (21): BUILD_DEFAULTS, buildDiscogs(), BuildOptions, BuildResult, DgCandidate, Have, low(), passes() (+13 more)

### Community 123 - "PhoneSongs.svelte"
Cohesion: 0.10
Nodes (21): order(), at, cues, down(), dur, frac(), hot, move() (+13 more)

### Community 124 - "analyse()"
Cohesion: 0.15
Nodes (9): analyse(), analyse_demo(), Analysis, ext_of(), Failure, Broken, Unsupported, file_info() (+1 more)

### Community 125 - "serde_json"
Cohesion: 0.11
Nodes (3): root(), run(), the_store_writes_what_the_website_writes()

### Community 126 - "names.rs"
Cohesion: 0.22
Nodes (20): AND, bare(), BRACKETS, DASH, FEATURING, fold(), LIVE, lower() (+12 more)

### Community 127 - "Engine<H>"
Cohesion: 0.21
Nodes (3): Engine<H>, ms(), running()

### Community 128 - "auto.svelte.ts"
Cohesion: 0.16
Nodes (21): AutoOptions, AutoResult, bpmFit(), Candidate, generate(), Harmonic, keyFit(), replaceSlot() (+13 more)

### Community 130 - "covers.rs"
Cohesion: 0.13
Nodes (18): ART_SIZE, ARTISTS, enc(), GAP, js_len(), norm(), pick(), quote() (+10 more)

### Community 131 - "djsync.rs"
Cohesion: 0.16
Nodes (7): busy(), ENGINE_APPS, Engine<H>, has_col(), mtime(), Song, Synced

### Community 132 - "tidy.rs"
Cohesion: 0.22
Nodes (10): file_key(), FileEntry, get(), Linkable, LOOSE, match_tracks(), NUMBERED, s() (+2 more)

### Community 133 - "ADR 0060: Read, parse and decode audio in the worker (mediabunny + WebCodecs)"
Cohesion: 0.09
Nodes (19): ADR-0023, ADR-0060, mediabunny, KeepInput, keepRange(), ADR-0060, ADR-0060, ADR-0019 (+11 more)

### Community 134 - "glue-rtc/src/lib.rs"
Cohesion: 0.11
Nodes (11): CHUNK, Conn, frame(), Handler, HIGH_WATER, MAX_FILE, MAX_RANGE, safe_part() (+3 more)

### Community 135 - "crypto.ts"
Cohesion: 0.18
Nodes (20): b64url(), enc, GoogleClaims, googleKeys(), hmacKey(), json(), normCode(), pairingCode() (+12 more)

### Community 136 - "service.rs"
Cohesion: 0.12
Nodes (10): AUTO_DIR, AUTO_KEEP, CACHED, HEX, newly_found(), size_text(), song_ids(), St (+2 more)

### Community 137 - "downloads.svelte.ts"
Cohesion: 0.19
Nodes (19): PlanItem, PlanList, planLists(), PlanSong, planSongs(), safeName(), ADR-0193, unique() (+11 more)

### Community 138 - "bridge.ts"
Cohesion: 0.10
Nodes (16): Activity, API, askYesNo(), bridge, openFolder(), openUrl(), pickFolder(), Received (+8 more)

### Community 139 - "package.json"
Cohesion: 0.09
Nodes (20): autostart(), onPairLink(), allowScripts, github:festanqueiro/threejs-visualisers#3a85cac1d9db9d8c3ba30a5f65d90831f137944b, description, name, private, type (+12 more)

### Community 140 - "fingerprints.ts"
Cohesion: 0.17
Nodes (13): homeAnalysis, HomeState, decodeFingerprint(), decodePack(), encodeFingerprint(), encodePack(), packPath(), path() (+5 more)

### Community 141 - ".dj_check()"
Cohesion: 0.26
Nodes (4): Engine<H>, find_libraries(), Found, mtime()

### Community 142 - "xml.rs"
Cohesion: 0.15
Nodes (9): is_space(), ATTR, decode_entities(), ENTITY, parse_int(), parse_xml(), reads_what_the_website_reads(), SP (+1 more)

### Community 143 - "ADR 0191: Give every theme Hallmark's Console treatment: the colours kept, the type and surfaces mad"
Cohesion: 0.10
Nodes (20): ADR-0028, ADR-0191, GLUE website HTML shell (index.html), Google Fonts loaded by the shell: Archivo, Host Grotesk, Atkinson Hyperlegible Mono, Parts, ADR 0028: Themes: one token table, dark and light for each, 0191. Give every theme Hallmark's Console treatment: the colours kept, the type and surfaces made one system, Alternatives considered (+12 more)

### Community 144 - "ADR 0065: Live sync of DJ libraries is GLUE Home's; in the browser alone, Refresh"
Cohesion: 0.12
Nodes (21): ADR-0065, ADR-0065, ADR-0065, ADR-0065, ADR-0030, ADR-0065, ADR-0030, ADR-0065 (+13 more)

### Community 145 - "ref_node_url"
Cohesion: 0.10
Nodes (11): ADR-0153, files, FIX, OUT, ADR-0147, ADR-0153, End-to-end tests workflow (GitHub Actions), Native crates' tests and clippy in CI (+3 more)

### Community 146 - "window.rs"
Cohesion: 0.17
Nodes (11): free_name(), LABEL, open(), Place, place_file(), popup(), read_place(), save_place() (+3 more)

### Community 147 - "golden.test.ts"
Cohesion: 0.19
Nodes (18): blankInfo(), summarize(), makeThumb(), makeWaveThumb(), THUMB_H, THUMB_W, ADR-0031, WAVE_BYTES (+10 more)

### Community 148 - "js_keys()"
Cohesion: 0.22
Nodes (13): index_key(), js_gt(), js_keys(), locale_cmp(), num_str(), parse(), pretty(), quote() (+5 more)

### Community 149 - "homemode.spec.ts"
Cohesion: 0.10
Nodes (15): ADR-0149, ADR-0155, errors, MUSIC, ADR-0141, ADR-0155, ADR-0189, ADR-0190 (+7 more)

### Community 150 - "dock.rs"
Cohesion: 0.22
Nodes (13): changed(), clear(), current(), DOCK, dock_add(), dock_clear(), dock_items(), dock_remove() (+5 more)

### Community 151 - "libraries.rs"
Cohesion: 0.22
Nodes (10): CACHE, find(), Found, home(), is_library(), json(), look(), picked() (+2 more)

### Community 152 - "make-audio.ts"
Cohesion: 0.11
Nodes (17): DUPLICATE, encode(), entries, EXT, ff(), FILES, hz(), MAJOR (+9 more)

### Community 153 - "djWatch.svelte.ts"
Cohesion: 0.15
Nodes (12): AnyFile, Dir, DjState, djWatch, homeFollows(), placeDir(), stat(), ADR-0063 (+4 more)

### Community 154 - "DevicesSection.svelte"
Cohesion: 0.12
Nodes (18): manyDevices(), #each(), ago(), copied, deviceMenu(), left, now, only (+10 more)

### Community 155 - "reminders.rs"
Cohesion: 0.24
Nodes (11): at(), day_key(), days_until(), ev(), message(), needs_music(), needs_music_as_the_website_says(), parse_local() (+3 more)

### Community 156 - "signal.rs"
Cohesion: 0.15
Nodes (3): open(), Room, tcp()

### Community 157 - "backup.rs"
Cohesion: 0.22
Nodes (11): a_backup_holds_the_profile_and_says_what_it_is(), BACKUP_FORMAT, BACKUP_VERSION, build_backup(), crc32(), create_zip(), created_ms(), dos_time() (+3 more)

### Community 158 - "src-tauri/src/dupes.rs"
Cohesion: 0.19
Nodes (9): default_duplicates(), duplicates_dir(), free(), move_into(), moves_under_the_folder_name_and_path_and_numbers_clashes(), music_roots(), refuses_paths_that_leave_the_folder_and_folders(), run() (+1 more)

### Community 159 - "Query"
Cohesion: 0.28
Nodes (7): Engine<H>, kept_at(), lookup_key(), now(), Query, query_of(), search_url()

### Community 160 - "graph_docs.py"
Cohesion: 0.17
Nodes (9): adr_files(), digest(), finish(), node_id(), link(), prepare(), rel(), stem_id() (+1 more)

### Community 161 - "flac.ts"
Cohesion: 0.24
Nodes (12): Bits, BLOCK, decodeFlac(), fixed(), flacHeader(), FlacInfo, FlacPcm, frame() (+4 more)

### Community 162 - "drag"
Cohesion: 0.18
Nodes (7): djEntries(), djEntryOf(), glueSong(), ADR-0179, djAdd(), drag, djTracks()

### Community 163 - "PlayerPanel.svelte"
Cohesion: 0.12
Nodes (16): asShown(), i(), a, dropOn, full, fullscreen(), h, played (+8 more)

### Community 164 - "merge3.ts"
Cohesion: 0.16
Nodes (11): isObj(), kind(), merge3(), mergeBoth(), Merged, mergeSequence(), mergeSets(), mergeValue() (+3 more)

### Community 166 - "ADR 0102: Caches follow a collection; turning cloud sync off keeps it here, the account's copy optio"
Cohesion: 0.11
Nodes (17): ADR-0112, ADR-0102, ADR-0102, ADR-0112, ADR-0102, ADR-0112, ADR-0102, ADR-0112 (+9 more)

### Community 168 - "blank_track()"
Cohesion: 0.16
Nodes (8): parse_m3u(), channel(), HEAD, parse_rekordbox_xml(), blank_track(), file_url_to_path(), js_number(), trim()

### Community 169 - "ADR 0063: DJ libraries are browsed live; playlists come into GLUE on demand and stay linked"
Cohesion: 0.11
Nodes (17): ADR-0063, ADR-0063, ADR-0063, ADR-0063, ADR-0063, ADR-0099, ADR-0063, ADR-0063 (+9 more)

### Community 170 - "ADR 0174: Another computer's songs stream as they arrive, and their start says where its time went"
Cohesion: 0.12
Nodes (16): ADR-0174, ADR-0175, public/glue-stream-sw.js, Help article: GLUE on your phone, ADR-0175, ADR-0175, ADR-0174, ADR-0174 (+8 more)

### Community 171 - "decodeAudio()"
Cohesion: 0.14
Nodes (8): decodeAudio(), PROCESSOR, Msg, 0192. Scrub the Prepare deck like vinyl: the track in an AudioWorklet platter, the player taking over on release, Alternatives considered, Consequences, Context, ADR 0192: Scrub the Prepare deck like vinyl: the track in an AudioWorklet platter, the player taking

### Community 172 - "importActions.ts"
Cohesion: 0.24
Nodes (16): APPS, importDetected(), importFiles(), importFound(), importSeratoFolder(), importWithHome(), pickSeratoFolder(), refreshWithFile() (+8 more)

### Community 173 - "glue-audio/tests/golden.rs"
Cohesion: 0.24
Nodes (9): b64(), check(), check_files(), golden(), lossless_fixtures_match_javascript(), result_json(), root(), same() (+1 more)

### Community 174 - "repair.rs"
Cohesion: 0.35
Nodes (11): Counts, fold_computer(), FoldInput, FoldResult, get(), has_stand_in(), needs_fold(), obj() (+3 more)

### Community 175 - "perf.spec.ts"
Cohesion: 0.12
Nodes (13): afterPaint(), BUDGET, errors, Long, note(), over, results, SIZES (+5 more)

### Community 176 - "compilerOptions"
Cohesion: 0.12
Nodes (16): @tsconfig/svelte/tsconfig.json, compilerOptions, isolatedModules, lib, module, moduleResolution, noFallthroughCasesInSwitch, noImplicitOverride (+8 more)

### Community 177 - "stems"
Cohesion: 0.21
Nodes (3): fmtEta(), encodeWav(), stems

### Community 179 - "idbSet()"
Cohesion: 0.15
Nodes (15): idbDel(), idbGet(), idbSet(), tx(), addLibraryPlace(), browserHome(), forgetFolder(), forgetHome() (+7 more)

### Community 180 - "Stem separation"
Cohesion: 0.14
Nodes (10): CLAUDE.md: project instructions, GLUE README, Speklone, HT-Demucs stem separation on WebGPU, ADR 0001: Record architecture decisions, ADR 0003: Client-side stems on WebGPU, ADR 0004: Float64 model patch, ADR 0005: Model from Hugging Face (+2 more)

### Community 182 - "js"
Cohesion: 0.19
Nodes (6): Fft, grid(), math_within_2_ulp_of_v8(), outputs(), v8(), where_it_differs()

### Community 183 - "djinfo.rs"
Cohesion: 0.33
Nodes (10): app_info(), app_value(), each_sides_change_goes_to_the_other(), FIELDS, glue_and_engine_djs_forms(), glue_info(), info(), InfoMerge (+2 more)

### Community 184 - "ADR 0193: Download songs as files: ranges from GLUE Home, a zip written as it goes"
Cohesion: 0.12
Nodes (13): ADR-0193, ADR-0193, ADR-0193, Downloading songs (help article), ADR-0193, ADR-0193, ADR 0193: Download songs as files: ranges from GLUE Home, a zip written as it goes, Byte sources: file, incoming folder over local link, remote 4 MB ranges (+5 more)

### Community 185 - "src-tauri/src/tags.rs"
Cohesion: 0.20
Nodes (5): apply(), FIELDS, fixture(), write_tags(), writes_into_every_format_and_reads_back()

### Community 186 - "dj.rs"
Cohesion: 0.13
Nodes (4): APPS, AT_MOST, DjWatch, MAX_DIRS

### Community 187 - "import_golden.rs"
Cohesion: 0.17
Nodes (5): set_source_sync(), iso(), libraries_come_in_as_on_the_website(), root(), run()

### Community 188 - "types"
Cohesion: 0.18
Nodes (4): CLUES, patterns(), scan_clues(), EXTINF

### Community 189 - "String"
Cohesion: 0.30
Nodes (4): best_lists(), Engine<H>, groups_path(), saved_path()

### Community 190 - "rtc-probe.mjs"
Cohesion: 0.13
Nodes (7): child, dir, out, results, song, waiting, FIXTURES

### Community 191 - "library/bpm.ts"
Cohesion: 0.16
Nodes (13): bpmInUse(), BpmRange, fmtBpm(), foldInto(), shownBpm(), ADR-0052, bpmOf(), bpmShown() (+5 more)

### Community 192 - "zip.ts"
Cohesion: 0.23
Nodes (12): crc32(), CRC_TABLE, createZip(), dec, dosTime(), enc, pipe(), readZip() (+4 more)

### Community 193 - "ZipWriter"
Cohesion: 0.24
Nodes (3): u64(), ZipSink, ZipWriter

### Community 194 - "columns"
Cohesion: 0.19
Nodes (4): columns, Discogs' API: what GLUE uses, as probed, Not seen yet [UNVERIFIED], Seen in the answers (2026-10-31)

### Community 195 - "HomeSocket"
Cohesion: 0.16
Nodes (5): HomeSocket, ADR-0139, Waiting, FakeSocket, ADR-0139

### Community 196 - "cover.ts"
Cohesion: 0.18
Nodes (13): Cover, COVER_LARGE, COVER_SMALL, coverFromImage(), coverOf(), jpeg(), Reader, square() (+5 more)

### Community 197 - "ADR 0128: Build the code map on GitHub for every push, and use it by fixed rules"
Cohesion: 0.15
Nodes (12): Code map: graphify knowledge graph, ADR-0127, Workflow: Code map (graphify knowledge graph), graphify: knowledge graph extraction tool, Code map coverage and graphifyignore, ADR 0127: Give coding sessions a map of the code: a graphify knowledge graph, built per computer, graphify developer tool, Code map known gaps (+4 more)

### Community 198 - "summary.rs"
Cohesion: 0.20
Nodes (7): ANALYSIS_VERSION, ENGINE, failed(), iso(), now_iso(), summarize(), VERDICT_VERSION

### Community 199 - "IceCache"
Cohesion: 0.26
Nodes (3): IceCache, kept_until_the_relay_ends_or_ten_minutes(), public_servers()

### Community 200 - "traktor.rs"
Cohesion: 0.25
Nodes (6): get(), HEAD, MAJOR, nml_path(), parse_traktor_nml(), traktor_key()

### Community 201 - "stems.worker.ts"
Cohesion: 0.22
Nodes (13): ADR-0003, STEM_N, STEM_OVERLAP, cancelled, check(), download(), gpuUsable(), init() (+5 more)

### Community 203 - "ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address"
Cohesion: 0.14
Nodes (13): ADR-0051, ADR-0051, ADR-0051, ADR-0051, ADR-0051, ADR-0051, ADR-0051, ADR-0051 (+5 more)

### Community 204 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @crabnebula/tauri-plugin-drag, mediabunny, sql.js, @tauri-apps/api, @tauri-apps/plugin-autostart, @tauri-apps/plugin-deep-link, @tauri-apps/plugin-dialog (+6 more)

### Community 208 - "details.ts"
Cohesion: 0.31
Nodes (12): decodeDetails(), DETAILS_VERSION, encodeDetails(), hasDetails(), loadDetails(), MAX_ROWS, paths(), pipe() (+4 more)

### Community 209 - "glue-audio.rs"
Cohesion: 0.22
Nodes (5): AUDIO, b64(), main(), one(), songs()

### Community 211 - "phone-ui.spec.ts"
Cohesion: 0.17
Nodes (11): ADR-0078, ADR-0078, ADR-0078, Device, fixture(), start(), test, ADR-0078 (+3 more)

### Community 212 - "activity.rs"
Cohesion: 0.26
Nodes (6): Act, counts_calls_time_and_bytes(), note(), snapshot(), start(), STARTED

### Community 213 - "bundle"
Cohesion: 0.15
Nodes (13): bundle, active, createUpdaterArtifacts, icon, longDescription, macOS, shortDescription, targets (+5 more)

### Community 214 - "updates.ts"
Cohesion: 0.15
Nodes (7): Dock, GLUE drag dock page, ADR-0045, @crabnebula/tauri-plugin-drag, @tauri-apps/api, @tauri-apps/plugin-process, @tauri-apps/plugin-updater

### Community 215 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, svelte, svelte-check, @sveltejs/vite-plugin-svelte, @tauri-apps/cli, @tsconfig/svelte, @types/node (+5 more)

### Community 216 - "stems.svelte.ts"
Cohesion: 0.26
Nodes (11): LEGACY_MODEL_CACHE, MODEL_CACHE, MODEL_FILE, MODEL_SIZE, MODEL_URL, ORT_URL, STEM_SR, STEM_STRIDE (+3 more)

### Community 217 - "fingerprint.rs"
Cohesion: 0.18
Nodes (9): BANDS, F_HI, F_LO, fingerprint(), FP_HOP, FP_N, FP_RATE, FP_SECONDS (+1 more)

### Community 218 - "super"
Cohesion: 0.20
Nodes (6): Admit, Full, Ok, Refused, max_of(), session_key()

### Community 220 - "tauri.conf.json"
Cohesion: 0.17
Nodes (11): app, security, windows, build, devUrl, frontendDist, identifier, productName (+3 more)

### Community 221 - "Right-click menus (feature)"
Cohesion: 0.17
Nodes (8): Help: Duplicates and the best copy, Library and its views help, ADR 0069: Content beyond a wall that follows the music isn't an encoder's cut; specks far under it a, Right-click menus (feature), Duplicates feature, Quality forensics feature, Quality tiers and filters feature, Stats feature

### Community 224 - "cloud/package.json"
Cohesion: 0.18
Nodes (10): description, devDependencies, wrangler, name, private, scripts, deploy, dev (+2 more)

### Community 225 - "confirm()"
Cohesion: 0.38
Nodes (8): ber(), confirm(), find_matches_for(), find_same_recordings(), Fingerprint, group_matches(), Match, vote()

### Community 226 - "ADR 0125: A song dropped onto the page is placed by GLUE Home; the tab analyses only what just it ca"
Cohesion: 0.18
Nodes (10): ADR-0125, ADR-0125, ADR-0125, ADR-0125, ADR-0125, ADR-0125, 0125. A song dropped onto the page is placed by GLUE Home; the tab analyses only what just it can read, Consequences (+2 more)

### Community 227 - "capture.ts"
Cohesion: 0.27
Nodes (10): clip(), cursor(), DEMO, ff(), OUT, profile, shot(), ADR-0063 (+2 more)

### Community 228 - "serato.ts"
Cohesion: 0.36
Nodes (10): buildSeratoLibrary(), get(), parseSerato(), parseSeratoCrate(), parseSeratoDatabase(), seratoPath(), SField, str() (+2 more)

### Community 229 - "engine.svelte.ts"
Cohesion: 0.20
Nodes (10): DiscogsFile, Clash, cacheGate, Change, DiscogsState, DjClash, EngineState, homeSocket (+2 more)

### Community 230 - ".start()"
Cohesion: 0.27
Nodes (5): RateMeter, diskTarget(), notice(), SaveHandle, Target

### Community 232 - "ADR 0177: Opening the library or a collection shows its progress, and waits less"
Cohesion: 0.18
Nodes (10): ADR-0177, ADR-0177, ADR-0177, ADR-0177, ADR-0177, 0177. Opening the library or a collection shows its progress, and waits less, Alternatives considered, Consequences (+2 more)

### Community 233 - "lossy.rs"
Cohesion: 0.31
Nodes (6): a_damaged_mp3_frame_keeps_the_time(), a_deadline_stops_the_analysis(), alac_is_the_same_as_flac(), fixture(), lossy_files_decode(), run()

### Community 234 - "lossy_golden.rs"
Cohesion: 0.38
Nodes (6): bytes_b64(), FILES, json(), lossy_files_match_the_browser(), root(), same()

### Community 235 - "ADR 0104: GLUE Home is the library's engine; the website on its computer is its screen"
Cohesion: 0.20
Nodes (9): ADR-0104, ADR-0104, ADR-0104, ADR-0104, ADR-0104, ADR-0104, ADR-0104, ADR-0104 (+1 more)

### Community 236 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, check, dev, home:dev, home:preview, home:ui, preview (+2 more)

### Community 237 - "download.test.ts"
Cohesion: 0.24
Nodes (6): fmtLeft(), secondsLeft(), Songs left out, listed with the reason, read(), Download panel: progress, waiting state, cancel, report, Speed and time left over the last 20 s

### Community 238 - "Plan: shared collection"
Cohesion: 0.20
Nodes (8): ADR-0092, ADR-0092, 0092. The first question: how GLUE is used on this device, Consequences, Context, ADR 0092: The first question: how GLUE is used on this device, Plan: shared collection, GLUE Home as the computer's backend

### Community 240 - "patch.test.ts"
Cohesion: 0.44
Nodes (8): cat(), child(), doubleTensor(), lenField(), model(), readFields(), varint(), vfield()

### Community 241 - "covers_golden.rs"
Cohesion: 0.33
Nodes (4): golden(), names_as_the_website_judges_them(), the_same_keys_kept_files_and_addresses(), the_same_names_and_picks()

### Community 242 - "control.rs"
Cohesion: 0.25
Nodes (3): check(), set_deadline(), TOO_LONG

### Community 244 - "shared.spec.ts"
Cohesion: 0.25
Nodes (7): browserFor(), D, fixture(), MUSIC, seed(), ADR-0094, ADR-0106

### Community 245 - "GLUE Home build workflow (home.yml)"
Cohesion: 0.22
Nodes (5): latest.json: the updater's manifest, Publish job: the release and the updater manifest, Shared Rust build cache across the Rust workspaces, Update files signed with a secret key, GLUE Home build workflow (home.yml)

### Community 246 - "updater"
Cohesion: 0.22
Nodes (9): desktop, schemes, plugins, deep-link, updater, endpoints, pubkey, windows (+1 more)

### Community 247 - "ui/engine.ts"
Cohesion: 0.31
Nodes (7): HomeConfig, describe(), LibraryInfo, Speed, ADR-0136, collectionKey(), shared()

### Community 248 - "relink"
Cohesion: 0.22
Nodes (4): relink, said(), songish(), found

### Community 249 - "platform/homeDisk.ts"
Cohesion: 0.22
Nodes (7): Entry, HomeDown, HomeRoots, join(), ADR-0051, ADR-0135, ADR-0141

### Community 250 - "glue-interop/tests/golden.rs"
Cohesion: 0.36
Nodes (3): root(), same(), the_libraries_read_as_the_website_reads_them()

### Community 251 - "Arriving"
Cohesion: 0.25
Nodes (3): Arriving, ReadSeek, T

### Community 253 - "patchFloat64()"
Cohesion: 0.39
Nodes (6): ADR-0004, patchFloat64(), fields(), message(), tensor(), varint()

### Community 254 - "ADR 0115: Any browser on GLUE Home's computer takes its link from GLUE Home itself"
Cohesion: 0.25
Nodes (7): ADR-0115, ADR-0115, ADR-0115, 0115. Any browser on GLUE Home's computer takes its link from GLUE Home itself, Consequences, Context, ADR 0115: Any browser on GLUE Home's computer takes its link from GLUE Home itself

### Community 255 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, allowImportingTsExtensions, noEmit, types, extends, include

### Community 256 - "0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it"
Cohesion: 0.25
Nodes (7): ADR-0142, ADR-0142, 0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it, Alternatives considered, Consequences, Context, ADR 0142: A row on screen always gets what it asked for: held by its song's id, and asked again when

### Community 257 - "ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust"
Cohesion: 0.25
Nodes (8): ADR-0167, ADR-0167, ADR-0167, ADR-0167, ADR-0167, ADR-0167, ADR-0167, ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust

### Community 258 - "ADR 0143: A sync takes in what it wrote, even when it fails; this computer's GLUE Home is looked for"
Cohesion: 0.25
Nodes (7): ADR-0143, ADR-0143, 0143. A sync takes in what it wrote, even when it fails; this computer's GLUE Home is looked for only with a reason, Alternatives considered, Consequences, Context, ADR 0143: A sync takes in what it wrote, even when it fails; this computer's GLUE Home is looked for

### Community 259 - "EditInfo.svelte"
Cohesion: 0.32
Nodes (7): changed, close(), focus(), lists, save(), suggest(), values

### Community 260 - "dupeGroups.golden.test.ts"
Cohesion: 0.43
Nodes (7): graded(), input(), lossless(), lossy(), m(), OUT, song()

### Community 261 - "homeBundle.test.ts"
Cohesion: 0.29
Nodes (7): FORBIDDEN, FORBIDDEN_PACKAGES, reach(), resolveImport(), ROOT, ADR-0147, ADR-0160

### Community 262 - "Vision"
Cohesion: 0.25
Nodes (6): ADR 0010: Import/export before write-back, ADR 0011 (live export file), Vision, Speklone, Browser capabilities research, File System Access API, Chromium only

### Community 263 - "ADR 0129: Refresh the code map's docs in every session that changes them, without the skill; browse "
Cohesion: 0.29
Nodes (5): ADR-0129, Interactive graph view on website, .graphifyignore: vault/log/ exclusion, scripts/graph-extract.md, ADR 0129: Refresh the code map's docs in every session that changes them, without the skill; browse 

### Community 264 - "turn.ts"
Cohesion: 0.33
Nodes (6): Ice, ADR-0037, TURN_TTL, TurnEnv, turnServers(), usable()

### Community 267 - "0098. Duplicates across computers: each computer publishes its own matches"
Cohesion: 0.29
Nodes (6): ADR-0098, 0098. Duplicates across computers: each computer publishes its own matches, Alternatives considered, Consequences, Context, ADR 0098: Duplicates across computers: each computer publishes its own matches

### Community 268 - "0107. The shared sync looks only at the files that changed, and keeps its agreed copies file by file"
Cohesion: 0.29
Nodes (6): ADR-0107, 0107. The shared sync looks only at the files that changed, and keeps its agreed copies file by file, Alternatives considered, Consequences, Context, ADR 0107: The shared sync looks only at the files that changed, and keeps its agreed copies file by 

### Community 269 - "counts.ts"
Cohesion: 0.38
Nodes (5): Counts, countsOf(), holdsMusic(), sendCounts(), ADR-0112

### Community 274 - "ADR 0077: A device without a library of its own opens the account's library from GLUE Cloud, and pla"
Cohesion: 0.33
Nodes (6): ADR-0077, ADR-0077, ADR-0077, ADR-0077, ADR-0077, ADR 0077: A device without a library of its own opens the account's library from GLUE Cloud, and pla

### Community 275 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 276 - "glue-engine"
Cohesion: 0.53
Nodes (6): glue-audio, glue-engine, glue-home, glue-interop, glue-rtc, glue-store

### Community 277 - "0130. The same file on two computers is one song, with a copy on each"
Cohesion: 0.33
Nodes (5): fileName(), 0130. The same file on two computers is one song, with a copy on each, Alternatives considered, Consequences, Context

### Community 280 - "0140. A song played pauses the analysis's reads, not only its new songs"
Cohesion: 0.33
Nodes (5): 0140. A song played pauses the analysis's reads, not only its new songs, Alternatives considered, Consequences, Context, ADR 0140: A song played pauses the analysis's reads, not only its new songs

### Community 281 - "Help: Devices, accounts and profiles"
Cohesion: 0.60
Nodes (5): Accounts (optional), Clash resolution box, GLUE Cloud, Profiles (artist aliases), Help: Devices, accounts and profiles

### Community 282 - "ADR 0163: One computer never clashes with itself"
Cohesion: 0.40
Nodes (3): A computer never clashes with itself, GLUE Home shows clashes in the tab, Tab sends only what it changed

### Community 283 - "0114. The account's profiles are every device's; each device picks its own"
Cohesion: 0.40
Nodes (5): ADR-0114, 0114. The account's profiles are every device's; each device picks its own, Consequences, Context, ADR 0114: The account's profiles are every device's; each device picks its own

### Community 284 - "Song Page Feature"
Cohesion: 0.40
Nodes (5): Prepare Tab: Beat Grid and Cues, Song Verdict: Quality Assessment, Spectrogram Visualization, Song Page Feature, Stems Separation

### Community 285 - "Help: Getting started"
Cohesion: 0.40
Nodes (5): Tour: welcome, Help: Getting started, GLUE folder, GLUE Home (optional companion app), GLUE Home help article

### Community 286 - "ADR 0049: Folders are playlists too (as in Engine DJ)"
Cohesion: 0.40
Nodes (4): ADR-0049, ADR-0049, ADR-0049, Exports feature

### Community 287 - "0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer"
Cohesion: 0.40
Nodes (4): 0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer, Alternatives considered, Consequences, Context

### Community 288 - "0128. Build the code map on GitHub for every push, and use it by fixed rules"
Cohesion: 0.40
Nodes (4): 0128. Build the code map on GitHub for every push, and use it by fixed rules, Alternatives considered, Consequences, Context

### Community 289 - "0129. Refresh the code map's docs in every session that changes them, without the skill; browse it on the site"
Cohesion: 0.40
Nodes (4): 0129. Refresh the code map's docs in every session that changes them, without the skill; browse it on the site, Alternatives considered, Consequences, Context

### Community 290 - "0135. Analysis around network folders: their songs take turns, GLUE Home reads tags in batches, one "left" count"
Cohesion: 0.40
Nodes (4): 0135. Analysis around network folders: their songs take turns, GLUE Home reads tags in batches, one "left" count, Alternatives considered, Consequences, Context

### Community 291 - "0136. Analysis limits are the user's to set, with the speed shown and a suggestion from it"
Cohesion: 0.40
Nodes (4): 0136. Analysis limits are the user's to set, with the speed shown and a suggestion from it, Alternatives considered, Consequences, Context

### Community 292 - "0137. This computer's browser is never a remote session, and isn't counted; the direct link isn't dropped on one slow answer"
Cohesion: 0.40
Nodes (4): 0137. This computer's browser is never a remote session, and isn't counted; the direct link isn't dropped on one slow answer, Alternatives considered, Consequences, Context

### Community 293 - "0141. Songs played get their own port, and a file read looks up only its own folder"
Cohesion: 0.40
Nodes (4): 0141. Songs played get their own port, and a file read looks up only its own folder, Alternatives considered, Consequences, Context

### Community 294 - "0144. FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so"
Cohesion: 0.40
Nodes (4): 0144. FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so, Alternatives considered, Consequences, Context

### Community 295 - "0145. Judge "the same name" one way, in `core/library/names.ts`"
Cohesion: 0.40
Nodes (4): 0145. Judge "the same name" one way, in `core/library/names.ts`, Alternatives considered, Consequences, Context

### Community 296 - "0151. GLUE opens in GLUE Home's own window, showing the live site"
Cohesion: 0.40
Nodes (4): 0151. GLUE opens in GLUE Home's own window, showing the live site, Alternatives considered, Consequences, Context

### Community 297 - "0153. GLUE Home's library engine in Rust, tested end to end against the real one"
Cohesion: 0.40
Nodes (4): 0153. GLUE Home's library engine in Rust, tested end to end against the real one, Alternatives considered, Consequences, Context

### Community 298 - "0154. The analysis queue in GLUE Home's engine, in Rust"
Cohesion: 0.40
Nodes (4): 0154. The analysis queue in GLUE Home's engine, in Rust, Alternatives considered, Consequences, Context

### Community 299 - "0155. GLUE Home syncs the shared collections in Rust, held to the website's sync"
Cohesion: 0.40
Nodes (4): 0155. GLUE Home syncs the shared collections in Rust, held to the website's sync, Alternatives considered, Consequences, Context

### Community 300 - "0159-glue-homes-first-run-and-its-window-signed-in.md"
Cohesion: 0.40
Nodes (4): 0159. GLUE Home's first run, a GLUE folder always offered, and its window signed in by GLUE Home, Alternatives considered, Consequences, Start page

### Community 301 - "0160. GLUE Home's service in its engine: the hidden page removed"
Cohesion: 0.40
Nodes (4): 0160. GLUE Home's service in its engine: the hidden page removed, Alternatives considered, Consequences, Context

### Community 302 - "0164. GLUE Home matches the duplicates' fingerprints"
Cohesion: 0.40
Nodes (4): 0164. GLUE Home matches the duplicates' fingerprints, Alternatives considered, Consequences, Context

### Community 303 - "0175. Back from the background, the room and the sessions are made again at once"
Cohesion: 0.40
Nodes (4): 0175. Back from the background, the room and the sessions are made again at once, Alternatives considered, Consequences, Context

### Community 304 - "0189. Discogs playlists: vinyl and digital together, kept under Discogs"
Cohesion: 0.40
Nodes (4): 0189. Discogs playlists: vinyl and digital together, kept under Discogs, Alternatives considered, Consequences, Context

### Community 305 - "0193. Download songs as files: ranges from GLUE Home, a zip written as it goes"
Cohesion: 0.40
Nodes (4): 0193. Download songs as files: ranges from GLUE Home, a zip written as it goes, Alternatives considered, Consequences, Context

### Community 306 - "Downloads"
Cohesion: 0.40
Nodes (4): Downloads, Now, Open, What it does

### Community 307 - "The details' spectrogram: what it costs, and what would shrink it"
Cohesion: 0.40
Nodes (4): Encodings tried (average per song), The details' spectrogram: what it costs, and what would shrink it, The other way, not taken, What's stored

### Community 311 - "Tags feature"
Cohesion: 0.50
Nodes (3): ADR-0029, Automatic playlists feature, Tags feature

### Community 312 - "Code map view step in deploy"
Cohesion: 0.50
Nodes (4): Code map view step in deploy, Latest threejs-visualisers step, GitHub Pages deployment, Test and deploy workflow

### Community 313 - "help/discogs.md"
Cohesion: 0.50
Nodes (3): Connecting Discogs, Covers, Your records

### Community 314 - "help/downloads.md"
Cohesion: 0.50
Nodes (3): For a USB drive, What to download, While it downloads

### Community 316 - "0074. Events: a calendar in GLUE, each event with a folder of playlists, reminders in GLUE and from GLUE Home"
Cohesion: 0.50
Nodes (4): 0074. Events: a calendar in GLUE, each event with a folder of playlists, reminders in GLUE and from GLUE Home, Alternatives considered, Consequences, Context

### Community 317 - "0168. DJ apps synced both ways: playlists, cues, loops and beat grids"
Cohesion: 0.50
Nodes (4): 0168. DJ apps synced both ways: playlists, cues, loops and beat grids, Alternatives considered, Consequences, Context

### Community 318 - "0169. The main DJ library"
Cohesion: 0.50
Nodes (4): 0169. The main DJ library, Alternatives considered, Consequences, Context

### Community 319 - "0170. Engine DJ kept in step both ways: cues, loops and the beat grid"
Cohesion: 0.50
Nodes (4): 0170. Engine DJ kept in step both ways: cues, loops and the beat grid, Alternatives considered, Consequences, Context

### Community 320 - "0186. Discogs covers, with the user's token"
Cohesion: 0.50
Nodes (4): 0186. Discogs covers, with the user's token, Alternatives considered, Consequences, Context

### Community 321 - "0187. The Discogs collection: read by GLUE Home, kept in the profile, matched on the page"
Cohesion: 0.50
Nodes (4): 0187. The Discogs collection: read by GLUE Home, kept in the profile, matched on the page, Alternatives considered, Consequences, Context

### Community 322 - "Help: Adding music"
Cohesion: 0.67
Nodes (3): tour: adding-music, Help: Adding music, TO BE SORTED: incoming folder for sent songs

### Community 323 - "0077. A device without a library of its own opens the account's library from GLUE Cloud, and plays it"
Cohesion: 0.67
Nodes (3): 0077. A device without a library of its own opens the account's library from GLUE Cloud, and plays it, Consequences, Context

## Ambiguous Edges - Review These
- `Drive copy must match the Collection (hypothesis)` → `Engine DJ locked every playlist after the folder repair`  [AMBIGUOUS]
  vault/research/engine-dj-write-back.md · relation: rationale_for

## Knowledge Gaps
- **1198 isolated node(s):** `Conn`, `MockHome`, `StreamCtrl`, `Answer`, `RangeReq` (+1193 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2149 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **102 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Drive copy must match the Collection (hypothesis)` and `Engine DJ locked every playlist after the folder repair`?**
  _Edge tagged AMBIGUOUS (relation: rationale_for) - confidence is low._
- **Why does `Shared sync: snapshot and log` connect `GLUE Cloud: accounts, GLUE Home and devices` to `shared/engine.ts`, `glue-engine/src/sync.rs`, `serde_json`, `shared.svelte.ts`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Why does `GLUE: how it works now` connect `GLUE Cloud: accounts, GLUE Home and devices` to `ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust`, `remoteFiles.svelte.ts`, `Vault README (sections, conventions, feature index)`, `Playlists, folders & smart lists`, `folders.ts`, `merge.ts`, `ref_node_url`, `homemode.spec.ts`, `CollectionStore`, `0114. The account's profiles are every device's; each device picks its own`, `library/analysis.ts`, `library.spec.ts`, `Feature: Library & scanner`, `Background analysis`, `ADR 0174: Another computer's songs stream as they arrive, and their start says where its time went`, `discogsLists.ts`, `covers.golden.test.ts`, `dupes.svelte.ts`, `guide.test.ts`, `ADR 0187: The Discogs collection: read by GLUE Home, kept in the profile, matched on the page`, `fingerprint.ts`, `ADR 0170: Engine DJ kept in step both ways: cues, loops and the beat grid`, `relink.ts`, `sharedCloud.ts`, `ADR 0162: With GLUE Home running, the page is only its screen: it starts none of the library's work`, `dupes`, `ADR 0125: A song dropped onto the page is placed by GLUE Home; the tab analyses only what just it ca`, `ADR 0104: GLUE Home is the library's engine; the website on its computer is its screen`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Why does `ADR 0187: The Discogs collection: read by GLUE Home, kept in the profile, matched on the page` connect `ADR 0187: The Discogs collection: read by GLUE Home, kept in the profile, matched on the page` to `0187. The Discogs collection: read by GLUE Home, kept in the profile, matched on the page`, `src/discogs.rs`, `ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address`, `engineClient`, `discogsLists.ts`, `CollectionStore`, `covers.golden.test.ts`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `GLUE Cloud: accounts, GLUE Home and devices` (e.g. with `The GLUE folder (JSON files, no database)` and `Profiles are artist aliases`) actually correct?**
  _`GLUE Cloud: accounts, GLUE Home and devices` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Conn`, `MockHome`, `StreamCtrl` to the rest of the system?**
  _1198 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `library.svelte.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.02790880503144654 - nodes in this community are weakly interconnected._