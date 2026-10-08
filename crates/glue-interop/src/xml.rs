//! The minimal XML reader the library files go through (`core/interop/xml.ts`), line for line: attributes, text,
//! CDATA, comments, processing instructions, DOCTYPE, the standard and numeric entities; a closing tag closes up to its
//! nearest open match, and one that matches nothing is ignored.
use crate::types::{is_space, trim};
use indexmap::IndexMap;
use regex::{Captures, Regex};
use std::sync::LazyLock;

#[derive(Debug, Default)]
pub struct XNode { pub name: String, pub attrs: IndexMap<String, String>, pub children: Vec<XNode>, pub text: String }

impl XNode {
  pub fn child(&self, name: &str) -> Option<&XNode> { self.children.iter().find(|c| c.name == name) }
  pub fn children_named<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a XNode> + 'a { self.children.iter().filter(move |c| c.name == name) }
  pub fn attr(&self, k: &str) -> Option<&str> { self.attrs.get(k).map(String::as_str) }
}

// JavaScript's `\s`, spelled out (the regex crate's isn't the same set).
const SP: &str = r"\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";
static ENTITY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"&(#[xX][0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);").unwrap());
static ATTR: LazyLock<Regex> = LazyLock::new(|| Regex::new(&format!(r#"([^{SP}=/>]+)[{SP}]*=[{SP}]*("([^"]*)"|'([^']*)')"#)).unwrap());

/// `decodeEntities`. Err where JavaScript throws (a code point beyond Unicode).
pub fn decode_entities(s: &str) -> Result<String, String> {
  if !s.contains('&') { return Ok(s.to_string()); }
  let mut err = None;
  let out = ENTITY.replace_all(s, |c: &Captures| {
    let e = &c[1];
    if let Some(n) = e.strip_prefix('#') {
      let cp = match n.strip_prefix(['x', 'X']) { Some(h) => parse_int(h, 16), None => parse_int(n, 10) };
      if cp > 1_114_111.0 { err = Some(format!("Invalid code point {}", crate::types::num_str(cp))); return c[0].to_string(); }
      // (A lone surrogate can't be held in Rust's text: the replacement character.)
      return char::from_u32(cp as u32).unwrap_or('\u{FFFD}').to_string();
    }
    match e.to_ascii_lowercase().as_str() { "amp" => "&", "lt" => "<", "gt" => ">", "quot" => "\"", "apos" => "'", _ => &c[0] }.to_string()
  });
  match err { Some(e) => Err(e), None => Ok(out.into_owned()) }
}
fn parse_int(d: &str, r: u32) -> f64 { d.chars().fold(0.0, |v, c| v * r as f64 + c.to_digit(r).unwrap_or(0) as f64) }

/// `parseXml`.
pub fn parse_xml(src: &str) -> Result<XNode, String> {
  // An arena: the open elements are indices, children are linked once the tree is done.
  let mut nodes: Vec<XNode> = vec![XNode { name: "#root".into(), ..Default::default() }];
  let mut kids: Vec<Vec<usize>> = vec![vec![]];
  let mut stack: Vec<usize> = vec![0];
  let n = src.len();
  let find = |from: usize, pat: &str| src.get(from..).and_then(|r| r.find(pat)).map(|i| i + from);
  let mut i = 0;
  while i < n {
    let lt = find(i, "<");
    let text_end = lt.unwrap_or(n);
    if text_end > i { let t = decode_entities(&src[i..text_end])?; nodes[*stack.last().unwrap()].text += &t; }
    let Some(lt) = lt else { break };
    let rest = &src[lt..];
    if rest.starts_with("<!--") { i = find(lt + 4, "-->").map_or(n, |e| e + 3); continue; }
    if rest.starts_with("<![CDATA[") { let e = find(lt + 9, "]]>"); nodes[*stack.last().unwrap()].text += &src[lt + 9..e.unwrap_or(n)]; i = e.map_or(n, |e| e + 3); continue; }
    if rest.starts_with("<?") { i = find(lt + 2, "?>").map_or(n, |e| e + 2); continue; }
    if rest.starts_with("<!") {
      // DOCTYPE (may hold an internal subset in […]).
      let (mut depth, mut j) = (0i64, lt + 2);
      let b = src.as_bytes();
      while j < n { match b[j] { b'[' => depth += 1, b']' => depth -= 1, b'>' if depth <= 0 => break, _ => {} } j += 1; }
      i = j + 1; continue;
    }
    let Some(gt) = find(lt, ">") else { return Err("Unterminated tag in XML".into()) };
    let mut tag = &src[lt + 1..gt];
    if let Some(name) = tag.strip_prefix('/') {
      let name = trim(name);
      if let Some(k) = (1..stack.len()).rev().find(|&k| nodes[stack[k]].name == name) { stack.truncate(k); }
      i = gt + 1; continue;
    }
    let self_close = tag.ends_with('/');
    if self_close { tag = &tag[..tag.len() - 1]; }
    let sp = tag.char_indices().find(|&(_, c)| is_space(c)).map(|(k, _)| k);
    let mut node = XNode { name: tag[..sp.unwrap_or(tag.len())].to_string(), ..Default::default() };
    if let Some(sp) = sp {
      for m in ATTR.captures_iter(&tag[sp..]) {
        let v = m.get(3).or(m.get(4)).map_or("", |x| x.as_str());
        node.attrs.insert(m[1].to_string(), decode_entities(v)?);
      }
    }
    let id = nodes.len();
    nodes.push(node);
    kids.push(vec![]);
    kids[*stack.last().unwrap()].push(id);
    if !self_close { stack.push(id); }
    i = gt + 1;
  }
  // Built bottom-up: children are always after their parent.
  let mut done: Vec<Option<XNode>> = nodes.into_iter().map(Some).collect();
  for id in (0..done.len()).rev() {
    let children: Vec<XNode> = kids[id].iter().map(|&k| done[k].take().unwrap()).collect();
    done[id].as_mut().unwrap().children = children;
  }
  Ok(done[0].take().unwrap())
}

#[cfg(test)]
mod tests {
  #[test]
  fn reads_what_the_website_reads() {
    let x = super::parse_xml("<?xml?><a b='1' c = \"x &amp; &#233;&#X41;\"><!-- c --><d/>t<![CDATA[<raw>]]><e>in</a>").unwrap();
    let a = x.child("a").unwrap();
    assert_eq!(a.attr("c"), Some("x & éA"));
    assert_eq!(a.text, "t<raw>");
    assert_eq!(a.children.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["d", "e"]);
    assert_eq!(a.child("e").unwrap().text, "in");
    assert!(super::parse_xml("<a").is_err());
  }
}
