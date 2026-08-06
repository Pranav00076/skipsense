import { describe, it, expect } from 'vitest';
import { DecisionEngine } from '../src/core/DecisionEngine';
import { DEFAULT_SETTINGS } from '../src/storage/StorageService';
import { InferenceResult } from '../src/types';

describe('DecisionEngine', () => {
  const baseResult: InferenceResult = {
    prediction: 'MALE',
    confidence: 0.9,
    faceCount: 1,
    processingTimeMs: 100
  };

  it('should return STAY if extension is disabled', () => {
    const action = DecisionEngine.evaluate(baseResult, { ...DEFAULT_SETTINGS, enabled: false }, 0);
    expect(action).toBe('STAY');
  });

  it('should return RETRY if no faces found and retries remain', () => {
    const result = { ...baseResult, faceCount: 0 };
    const action = DecisionEngine.evaluate(result, { ...DEFAULT_SETTINGS, maxRetries: 3 }, 0);
    expect(action).toBe('RETRY');
  });

  it('should fallback to unknownBehavior if no faces and out of retries', () => {
    const result = { ...baseResult, faceCount: 0 };
    const action = DecisionEngine.evaluate(result, { ...DEFAULT_SETTINGS, maxRetries: 3, unknownBehavior: 'SKIP' }, 3);
    expect(action).toBe('SKIP');
  });

  it('should return SKIP if prediction does not match target presentation', () => {
    // Prediction is MALE, but user wants FEMALE
    const action = DecisionEngine.evaluate(baseResult, { ...DEFAULT_SETTINGS, targetPresentation: 'FEMALE' }, 0);
    expect(action).toBe('SKIP');
  });

  it('should return STAY if prediction matches target presentation', () => {
    // Prediction is MALE, user wants MALE
    const action = DecisionEngine.evaluate(baseResult, { ...DEFAULT_SETTINGS, targetPresentation: 'MALE' }, 0);
    expect(action).toBe('STAY');
  });

  it('should return STAY if target presentation is ANY', () => {
    const action = DecisionEngine.evaluate(baseResult, { ...DEFAULT_SETTINGS, targetPresentation: 'ANY' }, 0);
    expect(action).toBe('STAY');
  });
});
