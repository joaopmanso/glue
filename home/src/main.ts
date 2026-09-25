#!/usr/bin/env node
/* GLUE Home command line (preview). Node.js 24:  node home/src/main.ts <command>  */
import { resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { access, configPath, loadConfig, pair, removeConfig, saveConfig, stayOnline } from './home.ts';

const HELP = `GLUE Home (preview): your main computer, reachable from the GLUE website.

  pair <CODE> [--name "Studio PC"]   join your GLUE account with a code from the website
                                      (sidebar › Devices › + GLUE Home)
  run                                 stay online (leave this running)
  status                              show this GLUE Home's settings
  set library <folder>                the GLUE folder with your collection (for sharing, next phase)
  set incoming <folder>               where uploaded music goes (next phases)
  unpair                              forget the account on this computer

Settings: ${configPath()}`;

const [cmd, ...args] = process.argv.slice(2);
const log = (s: string) => console.log(new Date().toLocaleTimeString() + '  ' + s);

async function main() {
  if (cmd === 'pair') {
    const code = args.find(a => !a.startsWith('--'));
    const ni = args.indexOf('--name'), name = ni >= 0 ? args[ni + 1] : undefined;
    if (!code) throw new Error('Usage: pair <CODE>  (make a code on the website: sidebar › Devices › + GLUE Home)');
    const c = await pair(code, { name });
    console.log('Paired as “' + c.name + '”' + (c.user?.email ? ' with ' + c.user.email : '') + '. Now run:  node home/src/main.ts run');
  } else if (cmd === 'run') {
    const c = loadConfig();
    if (!c) throw new Error('Not paired yet. On the website: sidebar › Devices › + GLUE Home, then  pair <CODE>');
    await access(c);   // fail fast with a clear message when the device was removed
    const ac = new AbortController();
    process.on('SIGINT', () => { log('Going offline.'); ac.abort(); setTimeout(() => process.exit(0), 200); });
    stayOnline(c, log, { signal: ac.signal });
  } else if (cmd === 'status') {
    const c = loadConfig();
    if (!c) { console.log('Not paired. ' + HELP); return; }
    console.log({ name: c.name, account: c.user?.email, device: c.deviceId, api: c.api, library: c.library, incoming: c.incoming, pairedAt: new Date(c.pairedAt).toString() });
  } else if (cmd === 'set' && (args[0] === 'library' || args[0] === 'incoming') && args[1]) {
    const c = loadConfig();
    if (!c) throw new Error('Pair first.');
    const dir = resolve(args[1]);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error('Not a folder: ' + dir);
    saveConfig({ ...c, [args[0]]: dir });
    console.log(args[0] + ' = ' + dir);
  } else if (cmd === 'unpair') {
    removeConfig();
    console.log('Forgotten on this computer. Remove it from the account on the website too (sidebar › Devices › ⋯ › Remove).');
  } else console.log(HELP);
}
main().catch(e => { console.error((e as Error).message); process.exit(1); });
