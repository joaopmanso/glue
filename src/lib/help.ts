/* The help centre's articles (ADR 0126): one Markdown file per feature in src/help/, bundled with the page. */
import { parseArticle, type Article } from '../core/guide/markdown';

const files = import.meta.glob('../help/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const ARTICLES: Article[] = Object.entries(files)
  .map(([path, raw]) => parseArticle(path.split('/').pop()!.replace(/\.md$/, ''), raw))
  .sort((a, b) => a.order - b.order);

export const articleById = (id: string | null | undefined) => ARTICLES.find(a => a.id === id) ?? null;
