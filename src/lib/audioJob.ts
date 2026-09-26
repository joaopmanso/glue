/* A file's audio as a job for the analysis worker: the file itself, read and decoded there (ADR 0060;
   the page decodes it only when the worker can't, see analysis.ts). Used by the Prepare tab's waveform
   and by fingerprints made again on this browser. */
import type { WorkerJob } from '../workers/analysis.worker';

export function jobOf(file: File): Extract<WorkerJob, { type: 'file' }> { return { type: 'file', file }; }
