import { describe, expect, it } from 'vitest';
import { listTree } from '../src/core/library/listTree';
import { SCHEMA, type List } from '../src/store/types';

const L = (id: string, parentId: string | null, position: number, over: Partial<List> = {}): List =>
  ({ schemaVersion: SCHEMA, id, kind: 'playlist', name: id, parentId, position, notes: '', items: [], origin: null, createdAt: '', ...over });

describe('playlists as the sidebar shows them (ADR 0062)', () => {
  it('own lists first in the sidebar’s order, then each import’s tree; orphans and skipped lists left out', () => {
    const lists = [
      L('B', null, 1), L('A', null, 0, { kind: 'folder' }), L('A2', 'A', 1), L('A1', 'A', 0),
      L('Engine', null, 2, { kind: 'folder', origin: { sourceId: 'e', externalId: '' } }),
      L('Heavy', 'Engine', 0, { origin: { sourceId: 'e', externalId: '1' } }), L('Heavy 2', 'Engine', 1, { origin: { sourceId: 'e', externalId: '2' } }),
      L('Orphan', 'gone', 0), L('TBS', null, 3), L('inTBS', 'TBS', 0),
    ];
    const t = listTree(lists, l => l.id === 'TBS');
    expect(t.own.map(e => e.list.id + ':' + e.depth)).toEqual(['A:0', 'A1:1', 'A2:1', 'B:0']);
    expect(t.imports.map(g => g.top.id)).toEqual(['Engine']);
    expect(t.imports[0].entries.map(e => e.list.id + ':' + e.depth)).toEqual(['Engine:0', 'Heavy:1', 'Heavy 2:1']);
  });
  it('an imported playlist moved into the user’s own folder is listed there', () => {
    const t = listTree([L('Mine', null, 0, { kind: 'folder' }), L('Moved', 'Mine', 0, { origin: { sourceId: 'e', externalId: '9' } })]);
    expect(t.own.map(e => e.list.id)).toEqual(['Mine', 'Moved']);
    expect(t.imports).toEqual([]);
  });
});
