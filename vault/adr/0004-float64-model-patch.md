---
status: accepted
date: 2026-09-23
---
# 0004. Rewrite the model's float64 tensors to float32 when loading

## Context
The HT-Demucs export performs part of its inverse STFT overlap-add in float64: 341 float64 Constant
tensors and one float64 `ConstantOfShape` (`/real_istft/ConstantOfShape`). onnxruntime-web ships
without float64 kernels, so session creation fails ("Could not find an implementation for
ConstantOfShape(9)").

## Decision
Patch the model bytes in the stem worker right after download (`patchFloat64`): walk the protobuf
(ModelProto.graph(7) → GraphProto.node(1) → NodeProto.attribute(5) → AttributeProto.t(5)), and for
every TensorProto with data_type 11 (DOUBLE) set data_type 1 (FLOAT) and convert raw_data / double_data
to float32. Untouched fields are copied byte-for-byte; only changed messages are re-encoded.

## Verification
- `onnx.checker` passes on the patched model; 0 float64 tensors remain (342 converted in ~0.26 s).
- Native onnxruntime: patched vs original output max relative difference 8.5e-8.

## Alternatives considered
- Re-export the model ourselves with float32 iSTFT: needs PyTorch and hosting our own 166 MB file.
- Host a pre-patched model: needs hosting (GitHub Pages limits files to 100 MB).

## Consequences
- Works with the upstream model file as-is; no hosting.
- If the export ever gains other unsupported ops, the patcher is the place to extend.
