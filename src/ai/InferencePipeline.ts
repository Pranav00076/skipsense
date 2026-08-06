import { FaceDetector } from './FaceDetector';
import { GenderClassifier } from './GenderClassifier';
import { FrameProcessor } from './FrameProcessor';
import { InferenceResult, ModelBackend } from '../types';
import { ModelManager } from './ModelManager';

export class InferencePipeline {
  private faceDetector: FaceDetector;
  private genderClassifier: GenderClassifier;
  private frameProcessor: FrameProcessor;
  private isInitializing = false;
  private isReady = false;

  constructor() {
    this.faceDetector = new FaceDetector();
    this.genderClassifier = new GenderClassifier();
    this.frameProcessor = new FrameProcessor();
  }

  async initialize(urls: { wasm: string, faceModel: string, genderModel: string }, backend: ModelBackend): Promise<void> {
    if (this.isReady || this.isInitializing) return;
    this.isInitializing = true;
    
    try {
      console.log('[SkipSense AI] Initializing AI Pipeline...');
      
      // 1. Verify models exist and checksums match BEFORE attempting to load
      await ModelManager.validateAll();
      
      // 2. Load models
      await Promise.all([
        this.faceDetector.initialize(urls.wasm, urls.faceModel),
        this.genderClassifier.initialize(urls.genderModel, backend)
      ]);
      
      // 3. Adapt preprocessor to dynamic ONNX dimensions
      if (this.genderClassifier.metadata) {
         this.frameProcessor.adaptToModel(this.genderClassifier.metadata);
      }
      
      this.isReady = true;
      console.log('[SkipSense AI] AI Pipeline is fully ready and validated.');
    } catch (error) {
      console.error('[SkipSense AI] Failed to initialize AI pipeline:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async execute(image: ImageBitmap): Promise<InferenceResult> {
    if (!this.isReady) {
      throw new Error('InferencePipeline is not ready.');
    }

    const startTime = performance.now();
    let result: InferenceResult = {
      prediction: 'UNKNOWN',
      confidence: 0,
      faceCount: 0,
      processingTimeMs: 0
    };

    try {
      const faces = this.faceDetector.detect(image);
      result.faceCount = faces.length;

      if (faces.length === 1) {
        const inputTensor = this.frameProcessor.processFace(image, faces[0]);
        const prediction = await this.genderClassifier.predict(inputTensor);
        
        result.prediction = prediction.prediction;
        result.confidence = prediction.confidence;
        
        inputTensor.dispose();
      }
    } catch (error: any) {
      console.error('[SkipSense AI] Pipeline Execution Error:', error);
      result.error = error.message || 'Unknown error during inference';
    } finally {
      result.processingTimeMs = performance.now() - startTime;
    }

    return result;
  }
}
