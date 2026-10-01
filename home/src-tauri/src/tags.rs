// Song info edited in GLUE, written into the music file (ADR 0071): title, artist, album, genre, label,
// year, comment, grouping, into every tag the file has (and its main one, made if it has none), with
// lofty. Into a copy next to it first, which then replaces it: never half written. The new size and date
// go back to the website, so it doesn't take the file for a new one and analyse it again.
use std::fs;
use std::path::Path;

use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey, Tag, TagType};

/// The fields GLUE edits. An empty value clears the field.
const FIELDS: [&str; 8] = ["title", "artist", "album", "genre", "label", "year", "comment", "grouping"];

fn apply(tag: &mut Tag, fields: &serde_json::Map<String, serde_json::Value>) {
    for key in FIELDS {
        let Some(v) = fields.get(key).and_then(|v| v.as_str()) else { continue };
        let v = v.trim().to_string();
        match key {
            "title" => if v.is_empty() { tag.remove_title() } else { tag.set_title(v) },
            "artist" => if v.is_empty() { tag.remove_artist() } else { tag.set_artist(v) },
            "album" => if v.is_empty() { tag.remove_album() } else { tag.set_album(v) },
            "genre" => if v.is_empty() { tag.remove_genre() } else { tag.set_genre(v) },
            "comment" => if v.is_empty() { tag.remove_comment() } else { tag.set_comment(v) },
            _ => {
                let k = match key { "label" => ItemKey::Label, "year" => ItemKey::RecordingDate, _ => ItemKey::ContentGroup };
                if v.is_empty() { tag.remove_key(k) } else { let _ = tag.insert_text(k, v); }
            }
        }
    }
}

