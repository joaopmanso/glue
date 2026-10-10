# Graph Report - glue  (2026-10-10)

## Corpus Check
- 891 files · ~765,207 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 7656 nodes · 19439 edges · 312 communities (244 shown, 68 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 753 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- glue-engine/src/sync.rs
- queue.rs
- enginedb.rs
- merge.ts
- app.svelte.ts
- trackMenu.ts
- Host
- tests/engine.rs
- library.svelte.ts
- collection.ts
- glue-engine/src/dupes.rs
- glue-interop/src/sync.rs
- App.svelte
- Engine<H>
- account
- dsd.rs
- App
- GLUE vault index and structure
- ADR 0094: One shared collection in GLUE Cloud, the same on every device
- view.svelte.ts
- interop/types.ts
- remoteFiles.svelte.ts
- fsx.ts
- importActions.ts
- auto.svelte.ts
- files.rs
- stems.svelte.ts
- store/types.ts
- Welcome.svelte
- Store<D>
- glue-interop/src/types.rs
- events.svelte.ts
- Player
- glue-engine/src/tags.rs
- covers.rs
- GLUE Cloud: accounts, GLUE Home and devices
- engine.svelte.ts
- nowPlaying.svelte.ts
- ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address
- ADR 0071: Song info is edited in GLUE and written into the music files by GLUE Home
- api.ts
- read_json()
- vitest
- platform/index.ts
- phone.spec.ts
- parse.ts
- enginePerf.ts
- H
- Store
- dupes.svelte.ts
- rtc.rs
- Library
- tests/room.rs
- analyze.ts
- handle()
- .serve()
- covers.svelte.ts
- protocol.rs
- Engine<H>
- Disk
- shared/engine.ts
- ws.rs
- merge.rs
- analysis.worker.ts
- Track
- store.golden.test.ts
- dj.rs
- verdict.rs
- HomeStore
- parse_engine_db()
- bundle
- ref_node_fs
- .answer()
- CollectionStore
- duplicates.ts
- ADR 0108: One id per computer: GLUE Home learns it, only the computer's GLUE folder writes its parts
- analyze.rs
- text()
- truthy()
- parse.rs
- ADR 0175: Back from the background, the room and the sessions are made again at once
- disk.rs
- ADR 0030: DJ libraries are detected in folders the user has allowed
- remoteFiles
- users
- sharedCloud.ts
- covers.golden.test.ts
- djWatch.svelte.ts
- GLUE: how it works now
- .song()
- project.rs
- ADR 0179: Engine DJ's own playlists, and its songs' info, edited from GLUE
- local.rs
- admin.ts
- fingerprint.rs
- home.spec.ts
- ADR 0052: A Prepare tab: waveform, beat grid, metronome and the user's corrections
- relink.ts
- MemDir
- serde_json
- Pv
- types
- ref_node_url
- transfer.ts
- ADR 0060: Read, parse and decode audio in the worker (mediabunny + WebCodecs)
- make-audio.ts
- interop.golden.test.ts
- Socket
- .track_path()
- verify.rs
- Quality forensics
- ADR 0133: A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what
- analyse()
- ADR 0046: GLUE Home keeps and shares the analyses; TO BE SORTED lists its incoming folder
- library.rs
- truthy()
- rtc-probe.mjs
- DuplicatesView.svelte
- guide
- ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put
- shared
- signal.ts
- Engine
- js.rs
- parse_serato_database()
- ADR 0147: GLUE Home analyses natively, in Rust
- package.json
- themes.svelte.ts
- verdict.ts
- homedisk.test.ts
- src/room.rs
- merge3.rs
- fakeHome.ts
- ADR 0151: GLUE opens in GLUE Home's own window, showing the live site
- golden.test.ts
- glue-rtc/src/lib.rs
- xml.rs
- ADR 0165: GLUE Home makes the duplicate groups and points playlists at the best copies
- platform/homeDisk.ts
- AppHandle
- window.rs
- player
- R
- js_keys()
- bridge.ts
- homeLink.ts
- lib/analysis.ts
- dupes
- RelinkView.svelte
- decode.rs
- src-tauri/src/dupes.rs
- main.rs
- fingerprints.ts
- backup.rs
- graph_docs.py
- flac.ts
- HomeDir
- ADR 0135: Analysis around network folders: their songs take turns, GLUE Home reads tags in batches, 
- smoke-local.ts
- ADR 0146: Keep the library's methods in parts by concern, behind the same `lib`
- graph.mjs
- prepare
- lib/perf.ts
- PhoneSongs.svelte
- ADR 0159: GLUE Home's first run, a GLUE folder always offered, and its window signed in by GLUE Home
- glue-audio/tests/golden.rs
- repair.rs
- 0128. Build the code map on GitHub for every push, and use it by fixed rules
- FakeHome
- compilerOptions
- idbSet()
- sync.golden.test.ts
- GLUE: Global Library Unified Exporter
- djinfo.rs
- homemode.spec.ts
- perf.spec.ts
- capture.ts
- shared.svelte.ts
- PlayerPanel.svelte
- lib/ice.ts
- cues.ts
- merge3.ts
- thumbs
- summary.rs
- IceCache
- library.spec.ts
- answer()
- dependencies
- prepare.test.ts
- HomeDisk
- waterfall.ts
- ADR 0154: The analysis queue in GLUE Home's engine, in Rust
- src/profiles.ts
- glue-audio.rs
- parse_id3v2()
- test.rs
- .computers_here()
- incoming.rs
- ADR 0153: GLUE Home's library engine in Rust, tested end to end against the real one
- ADR 0067: One context menu for the library page: right-click (or ⋯) on anything there
- SharedCloudServer
- activity.rs
- ui/engine.ts
- updates.ts
- ADR 0177: Opening the library or a collection shows its progress, and waits less
- devDependencies
- parity.test.ts
- incoming
- import_golden.rs
- super
- fs
- columns
- Waterfall3D
- cloud/package.json
- json
- ADR 0182: Engine DJ's playlists written as Engine DJ writes them: its Collection, then each drive's 
- ADR 0169: The main DJ library
- lossy.rs
- 0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer
- lossy_golden.rs
- ADR 0136: Analysis limits are the user's to set, with the speed shown and a suggestion from it
- scripts
- metronome
- Live
- HomeFile
- control.rs
- ADR 0106: Keep the shared collection in GLUE Cloud as a snapshot and a log of changes
- clues.rs
- ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust
- shared.spec.ts
- guide.spec.ts
- ADR 0178: A DJ app's playlists stay in its DJ collection; GLUE's own go to its "GLUE" folder
- library/bpm.ts
- FakeSocket
- glue-interop/tests/golden.rs
- Handler<H>
- Help: Getting started
- allowed()
- tsconfig.test.json
- prepare.svelte.ts
- ADR 0100: One row per song, its best copy; a computer removes only its own copies
- 0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it
- EditInfo.svelte
- dupeGroups.golden.test.ts
- Vision
- .join()
- sidebar
- tabs
- SharedCloud
- turn.ts
- State
- default.json
- glue-engine
- Help: The library and its views
- Pri
- free_glue_folder()
- .play()
- 0138. What the user asks for goes first: background requests gated, playing ahead of the analysis, songs read whole
- 0145. Judge "the same name" one way, in `core/library/names.ts`
- 0164. GLUE Home matches the duplicates' fingerprints
- sorted()
- StreamReply
- Prepare tab
- anywhere
- Help: Devices, accounts and profiles
- Help: Adding music
- Tour: analyze
- Tour: calendar
- Help: gluey
- Help: themes
- Deploy GLUE Cloud workflow
- Follow threejs-visualisers workflow
- CollectionStore implementation in TypeScript
- Unified DJ library import
- E2E testing with Playwright
- GLUE Home build workflow
- GLUE Home release notes (installers, unsigned)
- GLUE Home settings page
- Local link: 127.0.0.1:47400-47409 for GLUE Home access
- Tour: DJ libraries
- Tour: Playlists
- Help: DJ libraries
- Help: Playlists, tags and the builder
- Quality help article
- Pool: background analysis worker orchestration
- Local home platform
- GLUE Home Tauri configuration and setup
- Interop test notes
- Library class
- Quality verdicts: forensic analysis of audio content
- WebRTC streaming: songs sent to other devices via signaling

## God Nodes (most connected - your core abstractions)
1. `GLUE vault index and structure` - 157 edges
2. `Track` - 115 edges
3. `vitest` - 64 edges
4. `text()` - 64 edges
5. `CollectionStore` - 61 edges
6. `handle()` - 54 edges
7. `account` - 47 edges
8. `writePref()` - 44 edges
9. `GLUE Cloud: accounts, GLUE Home and devices` - 43 edges
10. `Product roadmap` - 40 edges

## Surprising Connections (you probably didn't know these)
- `Alternatives considered` --references--> `main()`  [INFERRED]
  vault/adr/0128-code-map-built-on-github.md → src/lib/bpm.ts
- `Consequences` --references--> `main()`  [INFERRED]
  vault/adr/0174-songs-stream-as-they-arrive.md → src/lib/bpm.ts
- `Context` --references--> `fillInfo()`  [INFERRED]
  vault/adr/0135-analysis-around-network-folders-and-tags-by-glue-home.md → src/core/library/tags.ts
- `Consequences` --references--> `absorbTracks()`  [INFERRED]
  vault/adr/0152-the-library-store-in-rust.md → src/store/merge.ts
- `Consequences` --references--> `applyImport()`  [INFERRED]
  vault/adr/0167-dj-libraries-in-glue-home.md → src/store/merge.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Stored analysis evolution** — vault_adr_0019_background_analysis_decoding_decision, vault_adr_0023_store_track_page_analysis_decision, vault_adr_0024_background_stores_full_analysis_decision [EXTRACTED 0.75]
- **GLUE Home engine and dropped files decisions** — vault_adr_0122_stop_stops_everything_dropped_folders_found_decision, vault_adr_0123_music_folders_that_come_and_go_decision, vault_adr_0125_dropped_songs_placed_by_glue_home_decision [EXTRACTED 0.85]
- **Client-side stem separation pipeline** — vault_adr_0003_client_side_stems_webgpu, vault_adr_0004_float64_model_patch, vault_adr_0005_model_from_huggingface [EXTRACTED 0.90]
- **Analysis flow: concurrency -> speed tracking -> suggestion** — network_folder_concurrency, speed_suggestion_algorithm [EXTRACTED 1.00]
- **Analysis pipeline: input files to verdict and metadata** — analysis_system_concept, glue_audio_native_engine, verdict_system_concept [EXTRACTED 1.00]
- **Analysis flow: Queue, native engine, and storage** — analysis_queue_rust, crates_glue_engine [EXTRACTED 1.00]
- **Analysis storage lifecycle: background summary then track page full storage** — vault_adr_0019_background_analysis_decoding_decision, vault_adr_0023_store_track_page_analysis_decision, track_page_analysis_storage_concept [EXTRACTED 1.00]
- **GLUE system: Website + GLUE folder + GLUE Home + GLUE Cloud** — glue_website_component, glue_folder_structure_concept, glue_home_component, glue_cloud_component [EXTRACTED 1.00]
- **TypeScript and Rust sync held to parity by golden tests** — golden_tests_concept [EXTRACTED 1.00]
- **Rust engine migration: store (E1) then engine (E2)** — vault_adr_0152_the_library_store_in_rust_decision, vault_adr_0153_the_library_engine_in_rust_decision [EXTRACTED 1.00]
- **Opening progress tracking flow** — vault_adr_0177_opening_shows_its_progress_decision, opening_progress_tracking_mechanism, lib_loading_state_concept, src_ui_library_opening [EXTRACTED 1.00]
- **Phone streaming from GLUE Home** — src_help_phone_app_feature [EXTRACTED 1.00]
- **Player bar and queue UI system** — full_player_bar_ui, queue_system, visualiser_feature [EXTRACTED 1.00]
- **GLUE Home engine in Rust: store, interop, RTC** — home_engine_rust_component, glue_store_crate, glue_interop_crate, glue_rtc_crate [EXTRACTED 1.00]
- **Library refactoring for tokenization** — vault_adr_0146_the_library_in_parts_by_concern_decision, src_lib_library_svelte, vault_adr_0146_glue_folder_part, vault_adr_0146_profiles_part, vault_adr_0146_collections_part [EXTRACTED 1.00]
- **Window display in GLUE Home** — glue_window_native_mechanism, window_storage_mechanism, home_mode_in_window_mechanism [EXTRACTED 1.00]
- **ADR 0175 implementation through GLUE systems** — vault_adr_0175_back_from_the_background_connected_at_once_decision [INFERRED 0.85]
- **Analysis and duplicate detection pipeline** — vault_features_background_analysis_feature, pool_based_background_analysis, vault_features_duplicates_feature, fingerprint_duplicate_detection [INFERRED 0.85]
- **Cloud sync lineage** — vault_adr_0036_optional_accounts_and_cloud_signaling_decision, vault_adr_0040_cloud_sync_and_merged_collections_decision, vault_adr_0042_merged_collection_in_the_local_library_decision, vault_adr_0043_batched_sync_and_progressive_loading_decision [INFERRED 0.85]
- **Direct link reliability under load** — remote_session_concept [INFERRED 0.85]
- **DJ library importers** — vault_features_import_rekordbox_feature, vault_features_import_engine_feature, vault_features_import_traktor_feature, vault_features_import_serato_feature, vault_features_import_apple_icloud_feature [INFERRED 0.85]
- **Duplicates matching and grouping pipeline** — vault_adr_0164_glue_home_matches_the_duplicates_decision, vault_adr_0165_glue_home_makes_the_duplicate_groups_decision, duplicate_fingerprint_matching, duplicate_group_building [INFERRED 0.85]
- **GLUE Home as engine decisions** — vault_adr_0103_glue_home_analyses_its_computers_songs_decision, vault_adr_0104_glue_home_is_the_librarys_engine_decision, vault_adr_0108_one_id_per_computer_decision, vault_adr_0110_screen_takes_glue_homes_analyses_decision, vault_adr_0115_any_browser_takes_glue_homes_link_decision [INFERRED 0.85]
- **Streaming songs to other devices through GLUE Home** — rtcpeerconnection_concept, vault_adr_0132_connections_to_glue_home_are_bounded_decision [INFERRED 0.85]
- **Phone streaming and reconnection workflow** — src_help_phone_article [INFERRED 0.85]
- **Quality forensics verdict rules evolution** — vault_features_quality_forensics_feature, vault_adr_0033_tolerate_gentle_roll_offs_decision, vault_adr_0034_quiet_content_above_the_fade_decision, vault_adr_0069_content_beyond_a_wall_decision, vault_adr_0075_drop_outs_under_a_wall_decision [INFERRED 0.85]
- **Shared collection and account sync decisions** — vault_adr_0096_move_merged_collections_into_the_shared_one_decision, vault_adr_0097_glue_home_syncs_shared_collections_decision, vault_adr_0101_cloud_sync_is_the_accounts_collections_decision, vault_adr_0106_shared_collection_as_a_snapshot_and_a_log_decision, vault_adr_0107_sync_looks_only_at_what_changed_decision, vault_adr_0112_the_accounts_collections_decision [INFERRED 0.85]
- **Tags system definition and behavior** — vault_features_tags_feature, vault_adr_0032_tags_decision, vault_adr_0067_one_context_menu_decision [INFERRED 0.85]
- **Network folder analysis optimization** — unified_progress_count_concept, network_folder_song_queuing_mechanism, tag_batch_reading_mechanism [INFERRED 0.95]
- **Playback performance: separate port and folder-scoped lookups** — play_port_mechanism, folder_lookup_optimization_mechanism [INFERRED 0.95]

## Communities (312 total, 68 thin omitted)

### Community 0 - "glue-engine/src/sync.rs"
Cohesion: 0.06
Nodes (46): Engine<H>, HttpCloud<'_, H>, own_devices(), send_counts(), agreed_dir(), apply_change(), base(), checkpoint() (+38 more)

### Community 1 - "queue.rs"
Cohesion: 0.06
Nodes (41): after_analysis(), ANALYSIS_VERSION, at(), cores(), differ(), Engine<H>, failed_before(), gave_up() (+33 more)

### Community 2 - "enginedb.rs"
Cohesion: 0.05
Nodes (51): ancestors(), depth(), Engine<H>, holds(), insert_with_id(), l(), tree_at(), uuid_of() (+43 more)

### Community 3 - "merge.ts"
Cohesion: 0.05
Nodes (77): baseName(), normPath(), FileEntry, Linkable, matchTracks(), segs(), ADR-0020, fillInfo() (+69 more)

### Community 4 - "app.svelte.ts"
Cohesion: 0.05
Nodes (49): beatsBetween(), fmtDb(), fmtKHz(), fmtTime(), freqLabel(), niceStep(), niceTimeStep(), failed() (+41 more)

### Community 5 - "trackMenu.ts"
Cohesion: 0.04
Nodes (62): IncomingFile, safeName(), absolutePath(), MIME, mimeOf(), playlistM3u8(), ready, startPlaylistDrag() (+54 more)

### Community 6 - "Host"
Cohesion: 0.07
Nodes (9): changed_over(), command(), Engine<H>, get(), Host, iso(), Job, key() (+1 more)

### Community 7 - "tests/engine.rs"
Cohesion: 0.06
Nodes (48): a_songs_parts_made_when_asked_then_kept(), C, covers_looked_up_once_gently_and_refused_for_good(), data(), H, put(), Seen, setup() (+40 more)

### Community 8 - "library.svelte.ts"
Cohesion: 0.04
Nodes (40): ids(), djEntries(), djEntryOf(), glueSong(), tagColor(), djAdd(), drag, Payload (+32 more)

### Community 9 - "collection.ts"
Cohesion: 0.07
Nodes (63): Outdated store check before write, GroupInput, adopt(), Adopted, empty(), freeId(), listPath(), OwnParts (+55 more)

### Community 10 - "glue-engine/src/dupes.rs"
Cohesion: 0.07
Nodes (54): a_fingerprint_reads_as_the_website_writes_it(), ber(), best_lists(), build_groups(), certainty(), concerns(), confirm(), copy_score() (+46 more)

### Community 11 - "glue-interop/src/sync.rs"
Cohesion: 0.08
Nodes (52): a_grid_written_reads_back_the_same(), argb(), beat_data(), encode_grid(), encode_hot(), encode_loops(), Hot, hot_slots() (+44 more)

### Community 12 - "App.svelte"
Cohesion: 0.04
Nodes (38): dropIntoLibrary(), hasFiles(), needing, onDrop(), Go, guideTargets(), Place, Pose (+30 more)

### Community 13 - "Engine<H>"
Cohesion: 0.05
Nodes (30): at(), day_key(), days_until(), ev(), message(), needs_music(), needs_music_as_the_website_says(), parse_local() (+22 more)

### Community 14 - "account"
Cohesion: 0.05
Nodes (25): threejs-visualisers, account, browserName(), AppState, ColDef, ColKey, DEFAULT_HIDDEN, DEFAULT_ORDER (+17 more)

### Community 15 - "dsd.rs"
Cohesion: 0.06
Nodes (42): a_dsf_file_is_analysed(), a_dsf_sine_comes_out_as_that_sine_at_88_2_khz(), BYTES1, channel_bytes(), decode(), Dsd, dsf_sine(), factor() (+34 more)

### Community 16 - "App"
Cohesion: 0.07
Nodes (26): changed(), clear(), current(), DOCK, dock_add(), dock_clear(), dock_items(), dock_remove() (+18 more)

### Community 17 - "GLUE vault index and structure"
Cohesion: 0.05
Nodes (59): ADR-0028, Engine DJ playlists stay in DJ collection, Smart lists, ADR-0049, ADR-0059, ADR-0032, ADR-0032, Help: Backups and restoring (+51 more)

### Community 18 - "ADR 0094: One shared collection in GLUE Cloud, the same on every device"
Cohesion: 0.03
Nodes (62): ADR-0091, ADR-0094, ADR-0091, ADR-0094, ADR-0040, ADR-0089, ADR-0087, ADR-0077 (+54 more)

### Community 19 - "view.svelte.ts"
Cohesion: 0.05
Nodes (48): fifthsPos(), harmonicNeighbours(), keyAt(), keyLabel(), KeyNotation, MAJOR_NAMES, MINOR_NAMES, shortMusical() (+40 more)

### Community 20 - "interop/types.ts"
Cohesion: 0.09
Nodes (56): sql.js, isAppleLibrary(), parseAppleLibrary(), plistValue(), PV, cols(), combineEngine(), engineKey() (+48 more)

### Community 21 - "remoteFiles.svelte.ts"
Cohesion: 0.05
Nodes (34): passwordKey(), API_BASE, CloudDevice, CloudUser, GOOGLE_CLIENT_ID, GoogleId, Session, tabConn (+26 more)

### Community 22 - "fsx.ts"
Cohesion: 0.07
Nodes (48): ADR-0026, Waveform, crc32(), CRC_TABLE, createZip(), dec, dosTime(), enc (+40 more)

### Community 23 - "importActions.ts"
Cohesion: 0.05
Nodes (59): ADR-0065, ADR-0063, ADR-0065, ADR-0063, ADR-0063, Detected, Entries, findLibraries() (+51 more)

### Community 24 - "auto.svelte.ts"
Cohesion: 0.07
Nodes (44): ADR-0029, camelotNum(), AutoOptions, AutoResult, bpmFit(), camelot(), Candidate, generate() (+36 more)

### Community 25 - "files.rs"
Cohesion: 0.06
Nodes (46): analysed(), analysed_failed(), decode_details(), details(), DETAILS_VERSION, fingerprint_file(), format_of(), MAX_ROWS (+38 more)

### Community 26 - "stems.svelte.ts"
Cohesion: 0.06
Nodes (42): ADR-0003, ADR-0004, fmtEta(), encodeWav(), LEGACY_MODEL_CACHE, MODEL_CACHE, MODEL_FILE, MODEL_SIZE (+34 more)

### Community 27 - "store/types.ts"
Cohesion: 0.06
Nodes (40): djValues, listsByTrack(), ListEntry, listTree, describeRemoval(), orphans(), removalImpact, INFO_FIELDS (+32 more)

### Community 28 - "Welcome.svelte"
Cohesion: 0.04
Nodes (42): HOME_DOWNLOADS, homePairLink(), RELEASES, ADR-0044, pickAudioFiles(), #each(), ago(), copied (+34 more)

### Community 29 - "Store<D>"
Cohesion: 0.10
Nodes (14): BinEntry, get(), id_of(), LoadOpts, migrate(), num(), OUTDATED, random_id() (+6 more)

### Community 30 - "glue-interop/src/types.rs"
Cohesion: 0.07
Nodes (32): parse_library_files(), parse_m3u(), channel(), parse_rekordbox_xml(), array_index(), base_name(), blank_track(), collate() (+24 more)

### Community 31 - "events.svelte.ts"
Cohesion: 0.07
Nodes (35): blankEvent(), daysUntil(), eventDay(), EventStatus, folderName(), GlueEvent, isPast(), LineupEntry (+27 more)

### Community 32 - "Player"
Cohesion: 0.04
Nodes (52): AIFF format handling, Audio element management, Deferred track page loading, ADR-0076, ADR-0076, ADR-0088, Full player bar, GLUE Home song port (+44 more)

### Community 33 - "glue-engine/src/tags.rs"
Cohesion: 0.06
Nodes (22): Cover, cover_of(), from_image(), jpeg(), LARGE, picture(), picture_from(), SMALL (+14 more)

### Community 34 - "covers.rs"
Cohesion: 0.08
Nodes (29): ART_SIZE, ARTISTS, enc(), Engine<H>, GAP, js_len(), kept_at(), lookup_key() (+21 more)

### Community 35 - "GLUE Cloud: accounts, GLUE Home and devices"
Cohesion: 0.05
Nodes (43): ADR-0036, ADR-0036, ADR-0036, ADR-0027, ADR-0074, ADR-0054, ADR-0061, ADR-0054 (+35 more)

### Community 36 - "engine.svelte.ts"
Cohesion: 0.09
Nodes (14): Clash, cacheFile(), cacheGate, Change, engineClient, EngineState, ADR-0138, Gate (+6 more)

### Community 37 - "nowPlaying.svelte.ts"
Cohesion: 0.08
Nodes (25): facetInfo(), advance(), back(), clear(), dequeue(), EMPTY_QUEUE, enqueue(), jump() (+17 more)

### Community 38 - "ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address"
Cohesion: 0.04
Nodes (46): Away music folder, ADR-0104, ADR-0051, ADR-0125, GLUE Home Stop semantics, ADR-0044, ADR-0103, ADR-0104 (+38 more)

### Community 39 - "ADR 0071: Song info is edited in GLUE and written into the music files by GLUE Home"
Cohesion: 0.05
Nodes (41): crates/glue-audio, ADR-0023, ADR-0071, ADR-0072, ADR-0082, ADR-0019, ADR-0071, ADR-0082 (+33 more)

### Community 40 - "api.ts"
Cohesion: 0.15
Nodes (37): ACCESS_TTL, attach(), authed(), bad(), browserSession(), claim(), CODE_TTL, computerOf() (+29 more)

### Community 41 - "read_json()"
Cohesion: 0.12
Nodes (10): Dir, FsDir, MemDir, read_json(), ReadError, Damaged, Io, temp_for() (+2 more)

### Community 42 - "vitest"
Cohesion: 0.09
Nodes (34): vitest, afterAnalysis(), analysed, analysisState, isTransient(), needsAnalysis(), ADR-0109, counts() (+26 more)

### Community 43 - "platform/index.ts"
Cohesion: 0.08
Nodes (36): ADR-0007, cleanUp(), cleanUpPlan(), canPickFolders(), cleanDuplicates(), Dir, droppedFolder(), fileLink() (+28 more)

### Community 44 - "phone.spec.ts"
Cohesion: 0.09
Nodes (26): test, test, texts(), ADR-0108, launch(), OFF, Opts, test (+18 more)

### Community 45 - "parse.ts"
Cohesion: 0.11
Nodes (37): AAC_SR, addTag(), decodeId3Text(), ext80(), latin1(), latin1Dec, MP3_BR, mp3Gapless() (+29 more)

### Community 46 - "enginePerf.ts"
Cohesion: 0.09
Nodes (35): ADR-0168, beatData(), colour(), hex(), loops(), performance(), quickCues(), Reader (+27 more)

### Community 48 - "Store"
Cohesion: 0.17
Nodes (22): arr(), copies(), get(), glue_path(), GONE_AFTER, import_lists(), Importer, Importer<'_, D> (+14 more)

### Community 49 - "dupes.svelte.ts"
Cohesion: 0.08
Nodes (32): ADR-0098, Duplicate fingerprint matching, ber(), fingerprint, FP_FRAME_SEC, FP_HOP, FP_N, FP_RATE (+24 more)

### Community 50 - "rtc.rs"
Cohesion: 0.09
Nodes (8): File, answer(), App, Conns, new(), Playing, RECEIVING, SERVING

### Community 51 - "Library"
Cohesion: 0.05
Nodes (32): Clash merge with changed_over, ADR-0162, engineClient.runs check, ADR-0162, ADR-0162, ADR-0090, collections, ADR-0090 (+24 more)

### Community 52 - "tests/room.rs"
Cohesion: 0.11
Nodes (13): a_start_overtaken_by_stop_says_nothing(), Calls, FakePeers, full_refused_and_the_same_tab_replaces_its_own(), H, offer(), online_offers_answered_and_candidates_relayed_both_ways(), removed_from_the_account_or_replaced() (+5 more)

### Community 53 - "analyze.ts"
Cohesion: 0.10
Nodes (33): ADR-0006, analyzeMusic(), analyzeSamples(), computeSpectrum(), decimate(), FrameReader, makePcmReader(), monoOf() (+25 more)

### Community 54 - "handle()"
Cohesion: 0.11
Nodes (35): handle(), SignalNS, MAX_BUNDLE, MAX_BUNDLE_PATHS, MAX_BYTES, MAX_FILE, SyncError, append() (+27 more)

### Community 55 - ".serve()"
Cohesion: 0.16
Nodes (7): Chan, Host, now_ms(), put_keys(), Server<H>, Song, unframe()

### Community 56 - "covers.svelte.ts"
Cohesion: 0.08
Nodes (26): CoverSize, ADR-0131, OnScreen, Retries, ADR-0131, Why, Cover, COVER_LARGE (+18 more)

### Community 57 - "protocol.rs"
Cohesion: 0.09
Nodes (7): a_device_asks_and_sends(), Client, H, Mem, next_text(), Sink, the_relays_servers_are_taken()

### Community 58 - "Engine<H>"
Cohesion: 0.14
Nodes (4): Engine<H>, now(), Peers, room_loop()

### Community 59 - "Disk"
Cohesion: 0.10
Nodes (7): Disk, Fwd, main(), Probe, Arriving, ReadSeek, T

### Community 60 - "shared/engine.ts"
Cohesion: 0.13
Nodes (31): setAt(), agreedDir(), applyChange(), base(), checkpoint(), diffFile(), DIRS, entryOf() (+23 more)

### Community 61 - "ws.rs"
Cohesion: 0.07
Nodes (15): allowed(), get(), HOSTS, IMAGE_HOSTS, MAX, a_cancelled_request_isnt_answered(), allowed(), answer() (+7 more)

### Community 62 - "merge.rs"
Cohesion: 0.12
Nodes (20): apply_import(), blank_lib_track(), carried_engine(), CuePoint, fill_info(), has_file(), ImportedLibrary, ImportedTrack (+12 more)

### Community 63 - "analysis.worker.ts"
Cohesion: 0.09
Nodes (22): ADR-0024, timeAsync(), FileInfo, jobOf(), ADR-0060, b64(), golden(), inflate() (+14 more)

### Community 64 - "Track"
Cohesion: 0.14
Nodes (4): covers, dock, Row, Track

### Community 65 - "store.golden.test.ts"
Cohesion: 0.07
Nodes (35): common(), copy(), damaged, engineImport, engineLib(), fold, IMPORTS, J() (+27 more)

### Community 66 - "dj.rs"
Cohesion: 0.12
Nodes (8): APPS, AT_MOST, DjWatch, Engine<H>, find_libraries(), Found, MAX_DIRS, mtime()

### Community 67 - "verdict.rs"
Cohesion: 0.14
Nodes (26): article(), at(), Beyond, beyond_wall(), classify(), detect_cutoff(), expected_cutoff(), expected_table() (+18 more)

### Community 68 - "HomeStore"
Cohesion: 0.11
Nodes (11): CloudAlias, isAlias(), Listed, profiles, toCloud(), toLocal(), HomeStore, now() (+3 more)

### Community 69 - "parse_engine_db()"
Cohesion: 0.14
Nodes (14): Cell, Blob, Null, Num, Text, cols(), combine_engine(), combine_engine_with_tree() (+6 more)

### Community 70 - "bundle"
Cohesion: 0.06
Nodes (33): app, security, windows, build, devUrl, frontendDist, bundle, active (+25 more)

### Community 71 - "ref_node_fs"
Cohesion: 0.09
Nodes (24): ADR-0126, ADR-0126, FNS, GRIDS, Article, esc(), inline(), parseArticle() (+16 more)

### Community 72 - ".answer()"
Cohesion: 0.18
Nodes (7): Answer, Data, Background, data(), Engine<H>, ids(), joined()

### Community 73 - "CollectionStore"
Cohesion: 0.14
Nodes (10): ADR-0152, CollectionStore, shardOf(), writeUnwritten(), store(), 0152. The library store in Rust, held to the website's byte for byte, Alternatives considered, Consequences (+2 more)

### Community 74 - "duplicates.ts"
Cohesion: 0.16
Nodes (27): buildGroups(), certainty(), concerns(), Copy, copyScore(), GRADE, groupKey(), groupMatches() (+19 more)

### Community 75 - "ADR 0108: One id per computer: GLUE Home learns it, only the computer's GLUE folder writes its parts"
Cohesion: 0.06
Nodes (31): ADR-0108, ADR-0112, ADR-0102, ADR-0102, ADR-0108, ADR-0112, ADR-0101, ADR-0102 (+23 more)

### Community 76 - "analyze.rs"
Cohesion: 0.12
Nodes (19): analyze_music(), analyze_samples(), compute_spectrum(), decimate(), gauss(), Job, Demo, Float (+11 more)

### Community 77 - "text()"
Cohesion: 0.21
Nodes (14): edits_show_on_the_tree(), Engine<H>, find(), insert(), items_in(), names(), OPS, order_before() (+6 more)

### Community 78 - "truthy()"
Cohesion: 0.11
Nodes (10): busy(), ENGINE_APPS, Engine<H>, has_col(), mtime(), Song, Synced, truthy() (+2 more)

### Community 79 - "parse.rs"
Cohesion: 0.18
Nodes (25): AAC_SR, apply_stream_info(), Bytes, find(), is_id(), mp3_gapless(), mp3_header(), Mp3Header (+17 more)

### Community 80 - "ADR 0175: Back from the background, the room and the sessions are made again at once"
Cohesion: 0.07
Nodes (25): ADR-0174, ADR-0175, Phone app: Browse and play from computer, Help: GLUE on your phone, ADR-0175, ADR-0175, ADR-0174, describeStart() (+17 more)

### Community 81 - "disk.rs"
Cohesion: 0.17
Nodes (15): cfg_path(), check(), colons_and_backslashes_only_matter_on_windows(), describe(), fail(), handle(), inside(), io_fail() (+7 more)

### Community 82 - "ADR 0030: DJ libraries are detected in folders the user has allowed"
Cohesion: 0.12
Nodes (29): ADR-0030, ADR-0030, ADR-0030, ADR-0124, ADR-0020, ADR-0124, ADR-0124, ADR 0010: Read-only import and file export before any write-back (+21 more)

### Community 83 - "remoteFiles"
Cohesion: 0.15
Nodes (3): incomingKey(), remoteFiles, streamsReady()

### Community 84 - "users"
Cohesion: 0.11
Nodes (22): attempts, credentials, credentials_device, devices, devices_user, identities, pairing_codes, users (+14 more)

### Community 85 - "sharedCloud.ts"
Cohesion: 0.13
Nodes (24): Deps, Access, b64url(), enc, GoogleClaims, googleKeys(), hmacKey(), json() (+16 more)

### Community 86 - "covers.golden.test.ts"
Cohesion: 0.13
Nodes (26): ADR-0086, ADR-0086, CoverQuery, lookupKey(), norm(), pick(), queryOf(), quote() (+18 more)

### Community 87 - "djWatch.svelte.ts"
Cohesion: 0.09
Nodes (21): AnyFile, Dir, DjState, djWatch, homeFollows(), placeDir(), stat(), ADR-0171 (+13 more)

### Community 88 - "GLUE: how it works now"
Cohesion: 0.08
Nodes (27): ADR-0113, ADR-0113, CollectionStore: loads and keeps maps of library files, ADR-0018, Duplicates: fingerprints and name-based matching, GLUE Cloud: optional account service on Cloudflare, GLUE folder: user's data as JSON files, Shared form: collections synced across devices (+19 more)

### Community 89 - ".song()"
Cohesion: 0.18
Nodes (7): Engine<H>, origin(), parent_id(), real_path(), repoint(), Songs, Songs<'a>

### Community 90 - "project.rs"
Cohesion: 0.20
Nodes (21): analysis_here(), analysis_shared(), collection_here(), collection_shared(), COPY_FIELDS, dedup(), get(), Here (+13 more)

### Community 91 - "ADR 0179: Engine DJ's own playlists, and its songs' info, edited from GLUE"
Cohesion: 0.07
Nodes (28): ADR-0179, ADR-0180, ADR-0179, ADR-0180, ADR-0179, ADR-0179, ADR-0180, ADR-0179 (+20 more)

### Community 92 - "local.rs"
Cohesion: 0.11
Nodes (18): an_analysis_read_waits_while_a_song_plays_then_goes_on(), busy_for_test(), BUSY_UNTIL, EDITS, FOREGROUND_AT, handle(), LEASE_AT, leased() (+10 more)

### Community 93 - "admin.ts"
Cohesion: 0.11
Nodes (24): AdminError, count(), maintenance(), N, route(), sessions(), stats(), TIERS (+16 more)

### Community 94 - "fingerprint.rs"
Cohesion: 0.10
Nodes (15): BANDS, F_HI, F_LO, fingerprint(), FP_HOP, FP_N, FP_RATE, FP_SECONDS (+7 more)

### Community 95 - "home.spec.ts"
Cohesion: 0.09
Nodes (24): test, ADR-0091, ADR-0156, ADR-0158, ADR-0156, ADR-0158, ADR-0156, LIBRARY (+16 more)

### Community 96 - "ADR 0052: A Prepare tab: waveform, beat grid, metronome and the user's corrections"
Cohesion: 0.08
Nodes (20): legacy/index.html, ADR-0052, ADR-0052, ADR-0052, ADR-0052, ADR-0052, ADR-0052, ADR-0052 (+12 more)

### Community 97 - "relink.ts"
Cohesion: 0.13
Nodes (22): artistsOf(), fileStem(), joinedOf(), Keyed, matchAgainst(), nameOf(), overlap(), overlapWords() (+14 more)

### Community 98 - "MemDir"
Cohesion: 0.11
Nodes (12): MemDir, MemFile, Node, notFound(), files(), folder(), song(), hex() (+4 more)

### Community 99 - "serde_json"
Cohesion: 0.10
Nodes (6): Devices, HEX, PENDING, safe_hash(), type_of(), HttpCloud

### Community 100 - "Pv"
Cohesion: 0.14
Nodes (13): HEAD, parse_apple_library(), Pv, Arr, Bool, Dict, Null, Num (+5 more)

### Community 101 - "types"
Cohesion: 0.12
Nodes (8): EXTINF, HEAD, get(), HEAD, MAJOR, nml_path(), parse_traktor_nml(), traktor_key()

### Community 102 - "ref_node_url"
Cohesion: 0.08
Nodes (14): errors, files, FIX, OUT, ADR-0147, ADR-0044, vite, { channels, sr } (+6 more)

### Community 103 - "transfer.ts"
Cohesion: 0.12
Nodes (22): Conn, MockHome, putKeys(), rtc(), sendFile(), serve(), tell(), safe() (+14 more)

### Community 104 - "ADR 0060: Read, parse and decode audio in the worker (mediabunny + WebCodecs)"
Cohesion: 0.09
Nodes (23): ADR-0060, mediabunny, KeepInput, keepRange(), ADR-0060, ADR-0144, ADR-0060, gaveUp() (+15 more)

### Community 105 - "make-audio.ts"
Cohesion: 0.09
Nodes (22): DUPLICATE, encode(), entries, EXT, ff(), fileName(), FILES, hz() (+14 more)

### Community 106 - "interop.golden.test.ts"
Cohesion: 0.15
Nodes (23): be64(), beats(), cases(), cat(), cp1252, crate(), enc(), engineDrive() (+15 more)

### Community 107 - "Socket"
Cohesion: 0.11
Nodes (4): Socket, open(), Room, tcp()

### Community 108 - ".track_path()"
Cohesion: 0.20
Nodes (6): Engine<H>, exists(), newly_found(), Seen, shared(), SongFile

### Community 109 - "verify.rs"
Cohesion: 0.14
Nodes (11): bit_errors(), bytes_off(), Check, Engine<H>, fresh(), HEX, near(), same() (+3 more)

### Community 110 - "Quality forensics"
Cohesion: 0.11
Nodes (19): ADR-0119, ADR-0033, ADR-0033, src_ui_GlueStick, Steep top end lowpass verdict, ADR-0033, ADR 0033: Tolerate gentle top-end roll-offs; re-check stored verdicts when the rules change, ADR 0034: Count quiet content above a gentle fade (peak-hold reach) (+11 more)

### Community 111 - "ADR 0133: A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what"
Cohesion: 0.08
Nodes (23): ADR-0133, ADR-0133, Remote Session, ADR-0133, ADR-0133, ADR-0133, ADR-0133, ADR-0133 (+15 more)

### Community 112 - "analyse()"
Cohesion: 0.15
Nodes (9): analyse(), analyse_demo(), Analysis, ext_of(), Failure, Broken, Unsupported, file_info() (+1 more)

### Community 113 - "ADR 0046: GLUE Home keeps and shares the analyses; TO BE SORTED lists its incoming folder"
Cohesion: 0.09
Nodes (23): ADR-0045, ADR-0047, ADR-0048, ADR-0045, ADR-0046, ADR-0046, ADR-0045, ADR-0048 (+15 more)

### Community 114 - "library.rs"
Cohesion: 0.12
Nodes (10): away(), HEX, INCOMING_ROOT, is_away(), join(), Known, search_file(), search_folder() (+2 more)

### Community 115 - "truthy()"
Cohesion: 0.22
Nodes (11): truthy(), file_key(), FileEntry, get(), Linkable, LOOSE, match_tracks(), NUMBERED (+3 more)

### Community 116 - "rtc-probe.mjs"
Cohesion: 0.08
Nodes (21): e2e/home-rtc.ts: RTC e2e stand-in, ADR-0150, ADR-0150, child, dir, ADR-0150, out, results (+13 more)

### Community 117 - "DuplicatesView.svelte"
Cohesion: 0.08
Nodes (17): fmtBytes(), cleaning, doClean(), fmt(), hidden, includeDoubtful, limit, pickedGroups (+9 more)

### Community 118 - "guide"
Cohesion: 0.16
Nodes (6): emptyGuide(), guideAdds(), GuideState, mergeGuide(), guide, readLocal()

### Community 119 - "ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put"
Cohesion: 0.09
Nodes (14): ADR-0139, ADR-0139, ADR-0139, ADR-0139, HomeSocket, ADR-0139, Waiting, FakeSocket (+6 more)

### Community 120 - "shared"
Cohesion: 0.20
Nodes (4): at(), cloudFor(), shared, waitingClashes()

### Community 121 - "signal.ts"
Cohesion: 0.14
Nodes (10): ClientMsg, Env, prepare(), RoomMsg, Signal, State, ADR-0036, ADR-0091 (+2 more)

### Community 122 - "Engine"
Cohesion: 0.09
Nodes (5): Done, Engine, Feed, FULL_EVERY, JOBS

### Community 123 - "js.rs"
Cohesion: 0.10
Nodes (4): fixed_num(), grouped(), num_str(), to_fixed()

### Community 124 - "parse_serato_database()"
Cohesion: 0.20
Nodes (15): build_serato_library(), get(), minutes(), parse_serato(), parse_serato_crate(), parse_serato_database(), serato_path(), SField (+7 more)

### Community 125 - "ADR 0147: GLUE Home analyses natively, in Rust"
Cohesion: 0.09
Nodes (22): GLUE Home test service page, ADR-0160, ADR-0147, ADR-0160, ADR-0147, ADR-0147, ADR-0147, ADR-0147 (+14 more)

### Community 126 - "package.json"
Cohesion: 0.08
Nodes (21): autostart(), onPairLink(), allowScripts, github:festanqueiro/threejs-visualisers#3a85cac1d9db9d8c3ba30a5f65d90831f137944b, description, name, private, type (+13 more)

### Community 127 - "themes.svelte.ts"
Cohesion: 0.12
Nodes (11): GLUE website entry page, svelte, loadedFonts, loadFonts(), Mode, themeById(), themeCss(), ThemeDef (+3 more)

### Community 128 - "verdict.ts"
Cohesion: 0.14
Nodes (23): article(), beyondWall(), classify(), declaredLabel(), detectCutoff(), EXPECTED, expectedCutoff(), findResample() (+15 more)

### Community 129 - "homedisk.test.ts"
Cohesion: 0.10
Nodes (16): Entries, findFile(), scanFolder(), ScannedFile, AUDIO_EXT, ADR-0134, ADR-0134, track() (+8 more)

### Community 130 - "src/room.rs"
Cohesion: 0.12
Nodes (9): API, enc(), Received, Closed, Nothing, Text, Room, Session (+1 more)

### Community 131 - "merge3.rs"
Cohesion: 0.21
Nodes (15): arr(), Clash, Kind, Analysis, Collection, Other, Tracks, merge3() (+7 more)

### Community 132 - "fakeHome.ts"
Cohesion: 0.09
Nodes (16): FakeHomeDirs, ADR-0070, ADR-0155, ADR-0070, ADR-0155, ADR-0155, Golden tests: TypeScript to Rust parity, home/ui/sharedSync.ts: deleted (+8 more)

### Community 133 - "ADR 0151: GLUE opens in GLUE Home's own window, showing the live site"
Cohesion: 0.09
Nodes (19): ADR-0151, ADR-0058, ADR-0151, ADR-0058, ADR-0151, ADR-0058, ADR-0151, ADR-0058 (+11 more)

### Community 134 - "golden.test.ts"
Cohesion: 0.17
Nodes (19): blankInfo(), makeThumb(), makeWaveThumb(), THUMB_H, THUMB_W, ADR-0031, WAVE_BYTES, ADR-0031 (+11 more)

### Community 135 - "glue-rtc/src/lib.rs"
Cohesion: 0.12
Nodes (11): CHUNK, Conn, frame(), Handler, HIGH_WATER, MAX_FILE, MAX_RANGE, safe_part() (+3 more)

### Community 136 - "xml.rs"
Cohesion: 0.15
Nodes (9): is_space(), ATTR, decode_entities(), ENTITY, parse_int(), parse_xml(), reads_what_the_website_reads(), SP (+1 more)

### Community 137 - "ADR 0165: GLUE Home makes the duplicate groups and points playlists at the best copies"
Cohesion: 0.11
Nodes (16): ADR-0120, ADR-0121, Duplicate group building, Acoustic fingerprint duplicate detection, bestLists(), ADR-0013, ADR-0117, ADR-0013 (+8 more)

### Community 138 - "platform/homeDisk.ts"
Cohesion: 0.10
Nodes (18): ADR-0141, ADR-0141, File read folder lookup: resolve each folder only once, remember for 10 min, PLAY_PORT: separate 127.0.0.1 port for song playback, ADR-0141, Entry, HomeDown, HomeRoots (+10 more)

### Community 139 - "AppHandle"
Cohesion: 0.23
Nodes (17): activity_now(), cache_path(), cache_put(), config_path(), default_incoming(), device_name(), find_glue(), find_glue_folder() (+9 more)

### Community 140 - "window.rs"
Cohesion: 0.17
Nodes (11): free_name(), LABEL, open(), Place, place_file(), popup(), read_place(), save_place() (+3 more)

### Community 142 - "R"
Cohesion: 0.24
Nodes (5): Bytes<'a>, ext80(), Mp4<'a, 'b>, parse_mp4(), some()

### Community 143 - "js_keys()"
Cohesion: 0.22
Nodes (13): index_key(), js_gt(), js_keys(), locale_cmp(), num_str(), parse(), pretty(), quote() (+5 more)

### Community 144 - "bridge.ts"
Cohesion: 0.10
Nodes (13): ADR-0083, Activity, API, askYesNo(), bridge, openFolder(), openUrl(), pickFolder() (+5 more)

### Community 145 - "homeLink.ts"
Cohesion: 0.13
Nodes (15): ADR-0132, RTCPeerConnection, candidateType(), Handshake, isHandshake(), connectHome(), routeOf(), hasRelay (+7 more)

### Community 146 - "lib/analysis.ts"
Cohesion: 0.20
Nodes (19): pick(), analysisWorker(), analyze(), decodedByWorker(), fingerprintOf(), NeedsPageDecode, pageJob(), pending (+11 more)

### Community 147 - "dupes"
Cohesion: 0.20
Nodes (4): DupGroup, dupes, savedPath(), cacheDir()

### Community 148 - "RelinkView.svelte"
Cohesion: 0.10
Nodes (11): doubtful, askDoubtful, askPlan, chosen, includeDoubtful, limit, matched, pickedShown (+3 more)

### Community 149 - "decode.rs"
Cohesion: 0.14
Nodes (5): decode(), Decoded, keep_range(), mp4_edit(), push()

### Community 150 - "src-tauri/src/dupes.rs"
Cohesion: 0.19
Nodes (9): default_duplicates(), duplicates_dir(), free(), move_into(), moves_under_the_folder_name_and_path_and_numbers_clashes(), music_roots(), refuses_paths_that_leave_the_folder_and_folders(), run() (+1 more)

### Community 151 - "main.rs"
Cohesion: 0.14
Nodes (9): CONFIG, follow_windows(), LIBRARY_URL, main(), open_glue(), open_library(), open_settings(), show_settings() (+1 more)

### Community 152 - "fingerprints.ts"
Cohesion: 0.19
Nodes (11): homeAnalysis, decodeFingerprint(), decodePack(), encodePack(), packPath(), path(), readFingerprint(), readPacks() (+3 more)

### Community 153 - "backup.rs"
Cohesion: 0.23
Nodes (10): a_backup_holds_the_profile_and_says_what_it_is(), BACKUP_FORMAT, BACKUP_VERSION, build_backup(), crc32(), create_zip(), dos_time(), read_zip() (+2 more)

### Community 154 - "graph_docs.py"
Cohesion: 0.17
Nodes (9): adr_files(), digest(), finish(), node_id(), link(), prepare(), rel(), stem_id() (+1 more)

### Community 155 - "flac.ts"
Cohesion: 0.24
Nodes (12): Bits, BLOCK, decodeFlac(), fixed(), flacHeader(), FlacInfo, FlacPcm, frame() (+4 more)

### Community 157 - "ADR 0135: Analysis around network folders: their songs take turns, GLUE Home reads tags in batches, "
Cohesion: 0.11
Nodes (14): Analysis queue meter, ADR-0157, GLUE Home analysis (fillInfo), ADR-0135, ADR-0157, ADR-0135, ADR-0135, ADR-0157 (+6 more)

### Community 158 - "smoke-local.ts"
Cohesion: 0.13
Nodes (13): both, got, homeLog, kicked, signalled, stop(), ws, claim() (+5 more)

### Community 159 - "ADR 0146: Keep the library's methods in parts by concern, behind the same `lib`"
Cohesion: 0.12
Nodes (15): ADR-0146, lib(), analysis part, collections part, djLibraries part, edits part, files part, folders part (+7 more)

### Community 160 - "graph.mjs"
Cohesion: 0.12
Nodes (10): fixtures, ADR-0060, FETCHED, gitDir, inOut(), KEEP, OUT, own (+2 more)

### Community 161 - "prepare"
Cohesion: 0.22
Nodes (4): beatGrid(), ImportedTrack, Grid, prepare

### Community 162 - "lib/perf.ts"
Cohesion: 0.22
Nodes (12): enablePerf(), perfStats(), record(), resetPerf(), takeFrameWork(), describe(), Interaction, LongFrame (+4 more)

### Community 163 - "PhoneSongs.svelte"
Cohesion: 0.14
Nodes (13): order(), down(), follow(), grab(), held, more(), moving, off (+5 more)

### Community 164 - "ADR 0159: GLUE Home's first run, a GLUE folder always offered, and its window signed in by GLUE Home"
Cohesion: 0.12
Nodes (16): ADR-0159, ADR-0115, ADR-0159, ADR-0159, GLUE folder setup on first run, ADR-0159, ADR-0159, ADR-0115 (+8 more)

### Community 165 - "glue-audio/tests/golden.rs"
Cohesion: 0.24
Nodes (9): b64(), check(), check_files(), golden(), lossless_fixtures_match_javascript(), result_json(), root(), same() (+1 more)

### Community 166 - "repair.rs"
Cohesion: 0.35
Nodes (11): Counts, fold_computer(), FoldInput, FoldResult, get(), has_stand_in(), needs_fold(), obj() (+3 more)

### Community 167 - "0128. Build the code map on GitHub for every push, and use it by fixed rules"
Cohesion: 0.12
Nodes (15): ADR-0129, Code map view step in deploy, Latest threejs-visualisers step, GitHub Pages deployment, Test and deploy workflow, 0128. Build the code map on GitHub for every push, and use it by fixed rules, Alternatives considered, Consequences (+7 more)

### Community 169 - "compilerOptions"
Cohesion: 0.12
Nodes (16): @tsconfig/svelte/tsconfig.json, compilerOptions, isolatedModules, lib, module, moduleResolution, noFallthroughCasesInSwitch, noImplicitOverride (+8 more)

### Community 170 - "idbSet()"
Cohesion: 0.15
Nodes (15): idbDel(), idbGet(), idbSet(), tx(), addLibraryPlace(), browserHome(), forgetFolder(), forgetHome() (+7 more)

### Community 171 - "sync.golden.test.ts"
Cohesion: 0.21
Nodes (16): syncShared(), asDir(), Call, Golden, J(), lapEdit(), memDir(), meta (+8 more)

### Community 172 - "GLUE: Global Library Unified Exporter"
Cohesion: 0.17
Nodes (16): Analysis: quality verdict, fingerprint, waveform, spectrogram, DJ library sync: bidirectional with Engine DJ, GLUE Home build and release pipeline, crates/glue-audio: Native analysis engine, glue-audio: native Rust analysis engine, crates/glue-engine: Library engine in Rust, GLUE Home: Tauri 2 tray app for library engine and analysis, glue-interop: DJ libraries in Rust (+8 more)

### Community 173 - "djinfo.rs"
Cohesion: 0.33
Nodes (10): app_info(), app_value(), each_sides_change_goes_to_the_other(), FIELDS, glue_and_engine_djs_forms(), glue_info(), info(), InfoMerge (+2 more)

### Community 174 - "homemode.spec.ts"
Cohesion: 0.13
Nodes (11): ADR-0149, errors, MUSIC, test, ADR-0108, engine(), 0149. GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failures once, Alternatives considered (+3 more)

### Community 175 - "perf.spec.ts"
Cohesion: 0.13
Nodes (12): afterPaint(), BUDGET, errors, Long, note(), over, results, SIZES (+4 more)

### Community 176 - "capture.ts"
Cohesion: 0.17
Nodes (11): clip(), cursor(), DEMO, ff(), OUT, profile, shot(), ADR-0063 (+3 more)

### Community 177 - "shared.svelte.ts"
Cohesion: 0.17
Nodes (11): Counts, countsOf(), holdsMusic(), sendCounts(), askDeleteShared(), ComputerStats, holdsMusic(), ownDevices() (+3 more)

### Community 178 - "PlayerPanel.svelte"
Cohesion: 0.14
Nodes (13): dropOn, full, fullscreen(), h, played, press(), q, showPlayed (+5 more)

### Community 179 - "lib/ice.ts"
Cohesion: 0.17
Nodes (11): ADR-0081, ADR-0037, ADR-0081, iceCache(), ADR-0037, TurnReply, ICE_SERVERS, ADR-0037 (+3 more)

### Community 180 - "cues.ts"
Cohesion: 0.18
Nodes (13): CuePoint, byRecord, bySource, cuesFor(), fromApps(), index(), mainOf(), mainSource() (+5 more)

### Community 181 - "merge3.ts"
Cohesion: 0.22
Nodes (11): isObj(), merge3(), mergeBoth(), Merged, mergeSequence(), mergeSets(), mergeValue(), same() (+3 more)

### Community 183 - "summary.rs"
Cohesion: 0.20
Nodes (7): ANALYSIS_VERSION, ENGINE, failed(), iso(), now_iso(), summarize(), VERDICT_VERSION

### Community 184 - "IceCache"
Cohesion: 0.26
Nodes (3): IceCache, kept_until_the_relay_ends_or_ten_minutes(), public_servers()

### Community 185 - "library.spec.ts"
Cohesion: 0.15
Nodes (8): errors, fixture(), Got, MUSIC, seed(), ADR-0062, ADR-0062, ADR-0062

### Community 186 - "answer()"
Cohesion: 0.23
Nodes (8): answer(), decode(), header(), query(), refused_while_stopped(), respond(), send_file(), type_of()

### Community 187 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @crabnebula/tauri-plugin-drag, mediabunny, sql.js, @tauri-apps/api, @tauri-apps/plugin-autostart, @tauri-apps/plugin-deep-link, @tauri-apps/plugin-dialog (+6 more)

### Community 188 - "prepare.test.ts"
Cohesion: 0.25
Nodes (10): addMemory(), autoLoop(), byTime(), HOT_COLORS, hotCue(), importable(), LETTERS, removeCue() (+2 more)

### Community 190 - "waterfall.ts"
Cohesion: 0.19
Nodes (10): create3D(), TICKS, ADR-0073, View3D, bandBins(), bandFreq(), WF_BANDS, WF_DEPTH (+2 more)

### Community 191 - "ADR 0154: The analysis queue in GLUE Home's engine, in Rust"
Cohesion: 0.15
Nodes (12): Analysis queue in Rust: Part of GLUE Home's engine, crates/glue-engine: GLUE Home's library engine in Rust, ADR-0154, ADR-0154, ADR-0154, ADR-0154, ADR-0154, 0154. The analysis queue in GLUE Home's engine, in Rust (+4 more)

### Community 192 - "src/profiles.ts"
Cohesion: 0.29
Nodes (11): Alias, color(), create(), list(), merge(), name(), one(), out() (+3 more)

### Community 193 - "glue-audio.rs"
Cohesion: 0.22
Nodes (5): AUDIO, b64(), main(), one(), songs()

### Community 194 - "parse_id3v2()"
Cohesion: 0.40
Nodes (9): add_tag(), decode_id3_text(), id3_chunk(), latin1(), parse_aiff(), parse_id3v2(), parse_wav(), read_str() (+1 more)

### Community 195 - "test.rs"
Cohesion: 0.19
Nodes (4): main(), PagePeers, PageSocket, say()

### Community 197 - "incoming.rs"
Cohesion: 0.26
Nodes (6): list(), move_to(), moves_without_overwriting(), safe_name(), with_number(), incoming_part()

### Community 198 - "ADR 0153: GLUE Home's library engine in Rust, tested end to end against the real one"
Cohesion: 0.15
Nodes (11): ADR-0153, ADR-0153, EDGE_ARGS, ADR-0153, End-to-end tests workflow, ADR-0153, 0153. GLUE Home's library engine in Rust, tested end to end against the real one, Alternatives considered (+3 more)

### Community 199 - "ADR 0067: One context menu for the library page: right-click (or ⋯) on anything there"
Cohesion: 0.17
Nodes (11): ADR-0067, ADR-0078, ADR-0078, ADR-0078, ADR-0067, ADR-0067, ADR-0078, ADR-0078 (+3 more)

### Community 201 - "activity.rs"
Cohesion: 0.26
Nodes (6): Act, counts_calls_time_and_bytes(), note(), snapshot(), start(), STARTED

### Community 202 - "ui/engine.ts"
Cohesion: 0.21
Nodes (11): HomeConfig, Status, AnalysisState, describe(), EngineStatus, LibraryInfo, Speed, ADR-0153 (+3 more)

### Community 203 - "updates.ts"
Cohesion: 0.15
Nodes (7): Dock, GLUE drag dock page, ADR-0045, @crabnebula/tauri-plugin-drag, @tauri-apps/api, @tauri-apps/plugin-process, @tauri-apps/plugin-updater

### Community 204 - "ADR 0177: Opening the library or a collection shows its progress, and waits less"
Cohesion: 0.17
Nodes (11): lib.loading state, ADR-0177, ADR-0177, ADR-0177, ADR-0177, ADR-0177, 0177. Opening the library or a collection shows its progress, and waits less, Alternatives considered (+3 more)

### Community 205 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, svelte, svelte-check, @sveltejs/vite-plugin-svelte, @tauri-apps/cli, @tsconfig/svelte, @types/node (+5 more)

### Community 206 - "parity.test.ts"
Cohesion: 0.19
Nodes (9): CLUES, scanClues(), Clue, fixture(), analyzeBoth(), html, legacy, noop() (+1 more)

### Community 207 - "incoming"
Cohesion: 0.27
Nodes (3): fnv(), incoming, plain()

### Community 208 - "import_golden.rs"
Cohesion: 0.20
Nodes (3): iso(), libraries_come_in_as_on_the_website(), root()

### Community 209 - "super"
Cohesion: 0.20
Nodes (6): Admit, Full, Ok, Refused, max_of(), session_key()

### Community 213 - "cloud/package.json"
Cohesion: 0.18
Nodes (10): description, devDependencies, wrangler, name, private, scripts, deploy, dev (+2 more)

### Community 214 - "json"
Cohesion: 0.24
Nodes (3): root(), run(), the_store_writes_what_the_website_writes()

### Community 215 - "ADR 0182: Engine DJ's playlists written as Engine DJ writes them: its Collection, then each drive's "
Cohesion: 0.18
Nodes (10): Engine DJ cues, loops, and grid storage, Engine DJ playlist tree repair process, ADR 0172: Engine DJ: the playlists' order in step, and songs pointed at the copy kept, ADR 0173: Engine DJ: what GLUE can't see stays where it is; one backup each time Engine DJ closes, 0182. Engine DJ's playlists written as Engine DJ writes them: its Collection, then each drive's copy, Alternatives considered, Consequences, Context (+2 more)

### Community 216 - "ADR 0169: The main DJ library"
Cohesion: 0.18
Nodes (11): ADR-0169, ADR-0169, ADR-0169, ADR-0169, ADR-0169, ADR-0169, 0169. The main DJ library, Alternatives considered (+3 more)

### Community 217 - "lossy.rs"
Cohesion: 0.31
Nodes (6): a_damaged_mp3_frame_keeps_the_time(), a_deadline_stops_the_analysis(), alac_is_the_same_as_flac(), fixture(), lossy_files_decode(), run()

### Community 218 - "0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer"
Cohesion: 0.20
Nodes (9): Code map: graphify knowledge graph, ADR-0127, Workflow: Code map (graphify knowledge graph), graphify: knowledge graph extraction tool, 0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer, Alternatives considered, Consequences, Context (+1 more)

### Community 219 - "lossy_golden.rs"
Cohesion: 0.38
Nodes (6): bytes_b64(), FILES, json(), lossy_files_match_the_browser(), root(), same()

### Community 220 - "ADR 0136: Analysis limits are the user's to set, with the speed shown and a suggestion from it"
Cohesion: 0.22
Nodes (9): ADR-0136, ADR-0136, From each network folder at a time setting, Suggestion algorithm based on performance metrics, 0136. Analysis limits are the user's to set, with the speed shown and a suggestion from it, Alternatives considered, Consequences, Context (+1 more)

### Community 221 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, check, dev, home:dev, home:preview, home:ui, preview (+2 more)

### Community 222 - "metronome"
Cohesion: 0.36
Nodes (3): Grid, metronome, ADR-0052

### Community 223 - "Live"
Cohesion: 0.24
Nodes (3): Live, toSink(), WaterfallFrame

### Community 225 - "control.rs"
Cohesion: 0.25
Nodes (3): check(), set_deadline(), TOO_LONG

### Community 226 - "ADR 0106: Keep the shared collection in GLUE Cloud as a snapshot and a log of changes"
Cohesion: 0.25
Nodes (8): ADR-0106, ADR-0105, ADR-0107, ADR-0106, ADR-0106, ADR 0105: Pace pushes to GLUE Cloud; GLUE Home analyses as many songs at once as the computer allows, ADR 0106: Keep the shared collection in GLUE Cloud as a snapshot and a log of changes, ADR 0107: The shared sync looks only at the files that changed, and keeps its agreed copies file by 

### Community 227 - "clues.rs"
Cohesion: 0.31
Nodes (3): CLUES, patterns(), scan_clues()

### Community 228 - "ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust"
Cohesion: 0.22
Nodes (9): DJ library following live, ADR-0167, ADR-0167, ADR-0167, ADR-0167, ADR-0167, ADR-0167, ADR-0167 (+1 more)

### Community 229 - "shared.spec.ts"
Cohesion: 0.25
Nodes (7): ADR-0114, browserFor(), D, fixture(), MUSIC, seed(), ADR-0094

### Community 230 - "guide.spec.ts"
Cohesion: 0.25
Nodes (5): errors, fixture(), libraryWithASong(), test, ADR-0126

### Community 231 - "ADR 0178: A DJ app's playlists stay in its DJ collection; GLUE's own go to its "GLUE" folder"
Cohesion: 0.22
Nodes (8): ADR-0178, ADR-0178, ADR-0178, 0178. A DJ app's playlists stay in its DJ collection; GLUE's own go to its "GLUE" folder, Alternatives considered, Consequences, Context, ADR 0178: A DJ app's playlists stay in its DJ collection; GLUE's own go to its "GLUE" folder

### Community 232 - "library/bpm.ts"
Cohesion: 0.31
Nodes (8): bpmInUse(), BpmRange, fmtBpm(), foldInto(), shownBpm(), bpmOf(), bpmShown(), main()

### Community 234 - "glue-interop/tests/golden.rs"
Cohesion: 0.36
Nodes (3): root(), same(), the_libraries_read_as_the_website_reads_them()

### Community 236 - "Help: Getting started"
Cohesion: 0.25
Nodes (8): Drag dock, Incoming folder (TO BE SORTED), Tour: welcome, Help: Getting started, GLUE folder, GLUE Home (optional companion app), Help: GLUE Home, GLUE in its own window

### Community 237 - "allowed()"
Cohesion: 0.36
Nodes (6): a_folder_is_looked_up_once(), allowed(), cfg_str(), resolved(), roots_for(), the_folder_a_file_is_under_comes_first()

### Community 238 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, allowImportingTsExtensions, noEmit, types, extends, include

### Community 239 - "prepare.svelte.ts"
Cohesion: 0.57
Nodes (6): anchorAt(), downbeat(), mod(), nudge(), retempo(), tapBpm()

### Community 240 - "ADR 0100: One row per song, its best copy; a computer removes only its own copies"
Cohesion: 0.25
Nodes (8): ADR-0111, ADR-0111, ADR-0100, ADR-0100, ADR-0100, ADR-0100, ADR 0100: One row per song, its best copy; a computer removes only its own copies, ADR 0111: Removing a music folder removes its songs; songs left with no file are offered once

### Community 241 - "0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it"
Cohesion: 0.25
Nodes (7): ADR-0142, ADR-0142, 0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it, Alternatives considered, Consequences, Context, ADR 0142: A row on screen always gets what it asked for: held by its song's id, and asked again when

### Community 242 - "EditInfo.svelte"
Cohesion: 0.32
Nodes (7): changed, close(), focus(), lists, save(), suggest(), values

### Community 243 - "dupeGroups.golden.test.ts"
Cohesion: 0.43
Nodes (7): graded(), input(), lossless(), lossy(), m(), OUT, song()

### Community 244 - "Vision"
Cohesion: 0.25
Nodes (6): ADR 0010: Import/export before write-back, ADR 0011 (live export file), Vision, Speklone, Browser capabilities research, File System Access API, Chromium only

### Community 249 - "turn.ts"
Cohesion: 0.40
Nodes (5): Ice, TURN_TTL, TurnEnv, turnServers(), usable()

### Community 251 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 252 - "glue-engine"
Cohesion: 0.53
Nodes (6): glue-audio, glue-engine, glue-home, glue-interop, glue-rtc, glue-store

### Community 253 - "Help: The library and its views"
Cohesion: 0.33
Nodes (6): Help: Duplicates and the best copy, Duplicate detection and deduplication, Help: The library and its views, Library and collections, Help: No file linked, No file linked

### Community 254 - "Pri"
Cohesion: 0.40
Nodes (4): Paced, Pri, Analysis, Play

### Community 255 - "free_glue_folder()"
Cohesion: 0.50
Nodes (4): folder_look(), folder_state(), free_glue_folder(), new_glue_folder()

### Community 257 - "0138. What the user asks for goes first: background requests gated, playing ahead of the analysis, songs read whole"
Cohesion: 0.40
Nodes (4): 0138. What the user asks for goes first: background requests gated, playing ahead of the analysis, songs read whole, Alternatives considered, Consequences, Context

### Community 258 - "0145. Judge "the same name" one way, in `core/library/names.ts`"
Cohesion: 0.40
Nodes (4): 0145. Judge "the same name" one way, in `core/library/names.ts`, Alternatives considered, Consequences, Context

### Community 259 - "0164. GLUE Home matches the duplicates' fingerprints"
Cohesion: 0.40
Nodes (4): 0164. GLUE Home matches the duplicates' fingerprints, Alternatives considered, Consequences, Context

### Community 261 - "StreamReply"
Cohesion: 0.50
Nodes (3): StreamReply, HomeChannel, Link

### Community 262 - "Prepare tab"
Cohesion: 0.50
Nodes (4): Help: Prepare, Prepare tab, Help: A song's page, Song page and details

### Community 264 - "Help: Devices, accounts and profiles"
Cohesion: 0.67
Nodes (3): Artist profiles (aliases), Help: Devices, accounts and profiles, Multi-device sync

### Community 265 - "Help: Adding music"
Cohesion: 0.67
Nodes (3): tour: adding-music, Help: Adding music, TO BE SORTED: incoming folder for sent songs

## Knowledge Gaps
- **1049 isolated node(s):** `Conn`, `MockHome`, `StreamCtrl`, `KeepInput`, `Spec` (+1044 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1935 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **68 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ADR 0141: Songs played get their own port, and a file read looks up only its own folder` connect `platform/homeDisk.ts` to `Player`, `engine.svelte.ts`, `ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put`, `remoteFiles.svelte.ts`, `main.rs`, `local.rs`, `themes.svelte.ts`?**
  _High betweenness centrality (0.296) - this node is a cross-community bridge._
- **Why does `GLUE vault index and structure` connect `GLUE vault index and structure` to `homedisk.test.ts`, `0138. What the user asks for goes first: background requests gated, playing ahead of the analysis, songs read whole`, `0145. Judge "the same name" one way, in `core/library/names.ts``, `fakeHome.ts`, `ADR 0151: GLUE opens in GLUE Home's own window, showing the live site`, `golden.test.ts`, `0164. GLUE Home matches the duplicates' fingerprints`, `ADR 0165: GLUE Home makes the duplicate groups and points playlists at the best copies`, `platform/homeDisk.ts`, `homeLink.ts`, `ADR 0094: One shared collection in GLUE Cloud, the same on every device`, `remoteFiles.svelte.ts`, `importActions.ts`, `ADR 0135: Analysis around network folders: their songs take turns, GLUE Home reads tags in batches, `, `ADR 0146: Keep the library's methods in parts by concern, behind the same `lib``, `Player`, `events.svelte.ts`, `GLUE Cloud: accounts, GLUE Home and devices`, `ADR 0159: GLUE Home's first run, a GLUE folder always offered, and its window signed in by GLUE Home`, `ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address`, `ADR 0071: Song info is edited in GLUE and written into the music files by GLUE Home`, `0128. Build the code map on GitHub for every push, and use it by fixed rules`, `homemode.spec.ts`, `dupes.svelte.ts`, `covers.svelte.ts`, `waterfall.ts`, `ADR 0154: The analysis queue in GLUE Home's engine, in Rust`, `ADR 0153: GLUE Home's library engine in Rust, tested end to end against the real one`, `ADR 0067: One context menu for the library page: right-click (or ⋯) on anything there`, `CollectionStore`, `ADR 0108: One id per computer: GLUE Home learns it, only the computer's GLUE folder writes its parts`, `ADR 0177: Opening the library or a collection shows its progress, and waits less`, `ADR 0175: Back from the background, the room and the sessions are made again at once`, `ADR 0030: DJ libraries are detected in folders the user has allowed`, `ADR 0182: Engine DJ's playlists written as Engine DJ writes them: its Collection, then each drive's `, `GLUE: how it works now`, `0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer`, `ADR 0179: Engine DJ's own playlists, and its songs' info, edited from GLUE`, `ADR 0136: Analysis limits are the user's to set, with the speed shown and a suggestion from it`, `admin.ts`, `ADR 0052: A Prepare tab: waveform, beat grid, metronome and the user's corrections`, `ADR 0106: Keep the shared collection in GLUE Cloud as a snapshot and a log of changes`, `ADR 0178: A DJ app's playlists stay in its DJ collection; GLUE's own go to its "GLUE" folder`, `ADR 0060: Read, parse and decode audio in the worker (mediabunny + WebCodecs)`, `make-audio.ts`, `Quality forensics`, `ADR 0133: A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what`, `ADR 0100: One row per song, its best copy; a computer removes only its own copies`, `ADR 0046: GLUE Home keeps and shares the analyses; TO BE SORTED lists its incoming folder`, `0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it`, `Vision`, `ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put`, `ADR 0147: GLUE Home analyses natively, in Rust`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Why does `ADR 0122: GLUE Home's Stop stops everything; a dropped folder is found by GLUE Home at once` connect `ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address` to `GLUE vault index and structure`, `ui/engine.ts`, `local.rs`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Are the 54 inferred relationships involving `text()` (e.g. with `.answer()` and `.background_todo()`) actually correct?**
  _`text()` has 54 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Conn`, `MockHome`, `StreamCtrl` to the rest of the system?**
  _1049 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `glue-engine/src/sync.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05502248875562219 - nodes in this community are weakly interconnected._
- **Should `queue.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06282051282051282 - nodes in this community are weakly interconnected._