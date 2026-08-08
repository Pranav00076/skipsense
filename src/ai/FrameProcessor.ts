import * as ort from 'onnxruntime-web';
import { ModelMetadata } from './GenderClassifier';
import { DetectionResult } from './FaceDetector';

export class FrameProcessor {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private targetWidth = 96;
  private targetHeight = 96;

  constructor() {
    this.canvas = new OffscreenCanvas(this.targetWidth, this.targetHeight);
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Failed to get 2D context for OffscreenCanvas');
    }
    this.ctx = context as OffscreenCanvasRenderingContext2D;
  }

  /**
   * Adapts the processor dynamically to the ONNX model's exact metadata.
   */
  public adaptToModel(metadata: ModelMetadata) {
    if (metadata.inputShape.length === 4) {
      const height = metadata.inputShape[2];
      const width = metadata.inputShape[3];
      
      if (height > 0 && width > 0) {
        this.targetHeight = height;
        this.targetWidth = width;
        this.canvas.width = width;
        this.canvas.height = height;
        console.log(`[SkipSense AI] FrameProcessor adapted to dynamic shape: ${width}x${height}`);
      }
    }
  }

  /**
   * Crops the face ROI, draws it to the dynamic offscreen canvas, and returns the normalized Tensor.
   */
  public processFace(image: ImageBitmap, face: DetectionResult): ort.Tensor {
    const { originX, originY, width, height } = face.boundingBox;
    
    // Add 10% margin around face
    const marginX = width * 0.1;
    const marginY = height * 0.1;
    
    const cropX = Math.max(0, originX - marginX);
    const cropY = Math.max(0, originY - marginY);
    const cropWidth = Math.min(image.width - cropX, width + (marginX * 2));
    const cropHeight = Math.min(image.height - cropY, height + (marginY * 2));

    this.ctx.clearRect(0, 0, this.targetWidth, this.targetHeight);
    
    this.ctx.drawImage(
      image,
      cropX, cropY, cropWidth, cropHeight, 
      0, 0, this.targetWidth, this.targetHeight
    );

    const imageData = this.ctx.getImageData(0, 0, this.targetWidth, this.targetHeight);
    return this.toNormalizedTensor(imageData);
  }

  /**
   * Converts ImageData to a normalized Float32 Tensor.
   * Uses standard InsightFace antelopev2 normalization: (pixel/255.0 - 0.5) / 0.5
   */
  private toNormalizedTensor(imageData: ImageData): ort.Tensor {
    const { data, width, height } = imageData;
    const float32Data = new Float32Array(3 * width * height);
    
    // CHW format (Channels, Height, Width)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4; 
        const destOffset = y * width + x;

        // R
        float32Data[destOffset] = ((data[i] / 255.0) - 0.5) / 0.5;
        // G
        float32Data[width * height + destOffset] = ((data[i + 1] / 255.0) - 0.5) / 0.5;
        // B
        float32Data[2 * width * height + destOffset] = ((data[i + 2] / 255.0) - 0.5) / 0.5;
      }
    }

    return new ort.Tensor('float32', float32Data, [1, 3, height, width]);
  }
}
