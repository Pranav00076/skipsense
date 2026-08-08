import { FaceDetector } from './FaceDetector';
import { GenderClassifier } from './GenderClassifier';
import { FrameProcessor } from './FrameProcessor';
import { InferenceResult, ModelBackend } from '../types';
import { ModelManager } from './ModelManager';
import { QualityChecker } from './QualityChecker';

export class InferencePipeline {
  private faceDetector: FaceDetector;
  private genderClassifier: GenderClassifier;
  private frameProcessor: FrameProcessor;
  private qualityCanvas: OffscreenCanvas;
  private qualityCtx: OffscreenCanvasRenderingContext2D;
  private isInitializing = false;
  private isReady = false;

  constructor() {
    this.faceDetector = new FaceDetector();
    this.genderClassifier = new GenderClassifier();
    this.frameProcessor = new FrameProcessor();
    this.qualityCanvas = new OffscreenCanvas(64, 64);
    this.qualityCtx = this.qualityCanvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  }

  async initialize(urls: { wasm: string, faceModel: string, genderModel: string }, backend: ModelBackend): Promise<void> {
    if (this.isReady || this.isInitializing) return;
    this.isInitializing = true;
    
    try {
      console.log('[SkipSense AI] Initializing AI Pipeline...');
      
      // 1. Validate models exist locally
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
      console.log('[SkipSense AI] AI Pipeline is fully ready and operational.');
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
      processingTimeMs: 0,
      qualityIssue: 'NONE',
      groupPredictions: []
    };

    try {
      // 1. Frame Quality & Lighting Check (Too dark, Too bright, Covered camera, Bad angle)
      this.qualityCtx.drawImage(image, 0, 0, 64, 64);
      const qualityImageData = this.qualityCtx.getImageData(0, 0, 64, 64);
      const quality = QualityChecker.analyze(qualityImageData);

      if (!quality.isAcceptable) {
        result.qualityIssue = quality.issue;
        result.error = quality.reason;
        console.log(`[SkipSense Quality] Frame quality check failed: ${quality.issue} (${quality.reason})`);
        return result;
      }

      // 2. Multi-Person Spatial Group & Facial Pyramid Detection
      const detections = this.faceDetector.detect(image);
      result.faceCount = detections.length;

      const groupResults: { prediction: 'MALE' | 'FEMALE', confidence: number }[] = [];

      for (const detection of detections) {
        const inputTensor = this.frameProcessor.processFace(image, detection);
        const pred = await this.genderClassifier.predict(inputTensor);
        inputTensor.dispose();
        groupResults.push(pred);
      }

      result.groupPredictions = groupResults;

      // Group Decision Rule:
      // If ANY region in the frame detects a MALE with confidence >= 0.45 -> flag as MALE
      const malesFound = groupResults.filter(g => g.prediction === 'MALE' && g.confidence >= 0.45);
      
      if (malesFound.length > 0) {
        const topMale = malesFound.reduce((prev, curr) => curr.confidence > prev.confidence ? curr : prev);
        result.prediction = 'MALE';
        result.confidence = topMale.confidence;
      } else {
        const topFemale = groupResults.reduce((prev, curr) => curr.confidence > prev.confidence ? curr : prev, groupResults[0]);
        result.prediction = topFemale ? topFemale.prediction : 'FEMALE';
        result.confidence = topFemale ? topFemale.confidence : 0.60;
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
