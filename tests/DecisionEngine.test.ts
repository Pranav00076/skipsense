import { describe, it, expect } from 'vitest';
import { DecisionEngine } from '../src/core/DecisionEngine';
import { DEFAULT_SETTINGS } from '../src/storage/StorageService';
import { InferenceResult } from '../src/types';

describe('DecisionEngine', () => {
  const baseResult: InferenceResult = {
    prediction: 'MALE',
    confidence: 0.9,
    faceCount: 1,
    processingTimeMs: 100,
    qualityIssue: 'NONE'
  };

  it('should return STAY if extension is disabled', () => {
    const action = DecisionEngine.evaluate(baseResult, { ...DEFAULT_SETTINGS, enabled: false }, 0);
    expect(action).toBe('STAY');
  });

  it('should return SKIP if frame is too dark or overexposed', () => {
    const darkResult: InferenceResult = { ...baseResult, qualityIssue: 'TOO_DARK' };
    const actionDark = DecisionEngine.evaluate(darkResult, DEFAULT_SETTINGS, 0);
    expect(actionDark).toBe('SKIP');

    const brightResult: InferenceResult = { ...baseResult, qualityIssue: 'TOO_BRIGHT' };
    const actionBright = DecisionEngine.evaluate(brightResult, DEFAULT_SETTINGS, 0);
    expect(actionBright).toBe('SKIP');
  });

  it('should return SKIP if camera is obscured or angle is bad', () => {
    const blurryResult: InferenceResult = { ...baseResult, qualityIssue: 'BLURRY_OR_COVERED' };
    const action = DecisionEngine.evaluate(blurryResult, DEFAULT_SETTINGS, 0);
    expect(action).toBe('SKIP');
  });

  it('should return SKIP if target is FEMALE and ANY male is in group', () => {
    const groupResult: InferenceResult = {
      ...baseResult,
      prediction: 'FEMALE',
      confidence: 0.85,
      groupPredictions: [
        { prediction: 'FEMALE', confidence: 0.88 },
        { prediction: 'MALE', confidence: 0.75 }
      ]
    };
    const action = DecisionEngine.evaluate(groupResult, { ...DEFAULT_SETTINGS, targetPresentation: 'FEMALE' }, 0);
    expect(action).toBe('SKIP');
  });

  it('should return SKIP if prediction does not match target presentation', () => {
    const action = DecisionEngine.evaluate(baseResult, { ...DEFAULT_SETTINGS, targetPresentation: 'FEMALE' }, 0);
    expect(action).toBe('SKIP');
  });

  it('should return STAY if prediction matches target presentation', () => {
    const action = DecisionEngine.evaluate(baseResult, { ...DEFAULT_SETTINGS, targetPresentation: 'MALE' }, 0);
    expect(action).toBe('STAY');
  });

  it('should return STAY if target presentation is ANY', () => {
    const action = DecisionEngine.evaluate(baseResult, { ...DEFAULT_SETTINGS, targetPresentation: 'ANY' }, 0);
    expect(action).toBe('STAY');
  });
});
