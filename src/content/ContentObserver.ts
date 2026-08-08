import { SiteAdapter } from '../sites/SiteAdapter';
import { StateMachine } from '../core/StateMachine';
import { MessageBus } from '../core/MessageBus';
import { DecisionEngine } from '../core/DecisionEngine';
import { StorageService } from '../storage/StorageService';
import { ExtensionSettings, InferenceResult } from '../types';
import { InferencePipeline } from '../ai/InferencePipeline';

export class ContentObserver {
  private adapter: SiteAdapter;
  private fsm: StateMachine;
  private settings!: ExtensionSettings;
  private pipeline: InferencePipeline;
  
  private currentRetryCount = 0;
  private lastInferenceTime = 0;
  private frameCanvas: OffscreenCanvas;
  private frameCtx: OffscreenCanvasRenderingContext2D;
  private isProcessingFrame = false;
  private currentConnectionId = 0;

  constructor(adapter: SiteAdapter) {
    this.adapter = adapter;
    this.fsm = new StateMachine('Initializing');
    this.pipeline = new InferencePipeline();
    
    // Create a 224x224 canvas for initial frame capture
    this.frameCanvas = new OffscreenCanvas(224, 224);
    this.frameCtx = this.frameCanvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  }

  async start() {
    console.log('[SkipSense Content] Starting ContentObserver on OmeTV...');
    
    // 1. Fetch initial settings directly from storage
    this.settings = await StorageService.getSettings();

    // 2. Listen for settings updates via MessageBus
    MessageBus.on('SETTINGS_UPDATED', (msg) => {
      this.settings = msg.payload.settings;
      if (!this.settings.enabled && this.fsm.getState() !== 'Paused') {
         this.fsm.transition('Paused', 'User disabled extension');
      } else if (this.settings.enabled && this.fsm.getState() === 'Paused') {
         this.fsm.transition('Idle', 'User enabled extension');
      }
    });

    // 3. Initialize AI Models directly in content window
    try {
      await this.pipeline.initialize({
        wasm: chrome.runtime.getURL('models/'),
        faceModel: chrome.runtime.getURL('models/blaze_face_short_range.tflite'),
        genderModel: chrome.runtime.getURL('models/genderage.onnx')
      }, this.settings?.preferredModelBackend || 'WASM');
      console.log('[SkipSense Content] Local AI models ready.');
    } catch (e) {
      console.error('[SkipSense Content] Failed to initialize local AI models:', e);
    }

    // 4. Initialize Adapter
    this.adapter.initialize();
    
    // 5. Setup FSM Handlers
    this.setupStateMachine();

    // 6. Listen for connection changes from OmeTV
    this.adapter.observeConnectionChanges((isConnected) => {
      if (isConnected && (this.fsm.getState() === 'WaitingForConnection' || this.fsm.getState() === 'Idle')) {
        this.fsm.transition('WaitingDelay', 'Stranger connected');
      } else if (!isConnected && this.fsm.getState() !== 'WaitingForConnection') {
        this.fsm.transition('WaitingForConnection', 'Stranger disconnected');
      }
    });

    // 7. Set initial state
    if (this.fsm.getState() === 'Initializing') {
      this.fsm.transition('Idle', 'Init complete');
      if (this.settings?.enabled) {
         if (this.adapter.isConnected()) {
            this.fsm.transition('WaitingDelay', 'Stranger already connected on load');
         } else {
            this.fsm.transition('WaitingForConnection', 'Extension active, waiting for stranger');
         }
      }
    }
  }

  private setupStateMachine() {
    this.fsm.subscribe((_from, to) => {
      if (to === 'WaitingDelay') {
        // Start delay timer
        setTimeout(() => {
          if (this.fsm.getState() === 'WaitingDelay' && this.adapter.isConnected()) {
            this.fsm.transition('CapturingFrame', 'Delay finished');
          } else if (!this.adapter.isConnected()) {
            this.fsm.transition('WaitingForConnection', 'Stranger disconnected during delay');
          }
        }, this.settings.detectionDelayMs || 500);
      }
      
      if (to === 'CapturingFrame') {
        this.captureAndInfer();
      }

      if (to === 'WaitingForConnection') {
        this.currentRetryCount = 0; // Reset retries for new stranger
        this.currentConnectionId++; // Invalidate stale frames
      }
    });
  }

