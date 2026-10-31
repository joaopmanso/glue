// Looking covers up on public services (ADR 0086): GLUE Home asks Deezer, iTunes and MusicBrainz's
// Cover Art Archive (and Discogs, with the user's token: ADR 0186) for the covers songs don't carry. Their APIs don't all allow a web page to read
// the answers (CORS), so the request is made here. Only these services, only https, at most 8 MB, and
// only a song's artist and album or title ever go out, never audio.
use std::io::Read;
use std::time::Duration;

const HOSTS: [&str; 6] = ["api.deezer.com", "itunes.apple.com", "musicbrainz.org", "coverartarchive.org", "archive.org", "api.discogs.com"];
const IMAGE_HOSTS: [&str; 3] = ["dzcdn.net", "mzstatic.com", "discogs.com"];
/// The only host the Discogs token (an `Authorization` header) is ever sent to.
const TOKEN_HOST: &str = "api.discogs.com";
const MAX: u64 = 8 * 1024 * 1024;

/// Is this an address GLUE Home may fetch? One of the services, or a subdomain of one (their images
/// come from CDNs: `e-cdns-images.dzcdn.net`, `is1-ssl.mzstatic.com`, `ia800.us.archive.org`).
pub fn allowed(url: &str) -> bool {
    let Some(host) = host_of(url) else { return false };
    HOSTS.iter().chain(IMAGE_HOSTS.iter()).any(|h| host == *h || host.ends_with(&format!(".{h}")))
}
fn host_of(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    let host = rest.split(['/', '?', '#']).next().unwrap_or("").to_ascii_lowercase();
    (!host.contains(':') && !host.contains('@')).then_some(host)
}
/// Does this header go to this address? An `Authorization` (the Discogs token) only to Discogs' API.
pub fn sends(url: &str, header: &str) -> bool {
    !header.eq_ignore_ascii_case("authorization") || host_of(url).as_deref() == Some(TOKEN_HOST)
}

/// GET the address (following redirects only to allowed addresses): the body's bytes.
pub fn get(url: &str, version: &str) -> Result<Vec<u8>, String> { get_with(url, version, &[]) }
/// The same with request headers, each sent only where `sends` allows (a redirect elsewhere goes without the token).
pub fn get_with(url: &str, version: &str, headers: &[(&str, &str)]) -> Result<Vec<u8>, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(20))
        .redirects(0)
        .user_agent(&format!("GLUE-Home/{version} ( https://joaopmanso.github.io/glue/ )"))
        .build();
    let mut at = url.to_string();
    for _ in 0..5 {
        if !allowed(&at) { return Err(format!("not an address GLUE Home looks covers up at: {at}")); }
        let mut req = agent.get(&at);
        for (k, v) in headers { if sends(&at, k) { req = req.set(k, v); } }
        let resp = match req.call() {
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
    use super::{allowed, sends};
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
        // Discogs (ADR 0186): its API and its images; the token to its API only.
        assert!(allowed("https://api.discogs.com/database/search?q=x"));
        assert!(allowed("https://i.discogs.com/abc/rs:fit/x.jpeg"));
        assert!(sends("https://api.discogs.com/oauth/identity", "Authorization"));
        assert!(!sends("https://i.discogs.com/x.jpeg", "Authorization"));
        assert!(!sends("https://api.deezer.com/search", "authorization"));
        assert!(!sends("https://api.discogs.com.evil.com/", "Authorization"));
        assert!(sends("https://i.discogs.com/x.jpeg", "Accept"));
    }
}
