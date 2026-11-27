# Graph Report - GLUE  (2026-11-27)

## Corpus Check
- 1004 files · ~894,786 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 9099 nodes · 22627 edges · 406 communities (303 shown, 103 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 947 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- engine.svelte.ts
- queue.rs
- glue-engine/src/sync.rs
- collection.ts
- glue-interop/src/sync.rs
- merge.ts
- library.svelte.ts
- GLUE vault index
- Host
- trackMenu.ts
- App
- CollectionStore
- enginedb.rs
- player.svelte.ts
- src/discogs.rs
- djdrive.rs
- GLUE Cloud: accounts, GLUE Home and devices
- Welcome.svelte
- prepare.svelte.ts
- view.svelte.ts
- player
- parse.rs
- tests/engine.rs
- writePref()
- shared/engine.ts
- stems.svelte.ts
- discogsBuild.svelte.ts
- nowPlaying.svelte.ts
- Store<D>
- glue-engine/src/tags.rs
- Library
- Playlists, folders & smart lists
- ADR 0194: GLUE doesn't write into Engine DJ (writes off unless switched on)
- Track
- set.svelte.ts
- api.ts
- store.golden.test.ts
- events.ts
- parse.ts
- tests/room.rs
- auto.svelte.ts
- mixer.ts
- app.svelte.ts
- glue-interop/src/types.rs
- platform/index.ts
- homemode.spec.ts
- analyze.ts
- ADR 0170: Engine DJ kept in step both ways: cues, loops and the beat grid
- read_json()
- Sets: a playlist mixed, exported as one file
- rtc.rs
- library/analysis.ts
- relink.ts
- backup.ts
- DuplicatesView.svelte
- library.rs
- local.rs
- LibraryView.svelte
- Store
- shared.svelte.ts
- localHome
- .serve()
- thumbs.svelte.ts
- Automatic playlists (feature)
- ws.rs
- remoteFiles.svelte.ts
- Player
- analysis.worker.ts
- discogsBuild.ts
- guide.test.ts
- shared.ts
- verdict.rs
- H
- Engine<H>
- dsp.rs
- covers.rs
- protocol.rs
- signal.ts
- ADR 0040: Cloud sync of library data, merged collections, and edits that reach the owning device
- ref_node_url
- ADR 0046: GLUE Home keeps and shares the analyses; TO BE SORTED lists its incoming folder
- fakeHome.ts
- remoteFiles
- interop/types.ts
- ADR 0036: Optional accounts and a small free cloud service (Cloudflare) for devices and signaling
- parse_engine_db()
- merge.rs
- tauri.conf.json
- autoplaylist.ts
- Background analysis
- glue-audio/src/types.rs
- text()
- ADR 0086: GLUE Home looks up missing covers on public services
- ADR 0197: Give every song a sound profile: loudness, busyness, timbre and loudness over time
- account
- setplay.worker.ts
- analyze.rs
- store/types.ts
- Feature: Library & scanner
- tests/answers.rs
- files.rs
- src/room.rs
- glue-sets/tests/golden.rs
- project.rs
- mixdown.worker.ts
- disk.rs
- route.svelte.ts
- Mixer
- users
- sharedCloud.ts
- ADR 0174: Another computer's songs stream as they arrive, and their start says where its time went
- Session
- ADR 0187: The Discogs collection: read by GLUE Home, kept in the profile, matched on the page
- ADR 0201: A set shaped by hand on its timeline, heard live from a worker, with headroom where songs 
- sync.golden.test.ts
- analyse()
- admin.ts
- dsd.rs
- glue-engine/src/dupes.rs
- flac.ts
- ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust
- lib/perf.ts
- ADR 0094: One shared collection in GLUE Cloud, the same on every device
- Disk
- GuideLayer.svelte
- engineClient
- PhoneSongs.svelte
- interop.golden.test.ts
- flac.rs
- .answer()
- djsync.rs
- verify.rs
- Pv
- ADR 0061: Songs go onto the drag dock by dragging them there too
- ADR 0196: GLUE's playlists reach Engine DJ through a library of GLUE's own, shown as a drive
- themes.svelte.ts
- imports.ts
- covers.golden.test.ts
- DiscogsView.svelte
- serde_json
- Engine
- Engine<H>
- parse_serato_database()
- bridge.ts
- phone.spec.ts
- sets.test.ts
- src/profiles.ts
- js.rs
- decode.ts
- package.json
- importActions.ts
- merge3.rs
- tidy.rs
- Performance
- keys.ts
- glue-rtc/src/lib.rs
- .dj_check()
- service.rs
- xml.rs
- ADR 0191: Give every theme Hallmark's Console treatment: the colours kept, the type and surfaces mad
- ADR 0179: Engine DJ's own playlists, and its songs' info, edited from GLUE
- dock.rs
- AppHandle
- golden.test.ts
- Mixer
- SetLanes.svelte
- djWatch.svelte.ts
- signal.rs
- downloads.svelte.ts
- analyse_into()
- js_keys()
- libraries.rs
- make-audio.ts
- decode.rs
- reminders.rs
- ADR 0063: DJ libraries are browsed live; playlists come into GLUE on demand and stay linked
- main.rs
- lib/analysis.ts
- sets/types.ts
- Engine DJ: what writing back to it involves
- backup.rs
- src-tauri/src/dupes.rs
- homeLink.ts
- plan.ts
- graph_docs.py
- auto
- HomeDir
- automation.rs
- smoke-local.ts
- ADR 0102: Caches follow a collection; turning cloud sync off keeps it here, the account's copy optio
- guide.spec.ts
- fingerprint.rs
- names.rs
- parse_rekordbox_xml()
- types
- glue-audio/tests/golden.rs
- repair.rs
- details.ts
- capture.ts
- compilerOptions
- phone
- thumbs
- PlayerPanel.svelte
- import_golden.rs
- src/answers.rs
- djinfo.rs
- glue-sets/src/types.rs
- perf.spec.ts
- sound.ts
- ZipWriter
- ADR 0138: What the user asks for goes first: background requests gated, playing ahead of the analysi
- js
- String
- dependencies
- Stem separation
- HomeDisk
- HomeSocket
- dj.rs
- ADR 0128: Build the code map on GitHub for every push, and use it by fixed rules
- IceCache
- incoming.rs
- traktor.rs
- TempoMap
- FakeHome
- library.spec.ts
- ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address
- zip.ts
- idbSet()
- glue-audio.rs
- analysis.rs
- activity.rs
- allowed()
- updates.ts
- devDependencies
- sets.rs
- sound.rs
- ADR 0193: Download songs as files: ranges from GLUE Home, a zip written as it goes
- Downloads (feature, shipped M6)
- incoming
- Waterfall3D
- lossy_golden.rs
- cloud/package.json
- confirm()
- super
- ADR 0125: A song dropped onto the page is placed by GLUE Home; the tab analyses only what just it ca
- ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put
- shared.spec.ts
- serato.ts
- detect.ts
- dragout.ts
- .start()
- preview
- ADR 0104: GLUE Home is the library's engine; the website on its computer is its screen
- ui/engine.ts
- scripts
- rtc-probe.mjs
- platform/homeDisk.ts
- HomeFile
- 0111-removing-a-folder-removes-its-songs.md
- covers_golden.rs
- control.rs
- jsmath.rs
- lossy.rs
- ADR 0133: A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what
- graph.mjs
- glue-interop/tests/golden.rs
- Arriving
- Handler<H>
- FxStyle
- 0149. GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failures once
- tsconfig.test.json
- 0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it
- .check()
- homeBundle.test.ts
- ADR 0129: Refresh the code map's docs in every session that changes them, without the skill; browse 
- turn.ts
- .background_set()
- song_name()
- .join()
- .recheck_verdicts()
- 0107. The shared sync looks only at the files that changed, and keeps its agreed copies file by file
- glue-engine
- download.test.ts
- homeAnalysis
- metronome
- sidebar
- tabs
- Known
- PageSocket
- 0114. The account's profiles are every device's; each device picks its own
- default.json
- downloads
- 0009. JSON files in the GLUE folder are the store; no database
- 0140. A song played pauses the analysis's reads, not only its new songs
- Help: Devices, accounts and profiles
- ADR 0163: One computer never clashes with itself
- decode_song.rs
- Regex
- Pri
- Song Page Feature
- Help: Getting started
- 0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer
- 0128. Build the code map on GitHub for every push, and use it by fixed rules
- 0129. Refresh the code map's docs in every session that changes them, without the skill; browse it on the site
- 0134. Folders dropped in Home mode are looked for briefly, then asked for, with the page saying so; scans read past odd names
- 0136. Analysis limits are the user's to set, with the speed shown and a suggestion from it
- 0139. A socket for the background loads from GLUE Home, and a list that stays put
- 0144. FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so
- 0151. GLUE opens in GLUE Home's own window, showing the live site
- 0153. GLUE Home's library engine in Rust, tested end to end against the real one
- 0155. GLUE Home syncs the shared collections in Rust, held to the website's sync
- 0160. GLUE Home's service in its engine: the hidden page removed
- 0165. GLUE Home makes the duplicate groups and points playlists at the best copies
- 0189. Discogs playlists: vinyl and digital together, kept under Discogs
- 0200. Plan a set's hand-overs on phrases, in the set's style
- 0202. A set's length asked for, songs layered on 3 decks, and the timeline's gestures
- 0205. Bring the incoming song in on its drop; let the bass be cut or opened over part of a song; select several songs
- 0206. Give the set's page one round menu per song and a pinned timeline; give the site's ground some depth
- 0207. Trim the song's menu to fixed, labelled places; follow the playhead only until the user looks elsewhere
- 0209. Draw the song's menu as labelled tiles round the pointer; bring a song into view only when none of it shows
- Downloads
- The details' spectrogram: what it costs, and what would shrink it
- Pending
- Code map view step in deploy
- jsmath.mjs
- help/discogs.md
- help/downloads.md
- anywhere
- 0203. Whose bass plays in a hand-over: chosen, and where it changes hands, moved
- Help: Adding music
- help/sets.md
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
- Found on the way: a start overtaken by Stop
- Engine DJ 5.3 merges drives into the Collection at each start
- Import Engine DJ feature
- Import Rekordbox feature
- crates/glue-engine/src/verify.rs: native check
- withCopies function

## God Nodes (most connected - your core abstractions)
1. `GLUE vault index` - 177 edges
2. `Track` - 123 edges
3. `vitest` - 75 edges
4. `GLUE Cloud: accounts, GLUE Home and devices` - 71 edges
5. `text()` - 67 edges
6. `CollectionStore` - 61 edges
7. `handle()` - 54 edges
8. `account` - 47 edges
9. `engineClient` - 45 edges
10. `writePref()` - 44 edges

## Surprising Connections (you probably didn't know these)
- `Context` --references--> `scanFolder()`  [INFERRED]
  vault/adr/0134-network-folders-found-quickly-and-read-past-odd-names.md → src/core/library/scan.ts
- `Context` --references--> `fillInfo()`  [INFERRED]
  vault/adr/0135-analysis-around-network-folders-and-tags-by-glue-home.md → src/core/library/tags.ts
- `Consequences` --references--> `main()`  [INFERRED]
  vault/adr/0174-songs-stream-as-they-arrive.md → src/lib/bpm.ts
- `Context` --references--> `connectHome()`  [INFERRED]
  vault/adr/0132-connections-to-glue-home-are-bounded.md → src/lib/homeLink.ts
- `Context` --references--> `HomeDir`  [INFERRED]
  vault/adr/0125-dropped-songs-placed-by-glue-home.md → src/platform/homeDisk.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Client-side stem separation pipeline** — vault_adr_0003_client_side_stems_webgpu, vault_adr_0004_float64_model_patch, vault_adr_0005_model_from_huggingface [EXTRACTED 0.90]
- **Engine DJ merges GLUE's drive library at start** — vault_adr_0196_aggregating_drives, vault_adr_0196_engine_dj_drive_subst, vault_adr_0196_glues_own_engine_dj_library_on_a_drive_of_its_own_decision [EXTRACTED 1.00]
- **Analysis flow: concurrency -> speed tracking -> suggestion** — network_folder_concurrency, speed_suggestion_algorithm [EXTRACTED 1.00]
- **GLUE Home cache tidy: decision, sweep and the background feature** — vault_adr_0185_the_cache_of_songs_that_left_is_tidied_decision, glue_home_cache_tidy, vault_features_background_analysis_feature [EXTRACTED 1.00]
- **Discogs playlist flow: decision, list marker, logic, view** — vault_adr_0189_discogs_playlists_decision, src_core_library_discogslists, src_ui_library_discogslistview, vault_features_discogs_feature [EXTRACTED 1.00]
- **Documentation refresh workflow** — vault_adr_0129_code_map_docs_every_session_decision, scripts_graph_docs [EXTRACTED 1.00]
- **Download flow: fetch bytes, write zip, report progress** — vault_features_downloads_byte_sources, vault_features_downloads_writing_modes, vault_features_downloads_panel [EXTRACTED 1.00]
- **Engine DJ folder repair: shipped in 0.74.0, turned off in 0.74.1** — vault_adr_0183_engine_dj_folders_kept_as_engine_dj_keeps_them_decision, enginedj_fix_folders, vault_adr_0184_engine_dj_folder_repair_turned_off_decision [EXTRACTED 1.00]
- **Discogs collection flow: read by GLUE Home, kept per profile, matched on the page, shown as a view** — vault_adr_0187_discogs_collection_read_by_glue_home_decision, vault_adr_0187_discogs_collection_read_by_glue_home_profile_file, vault_adr_0187_discogs_collection_read_by_glue_home_matching, vault_adr_0187_discogs_collection_read_by_glue_home_view [EXTRACTED 1.00]
- **Discogs cover look-up with the user's token** — vault_adr_0186_discogs_covers_with_the_users_token_decision, vault_adr_0186_discogs_token_only_to_discogs, src_help_glue_home_covers_from_discogs, vault_features_song_info_covers_looked_up [EXTRACTED 1.00]
- **Discogs playlist builder: ticked records to a saved playlist** — vault_features_discogs_playlist_builder, vault_features_discogs_playlists, vault_adr_0190_the_discogs_playlist_builder_decision, src_help_discogs_article [EXTRACTED 1.00]
- **Engine DJ 5.3 merge growing to 13 GB** — vault_research_engine_dj_write_back_engine_5_3_aggregating_drives, vault_research_engine_dj_write_back_parent_id_loop, vault_research_engine_dj_write_back_engine_logs [EXTRACTED 1.00]
- **Engine DJ writes switched off** — vault_adr_0194_engine_writes_setting [EXTRACTED 1.00]
- **GLUE's playlists reach Engine DJ through the rekordbox XML** — vault_adr_0195_glues_playlists_reach_engine_dj_as_a_rekordbox_xml_decision, src_help_playlists_keep_in_engine_dj, vault_features_exports_feature, src_help_dj_libraries_article [EXTRACTED 1.00]
- **Layering on 3 decks: length, layering and hand-over style** — sets_length_asked_for, sets_layering_on_three_decks, sets_layer_handover_style [EXTRACTED 1.00]
- **Timeline gestures: select, move, zoom, seek** — sets_timeline_gestures, sets_handover_chip_box, src_ui_sets_setlanes_svelte [EXTRACTED 1.00]
- **A DJ app's playlists: kept in its DJ collection, imported, or GLUE's own** — vault_adr_0178_dj_playlists_stay_in_the_dj_collection_decision, vault_adr_0179_engine_dj_edited_in_the_dj_collection_decision, vault_adr_0180_glues_playlists_in_engine_djs_glue_folder_decision [EXTRACTED 1.00]
- **Where an Engine DJ playlist write lands: the Collection, then each drive's copy** — vault_adr_0181_engine_dj_libraries_made_where_a_drive_has_none_decision, vault_adr_0182_engine_dj_collection_and_its_drive_copies_decision, vault_adr_0179_engine_dj_edited_in_the_dj_collection_decision [EXTRACTED 1.00]
- **Streamed song start: piece stream, reconnect after background, console timing** — vault_adr_0174_songs_stream_as_they_arrive_decision, vault_adr_0175_back_from_the_background_connected_at_once_decision, vault_adr_0176_a_songs_start_timing_in_the_console_only_decision [EXTRACTED 1.00]
- **One analysis pipeline: folder listing, tag reading, and song analysis** — folder_listing_concept, tag_reading_concept [EXTRACTED 1.00]
- **Player bar and queue UI system** — full_player_bar_ui, queue_system, visualiser_feature [EXTRACTED 1.00]
- **Export: a song is read from the page as the mix reaches it, mixed in the worker, written to the file as it goes** — src_lib_sets_export_svelte, src_workers_mixdown_worker, src_core_sets_mixer [EXTRACTED 1.00]
- **A set: planned on phrases, rendered by one engine, exported as a file** — vault_adr_0200_planning_a_set_on_phrases_decision, vault_adr_0199_a_set_is_a_playlist_mixed_by_one_engine_decision, src_core_sets_plan, src_core_sets_mixer, src_workers_mixdown_worker, src_lib_sets_export_svelte [EXTRACTED 1.00]
- **The set menu's decisions, 0206 to 0209** — vault_adr_0206_a_sets_page_one_menu_a_pinned_timeline_decision, vault_adr_0207_a_set_menu_trimmed_and_follow_mode_decision, vault_adr_0208_the_set_menu_is_only_buttons_at_the_pointer_decision, vault_adr_0209_the_set_menu_as_labelled_tiles_decision [EXTRACTED 1.00]
- **A set's planning, mixing and hand-overs, 0199 to 0204** — vault_adr_0199_a_set_is_a_playlist_mixed_by_one_engine_decision, vault_adr_0200_planning_a_set_on_phrases_decision, vault_adr_0201_a_set_shaped_by_hand_and_heard_live_decision, vault_adr_0202_a_sets_length_layering_and_timeline_gestures_decision, vault_adr_0203_whose_bass_plays_in_a_hand_over_decision, vault_adr_0204_glue_home_mixes_the_set_decision [EXTRACTED 1.00]
- **The set's song menu: one round menu, trimmed, buttons only at the pointer** — vault_adr_0208_the_set_menu_is_only_buttons_at_the_pointer_decision, src_help_sets_article [EXTRACTED 1.00]
- **Who mixes: GLUE Home plans, mixes and streams the set** — vault_system_sets_who_mixes, vault_system_set_stream_glue_home [EXTRACTED 1.00]
- **Builder flow as the help article describes it** — src_help_playlists_building_a_playlist, src_help_playlists_flow, src_help_playlists_sound_varied_to_close, src_help_playlists_starting_songs_roles [EXTRACTED 1.00]
- **Discogs records matched: tracklist, track match, by hand** — vault_adr_0188_discogs_records_matched_track_by_track_tracklist, vault_adr_0188_discogs_records_matched_track_by_track_track_match, vault_adr_0188_discogs_records_matched_track_by_track_by_hand [EXTRACTED 1.00]
- **Vinyl scrub flow: the engine feeds the platter, which hands over to the player** — vault_adr_0192_vinyl_scrubbing_engine, vault_adr_0192_vinyl_scrubbing_platter, vault_adr_0192_vinyl_scrubbing_handover [EXTRACTED 1.00]
- **Hand-over bass: the style, then the choice, then the timeline marker** — vault_adr_0203_whose_bass_plays_in_a_hand_over_fx_bass, vault_adr_0203_whose_bass_plays_in_a_hand_over_fx_swap, vault_adr_0203_whose_bass_plays_in_a_hand_over_handover_rule, vault_adr_0203_whose_bass_plays_in_a_hand_over_bass_swap_at [EXTRACTED 1.00]
- **One mixer in two languages, held to each other by goldens** — src_core_sets_mixer, vault_adr_0204_glue_sets_crate, tests_sets_golden_test [EXTRACTED 1.00]
- **The set mix streamed from GLUE Home to the tab** — vault_adr_0204_set_sessions, vault_adr_0204_pcm_stream, src_lib_sets_home, src_workers_setplay_worker, src_workers_mixdown_worker [EXTRACTED 1.00]
- **A drop found in the lows, then the bass changes hands on it** — vault_adr_0205_hand_overs_on_the_drop_and_the_bass_by_hand_drops_from_the_lows, vault_adr_0205_hand_overs_on_the_drop_and_the_bass_by_hand_incoming_on_its_drop, vault_adr_0205_hand_overs_on_the_drop_and_the_bass_by_hand_bass_spans [EXTRACTED 1.00]
- **Timeline gestures for the bass and the selection** — vault_adr_0205_hand_overs_on_the_drop_and_the_bass_by_hand_bass_spans, vault_adr_0205_hand_overs_on_the_drop_and_the_bass_by_hand_several_selected, vault_adr_0205_hand_overs_on_the_drop_and_the_bass_by_hand_press_and_hold [EXTRACTED 1.00]
- **Verdict re-checking from stored analyses** — vault_adr_0166_glue_home_rechecks_verdicts_and_tidies_decision [EXTRACTED 1.00]
- **Engine DJ 5.3 incident led to paused writes and the XML route** — vault_system_engine_dj_5_3_incident, vault_adr_0195_glues_playlists_reach_engine_dj_as_a_rekordbox_xml_decision [INFERRED 0.75]
- **GLUE write policy formed from the drive incidents** — vault_research_engine_dj_write_back_f_only_glue_writes, vault_research_engine_dj_write_back_library_shown_as_drive, vault_research_engine_dj_write_back_glue_write_policy [INFERRED 0.75]
- **Library organization and discovery system** — src_help_library_article, vault_features_library_scanner_feature, vault_features_duplicates_feature [INFERRED 0.75]
- **Cloud sync lineage** — vault_adr_0036_optional_accounts_and_cloud_signaling_decision, vault_adr_0040_cloud_sync_and_merged_collections_decision, vault_adr_0042_merged_collection_in_the_local_library_decision, vault_adr_0043_batched_sync_and_progressive_loading_decision [INFERRED 0.85]
- **Direct link reliability under load** — remote_session_concept [INFERRED 0.85]
- **DJ library importers** — vault_features_import_traktor_feature, vault_features_import_serato_feature, vault_features_import_apple_icloud_feature [INFERRED 0.85]
- **File scanning with live updates and detection** — src_core_library_scan, quick_hash_mechanism, file_system_observer_mechanism, quick_tag_parsing [INFERRED 0.85]
- **Hallmark Console treatment: decision, shared tokens, the look it shapes, and the theme feature** — vault_adr_0191_hallmark_console_treatment_decision, vault_adr_0191_hallmark_console_treatment_tokens, vault_features_themes_feature [INFERRED 0.85]
- **Discogs: read, match, then playlists** — vault_features_discogs_reading, vault_features_discogs_track_matching, vault_features_discogs_playlists [INFERRED 0.85]
- **Integrated imported records into library with visual representation** — imported_record_matching_mechanism, waveform_thumbnails_mechanism, src_store_merge, src_core_library_thumb [INFERRED 0.85]
- **Following the playhead, off once the user looks elsewhere, on again by Play's crosshair** — vault_adr_0207_follow_playhead_until_user_looks, vault_features_sets_sets_a_playlist_mixed_exported_as_one_file [INFERRED 0.85]
- **The song's menu: fixed places, opened by a click on the song or its bass strip** — vault_adr_0207_fixed_labelled_menu_places, vault_adr_0207_bass_strip_click_opens_menu, vault_adr_0207_press_grab_450ms [INFERRED 0.85]
- **Spectrogram cache storage decision flow** — vault_research_spectrogram_size_spectrogram_storage, vault_research_spectrogram_size_encodings_tried, vault_research_spectrogram_size_compute_on_open_not_taken, vault_research_spectrogram_size_leave_as_is [INFERRED 0.85]
- **Network folder analysis optimization** — unified_progress_count_concept, network_folder_song_queuing_mechanism, tag_batch_reading_mechanism [INFERRED 0.95]
- **On-screen data loading and retry flow** — on_screen_helper_concept, retries_mechanism_concept, remote_data_fetch_concept [INFERRED 0.95]
- **Playback performance: separate port and folder-scoped lookups** — play_port_mechanism, folder_lookup_optimization_mechanism [INFERRED 0.95]

## Communities (406 total, 103 thin omitted)

### Community 0 - "engine.svelte.ts"
Cohesion: 0.03
Nodes (95): ADR-0120, ADR-0121, ber(), FP_FRAME_SEC, FP_HOP, FP_N, FP_RATE, FP_SECONDS (+87 more)

### Community 1 - "queue.rs"
Cohesion: 0.05
Nodes (43): Engine<H>, truthy(), after_analysis(), ANALYSIS_VERSION, at(), cores(), differ(), Engine<H> (+35 more)

### Community 2 - "glue-engine/src/sync.rs"
Cohesion: 0.05
Nodes (47): Engine<H>, HttpCloud, HttpCloud<'_, H>, own_devices(), send_counts(), agreed_dir(), apply_change(), base() (+39 more)

### Community 3 - "collection.ts"
Cohesion: 0.05
Nodes (50): vitest, record(), timeAsync(), Here, jsonFiles(), Shard, StoreOp, ADR-0161 (+42 more)

### Community 4 - "glue-interop/src/sync.rs"
Cohesion: 0.06
Nodes (62): base_name(), Engine<H>, GLUE_FOLDER, items_of(), keep_unsent(), kept_in(), kept_lists(), kept_lists_are_the_ones_marked_and_what_their_folders_hold() (+54 more)

### Community 5 - "merge.ts"
Cohesion: 0.04
Nodes (90): ADR-0169, FileEntry, Linkable, matchTracks(), segs(), fillInfo(), formatOf(), INFO_FIELDS (+82 more)

### Community 6 - "library.svelte.ts"
Cohesion: 0.03
Nodes (55): ADR-0044, dropIntoLibrary(), hasFiles(), needing, onDrop(), ADR-0044, API_BASE, CloudDevice (+47 more)

### Community 7 - "GLUE vault index"
Cohesion: 0.03
Nodes (80): ADR-0018, ADR-0026, ADR-0105, legacy/index.html, src/lib/library.svelte, src/platform, src_ui_GlueStick, ADR 0007: Web-first platform layer (+72 more)

### Community 8 - "Host"
Cohesion: 0.06
Nodes (9): changed_over(), command(), Engine<H>, get(), Host, iso(), Job, key() (+1 more)

### Community 9 - "trackMenu.ts"
Cohesion: 0.04
Nodes (66): ADR-0067, ids(), TIPS, ADR-0126, tourById(), ListEntry, listTree, firstName() (+58 more)

### Community 10 - "App"
Cohesion: 0.06
Nodes (29): a_collection_read_today_without_its_tracklists_gets_them_without_reading_the_list_again(), discogs_is_asked_last_with_the_token_and_only_its_api_gets_it(), engine(), H, item(), looked_up(), nothing_found_before_the_token_is_looked_up_again(), PNG (+21 more)

### Community 11 - "CollectionStore"
Cohesion: 0.06
Nodes (55): ADR-0108, ADR-0108, ADR-0108, ADR-0108, ADR-0108, adopt(), Adopted, freeId() (+47 more)

### Community 12 - "enginedb.rs"
Cohesion: 0.07
Nodes (47): ancestors(), depth(), Engine<H>, holds(), insert_with_id(), l(), tree_at(), uuid_of() (+39 more)

### Community 13 - "player.svelte.ts"
Cohesion: 0.05
Nodes (47): three, beatsBetween(), fmtDb(), fmtKHz(), fmtTime(), freqLabel(), niceStep(), niceTimeStep() (+39 more)

### Community 14 - "src/discogs.rs"
Cohesion: 0.06
Nodes (32): AGAIN_MS, API, cached_of(), Engine<H>, file_of(), lacks(), NO_ART, PAGE (+24 more)

### Community 15 - "djdrive.rs"
Cohesion: 0.06
Nodes (36): apply(), DriveState, e(), Engine<H>, folder(), folder_now(), folder_songs(), key() (+28 more)

### Community 16 - "GLUE Cloud: accounts, GLUE Home and devices"
Cohesion: 0.03
Nodes (64): ADR-0098, ADR-0115, ADR-0150, ADR-0077, ADR-0150, ADR-0150, ADR-0077, ADR-0115 (+56 more)

### Community 17 - "Welcome.svelte"
Cohesion: 0.03
Nodes (52): ADR-0151, ADR-0151, HOME_DOWNLOADS, homeOs, homePairLink(), inWindow(), RELEASES, ADR-0151 (+44 more)

### Community 18 - "prepare.svelte.ts"
Cohesion: 0.06
Nodes (45): ADR-0052, beatGrid(), ADR-0052, CuePoint, BpmRange, fmtBpm(), foldInto(), shownBpm() (+37 more)

### Community 19 - "view.svelte.ts"
Cohesion: 0.05
Nodes (46): KeyNotation, Facet, FacetItem, facetItems(), facetKey(), FACETS, facetValue(), inFacet() (+38 more)

### Community 20 - "player"
Cohesion: 0.05
Nodes (18): Prepare help article, Beat grid (help), Cues and loops (help), In your DJ apps (help), Scrubbing like vinyl (help), PROCESSOR, mediaError(), player (+10 more)

### Community 21 - "parse.rs"
Cohesion: 0.12
Nodes (39): AAC_SR, add_tag(), apply_stream_info(), Bytes, Bytes<'a>, decode_id3_text(), ext80(), find() (+31 more)

### Community 22 - "tests/engine.rs"
Cohesion: 0.09
Nodes (40): a_collection_deleted_from_the_account_is_backed_up_and_put_away(), a_collection_is_tidied_when_it_opens(), a_job_removes_songs_and_their_copies(), a_shared_collection_is_put_right_once_with_a_backup(), a_song_that_cant_go_to_engine_dj_stays_in_glues_playlist_and_says_why(), an_analysis_running_while_its_tags_are_written_takes_the_new_date(), an_edit_is_saved_and_told(), C (+32 more)

### Community 23 - "writePref()"
Cohesion: 0.05
Nodes (28): threejs-visualisers, AppState, ColDef, ColKey, columns, DEFAULT_HIDDEN, DEFAULT_ORDER, load() (+20 more)

### Community 24 - "shared/engine.ts"
Cohesion: 0.08
Nodes (44): isObj(), merge3(), mergeBoth(), Merged, mergeSequence(), mergeSets(), mergeValue(), same() (+36 more)

### Community 25 - "stems.svelte.ts"
Cohesion: 0.06
Nodes (41): ADR-0003, ADR-0004, fmtEta(), encodeWav(), LEGACY_MODEL_CACHE, MODEL_CACHE, MODEL_FILE, MODEL_SIZE (+33 more)

### Community 26 - "discogsBuild.svelte.ts"
Cohesion: 0.07
Nodes (36): ADR-0189, discogsAuto(), DiscogsRules, isVinyl(), itemOf(), lower(), NO_RULES, parseRef() (+28 more)

### Community 27 - "nowPlaying.svelte.ts"
Cohesion: 0.07
Nodes (33): Full player bar, facetInfo(), advance(), back(), clear(), dequeue(), EMPTY_QUEUE, enqueue() (+25 more)

### Community 28 - "Store<D>"
Cohesion: 0.11
Nodes (14): BinEntry, get(), id_of(), LoadOpts, migrate(), num(), OUTDATED, random_id() (+6 more)

### Community 29 - "glue-engine/src/tags.rs"
Cohesion: 0.06
Nodes (22): Cover, cover_of(), from_image(), jpeg(), LARGE, picture(), picture_from(), SMALL (+14 more)

### Community 30 - "Library"
Cohesion: 0.04
Nodes (41): ADR-0146, ADR-0162, ADR-0162, ADR-0162, ADR-0090, ADR-0090, ADR-0094, ADR-0162 (+33 more)

### Community 31 - "Playlists, folders & smart lists"
Cohesion: 0.05
Nodes (44): ADR-0178, ADR-0180, ADR-0062, Engine DJ backup strategy, crates/glue-interop, Playlist Order Sync, Engine DJ Songs Relinking, ADR-0062 (+36 more)

### Community 32 - "ADR 0194: GLUE doesn't write into Engine DJ (writes off unless switched on)"
Cohesion: 0.04
Nodes (41): ADR-0194, enginedj::fix_folders, folders_own, ADR-0195, ADR-0194, ADR-0195, ADR-0194, ADR-0195 (+33 more)

### Community 33 - "Track"
Cohesion: 0.09
Nodes (13): covers, CoverSize, ADR-0131, dock, Direct, fileAt(), listFiles(), split() (+5 more)

### Community 34 - "set.svelte.ts"
Cohesion: 0.07
Nodes (22): bpmInUse(), PlanOptions, SetPlan, SetStyle, bpmOf(), bpmShown(), main(), byRecord (+14 more)

### Community 35 - "api.ts"
Cohesion: 0.15
Nodes (39): ACCESS_TTL, attach(), authed(), bad(), browserSession(), claim(), CODE_TTL, computerOf() (+31 more)

### Community 36 - "store.golden.test.ts"
Cohesion: 0.05
Nodes (48): ADR-0152, GLUE Home build and release workflow (home.yml), ADR-0100, ADR-0100, ADR-0100, common(), copy(), damaged (+40 more)

### Community 37 - "events.ts"
Cohesion: 0.08
Nodes (29): ADR-0074, ADR-0074, ADR-0074, blankEvent(), daysUntil(), eventDay(), EventStatus, folderName() (+21 more)

### Community 38 - "parse.ts"
Cohesion: 0.10
Nodes (44): pick(), CLUES, scanClues(), AAC_SR, addTag(), blankInfo(), decodeId3Text(), ext80() (+36 more)

### Community 39 - "tests/room.rs"
Cohesion: 0.09
Nodes (16): a_silent_room_is_connected_again(), a_start_overtaken_by_stop_says_nothing(), Calls, FakePeers, FakeSocket, full_refused_and_the_same_tab_replaces_its_own(), H, offer() (+8 more)

### Community 40 - "auto.svelte.ts"
Cohesion: 0.08
Nodes (35): AutoOptions, Candidate, Harmonic, SeedRole, insights, InsightTrack, tagOverlap(), addTags() (+27 more)

### Community 41 - "mixer.ts"
Cohesion: 0.06
Nodes (31): CLAUDE.md: GLUE project rules, Biquad, Echo, Isolator, LR4, OneKnob, resample(), ADR-0199 (+23 more)

### Community 42 - "app.svelte.ts"
Cohesion: 0.07
Nodes (42): ADR-0119, article(), beyondWall(), classify(), declaredLabel(), detectCutoff(), EXPECTED, expectedCutoff() (+34 more)

### Community 43 - "glue-interop/src/types.rs"
Cohesion: 0.08
Nodes (24): parse_library_files(), array_index(), base_name(), collate(), CuePoint, decode_uri_component(), EngineSet, Grid (+16 more)

### Community 44 - "platform/index.ts"
Cohesion: 0.07
Nodes (40): ADR-0007, fmtBytes(), cleanUp(), browserHome(), canPickFolders(), cleanDuplicates(), Dir, droppedFolder() (+32 more)

### Community 45 - "homemode.spec.ts"
Cohesion: 0.10
Nodes (25): test, test, errors, MUSIC, test, ADR-0141, launch(), OFF (+17 more)

### Community 46 - "analyze.ts"
Cohesion: 0.08
Nodes (37): ADR-0006, analyzeMusic(), analyzeSamples(), computeSpectrum(), decimate(), FrameReader, makePcmReader(), monoOf() (+29 more)

### Community 47 - "ADR 0170: Engine DJ kept in step both ways: cues, loops and the beat grid"
Cohesion: 0.09
Nodes (36): ADR-0168, beatData(), colour(), hex(), loops(), performance(), quickCues(), Reader (+28 more)

### Community 48 - "read_json()"
Cohesion: 0.12
Nodes (10): Dir, FsDir, MemDir, read_json(), ReadError, Damaged, Io, temp_for() (+2 more)

### Community 49 - "Sets: a playlist mixed, exported as one file"
Cohesion: 0.06
Nodes (35): ADR-0202, ADR-0206, Hand-over chip box on the timeline, Layer hand-over style (8-bar rise without bass, then bass swap), part(), Mixing a set, Hand-overs in a set, The set's timeline and song menu (+27 more)

### Community 50 - "rtc.rs"
Cohesion: 0.08
Nodes (7): answer(), App, Conns, new(), Playing, RECEIVING, SERVING

### Community 51 - "library/analysis.ts"
Cohesion: 0.07
Nodes (33): ADR-0103, afterAnalysis(), analysisState, gaveUp(), isTransient(), needsAnalysis(), ADR-0103, ADR-0109 (+25 more)

### Community 52 - "relink.ts"
Cohesion: 0.09
Nodes (35): fileName(), bare(), fold(), lower(), SAME_MARK, saysNothing(), songName(), spaced() (+27 more)

### Community 53 - "backup.ts"
Cohesion: 0.09
Nodes (20): ZipEntry, AUTO_DIR, AUTO_KEEP, autoBackup(), BACKUP_FORMAT, BACKUP_VERSION, BackupManifest, buildBackup() (+12 more)

### Community 54 - "DuplicatesView.svelte"
Cohesion: 0.05
Nodes (28): tick(), canClean, cleaning, doubtful, hidden, includeDoubtful, limit, pickedGroups (+20 more)

### Community 55 - "library.rs"
Cohesion: 0.12
Nodes (15): away(), Engine<H>, exists(), HEX, INCOMING_ROOT, is_away(), join(), newly_found() (+7 more)

### Community 56 - "local.rs"
Cohesion: 0.08
Nodes (27): an_analysis_read_waits_while_a_song_plays_then_goes_on(), answer(), busy_for_test(), BUSY_UNTIL, decode(), EDITS, FOREGROUND_AT, handle() (+19 more)

### Community 57 - "LibraryView.svelte"
Cohesion: 0.07
Nodes (15): djEntries(), djEntryOf(), glueSong(), ADR-0179, kind(), djAdd(), drag, Payload (+7 more)

### Community 58 - "Store"
Cohesion: 0.16
Nodes (22): arr(), copies(), get(), glue_path(), GONE_AFTER, import_lists(), Importer, Importer<'_, D> (+14 more)

### Community 59 - "shared.svelte.ts"
Cohesion: 0.11
Nodes (18): Counts, countsOf(), holdsMusic(), sendCounts(), ADR-0112, Clash, askDeleteShared(), at() (+10 more)

### Community 60 - "localHome"
Cohesion: 0.08
Nodes (24): attachHere(), ADR-0091, ADR-0108, connect(), discover(), hello(), localHome, ports() (+16 more)

### Community 61 - ".serve()"
Cohesion: 0.15
Nodes (8): Chan, Host, now_ms(), put_keys(), Server<H>, settings(), Song, unframe()

### Community 62 - "thumbs.svelte.ts"
Cohesion: 0.07
Nodes (26): ADR-0024, OnScreen and Retries, makeThumb(), makeWaveThumb(), THUMB_H, THUMB_W, ADR-0031, WAVE_BYTES (+18 more)

### Community 63 - "Automatic playlists (feature)"
Cohesion: 0.06
Nodes (39): ADR-0029, ADR-0059, ADR-0032, ADR-0032, DJ libraries (help article), Kept in step both ways with Engine DJ (paused), Libraries followed live, GLUE's playlists in Engine DJ (+31 more)

### Community 64 - "ws.rs"
Cohesion: 0.07
Nodes (19): allowed(), get(), get_with(), host_of(), HOSTS, IMAGE_HOSTS, MAX, sends() (+11 more)

### Community 65 - "remoteFiles.svelte.ts"
Cohesion: 0.08
Nodes (34): ADR-0087, Conn, MockHome, putKeys(), rtc(), sendFile(), serve(), tell() (+26 more)

### Community 66 - "Player"
Cohesion: 0.06
Nodes (37): AIFF format handling, Audio element management, Deferred track page loading, ADR-0076, ADR-0076, ADR-0088, GLUE Home song port, iPhone playback support (+29 more)

### Community 67 - "analysis.worker.ts"
Cohesion: 0.08
Nodes (30): Background analysis worker pool, ADR-0072, mediabunny, FileInfo, ADR-0072, ADR-0072, decodeQueue, PoolResult (+22 more)

### Community 68 - "discogsBuild.ts"
Cohesion: 0.09
Nodes (25): ADR-0190, rng(), BUILD_DEFAULTS, buildDiscogs(), BuildOptions, BuildResult, DgCandidate, Have (+17 more)

### Community 69 - "guide.test.ts"
Cohesion: 0.10
Nodes (19): Article, esc(), inline(), parseArticle(), renderMarkdown(), safeHref(), searchArticles(), ADR-0126 (+11 more)

### Community 70 - "shared.ts"
Cohesion: 0.10
Nodes (36): MAX_BUNDLE, MAX_BUNDLE_PATHS, MAX_BYTES, MAX_FILE, SyncError, append(), bin(), bundle() (+28 more)

### Community 71 - "verdict.rs"
Cohesion: 0.12
Nodes (27): article(), at(), Beyond, beyond_wall(), classify(), detect_cutoff(), expected_cutoff(), expected_table() (+19 more)

### Community 72 - "H"
Cohesion: 0.11
Nodes (6): call(), H, main(), PagePeers, say(), State

### Community 73 - "Engine<H>"
Cohesion: 0.14
Nodes (4): Engine<H>, now(), room_loop(), max_of()

### Community 74 - "dsp.rs"
Cohesion: 0.09
Nodes (18): at(), Biquad, BW, cubic_at(), Echo, fl(), Isolator, Limiter (+10 more)

### Community 75 - "covers.rs"
Cohesion: 0.13
Nodes (22): enc(), Engine<H>, GAP, js_len(), kept_at(), lookup_key(), norm(), now() (+14 more)

### Community 76 - "protocol.rs"
Cohesion: 0.09
Nodes (7): a_device_asks_and_sends(), Client, H, Mem, next_text(), Sink, the_relays_servers_are_taken()

### Community 77 - "signal.ts"
Cohesion: 0.10
Nodes (14): Att, ClientMsg, Env, prepare(), RoomMsg, Signal, STALE, State (+6 more)

### Community 78 - "ADR 0040: Cloud sync of library data, merged collections, and edits that reach the owning device"
Cohesion: 0.06
Nodes (32): ADR-0040, ADR-0089, ADR-0097, ADR-0095, src_core_library_cloudEdits, src_core_library_mergeCollections, ADR-0097, ADR-0042 (+24 more)

### Community 79 - "ref_node_url"
Cohesion: 0.06
Nodes (17): errors, fixtures, files, FIX, OUT, ADR-0147, End-to-end tests workflow (GitHub Actions), ADR-0044 (+9 more)

### Community 80 - "ADR 0046: GLUE Home keeps and shares the analyses; TO BE SORTED lists its incoming folder"
Cohesion: 0.06
Nodes (32): ADR-0045, ADR-0047, ADR-0048, ADR-0045, ADR-0046, ADR-0082, ADR-0085, ADR-0046 (+24 more)

### Community 81 - "fakeHome.ts"
Cohesion: 0.06
Nodes (28): ADR-0159, ADR-0158, FakeHomeDirs, ADR-0070, ADR-0141, ADR-0154, ADR-0157, ADR-0158 (+20 more)

### Community 82 - "remoteFiles"
Cohesion: 0.13
Nodes (6): incomingKey(), playsNatively(), typeOfName(), companionOnline(), remoteFiles, streamsReady()

### Community 83 - "interop/types.ts"
Cohesion: 0.16
Nodes (29): parseAppleLibrary(), plistValue(), PV, parseM3u(), parseRekordboxXml(), MAJOR, nmlPath(), parseTraktorNml() (+21 more)

### Community 84 - "ADR 0036: Optional accounts and a small free cloud service (Cloudflare) for devices and signaling"
Cohesion: 0.06
Nodes (26): ADR-0091, ADR-0036, ADR-0081, ADR-0091, ADR-0036, ADR-0091, ADR-0036, ADR-0091 (+18 more)

### Community 85 - "parse_engine_db()"
Cohesion: 0.14
Nodes (14): Cell, Blob, Null, Num, Text, cols(), combine_engine(), combine_engine_with_tree() (+6 more)

### Community 86 - "merge.rs"
Cohesion: 0.14
Nodes (18): apply_import(), blank_lib_track(), carried_engine(), CuePoint, fill_info(), has_file(), ImportedLibrary, ImportedTrack (+10 more)

### Community 87 - "tauri.conf.json"
Cohesion: 0.06
Nodes (33): app, security, windows, build, devUrl, frontendDist, bundle, active (+25 more)

### Community 88 - "autoplaylist.ts"
Cohesion: 0.11
Nodes (28): AutoResult, Beam, bpmFit(), energyFit(), flowAt(), FLOWS, generate(), replaceSlot() (+20 more)

### Community 89 - "Background analysis"
Cohesion: 0.07
Nodes (25): analysisState, follow_moves, GLUE Home native analysis engine (glue-audio), tidy_cache (GLUE Home service), ADR-0019, ADR-0019, ADR-0019, 0147. GLUE Home analyses natively, in Rust (+17 more)

### Community 90 - "glue-audio/src/types.rs"
Cohesion: 0.15
Nodes (27): AnalysisResult, AnalysisSummary, Clue, Cutoff, Depth, Expected, FileInfo, Finding (+19 more)

### Community 91 - "text()"
Cohesion: 0.20
Nodes (14): edits_show_on_the_tree(), Engine<H>, find(), insert(), items_in(), names(), OPS, order_before() (+6 more)

### Community 92 - "ADR 0086: GLUE Home looks up missing covers on public services"
Cohesion: 0.07
Nodes (28): ADR-0086, ADR-0186, ADR-0086, ADR-0186, ADR-0086, ADR-0086, Covers from Discogs (help), ADR-0086 (+20 more)

### Community 93 - "ADR 0197: Give every song a sound profile: loudness, busyness, timbre and loudness over time"
Cohesion: 0.07
Nodes (28): ADR-0198, ADR-0197, ADR-0198, ADR-0197, ADR-0197, Building a playlist, Flow, ADR-0197 (+20 more)

### Community 94 - "account"
Cohesion: 0.13
Nodes (3): passwordKey(), account, browserName()

### Community 95 - "setplay.worker.ts"
Cohesion: 0.10
Nodes (25): MIX_RATE, ADR-0201, ADR-0199, Asker, SongAnswer, SongQuestion, ADR-0199, asker (+17 more)

### Community 96 - "analyze.rs"
Cohesion: 0.12
Nodes (19): analyze_music(), analyze_samples(), compute_spectrum(), decimate(), gauss(), Job, Demo, Float (+11 more)

### Community 97 - "store/types.ts"
Cohesion: 0.08
Nodes (24): djValues, listsByTrack(), InfoField, Severity, NO_DJ, NO_LISTS, CollectionRef, Prep (+16 more)

### Community 98 - "Feature: Library & scanner"
Cohesion: 0.09
Nodes (17): describeRemoval(), orphans(), removalImpact, ADR-0111, Entries, findFile(), scanFolder(), ScannedFile (+9 more)

### Community 99 - "tests/answers.rs"
Cohesion: 0.13
Nodes (12): a_songs_parts_made_when_asked_then_kept(), C, covers_looked_up_once_gently_and_refused_for_good(), data(), H, put(), Seen, setup() (+4 more)

### Community 100 - "files.rs"
Cohesion: 0.10
Nodes (20): analysed(), analysed_failed(), decode_details(), details(), DETAILS_VERSION, fingerprint_file(), format_of(), MAX_ROWS (+12 more)

### Community 101 - "src/room.rs"
Cohesion: 0.09
Nodes (12): API, enc(), Peers, Received, Closed, Nothing, Text, Room (+4 more)

### Community 102 - "glue-sets/tests/golden.rs"
Cohesion: 0.11
Nodes (13): main(), Songs, tone(), Case, DIR, File, floats(), mixes_as_the_typescript_does() (+5 more)

### Community 103 - "project.rs"
Cohesion: 0.20
Nodes (22): analysis_here(), analysis_shared(), collection_here(), collection_shared(), COPY_FIELDS, dedup(), get(), Here (+14 more)

### Community 104 - "mixdown.worker.ts"
Cohesion: 0.11
Nodes (24): ADR-0199, pcm24(), wavHeader(), ADR-0199, framer(), ADR-0199, ADR-0199, SavePicker (+16 more)

### Community 105 - "disk.rs"
Cohesion: 0.17
Nodes (15): cfg_path(), check(), colons_and_backslashes_only_matter_on_windows(), describe(), fail(), handle(), inside(), io_fail() (+7 more)

### Community 106 - "route.svelte.ts"
Cohesion: 0.07
Nodes (21): parse(), Route, router, trackTab, TrackTabs, #each(), address, city (+13 more)

### Community 107 - "Mixer"
Cohesion: 0.10
Nodes (6): Deck, H, Mixer, Pcm, Sources, TAIL

### Community 108 - "users"
Cohesion: 0.11
Nodes (22): attempts, credentials, credentials_device, devices, devices_user, identities, pairing_codes, users (+14 more)

### Community 109 - "sharedCloud.ts"
Cohesion: 0.13
Nodes (24): Deps, b64url(), enc, GoogleClaims, googleKeys(), hmacKey(), json(), JwkSet (+16 more)

### Community 110 - "ADR 0174: Another computer's songs stream as they arrive, and their start says where its time went"
Cohesion: 0.07
Nodes (25): ADR-0174, ADR-0175, public/glue-stream-sw.js, Help article: GLUE on your phone, ADR-0175, ADR-0175, ADR-0174, describeStart() (+17 more)

### Community 111 - "Session"
Cohesion: 0.18
Nodes (5): Engine<H>, Have, Session, Sets, Songs

### Community 112 - "ADR 0187: The Discogs collection: read by GLUE Home, kept in the profile, matched on the page"
Cohesion: 0.08
Nodes (24): ADR-0188, ADR-0187, Discogs help article, ADR-0187, ADR-0187, ADR-0188, tracks(), 0187. The Discogs collection: read by GLUE Home, kept in the profile, matched on the page (+16 more)

### Community 113 - "ADR 0201: A set shaped by hand on its timeline, heard live from a worker, with headroom where songs "
Cohesion: 0.13
Nodes (27): ADR-0205, clamped(), clearLows(), end(), Lengths, moveEnd(), moveSong(), moveSongs() (+19 more)

### Community 114 - "sync.golden.test.ts"
Cohesion: 0.14
Nodes (17): fakeCloud(), SharedCloudServer, asDir(), Call, Golden, J(), lapEdit(), memDir() (+9 more)

### Community 115 - "analyse()"
Cohesion: 0.17
Nodes (12): analyse(), analyse_demo(), Analysis, Compressed, decode_compressed(), decode_song(), ext_of(), Failure (+4 more)

### Community 116 - "admin.ts"
Cohesion: 0.11
Nodes (24): AdminError, count(), maintenance(), N, route(), sessions(), stats(), TIERS (+16 more)

### Community 117 - "dsd.rs"
Cohesion: 0.16
Nodes (22): a_dsf_file_is_analysed(), a_dsf_sine_comes_out_as_that_sine_at_88_2_khz(), BYTES1, channel_bytes(), decode(), Dsd, dsf_sine(), factor() (+14 more)

### Community 118 - "glue-engine/src/dupes.rs"
Cohesion: 0.17
Nodes (21): a_fingerprint_reads_as_the_website_writes_it(), build_groups(), certainty(), concerns(), copy_score(), decode(), FP_FRAME_SEC, group_key() (+13 more)

### Community 119 - "flac.ts"
Cohesion: 0.14
Nodes (18): Bits, BLOCK, decodeFlac(), fixed(), flacHeader(), FlacInfo, FlacPcm, frame() (+10 more)

### Community 120 - "ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust"
Cohesion: 0.10
Nodes (27): ADR-0030, ADR-0020, ADR-0167, ADR-0167, ADR-0167, ADR-0030, ADR-0167, ADR-0030 (+19 more)

### Community 121 - "lib/perf.ts"
Cohesion: 0.13
Nodes (15): enablePerf(), perfStats(), resetPerf(), Stat, stats, takeFrameWork(), describe(), Interaction (+7 more)

### Community 122 - "ADR 0094: One shared collection in GLUE Cloud, the same on every device"
Cohesion: 0.07
Nodes (26): ADR-0094, ADR-0094, ADR-0094, ADR-0094, ADR-0096, ADR-0096, ADR-0094, ADR-0094 (+18 more)

### Community 123 - "Disk"
Cohesion: 0.15
Nodes (4): Disk, Fwd, main(), Probe

### Community 124 - "GuideLayer.svelte"
Cohesion: 0.08
Nodes (19): Go, guideTargets(), Place, Pose, Tour, TOURS, TourStep, ADR-0126 (+11 more)

### Community 126 - "PhoneSongs.svelte"
Cohesion: 0.09
Nodes (21): order(), at, cues, down(), dur, frac(), hot, move() (+13 more)

### Community 127 - "interop.golden.test.ts"
Cohesion: 0.15
Nodes (23): be64(), beats(), cases(), cat(), cp1252, crate(), enc(), engineDrive() (+15 more)

### Community 128 - "flac.rs"
Cohesion: 0.20
Nodes (13): Bits, BLOCK, decode_flac(), fixed(), flac_header(), FlacInfo, FlacPcm, frame() (+5 more)

### Community 129 - ".answer()"
Cohesion: 0.25
Nodes (6): Answer, Data, File, data(), Engine<H>, ids()

### Community 130 - "djsync.rs"
Cohesion: 0.15
Nodes (8): busy(), ENGINE_APPS, Engine<H>, engine_writes(), has_col(), mtime(), Song, Synced

### Community 131 - "verify.rs"
Cohesion: 0.14
Nodes (11): bit_errors(), bytes_off(), Check, Engine<H>, fresh(), HEX, near(), same() (+3 more)

### Community 132 - "Pv"
Cohesion: 0.15
Nodes (12): HEAD, parse_apple_library(), Pv, Arr, Bool, Dict, Null, Num (+4 more)

### Community 133 - "ADR 0061: Songs go onto the drag dock by dragging them there too"
Cohesion: 0.10
Nodes (23): ADR-0027, ADR-0054, ADR-0061, ADR-0054, ADR-0056, ADR-0061, ADR-0054, ADR-0056 (+15 more)

### Community 134 - "ADR 0196: GLUE's playlists reach Engine DJ through a library of GLUE's own, shown as a drive"
Cohesion: 0.08
Nodes (20): ADR-0196, ADR-0049, ADR-0049, ADR-0196, ADR-0196, ADR-0049, ADR 0010: Read-only import and file export before any write-back, GLUE's library shown as drive Z: (subst) (+12 more)

### Community 135 - "themes.svelte.ts"
Cohesion: 0.11
Nodes (11): svelte, CONSOLE, loadedFonts, loadFonts(), Mode, themeById(), themeCss(), ThemeDef (+3 more)

### Community 136 - "imports.ts"
Cohesion: 0.16
Nodes (20): sql.js, isAppleLibrary(), cols(), combineEngine(), engineKey(), isSqlite(), libOf(), linkedOrder() (+12 more)

### Community 137 - "covers.golden.test.ts"
Cohesion: 0.16
Nodes (22): CoverQuery, lookupKey(), norm(), pick(), queryOf(), quote(), same(), sameArtist() (+14 more)

### Community 138 - "DiscogsView.svelte"
Cohesion: 0.10
Nodes (20): addToDiscogsList(), discogsListPicker(), newDiscogsListWith(), openDiscogsList(), plural(), choose(), chosen, chosenMatch (+12 more)

### Community 139 - "serde_json"
Cohesion: 0.11
Nodes (3): root(), run(), the_store_writes_what_the_website_writes()

### Community 140 - "Engine"
Cohesion: 0.09
Nodes (5): Done, Engine, Feed, FULL_EVERY, JOBS

### Community 141 - "Engine<H>"
Cohesion: 0.21
Nodes (3): Engine<H>, ms(), running()

### Community 142 - "parse_serato_database()"
Cohesion: 0.19
Nodes (16): build_serato_library(), get(), minutes(), parse_serato(), parse_serato_crate(), parse_serato_database(), serato_path(), SField (+8 more)

### Community 143 - "bridge.ts"
Cohesion: 0.09
Nodes (17): ADR-0083, Activity, API, askYesNo(), bridge, openFolder(), openUrl(), pickFolder() (+9 more)

### Community 144 - "phone.spec.ts"
Cohesion: 0.09
Nodes (16): ADR-0156, ADR-0155, ADR-0156, ADR-0156, ADR-0155, test, texts(), ADR-0155 (+8 more)

### Community 145 - "sets.test.ts"
Cohesion: 0.14
Nodes (9): lengthOf(), Knot, knotsOf(), TempoMap, tempoOf(), clock(), timesOf(), tracklist() (+1 more)

### Community 146 - "src/profiles.ts"
Cohesion: 0.12
Nodes (21): ADR-0113, Alias, color(), create(), list(), merge(), name(), one() (+13 more)

### Community 147 - "js.rs"
Cohesion: 0.10
Nodes (4): fixed_num(), grouped(), num_str(), to_fixed()

### Community 148 - "decode.ts"
Cohesion: 0.12
Nodes (19): ADR-0060, ADR-0060, ADR-0147, KeepInput, keepRange(), mp4Edit(), ADR-0060, mp3Gapless() (+11 more)

### Community 149 - "package.json"
Cohesion: 0.08
Nodes (21): autostart(), onPairLink(), allowScripts, github:festanqueiro/threejs-visualisers#3a85cac1d9db9d8c3ba30a5f65d90831f137944b, description, name, private, type (+13 more)

### Community 150 - "importActions.ts"
Cohesion: 0.16
Nodes (21): APPS, importDetected(), importFiles(), importFound(), importSeratoFolder(), importWithHome(), pickSeratoFolder(), refreshWithFile() (+13 more)

### Community 151 - "merge3.rs"
Cohesion: 0.21
Nodes (15): arr(), Clash, Kind, Analysis, Collection, Other, Tracks, merge3() (+7 more)

### Community 152 - "tidy.rs"
Cohesion: 0.22
Nodes (10): file_key(), FileEntry, get(), Linkable, LOOSE, match_tracks(), NUMBERED, s() (+2 more)

### Community 153 - "Performance"
Cohesion: 0.10
Nodes (18): ADR-0078, ADR-0078, ADR-0058, ADR-0078, ADR-0078, ?perf performance panel, ADR-0058, ADR-0058 (+10 more)

### Community 154 - "keys.ts"
Cohesion: 0.16
Nodes (16): camelotNum(), fifthsPos(), harmonicNeighbours(), keyAt(), keyLabel(), MAJOR_NAMES, MINOR_NAMES, shortMusical() (+8 more)

### Community 155 - "glue-rtc/src/lib.rs"
Cohesion: 0.12
Nodes (10): CHUNK, Conn, frame(), Handler, HIGH_WATER, MAX_FILE, MAX_RANGE, safe_part() (+2 more)

### Community 156 - ".dj_check()"
Cohesion: 0.26
Nodes (4): Engine<H>, find_libraries(), Found, mtime()

### Community 157 - "service.rs"
Cohesion: 0.13
Nodes (10): AUTO_DIR, AUTO_KEEP, CACHED, HEX, newly_found(), size_text(), song_ids(), St (+2 more)

### Community 158 - "xml.rs"
Cohesion: 0.15
Nodes (9): is_space(), ATTR, decode_entities(), ENTITY, parse_int(), parse_xml(), reads_what_the_website_reads(), SP (+1 more)

### Community 159 - "ADR 0191: Give every theme Hallmark's Console treatment: the colours kept, the type and surfaces mad"
Cohesion: 0.10
Nodes (20): ADR-0028, ADR-0191, GLUE website HTML shell (index.html), Google Fonts loaded by the shell: Archivo, Host Grotesk, Atkinson Hyperlegible Mono, Parts, ADR 0028: Themes: one token table, dark and light for each, 0191. Give every theme Hallmark's Console treatment: the colours kept, the type and surfaces made one system, Alternatives considered (+12 more)

### Community 160 - "ADR 0179: Engine DJ's own playlists, and its songs' info, edited from GLUE"
Cohesion: 0.09
Nodes (20): ADR-0071, ADR-0179, ADR-0071, ADR-0179, ADR-0179, ADR-0179, ADR-0071, ADR-0179 (+12 more)

### Community 161 - "dock.rs"
Cohesion: 0.20
Nodes (13): changed(), clear(), current(), DOCK, dock_add(), dock_clear(), dock_items(), dock_remove() (+5 more)

### Community 162 - "AppHandle"
Cohesion: 0.23
Nodes (17): activity_now(), cache_path(), cache_put(), config_path(), default_incoming(), device_name(), find_glue(), find_glue_folder() (+9 more)

### Community 163 - "golden.test.ts"
Cohesion: 0.16
Nodes (15): analysed, b64(), golden(), inflate(), sha256(), AnalysisPool, withDecoder(), encodeFingerprint() (+7 more)

### Community 164 - "Mixer"
Cohesion: 0.11
Nodes (12): cubicAt(), Limiter, Mixer, 0199. A set is a playlist laid out on one beat clock, mixed by one engine for the preview and the file, Alternatives considered, Consequences, Context, 0201. A set shaped by hand on its timeline, heard live from a worker, with headroom where songs play together (+4 more)

### Community 165 - "SetLanes.svelte"
Cohesion: 0.12
Nodes (11): edited(), depth(), apply(), lowUp(), move(), rulerDown(), seekAt(), setBass() (+3 more)

### Community 166 - "djWatch.svelte.ts"
Cohesion: 0.14
Nodes (13): AnyFile, Dir, DjState, djWatch, homeFollows(), placeDir(), stat(), ADR-0063 (+5 more)

### Community 167 - "signal.rs"
Cohesion: 0.14
Nodes (3): open(), Room, tcp()

### Community 168 - "downloads.svelte.ts"
Cohesion: 0.21
Nodes (18): PlanItem, PlanList, planLists(), PlanSong, planSongs(), safeName(), ADR-0193, unique() (+10 more)

### Community 169 - "analyse_into()"
Cohesion: 0.14
Nodes (7): analyse_into(), key(), now_iso(), on_own_thread(), read_whole(), time_for(), wave_of()

### Community 170 - "js_keys()"
Cohesion: 0.22
Nodes (13): index_key(), js_gt(), js_keys(), locale_cmp(), num_str(), parse(), pretty(), quote() (+5 more)

### Community 171 - "libraries.rs"
Cohesion: 0.22
Nodes (10): CACHE, find(), Found, home(), is_library(), json(), look(), picked() (+2 more)

### Community 172 - "make-audio.ts"
Cohesion: 0.11
Nodes (17): DUPLICATE, encode(), entries, EXT, ff(), FILES, hz(), MAJOR (+9 more)

### Community 173 - "decode.rs"
Cohesion: 0.14
Nodes (5): decode(), Decoded, keep_range(), mp4_edit(), push()

### Community 174 - "reminders.rs"
Cohesion: 0.24
Nodes (11): at(), day_key(), days_until(), ev(), message(), needs_music(), needs_music_as_the_website_says(), parse_local() (+3 more)

### Community 175 - "ADR 0063: DJ libraries are browsed live; playlists come into GLUE on demand and stay linked"
Cohesion: 0.10
Nodes (19): ADR-0065, ADR-0063, ADR-0065, ADR-0063, ADR-0063, ADR-0063, ADR-0065, ADR-0063 (+11 more)

### Community 176 - "main.rs"
Cohesion: 0.14
Nodes (10): File read folder lookup: resolve each folder only once, remember for 10 min, CONFIG, follow_windows(), LIBRARY_URL, main(), open_glue(), open_library(), open_settings() (+2 more)

### Community 177 - "lib/analysis.ts"
Cohesion: 0.21
Nodes (17): Waveform, ProgressFn, analysisWorker(), analyze(), decodeAudio(), decodedByWorker(), fingerprintOf(), NeedsPageDecode (+9 more)

### Community 178 - "sets/types.ts"
Cohesion: 0.15
Nodes (17): bassSwapAt(), clamp(), controlsAt(), Ctl, down(), FLAT, handOver(), SILENT (+9 more)

### Community 179 - "Engine DJ: what writing back to it involves"
Cohesion: 0.14
Nodes (17): beatData blob format (grid markers), Engine DJ 5.3 Aggregating drives job, Engine DJ: what writing back to it involves, Engine DJ session logs, GLUE playlist writes into one drive only (0.68 to 0.72), Playlist id 9047 clash between C: and F:, libdjinterop (reference for the blob encoders), GLUE library shown as a drive (subst Z:) (+9 more)

### Community 180 - "backup.rs"
Cohesion: 0.23
Nodes (11): a_backup_holds_the_profile_and_says_what_it_is(), BACKUP_FORMAT, BACKUP_VERSION, build_backup(), crc32(), create_zip(), created_ms(), dos_time() (+3 more)

### Community 181 - "src-tauri/src/dupes.rs"
Cohesion: 0.21
Nodes (9): default_duplicates(), duplicates_dir(), free(), move_into(), moves_under_the_folder_name_and_path_and_numbers_clashes(), music_roots(), refuses_paths_that_leave_the_folder_and_folders(), run() (+1 more)

### Community 182 - "homeLink.ts"
Cohesion: 0.17
Nodes (14): ADR-0132, iceCache(), TurnReply, candidateType(), Handshake, ICE_SERVERS, isHandshake(), connectHome() (+6 more)

### Community 183 - "plan.ts"
Cohesion: 0.31
Nodes (18): ADR-0200, keyFit(), barAt(), barBefore(), barOf(), bassBars(), bassIns(), dropsOf() (+10 more)

### Community 184 - "graph_docs.py"
Cohesion: 0.17
Nodes (9): adr_files(), digest(), finish(), node_id(), link(), prepare(), rel(), stem_id() (+1 more)

### Community 187 - "automation.rs"
Cohesion: 0.25
Nodes (13): clamp(), controls_at(), Ctl, down(), FLAT, fx_of(), hand_over(), Side (+5 more)

### Community 188 - "smoke-local.ts"
Cohesion: 0.13
Nodes (13): both, got, homeLog, kicked, signalled, stop(), ws, claim() (+5 more)

### Community 189 - "ADR 0102: Caches follow a collection; turning cloud sync off keeps it here, the account's copy optio"
Cohesion: 0.11
Nodes (17): ADR-0112, ADR-0102, ADR-0102, ADR-0112, ADR-0102, ADR-0112, ADR-0102, ADR-0112 (+9 more)

### Community 190 - "guide.spec.ts"
Cohesion: 0.12
Nodes (13): ADR-0126, errors, fixture(), libraryWithASong(), test, ADR-0126, ADR-0126, ADR-0126 (+5 more)

### Community 191 - "fingerprint.rs"
Cohesion: 0.12
Nodes (10): BANDS, F_HI, F_LO, fingerprint(), FP_HOP, FP_N, FP_RATE, FP_SECONDS (+2 more)

### Community 192 - "names.rs"
Cohesion: 0.29
Nodes (14): AND, BRACKETS, DASH, FEATURING, LIVE, MARK, NOT_LETTER, NOT_WORD (+6 more)

### Community 193 - "parse_rekordbox_xml()"
Cohesion: 0.16
Nodes (8): parse_m3u(), channel(), HEAD, parse_rekordbox_xml(), blank_track(), file_url_to_path(), js_number(), trim()

### Community 194 - "types"
Cohesion: 0.15
Nodes (4): CLUES, patterns(), scan_clues(), EXTINF

### Community 195 - "glue-audio/tests/golden.rs"
Cohesion: 0.24
Nodes (9): b64(), check(), check_files(), golden(), lossless_fixtures_match_javascript(), result_json(), root(), same() (+1 more)

### Community 197 - "repair.rs"
Cohesion: 0.35
Nodes (11): Counts, fold_computer(), FoldInput, FoldResult, get(), has_stand_in(), needs_fold(), obj() (+3 more)

### Community 198 - "details.ts"
Cohesion: 0.23
Nodes (15): ADR-0023, decodeDetails(), DETAILS_VERSION, encodeDetails(), hasDetails(), loadDetails(), MAX_ROWS, paths() (+7 more)

### Community 199 - "capture.ts"
Cohesion: 0.15
Nodes (14): ADR-0153, ADR-0153, EDGE_ARGS, ADR-0153, ADR-0153, ADR-0153, clip(), cursor() (+6 more)

### Community 200 - "compilerOptions"
Cohesion: 0.12
Nodes (16): @tsconfig/svelte/tsconfig.json, compilerOptions, isolatedModules, lib, module, moduleResolution, noFallthroughCasesInSwitch, noImplicitOverride (+8 more)

### Community 203 - "PlayerPanel.svelte"
Cohesion: 0.13
Nodes (14): i(), dropOn, full, fullscreen(), h, played, press(), q (+6 more)

### Community 204 - "import_golden.rs"
Cohesion: 0.16
Nodes (5): set_source_sync(), iso(), libraries_come_in_as_on_the_website(), root(), run()

### Community 205 - "src/answers.rs"
Cohesion: 0.13
Nodes (7): Devices, HEX, joined(), PENDING, safe_hash(), type_of(), Lookups

### Community 206 - "djinfo.rs"
Cohesion: 0.33
Nodes (10): app_info(), app_value(), each_sides_change_goes_to_the_other(), FIELDS, glue_and_engine_djs_forms(), glue_info(), info(), InfoMerge (+2 more)

### Community 207 - "glue-sets/src/types.rs"
Cohesion: 0.20
Nodes (11): BassChoice, Auto, Both, In, Out, Fx, LowSpan, MIX_RATE (+3 more)

### Community 208 - "perf.spec.ts"
Cohesion: 0.13
Nodes (12): afterPaint(), BUDGET, errors, Long, note(), over, results, SIZES (+4 more)

### Community 209 - "sound.ts"
Cohesion: 0.25
Nodes (14): curveOf(), fromB64(), lufsOf(), r2(), r3(), SOUND_BANDS, soundProfile(), TIMBRE_LEN (+6 more)

### Community 210 - "ZipWriter"
Cohesion: 0.22
Nodes (4): u64(), ZipSink, ZipWriter, isDiskError()

### Community 211 - "ADR 0138: What the user asks for goes first: background requests gated, playing ahead of the analysi"
Cohesion: 0.14
Nodes (9): ADR-0138, Gate, ADR-0138, ADR-0138, 0138. What the user asks for goes first: background requests gated, playing ahead of the analysis, songs read whole, Alternatives considered, Consequences, Context (+1 more)

### Community 212 - "js"
Cohesion: 0.18
Nodes (7): ANALYSIS_VERSION, ENGINE, failed(), iso(), now_iso(), summarize(), VERDICT_VERSION

### Community 213 - "String"
Cohesion: 0.30
Nodes (4): best_lists(), Engine<H>, groups_path(), saved_path()

### Community 214 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @crabnebula/tauri-plugin-drag, mediabunny, @mediabunny/mp3-encoder, sql.js, @tauri-apps/api, @tauri-apps/plugin-autostart, @tauri-apps/plugin-deep-link (+7 more)

### Community 215 - "Stem separation"
Cohesion: 0.15
Nodes (9): GLUE README, Speklone, HT-Demucs stem separation on WebGPU, ADR 0001: Record architecture decisions, ADR 0003: Client-side stems on WebGPU, ADR 0004: Float64 model patch, ADR 0005: Model from Hugging Face, Stem separation (+1 more)

### Community 217 - "HomeSocket"
Cohesion: 0.16
Nodes (5): HomeSocket, ADR-0139, Waiting, FakeSocket, ADR-0139

### Community 218 - "dj.rs"
Cohesion: 0.14
Nodes (4): APPS, AT_MOST, DjWatch, MAX_DIRS

### Community 219 - "ADR 0128: Build the code map on GitHub for every push, and use it by fixed rules"
Cohesion: 0.15
Nodes (12): Code map: graphify knowledge graph, ADR-0127, Workflow: Code map (graphify knowledge graph), graphify: knowledge graph extraction tool, Code map coverage and graphifyignore, ADR 0127: Give coding sessions a map of the code: a graphify knowledge graph, built per computer, graphify developer tool, Code map known gaps (+4 more)

### Community 220 - "IceCache"
Cohesion: 0.26
Nodes (3): IceCache, kept_until_the_relay_ends_or_ten_minutes(), public_servers()

### Community 221 - "incoming.rs"
Cohesion: 0.23
Nodes (6): list(), move_to(), moves_without_overwriting(), safe_name(), with_number(), incoming_part()

### Community 222 - "traktor.rs"
Cohesion: 0.25
Nodes (6): get(), HEAD, MAJOR, nml_path(), parse_traktor_nml(), traktor_key()

### Community 223 - "TempoMap"
Cohesion: 0.32
Nodes (5): Knot, knots_of(), span(), tempo_of(), TempoMap

### Community 225 - "library.spec.ts"
Cohesion: 0.16
Nodes (7): homeDisk, errors, fixture(), Got, MUSIC, seed(), test

### Community 226 - "ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address"
Cohesion: 0.14
Nodes (13): ADR-0051, ADR-0051, ADR-0051, ADR-0051, ADR-0051, ADR-0051, ADR-0051, ADR-0051 (+5 more)

### Community 227 - "zip.ts"
Cohesion: 0.25
Nodes (11): crc32(), CRC_TABLE, createZip(), dec, dosTime(), enc, pipe(), readZip() (+3 more)

### Community 228 - "idbSet()"
Cohesion: 0.19
Nodes (12): idbDel(), idbGet(), idbSet(), tx(), addLibraryPlace(), forgetFolder(), forgetHome(), forgetLibraryPlace() (+4 more)

### Community 229 - "glue-audio.rs"
Cohesion: 0.22
Nodes (5): AUDIO, b64(), main(), one(), songs()

### Community 230 - "analysis.rs"
Cohesion: 0.21
Nodes (3): ENGINE, read_song(), read_song_playing()

### Community 231 - "activity.rs"
Cohesion: 0.26
Nodes (6): Act, counts_calls_time_and_bytes(), note(), snapshot(), start(), STARTED

### Community 232 - "allowed()"
Cohesion: 0.22
Nodes (10): a_folder_is_looked_up_once(), allowed(), cfg_str(), folder_look(), folder_state(), free_glue_folder(), new_glue_folder(), resolved() (+2 more)

### Community 233 - "updates.ts"
Cohesion: 0.15
Nodes (7): Dock, GLUE drag dock page, ADR-0045, @crabnebula/tauri-plugin-drag, @tauri-apps/api, @tauri-apps/plugin-process, @tauri-apps/plugin-updater

### Community 234 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, svelte, svelte-check, @sveltejs/vite-plugin-svelte, @tauri-apps/cli, @tsconfig/svelte, @types/node (+5 more)

### Community 235 - "sets.rs"
Cohesion: 0.18
Nodes (5): AHEAD_S, BLOCK, IDLE, KEEP, SetStream

### Community 236 - "sound.rs"
Cohesion: 0.24
Nodes (7): B64, lufs_of(), r2(), r3(), SOUND_BANDS, sound_profile(), to_b64()

### Community 237 - "ADR 0193: Download songs as files: ranges from GLUE Home, a zip written as it goes"
Cohesion: 0.17
Nodes (10): ADR-0193, ADR-0193, ADR-0193, ADR-0193, ADR-0193, 0193. Download songs as files: ranges from GLUE Home, a zip written as it goes, Alternatives considered, Consequences (+2 more)

### Community 238 - "Downloads (feature, shipped M6)"
Cohesion: 0.17
Nodes (10): Downloading songs (help article), Songs left out, listed with the reason, Byte sources: file, incoming folder over local link, remote 4 MB ranges, DJ-app USB exports (rekordbox, Engine DJ databases) are a separate feature, Downloads (feature, shipped M6), Safe file names for Windows, FAT32 and exFAT, unique per folder, Download panel: progress, waiting state, cancel, report, remoteFiles.pull: fetching from another computer (+2 more)

### Community 241 - "lossy_golden.rs"
Cohesion: 0.33
Nodes (6): bytes_b64(), FILES, json(), lossy_files_match_the_browser(), root(), same()

### Community 242 - "cloud/package.json"
Cohesion: 0.18
Nodes (10): description, devDependencies, wrangler, name, private, scripts, deploy, dev (+2 more)

### Community 243 - "confirm()"
Cohesion: 0.38
Nodes (8): ber(), confirm(), find_matches_for(), find_same_recordings(), Fingerprint, group_matches(), Match, vote()

### Community 244 - "super"
Cohesion: 0.20
Nodes (5): Admit, Full, Ok, Refused, session_key()

### Community 245 - "ADR 0125: A song dropped onto the page is placed by GLUE Home; the tab analyses only what just it ca"
Cohesion: 0.18
Nodes (10): ADR-0125, ADR-0125, ADR-0125, ADR-0125, ADR-0125, ADR-0125, 0125. A song dropped onto the page is placed by GLUE Home; the tab analyses only what just it can read, Consequences (+2 more)

### Community 246 - "ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put"
Cohesion: 0.20
Nodes (7): ADR-0139, cacheFile(), ADR-0139, ADR-0139, ADR-0139, ADR-0139, ADR 0139: A socket for the background loads from GLUE Home, and a list that stays put

### Community 247 - "shared.spec.ts"
Cohesion: 0.20
Nodes (8): browserFor(), D, fixture(), MUSIC, seed(), ADR-0101, ADR-0106, ADR-0101

### Community 248 - "serato.ts"
Cohesion: 0.35
Nodes (10): buildSeratoLibrary(), get(), parseSerato(), parseSeratoCrate(), parseSeratoDatabase(), seratoPath(), SField, str() (+2 more)

### Community 249 - "detect.ts"
Cohesion: 0.33
Nodes (9): Detected, Entries, findLibraries(), head(), libraryAt(), fileHead(), fileMeta(), Quick (+1 more)

### Community 250 - "dragout.ts"
Cohesion: 0.29
Nodes (8): safeName(), absolutePath(), MIME, mimeOf(), playlistM3u8(), ready, startPlaylistDrag(), startTrackDrag()

### Community 251 - ".start()"
Cohesion: 0.27
Nodes (5): RateMeter, diskTarget(), notice(), SaveHandle, Target

### Community 253 - "ADR 0104: GLUE Home is the library's engine; the website on its computer is its screen"
Cohesion: 0.20
Nodes (9): ADR-0104, ADR-0104, ADR-0104, ADR-0104, ADR-0104, ADR-0104, ADR-0104, ADR-0104 (+1 more)

### Community 254 - "ui/engine.ts"
Cohesion: 0.27
Nodes (8): HomeConfig, describe(), LibraryInfo, Speed, ADR-0136, collectionKey(), shared(), ADR-0045

### Community 255 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, check, dev, home:dev, home:preview, home:ui, preview (+2 more)

### Community 256 - "rtc-probe.mjs"
Cohesion: 0.20
Nodes (6): child, dir, out, results, song, waiting

### Community 257 - "platform/homeDisk.ts"
Cohesion: 0.20
Nodes (8): Entry, HomeDown, HomeRoots, join(), ADR-0051, ADR-0071, ADR-0135, ADR-0141

### Community 259 - "0111-removing-a-folder-removes-its-songs.md"
Cohesion: 0.20
Nodes (8): 0111. Removing a music folder removes its songs; songs left with no file are offered once, Alternatives considered, Consequences, Context, 0124. Songs with no file are matched to the library's songs, with a certainty, and linked in bulk, Consequences, Context, Track detail feature

### Community 260 - "covers_golden.rs"
Cohesion: 0.33
Nodes (4): golden(), names_as_the_website_judges_them(), the_same_keys_kept_files_and_addresses(), the_same_names_and_picks()

### Community 261 - "control.rs"
Cohesion: 0.25
Nodes (3): check(), set_deadline(), TOO_LONG

### Community 262 - "jsmath.rs"
Cohesion: 0.42
Nodes (5): grid(), math_within_2_ulp_of_v8(), outputs(), v8(), where_it_differs()

### Community 263 - "lossy.rs"
Cohesion: 0.36
Nodes (6): a_damaged_mp3_frame_keeps_the_time(), a_deadline_stops_the_analysis(), alac_is_the_same_as_flac(), fixture(), lossy_files_decode(), run()

### Community 264 - "ADR 0133: A session per device with GLUE Home: opened at sign-in, kept alive, limited, and told what"
Cohesion: 0.22
Nodes (9): ADR-0133, ADR-0133, ADR-0133, ADR-0133, ADR-0133, ADR-0133, ADR-0133, ADR-0133 (+1 more)

### Community 265 - "graph.mjs"
Cohesion: 0.25
Nodes (8): FETCHED, gitDir, inOut(), KEEP, OUT, own, run(), scratch

### Community 266 - "glue-interop/tests/golden.rs"
Cohesion: 0.36
Nodes (3): root(), same(), the_libraries_read_as_the_website_reads_them()

### Community 267 - "Arriving"
Cohesion: 0.25
Nodes (3): Arriving, ReadSeek, T

### Community 269 - "FxStyle"
Cohesion: 0.25
Nodes (8): FxStyle, BassSwap, Blend, Cut, Double, Echo, Filter, Layer

### Community 270 - "0149. GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failures once"
Cohesion: 0.29
Nodes (7): ADR-0149, engine(), 0149. GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failures once, Alternatives considered, Consequences, Context, ADR 0149: GLUE Home analyses DSD as its 88.2 kHz PCM conversion, and retries the JavaScript's failur

### Community 271 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, allowImportingTsExtensions, noEmit, types, extends, include

### Community 272 - "0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it"
Cohesion: 0.25
Nodes (7): ADR-0142, ADR-0142, 0142. A row on screen always gets what it asked for: held by its song's id, and asked again when a cancel took it, Alternatives considered, Consequences, Context, ADR 0142: A row on screen always gets what it asked for: held by its song's id, and asked again when

### Community 274 - "homeBundle.test.ts"
Cohesion: 0.29
Nodes (7): FORBIDDEN, FORBIDDEN_PACKAGES, reach(), resolveImport(), ROOT, ADR-0147, ADR-0160

### Community 275 - "ADR 0129: Refresh the code map's docs in every session that changes them, without the skill; browse "
Cohesion: 0.29
Nodes (5): ADR-0129, Interactive graph view on website, .graphifyignore: vault/log/ exclusion, scripts/graph-extract.md, ADR 0129: Refresh the code map's docs in every session that changes them, without the skill; browse 

### Community 276 - "turn.ts"
Cohesion: 0.33
Nodes (6): Ice, ADR-0037, TURN_TTL, TurnEnv, turnServers(), usable()

### Community 278 - "song_name()"
Cohesion: 0.67
Nodes (6): bare(), fold(), lower(), says_nothing(), song_name(), spaced()

### Community 281 - "0107. The shared sync looks only at the files that changed, and keeps its agreed copies file by file"
Cohesion: 0.29
Nodes (6): ADR-0107, 0107. The shared sync looks only at the files that changed, and keeps its agreed copies file by file, Alternatives considered, Consequences, Context, ADR 0107: The shared sync looks only at the files that changed, and keeps its agreed copies file by 

### Community 282 - "glue-engine"
Cohesion: 0.48
Nodes (7): glue-audio, glue-engine, glue-home, glue-interop, glue-rtc, glue-sets, glue-store

### Community 283 - "download.test.ts"
Cohesion: 0.38
Nodes (3): fmtLeft(), secondsLeft(), read()

### Community 290 - "0114. The account's profiles are every device's; each device picks its own"
Cohesion: 0.33
Nodes (5): ADR-0114, 0114. The account's profiles are every device's; each device picks its own, Consequences, Context, ADR 0114: The account's profiles are every device's; each device picks its own

### Community 291 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 293 - "0009. JSON files in the GLUE folder are the store; no database"
Cohesion: 0.33
Nodes (6): 0009. JSON files in the GLUE folder are the store; no database, Alternatives considered, Amendment (2026-09-24, later): saving is per file, Amendment (2026-09-24, M2): interrupted writes, Consequences, Context

### Community 294 - "0140. A song played pauses the analysis's reads, not only its new songs"
Cohesion: 0.33
Nodes (5): 0140. A song played pauses the analysis's reads, not only its new songs, Alternatives considered, Consequences, Context, ADR 0140: A song played pauses the analysis's reads, not only its new songs

### Community 295 - "Help: Devices, accounts and profiles"
Cohesion: 0.60
Nodes (5): Accounts (optional), Clash resolution box, GLUE Cloud, Profiles (artist aliases), Help: Devices, accounts and profiles

### Community 296 - "ADR 0163: One computer never clashes with itself"
Cohesion: 0.40
Nodes (3): A computer never clashes with itself, GLUE Home shows clashes in the tab, Tab sends only what it changed

### Community 298 - "Regex"
Cohesion: 0.60
Nodes (3): ART_SIZE, ARTISTS, WITH

### Community 299 - "Pri"
Cohesion: 0.40
Nodes (4): Paced, Pri, Analysis, Play

### Community 300 - "Song Page Feature"
Cohesion: 0.40
Nodes (5): Prepare Tab: Beat Grid and Cues, Song Verdict: Quality Assessment, Spectrogram Visualization, Song Page Feature, Stems Separation

### Community 301 - "Help: Getting started"
Cohesion: 0.40
Nodes (5): Tour: welcome, Help: Getting started, GLUE folder, GLUE Home (optional companion app), GLUE Home help article

### Community 302 - "0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer"
Cohesion: 0.40
Nodes (4): 0127. Give coding sessions a map of the code: a graphify knowledge graph, built per computer, Alternatives considered, Consequences, Context

### Community 303 - "0128. Build the code map on GitHub for every push, and use it by fixed rules"
Cohesion: 0.40
Nodes (4): 0128. Build the code map on GitHub for every push, and use it by fixed rules, Alternatives considered, Consequences, Context

### Community 304 - "0129. Refresh the code map's docs in every session that changes them, without the skill; browse it on the site"
Cohesion: 0.40
Nodes (4): 0129. Refresh the code map's docs in every session that changes them, without the skill; browse it on the site, Alternatives considered, Consequences, Context

### Community 305 - "0134. Folders dropped in Home mode are looked for briefly, then asked for, with the page saying so; scans read past odd names"
Cohesion: 0.40
Nodes (4): 0134. Folders dropped in Home mode are looked for briefly, then asked for, with the page saying so; scans read past odd names, Alternatives considered, Consequences, Context

### Community 306 - "0136. Analysis limits are the user's to set, with the speed shown and a suggestion from it"
Cohesion: 0.40
Nodes (4): 0136. Analysis limits are the user's to set, with the speed shown and a suggestion from it, Alternatives considered, Consequences, Context

### Community 307 - "0139. A socket for the background loads from GLUE Home, and a list that stays put"
Cohesion: 0.40
Nodes (4): 0139. A socket for the background loads from GLUE Home, and a list that stays put, Alternatives considered, Consequences, Context

### Community 308 - "0144. FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so"
Cohesion: 0.40
Nodes (4): 0144. FLAC decoded by GLUE itself; a big song gets the time it needs; a song given up on says so, Alternatives considered, Consequences, Context

### Community 309 - "0151. GLUE opens in GLUE Home's own window, showing the live site"
Cohesion: 0.40
Nodes (4): 0151. GLUE opens in GLUE Home's own window, showing the live site, Alternatives considered, Consequences, Context

### Community 310 - "0153. GLUE Home's library engine in Rust, tested end to end against the real one"
Cohesion: 0.40
Nodes (4): 0153. GLUE Home's library engine in Rust, tested end to end against the real one, Alternatives considered, Consequences, Context

### Community 311 - "0155. GLUE Home syncs the shared collections in Rust, held to the website's sync"
Cohesion: 0.40
Nodes (4): 0155. GLUE Home syncs the shared collections in Rust, held to the website's sync, Alternatives considered, Consequences, Context

### Community 312 - "0160. GLUE Home's service in its engine: the hidden page removed"
Cohesion: 0.40
Nodes (4): 0160. GLUE Home's service in its engine: the hidden page removed, Alternatives considered, Consequences, Context

### Community 313 - "0165. GLUE Home makes the duplicate groups and points playlists at the best copies"
Cohesion: 0.40
Nodes (4): 0165. GLUE Home makes the duplicate groups and points playlists at the best copies, Alternatives considered, Consequences, Context

### Community 314 - "0189. Discogs playlists: vinyl and digital together, kept under Discogs"
Cohesion: 0.40
Nodes (4): 0189. Discogs playlists: vinyl and digital together, kept under Discogs, Alternatives considered, Consequences, Context

### Community 315 - "0200. Plan a set's hand-overs on phrases, in the set's style"
Cohesion: 0.40
Nodes (4): 0200. Plan a set's hand-overs on phrases, in the set's style, Alternatives considered, Consequences, Context

### Community 316 - "0202. A set's length asked for, songs layered on 3 decks, and the timeline's gestures"
Cohesion: 0.40
Nodes (4): 0202. A set's length asked for, songs layered on 3 decks, and the timeline's gestures, Alternatives considered, Consequences, Context

### Community 317 - "0205. Bring the incoming song in on its drop; let the bass be cut or opened over part of a song; select several songs"
Cohesion: 0.40
Nodes (4): 0205. Bring the incoming song in on its drop; let the bass be cut or opened over part of a song; select several songs, Alternatives considered, Consequences, Context

### Community 318 - "0206. Give the set's page one round menu per song and a pinned timeline; give the site's ground some depth"
Cohesion: 0.40
Nodes (4): 0206. Give the set's page one round menu per song and a pinned timeline; give the site's ground some depth, Alternatives considered, Consequences, Context

### Community 319 - "0207. Trim the song's menu to fixed, labelled places; follow the playhead only until the user looks elsewhere"
Cohesion: 0.40
Nodes (4): 0207. Trim the song's menu to fixed, labelled places; follow the playhead only until the user looks elsewhere, Alternatives considered, Consequences, Context

### Community 320 - "0209. Draw the song's menu as labelled tiles round the pointer; bring a song into view only when none of it shows"
Cohesion: 0.40
Nodes (4): 0209. Draw the song's menu as labelled tiles round the pointer; bring a song into view only when none of it shows, Alternatives considered, Consequences, Context

### Community 321 - "Downloads"
Cohesion: 0.40
Nodes (4): Downloads, Now, Open, What it does

### Community 322 - "The details' spectrogram: what it costs, and what would shrink it"
Cohesion: 0.40
Nodes (4): Encodings tried (average per song), The details' spectrogram: what it costs, and what would shrink it, The other way, not taken, What's stored

### Community 324 - "Code map view step in deploy"
Cohesion: 0.50
Nodes (4): Code map view step in deploy, Latest threejs-visualisers step, GitHub Pages deployment, Test and deploy workflow

### Community 326 - "help/discogs.md"
Cohesion: 0.50
Nodes (3): Connecting Discogs, Covers, Your records

### Community 327 - "help/downloads.md"
Cohesion: 0.50
Nodes (3): For a USB drive, What to download, While it downloads

### Community 329 - "0203. Whose bass plays in a hand-over: chosen, and where it changes hands, moved"
Cohesion: 0.50
Nodes (3): 0203. Whose bass plays in a hand-over: chosen, and where it changes hands, moved, Consequences, Context

### Community 330 - "Help: Adding music"
Cohesion: 0.67
Nodes (3): tour: adding-music, Help: Adding music, TO BE SORTED: incoming folder for sent songs

## Knowledge Gaps
- **1329 isolated node(s):** `attempts`, `name`, `private`, `description`, `type` (+1324 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2397 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **103 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ADR 0204: GLUE Home mixes the set whenever it runs: the website's mixer ported to Rust, streamed to ` connect `mixer.ts` to `set.svelte.ts`, `store.golden.test.ts`, `GLUE vault index`, `mixdown.worker.ts`, `sets.rs`, `fakeHome.ts`, `sets/types.ts`, `sets.test.ts`, `ADR 0201: A set shaped by hand on its timeline, heard live from a worker, with headroom where songs `, `Sets: a playlist mixed, exported as one file`, `local.rs`, `setplay.worker.ts`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Why does `CLAUDE.md: GLUE project rules` connect `mixer.ts` to `library.svelte.ts`, `GLUE vault index`, `GLUE Cloud: accounts, GLUE Home and devices`, `ADR 0129: Refresh the code map's docs in every session that changes them, without the skill; browse `, `decode.ts`, `Library`, `store.golden.test.ts`, `ADR 0170: Engine DJ kept in step both ways: cues, loops and the beat grid`, `local.rs`, `graph_docs.py`, `guide.spec.ts`, `capture.ts`, `fakeHome.ts`, `ADR 0036: Optional accounts and a small free cloud service (Cloudflare) for devices and signaling`, `Stem separation`, `ADR 0128: Build the code map on GitHub for every push, and use it by fixed rules`, `Feature: Library & scanner`, `ADR 0051: GLUE Home is the computer's disk and engine; the website stays at its public address`, `mixdown.worker.ts`, `sets.rs`, `ADR 0193: Download songs as files: ranges from GLUE Home, a zip written as it goes`, `ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `ADR 0195: GLUE's playlists reach Engine DJ as a rekordbox XML that GLUE Home keeps` connect `ADR 0194: GLUE doesn't write into Engine DJ (writes off unless switched on)` to `ADR 0167: DJ libraries in GLUE Home: read, brought in and followed in Rust`, `capture.ts`, `ADR 0196: GLUE's playlists reach Engine DJ through a library of GLUE's own, shown as a drive`, `djdrive.rs`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Are the 57 inferred relationships involving `text()` (e.g. with `.answer()` and `.background_todo()`) actually correct?**
  _`text()` has 57 INFERRED edges - model-reasoned connections that need verification._
- **What connects `attempts`, `name`, `private` to the rest of the system?**
  _1329 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `engine.svelte.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.031735956839098696 - nodes in this community are weakly interconnected._
- **Should `queue.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05369605469306367 - nodes in this community are weakly interconnected._