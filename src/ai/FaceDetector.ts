import { FaceDetector as MPFaceDetector, FilesetResolver, Detection } from '@mediapipe/tasks-vision';

export class FaceDetector {
  private detector: MPFaceDetector | null = null;
  private isInitialized = false;

  /**
   * Initializes the MediaPipe Face Detector.
   * Loads the WASM files and the raw .tflite model from the local public/models directory.
   */
  async initialize(wasmUrl: string, modelUrl: string): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      const vision = await FilesetResolver.forVisionTasks(wasmUrl);
      
      // The MediaPipe Tasks API natively accepts .tflite files mapped via modelAssetPath.
      this.detector = await MPFaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelUrl, 
          delegate: 'CPU', // CPU is most stable across workers
        },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.5,
      });
      
      this.isInitialized = true;
      console.log('[SkipSense AI] FaceDetector initialized successfully with official .tflite.');
    } catch (error) {
      console.error('[SkipSense AI] Failed to initialize FaceDetector:', error);
      throw error;
    }
  }

  detect(image: ImageBitmap | ImageData): Detection[] {
    if (!this.detector || !this.isInitialized) {
      throw new Error('FaceDetector is not initialized.');
    }
    
    const result = this.detector.detect(image);
    return result.detections;
  }

  close(): void {
    if (this.detector) {
      this.detector.close();
      this.detector = null;
    }
    this.isInitialized = false;
  }
}