  private async captureAndInfer() {
    if (this.isProcessingFrame) return;
    this.isProcessingFrame = true;
    const connectionId = this.currentConnectionId;

    try {
      const video = this.adapter.getVideo();
      if (!video || !this.adapter.isConnected()) {
        this.fsm.transition('WaitingForConnection', 'Video stream unavailable');
        this.isProcessingFrame = false;
        return;
      }

      // Throttle inferences to prevent spam
      const now = performance.now();
      if (now - this.lastInferenceTime < (this.settings.maxInferenceIntervalMs || 1000)) {
        setTimeout(() => {
           this.isProcessingFrame = false;
           if (this.fsm.getState() === 'CapturingFrame' && connectionId === this.currentConnectionId) {
             this.captureAndInfer();
           }
        }, (this.settings.maxInferenceIntervalMs || 1000) - (now - this.lastInferenceTime));
        return;
      }
      this.lastInferenceTime = now;

      // Draw video frame to offscreen canvas
      this.frameCtx.drawImage(video, 0, 0, 224, 224);
      const imageBitmap = this.frameCanvas.transferToImageBitmap();

      this.fsm.transition('DetectingFace', 'Running local face detector and ONNX classifier');
      
      // Run direct on-device inference
      const result = await this.pipeline.execute(imageBitmap);
      imageBitmap.close();

      this.handleInferenceResult(result);

    } catch (error: any) {
      console.error('[SkipSense Content] Capture Error:', error);
      this.fsm.transition('Error', 'Inference capture error');
      this.isProcessingFrame = false;
      
      // Auto recover after error
      setTimeout(() => {
        if (this.fsm.getState() === 'Error') {
          this.fsm.transition('WaitingForConnection', 'Error recovery');
        }
      }, 1000);
    }
  }

  private handleInferenceResult(result: InferenceResult) {
    this.isProcessingFrame = false;
    
    // Ensure we are still in a valid active state
    if (!['DetectingFace', 'RunningInference'].includes(this.fsm.getState())) {
      return; 
    }

    this.fsm.transition('MakingDecision', `Result: ${result.prediction} (${(result.confidence * 100).toFixed(0)}%)`);

    // Evaluate Decision
    const decision = DecisionEngine.evaluate(result, this.settings, this.currentRetryCount);
    
    console.log(`[SkipSense Decision] Prediction: ${result.prediction} | Confidence: ${result.confidence.toFixed(2)} | Action: ${decision}`);

    // Broadcast stats update to Popup & Storage
    MessageBus.send({
      type: 'STATS_UPDATED',
      payload: {
        totalConnections: this.currentRetryCount === 0 ? 1 : 0,
        totalRetries: decision === 'RETRY' ? 1 : 0,
        totalSkipped: decision === 'SKIP' ? 1 : 0,
        totalAccepted: decision === 'STAY' ? 1 : 0,
        totalUnknown: (decision !== 'SKIP' && decision !== 'STAY' && decision !== 'RETRY') ? 1 : 0,
        averageConfidence: result.confidence,
        averageInferenceTimeMs: result.processingTimeMs
      }
    });

    if (decision === 'SKIP') {
      this.fsm.transition('Skipping', 'Auto-skipping stranger');
      this.adapter.clickNext();
      this.fsm.transition('WaitingNextConnection', 'Next action executed');
      
      // Re-arm for the next stranger
      setTimeout(() => {
         if (this.fsm.getState() === 'WaitingNextConnection') {
            this.fsm.transition('WaitingForConnection', 'Ready for next stranger');
         }
      }, 500);

    } else if (decision === 'RETRY') {
      this.currentRetryCount++;
      console.log(`[SkipSense Retry] Retrying detection (${this.currentRetryCount}/${this.settings.maxRetries})...`);
      this.fsm.transition('WaitingDelay', 'Retrying frame inference');
    } else if (decision === 'STAY' || decision === 'WAIT') {
      this.fsm.transition('WaitingForConnection', 'Decision accepted (STAY/WAIT)');
    }
  }

  cleanup() {
    this.adapter.cleanup();
  }
}