/// Write `fields` into the file at `path`; its new size and date (ms).
pub(crate) fn write_tags(path: &Path, fields: &serde_json::Map<String, serde_json::Value>) -> Result<(u64, u64), String> {
    if !path.is_file() {
        return Err("not a file".into());
    }
    let dir = path.parent().ok_or("bad path")?;
    let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let tmp = dir.join(format!(".glue-tmp-{n}{ext}"));
    fs::copy(path, &tmp).map_err(|e| e.to_string())?;
    let written = (|| -> Result<(), String> {
        let mut tf = Probe::open(&tmp).map_err(|e| e.to_string())?.guess_file_type().map_err(|e| e.to_string())?.read().map_err(|e| e.to_string())?;
        if tf.primary_tag().is_none() {
            let t = tf.primary_tag_type();
            tf.insert_tag(Tag::new(t));
        }
        let types: Vec<TagType> = tf.tags().iter().map(|t| t.tag_type()).collect();
        for t in types {
            if let Some(tag) = tf.tag_mut(t) {
                apply(tag, fields);
            }
        }
        tf.save_to_path(&tmp, WriteOptions::default()).map_err(|e| e.to_string())?;
        // Flushed to disk before it replaces the original (Windows needs a writable handle to flush).
        fs::OpenOptions::new().write(true).open(&tmp).and_then(|f| f.sync_all()).map_err(|e| e.to_string())?;
        fs::rename(&tmp, path).map_err(|e| e.to_string())
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    let m = fs::metadata(path).map_err(|e| e.to_string())?;
    let mtime = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
    Ok((m.len(), mtime))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures").join(name)
    }

    #[test]
    fn writes_into_every_format_and_reads_back() {
        let dir = std::env::temp_dir().join(format!("glue-tags-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let fields: serde_json::Map<String, serde_json::Value> = serde_json::from_str(r#"{"title":"Edited in GLUE","artist":"The Tester","album":"Batch 5","genre":"Deep House","label":"GLUE Records","year":"2026","grouping":"Peak","comment":"Written by GLUE Home"}"#).unwrap();
        for name in ["mp3-128k.mp3", "flac-96k-24.flac", "aiff-44k-24.aiff", "aac-128k.m4a", "wav-44k-24.wav", "opus-160k.opus", "mp3-cover.mp3", "flac-cover.flac"] {
            let p = dir.join(name);
            fs::copy(fixture(name), &p).unwrap();
            let before = lofty::read_from_path(&p).unwrap().properties().duration();
            let (size, mtime) = write_tags(&p, &fields).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert_eq!(size, fs::metadata(&p).unwrap().len());
            assert!(mtime > 0);
            let tf = lofty::read_from_path(&p).unwrap();
            let tag = tf.primary_tag().unwrap_or_else(|| panic!("{name}: no tag"));
            assert_eq!(tag.title().as_deref(), Some("Edited in GLUE"), "{name}");
            assert_eq!(tag.artist().as_deref(), Some("The Tester"), "{name}");
            assert_eq!(tag.album().as_deref(), Some("Batch 5"), "{name}");
            assert_eq!(tf.properties().duration(), before, "{name}: the audio is the same");
            // A cover in the file stays (ADR 0072).
            if name.contains("cover") {
                let pictures: usize = tf.tags().iter().map(|t| t.pictures().len()).sum();
                assert!(pictures > 0, "{name}: the cover was lost");
            }
            // Clearing a field.
            let clear: serde_json::Map<String, serde_json::Value> = serde_json::from_str(r#"{"album":""}"#).unwrap();
            write_tags(&p, &clear).unwrap();
            let tf = lofty::read_from_path(&p).unwrap();
            assert_eq!(tf.primary_tag().unwrap().album(), None, "{name}");
            assert_eq!(tf.primary_tag().unwrap().title().as_deref(), Some("Edited in GLUE"), "{name}");
            // No temporary file left behind.
            assert!(fs::read_dir(&dir).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with(".glue-tmp-")));
        }
        let _ = fs::remove_dir_all(&dir);
    }
}

/// A song's info from its tags, read without its audio or its pictures (ADR 0135): what GLUE shows for a song until
/// it's analysed. None when it can't be read (the name will do).
pub(crate) fn read_info(path: &Path) -> Option<serde_json::Value> {
    use lofty::config::ParseOptions;
    let tagged = Probe::open(path).ok()?.options(ParseOptions::new().read_properties(false).read_cover_art(false)).read().ok()?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag())?;
    let s = |v: Option<std::borrow::Cow<'_, str>>| v.map(|x| x.trim().to_string()).unwrap_or_default();
    let k = |key: ItemKey| tag.get_string(key).map(|x| x.trim().to_string()).unwrap_or_default();
    let year = { let d = k(ItemKey::RecordingDate); if d.is_empty() { k(ItemKey::Year) } else { d } };
    Some(serde_json::json!({
        "title": s(tag.title()), "artist": s(tag.artist()), "album": s(tag.album()), "genre": s(tag.genre()),
        "comment": s(tag.comment()), "label": k(ItemKey::Label), "year": year, "grouping": k(ItemKey::ContentGroup),
    }))
}

/// Many songs' info at once, `threads` files at a time: a folder of thousands reads in seconds on a disk, and a network
/// folder reads only the tags, not 512 KB of each file (ADR 0135).
pub(crate) fn read_many(paths: &[std::path::PathBuf], threads: usize) -> Vec<Option<serde_json::Value>> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let next = AtomicUsize::new(0);
    let out: Vec<std::sync::Mutex<Option<serde_json::Value>>> = paths.iter().map(|_| std::sync::Mutex::new(None)).collect();
    std::thread::scope(|sc| {
        for _ in 0..threads.max(1).min(paths.len().max(1)) {
            sc.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= paths.len() { break; }
                *out[i].lock().unwrap() = read_info(&paths[i]);
            });
        }
    });
    out.into_iter().map(|m| m.into_inner().unwrap()).collect()
}

#[cfg(test)]
mod read_tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures").join(name) }

    #[test]
    fn reads_many_songs_info_in_order() {
        let paths = vec![fixture("mp3-cover.mp3"), fixture("not-there.mp3"), fixture("flac-cover.flac"), PathBuf::new()];
        let got = read_many(&paths, 3);
        assert_eq!(got.len(), 4);
        assert!(got[0].is_some(), "an MP3 with tags");
        assert!(got[1].is_none() && got[3].is_none(), "a missing file, and no path, read as nothing");
        assert!(got[2].is_some(), "a FLAC with tags");
        let keys: Vec<&str> = got[0].as_ref().unwrap().as_object().unwrap().keys().map(|k| k.as_str()).collect();
        for k in ["title", "artist", "album", "genre", "label", "year", "comment", "grouping"] { assert!(keys.contains(&k), "{k}"); }
    }
}
