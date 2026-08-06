import { InferencePipeline } from '../ai/InferencePipeline';
import { ModelBackend } from '../types';

/**
 * Dedicated Web Worker for AI Inference.
 * Communicates with the Content Script or Background Service Worker.
 */

const pipeline = new InferencePipeline();

self.onmessage = async (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  if (type === 'INIT') {
    try {
      const { wasmUrl, faceModelUrl, genderModelUrl, backend } = payload as { 
        wasmUrl: string; 
        faceModelUrl: string; 
        genderModelUrl: string; 
        backend: ModelBackend 
      };
      
      await pipeline.initialize(
        { wasm: wasmUrl, faceModel: faceModelUrl, genderModel: genderModelUrl },
        backend
      );
      
      self.postMessage({ type: 'INIT_SUCCESS', id });
    } catch (error: any) {
      self.postMessage({ type: 'INIT_ERROR', id, error: error.message });
    }
  } 
  else if (type === 'INFER') {
    try {
      const imageBitmap = payload as ImageBitmap;
      const result = await pipeline.execute(imageBitmap);
      
      // We must close the ImageBitmap to prevent memory leaks in the worker
      imageBitmap.close();
      
      self.postMessage({ type: 'INFER_SUCCESS', id, payload: result });
    } catch (error: any) {
      self.postMessage({ type: 'INFER_ERROR', id, error: error.message });
    }
  }
};
