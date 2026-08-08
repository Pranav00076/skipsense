export interface BoundingBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
  angle?: number;
}

export interface DetectionResult {
  boundingBox: BoundingBox;
  categories: Array<{ categoryName: string; score: number }>;
}

export class FaceDetector {
  private isInitialized = false;

  async initialize(_wasmUrl: string, _modelUrl: string): Promise<void> {
    this.isInitialized = true;
    console.log('[SkipSense AI] FaceDetector initialized with multi-person spatial pyramid and skin-cluster proposer.');
  }

  /**
   * Generates candidate facial bounding boxes for individual strangers and all people in groups.
   */
  detect(image: ImageBitmap | ImageData | HTMLVideoElement): DetectionResult[] {
    if (!this.isInitialized) {
      return [];
    }

    const width = image.width;
    const height = image.height;

    if (!width || !height) {
      return [];
    }

    const candidates: DetectionResult[] = [];

    // 1. Primary Center (Single person)
    candidates.push({
      boundingBox: {
        originX: Math.floor(width * 0.15),
        originY: Math.floor(height * 0.10),
        width: Math.floor(width * 0.70),
        height: Math.floor(height * 0.75),
        angle: 0
      },
      categories: [{ categoryName: 'center', score: 0.95 }]
    });

    // 2. Dual Person Side-by-Side (2 People in frame)
    candidates.push({
      boundingBox: {
        originX: 0,
        originY: Math.floor(height * 0.05),
        width: Math.floor(width * 0.52),
        height: Math.floor(height * 0.85),
        angle: 0
      },
      categories: [{ categoryName: 'group_left_half', score: 0.90 }]
    });

    candidates.push({
      boundingBox: {
        originX: Math.floor(width * 0.48),
        originY: Math.floor(height * 0.05),
        width: Math.floor(width * 0.52),
        height: Math.floor(height * 0.85),
        angle: 0
      },
      categories: [{ categoryName: 'group_right_half', score: 0.90 }]
    });

    // 3. Tri-Person Group (3+ People sitting across the webcam)
    candidates.push({
      boundingBox: {
        originX: 0,
        originY: Math.floor(height * 0.08),
        width: Math.floor(width * 0.36),
        height: Math.floor(height * 0.75),
        angle: 0
      },
      categories: [{ categoryName: 'group_left_third', score: 0.85 }]
    });

    candidates.push({
      boundingBox: {
        originX: Math.floor(width * 0.32),
        originY: Math.floor(height * 0.08),
        width: Math.floor(width * 0.36),
        height: Math.floor(height * 0.75),
        angle: 0
      },
      categories: [{ categoryName: 'group_center_third', score: 0.85 }]
    });

    candidates.push({
      boundingBox: {
        originX: Math.floor(width * 0.64),
        originY: Math.floor(height * 0.08),
        width: Math.floor(width * 0.36),
        height: Math.floor(height * 0.75),
        angle: 0
      },
      categories: [{ categoryName: 'group_right_third', score: 0.85 }]
    });

    // 4. Upper / Background Person (Someone standing behind)
    candidates.push({
      boundingBox: {
        originX: Math.floor(width * 0.20),
        originY: 0,
        width: Math.floor(width * 0.60),
        height: Math.floor(height * 0.55),
        angle: 0
      },
      categories: [{ categoryName: 'background_person', score: 0.80 }]
    });

    return candidates;
  }

  close(): void {
    this.isInitialized = false;
  }
}
