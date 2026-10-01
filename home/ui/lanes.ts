/* Which song GLUE Home analyses next (ADR 0135). A song is read whole before it's analysed, so a slow folder holds
   its place while it reads: the user's NAS gave 12 MB/s for one file and 24 MB/s for eight at once (2026-10-01), so
   24 at a time from it mostly waited on the network, with the processor at 60%. A network folder's songs run at
   most `NET_AT_ONCE` at a time; the other places go to songs on this computer's own drives, which the processor
   limits. Pure. */

/** Songs read from one network folder at once: about where the user's NAS stopped getting faster. */
export const NET_AT_ONCE = 4;

/** A network folder: a Windows share (\\server\share) or a mounted one (//server/share). */
export const isNetwork = (path: string | null | undefined) => !!path && /^(\\\\|\/\/)/.test(path);

/** The first song in `queue` that may start now: the next in order, except a network folder's while it has
    `NET_AT_ONCE` running (`running`: songs running per network folder). -1 when none may. */
export function pickNext(queue: readonly { net?: string }[], running: ReadonlyMap<string, number>, cap = NET_AT_ONCE): number {
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i].net;
    if (!n || (running.get(n) ?? 0) < cap) return i;
  }
  return -1;
}
