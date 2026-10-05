/* Where to get GLUE Home (ADR 0044): the latest GitHub release, the installer for this computer's
   OS first. The asset names stay the same from release to release. */
export const RELEASES = 'https://github.com/joaopmanso/glue/releases/latest';
export const HOME_DOWNLOADS = {
  windows: { label: 'Windows', file: 'GLUE-Home-Setup.exe', url: RELEASES + '/download/GLUE-Home-Setup.exe' },
  mac: { label: 'macOS', file: 'GLUE-Home.dmg', url: RELEASES + '/download/GLUE-Home.dmg' },
} as const;
export type HomeOs = keyof typeof HOME_DOWNLOADS;

/** This computer's OS, if GLUE Home is made for it. */
export function homeOs(nav: { userAgent: string; userAgentData?: { platform?: string } } = navigator as never): HomeOs | null {
  const p = (nav.userAgentData?.platform || nav.userAgent).toLowerCase();
  if (/iphone|ipad|android/.test(nav.userAgent.toLowerCase())) return null;
  if (p.includes('win')) return 'windows';
  if (p.includes('mac')) return 'mac';
  return null;
}
/** In GLUE Home's own window (ADR 0151): it opens the site with `?app=window`, which is taken off the address and
    kept for the session (reloads and links inside the window keep it). There, GLUE Home is this computer's: it isn't
    offered for download. */
export function inWindow(): boolean {
  if (typeof location === 'undefined') return false;
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('app') === 'window') {
      sessionStorage.setItem('glue.window', '1');
      u.searchParams.delete('app');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
    return sessionStorage.getItem('glue.window') === '1';
  } catch { return false; }
}

/** Opens GLUE Home (when installed) and connects it with a pairing code. */
export const homePairLink = (code: string) => 'gluehome://pair?code=' + encodeURIComponent(code);
