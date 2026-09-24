import { describe, expect, it } from 'vitest';
import { patchFloat64 } from '../src/core/stems/patch';

// Minimal protobuf encoder, enough to build ModelProto › GraphProto › NodeProto › AttributeProto › TensorProto.
const varint = (x: number) => { const o: number[] = []; while (x >= 128) { o.push((x % 128) | 128); x = Math.floor(x / 128); } o.push(x); return o; };
const cat = (...p: (number[] | Uint8Array)[]) => { const o: number[] = []; for (const x of p) o.push(...x); return new Uint8Array(o); };
const lenField = (no: number, body: Uint8Array) => cat(varint(no * 8 + 2), varint(body.length), body);
const vfield = (no: number, v: number) => cat(varint(no * 8), varint(v));
const str = (s: string) => new TextEncoder().encode(s);

function doubleTensor(values: number[]) {
  const raw = new Uint8Array(values.length * 8), dv = new DataView(raw.buffer);
  values.forEach((v, i) => dv.setFloat64(i * 8, v, true));
  return cat(vfield(1, values.length), vfield(2, 11), lenField(8, str('t')), lenField(9, raw));   // dims, DOUBLE, name, raw_data
}
function model(tensor: Uint8Array) {
  const attr = cat(lenField(1, str('value')), lenField(5, tensor), vfield(20, 4));
  const node = cat(lenField(4, str('Constant')), lenField(5, attr));
  const graph = cat(lenField(1, node), lenField(2, str('g')));
  return cat(vfield(1, 8), lenField(7, graph));   // ir_version, graph
}

// Walk the patched bytes back down to the tensor.
function readFields(b: Uint8Array, s = 0, e = b.length) {
  const out: { no: number; wt: number; vs: number; end: number; v: number }[] = [];
  for (let p = s; p < e;) {
    let key = 0, sh = 1, c; do { c = b[p++]; key += (c & 127) * sh; sh *= 128; } while (c & 128);
    const no = Math.floor(key / 8), wt = key & 7;
    if (wt === 0) { let v = 0, m = 1; do { c = b[p++]; v += (c & 127) * m; m *= 128; } while (c & 128); out.push({ no, wt, vs: p, end: p, v }); }
    else { let L = 0, m = 1; do { c = b[p++]; L += (c & 127) * m; m *= 128; } while (c & 128); out.push({ no, wt, vs: p, end: p + L, v: 0 }); p += L; }
  }
  return out;
}
const child = (b: Uint8Array, f: { vs: number; end: number }, no: number) => readFields(b, f.vs, f.end).find(x => x.no === no)!;

describe('patchFloat64 (ADR 0004)', () => {
  it('rewrites a DOUBLE tensor attribute as FLOAT with the same values', () => {
    const values = [1.5, -2.25, 1e-3, 440];
    const { bytes, count } = patchFloat64(model(doubleTensor(values)));
    expect(count).toBe(1);
    const graph = readFields(bytes).find(f => f.no === 7)!;
    const node = child(bytes, graph, 1), attr = child(bytes, node, 5), t = child(bytes, attr, 5);
    const tf = readFields(bytes, t.vs, t.end);
    expect(tf.find(f => f.no === 2)!.v).toBe(1);   // FLOAT
    const raw = tf.find(f => f.no === 9)!, dv = new DataView(bytes.buffer, bytes.byteOffset + raw.vs, raw.end - raw.vs);
    expect(raw.end - raw.vs).toBe(values.length * 4);
    values.forEach((v, i) => expect(dv.getFloat32(i * 4, true)).toBeCloseTo(v, 5));
    expect(tf.find(f => f.no === 8)).toBeTruthy();   // untouched fields survive
  });
  it('leaves a model without float64 tensors byte-identical', () => {
    const t = cat(vfield(1, 1), vfield(2, 1), lenField(9, new Uint8Array(4)));
    const m = model(t), r = patchFloat64(m);
    expect(r.count).toBe(0);
    expect(r.bytes).toBe(m);
  });
});
