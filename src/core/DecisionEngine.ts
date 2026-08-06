import { DecisionAction, ExtensionSettings, InferenceResult } from '../types';

export class DecisionEngine {
  /**
   * Evaluates the inference result against the user's settings to determine the next action.
   * This is a pure function. It does NOT interact with the DOM or the State Machine.
   * 
   * @param result The output from the AI pipeline
   * @param settings The user's current preferences
   * @param currentRetryCount How many times we've retried on the current connection
   * @returns DecisionAction (SKIP, STAY, RETRY, WAIT)
   */
  static evaluate(
    result: InferenceResult, 
    settings: ExtensionSettings, 
    currentRetryCount: number
  ): DecisionAction {
    
    // 1. Check if extension is disabled altogether
    if (!settings.enabled) {
      return 'STAY';
    }

    // 2. Handle Errors (e.g. Model failure)
    if (result.error) {
       // If the model actually threw an error, we should probably just WAIT or STAY and let the user decide.
       return 'STAY';
    }

    // 3. Handle NO faces or MULTIPLE faces
    if (result.faceCount !== 1 || result.prediction === 'UNKNOWN') {
      if (currentRetryCount < settings.maxRetries) {
        return 'RETRY';
      }
      // Out of retries, fallback to unknown behavior setting
      return this.mapUnknownBehavior(settings.unknownBehavior);
    }

    // 4. Handle Confidence Threshold
    if (result.confidence < settings.confidenceThreshold) {
      if (currentRetryCount < settings.maxRetries) {
        return 'RETRY';
      }
      // Out of retries, confidence is too low -> treat as UNKNOWN
      return this.mapUnknownBehavior(settings.unknownBehavior);
    }

    // 5. Evaluate Target Presentation
    if (settings.targetPresentation === 'ANY') {
      return 'STAY';
    }

    if (result.prediction !== settings.targetPresentation) {
      // The prediction does NOT match what the user wants -> SKIP
      return 'SKIP';
    }

    // It matches what the user wants! -> STAY
    return 'STAY';
  }

  private static mapUnknownBehavior(behavior: 'RETRY' | 'WAIT' | 'SKIP'): DecisionAction {
    switch (behavior) {
      case 'SKIP': return 'SKIP';
      case 'WAIT': return 'WAIT';
      case 'RETRY': return 'STAY'; // If out of retries but behavior says retry, we must STAY to avoid infinite loops, or just WAIT. Let's return WAIT.
      default: return 'WAIT';
    }
  }
}
