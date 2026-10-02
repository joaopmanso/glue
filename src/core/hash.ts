/* SHA-256 as hex (Web Crypto), the same in the browser, GLUE Home and GLUE Cloud: the sync's file hashes, covers'
   and look-ups' names, the cloud's stored tokens. */
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (data: string | Uint8Array<ArrayBuffer>) => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data));
