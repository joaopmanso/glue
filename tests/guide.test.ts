import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanGuide, guideAdds, mergeGuide } from '../src/core/guide/state';
import { TOURS, guideTargets } from '../src/core/guide/tours';

describe('what Gluey has shown, once per person (ADR 0126)', () => {
  it('the union of the browser’s, the GLUE folder’s and the account’s; the newer quiet choice', () => {
    const g = mergeGuide({ seen: ['welcome'] }, { tips: ['dupes'], quiet: true, quietAt: 2 }, null, { seen: ['welcome', 'dupes'], quiet: false, quietAt: 1 });
    expect(g).toEqual({ seen: ['welcome', 'dupes'], tips: ['dupes'], quiet: true, quietAt: 2 });
    expect(guideAdds(mergeGuide({ seen: ['welcome'] }), g)).toBe(true);
    expect(guideAdds(g, mergeGuide({ seen: ['welcome'] }))).toBe(false);
  });
  it('anything else is dropped', () => {
    expect(cleanGuide({ seen: ['ok', 'Not OK', 5], tips: 'x', quiet: true, extra: 1 })).toEqual({ seen: ['ok'], tips: [] });
    expect(cleanGuide('nonsense')).toEqual({ seen: [], tips: [] });
  });
});

describe('the tours point at parts of GLUE that are there', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.svelte') ? [p] : []; });
  const ui = files('src').map(f => readFileSync(f, 'utf8')).join('\n');
  it('every stop’s target is a data-guide in the UI', () => {
    // The Library views are one each, by their key (data-guide={'view-' + k} in the sidebar).
    const views = ['all', 'recent', 'attention', 'pending', 'failed', 'unlinked', 'dupes'];
    for (const t of guideTargets()) {
      if (t.startsWith('view-')) { expect(views, t).toContain(t.slice(5)); expect(ui).toContain(`data-guide={'view-' + k}`); }
      else expect(ui, 'data-guide="' + t + '"').toContain('data-guide="' + t + '"');
    }
  });
  it('tours have ids, stops and words', () => {
    const ids = TOURS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOURS) { expect(t.steps.length).toBeGreaterThan(0); for (const s of t.steps) { expect(s.title.length).toBeGreaterThan(0); expect(s.body.length).toBeGreaterThan(10); } }
  });
});

describe('the help centre’s articles (ADR 0126)', async () => {
  const { parseArticle, renderMarkdown, searchArticles } = await import('../src/core/guide/markdown');
  const { ARTICLES } = await import('../src/lib/help');
  const { tourById } = await import('../src/core/guide/tours');
  const { TIPS } = await import('../src/core/guide/tips');
  it('Markdown, escaped: no HTML or script from an article, only web and GLUE links', () => {
    const html = renderMarkdown('# Hi\n\nA **bold** and *soft* `<code>` <script>alert(1)</script> [web](https://x.example) [glue](#/help/x) [bad](javascript:alert(1))\n\n- one\n- two\n\n1. first');
    expect(html).toContain('<h2>Hi</h2>');
    expect(html).toContain('<b>bold</b>');
    expect(html).toContain('<i>soft</i>');
    expect(html).toContain('<code>&lt;code&gt;</code>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<a href="https://x.example" target="_blank" rel="noopener">web</a>');
    expect(html).toContain('<a href="#/help/x">glue</a>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
    expect(html).toContain('<ol>\n<li>first</li>\n</ol>');
  });
  it('front matter, and search with the title first', () => {
    const a = parseArticle('dupes', '---\ntitle: Duplicates\nsummary: Same recording\nkeywords: copy, best\ntour: duplicates\norder: 3\n---\nBody about copies.');
    expect(a).toMatchObject({ id: 'dupes', title: 'Duplicates', summary: 'Same recording', keywords: ['copy', 'best'], tour: 'duplicates', order: 3, body: 'Body about copies.' });
    const b = parseArticle('other', '---\ntitle: Other\n---\nMentions duplicates once.');
    expect(searchArticles([b, a], 'duplicates').map(x => x.id)).toEqual(['dupes', 'other']);
    expect(searchArticles([b, a], 'nothing like it')).toEqual([]);
  });
  it('every article has a title, a summary and a body; its tour, and every tip’s, exists', () => {
    expect(ARTICLES.length).toBeGreaterThanOrEqual(15);
    for (const a of ARTICLES) {
      expect(a.title, a.id).not.toBe(a.id);
      expect(a.summary.length, a.id).toBeGreaterThan(10);
      expect(a.body.length, a.id).toBeGreaterThan(80);
      if (a.tour) expect(tourById(a.tour), a.id + ' → ' + a.tour).not.toBeNull();
    }
    for (const [k, t] of Object.entries(TIPS)) if (t.tour) expect(tourById(t.tour), k).not.toBeNull();
  });
});
