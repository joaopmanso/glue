import { describe, expect, it } from 'vitest';
import { frame, unframe, nextName, safeName } from '../src/core/transfer';

describe('the stream channel (ADR 0046, 0047)', () => {
  it('tags each binary message with its request, so answers can run at the same time', () => {
    const a = frame(7, new Uint8Array([1, 2, 3])), b = frame(4_000_000_001, new Uint8Array(0));
    expect(unframe(a.buffer)).toEqual({ n: 7, data: new Uint8Array([1, 2, 3]) });
    expect(unframe(b.buffer).n).toBe(4_000_000_001);
    expect(unframe(b.buffer).data.length).toBe(0);
  });
  it('names received songs safely, and numbers ones that are taken', () => {
    expect(safeName('..\\..\\evil/CON.mp3')).toBe('_CON.mp3');
    expect(safeName('a<b>:c?.flac')).toBe('a_b__c_.flac');
    expect(nextName('Song.mp3', n => n === 'Song.mp3' || n === 'Song (2).mp3')).toBe('Song (3).mp3');
  });
});
