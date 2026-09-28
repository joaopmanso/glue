// Looking covers up on public services (ADR 0086): GLUE Home asks Deezer, iTunes and MusicBrainz's
// Cover Art Archive for the covers songs don't carry. Their APIs don't all allow a web page to read
// the answers (CORS), so the request is made here. Only these services, only https, at most 8 MB, and
// only a song's artist and album or title ever go out, never audio.
use std::io::Read;
use std::time::Duration;

const HOSTS: [&str; 5] = ["api.deezer.com", "itunes.apple.com", "musicbrainz.org", "coverartarchive.org", "archive.org"];
const IMAGE_HOSTS: [&str; 2] = ["dzcdn.net", "mzstatic.com"];
const MAX: u64 = 8 * 1024 * 1024;

/// Is this an address GLUE Home may fetch? One of the services, or a subdomain of one (their images
/// come from CDNs: `e-cdns-images.dzcdn.net`, `is1-ssl.mzstatic.com`, `ia800.us.archive.org`).
pub fn allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(|c: char| c == '/' || c == '?' || c == '#').next().unwrap_or("").to_ascii_lowercase();
    if host.contains(':') || host.contains('@') { return false; }
    HOSTS.iter().chain(IMAGE_HOSTS.iter()).any(|h| host == *h || host.ends_with(&format!(".{h}")))
}

/// GET the address (following redirects only to allowed addresses): the body's bytes.
pub fn get(url: &str, version: &str) -> Result<Vec<u8>, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(20))
        .redirects(0)
        .user_agent(&format!("GLUE-Home/{version} ( https://joaopmanso.github.io/glue/ )"))
        .build();
    let mut at = url.to_string();
    for _ in 0..5 {
        if !allowed(&at) { return Err(format!("not an address GLUE Home looks covers up at: {at}")); }
        let resp = match agent.get(&at).call() {
            Ok(r) => r,
            Err(ureq::Error::Status(code, r)) if (300..400).contains(&code) => r,
            Err(ureq::Error::Status(code, _)) => return Err(format!("the service said {code}")),
            Err(e) => return Err(e.to_string()),
        };
        if (300..400).contains(&resp.status()) {
            let Some(next) = resp.header("location") else { return Err("a redirect without an address".into()) };
            at = if next.starts_with("https://") { next.to_string() } else if let Some(p) = next.strip_prefix('/') {
                let base: String = at.splitn(4, '/').take(3).collect::<Vec<_>>().join("/");
                format!("{base}/{p}")
            } else { return Err("a redirect GLUE Home doesn't follow".into()) };
            continue;
        }
        let mut body = Vec::new();
        resp.into_reader().take(MAX + 1).read_to_end(&mut body).map_err(|e| e.to_string())?;
        if body.len() as u64 > MAX { return Err("the answer is too big".into()); }
        return Ok(body);
    }
    Err("too many redirects".into())
}

#[cfg(test)]
mod tests {
    use super::allowed;
    #[test]
    fn only_the_cover_services() {
        assert!(allowed("https://api.deezer.com/search/album?q=x"));
        assert!(allowed("https://e-cdns-images.dzcdn.net/images/cover/abc/1000x1000.jpg"));
        assert!(allowed("https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg"));
        assert!(allowed("https://coverartarchive.org/release/id/front-500"));
        assert!(allowed("https://ia800.us.archive.org/x.jpg"));
        assert!(!allowed("http://api.deezer.com/search"));
        assert!(!allowed("https://evil.com/?https://api.deezer.com"));
        assert!(!allowed("https://api.deezer.com.evil.com/"));
        assert!(!allowed("https://user@api.deezer.com/"));
        assert!(!allowed("https://notdzcdn.net/x"));
    }
}
