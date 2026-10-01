/* The help centre's articles (ADR 0126): Markdown files in src/help/, each with a little front matter. A small renderer
   for what they use (headings, paragraphs, lists, bold, italics, code, links): everything is escaped first, so an
   article can never put HTML or script on the page. Pure. */

export interface Article { id: string; title: string; summary: string; keywords: string[]; tour: string | null; order: number; body: string }

/** An article from its file: `---` front matter (title, summary, keywords, tour, order), then Markdown. */
export function parseArticle(id: string, raw: string): Article {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const head: Record<string, string> = {};
  for (const line of (m?.[1] ?? '').split(/\r?\n/)) { const i = line.indexOf(':'); if (i > 0) head[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return {
    id, title: head.title || id, summary: head.summary || '', tour: head.tour || null, order: Number(head.order) || 99,
    keywords: (head.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean),
    body: (m ? m[2] : raw).trim(),
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Only links to the web or to GLUE's own pages. */
const safeHref = (h: string) => /^(https?:\/\/|#\/)/.test(h) ? h : null;

function inline(text: string): string {
  // Code first (its content stays as written), then links, bold, italics: on escaped text.
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map(p => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 1) return '<code>' + esc(p.slice(1, -1)) + '</code>';
    let s = esc(p);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
      const h = safeHref(href.replace(/&amp;/g, '&'));
      return h ? '<a href="' + esc(h) + '"' + (h.startsWith('http') ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>' : label;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
    return s;
  }).join('');
}

/** The article's body as HTML (escaped: safe to put on the page). */
export function renderMarkdown(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null, para: string[] = [];
  const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line), ul = /^\s*[-*]\s+(.*)$/.exec(line), ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) { flushPara(); closeList(); continue; }
    if (h) { flushPara(); closeList(); const n = Math.min(4, h[1].length + 1); out.push('<h' + n + '>' + inline(h[2]) + '</h' + n + '>'); continue; }
    if (ul || ol) {
      flushPara();
      const want = ul ? 'ul' : 'ol';
      if (list !== want) { closeList(); out.push('<' + want + '>'); list = want; }
      out.push('<li>' + inline((ul ?? ol)![1]) + '</li>');
      continue;
    }
    if (list && /^\s{2,}/.test(raw)) { const last = out.pop()!; out.push(last.replace(/<\/li>$/, ' ' + inline(line.trim()) + '</li>')); continue; }
    closeList();
    para.push(line.trim());
  }
  flushPara(); closeList();
  return out.join('\n');
}

/** Articles matching a search: every word in the title, summary, keywords or text (title and keywords first). */
export function searchArticles(all: Article[], q: string): Article[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...all].sort((a, b) => a.order - b.order);
  const score = (a: Article) => {
    const head = (a.title + ' ' + a.keywords.join(' ')).toLowerCase(), all2 = (head + ' ' + a.summary + ' ' + a.body).toLowerCase();
    if (!words.every(w => all2.includes(w))) return -1;
    return words.filter(w => head.includes(w)).length * 10 + words.filter(w => a.summary.toLowerCase().includes(w)).length;
  };
  return all.map(a => [a, score(a)] as const).filter(([, s]) => s >= 0).sort((x, y) => y[1] - x[1] || x[0].order - y[0].order).map(([a]) => a);
}
