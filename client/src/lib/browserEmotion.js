import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';

export const EMOTIONS = ['Neutral', 'Happiness', 'Sadness', 'Surprise', 'Fear', 'Disgust', 'Anger'];

const MODEL_URL = '/models/fer_model.onnx';
const MEDIAPIPE_VERSION = '0.10.35';
const MEDIAPIPE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_LANDMARKER_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

export const BROWSER_EMOTION_ASSETS = {
  onnxModel: MODEL_URL,
  mediapipeWasm: MEDIAPIPE_WASM_URL,
  faceLandmarker: FACE_LANDMARKER_URL,
};

let modelLoadPromise = null;

export async function loadBrowserEmotionModels() {
  if (!modelLoadPromise) {
    modelLoadPromise = (async () => {
      try {
        ort.env.wasm.numThreads = 1;
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        const [faceLandmarker, session] = await Promise.all([
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: FACE_LANDMARKER_URL,
              delegate: 'CPU',
            },
            runningMode: 'IMAGE',
            numFaces: 1,
          }),
          ort.InferenceSession.create(MODEL_URL, {
            executionProviders: ['wasm'],
          }),
        ]);

        return { faceLandmarker, session };
      } catch (error) {
        modelLoadPromise = null;
        throw error;
      }
    })();
  }

  return modelLoadPromise;
}

function getBoundingBox(faceLandmarks, width, height) {
  const xs = faceLandmarks.map((point) => point.x * width);
  const ys = faceLandmarks.map((point) => point.y * height);
  const xMin = Math.max(0, Math.floor(Math.min(...xs)));
  const yMin = Math.max(0, Math.floor(Math.min(...ys)));
  const xMax = Math.min(width - 1, Math.ceil(Math.max(...xs)));
  const yMax = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  return { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin };
}

function preprocessCrop(sourceCanvas, box, cropCanvas) {
  const cropContext = cropCanvas.getContext('2d', { willReadFrequently: true });
  cropCanvas.width = 224;
  cropCanvas.height = 224;
  cropContext.imageSmoothingEnabled = false;
  cropContext.clearRect(0, 0, 224, 224);
  cropContext.drawImage(sourceCanvas, box.x, box.y, box.width, box.height, 0, 0, 224, 224);

  const rgba = cropContext.getImageData(0, 0, 224, 224).data;
  const planeSize = 224 * 224;
  const input = new Float32Array(3 * planeSize);

  for (let pixel = 0; pixel < planeSize; pixel += 1) {
    const rgbaIndex = pixel * 4;
    const red = rgba[rgbaIndex];
    const green = rgba[rgbaIndex + 1];
    const blue = rgba[rgbaIndex + 2];
    input[pixel] = blue - 91.4953;
    input[planeSize + pixel] = green - 103.8827;
    input[planeSize * 2 + pixel] = red - 131.0912;
  }

  return new ort.Tensor('float32', input, [1, 3, 224, 224]);
}

function softmax(logits) {
  const max = Math.max(...logits);
  const exp = logits.map((value) => Math.exp(value - max));
  const sum = exp.reduce((total, value) => total + value, 0);
  return exp.map((value) => value / sum);
}

export async function analyzeVideoFrame({ video, frameCanvas, cropCanvas, models }) {
  if (!video || !frameCanvas || !cropCanvas || !models || video.readyState < 2) {
    return null;
  }

  frameCanvas.width = video.videoWidth;
  frameCanvas.height = video.videoHeight;

  if (!frameCanvas.width || !frameCanvas.height) {
    return null;
  }

  const frameContext = frameCanvas.getContext('2d');
  frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);

  const detection = models.faceLandmarker.detect(frameCanvas);
  const faceLandmarks = detection.faceLandmarks?.[0];
  if (!faceLandmarks) {
    return {
      success: false,
      reason: 'no-face',
      timestamp: Date.now(),
    };
  }

  const box = getBoundingBox(faceLandmarks, frameCanvas.width, frameCanvas.height);
  if (box.width <= 0 || box.height <= 0) {
    return {
      success: false,
      reason: 'small-face',
      timestamp: Date.now(),
    };
  }

  const input = preprocessCrop(frameCanvas, box, cropCanvas);
  const output = await models.session.run({ input });
  const logits = Array.from(output.logits.data);
  const probabilities = softmax(logits);
  const classIndex = probabilities.reduce(
    (bestIndex, value, index) => (value > probabilities[bestIndex] ? index : bestIndex),
    0
  );
  const confidence = probabilities[classIndex];

  return {
    success: true,
    timestamp: Date.now(),
    source: 'browser-onnx',
    emotion: EMOTIONS[classIndex],
    confidence,
    box: [box.x, box.y, box.x + box.width, box.y + box.height],
    probabilities: Object.fromEntries(EMOTIONS.map((emotion, index) => [emotion, probabilities[index]])),
  };
}
