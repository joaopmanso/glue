/* The drag dock (ADR 0054): a queue of songs added from GLUE on this computer, dragged from here as
   real files into Engine DJ, Rekordbox or Explorer (a web page can't: research/drag-to-dj-apps.md). */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { startDrag } from '@crabnebula/tauri-plugin-drag';

interface Dock { paths: string[]; names: string[] }
let dock: Dock = { paths: [], names: [] };
let icon = '';
const $ = (id: string) => document.getElementById(id)!;

function show() {
  const n = dock.paths.length;
  $('drag').classList.toggle('has', n > 0);
  $('title').textContent = n ? 'Drag ' + n + ' song' + (n === 1 ? '' : 's') : 'The dock is empty';
  $('hint').textContent = n ? 'Into Engine DJ, Rekordbox or a folder: all of them, in this order.' : 'Drag a playlist here from GLUE, or use “+ Dock” there.';
  ($('clear') as HTMLButtonElement).hidden = !n;
  const list = $('list');
  list.replaceChildren(...dock.names.map((name, i) => {
    const li = document.createElement('li'), s = document.createElement('span'), x = document.createElement('button');
    s.textContent = name; s.title = dock.paths[i];
    x.textContent = '×'; x.title = 'Take it out of the dock';
    x.addEventListener('click', () => void invoke('dock_remove', { index: i }));
    li.append(s, x);
    return li;
  }));
}

$('drag').addEventListener('mousedown', e => {
  if (e.button !== 0 || !dock.paths.length || !icon) return;
  void startDrag({ item: dock.paths, icon, mode: 'copy' });
});
$('clear').addEventListener('click', () => void invoke('dock_clear'));

// A playlist dragged from GLUE onto the dock: its songs join the queue (ADR 0056).
document.addEventListener('dragover', e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; document.body.classList.add('over'); });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('over'); });
document.addEventListener('drop', e => {
  e.preventDefault(); document.body.classList.remove('over');
  const t = e.dataTransfer?.getData('text/plain') ?? '';
  if (t.startsWith('GLUE-DOCK ')) void invoke('dock_add', { body: t.slice(10) });
});

void (async () => {
  icon = await invoke<string>('drag_icon').catch(() => '');
  dock = await invoke<Dock>('dock_items');
  show();
  await listen<Dock>('dock', e => { dock = e.payload; show(); });
})();
