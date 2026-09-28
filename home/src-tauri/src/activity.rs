// What GLUE Home was asked, since it started (the user's report, 2026-09-28, of GLUE Home using the CPU
// while idle; ADR 0083): per kind of request, how many, the time spent and the bytes. The local link's
// requests and the service page's bridge calls are counted here; the settings show them, with what other
// devices asked the service page.
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Default, Clone)]
pub struct Act {
    pub calls: u64,
    pub ms: f64,
    pub bytes: u64,
}

static ACT: Mutex<BTreeMap<String, Act>> = Mutex::new(BTreeMap::new());
static STARTED: Mutex<Option<Instant>> = Mutex::new(None);

pub fn start() {
    STARTED.lock().unwrap().get_or_insert_with(Instant::now);
}

/// One more `what`, begun at `t0`, that moved `bytes`.
pub fn note(what: &str, t0: Instant, bytes: u64) {
    let ms = t0.elapsed().as_secs_f64() * 1000.0;
    let mut m = ACT.lock().unwrap();
    let a = m.entry(what.to_string()).or_default();
    a.calls += 1;
    a.ms += ms;
    a.bytes += bytes;
}

/// Everything counted, and for how long (seconds).
pub fn snapshot() -> serde_json::Value {
    let since = STARTED.lock().unwrap().map(|t| t.elapsed().as_secs()).unwrap_or(0);
    let counts: serde_json::Map<String, serde_json::Value> = ACT.lock().unwrap().iter().map(|(k, a)| (k.clone(), serde_json::json!({ "calls": a.calls, "ms": a.ms, "bytes": a.bytes }))).collect();
    serde_json::json!({ "seconds": since, "counts": counts })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn counts_calls_time_and_bytes() {
        start();
        let t0 = Instant::now();
        note("test /x", t0, 10);
        note("test /x", t0, 5);
        let s = snapshot();
        assert_eq!(s["counts"]["test /x"]["calls"], 2);
        assert_eq!(s["counts"]["test /x"]["bytes"], 15);
    }
}
