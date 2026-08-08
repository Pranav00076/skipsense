export type QualityIssue = 'TOO_DARK' | 'TOO_BRIGHT' | 'BLURRY_OR_COVERED' | 'NONE';

export interface FrameQualityResult {
  isAcceptable: boolean;
  issue: QualityIssue;
  averageLuminance: number;
  contrastStdDev: number;
  reason?: string;
}

export class QualityChecker {
  /**
   * Analyzes an image canvas or ImageData for brightness, glare, blur, and bad camera angles.
   */
  static analyze(imageData: ImageData): FrameQualityResult {
    const { data, width, height } = imageData;
    const totalPixels = width * height;
    
    if (totalPixels === 0) {
      return { isAcceptable: false, issue: 'BLURRY_OR_COVERED', averageLuminance: 0, contrastStdDev: 0, reason: 'Empty frame' };
    }

    let sumLuminance = 0;
    let overexposedCount = 0;
    let underexposedCount = 0;

    // Sample pixels in steps for speed
    const step = 4; // Sample every 4th pixel
    let sampleCount = 0;

    for (let i = 0; i < data.length; i += step * 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Standard ITU-R BT.601 perceptual luminance
      const lum = (0.299 * r) + (0.587 * g) + (0.114 * b);
      sumLuminance += lum;
      sampleCount++;

      if (lum > 235) overexposedCount++;
      if (lum < 25) underexposedCount++;
    }

    const avgLuminance = sumLuminance / sampleCount;

    // Calculate Variance & Standard Deviation for Contrast / Covered Camera detection
    let sumVariance = 0;
    for (let i = 0; i < data.length; i += step * 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = (0.299 * r) + (0.587 * g) + (0.114 * b);
      sumVariance += Math.pow(lum - avgLuminance, 2);
    }
    const stdDev = Math.sqrt(sumVariance / sampleCount);

    // 1. Check if too dark (dark room, blacked out screen, lights off)
    if (avgLuminance < 38 || (underexposedCount / sampleCount) > 0.85) {
      return {
        isAcceptable: false,
        issue: 'TOO_DARK',
        averageLuminance: avgLuminance,
        contrastStdDev: stdDev,
        reason: `Lighting too dark (${avgLuminance.toFixed(1)}/255)`
      };
    }

    // 2. Check if too bright / washed out / camera pointed at ceiling lamp
    if (avgLuminance > 220 || (overexposedCount / sampleCount) > 0.65) {
      return {
        isAcceptable: false,
        issue: 'TOO_BRIGHT',
        averageLuminance: avgLuminance,
        contrastStdDev: stdDev,
        reason: `Lighting overexposed / glare (${avgLuminance.toFixed(1)}/255)`
      };
    }

    // 3. Check if camera is covered with finger/tape or pointing at flat ceiling/wall with zero detail
    if (stdDev < 14) {
      return {
        isAcceptable: false,
        issue: 'BLURRY_OR_COVERED',
        averageLuminance: avgLuminance,
        contrastStdDev: stdDev,
        reason: `Camera obscured or bad angle (Contrast std dev: ${stdDev.toFixed(1)})`
      };
    }

    return {
      isAcceptable: true,
      issue: 'NONE',
      averageLuminance: avgLuminance,
      contrastStdDev: stdDev
    };
  }
}
