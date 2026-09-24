/**
 * onnxruntime-web ships without float64 kernels, but the HT-Demucs export does its iSTFT
 * overlap-add in float64. Rewrite every float64 tensor attribute (Constant, ConstantOfShape
 * values) as float32 directly in the protobuf; float32 is plenty for that arithmetic.
 * Verified: onnx.checker passes, output matches the original to ~1e-7 (ADR 0004).
 *
 * Path walked: ModelProto.graph(7) → GraphProto.node(1) → NodeProto.attribute(5) → AttributeProto.t(5).
 * Untouched fields are copied byte-for-byte; only messages containing a change are re-encoded.
 */
export function patchFloat64(b: Uint8Array): { bytes: Uint8Array; count: number } {
  function varint(p: number): [number, number] {
    let x = 0, s = 1, c: number;
    do { c = b[p++]; x += (c & 127) * s; s *= 128; } while (c & 128);
    return [x, p];
  }
  function enc(x: number): number[] { const o: number[] = []; while (x >= 128) { o.push((x % 128) | 128); x = Math.floor(x / 128); } o.push(x); return o; }
  interface Field { no: number; wt: number; st: number; vs: number; end: number }
  function fields(s: number, e: number): Field[] {
    const f: Field[] = [];
    for (let p = s; p < e;) {
      const st = p; let key: number; [key, p] = varint(p);
      const no = Math.floor(key / 8), wt = key & 7; let vs = p;
      if (wt === 0) [, p] = varint(p);
      else if (wt === 1) p += 8;
      else if (wt === 5) p += 4;
      else if (wt === 2) { let L: number; [L, p] = varint(p); vs = p; p += L; }
      else throw new Error('unexpected protobuf wire type ' + wt);
      f.push({ no, wt, st, vs, end: p });
    }
    return f;
  }
  const lenField = (no: number, bytes: Uint8Array) => [Uint8Array.from(enc(no * 8 + 2)), Uint8Array.from(enc(bytes.length)), bytes];
  const cat = (parts: Uint8Array[]) => { let n = 0; for (const x of parts) n += x.length; const o = new Uint8Array(n); let p = 0; for (const x of parts) { o.set(x, p); p += x.length; } return o; };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  function tensor(s: number, e: number): Uint8Array | null {
    const f = fields(s, e);
    const dt = f.find(x => x.no === 2 && x.wt === 0);
    if (!dt || varint(dt.vs)[0] !== 11) return null;   // 11 = DOUBLE
    const parts: Uint8Array[] = [], doubles: number[] = [];
    for (const x of f) {
      if (x.no === 2) parts.push(Uint8Array.from([16, 1]));   // data_type = FLOAT
      else if (x.no === 9) {                                   // raw_data: 8-byte doubles -> 4-byte floats
        const n = (x.end - x.vs) / 8, out = new Uint8Array(n * 4), od = new DataView(out.buffer);
        for (let i = 0; i < n; i++) od.setFloat32(i * 4, dv.getFloat64(x.vs + i * 8, true), true);
        parts.push(...lenField(9, out));
      } else if (x.no === 10) {                                // double_data, packed or not
        if (x.wt === 2) for (let p = x.vs; p < x.end; p += 8) doubles.push(dv.getFloat64(p, true));
        else doubles.push(dv.getFloat64(x.vs, true));
      } else parts.push(b.subarray(x.st, x.end));
    }
    if (doubles.length) {
      const out = new Uint8Array(doubles.length * 4), od = new DataView(out.buffer);
      doubles.forEach((v, i) => od.setFloat32(i * 4, v, true));
      parts.push(...lenField(9, out));
    }
    return cat(parts);
  }
  function message(s: number, e: number, childNo: number, child: (s: number, e: number) => Uint8Array | null): Uint8Array | null {
    const f = fields(s, e);
    let changed = false;
    const parts = f.map(x => {
      if (x.no === childNo && x.wt === 2) {
        const r = child(x.vs, x.end);
        if (r) { changed = true; return cat(lenField(x.no, r)); }
      }
      return b.subarray(x.st, x.end);
    });
    return changed ? cat(parts) : null;
  }
  let count = 0;
  const attr = (s: number, e: number) => { const r = message(s, e, 5, tensor); if (r) count++; return r; };
  const node = (s: number, e: number) => message(s, e, 5, attr);
  const graph = (s: number, e: number) => message(s, e, 1, node);
  const model = message(0, b.length, 7, graph);
  return { bytes: model || b, count };
}
