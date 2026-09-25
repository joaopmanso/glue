/* The password never leaves the device: it's stretched here (PBKDF2, salted with the email) and the
   server keeps only a salted hash of the result (ADR 0041). Shared by the website and GLUE Home. */
export async function passwordKey(email: string, password: string): Promise<string> {
  const enc = new TextEncoder(), base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('glue-v1:' + email.trim().toLowerCase()), iterations: 300_000 }, base, 256));
  let s = ''; for (const b of bits) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
