import { FaceDetector as MPFaceDetector, FilesetResolver, Detection } from '@mediapipe/tasks-vision';

export class FaceDetector {
  private detector: MPFaceDetector | null = null;
  private isInitialized = false;

  /**
   * Initializes the MediaPipe Face Detector.
   * Tries local extension models first, with automatic CDN fallback.
   */
  async initialize(wasmUrl: string, modelUrl: string): Promise<void> {
    if (this.isInitialized) return;
    
    let vision: any = null;

    // 1. Try local extension WASM
    try {
      const cleanWasmUrl = wasmUrl.endsWith('/') ? wasmUrl.slice(0, -1) : wasmUrl;
      vision = await FilesetResolver.forVisionTasks(cleanWasmUrl);
    } catch (e) {
      console.warn('[SkipSense AI] Local MediaPipe FilesetResolver failed, trying CDN fallback...', e);
    }

    // 2. Fallback to official MediaPipe CDN
    if (!vision) {
      try {
        vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      } catch (cdnErr) {
        console.warn('[SkipSense AI] MediaPipe CDN FilesetResolver also failed:', cdnErr);
      }
    }

    if (vision) {
      try {
        this.detector = await MPFaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl, 
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.3,
          minSuppressionThreshold: 0.3,
        });
        
        this.isInitialized = true;
        console.log('[SkipSense AI] FaceDetector initialized successfully.');
      } catch (optErr) {
        console.warn('[SkipSense AI] FaceDetector.createFromOptions failed:', optErr);
      }
    } else {
      console.warn('[SkipSense AI] Proceeding with center-crop facial fallback.');
    }
  }

  detect(image: ImageBitmap | ImageData): Detection[] {
    if (!this.detector || !this.isInitialized) {
      // Return empty array to allow graceful center-crop fallback
      return [];
    }
    
    try {
      const result = this.detector.detect(image);
      return result.detections || [];
    } catch (e) {
      console.warn('[SkipSense AI] FaceDetector error during detect():', e);
      return [];
    }
  }

  close(): void {
    if (this.detector) {
      try {
        this.detector.close();
      } catch (e) {}
      this.detector = null;
    }
    this.isInitialized = false;
  }
}
