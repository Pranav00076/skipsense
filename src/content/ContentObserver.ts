import { SiteAdapter } from '../sites/SiteAdapter';
import { StateMachine } from '../core/StateMachine';
import { MessageBus } from '../core/MessageBus';
import { DecisionEngine } from '../core/DecisionEngine';
import { ExtensionSettings, InferenceResult } from '../types';

export class ContentObserver {
  private adapter: SiteAdapter;
  private fsm: StateMachine;
  private settings!: ExtensionSettings;
  private worker: Worker | null = null;
  
  private currentRetryCount = 0;
  private lastInferenceTime = 0;
  private frameCanvas: OffscreenCanvas;
  private frameCtx: OffscreenCanvasRenderingContext2D;
  private isProcessingFrame = false;
  private currentConnectionId = 0;

  constructor(adapter: SiteAdapter) {
    this.adapter = adapter;
    this.fsm = new StateMachine('Initializing');
    
    // Create a 224x224 canvas for initial frame capture (downscaling before sending to worker to save memory)
    this.frameCanvas = new OffscreenCanvas(224, 224);
    this.frameCtx = this.frameCanvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  }

  async start() {
    console.log('[SkipSense Content] Starting ContentObserver...');
    
    // 1. Fetch initial settings via MessageBus
    const response = await MessageBus.send({ type: 'SETTINGS_UPDATED' });
    this.settings = response?.payload?.settings; 
    
    // Fallback if background script didn't reply properly
    if (!this.settings) {
       console.warn('[SkipSense Content] Failed to get settings from Background, waiting for broadcast.');
    }

    // 2. Listen for settings updates
    MessageBus.on('SETTINGS_UPDATED', (msg) => {
      this.settings = msg.payload.settings;
      if (!this.settings.enabled && this.fsm.getState() !== 'Paused') {
         this.fsm.transition('Paused', 'User disabled extension');
      } else if (this.settings.enabled && this.fsm.getState() === 'Paused') {
         this.fsm.transition('Idle', 'User enabled extension');
      }
    });

    // 3. Initialize AI Worker
    await this.initWorker();

    // 4. Initialize Adapter
    this.adapter.initialize();
    
    // 5. Setup FSM Handlers
    this.setupStateMachine();

    // 6. Listen for connection changes
    this.adapter.observeConnectionChanges((isConnected) => {
      if (isConnected && this.fsm.getState() === 'WaitingForConnection') {
        this.fsm.transition('WaitingDelay', 'Stranger connected');
      }
    });

    // Ready
    if (this.fsm.getState() === 'Initializing') {
      this.fsm.transition('Idle', 'Init complete');
      if (this.settings?.enabled) {
         this.fsm.transition('WaitingForConnection', 'Extension enabled on startup');
      }
    }
  }

  private async initWorker() {
    return new Promise<void>((resolve, reject) => {
      try {
        // Load worker via chrome extension URL
        const workerUrl = chrome.runtime.getURL('assets/inference.worker.js'); // Vite builds it to assets
        this.worker = new Worker(workerUrl);
        
        this.worker.onmessage = (e) => {
          const { type, payload, error } = e.data;
          
          if (type === 'INIT_SUCCESS') {
            resolve();
          } else if (type === 'INIT_ERROR') {
            console.error('[SkipSense Content] Worker Init Error:', error);
            reject(new Error(error));
          } else if (type === 'INFER_SUCCESS') {
            this.handleInferenceResult(payload as InferenceResult);
          } else if (type === 'INFER_ERROR') {
            console.error('[SkipSense Content] Worker Infer Error:', error);
            this.handleInferenceResult({ prediction: 'UNKNOWN', confidence: 0, faceCount: 0, processingTimeMs: 0, error });
          }
        };

        this.worker.postMessage({
          type: 'INIT',
          id: 'init',
          payload: {
            wasmUrl: chrome.runtime.getURL('models/'),
            faceModelUrl: chrome.runtime.getURL('models/blaze_face_short_range.tflite'),
            genderModelUrl: chrome.runtime.getURL('models/genderage.onnx'),
            backend: this.settings?.preferredModelBackend || 'WASM'
          }
        });

      } catch (e) {
        console.error('[SkipSense Content] Failed to create Worker:', e);
        reject(e);
      }
    });
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
        }, this.settings.detectionDelayMs);
      }
      
      if (to === 'CapturingFrame') {
        this.captureAndInfer();
      }

      if (to === 'WaitingForConnection') {
        this.currentRetryCount = 0; // Reset retries for new connection
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
        this.fsm.transition('WaitingForConnection', 'Video lost');
        this.isProcessingFrame = false;
        return;
      }

      // Throttle inferences
      const now = performance.now();
      if (now - this.lastInferenceTime < this.settings.maxInferenceIntervalMs) {
        // Wait and retry
        setTimeout(() => {
           this.isProcessingFrame = false;
           if (this.fsm.getState() === 'CapturingFrame' && connectionId === this.currentConnectionId) {
             this.captureAndInfer();
           }
        }, this.settings.maxInferenceIntervalMs - (now - this.lastInferenceTime));
        return;
      }
      this.lastInferenceTime = now;

      // Draw video to offscreen canvas to scale it down immediately
      this.frameCtx.drawImage(video, 0, 0, 224, 224);
      
      // Convert to ImageBitmap (zero-copy transfer to worker)
      const imageBitmap = this.frameCanvas.transferToImageBitmap();

      this.fsm.transition('DetectingFace', 'Frame sent to worker');
      
      // Send to worker
      this.worker?.postMessage({
        type: 'INFER',
        id: connectionId,
        payload: imageBitmap
      }, [imageBitmap]); // Transfer ownership

    } catch (error) {
      console.error('[SkipSense Content] Capture Error:', error);
      this.fsm.transition('Error', 'Capture failed');
      this.isProcessingFrame = false;
    }
  }

  private handleInferenceResult(result: InferenceResult) {
    this.isProcessingFrame = false;
    
    // Ensure we haven't already skipped or disconnected
    if (!['DetectingFace', 'RunningInference'].includes(this.fsm.getState())) {
      return; 
    }

    this.fsm.transition('MakingDecision', 'Result received');

    // Make Decision
    const decision = DecisionEngine.evaluate(result, this.settings, this.currentRetryCount);
    
    // Broadcast stats
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
      this.fsm.transition('Skipping', 'Decision: SKIP');
      this.adapter.clickNext();
      this.fsm.transition('WaitingNextConnection', 'Clicked next');
      
      // Re-arm immediately
      setTimeout(() => {
         if (this.fsm.getState() === 'WaitingNextConnection') {
            this.fsm.transition('WaitingForConnection', 'Ready for next');
         }
      }, 500);

    } else if (decision === 'RETRY') {
      this.currentRetryCount++;
      this.fsm.transition('WaitingDelay', 'Decision: RETRY'); // Will trigger capture again
    } else if (decision === 'STAY' || decision === 'WAIT') {
      this.fsm.transition('WaitingForConnection', 'Decision: STAY/WAIT');
    }
  }

  cleanup() {
    this.adapter.cleanup();
    if (this.worker) {
      this.worker.terminate();
    }
  }
}
