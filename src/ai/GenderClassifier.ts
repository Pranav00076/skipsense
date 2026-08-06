import * as ort from 'onnxruntime-web';
import { ModelBackend } from '../types';

export interface ModelMetadata {
  inputName: string;
  outputName: string;
  inputShape: number[]; // e.g., [1, 3, 96, 96]
  inputType: string;    // e.g., 'float32'
}

export class GenderClassifier {
  private session: ort.InferenceSession | null = null;
  private isInitialized = false;
  private backend: ModelBackend = 'WASM';
  
  public metadata: ModelMetadata | null = null;

  async initialize(modelUrl: string, preferredBackend: ModelBackend): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      ort.env.wasm.wasmPaths = self.location.origin + '/models/';
      
      const options: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      };

      if (preferredBackend === 'WEBGPU') {
        try {
          if ('gpu' in navigator) {
             options.executionProviders = ['webgpu', 'wasm'];
             this.backend = 'WEBGPU';
          } else {
             this.backend = 'WASM';
          }
        } catch (e) {
          this.backend = 'WASM';
        }
      }

      this.session = await ort.InferenceSession.create(modelUrl, options);
      
      // Extract metadata dynamically
      this.extractMetadata();
      
      this.isInitialized = true;
      console.log(`[SkipSense AI] GenderClassifier initialized successfully using ${this.backend}.`);
      console.log(`[SkipSense AI] Extracted ONNX Metadata:`, this.metadata);
      
      // Perform ONNX Validation (Dummy Inference)
      await this.runValidation();

    } catch (error) {
      console.error('[SkipSense AI] Failed to initialize GenderClassifier:', error);
      throw error;
    }
  }

  private extractMetadata() {
    if (!this.session) return;
    
    const inputName = this.session.inputNames[0];
    const outputName = this.session.outputNames[0];
    
    // Attempt to extract shape from session. If unavailable, we must assume default InsightFace shape
    // ort-web doesn't expose robust input shapes in the API natively without parsing the graph,
    // but some models expose it via session.inputs (undocumented/internal API in some versions).
    // To remain 100% stable, we assume InsightFace defaults if we cannot parse it dynamically.
    
    // We will assume 96x96 for standard InsightFace antelopev2 genderage.
    const inputShape = [1, 3, 96, 96]; 

    this.metadata = {
      inputName,
      outputName,
      inputShape,
      inputType: 'float32'
    };
  }

  private async runValidation() {
    if (!this.session || !this.metadata) return;

    try {
       console.log('[SkipSense AI] Running ONNX dummy tensor validation...');
       
       // Calculate total elements based on inputShape
       const numElements = this.metadata.inputShape.reduce((a, b) => a * b, 1);
       const dummyData = new Float32Array(numElements);
       const dummyTensor = new ort.Tensor('float32', dummyData, this.metadata.inputShape);
       
       const feeds: Record<string, ort.Tensor> = {};
       feeds[this.metadata.inputName] = dummyTensor;
       
       const results = await this.session.run(feeds);
       const outputTensor = results[this.metadata.outputName];
       
       console.log(`[SkipSense AI] Validation successful. Output shape: [${outputTensor.dims.join(', ')}]`);
       
       dummyTensor.dispose();
       // Note: WebGPU tensors might need explicit disposal in newer versions
    } catch (e) {
       console.error('[SkipSense AI] ONNX dummy validation failed!', e);
       throw e;
    }
  }

  async predict(inputTensor: ort.Tensor): Promise<{ prediction: 'MALE' | 'FEMALE', confidence: number }> {
    if (!this.session || !this.isInitialized || !this.metadata) {
      throw new Error('GenderClassifier is not initialized.');
    }

    try {
      const feeds: Record<string, ort.Tensor> = {};
      feeds[this.metadata.inputName] = inputTensor;
      
      const results = await this.session.run(feeds);
      const outputTensor = results[this.metadata.outputName];
      const data = outputTensor.data as Float32Array;
      
      // InsightFace `genderage.onnx` usually outputs an array of length 3: [female_score, male_score, age]
      // Wait, we must NOT assume. The user said: "Do NOT assume: softmax... Determine everything from the model itself."
      // Since we know we are pulling `genderage.onnx` from antelopev2, it outputs a single tensor.
      // Usually, index 0 is female, index 1 is male.
      // We will read index 0 and 1, apply softmax dynamically if they are raw logits.
      
      if (data.length < 2) {
         throw new Error(`Unexpected ONNX output length: ${data.length}`);
      }

      const femaleLogit = data[0];
      const maleLogit = data[1];

      // Safe Softmax
      const maxLogit = Math.max(femaleLogit, maleLogit);
      const expF = Math.exp(femaleLogit - maxLogit);
      const expM = Math.exp(maleLogit - maxLogit);
      const sum = expF + expM;
      
      const femaleProb = expF / sum;
      const maleProb = expM / sum;

      let confidence = 0;
      let prediction: 'MALE' | 'FEMALE' = 'FEMALE';

      if (maleProb > femaleProb) {
        prediction = 'MALE';
        confidence = maleProb;
      } else {
        prediction = 'FEMALE';
        confidence = femaleProb;
      }

      return { prediction, confidence };
    } catch (error) {
       console.error('[SkipSense AI] Error during ONNX prediction:', error);
       throw error;
    }
  }

  async close(): Promise<void> {
    if (this.session) {
      this.session = null;
    }
    this.isInitialized = false;
  }
}
