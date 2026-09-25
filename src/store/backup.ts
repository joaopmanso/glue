/* Profile backups as a zip (ADR 0026):
     mco-backup.json         what's inside (format, version, the profile's name and colour)
     profile/…               everything under GLUE/profiles/<pid>/ (profile, collections, playlists…)
     files/…                 songs GLUE keeps its own copy of (browsers without file handles)
   Music folders aren't in it (only their names and locations): they're linked again after a restore. */
import { createZip, readZip, type ZipEntry } from '../core/zip';
import { type Dir, subdir, writeBlob } from './fsx';
import { SCHEMA, type Collection, type Profile } from './types';

export const BACKUP_FORMAT = 'mco-backup', BACKUP_VERSION = 1;
export interface BackupManifest { format: typeof BACKUP_FORMAT; version: number; createdAt: string; schemaVersion: number; profile: { id: string; name: string; color: string }; collections: { id: string; name: string; tracks: number }[] }

type Entries = { entries(): AsyncIterable<[string, FileSystemHandle]> };
/** Every file under a folder, with '/'-separated paths relative to it. */
export async function walk(dir: Dir, prefix = ''): Promise<{ path: string; file: File }[]> {
  const out: { path: string; file: File }[] = [];
  for await (const [name, h] of (dir as unknown as Entries).entries()) {
    const p = prefix ? prefix + '/' + name : name;
    if (h.kind === 'directory') out.push(...await walk(h as Dir, p));
    else out.push({ path: p, file: await (h as FileSystemFileHandle).getFile() });
  }
  return out;
}

const bytes = async (f: File) => new Uint8Array(await f.arrayBuffer());
const json = (x: unknown) => new TextEncoder().encode(JSON.stringify(x, null, 1));

export async function buildBackup(home: Dir, profile: Profile): Promise<Blob> {
  const pdir = await subdir(home, ['profiles', profile.id], false);
  if (!pdir) throw new Error('This profile has no files in the GLUE folder.');
  const files = await walk(pdir);
  const entries: ZipEntry[] = [];
  const collections: BackupManifest['collections'] = [];
  const copies = new Set<string>();
  for (const { path, file } of files) {
    const data = await bytes(file);
    entries.push({ path: 'profile/' + path, data, mtime: new Date(file.lastModified) });
    if (/^collections\/[^/]+\/collection\.json$/.test(path)) {
      const c = JSON.parse(new TextDecoder().decode(data)) as Collection;
      collections.push({ id: c.id, name: c.name, tracks: 0 });
    }
    if (/^collections\/[^/]+\/tracks\/[^/]+\.json$/.test(path)) {
      const shard = JSON.parse(new TextDecoder().decode(data)) as { items: Record<string, { fileKey?: string | null }> };
      const cid = path.split('/')[1], c = collections.find(x => x.id === cid);
      for (const t of Object.values(shard.items)) {
        if (c) c.tracks++;
        if (t.fileKey?.startsWith('copy:')) copies.add(t.fileKey.slice(5));
      }
    }
  }
  for (const rel of copies) {
    const parts = rel.split('/'), name = parts.pop()!;
    try {
      const d = await subdir(home, parts, false);
      if (d) { const f = await (await d.getFileHandle(name)).getFile(); entries.push({ path: rel, data: await bytes(f), mtime: new Date(f.lastModified) }); }
    } catch { /* copy gone: the track will show as missing */ }
  }
  const manifest: BackupManifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), schemaVersion: SCHEMA, profile: { id: profile.id, name: profile.name, color: profile.color }, collections };
  return createZip([{ path: 'mco-backup.json', data: json(manifest) }, ...entries]);
}

export async function readBackup(zip: Uint8Array): Promise<{ manifest: BackupManifest; entries: ZipEntry[] }> {
  const entries = await readZip(zip);
  const m = entries.find(e => e.path === 'mco-backup.json');
  if (!m) throw new Error('This zip isn’t a GLUE backup (no mco-backup.json inside).');
  const manifest = JSON.parse(new TextDecoder().decode(m.data)) as BackupManifest;
  if (manifest.format !== BACKUP_FORMAT || !manifest.profile?.id) throw new Error('This zip isn’t a GLUE backup.');
  if (manifest.version > BACKUP_VERSION || manifest.schemaVersion > SCHEMA) throw new Error('This backup was made by a newer version of GLUE. Reload the page to update GLUE, then try again.');
  if (!entries.some(e => e.path === 'profile/profile.json')) throw new Error('The backup has no profile in it.');
  return { manifest, entries };
}

/** Write a backup's files into the GLUE folder (the profile's folder must be empty or already removed). */
export async function writeBackup(home: Dir, b: { manifest: BackupManifest; entries: ZipEntry[] }) {
  const pid = b.manifest.profile.id;
  for (const e of b.entries) {
    if (e.path === 'mco-backup.json') continue;
    if (e.path.includes('..') || e.path.startsWith('/')) continue;   // never outside the GLUE folder
    const target = e.path.startsWith('profile/') ? `profiles/${pid}/${e.path.slice(8)}` : e.path.startsWith('files/') ? e.path : null;
    if (target) await writeBlob(home, target, new Blob([e.data.slice().buffer]));
  }
}
