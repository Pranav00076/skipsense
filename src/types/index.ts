export type TargetPresentation = 'MALE' | 'FEMALE' | 'ANY';
export type UnknownBehavior = 'RETRY' | 'WAIT' | 'SKIP';
export type ModelBackend = 'WEBGPU' | 'WASM';

export interface ExtensionSettings {
  version: number;
  enabled: boolean;
  targetPresentation: TargetPresentation;
  confidenceThreshold: number; // 0.60 to 0.99
  detectionDelayMs: number;
  unknownBehavior: UnknownBehavior;
  maxRetries: number;
  maxInferenceIntervalMs: number;
  enableNotifications: boolean;
  enableSound: boolean;
  debugMode: boolean;
  whitelistedSites: string[];
  blacklistedSites: string[];
  theme: 'DARK' | 'LIGHT' | 'SYSTEM';
  preferredModelBackend: ModelBackend;
}

export interface ExtensionStats {
  totalConnections: number;
  totalSkipped: number;
  totalAccepted: number;
  totalUnknown: number;
  totalRetries: number;
  averageConfidence: number;
  averageInferenceTimeMs: number;
  sessionDate: string;
}

export type FSMState = 
  | 'Initializing'
  | 'Idle'
  | 'WaitingForConnection'
  | 'WaitingDelay'
  | 'CapturingFrame'
  | 'DetectingFace'
  | 'RunningInference'
  | 'MakingDecision'
  | 'Skipping'
  | 'WaitingNextConnection'
  | 'Paused'
  | 'Error';

export type InferencePrediction = 'MALE' | 'FEMALE' | 'UNKNOWN';

export interface InferenceResult {
  prediction: InferencePrediction;
  confidence: number;
  faceCount: number;
  processingTimeMs: number;
  qualityIssue?: 'TOO_DARK' | 'TOO_BRIGHT' | 'BLURRY_OR_COVERED' | 'NONE';
  groupPredictions?: { prediction: InferencePrediction; confidence: number }[];
  error?: string;
}

export type DecisionAction = 'SKIP' | 'STAY' | 'RETRY' | 'WAIT';

export type MessageType =
  | 'SETTINGS_UPDATED'
  | 'STATS_UPDATED'
  | 'MODEL_READY'
  | 'MODEL_FAILED'
  | 'FRAME_CAPTURED'
  | 'FACE_DETECTED'
  | 'INFERENCE_RESULT'
  | 'PROCESS_FRAME_INFERENCE'
  | 'SKIP_ACTION'
  | 'PAUSE_EXTENSION'
  | 'RESUME_EXTENSION'
  | 'FSM_STATE_CHANGE'
  | 'ERROR_OCCURRED';

export interface BaseMessage {
  type: MessageType;
  payload?: any;
}

export interface SettingsUpdatedMessage extends BaseMessage {
  type: 'SETTINGS_UPDATED';
  payload: { settings: ExtensionSettings };
}

export interface InferenceResultMessage extends BaseMessage {
  type: 'INFERENCE_RESULT';
  payload: InferenceResult;
}

export interface FSMStateChangeMessage extends BaseMessage {
  type: 'FSM_STATE_CHANGE';
  payload: { from: FSMState; to: FSMState; reason?: string };
}
