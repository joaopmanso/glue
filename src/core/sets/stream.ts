/* A set's mix as GLUE Home streams it (ADR 0204): stereo f32, little-endian, interleaved, at the mix rate. Pure. */

/** The stream's bytes (stereo f32, little-endian, interleaved) into whole frames: what's left of a frame waits. */
export function framer() {
  let rest = new Uint8Array(0);
  return (bytes: Uint8Array): { l: Float32Array; r: Float32Array } => {
    let b = bytes;
    if (rest.length) { const j = new Uint8Array(rest.length + bytes.length); j.set(rest); j.set(bytes, rest.length); b = j; }
    const n = Math.floor(b.length / 8), dv = new DataView(b.buffer, b.byteOffset, n * 8), l = new Float32Array(n), r = new Float32Array(n);
    for (let i = 0; i < n; i++) { l[i] = dv.getFloat32(i * 8, true); r[i] = dv.getFloat32(i * 8 + 4, true); }
    rest = b.slice(n * 8);
    return { l, r };
  };
}
