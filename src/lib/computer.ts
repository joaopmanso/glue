/* One device per computer (ADR 0091). A browser on a computer whose GLUE Home runs joins that computer,
   whatever the browser: it finds GLUE Home on 127.0.0.1 (only a page on the same computer can), asks it
   to vouch for it (GLUE Home tells GLUE Cloud with its own credential), and from then on this sign-in is
   the computer's device: one row in Devices, one copy of its library, one set of edits. */
import { account } from './account.svelte';
import { discover, localHome } from './localHome.svelte';
import { remoteFiles } from './remoteFiles.svelte';

let tried = false;

/** Once a visit, when signed in: join this computer's GLUE Home's device if this browser isn't it yet. */
export async function attachHere(): Promise<'joined' | 'already' | 'none' | 'refused'> {
  const me = account.thisDevice;
  if (!account.signedIn || !me) return 'none';
  const here = await discover();
  if (!here) return 'none';
  const home = account.devices.find(d => d.id === here.device && d.kind === 'home');
  if (!home) return 'none';                                   // another account's GLUE Home, or not online yet
  if (home.companionOf === me) return 'already';
  // The local link's token: the one this tab has (Home mode), else over the account's channel; then GLUE Home is
  // asked on 127.0.0.1 (ADR 0108: the channel alone left the desktop's GLUE Home without its computer).
  const own = localHome.link?.home === home.id ? localHome.link : null;
  const a = own ? null : await remoteFiles.ask(home.id, { t: 'local' }, { firstWait: 15_000 }).catch(() => null);
  const link = own ?? a?.data as { port: number; token: string | null } | undefined;
  if (!link?.token) return 'none';
  const r = await fetch('http://127.0.0.1:' + here.port + '/attach?t=' + encodeURIComponent(link.token), { method: 'POST', body: JSON.stringify({ browser: me }) }).catch(() => null);
  if (!r?.ok) return 'none';
  // GLUE Home tells GLUE Cloud; this sign-in then refreshes as the computer's device.
  for (let i = 0; i < 8; i++) {
    await new Promise(res => setTimeout(res, 1500));
    if (await account.takeOnDevice().catch(() => false)) return 'joined';
  }
  return 'refused';                                           // it has a library of its own: it stays its own device
}

// A little after signing in (and GLUE Home has had a chance to be online), once a visit.
if (typeof window !== 'undefined') window.setInterval(() => {
  if (tried || !account.signedIn || !account.devices.some(d => d.kind === 'home' && account.online.has(d.id))) return;
  tried = true;
  void attachHere().then(r => { if (r === 'joined') location.reload(); }).catch(() => { tried = false; });
}, 5_000);
