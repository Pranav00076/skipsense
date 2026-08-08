import { MessageBus } from '../core/MessageBus';
import { StorageService } from '../storage/StorageService';
import { InferencePipeline } from '../ai/InferencePipeline';

class OffscreenAIService {
  private pipeline: InferencePipeline = new InferencePipeline();
  private isReady = false;

  async init() {
    console.log('[SkipSense Offscreen] Initializing AI Service in Offscreen Document context...');
    
    // Initialize MessageBus in Offscreen context
    MessageBus.init();

    // Load initial settings
    const settings = await StorageService.getSettings();

    try {
      await this.pipeline.initialize({
        wasm: chrome.runtime.getURL('models/'),
        faceModel: chrome.runtime.getURL('models/blaze_face_short_range.tflite'),
        genderModel: chrome.runtime.getURL('models/genderage.onnx')
      }, settings?.preferredModelBackend || 'WASM');

      this.isReady = true;
      console.log('[SkipSense Offscreen] AI Pipeline initialized successfully.');
    } catch (e) {
      console.error('[SkipSense Offscreen] Failed to initialize AI Pipeline:', e);
    }

    this.setupListeners();
  }

  private setupListeners() {
    // Handle Frame Inference from Content Script
    MessageBus.on('PROCESS_FRAME_INFERENCE', (message, _sender, sendResponse) => {
      (async () => {
        try {
          if (!this.isReady) {
            throw new Error('AI Pipeline is still loading or failed to initialize');
          }

          const { pixelArray, width, height } = message.payload;
          const clamped = new Uint8ClampedArray(pixelArray);
          const imageData = new ImageData(clamped, width, height);
          const imageBitmap = await createImageBitmap(imageData);

          const result = await this.pipeline.execute(imageBitmap);
          imageBitmap.close();

          sendResponse({ payload: result });
        } catch (error: any) {
          console.error('[SkipSense Offscreen] Inference error:', error);
          sendResponse({
            payload: {
              prediction: 'UNKNOWN',
              confidence: 0,
              faceCount: 0,
              processingTimeMs: 0,
              error: error.message || 'Offscreen inference failed'
            }
          });
        }
      })();
      return true; // Keep channel open for async response
    });
  }
}

const offscreenService = new OffscreenAIService();
offscreenService.init();
