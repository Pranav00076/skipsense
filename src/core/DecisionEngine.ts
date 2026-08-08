import { DecisionAction, ExtensionSettings, InferenceResult } from '../types';

export class DecisionEngine {
  /**
   * Evaluates the inference result against the user's settings to determine the next action.
   * Handles individual strangers, multi-person groups, lighting quality, and bad camera angles.
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

    // 2. Handle Camera Angle & Lighting Quality (Too Dark, Too Bright, Covered Camera, Blurry)
    if (result.qualityIssue && result.qualityIssue !== 'NONE') {
      console.log(`[SkipSense Decision] Quality issue detected (${result.qualityIssue}) -> AUTO-SKIPPING.`);
      return 'SKIP';
    }

    // 3. Handle Model Failure
    if (result.error && !result.groupPredictions?.length) {
       return 'SKIP';
    }

    // 4. Handle Group Detection:
    // If target is FEMALE and ANY person in the picture/group is MALE -> SKIP!
    if (settings.targetPresentation === 'FEMALE') {
      const anyMaleInGroup = result.groupPredictions?.some(p => p.prediction === 'MALE' && p.confidence >= 0.50);
      if (anyMaleInGroup || result.prediction === 'MALE') {
        console.log(`[SkipSense Decision] Group check: Male detected in frame -> AUTO-SKIPPING.`);
        return 'SKIP';
      }
    }

    // If target is MALE and ANY person in the group is FEMALE -> SKIP!
    if (settings.targetPresentation === 'MALE') {
      const anyFemaleInGroup = result.groupPredictions?.some(p => p.prediction === 'FEMALE' && p.confidence >= 0.50);
      if (anyFemaleInGroup || result.prediction === 'FEMALE') {
        console.log(`[SkipSense Decision] Group check: Female detected in frame -> AUTO-SKIPPING.`);
        return 'SKIP';
      }
    }

    // 5. Handle Target Presentation ANY
    if (settings.targetPresentation === 'ANY') {
      return 'STAY';
    }

    // 6. Handle Confidence Threshold
    const minThreshold = settings.confidenceThreshold || 0.50;
    if (result.confidence < minThreshold) {
      if (currentRetryCount < settings.maxRetries) {
        return 'RETRY';
      }
      return this.mapUnknownBehavior(settings.unknownBehavior);
    }

    // 7. Standard Single Target Matching
    if (result.prediction !== settings.targetPresentation) {
      return 'SKIP';
    }

    // It matches what the user wants!
    return 'STAY';
  }

  private static mapUnknownBehavior(behavior: 'RETRY' | 'WAIT' | 'SKIP'): DecisionAction {
    switch (behavior) {
      case 'SKIP': return 'SKIP';
      case 'WAIT': return 'WAIT';
      case 'RETRY': return 'SKIP';
      default: return 'SKIP';
    }
  }
}
