/* A song's cover (ADR 0072): the front cover in its tags (mediabunny reads ID3 in MP3, WAV and AIFF,
   FLAC and Ogg pictures, MP4 and Matroska covers), made into small square JPEGs, 64 px for the table
   and 320 px to look at. Named by the picture's hash, so an album's songs share one. Only the tags are
   read: a file source reads the parts it needs, a URL (GLUE Home's local link) asks for those bytes.
   Used in workers, and by GLUE Home's service page (ADR 0082). */
import { ALL_FORMATS, BlobSource, CustomSource, Input, UrlSource } from 'mediabunny';
import { sha256 } from '../core/hash';

export interface Cover { hash: string; small: Uint8Array; large: Uint8Array }
export const COVER_SMALL = 64, COVER_LARGE = 320;


/** A file read a piece at a time by someone else (GLUE Home reads through its own disk, ADR 0082). */
export interface Reader { size: number; read: (start: number, end: number) => Promise<Uint8Array> }

/** The song's cover, or null when it has none; throws when the file can't be read. */
export async function coverOf(src: Blob | string | Reader): Promise<Cover | null> {
  const source = typeof src === 'string' ? new UrlSource(src, { parallelism: 1, getRetryDelay: () => null }) : src instanceof Blob ? new BlobSource(src) : new CustomSource({ getSize: () => src.size, read: (s, e) => src.read(s, e) });
  const input = new Input({ source, formats: ALL_FORMATS });
  try {
    const images = (await input.getMetadataTags()).images ?? [];
    const img = images.find(i => i.kind === 'coverFront') ?? images.find(i => i.kind !== 'coverBack') ?? images[0];
    if (!img || img.data.length < 64) return null;
    return await coverFromImage(img.data, img.mimeType);
  } finally { input.dispose(); }
}

/** A cover from a picture (a song's tags, a cover service, a file the user chose, ADR 0086). */
export async function coverFromImage(data: Uint8Array, mime?: string): Promise<Cover> {
  const hash = (await sha256(data.slice())).slice(0, 24);
  const bmp = await createImageBitmap(new Blob([data.slice()], { type: mime || 'image/jpeg' }));
  try {
    // Square, from the middle; the small one from the large one (smoother than in one step).
    const large = square(bmp, COVER_LARGE), small = square(large, COVER_SMALL);
    return { hash, small: await jpeg(small), large: await jpeg(large) };
  } finally { bmp.close(); }
}

function square(src: ImageBitmap | OffscreenCanvas, size: number): OffscreenCanvas {
  const s = Math.min(src.width, src.height), c = new OffscreenCanvas(size, size), g = c.getContext('2d')!;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
  return c;
}
const jpeg = async (c: OffscreenCanvas) => new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.86 })).arrayBuffer());
