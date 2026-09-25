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
/** Opens GLUE Home (when installed) and connects it with a pairing code. */
export const homePairLink = (code: string) => 'gluehome://pair?code=' + encodeURIComponent(code);
