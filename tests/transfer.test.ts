import { describe, expect, it } from 'vitest';
import { candidateType, frame, unframe, nextName, safeName } from '../src/core/transfer';

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

describe('candidateType', () => {
  it('names ICE candidates for the connection message', () => {
    expect(candidateType('candidate:1 1 udp 2122260223 192.168.1.5 54321 typ host generation 0')).toBe('local');
    expect(candidateType('candidate:2 1 udp 1686052607 85.1.2.3 40000 typ srflx raddr 192.168.1.5 rport 54321')).toBe('public');
    expect(candidateType('candidate:3 1 udp 41885439 104.30.1.1 60000 typ relay raddr 85.1.2.3 rport 40000')).toBe('relay');
    expect(candidateType('')).toBeNull();
    expect(candidateType(undefined)).toBeNull();
  });
});
