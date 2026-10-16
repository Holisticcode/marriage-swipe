// Server-side photo moderation: nudity (NSFWJS) + face detection / matching (face-api).
// Runs fully inside this Node process: no third-party API, no per-photo cost.
import { createRequire } from 'node:module';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config.js';

const require = createRequire(import.meta.url);
let tf, faceapi, nsfw;
let initPromise = null;
let backendName = 'none';

export function moderationStatus() {
  return { mode: config.moderation.mode, ready: !!nsfw && !!faceapi, backend: backendName };
}

export function initModeration() {
  if (config.moderation.mode === 'off') return Promise.resolve(false);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    tf = require('@tensorflow/tfjs');
    try {
      require('@tensorflow/tfjs-backend-wasm');
      await tf.setBackend('wasm');
    } catch (e) {
      console.warn('[moderation] wasm backend unavailable, using cpu:', e.message);
      await tf.setBackend('cpu');
    }
    await tf.ready();
    backendName = tf.getBackend();
    faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
    const modelDir = path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model');
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelDir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir);
    const nsfwjs = require('nsfwjs');
    nsfw = await nsfwjs.load('MobileNetV2');
    console.log(`[moderation] ready (backend: ${backendName})`);
    return true;
  })().catch((e) => {
    console.error('[moderation] failed to start:', e);
    initPromise = null;
    return false;
  });
  return initPromise;
}

// one image at a time so a burst of uploads cannot starve the API
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

async function toTensor(buf, maxDim) {
  const { data, info } = await sharp(buf)
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
}

// brightness + sharpness of the picture (cheap, no AI)
export async function imageQuality(buf) {
  const w = 120, h = 160;
  const g = await sharp(buf).rotate().resize(w, h, { fit: 'cover' }).greyscale().raw().toBuffer();
  let sum = 0;
  for (let i = 0; i < g.length; i++) sum += g[i];
  const mean = sum / g.length;
  let lap = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const v = 4 * g[y * w + x] - g[y * w + x - 1] - g[y * w + x + 1] - g[(y - 1) * w + x] - g[(y + 1) * w + x];
      lap += v * v;
      n++;
    }
  }
  return { mean, sharp: lap / n };
}

// returns { available:false } when AI could not run, so callers can fall back to human review
export function analyzeImage(buf) {
  return serial(async () => {
    const ok = await initModeration();
    if (!ok) return { available: false };
    const out = { available: true };
    let t224 = null, tFace = null;
    try {
      t224 = await toTensor(buf, 512);
      const preds = await nsfw.classify(t224);
      const P = {};
      for (const p of preds) P[p.className] = p.probability;
      out.nsfw = { explicit: (P.Porn || 0) + (P.Hentai || 0), revealing: P.Sexy || 0, raw: P };
      tFace = await toTensor(buf, 640);
      const dets = await faceapi
        .detectAllFaces(tFace, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 6 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
      out.faces = dets.map((d) => ({
        score: d.detection.score,
        box: d.detection.box ? { w: d.detection.box.width, h: d.detection.box.height } : null,
        descriptor: Array.from(d.descriptor),
      }));
      return out;
    } catch (e) {
      console.error('[moderation] analyze failed:', e);
      return { available: false, error: e.message };
    } finally {
      t224?.dispose();
      tFace?.dispose();
    }
  });
}

export function faceDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}
