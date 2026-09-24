/* Minimal XML → tree parser for library files (rekordbox XML, Traktor NML, Apple plist).
   No DOM dependency, so it runs in workers and in Node tests. Handles attributes, text, CDATA,
   comments, processing instructions, DOCTYPE and the standard + numeric entities. */
export interface XNode { name: string; attrs: Record<string, string>; children: XNode[]; text: string }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(cp) ? String.fromCodePoint(cp) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export function parseXml(src: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  const attrRe = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    const textEnd = lt < 0 ? n : lt;
    if (textEnd > i) stack[stack.length - 1].text += decodeEntities(src.slice(i, textEnd));
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt + 9); stack[stack.length - 1].text += src.slice(lt + 9, e < 0 ? n : e); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt + 2); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith('<!', lt)) {   // DOCTYPE (may contain an internal subset in [...])
      let depth = 0, j = lt + 2;
      for (; j < n; j++) { const c = src[j]; if (c === '[') depth++; else if (c === ']') depth--; else if (c === '>' && depth <= 0) break; }
      i = j + 1; continue;
    }
    const gt = src.indexOf('>', lt);
    if (gt < 0) throw new Error('Unterminated tag in XML');
    let tag = src.slice(lt + 1, gt);
    if (tag[0] === '/') {
      const name = tag.slice(1).trim();
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].name === name) { stack.length = k; break; }
      i = gt + 1; continue;
    }
    const selfClose = tag.endsWith('/');
    if (selfClose) tag = tag.slice(0, -1);
    const sp = tag.search(/\s/);
    const name = sp < 0 ? tag : tag.slice(0, sp);
    const node: XNode = { name, attrs: {}, children: [], text: '' };
    if (sp >= 0) {
      attrRe.lastIndex = 0;
      const rest = tag.slice(sp);
      for (let m; (m = attrRe.exec(rest));) node.attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? '');
    }
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
    i = gt + 1;
  }
  return root;
}

export const child = (n: XNode, name: string) => n.children.find(c => c.name === name);
export const childrenNamed = (n: XNode, name: string) => n.children.filter(c => c.name === name);
