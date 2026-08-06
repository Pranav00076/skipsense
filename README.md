# SkipSense

SkipSense is a fully local, 100% offline Chrome Extension that automatically skips random video chat connections based on perceived presentation using advanced AI inference directly in your browser.

## Features
- **100% Local Inference**: Zero cloud servers, zero backend APIs.
- **Privacy First**: No telemetry, no analytics, no external requests. 
- **High Performance**: Uses Web Worker orchestration, OffscreenCanvas, and WebGPU/WASM acceleration to prevent UI blocking.
- **Robust DOM Engine**: Built specifically for OmeTV with intelligent fallback selectors and MutationObservers that survive site updates.

---

## The Open-Source AI Stack

SkipSense relies entirely on official, open-source models downloaded explicitly during build. No fictional or hidden assets are assumed.

1. **Face Detection**: MediaPipe BlazeFace Short Range
   - **Source**: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite`
   - **License**: Apache 2.0
2. **Gender Classification**: InsightFace antelopev2 `genderage.onnx`
   - **Source**: `https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/genderage.onnx`
   - **License**: MIT
   - **Architecture**: Extracts dynamic tensor metadata natively and applies required normalization: `(pixel/255.0 - 0.5) / 0.5`.

### Downloading & Validating Models
The repository includes a dedicated ModelManager and a postinstall script that downloads the models and performs **SHA256 Checksum Validation**. 

To prepare the AI models locally, simply run:
```bash
npm install
```
This automatically runs `node scripts/setup-models.mjs`, which calculates exact SHA256 hashes. If the models are corrupted or mismatched, the build aborts automatically.

---

## Development & Build Instructions

1. Clone this repository.
2. Run `npm install` (this will automatically fetch and verify the models).
3. Run `npm run build` to compile the TypeScript, React UI, and Extension Manifest into the `dist/` directory.
4. Load the extension:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist/` folder.

## Architecture

- **`src/ai`**: Contains the pure AI logic (`FaceDetector.ts`, `GenderClassifier.ts`, `ModelManager.ts`).
- **`src/core`**: The decoupled Finite State Machine (`StateMachine.ts`), strongly-typed event orchestrator (`MessageBus.ts`), and logic router (`DecisionEngine.ts`).
- **`src/sites`**: The modular DOM adapter pattern (`OmeTVAdapter.ts`). Future site support simply requires a new class inheriting from `SiteAdapter`.
- **`src/worker`**: The isolated Web Worker (`inference.worker.ts`) where heavy tensor mathematics occur to avoid freezing the DOM.
- **`src/popup` & `src/options`**: React + Tailwind frontends for user configuration.

## Adding Future Models
If you wish to substitute the AI stack:
1. Drop the new `.onnx` model into `public/models/`.
2. Update the expected SHA256 hashes in `scripts/setup-models.mjs` and `src/ai/ModelManager.ts`.
3. The `GenderClassifier.ts` will dynamically extract input shapes and adapt the `FrameProcessor` to your model's dimensions. You only need to verify if the output tensor format matches.