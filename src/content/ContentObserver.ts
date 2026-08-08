import { SiteAdapter } from '../sites/SiteAdapter';
import { StateMachine } from '../core/StateMachine';
import { MessageBus } from '../core/MessageBus';
import { DecisionEngine } from '../core/DecisionEngine';
import { StorageService, DEFAULT_SETTINGS } from '../storage/StorageService';
import { ExtensionSettings, InferenceResult } from '../types';
import { InferencePipeline } from '../ai/InferencePipeline';

export class ContentObserver {
  private adapter: SiteAdapter;
  private fsm: StateMachine;
  private settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
  private pipeline: InferencePipeline;
  
  private currentRetryCount = 0;
  private lastInferenceTime = 0;
  private frameCanvas: OffscreenCanvas;
  private frameCtx: OffscreenCanvasRenderingContext2D;
  private isProcessingFrame = false;
  private currentConnectionId = 0;
  private hudElement: HTMLElement | null = null;
  private watchdogInterval: any = null;

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
    try {
      const stored = await StorageService.getSettings();
      if (stored) {
        this.settings = { ...this.settings, ...stored };
      }
    } catch {}

    // 2. Real-time storage sync
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.settings) {
          this.settings = { ...this.settings, ...changes.settings.newValue };
          this.updateHUD(`Target: ${this.settings.targetPresentation}`);
        }
      });
    }

    // 3. Listen for direct queries from popup
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (request?.type === 'GET_FSM_STATE') {
          sendResponse({
            state: this.fsm.getState(),
            connected: this.adapter.isConnected(),
            settings: this.settings
          });
          return false;
        }
      });
    }

    // 4. Create floating UI badge for live visual feedback
    this.initHUD();

    // 5. Initialize AI Models directly in content window
    try {
      await this.pipeline.initialize({
        wasm: chrome.runtime.getURL('models/'),
        faceModel: chrome.runtime.getURL('models/blaze_face_short_range.tflite'),
        genderModel: chrome.runtime.getURL('models/genderage.onnx')
      }, this.settings?.preferredModelBackend || 'WASM');
      console.log('[SkipSense Content] Local AI models ready.');
      this.updateHUD('AI Engine Ready');
    } catch (e) {
      console.error('[SkipSense Content] Failed to initialize local AI models:', e);
      this.updateHUD('AI Init Error');
    }

    // 6. Initialize Adapter
    this.adapter.initialize();
    
    // 7. Setup FSM Handlers
    this.setupStateMachine();

    // 8. Listen for connection changes from OmeTV
    this.adapter.observeConnectionChanges((isConnected) => {
      if (isConnected) {
        if (['WaitingForConnection', 'Idle', 'Initializing'].includes(this.fsm.getState())) {
          this.fsm.transition('WaitingDelay', 'Stranger connected');
        }
      } else {
        if (this.fsm.getState() !== 'WaitingForConnection' && this.fsm.getState() !== 'Paused') {
          this.fsm.transition('WaitingForConnection', 'Stranger disconnected');
        }
      }
    });

    // 9. Continuous Watchdog (Checks every 300ms if video is streaming but FSM is idle)
    this.watchdogInterval = setInterval(() => {
      if (this.settings.enabled && this.adapter.isConnected()) {
        const state = this.fsm.getState();
        if (state === 'WaitingForConnection' || state === 'Idle') {
          this.fsm.transition('CapturingFrame', 'Watchdog triggered inference on active stream');
        }
      }
    }, 300);

    // 10. Initial state transition
    if (this.fsm.getState() === 'Initializing') {
      this.fsm.transition('Idle', 'Init complete');
      if (this.settings.enabled) {
        if (this.adapter.isConnected()) {
          this.fsm.transition('CapturingFrame', 'Stranger connected on start');
        } else {
          this.fsm.transition('WaitingForConnection', 'Ready for stranger');
        }
      }
    }
  }

  private initHUD() {
    if (document.getElementById('skipsense-hud')) return;
    const hud = document.createElement('div');
    hud.id = 'skipsense-hud';
    hud.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 999999;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(8px);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 6px 14px;
      border-radius: 9999px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      gap: 6px;
      pointer-events: none;
      transition: all 0.2s ease;
    `;
    hud.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;"></span> SkipSense: Ready`;
    document.body.appendChild(hud);
    this.hudElement = hud;
  }

  private updateHUD(text: string, color = '#38bdf8') {
    if (this.hudElement) {
      this.hudElement.style.color = color;
      this.hudElement.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};"></span> SkipSense: ${text}`;
    }
  }

  private setupStateMachine() {
    this.fsm.subscribe((_from, to) => {
      this.updateHUD(to);

      if (to === 'WaitingDelay') {
        setTimeout(() => {
          if (this.fsm.getState() === 'WaitingDelay') {
            this.fsm.transition('CapturingFrame', 'Delay completed');
          }
        }, 150);
      }
      
      if (to === 'CapturingFrame') {
        this.captureAndInfer();
      }

      if (to === 'WaitingForConnection') {
        this.currentRetryCount = 0;
        this.currentConnectionId++;
      }
    });
  }

  private async captureAndInfer() {
    if (this.isProcessingFrame) return;
    this.isProcessingFrame = true;
    const connectionId = this.currentConnectionId;

    try {
      const video = this.adapter.getVideo();
      if (!video) {
        this.fsm.transition('WaitingForConnection', 'Video stream unavailable');
        this.isProcessingFrame = false;
        return;
      }

      // Throttle inferences to prevent spam
      const now = performance.now();
      if (now - this.lastInferenceTime < (this.settings.maxInferenceIntervalMs || 400)) {
        setTimeout(() => {
           this.isProcessingFrame = false;
           if (this.fsm.getState() === 'CapturingFrame' && connectionId === this.currentConnectionId) {
             this.captureAndInfer();
           }
        }, (this.settings.maxInferenceIntervalMs || 400) - (now - this.lastInferenceTime));
        return;
      }
      this.lastInferenceTime = now;

      // Draw video frame to offscreen canvas
      this.frameCtx.drawImage(video, 0, 0, 224, 224);
      const imageBitmap = this.frameCanvas.transferToImageBitmap();

      this.fsm.transition('DetectingFace', 'Analyzing stranger');
      
      // Run direct on-device inference
      const result = await this.pipeline.execute(imageBitmap);
      imageBitmap.close();

      this.handleInferenceResult(result);

    } catch (error: any) {
      console.error('[SkipSense Content] Capture Error:', error);
      this.fsm.transition('Error', 'Inference capture error');
      this.isProcessingFrame = false;
      
      setTimeout(() => {
        if (this.fsm.getState() === 'Error') {
          this.fsm.transition('WaitingForConnection', 'Error recovery');
        }
      }, 500);
    }
  }

  private handleInferenceResult(result: InferenceResult) {
    this.isProcessingFrame = false;
    
    if (!['DetectingFace', 'RunningInference'].includes(this.fsm.getState())) {
      return; 
    }

    const confPercent = (result.confidence * 100).toFixed(0);
    this.fsm.transition('MakingDecision', `Result: ${result.prediction} (${confPercent}%)`);

    // Evaluate Decision
    const decision = DecisionEngine.evaluate(result, this.settings, this.currentRetryCount);
    
    console.log(`[SkipSense Decision] Prediction: ${result.prediction} | Confidence: ${result.confidence.toFixed(2)} | Target: ${this.settings.targetPresentation} | Action: ${decision}`);
    this.updateHUD(`${result.prediction} (${confPercent}%) -> ${decision}`, decision === 'SKIP' ? '#ef4444' : '#22c55e');

    // Broadcast stats update
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
      
      // Re-arm for next stranger
      setTimeout(() => {
         if (this.fsm.getState() === 'WaitingNextConnection') {
            this.fsm.transition('WaitingForConnection', 'Ready for next stranger');
         }
      }, 300);

    } else if (decision === 'RETRY') {
      this.currentRetryCount++;
      console.log(`[SkipSense Retry] Retrying detection (${this.currentRetryCount}/${this.settings.maxRetries})...`);
      this.fsm.transition('WaitingDelay', 'Retrying frame inference');
    } else if (decision === 'STAY' || decision === 'WAIT') {
      this.fsm.transition('WaitingForConnection', 'Decision accepted (STAY)');
    }
  }

  cleanup() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
    }
    this.adapter.cleanup();
  }
}
