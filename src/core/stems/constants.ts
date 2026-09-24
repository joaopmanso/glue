/** HT-Demucs ONNX export (StemSplitio/htdemucs-onnx), see ADRs 0003–0005. */
export const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.webgpu.min.mjs';
export const MODEL_FILE = 'htdemucs_fp16weights.onnx';
export const MODEL_URL = 'https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/' + MODEL_FILE;
export const MODEL_SIZE = 165612636;
export const MODEL_CACHE = 'mco-models-v1';
export const LEGACY_MODEL_CACHE = 'speklone-models-v1';
export const STEM_SR = 44100;
export const STEM_N = 343980;                       // 7.8 s, baked into the graph
export const STEM_OVERLAP = Math.floor(STEM_N / 4);
export const STEM_STRIDE = STEM_N - STEM_OVERLAP;
export const STEMS = [
  { name: 'Drums', c: '#ff9f5a' },
  { name: 'Bass', c: '#a78bfa' },
  { name: 'Other', c: '#4fd1c5' },
  { name: 'Vocals', c: '#f472b6' },
] as const;
