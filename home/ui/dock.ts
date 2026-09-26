/* The drag dock (ADR 0054): the songs selected in GLUE on this computer, dragged from here as real
   files into Engine DJ, Rekordbox or Explorer (a web page can't: research/drag-to-dj-apps.md). */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { startDrag } from '@crabnebula/tauri-plugin-drag';

interface Dock { title: string; paths: string[]; names: string[] }
let dock: Dock = { title: '', paths: [], names: [] };
let icon = '';
const $ = (id: string) => document.getElementById(id)!;

function show() {
  const n = dock.paths.length;
  $('drag').classList.toggle('has', n > 0);
  $('title').textContent = n ? (dock.title || n + ' song' + (n === 1 ? '' : 's')) : 'Nothing selected';
  $('hint').textContent = n ? 'Drag from here into Engine DJ, Rekordbox or a folder.' : 'Select songs or a playlist in GLUE on this computer, then drag them from here.';
  $('names').textContent = dock.names.slice(0, 8).join('\n') + (n > 8 ? '\n… and ' + (n - 8) + ' more' : '');
}

$('drag').addEventListener('mousedown', e => {
  if (e.button !== 0 || !dock.paths.length || !icon) return;
  void startDrag({ item: dock.paths, icon, mode: 'copy' });
});

void (async () => {
  icon = await invoke<string>('drag_icon').catch(() => '');
  dock = await invoke<Dock>('dock_items');
  show();
  await listen<Dock>('dock', e => { dock = e.payload; show(); });
})();
