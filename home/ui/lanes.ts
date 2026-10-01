/* Which song GLUE Home analyses next (ADR 0135, 0136). A song is read whole before it's analysed, so a slow folder
   holds its place while it reads: the user's NAS gave 12 MB/s for one file and 24 MB/s for eight at once
   (2026-10-01), so 24 at a time from it mostly waited on the network, with the processor at 60%. "From each network
   folder at a time" (GLUE Home's settings, no limit unless set) caps a network folder's songs; the other places go to
   songs on this computer's own drives. The speed shown in its window suggests a value (speed.ts). Pure. */

/** A network folder: a Windows share (\\server\share) or a mounted one (//server/share). */
export const isNetwork = (path: string | null | undefined) => !!path && /^(\\\\|\/\/)/.test(path);

/** The first song in `queue` that may start now: the next in order, except a network folder's while it has `cap`
    running (`running`: songs running per network folder; `cap` 0: no limit). -1 when none may. */
export function pickNext(queue: readonly { net?: string }[], running: ReadonlyMap<string, number>, cap: number): number {
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i].net;
    if (!n || cap <= 0 || (running.get(n) ?? 0) < cap) return i;
  }
  return -1;
}
