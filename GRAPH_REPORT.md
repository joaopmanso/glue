# Graph Report - glue  (2026-10-14)

## Corpus Check
- 895 files · ~772,191 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 7690 nodes · 19550 edges · 304 communities (238 shown, 66 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 765 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- view.svelte.ts
- App.svelte
- core/types.ts
- queue.rs
- glue-engine/src/sync.rs
- edits.ts
- writePref()
- merge.ts
- Host
- main.rs
- enginedb.rs
- covers.rs
- glue-engine/src/dupes.rs
- glue-interop/src/sync.rs
- vitest
- dj.rs
- collection.ts
- parse.rs
- GLUE Vault
- library.svelte.ts
- App
- shared.svelte.ts
- folders.ts
- parse.ts
- stems.svelte.ts
- Engine<H>
- platform/index.ts
- Store<D>
- tests/engine.rs
- events.svelte.ts
- ADR 0094: One shared collection in GLUE Cloud, the same on every device
- lib/analysis.ts
- DuplicatesView.svelte
- GLUE Cloud: accounts, GLUE Home and devices
- glue-interop/src/types.rs
- api.ts
- shared.ts
- dupes.svelte.ts
- store/types.ts
- ADR 0108: One id per computer: GLUE Home learns it, only the computer's GLUE folder writes its parts
- djLibraries.ts
- read_json()
- .answer()
- store.golden.test.ts
- library.rs
- ref_node_fs
- remoteFiles.svelte.ts
- Store
- local.rs
- tests/room.rs
- shared/engine.ts
- rtc.rs
- crypto.ts
- H
- fingerprint.ts
- glue-engine/src/tags.rs
- merge.rs
- .serve()
- protocol.rs
- ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address
- Disk
- localHome.svelte.ts
- Engine<H>
- sendToHome.svelte.ts
- Track
- player
- .song()
- guide.test.ts
- library.spec.ts
- signal.ts
- verdict.rs
- src/room.rs
- Welcome.svelte
- parse_engine_db()
- bundle
- flac.ts
- remoteFiles
- ADR 0071: Song info is edited in GLUE and written into the music files by GLUE Home
- tests/answers.rs
- serde_json
- fakeHome.ts
- analyze.rs
- files.rs
- glue-audio/src/types.rs
- text()
- account
- ADR 0180: GLUE's own playlists kept in Engine DJ's "GLUE" folder, both ways
- ADR 0175: Back from the background, the room and the sessions are made again at once
- disk.rs
- users
- interop/types.ts
- engineClient
- project.rs
- Quality forensics
- shared
- admin.ts
- ADR 0046: GLUE Home keeps and shares the analyses; TO BE SORTED lists its incoming folder
- dsd.rs
- ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put
- guide
- enginePerf.ts
- relink.ts
- lib/perf.ts
- interop.golden.test.ts
- flac.rs
- verify.rs
- Pv
- ADR 0063: DJ libraries are browsed live; playlists come into GLUE on demand and stay linked
- ADR 0068: A full player: a queue, an open view with the visualiser, the sound output; drivers throug
- queue.ts
- analyse()
- Engine
- ws.rs
- ADR 0030: DJ libraries are detected in folders the user has allowed
- engine.svelte.ts
- 0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer
- js.rs
- djsync.rs
- parse_serato_database()
- tidy.rs
- bridge.ts
- onScreen.test.ts
- GuideLayer.svelte
- Stem separation
- package.json
- glue-rtc/src/lib.rs
- xml.rs
- ADR 0165: GLUE Home makes the duplicate groups and points playlists at the best copies
- ADR 0182: Engine DJ's playlists written as Engine DJ writes them: its Collection, then each drive's 
- nowPlaying
- HomeStore
- Player
- signal.rs
- ADR 0081: Relay connections that can't be direct through Cloudflare's TURN, with the owner's key
- js_keys()
- imports.ts
- waterfall3d.ts
- make-audio.ts
- covers.golden.test.ts
- prepare.test.ts
- duplicates.ts
- anywhere.svelte.ts
- DevicesSection.svelte
- RelinkView.svelte
- decode.rs
- backup.rs
- src-tauri/src/dupes.rs
- platform/homeDisk.ts
- ADR 0133: A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what
- .takeDerived()
- fingerprint.rs
- ref_node_url
- graph_docs.py
- covers.svelte.ts
- prepare
- HomeDir
- ADR 0135: Analysis around network folders: their songs take turns, GLUE Home reads tags in batches, 
- smoke-local.ts
- merge3.rs
- ADR 0146: Keep the library's methods in parts by concern, behind the same `lib`
- lossy-fixtures.mjs
- homeBundle.test.ts
- glue-audio/tests/golden.rs
- repair.rs
- FakeHome
- rtc-probe.mjs
- compilerOptions
- importActions.ts
- ADR 0076: Songs stream by byte range: the local link in Home mode, a service worker for other comput
- djinfo.rs
- homemode.spec.ts
- perf.spec.ts
- SharedCloudServer
- src-tauri/src/tags.rs
- relink.svelte.ts
- merge3.ts
- thumbs
- ADR 0096: Move merged collections into the shared one, one computer at a time
- homeApp.ts
- HomeDisk
- sync.golden.test.ts
- summary.rs
- IceCache
- traktor.rs
- dependencies
- interop.test.ts
- web.rs
- ADR 0154: The analysis queue in GLUE Home's engine, in Rust
- glue-audio.rs
- .computers_here()
- ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust
- ADR 0155: GLUE Home syncs the shared collections in Rust, held to the website's sync
- ADR 0179: Engine DJ's own playlists, and its songs' info, edited from GLUE
- capture.ts
- activity.rs
- ADR 0177: Opening the library or a collection shows its progress, and waits less
- devDependencies
- import_golden.rs
- rekordbox.rs
- fs
- ADR 0052: A Prepare tab: waveform, beat grid, metronome and the user's corrections
- ADR 0170: Engine DJ kept in step both ways: cues, loops and the beat grid
- columns
- drag
- incoming
- cloud/package.json
- lossy.rs
- lossy_golden.rs
- ADR 0086: GLUE Home looks up missing covers on public services
- ADR 0136: Analysis limits are the user's to set, with the speed shown and a suggestion from it
- ui/engine.ts
- scripts
- serato.ts
- HomeFile
- control.rs
- ADR 0106: Keep the shared collection in GLUE Cloud as a snapshot and a log of changes
- jsmath.rs
- dupes_golden.rs
- shared.spec.ts
- guide.spec.ts
- graph.mjs
- ADR 0171: Engine DJ's playlists kept in step both ways
- super
- FakeSocket
- glue-interop/tests/golden.rs
- Handler<H>
- 0149. GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failures once
- Help: Getting started
- dock.ts
- tsconfig.test.json
- homeAnalysis
- EditInfo.svelte
- dupeGroups.golden.test.ts
- Vision
- PageSocket
- .recheck_verdicts()
- 0183. Keep Engine DJ's folders as Engine DJ keeps them
- updates.ts
- sidebar
- tabs
- SharedCloud
- turn.ts
- Known
- default.json
- glue-engine
- 0130. The same file on two computers is one song, with a copy on each
- Help: The library and its views
- 0140. A song played pauses the analysis's reads, not only its new songs
- 0148. GLUE Home's queue hands each song to the native engine
- Kind
- Pri
- 0159. GLUE Home's first run, a GLUE folder always offered, and its window signed in by GLUE Home
- 0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it
- 0145. Judge "the same name" one way, in `core/library/names.ts`
- sorted()
- m3u.rs
- jsmath.mjs
- Prepare tab
- 0172. Engine DJ: the playlists' order in step, and songs pointed at the copy kept
- Help article: DJ libraries
- Help: Devices, accounts and profiles
- Help: Adding music
- Tour: analyze
- Tour: calendar
- Help: Backups and restoring
- Help: gluey
- Help: themes
- deleteCollection()
- Deploy GLUE Cloud workflow
- Follow threejs-visualisers workflow
- Unified DJ library import
- GLUE Home build workflow
- GLUE Home release notes (installers, unsigned)
- GLUE Home settings page
- Tour: DJ libraries
- Tour: Playlists
- Help: Playlists, tags and the builder
- Quality help article
- Pool: background analysis worker orchestration
- Local home platform
- Interop test notes
- Library class

## God Nodes (most connected - your core abstractions)
1. `GLUE Vault` - 157 edges
2. `Track` - 115 edges
3. `vitest` - 66 edges
4. `text()` - 64 edges
5. `CollectionStore` - 61 edges
6. `handle()` - 54 edges
7. `account` - 47 edges
8. `writePref()` - 44 edges
9. `GLUE Cloud: accounts, GLUE Home and devices` - 43 edges
10. `Product roadmap` - 40 edges

## Surprising Connections (you probably didn't know these)
- `Context` --references--> `CollectionStore`  [INFERRED]
  vault/adr/0152-the-library-store-in-rust.md → src/store/collection.ts
- `Consequences` --references--> `absorbTracks()`  [INFERRED]
  vault/adr/0152-the-library-store-in-rust.md → src/store/merge.ts
- `Consequences` --references--> `applyImport()`  [INFERRED]
  vault/adr/0167-dj-libraries-in-glue-home.md → src/store/merge.ts
- `Context` --references--> `applyImport()`  [INFERRED]
  vault/adr/0167-dj-libraries-in-glue-home.md → src/store/merge.ts
- `Context` --references--> `applyScan()`  [INFERRED]
  vault/adr/0130-same-file-on-two-computers-is-one-song.md → src/store/merge.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Stored analysis evolution** — vault_adr_0019_background_analysis_decoding_decision, vault_adr_0023_store_track_page_analysis_decision, vault_adr_0024_background_stores_full_analysis_decision [EXTRACTED 0.75]
- **GLUE Home engine and dropped files decisions** — vault_adr_0122_stop_stops_everything_dropped_folders_found_decision, vault_adr_0123_music_folders_that_come_and_go_decision, vault_adr_0125_dropped_songs_placed_by_glue_home_decision [EXTRACTED 0.85]
- **Client-side stem separation pipeline** — vault_adr_0003_client_side_stems_webgpu, vault_adr_0004_float64_model_patch, vault_adr_0005_model_from_huggingface [EXTRACTED 0.90]
- **Analysis flow: concurrency -> speed tracking -> suggestion** — network_folder_concurrency, speed_suggestion_algorithm [EXTRACTED 1.00]
- **Analysis flow: Queue, native engine, and storage** — analysis_queue_rust [EXTRACTED 1.00]
- **Analysis storage lifecycle: background summary then track page full storage** — vault_adr_0019_background_analysis_decoding_decision, vault_adr_0023_store_track_page_analysis_decision, track_page_analysis_storage_concept [EXTRACTED 1.00]
- **TypeScript and Rust sync held to parity by golden tests** — golden_tests_concept [EXTRACTED 1.00]
- **Rust engine migration: store (E1) then engine (E2)** — vault_adr_0152_the_library_store_in_rust_decision, vault_adr_0153_the_library_engine_in_rust_decision [EXTRACTED 1.00]
- **Opening progress tracking flow** — vault_adr_0177_opening_shows_its_progress_decision, opening_progress_tracking_mechanism, lib_loading_state_concept, src_ui_library_opening [EXTRACTED 1.00]
- **Phone streaming from GLUE Home** — src_help_phone_app_feature [EXTRACTED 1.00]
- **Player bar and queue UI system** — full_player_bar_ui, queue_system, visualiser_feature [EXTRACTED 1.00]
- **Library refactoring for tokenization** — vault_adr_0146_the_library_in_parts_by_concern_decision, src_lib_library_svelte, vault_adr_0146_glue_folder_part, vault_adr_0146_profiles_part, vault_adr_0146_collections_part [EXTRACTED 1.00]
- **Window display in GLUE Home** — glue_window_native_mechanism, window_storage_mechanism, home_mode_in_window_mechanism [EXTRACTED 1.00]
- **ADR 0175 implementation through GLUE systems** — vault_adr_0175_back_from_the_background_connected_at_once_decision [INFERRED 0.85]
- **Cloud sync lineage** — vault_adr_0036_optional_accounts_and_cloud_signaling_decision, vault_adr_0040_cloud_sync_and_merged_collections_decision, vault_adr_0042_merged_collection_in_the_local_library_decision, vault_adr_0043_batched_sync_and_progressive_loading_decision [INFERRED 0.85]
- **Direct link reliability under load** — remote_session_concept [INFERRED 0.85]
- **DJ library importers** — vault_features_import_rekordbox_feature, vault_features_import_engine_feature, vault_features_import_traktor_feature, vault_features_import_serato_feature, vault_features_import_apple_icloud_feature [INFERRED 0.85]
- **Duplicates matching and grouping pipeline** — vault_adr_0164_glue_home_matches_the_duplicates_decision, vault_adr_0165_glue_home_makes_the_duplicate_groups_decision, duplicate_fingerprint_matching, duplicate_group_building [INFERRED 0.85]
- **Engine DJ playlist synchronization evolution** — vault_adr_0171_engine_dj_playlists_kept_in_step_decision, vault_adr_0178_dj_playlists_stay_in_the_dj_collection_decision, vault_adr_0179_engine_dj_edited_in_the_dj_collection_decision, vault_adr_0180_glues_playlists_in_engine_djs_glue_folder_decision, vault_adr_0183_engine_dj_folders_kept_as_engine_dj_keeps_them_decision, vault_adr_0184_engine_dj_folder_repair_turned_off_decision [INFERRED 0.85]
- **Engine DJ write-back implementation flow** — engine_dj_database_structure, engine_dj_performance_data_encoding [INFERRED 0.85]
- **GLUE Home as engine decisions** — vault_adr_0103_glue_home_analyses_its_computers_songs_decision, vault_adr_0104_glue_home_is_the_librarys_engine_decision, vault_adr_0108_one_id_per_computer_decision, vault_adr_0110_screen_takes_glue_homes_analyses_decision, vault_adr_0115_any_browser_takes_glue_homes_link_decision [INFERRED 0.85]
- **Streaming songs to other devices through GLUE Home** — rtcpeerconnection_concept, vault_adr_0132_connections_to_glue_home_are_bounded_decision [INFERRED 0.85]
- **Phone streaming and reconnection workflow** — src_help_phone_article [INFERRED 0.85]
- **Quality forensics verdict rules evolution** — vault_features_quality_forensics_feature, vault_adr_0033_tolerate_gentle_roll_offs_decision, vault_adr_0034_quiet_content_above_the_fade_decision, vault_adr_0069_content_beyond_a_wall_decision, vault_adr_0075_drop_outs_under_a_wall_decision [INFERRED 0.85]
- **Shared collection and account sync decisions** — vault_adr_0096_move_merged_collections_into_the_shared_one_decision, vault_adr_0097_glue_home_syncs_shared_collections_decision, vault_adr_0101_cloud_sync_is_the_accounts_collections_decision, vault_adr_0106_shared_collection_as_a_snapshot_and_a_log_decision, vault_adr_0107_sync_looks_only_at_what_changed_decision, vault_adr_0112_the_accounts_collections_decision [INFERRED 0.85]
- **Tags system definition and behavior** — vault_features_tags_feature, vault_adr_0032_tags_decision, vault_adr_0067_one_context_menu_decision [INFERRED 0.85]
- **Network folder analysis optimization** — unified_progress_count_concept, network_folder_song_queuing_mechanism, tag_batch_reading_mechanism [INFERRED 0.95]
- **Playback performance: separate port and folder-scoped lookups** — play_port_mechanism, folder_lookup_optimization_mechanism [INFERRED 0.95]

## Communities (304 total, 66 thin omitted)

### Community 0 - "view.svelte.ts"
Cohesion: 0.03
Nodes (102): KeyNotation, Facet, djEntries(), djEntryOf(), glueSong(), asShown(), djAdd(), absolutePath() (+94 more)

### Community 1 - "App.svelte"
Cohesion: 0.04
Nodes (66): dropIntoLibrary(), hasFiles(), needing, onDrop(), beatsBetween(), fmtDb(), fmtKHz(), fmtTime() (+58 more)

### Community 2 - "core/types.ts"
Cohesion: 0.04
Nodes (104): ADR-0006, analyzeMusic(), analyzeSamples(), computeSpectrum(), decimate(), FrameReader, makePcmReader(), monoOf() (+96 more)

### Community 3 - "queue.rs"
Cohesion: 0.06
Nodes (42): truthy(), after_analysis(), ANALYSIS_VERSION, at(), cores(), differ(), Engine<H>, failed_before() (+34 more)

### Community 4 - "glue-engine/src/sync.rs"
Cohesion: 0.07
Nodes (43): Engine<H>, HttpCloud<'_, H>, own_devices(), send_counts(), agreed_dir(), apply_change(), base(), checkpoint() (+35 more)

### Community 5 - "edits.ts"
Cohesion: 0.04
Nodes (70): ADR-0029, camelotNum(), fifthsPos(), harmonicNeighbours(), keyAt(), keyLabel(), MAJOR_NAMES, MINOR_NAMES (+62 more)

### Community 6 - "writePref()"
Cohesion: 0.03
Nodes (53): GLUE website entry page, svelte, threejs-visualisers, AppState, ColDef, ColKey, DEFAULT_HIDDEN, DEFAULT_ORDER (+45 more)

### Community 7 - "merge.ts"
Cohesion: 0.05
Nodes (68): baseName(), normPath(), FileEntry, Linkable, matchTracks(), segs(), ADR-0020, ADR-0090 (+60 more)

### Community 8 - "Host"
Cohesion: 0.07
Nodes (9): changed_over(), command(), Engine<H>, get(), Host, iso(), Job, key() (+1 more)

### Community 9 - "main.rs"
Cohesion: 0.05
Nodes (53): list(), move_to(), moves_without_overwriting(), safe_name(), with_number(), a_folder_is_looked_up_once(), activity_now(), allowed() (+45 more)

### Community 10 - "enginedb.rs"
Cohesion: 0.07
Nodes (47): ancestors(), depth(), Engine<H>, holds(), insert_with_id(), l(), tree_at(), uuid_of() (+39 more)

### Community 11 - "covers.rs"
Cohesion: 0.05
Nodes (40): ART_SIZE, ARTISTS, enc(), Engine<H>, GAP, js_len(), kept_at(), lookup_key() (+32 more)

### Community 12 - "glue-engine/src/dupes.rs"
Cohesion: 0.07
Nodes (54): a_fingerprint_reads_as_the_website_writes_it(), ber(), best_lists(), build_groups(), certainty(), concerns(), confirm(), copy_score() (+46 more)

### Community 13 - "glue-interop/src/sync.rs"
Cohesion: 0.08
Nodes (52): a_grid_written_reads_back_the_same(), argb(), beat_data(), encode_grid(), encode_hot(), encode_loops(), Hot, hot_slots() (+44 more)

### Community 14 - "vitest"
Cohesion: 0.07
Nodes (32): vitest, readJSON(), writeJSON(), asDir(), MemDir, MemFile, Node, notFound() (+24 more)

### Community 15 - "dj.rs"
Cohesion: 0.05
Nodes (25): analyse_into(), key(), now_iso(), on_own_thread(), read_whole(), time_for(), wave_of(), APPS (+17 more)

### Community 16 - "collection.ts"
Cohesion: 0.07
Nodes (58): Outdated store check before write, GroupInput, adopt(), Adopted, empty(), freeId(), listPath(), OwnParts (+50 more)

### Community 17 - "parse.rs"
Cohesion: 0.09
Nodes (42): CLUES, patterns(), scan_clues(), AAC_SR, add_tag(), apply_stream_info(), Bytes, Bytes<'a> (+34 more)

### Community 18 - "GLUE Vault"
Cohesion: 0.05
Nodes (59): ADR-0026, ADR-0028, ADR-0058, GLUE folder setup on first run, ADR-0059, ADR-0058, ADR-0058, ADR-0059 (+51 more)

### Community 19 - "library.svelte.ts"
Cohesion: 0.04
Nodes (33): FacetItem, facetItems(), facetKey(), FACETS, facetValue(), inFacet(), sortFacet(), T (+25 more)

### Community 20 - "App"
Cohesion: 0.07
Nodes (26): changed(), clear(), current(), DOCK, dock_add(), dock_clear(), dock_items(), dock_remove() (+18 more)

### Community 21 - "shared.svelte.ts"
Cohesion: 0.07
Nodes (50): Counts, countsOf(), holdsMusic(), sendCounts(), crc32(), CRC_TABLE, createZip(), dec (+42 more)

### Community 22 - "folders.ts"
Cohesion: 0.05
Nodes (49): afterAnalysis(), analysed, analysisState, gaveUp(), isTransient(), needsAnalysis(), Entries, findFile() (+41 more)

### Community 23 - "parse.ts"
Cohesion: 0.08
Nodes (52): pick(), KeepInput, keepRange(), CLUES, scanClues(), AAC_SR, addTag(), blankInfo() (+44 more)

### Community 24 - "stems.svelte.ts"
Cohesion: 0.06
Nodes (41): ADR-0003, ADR-0004, fmtEta(), encodeWav(), LEGACY_MODEL_CACHE, MODEL_CACHE, MODEL_FILE, MODEL_SIZE (+33 more)

### Community 25 - "Engine<H>"
Cohesion: 0.07
Nodes (20): at(), day_key(), days_until(), ev(), message(), needs_music(), needs_music_as_the_website_says(), parse_local() (+12 more)

### Community 26 - "platform/index.ts"
Cohesion: 0.06
Nodes (49): ADR-0007, cleanUp(), cleanUpPlan(), idbDel(), idbGet(), idbSet(), tx(), addLibraryPlace() (+41 more)

### Community 27 - "Store<D>"
Cohesion: 0.11
Nodes (15): truthy(), BinEntry, get(), id_of(), LoadOpts, migrate(), num(), OUTDATED (+7 more)

### Community 28 - "tests/engine.rs"
Cohesion: 0.10
Nodes (36): a_collection_deleted_from_the_account_is_backed_up_and_put_away(), a_collection_is_tidied_when_it_opens(), a_job_removes_songs_and_their_copies(), a_shared_collection_is_put_right_once_with_a_backup(), a_song_that_cant_go_to_engine_dj_stays_in_glues_playlist_and_says_why(), an_analysis_running_while_its_tags_are_written_takes_the_new_date(), an_edit_is_saved_and_told(), C (+28 more)

### Community 29 - "events.svelte.ts"
Cohesion: 0.07
Nodes (35): blankEvent(), daysUntil(), eventDay(), EventStatus, folderName(), GlueEvent, isPast(), LineupEntry (+27 more)

### Community 30 - "ADR 0094: One shared collection in GLUE Cloud, the same on every device"
Cohesion: 0.04
Nodes (51): Clash merge with changed_over, ADR-0094, ADR-0094, ADR-0040, ADR-0089, ADR-0087, ADR-0077, ADR-0094 (+43 more)

### Community 31 - "lib/analysis.ts"
Cohesion: 0.06
Nodes (43): ADR-0060, ADR-0147, ADR-0060, Waveform, ADR-0060, ADR-0019, analysisWorker(), analyze() (+35 more)

### Community 32 - "DuplicatesView.svelte"
Cohesion: 0.05
Nodes (43): fmtBytes(), bpmInUse(), BpmRange, fmtBpm(), foldInto(), shownBpm(), ADR-0052, bpmOf() (+35 more)

### Community 33 - "GLUE Cloud: accounts, GLUE Home and devices"
Cohesion: 0.04
Nodes (46): ADR-0027, ADR-0074, ADR-0054, ADR-0056, ADR-0061, ADR-0074, home/src-tauri, ADR-0074 (+38 more)

### Community 34 - "glue-interop/src/types.rs"
Cohesion: 0.08
Nodes (27): parse_library_files(), parse_m3u(), array_index(), blank_track(), collate(), CuePoint, decode_uri_component(), EngineSet (+19 more)

### Community 35 - "api.ts"
Cohesion: 0.15
Nodes (39): ACCESS_TTL, attach(), authed(), bad(), browserSession(), claim(), CODE_TTL, computerOf() (+31 more)

### Community 36 - "shared.ts"
Cohesion: 0.08
Nodes (46): MAX_BUNDLE, MAX_BUNDLE_PATHS, MAX_BYTES, MAX_FILE, SyncError, Alias, color(), create() (+38 more)

### Community 37 - "dupes.svelte.ts"
Cohesion: 0.09
Nodes (27): DupGroup, Match, record(), time(), timeAsync(), jobOf(), dupes, Saved (+19 more)

### Community 38 - "store/types.ts"
Cohesion: 0.05
Nodes (37): djValues, listsByTrack(), ListEntry, listTree, describeRemoval(), orphans(), removalImpact, ADR-0111 (+29 more)

### Community 39 - "ADR 0108: One id per computer: GLUE Home learns it, only the computer's GLUE folder writes its parts"
Cohesion: 0.05
Nodes (45): ADR-0108, ADR-0112, ADR-0113, ADR-0113, ADR-0108, ADR-0112, ADR-0018, ADR-0108 (+37 more)

### Community 40 - "djLibraries.ts"
Cohesion: 0.05
Nodes (36): ADR-0162, engineClient.runs check, Detected, Entries, findLibraries(), head(), libraryAt(), ADR-0030 (+28 more)

### Community 41 - "read_json()"
Cohesion: 0.12
Nodes (10): Dir, FsDir, MemDir, read_json(), ReadError, Damaged, Io, temp_for() (+2 more)

### Community 42 - ".answer()"
Cohesion: 0.12
Nodes (12): Answer, Data, Background, data(), Devices, Engine<H>, HEX, ids() (+4 more)

### Community 43 - "store.golden.test.ts"
Cohesion: 0.05
Nodes (42): ADR-0152, StoreOp, common(), copy(), damaged, engineImport, engineLib(), fold (+34 more)

### Community 44 - "library.rs"
Cohesion: 0.12
Nodes (15): away(), Engine<H>, exists(), HEX, INCOMING_ROOT, is_away(), join(), newly_found() (+7 more)

### Community 45 - "ref_node_fs"
Cohesion: 0.11
Nodes (22): test, test, test, texts(), launch(), OFF, Opts, test (+14 more)

### Community 46 - "remoteFiles.svelte.ts"
Cohesion: 0.08
Nodes (35): Conn, MockHome, putKeys(), rtc(), sendFile(), serve(), tell(), safe() (+27 more)

### Community 47 - "Store"
Cohesion: 0.16
Nodes (22): arr(), copies(), get(), glue_path(), GONE_AFTER, import_lists(), Importer, Importer<'_, D> (+14 more)

### Community 48 - "local.rs"
Cohesion: 0.09
Nodes (26): an_analysis_read_waits_while_a_song_plays_then_goes_on(), answer(), busy_for_test(), BUSY_UNTIL, decode(), EDITS, FOREGROUND_AT, handle() (+18 more)

### Community 49 - "tests/room.rs"
Cohesion: 0.11
Nodes (14): a_silent_room_is_connected_again(), a_start_overtaken_by_stop_says_nothing(), Calls, FakePeers, full_refused_and_the_same_tab_replaces_its_own(), H, offer(), online_offers_answered_and_candidates_relayed_both_ways() (+6 more)

### Community 50 - "shared/engine.ts"
Cohesion: 0.12
Nodes (33): hex(), Clash, agreedDir(), applyChange(), base(), checkpoint(), diffFile(), DIRS (+25 more)

### Community 51 - "rtc.rs"
Cohesion: 0.09
Nodes (8): File, answer(), App, Conns, new(), Playing, RECEIVING, SERVING

### Community 52 - "crypto.ts"
Cohesion: 0.08
Nodes (36): ADR-0091, Deps, ADR-0036, ADR-0091, b64url(), enc, GoogleClaims, googleKeys() (+28 more)

### Community 53 - "H"
Cohesion: 0.11
Nodes (6): call(), H, main(), PagePeers, say(), State

### Community 54 - "fingerprint.ts"
Cohesion: 0.07
Nodes (32): Duplicate fingerprint matching, ber(), FP_FRAME_SEC, FP_HOP, FP_N, FP_RATE, FP_SECONDS, popcount() (+24 more)

### Community 55 - "glue-engine/src/tags.rs"
Cohesion: 0.09
Nodes (17): Cover, cover_of(), from_image(), jpeg(), LARGE, picture(), picture_from(), SMALL (+9 more)

### Community 56 - "merge.rs"
Cohesion: 0.12
Nodes (22): apply_import(), blank_lib_track(), carried_engine(), CuePoint, fill_info(), has_file(), ImportedLibrary, ImportedTrack (+14 more)

### Community 57 - ".serve()"
Cohesion: 0.16
Nodes (7): Chan, Host, now_ms(), put_keys(), Server<H>, Song, unframe()

### Community 58 - "protocol.rs"
Cohesion: 0.09
Nodes (7): a_device_asks_and_sends(), Client, H, Mem, next_text(), Sink, the_relays_servers_are_taken()

### Community 59 - "ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address"
Cohesion: 0.05
Nodes (36): Away music folder, ADR-0051, ADR-0125, GLUE Home Stop semantics, ADR-0103, ADR-0103, ADR-0109, ADR-0051 (+28 more)

### Community 60 - "Disk"
Cohesion: 0.10
Nodes (7): Disk, Fwd, main(), Probe, Arriving, ReadSeek, T

### Community 61 - "localHome.svelte.ts"
Cohesion: 0.10
Nodes (21): attachHere(), ADR-0091, ADR-0108, homeOs, connect(), discover(), hello(), homeSocket (+13 more)

### Community 62 - "Engine<H>"
Cohesion: 0.14
Nodes (5): Engine<H>, now(), room_loop(), max_of(), session_key()

### Community 63 - "sendToHome.svelte.ts"
Cohesion: 0.08
Nodes (28): ADR-0132, ADR-0044, RTCPeerConnection, iceCache(), TurnReply, candidateType(), Ctrl, Handshake (+20 more)

### Community 64 - "Track"
Cohesion: 0.14
Nodes (4): covers, dock, Row, Track

### Community 65 - "player"
Cohesion: 0.10
Nodes (6): Grid, metronome, ADR-0052, mediaError(), player, refusal()

### Community 66 - ".song()"
Cohesion: 0.14
Nodes (10): Engine<H>, kbps(), origin(), parent_id(), real_path(), repoint(), Songs, Songs<'a> (+2 more)

### Community 67 - "guide.test.ts"
Cohesion: 0.09
Nodes (29): ADR-0126, ADR-0126, ADR-0126, Article, esc(), inline(), parseArticle(), renderMarkdown() (+21 more)

### Community 68 - "library.spec.ts"
Cohesion: 0.07
Nodes (27): ADR-0156, ADR-0158, ADR-0156, ADR-0158, ADR-0156, LIBRARY, ADR-0158, errors (+19 more)

### Community 69 - "signal.ts"
Cohesion: 0.10
Nodes (14): Att, ClientMsg, Env, prepare(), RoomMsg, Signal, STALE, State (+6 more)

### Community 70 - "verdict.rs"
Cohesion: 0.14
Nodes (26): article(), at(), Beyond, beyond_wall(), classify(), detect_cutoff(), expected_cutoff(), expected_table() (+18 more)

### Community 71 - "src/room.rs"
Cohesion: 0.08
Nodes (12): API, enc(), Peers, Received, Closed, Nothing, Text, Room (+4 more)

### Community 72 - "Welcome.svelte"
Cohesion: 0.06
Nodes (24): homePairLink(), canKeepFiles(), pickAudioFiles(), addSongs(), aliases, busy, chooseHome(), collectionName (+16 more)

### Community 73 - "parse_engine_db()"
Cohesion: 0.14
Nodes (14): Cell, Blob, Null, Num, Text, cols(), combine_engine(), combine_engine_with_tree() (+6 more)

### Community 74 - "bundle"
Cohesion: 0.06
Nodes (33): app, security, windows, build, devUrl, frontendDist, bundle, active (+25 more)

### Community 75 - "flac.ts"
Cohesion: 0.11
Nodes (23): Bits, BLOCK, decodeFlac(), fixed(), flacHeader(), FlacInfo, FlacPcm, frame() (+15 more)

### Community 76 - "remoteFiles"
Cohesion: 0.13
Nodes (6): incomingKey(), playsNatively(), typeOfName(), remoteFiles, streamsReady(), Context

### Community 77 - "ADR 0071: Song info is edited in GLUE and written into the music files by GLUE Home"
Cohesion: 0.07
Nodes (30): ADR-0023, ADR-0024, ADR-0071, ADR-0072, ADR-0082, ADR-0071, ADR-0031, ADR-0082 (+22 more)

### Community 78 - "tests/answers.rs"
Cohesion: 0.12
Nodes (12): a_songs_parts_made_when_asked_then_kept(), C, covers_looked_up_once_gently_and_refused_for_good(), data(), H, put(), Seen, setup() (+4 more)

### Community 79 - "serde_json"
Cohesion: 0.09
Nodes (5): HttpCloud, the_sync_does_what_the_website_does(), root(), run(), the_store_writes_what_the_website_writes()

### Community 80 - "fakeHome.ts"
Cohesion: 0.07
Nodes (27): ADR-0159, FakeHomeDirs, ADR-0054, ADR-0061, ADR-0070, ADR-0104, ADR-0115, ADR-0159 (+19 more)

### Community 81 - "analyze.rs"
Cohesion: 0.12
Nodes (19): analyze_music(), analyze_samples(), compute_spectrum(), decimate(), gauss(), Job, Demo, Float (+11 more)

### Community 82 - "files.rs"
Cohesion: 0.10
Nodes (20): analysed(), analysed_failed(), decode_details(), details(), DETAILS_VERSION, fingerprint_file(), format_of(), MAX_ROWS (+12 more)

### Community 83 - "glue-audio/src/types.rs"
Cohesion: 0.15
Nodes (26): AnalysisResult, AnalysisSummary, Clue, Cutoff, Depth, Expected, FileInfo, Finding (+18 more)

### Community 84 - "text()"
Cohesion: 0.21
Nodes (14): edits_show_on_the_tree(), Engine<H>, find(), insert(), items_in(), names(), OPS, order_before() (+6 more)

### Community 85 - "account"
Cohesion: 0.15
Nodes (3): account, browserName(), inWindow()

### Community 86 - "ADR 0180: GLUE's own playlists kept in Engine DJ's "GLUE" folder, both ways"
Cohesion: 0.07
Nodes (29): ADR-0178, ADR-0180, Engine DJ library synchronization, ADR-0180, ADR-0180, ADR-0180, ADR-0178, ADR-0180 (+21 more)

### Community 87 - "ADR 0175: Back from the background, the room and the sessions are made again at once"
Cohesion: 0.07
Nodes (25): ADR-0174, ADR-0175, Phone app: Browse and play from computer, Help: GLUE on your phone, ADR-0175, ADR-0175, ADR-0174, describeStart() (+17 more)

### Community 88 - "disk.rs"
Cohesion: 0.17
Nodes (15): cfg_path(), check(), colons_and_backslashes_only_matter_on_windows(), describe(), fail(), handle(), inside(), io_fail() (+7 more)

### Community 89 - "users"
Cohesion: 0.11
Nodes (22): attempts, credentials, credentials_device, devices, devices_user, identities, pairing_codes, users (+14 more)

### Community 90 - "interop/types.ts"
Cohesion: 0.20
Nodes (24): parseAppleLibrary(), plistValue(), PV, parseM3u(), parseRekordboxXml(), MAJOR, nmlPath(), parseTraktorNml() (+16 more)

### Community 92 - "project.rs"
Cohesion: 0.20
Nodes (21): analysis_here(), analysis_shared(), collection_here(), collection_shared(), COPY_FIELDS, dedup(), get(), Here (+13 more)

### Community 93 - "Quality forensics"
Cohesion: 0.09
Nodes (22): ADR-0119, ADR-0033, ADR-0033, src_ui_GlueStick, Steep top end lowpass verdict, ADR-0033, ADR 0033: Tolerate gentle top-end roll-offs; re-check stored verdicts when the rules change, ADR 0034: Count quiet content above a gentle fade (peak-hold reach) (+14 more)

### Community 94 - "shared"
Cohesion: 0.17
Nodes (7): at(), cloudFor(), holdsMusic(), ownDevices(), shared, syncShared(), waitingClashes()

### Community 95 - "admin.ts"
Cohesion: 0.11
Nodes (24): AdminError, count(), maintenance(), N, route(), sessions(), stats(), TIERS (+16 more)

### Community 96 - "ADR 0046: GLUE Home keeps and shares the analyses; TO BE SORTED lists its incoming folder"
Cohesion: 0.08
Nodes (25): ADR-0045, ADR-0047, ADR-0048, ADR-0045, ADR-0046, ADR-0085, ADR-0046, ADR-0045 (+17 more)

### Community 97 - "dsd.rs"
Cohesion: 0.16
Nodes (22): a_dsf_file_is_analysed(), a_dsf_sine_comes_out_as_that_sine_at_88_2_khz(), BYTES1, channel_bytes(), decode(), Dsd, dsf_sine(), factor() (+14 more)

### Community 98 - "ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put"
Cohesion: 0.08
Nodes (16): ADR-0139, ADR-0139, ADR-0139, ADR-0139, ADR-0139, HomeSocket, ADR-0139, Waiting (+8 more)

### Community 99 - "guide"
Cohesion: 0.14
Nodes (9): emptyGuide(), guideAdds(), GuideState, mergeGuide(), ADR-0126, tourById(), guide, readLocal() (+1 more)

### Community 100 - "enginePerf.ts"
Cohesion: 0.17
Nodes (19): ADR-0168, beatData(), colour(), hex(), loops(), performance(), quickCues(), Reader (+11 more)

### Community 101 - "relink.ts"
Cohesion: 0.18
Nodes (23): bare(), fold(), lower(), SAME_MARK, saysNothing(), songName(), spaced(), artistsOf() (+15 more)

### Community 102 - "lib/perf.ts"
Cohesion: 0.13
Nodes (14): enablePerf(), perfStats(), resetPerf(), Stat, stats, takeFrameWork(), describe(), Interaction (+6 more)

### Community 103 - "interop.golden.test.ts"
Cohesion: 0.15
Nodes (23): be64(), beats(), cases(), cat(), cp1252, crate(), enc(), engineDrive() (+15 more)

### Community 104 - "flac.rs"
Cohesion: 0.20
Nodes (13): Bits, BLOCK, decode_flac(), fixed(), flac_header(), FlacInfo, FlacPcm, frame() (+5 more)

### Community 105 - "verify.rs"
Cohesion: 0.14
Nodes (11): bit_errors(), bytes_off(), Check, Engine<H>, fresh(), HEX, near(), same() (+3 more)

### Community 106 - "Pv"
Cohesion: 0.15
Nodes (12): HEAD, parse_apple_library(), Pv, Arr, Bool, Dict, Null, Num (+4 more)

### Community 107 - "ADR 0063: DJ libraries are browsed live; playlists come into GLUE on demand and stay linked"
Cohesion: 0.08
Nodes (25): ADR-0065, ADR-0063, ADR-0065, ADR-0063, ADR-0063, ADR-0065, ADR-0063, ADR-0063 (+17 more)

### Community 108 - "ADR 0068: A full player: a queue, an open view with the visualiser, the sound output; drivers throug"
Cohesion: 0.08
Nodes (24): ADR-0067, ADR-0078, ADR-0078, ADR-0078, ADR-0078, Full player bar, Latest threejs-visualisers step, GitHub Pages deployment (+16 more)

### Community 109 - "queue.ts"
Cohesion: 0.14
Nodes (18): advance(), back(), clear(), dequeue(), EMPTY_QUEUE, enqueue(), placeLater(), prune() (+10 more)

### Community 110 - "analyse()"
Cohesion: 0.15
Nodes (9): analyse(), analyse_demo(), Analysis, ext_of(), Failure, Broken, Unsupported, file_info() (+1 more)

### Community 111 - "Engine"
Cohesion: 0.09
Nodes (5): Done, Engine, Feed, FULL_EVERY, JOBS

### Community 112 - "ws.rs"
Cohesion: 0.12
Nodes (10): a_cancelled_request_isnt_answered(), allowed(), answer(), answers_by_number_and_says_what_isnt_there(), client(), READERS, serve(), server() (+2 more)

### Community 113 - "ADR 0030: DJ libraries are detected in folders the user has allowed"
Cohesion: 0.16
Nodes (23): ADR-0049, ADR-0049, ADR-0030, ADR-0049, ADR-0020, ADR 0010: Read-only import and file export before any write-back, ADR 0011: One live rekordbox XML file serves both Rekordbox and Engine DJ, GLUE/exports/rekordbox.xml (+15 more)

### Community 114 - "engine.svelte.ts"
Cohesion: 0.13
Nodes (15): AnyFile, Dir, DjState, djWatch, homeFollows(), placeDir(), stat(), walk() (+7 more)

### Community 115 - "0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer"
Cohesion: 0.09
Nodes (21): Code map: graphify knowledge graph, ADR-0127, ADR-0129, Code map view step in deploy, Workflow: Code map (graphify knowledge graph), graphify: knowledge graph extraction tool, 0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer, Alternatives considered (+13 more)

### Community 116 - "js.rs"
Cohesion: 0.10
Nodes (4): fixed_num(), grouped(), num_str(), to_fixed()

### Community 117 - "djsync.rs"
Cohesion: 0.16
Nodes (7): busy(), ENGINE_APPS, Engine<H>, has_col(), mtime(), Song, Synced

### Community 118 - "parse_serato_database()"
Cohesion: 0.20
Nodes (15): build_serato_library(), get(), minutes(), parse_serato(), parse_serato_crate(), parse_serato_database(), serato_path(), SField (+7 more)

### Community 119 - "tidy.rs"
Cohesion: 0.22
Nodes (10): file_key(), FileEntry, get(), Linkable, LOOSE, match_tracks(), NUMBERED, s() (+2 more)

### Community 120 - "bridge.ts"
Cohesion: 0.10
Nodes (16): ADR-0083, Activity, API, askYesNo(), bridge, openFolder(), openUrl(), pickFolder() (+8 more)

### Community 121 - "onScreen.test.ts"
Cohesion: 0.12
Nodes (13): ADR-0131, OnScreen, Retries, ADR-0131, Why, bytes, state, ADR-0131 (+5 more)

### Community 122 - "GuideLayer.svelte"
Cohesion: 0.09
Nodes (11): isAction(), load(), at, find(), looking, ready, run, size (+3 more)

### Community 123 - "Stem separation"
Cohesion: 0.10
Nodes (15): E2E test workflow, GLUE Home build and release pipeline, crates/glue-audio: Native analysis engine, crates/glue-engine: Library engine in Rust, GLUE: Global Library Unified Exporter, GLUE README, Speklone, HT-Demucs stem separation on WebGPU (+7 more)

### Community 124 - "package.json"
Cohesion: 0.09
Nodes (20): autostart(), onPairLink(), allowScripts, github:festanqueiro/threejs-visualisers#3a85cac1d9db9d8c3ba30a5f65d90831f137944b, description, name, private, type (+12 more)

### Community 125 - "glue-rtc/src/lib.rs"
Cohesion: 0.12
Nodes (11): CHUNK, Conn, frame(), Handler, HIGH_WATER, MAX_FILE, MAX_RANGE, safe_part() (+3 more)

### Community 126 - "xml.rs"
Cohesion: 0.15
Nodes (9): is_space(), ATTR, decode_entities(), ENTITY, parse_int(), parse_xml(), reads_what_the_website_reads(), SP (+1 more)

### Community 127 - "ADR 0165: GLUE Home makes the duplicate groups and points playlists at the best copies"
Cohesion: 0.11
Nodes (16): ADR-0120, ADR-0121, Duplicate group building, Acoustic fingerprint duplicate detection, bestLists(), ADR-0013, ADR-0117, ADR-0013 (+8 more)

### Community 128 - "ADR 0182: Engine DJ's playlists written as Engine DJ writes them: its Collection, then each drive's "
Cohesion: 0.10
Nodes (18): Engine DJ database structure (m.db), Engine DJ PerformanceData encoding, Engine DJ playlist tree repair process, 0173. Engine DJ: what GLUE can't see stays where it is; one backup each time Engine DJ closes, Alternatives considered, Consequences, Context, ADR 0173: Engine DJ: what GLUE can't see stays where it is; one backup each time Engine DJ closes (+10 more)

### Community 129 - "nowPlaying"
Cohesion: 0.13
Nodes (5): facetInfo(), jump(), nowPlaying, plural(), viewTitle()

### Community 130 - "HomeStore"
Cohesion: 0.19
Nodes (3): HomeStore, now(), Profile

### Community 131 - "Player"
Cohesion: 0.11
Nodes (20): Audio element management, Deferred track page loading, GLUE Home song port, iPhone playback support, lib.mediaFor, lib/nowPlaying, lib/output, lib/player (+12 more)

### Community 132 - "signal.rs"
Cohesion: 0.14
Nodes (3): open(), Room, tcp()

### Community 133 - "ADR 0081: Relay connections that can't be direct through Cloudflare's TURN, with the owner's key"
Cohesion: 0.10
Nodes (13): ADR-0081, ADR-0037, ADR-0081, ADR-0037, ADR-0037, ADR-0037, ADR-0084, ADR-0084 (+5 more)

### Community 134 - "js_keys()"
Cohesion: 0.22
Nodes (13): index_key(), js_gt(), js_keys(), locale_cmp(), num_str(), parse(), pretty(), quote() (+5 more)

### Community 135 - "imports.ts"
Cohesion: 0.14
Nodes (16): sql.js, isAppleLibrary(), isSqlite(), isRekordboxXml(), isSeratoDatabase(), isTraktorNml(), IMPORT_ACCEPT, loadSql() (+8 more)

### Community 136 - "waterfall3d.ts"
Cohesion: 0.15
Nodes (8): three, create3D(), TICKS, ADR-0073, View3D, Waterfall3D, ADR 0073: The live 3D view is drawn by three.js on the GPU, and can be turned, zoomed and reset, Live view

### Community 137 - "make-audio.ts"
Cohesion: 0.11
Nodes (17): DUPLICATE, encode(), entries, EXT, ff(), FILES, hz(), MAJOR (+9 more)

### Community 138 - "covers.golden.test.ts"
Cohesion: 0.22
Nodes (18): CoverQuery, lookupKey(), norm(), pick(), queryOf(), quote(), same(), sameArtist() (+10 more)

### Community 139 - "prepare.test.ts"
Cohesion: 0.19
Nodes (16): addMemory(), autoLoop(), byTime(), HOT_COLORS, hotCue(), importable(), LETTERS, removeCue() (+8 more)

### Community 140 - "duplicates.ts"
Cohesion: 0.21
Nodes (18): buildGroups(), certainty(), concerns(), Copy, copyScore(), GRADE, groupKey(), MIN_OVERLAP_SEC (+10 more)

### Community 141 - "anywhere.svelte.ts"
Cohesion: 0.15
Nodes (11): anywhere, ADR-0077, ADR-0108, ADR-0113, CloudAlias, isAlias(), Listed, profiles (+3 more)

### Community 142 - "DevicesSection.svelte"
Cohesion: 0.12
Nodes (16): ADR-0042, LIST_COLORS, ago(), copied, deviceMenu(), left, now, only (+8 more)

### Community 143 - "RelinkView.svelte"
Cohesion: 0.10
Nodes (11): doubtful, askDoubtful, askPlan, chosen, includeDoubtful, limit, matched, pickedShown (+3 more)

### Community 144 - "decode.rs"
Cohesion: 0.14
Nodes (5): decode(), Decoded, keep_range(), mp4_edit(), push()

### Community 145 - "backup.rs"
Cohesion: 0.22
Nodes (11): a_backup_holds_the_profile_and_says_what_it_is(), BACKUP_FORMAT, BACKUP_VERSION, build_backup(), crc32(), create_zip(), created_ms(), dos_time() (+3 more)

### Community 146 - "src-tauri/src/dupes.rs"
Cohesion: 0.19
Nodes (9): default_duplicates(), duplicates_dir(), free(), move_into(), moves_under_the_folder_name_and_path_and_numbers_clashes(), music_roots(), refuses_paths_that_leave_the_folder_and_folders(), run() (+1 more)

### Community 147 - "platform/homeDisk.ts"
Cohesion: 0.11
Nodes (17): ADR-0141, ADR-0141, File read folder lookup: resolve each folder only once, remember for 10 min, PLAY_PORT: separate 127.0.0.1 port for song playback, ADR-0141, Entry, HomeRoots, join() (+9 more)

### Community 148 - "ADR 0133: A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what"
Cohesion: 0.10
Nodes (18): ADR-0133, ADR-0133, Remote Session, ADR-0133, ADR-0133, ADR-0133, ADR-0133, ADR-0133 (+10 more)

### Community 149 - ".takeDerived()"
Cohesion: 0.12
Nodes (10): cacheFile(), ADR-0138, Gate, ADR-0138, ADR-0138, 0138. What the user asks for goes first: background requests gated, playing ahead of the analysis, songs read whole, Alternatives considered, Consequences (+2 more)

### Community 150 - "fingerprint.rs"
Cohesion: 0.12
Nodes (10): BANDS, F_HI, F_LO, fingerprint(), FP_HOP, FP_N, FP_RATE, FP_SECONDS (+2 more)

### Community 151 - "ref_node_url"
Cohesion: 0.11
Nodes (7): errors, files, FIX, OUT, ADR-0147, ADR-0044, vite

### Community 152 - "graph_docs.py"
Cohesion: 0.17
Nodes (9): adr_files(), digest(), finish(), node_id(), link(), prepare(), rel(), stem_id() (+1 more)

### Community 153 - "covers.svelte.ts"
Cohesion: 0.15
Nodes (16): mediabunny, CoverSize, ADR-0142, ADR-0142, COVER_LARGE, COVER_SMALL, coverFromImage(), coverOf() (+8 more)

### Community 154 - "prepare"
Cohesion: 0.20
Nodes (5): beatGrid(), ImportedTrack, Grid, tapBpm(), prepare

### Community 156 - "ADR 0135: Analysis around network folders: their songs take turns, GLUE Home reads tags in batches, "
Cohesion: 0.11
Nodes (14): Analysis queue meter, ADR-0157, GLUE Home analysis (fillInfo), ADR-0135, ADR-0157, ADR-0135, ADR-0135, ADR-0157 (+6 more)

### Community 157 - "smoke-local.ts"
Cohesion: 0.13
Nodes (13): both, got, homeLog, kicked, signalled, stop(), ws, claim() (+5 more)

### Community 158 - "merge3.rs"
Cohesion: 0.31
Nodes (10): arr(), Clash, merge3(), merge_sequence(), merge_sets(), merge_value(), merges_as_the_website_does(), obj() (+2 more)

### Community 159 - "ADR 0146: Keep the library's methods in parts by concern, behind the same `lib`"
Cohesion: 0.12
Nodes (15): ADR-0146, lib(), analysis part, collections part, djLibraries part, edits part, files part, folders part (+7 more)

### Community 160 - "lossy-fixtures.mjs"
Cohesion: 0.11
Nodes (10): fixtures, ADR-0060, { channels, sr }, data, head, make, ADR-0147, out (+2 more)

### Community 161 - "homeBundle.test.ts"
Cohesion: 0.12
Nodes (16): GLUE Home test service page, ADR-0160, ADR-0160, FORBIDDEN, FORBIDDEN_PACKAGES, reach(), resolveImport(), ROOT (+8 more)

### Community 162 - "glue-audio/tests/golden.rs"
Cohesion: 0.24
Nodes (9): b64(), check(), check_files(), golden(), lossless_fixtures_match_javascript(), result_json(), root(), same() (+1 more)

### Community 163 - "repair.rs"
Cohesion: 0.35
Nodes (11): Counts, fold_computer(), FoldInput, FoldResult, get(), has_stand_in(), needs_fold(), obj() (+3 more)

### Community 165 - "rtc-probe.mjs"
Cohesion: 0.12
Nodes (13): e2e/home-rtc.ts: RTC e2e stand-in, ADR-0150, ADR-0150, child, dir, ADR-0150, out, results (+5 more)

### Community 166 - "compilerOptions"
Cohesion: 0.12
Nodes (16): @tsconfig/svelte/tsconfig.json, compilerOptions, isolatedModules, lib, module, moduleResolution, noFallthroughCasesInSwitch, noImplicitOverride (+8 more)

### Community 167 - "importActions.ts"
Cohesion: 0.24
Nodes (16): APPS, importDetected(), importFiles(), importFound(), importSeratoFolder(), importWithHome(), pickSeratoFolder(), refreshWithFile() (+8 more)

### Community 168 - "ADR 0076: Songs stream by byte range: the local link in Home mode, a service worker for other comput"
Cohesion: 0.12
Nodes (14): AIFF format handling, ADR-0076, ADR-0076, ADR-0088, ADR-0088, ADR-0076, ADR-0076, ADR-0076 (+6 more)

### Community 169 - "djinfo.rs"
Cohesion: 0.33
Nodes (10): app_info(), app_value(), each_sides_change_goes_to_the_other(), FIELDS, glue_and_engine_djs_forms(), glue_info(), info(), InfoMerge (+2 more)

### Community 170 - "homemode.spec.ts"
Cohesion: 0.12
Nodes (11): ADR-0153, errors, MUSIC, test, ADR-0153, ADR-0153, 0153. GLUE Home's library engine in Rust, tested end to end against the real one, Alternatives considered (+3 more)

### Community 171 - "perf.spec.ts"
Cohesion: 0.13
Nodes (12): afterPaint(), BUDGET, errors, Long, note(), over, results, SIZES (+4 more)

### Community 172 - "SharedCloudServer"
Cohesion: 0.25
Nodes (4): fakeCloud(), d1(), SharedCloudServer, recorded()

### Community 173 - "src-tauri/src/tags.rs"
Cohesion: 0.20
Nodes (5): apply(), FIELDS, fixture(), write_tags(), writes_into_every_format_and_reads_back()

### Community 174 - "relink.svelte.ts"
Cohesion: 0.15
Nodes (10): RelinkMatch, Songish, Orphan, relink, said(), songish(), ADR-0124, ADR-0124 (+2 more)

### Community 175 - "merge3.ts"
Cohesion: 0.20
Nodes (12): isObj(), merge3(), mergeBoth(), Merged, mergeSequence(), mergeSets(), mergeValue(), same() (+4 more)

### Community 177 - "ADR 0096: Move merged collections into the shared one, one computer at a time"
Cohesion: 0.13
Nodes (15): ADR-0102, ADR-0102, ADR-0098, ADR-0102, ADR-0096, ADR-0096, ADR-0096, ADR-0102 (+7 more)

### Community 178 - "homeApp.ts"
Cohesion: 0.14
Nodes (11): ADR-0151, ADR-0151, HOME_DOWNLOADS, RELEASES, ADR-0151, ADR-0151, 0151. GLUE opens in GLUE Home's own window, showing the live site, Alternatives considered (+3 more)

### Community 180 - "sync.golden.test.ts"
Cohesion: 0.23
Nodes (14): asDir(), Call, Golden, J(), lapEdit(), memDir(), meta, other() (+6 more)

### Community 181 - "summary.rs"
Cohesion: 0.20
Nodes (7): ANALYSIS_VERSION, ENGINE, failed(), iso(), now_iso(), summarize(), VERDICT_VERSION

### Community 182 - "IceCache"
Cohesion: 0.26
Nodes (3): IceCache, kept_until_the_relay_ends_or_ten_minutes(), public_servers()

### Community 183 - "traktor.rs"
Cohesion: 0.25
Nodes (6): get(), HEAD, MAJOR, nml_path(), parse_traktor_nml(), traktor_key()

### Community 184 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @crabnebula/tauri-plugin-drag, mediabunny, sql.js, @tauri-apps/api, @tauri-apps/plugin-autostart, @tauri-apps/plugin-deep-link, @tauri-apps/plugin-dialog (+6 more)

### Community 185 - "interop.test.ts"
Cohesion: 0.30
Nodes (11): cols(), combineEngine(), engineKey(), libOf(), linkedOrder(), parseEngineDb(), resolveEngine(), rows() (+3 more)

### Community 186 - "web.rs"
Cohesion: 0.17
Nodes (5): allowed(), get(), HOSTS, IMAGE_HOSTS, MAX

### Community 187 - "ADR 0154: The analysis queue in GLUE Home's engine, in Rust"
Cohesion: 0.15
Nodes (12): Analysis queue in Rust: Part of GLUE Home's engine, ADR-0154, ADR-0154, ADR-0154, ADR-0154, ADR-0154, ADR-0154, 0154. The analysis queue in GLUE Home's engine, in Rust (+4 more)

### Community 188 - "glue-audio.rs"
Cohesion: 0.22
Nodes (5): AUDIO, b64(), main(), one(), songs()

### Community 191 - "ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust"
Cohesion: 0.15
Nodes (13): DJ library following live, ADR-0167, ADR-0167, ADR-0167, ADR-0167, ADR-0167, ADR-0167, ADR-0167 (+5 more)

### Community 192 - "ADR 0155: GLUE Home syncs the shared collections in Rust, held to the website's sync"
Cohesion: 0.15
Nodes (11): ADR-0155, ADR-0155, ADR-0155, Golden tests: TypeScript to Rust parity, home/ui/sharedSync.ts: deleted, ADR-0155, 0155. GLUE Home syncs the shared collections in Rust, held to the website's sync, Alternatives considered (+3 more)

### Community 193 - "ADR 0179: Engine DJ's own playlists, and its songs' info, edited from GLUE"
Cohesion: 0.15
Nodes (13): ADR-0179, ADR-0179, ADR-0179, ADR-0179, ADR-0179, ADR-0179, ADR-0179, ADR-0179 (+5 more)

### Community 194 - "capture.ts"
Cohesion: 0.22
Nodes (11): EDGE_ARGS, ADR-0153, clip(), cursor(), DEMO, ff(), OUT, profile (+3 more)

### Community 195 - "activity.rs"
Cohesion: 0.26
Nodes (6): Act, counts_calls_time_and_bytes(), note(), snapshot(), start(), STARTED

### Community 196 - "ADR 0177: Opening the library or a collection shows its progress, and waits less"
Cohesion: 0.17
Nodes (11): lib.loading state, ADR-0177, ADR-0177, ADR-0177, ADR-0177, ADR-0177, 0177. Opening the library or a collection shows its progress, and waits less, Alternatives considered (+3 more)

### Community 197 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, svelte, svelte-check, @sveltejs/vite-plugin-svelte, @tauri-apps/cli, @tsconfig/svelte, @types/node (+5 more)

### Community 198 - "import_golden.rs"
Cohesion: 0.20
Nodes (3): iso(), libraries_come_in_as_on_the_website(), root()

### Community 199 - "rekordbox.rs"
Cohesion: 0.21
Nodes (3): channel(), HEAD, parse_rekordbox_xml()

### Community 201 - "ADR 0052: A Prepare tab: waveform, beat grid, metronome and the user's corrections"
Cohesion: 0.17
Nodes (12): legacy/index.html, ADR-0052, ADR-0052, ADR-0052, ADR-0052, ADR-0052, ADR-0052, ADR-0052 (+4 more)

### Community 202 - "ADR 0170: Engine DJ kept in step both ways: cues, loops and the beat grid"
Cohesion: 0.17
Nodes (12): ADR-0170, ADR-0170, ADR-0170, ADR-0170, ADR-0170, ADR-0170, ADR-0170, 0170. Engine DJ kept in step both ways: cues, loops and the beat grid (+4 more)

### Community 206 - "cloud/package.json"
Cohesion: 0.18
Nodes (10): description, devDependencies, wrangler, name, private, scripts, deploy, dev (+2 more)

### Community 207 - "lossy.rs"
Cohesion: 0.31
Nodes (6): a_damaged_mp3_frame_keeps_the_time(), a_deadline_stops_the_analysis(), alac_is_the_same_as_flac(), fixture(), lossy_files_decode(), run()

### Community 208 - "lossy_golden.rs"
Cohesion: 0.38
Nodes (6): bytes_b64(), FILES, json(), lossy_files_match_the_browser(), root(), same()

### Community 209 - "ADR 0086: GLUE Home looks up missing covers on public services"
Cohesion: 0.20
Nodes (9): ADR-0086, ADR-0086, ADR-0086, ADR-0086, ADR-0086, ADR-0086, ADR-0086, ADR-0086 (+1 more)

### Community 210 - "ADR 0136: Analysis limits are the user's to set, with the speed shown and a suggestion from it"
Cohesion: 0.22
Nodes (9): ADR-0136, ADR-0136, From each network folder at a time setting, Suggestion algorithm based on performance metrics, 0136. Analysis limits are the user's to set, with the speed shown and a suggestion from it, Alternatives considered, Consequences, Context (+1 more)

### Community 211 - "ui/engine.ts"
Cohesion: 0.27
Nodes (8): HomeConfig, describe(), LibraryInfo, Speed, ADR-0153, collectionKey(), shared(), ADR-0045

### Community 212 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, check, dev, home:dev, home:preview, home:ui, preview (+2 more)

### Community 213 - "serato.ts"
Cohesion: 0.40
Nodes (9): buildSeratoLibrary(), get(), parseSerato(), parseSeratoCrate(), parseSeratoDatabase(), seratoPath(), SField, str() (+1 more)

### Community 215 - "control.rs"
Cohesion: 0.25
Nodes (3): check(), set_deadline(), TOO_LONG

### Community 216 - "ADR 0106: Keep the shared collection in GLUE Cloud as a snapshot and a log of changes"
Cohesion: 0.25
Nodes (8): ADR-0106, ADR-0105, ADR-0107, ADR-0106, ADR-0106, ADR 0105: Pace pushes to GLUE Cloud; GLUE Home analyses as many songs at once as the computer allows, ADR 0106: Keep the shared collection in GLUE Cloud as a snapshot and a log of changes, ADR 0107: The shared sync looks only at the files that changed, and keeps its agreed copies file by 

### Community 217 - "jsmath.rs"
Cohesion: 0.42
Nodes (5): grid(), math_within_2_ulp_of_v8(), outputs(), v8(), where_it_differs()

### Community 219 - "shared.spec.ts"
Cohesion: 0.25
Nodes (7): ADR-0114, browserFor(), D, fixture(), MUSIC, seed(), ADR-0094

### Community 220 - "guide.spec.ts"
Cohesion: 0.25
Nodes (5): errors, fixture(), libraryWithASong(), test, ADR-0126

### Community 221 - "graph.mjs"
Cohesion: 0.25
Nodes (8): FETCHED, gitDir, inOut(), KEEP, OUT, own, run(), scratch

### Community 222 - "ADR 0171: Engine DJ's playlists kept in step both ways"
Cohesion: 0.22
Nodes (9): ADR-0171, ADR-0171, ADR-0171, lists(), 0171. Engine DJ's playlists kept in step both ways, Alternatives considered, Consequences, Context (+1 more)

### Community 223 - "super"
Cohesion: 0.25
Nodes (4): Admit, Full, Ok, Refused

### Community 225 - "glue-interop/tests/golden.rs"
Cohesion: 0.36
Nodes (3): root(), same(), the_libraries_read_as_the_website_reads_them()

### Community 227 - "0149. GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failures once"
Cohesion: 0.29
Nodes (7): ADR-0149, engine(), 0149. GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failures once, Alternatives considered, Consequences, Context, ADR 0149: GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failur

### Community 228 - "Help: Getting started"
Cohesion: 0.25
Nodes (8): Drag dock, Incoming folder (TO BE SORTED), Tour: welcome, Help: Getting started, GLUE folder, GLUE Home (optional companion app), Help: GLUE Home, GLUE in its own window

### Community 229 - "dock.ts"
Cohesion: 0.25
Nodes (6): Dock, GLUE drag dock page, ADR-0054, ADR-0056, @crabnebula/tauri-plugin-drag, @tauri-apps/api

### Community 230 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, allowImportingTsExtensions, noEmit, types, extends, include

### Community 232 - "EditInfo.svelte"
Cohesion: 0.32
Nodes (7): changed, close(), focus(), lists, save(), suggest(), values

### Community 233 - "dupeGroups.golden.test.ts"
Cohesion: 0.43
Nodes (7): graded(), input(), lossless(), lossy(), m(), OUT, song()

### Community 234 - "Vision"
Cohesion: 0.25
Nodes (6): ADR 0010: Import/export before write-back, ADR 0011 (live export file), Vision, Speklone, Browser capabilities research, File System Access API, Chromium only

### Community 237 - "0183. Keep Engine DJ's folders as Engine DJ keeps them"
Cohesion: 0.29
Nodes (5): Engine DJ folder repair: fix_folders at sync end, 0183. Keep Engine DJ's folders as Engine DJ keeps them, Alternatives considered, Consequences, Context

### Community 238 - "updates.ts"
Cohesion: 0.29
Nodes (3): ADR-0045, @tauri-apps/plugin-process, @tauri-apps/plugin-updater

### Community 242 - "turn.ts"
Cohesion: 0.40
Nodes (5): Ice, TURN_TTL, TurnEnv, turnServers(), usable()

### Community 244 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 245 - "glue-engine"
Cohesion: 0.53
Nodes (6): glue-audio, glue-engine, glue-home, glue-interop, glue-rtc, glue-store

### Community 246 - "0130. The same file on two computers is one song, with a copy on each"
Cohesion: 0.33
Nodes (5): fileName(), 0130. The same file on two computers is one song, with a copy on each, Alternatives considered, Consequences, Context

### Community 247 - "Help: The library and its views"
Cohesion: 0.33
Nodes (6): Help: Duplicates and the best copy, Duplicate detection and deduplication, Help: The library and its views, Library and collections, Help: No file linked, No file linked

### Community 248 - "0140. A song played pauses the analysis's reads, not only its new songs"
Cohesion: 0.33
Nodes (5): 0140. A song played pauses the analysis's reads, not only its new songs, Alternatives considered, Consequences, Context, ADR 0140: A song played pauses the analysis's reads, not only its new songs

### Community 249 - "0148. GLUE Home's queue hands each song to the native engine"
Cohesion: 0.33
Nodes (5): 0148. GLUE Home's queue hands each song to the native engine, Alternatives considered, Consequences, Context, ADR 0148: GLUE Home's queue hands each song to the native engine

### Community 250 - "Kind"
Cohesion: 0.40
Nodes (5): Kind, Analysis, Collection, Other, Tracks

### Community 251 - "Pri"
Cohesion: 0.40
Nodes (4): Paced, Pri, Analysis, Play

### Community 252 - "0159. GLUE Home's first run, a GLUE folder always offered, and its window signed in by GLUE Home"
Cohesion: 0.40
Nodes (5): canPickFolders(), 0159. GLUE Home's first run, a GLUE folder always offered, and its window signed in by GLUE Home, Alternatives considered, Consequences, Context

### Community 253 - "0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it"
Cohesion: 0.40
Nodes (4): 0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it, Alternatives considered, Consequences, Context

### Community 254 - "0145. Judge "the same name" one way, in `core/library/names.ts`"
Cohesion: 0.40
Nodes (4): 0145. Judge "the same name" one way, in `core/library/names.ts`, Alternatives considered, Consequences, Context

### Community 258 - "Prepare tab"
Cohesion: 0.50
Nodes (4): Help: Prepare, Prepare tab, Help: A song's page, Song page and details

### Community 259 - "0172. Engine DJ: the playlists' order in step, and songs pointed at the copy kept"
Cohesion: 0.50
Nodes (4): 0172. Engine DJ: the playlists' order in step, and songs pointed at the copy kept, Alternatives considered, Consequences, Context

### Community 260 - "Help article: DJ libraries"
Cohesion: 0.67
Nodes (3): Engine DJ two-way sync, Help article: DJ libraries, DJ libraries: import and follow

### Community 261 - "Help: Devices, accounts and profiles"
Cohesion: 0.67
Nodes (3): Artist profiles (aliases), Help: Devices, accounts and profiles, Multi-device sync

### Community 262 - "Help: Adding music"
Cohesion: 0.67
Nodes (3): tour: adding-music, Help: Adding music, TO BE SORTED: incoming folder for sent songs

## Knowledge Gaps
- **1046 isolated node(s):** `Opts`, `Device`, `MenuAt`, `MenuColors`, `MenuHead` (+1041 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1941 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **66 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ADR 0141: Songs played get their own port, and a file read looks up only its own folder` connect `platform/homeDisk.ts` to `ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put`, `Player`, `writePref()`, `main.rs`, `local.rs`, `.takeDerived()`, `localHome.svelte.ts`?**
  _High betweenness centrality (0.268) - this node is a cross-community bridge._
- **Why does `GLUE Vault` connect `GLUE Vault` to `ADR 0182: Engine DJ's playlists written as Engine DJ writes them: its Collection, then each drive's `, `edits.ts`, `waterfall3d.ts`, `collection.ts`, `platform/homeDisk.ts`, `ADR 0133: A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what`, `.takeDerived()`, `folders.ts`, `ADR 0135: Analysis around network folders: their songs take turns, GLUE Home reads tags in batches, `, `events.svelte.ts`, `ADR 0094: One shared collection in GLUE Cloud, the same on every device`, `ADR 0146: Keep the library's methods in parts by concern, behind the same `lib``, `lib/analysis.ts`, `GLUE Cloud: accounts, GLUE Home and devices`, `homeBundle.test.ts`, `store/types.ts`, `ADR 0108: One id per computer: GLUE Home learns it, only the computer's GLUE folder writes its parts`, `djLibraries.ts`, `homemode.spec.ts`, `store.golden.test.ts`, `ADR 0096: Move merged collections into the shared one, one computer at a time`, `homeApp.ts`, `fingerprint.ts`, `ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address`, `ADR 0154: The analysis queue in GLUE Home's engine, in Rust`, `localHome.svelte.ts`, `sendToHome.svelte.ts`, `ADR 0155: GLUE Home syncs the shared collections in Rust, held to the website's sync`, `ADR 0177: Opening the library or a collection shows its progress, and waits less`, `ADR 0052: A Prepare tab: waveform, beat grid, metronome and the user's corrections`, `flac.ts`, `ADR 0071: Song info is edited in GLUE and written into the music files by GLUE Home`, `fakeHome.ts`, `ADR 0136: Analysis limits are the user's to set, with the speed shown and a suggestion from it`, `ADR 0180: GLUE's own playlists kept in Engine DJ's "GLUE" folder, both ways`, `ADR 0175: Back from the background, the room and the sessions are made again at once`, `ADR 0106: Keep the shared collection in GLUE Cloud as a snapshot and a log of changes`, `Quality forensics`, `admin.ts`, `ADR 0046: GLUE Home keeps and shares the analyses; TO BE SORTED lists its incoming folder`, `ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put`, `0149. GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failures once`, `0148. GLUE Home's queue hands each song to the native engine`, `Vision`, `ADR 0063: DJ libraries are browsed live; playlists come into GLUE on demand and stay linked`, `ADR 0068: A full player: a queue, an open view with the visualiser, the sound output; drivers throug`, `0183. Keep Engine DJ's folders as Engine DJ keeps them`, `ADR 0030: DJ libraries are detected in folders the user has allowed`, `0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer`, `0130. The same file on two computers is one song, with a copy on each`, `0140. A song played pauses the analysis's reads, not only its new songs`, `onScreen.test.ts`, `Stem separation`, `0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it`, `0145. Judge "the same name" one way, in `core/library/names.ts``, `ADR 0165: GLUE Home makes the duplicate groups and points playlists at the best copies`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `ADR 0122: GLUE Home's Stop stops everything; a dropped folder is found by GLUE Home at once` connect `ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address` to `local.rs`, `GLUE Vault`, `ui/engine.ts`, `sendToHome.svelte.ts`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Are the 54 inferred relationships involving `text()` (e.g. with `.answer()` and `.background_todo()`) actually correct?**
  _`text()` has 54 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Opts`, `Device`, `MenuAt` to the rest of the system?**
  _1046 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `view.svelte.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.025974025974025976 - nodes in this community are weakly interconnected._
- **Should `App.svelte` be split into smaller, more focused modules?**
  _Cohesion score 0.03572984749455338 - nodes in this community are weakly interconnected._