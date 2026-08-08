import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_MODELS_DIR = path.resolve(__dirname, '../public/models');
const NODE_MODULES_DIR = path.resolve(__dirname, '../node_modules');

const MODELS = [
  {
    name: 'blaze_face_short_range.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
    expectedSha256: 'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f',
  },
  {
    name: 'genderage.onnx',
    url: 'https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/genderage.onnx',
    expectedSha256: '4fde69b1c810857b88c64a335084f1c3fe8f01246c9a191b48c7bb756d6652fb', 
  }
];

async function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    let file = fs.createWriteStream(destPath);
    let request = https.get(url, function(response) {
      if (response.statusCode === 301 || response.statusCode === 302) {
         file.close();
         return resolve(downloadFile(response.headers.location, destPath));
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.pipe(file);
      
      response.on('data', (chunk) => {
         downloaded += chunk.length;
         if (totalSize) {
            const percent = ((downloaded / totalSize) * 100).toFixed(1);
            process.stdout.write(`\rDownloading ${path.basename(destPath)}... ${percent}%`);
         }
      });

      file.on('finish', () => {
        process.stdout.write('\n');
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function run() {
  console.log('--- SkipSense Model Setup ---');
  if (!fs.existsSync(PUBLIC_MODELS_DIR)) {
    fs.mkdirSync(PUBLIC_MODELS_DIR, { recursive: true });
  }

  // 1. Download Remote Models
  for (const model of MODELS) {
    const destPath = path.join(PUBLIC_MODELS_DIR, model.name);
    
    let needsDownload = true;
    if (fs.existsSync(destPath)) {
      const hash = await calculateSha256(destPath);
      if (hash === model.expectedSha256) {
        console.log(`[✓] ${model.name} already exists and checksum matches.`);
        needsDownload = false;
      } else {
        console.log(`[!] ${model.name} checksum mismatch. Re-downloading...`);
      }
    }

    if (needsDownload) {
      try {
        await downloadFile(model.url, destPath);
        const hash = await calculateSha256(destPath);
        
        if (hash !== model.expectedSha256) {
           console.error(`[X] ERROR: SHA256 mismatch for ${model.name}!`);
           console.error(`    Expected: ${model.expectedSha256}`);
           console.error(`    Got:      ${hash}`);
           fs.unlinkSync(destPath);
           process.exit(1);
        } else {
           console.log(`[✓] ${model.name} downloaded successfully. Checksum verified.`);
        }
      } catch (err) {
        console.error(`[X] Failed to download ${model.name}:`, err);
        process.exit(1);
      }
    }
  }

  // 2. Copy ALL MediaPipe Tasks Vision WASM & JS modules
  const mpWasmDir = path.join(NODE_MODULES_DIR, '@mediapipe/tasks-vision/wasm');
  if (fs.existsSync(mpWasmDir)) {
    const files = fs.readdirSync(mpWasmDir);
    for (const f of files) {
      fs.copyFileSync(path.join(mpWasmDir, f), path.join(PUBLIC_MODELS_DIR, f));
      console.log(`[✓] Copied MediaPipe module: ${f}`);
    }
  } else {
    console.warn('[!] Warning: @mediapipe/tasks-vision/wasm not found');
  }

  // 3. Copy ALL ONNX Runtime Web WASM and MJS modules
  const ortDistDir = path.join(NODE_MODULES_DIR, 'onnxruntime-web/dist');
  if (fs.existsSync(ortDistDir)) {
    const files = fs.readdirSync(ortDistDir);
    for (const f of files) {
      if (f.endsWith('.wasm') || f.endsWith('.mjs') || f.endsWith('.js')) {
        fs.copyFileSync(path.join(ortDistDir, f), path.join(PUBLIC_MODELS_DIR, f));
        console.log(`[✓] Copied ONNX module: ${f}`);
      }
    }
  } else {
    console.warn('[!] Warning: onnxruntime-web/dist not found');
  }

  console.log('--- Setup Complete ---');
}

run();
