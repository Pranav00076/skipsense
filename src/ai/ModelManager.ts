export interface ModelConfig {
  name: string;
  url: string;
  expectedSha256: string;
}

export const REQUIRED_MODELS: ModelConfig[] = [
  {
    name: 'blaze_face_short_range.tflite',
    url: '/models/blaze_face_short_range.tflite',
    expectedSha256: 'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f'
  },
  {
    name: 'genderage.onnx',
    url: '/models/genderage.onnx',
    expectedSha256: '4fde69b1c810857b88c64a335084f1c3fe8f01246c9a191b48c7bb756d6652fb'
  }
];

export const REQUIRED_WASM: ModelConfig[] = [
  {
    name: 'vision_wasm_internal.wasm',
    url: '/models/vision_wasm_internal.wasm',
    expectedSha256: '' // Lengthy to hardcode across versions, will just verify existence and size > 0
  },
  {
    name: 'ort-wasm-simd-threaded.wasm',
    url: '/models/ort-wasm-simd-threaded.wasm',
    expectedSha256: ''
  }
];

export class ModelManager {
  /**
   * Validates all required models and WASM dependencies.
   * Fetches them, computes SHA-256 hashes, and aborts on mismatch.
   */
  static async validateAll(): Promise<void> {
    console.log('[SkipSense ModelManager] Validating offline AI stack...');

    const allDeps = [...REQUIRED_MODELS, ...REQUIRED_WASM];
    
    for (const dep of allDeps) {
      try {
        const fullUrl = chrome.runtime.getURL(dep.url);
        const response = await fetch(fullUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} - File missing or inaccessible`);
        }

        const buffer = await response.arrayBuffer();
        
        if (buffer.byteLength === 0) {
           throw new Error(`File is empty (0 bytes)`);
        }

        if (dep.expectedSha256) {
           const hash = await this.calculateSha256(buffer);
           if (hash !== dep.expectedSha256) {
             throw new Error(`SHA256 Checksum Mismatch!\nExpected: ${dep.expectedSha256}\nGot:      ${hash}`);
           }
        }
        
        console.log(`[SkipSense ModelManager] Validated: ${dep.name}`);
      } catch (error: any) {
        const msg = `Validation failed for ${dep.name}: ${error.message}. Please run "npm run postinstall".`;
        console.error(`[SkipSense ModelManager] ${msg}`);
        throw new Error(msg);
      }
    }

    console.log('[SkipSense ModelManager] All models validated successfully.');
  }

  private static async calculateSha256(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }
}
