import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';
import './BrowserEmotionPage.css';

const EMOTIONS = ['Neutral', 'Happiness', 'Sadness', 'Surprise', 'Fear', 'Disgust', 'Anger'];
const MODEL_URL = '/models/fer_model.onnx';
const MEDIAPIPE_VERSION = '0.10.35';
const MEDIAPIPE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_LANDMARKER_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

function BrowserEmotionPage() {
  const videoRef = useRef(null);
  const frameCanvasRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const sessionRef = useRef(null);
  const faceLandmarkerRef = useRef(null);

  const [status, setStatus] = useState('Loading browser models...');
  const [cameraReady, setCameraReady] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
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

        if (cancelled) return;
        faceLandmarkerRef.current = faceLandmarker;
        sessionRef.current = session;
        setModelsReady(true);
        setStatus('Models ready. Enable the camera to analyze one frame locally.');
      } catch (loadError) {
        console.error('Browser model load failed:', loadError);
        setError('The browser models could not be loaded. Please check your network connection and reload.');
        setStatus('Model loading failed.');
      }
    }

    loadModels();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  async function startCamera() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraReady(true);
      setStatus('Camera ready. Capture a frame to run emotion inference locally.');
    } catch (cameraError) {
      console.error('Camera access failed:', cameraError);
      setError('Camera access is required for this browser-only prototype.');
    }
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

  function preprocessCrop(sourceCanvas, box) {
    const cropCanvas = cropCanvasRef.current;
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

  function drawOverlay(box, label) {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    const context = overlay.getContext('2d');
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    context.clearRect(0, 0, overlay.width, overlay.height);
    context.lineWidth = Math.max(3, Math.round(overlay.width * 0.004));
    context.strokeStyle = '#14b8a6';
    context.strokeRect(box.x, box.y, box.width, box.height);
    context.fillStyle = 'rgba(15, 23, 42, 0.88)';
    context.fillRect(box.x, Math.max(0, box.y - 34), Math.max(180, box.width), 34);
    context.fillStyle = '#ffffff';
    context.font = '20px system-ui, sans-serif';
    context.fillText(label, box.x + 10, Math.max(24, box.y - 11));
  }

  async function analyzeFrame() {
    const video = videoRef.current;
    const frameCanvas = frameCanvasRef.current;
    const faceLandmarker = faceLandmarkerRef.current;
    const session = sessionRef.current;

    if (!video || !frameCanvas || !faceLandmarker || !session || video.readyState < 2) {
      setError('The camera or browser models are still warming up. Please try again in a moment.');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setResult(null);

    try {
      frameCanvas.width = video.videoWidth;
      frameCanvas.height = video.videoHeight;
      const frameContext = frameCanvas.getContext('2d');
      frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);

      const detection = faceLandmarker.detect(frameCanvas);
      const faceLandmarks = detection.faceLandmarks?.[0];
      if (!faceLandmarks) {
        setError('No face detected. Reframe your face and try another capture.');
        return;
      }

      const box = getBoundingBox(faceLandmarks, frameCanvas.width, frameCanvas.height);
      if (box.width <= 0 || box.height <= 0) {
        setError('Face crop was too small. Move closer to the camera and try again.');
        return;
      }

      const input = preprocessCrop(frameCanvas, box);
      const output = await session.run({ input });
      const logits = Array.from(output.logits.data);
      const probabilities = softmax(logits);
      const classIndex = probabilities.reduce(
        (bestIndex, value, index) => (value > probabilities[bestIndex] ? index : bestIndex),
        0
      );

      const emotion = EMOTIONS[classIndex];
      const confidence = probabilities[classIndex];
      drawOverlay(box, `${emotion} ${(confidence * 100).toFixed(0)}%`);
      setResult({
        emotion,
        confidence,
        box: [box.x, box.y, box.x + box.width, box.y + box.height],
      });
    } catch (analysisError) {
      console.error('Browser inference failed:', analysisError);
      setError('Browser inference failed. Please reload and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="browser-demo-page">
      <div className="browser-demo-shell">
        <Link to="/" className="browser-demo-back-link">
          Back to Home Page
        </Link>

        <section className="browser-demo-header">
          <p className="browser-demo-eyebrow">Privacy-first prototype</p>
          <h1>Browser-only emotion analysis</h1>
          <p>
            This prototype runs face detection and the emotion model in your browser. Camera frames are not
            uploaded to the Flask server.
          </p>
        </section>

        <section className="browser-demo-grid">
          <div className="browser-camera-panel">
            <video ref={videoRef} autoPlay playsInline muted className="browser-camera-video" />
            <canvas ref={overlayCanvasRef} className="browser-camera-overlay" />
          </div>

          <div className="browser-result-panel">
            <div className="browser-status">{status}</div>
            {error && <div className="browser-error">{error}</div>}

            <div className="browser-actions">
              <button type="button" onClick={startCamera} disabled={!modelsReady || cameraReady}>
                {cameraReady ? 'Camera enabled' : 'Enable camera'}
              </button>
              <button type="button" onClick={analyzeFrame} disabled={!modelsReady || !cameraReady || isAnalyzing}>
                {isAnalyzing ? 'Analyzing...' : 'Capture local frame'}
              </button>
            </div>

            <div className="browser-result-card">
              <span>Emotion</span>
              <strong>{result?.emotion || 'Waiting'}</strong>
            </div>
            <div className="browser-result-card">
              <span>Confidence</span>
              <strong>{result ? `${Math.round(result.confidence * 100)}%` : '-'}</strong>
            </div>
            <div className="browser-result-card">
              <span>Box</span>
              <strong>{result ? result.box.join(', ') : '-'}</strong>
            </div>
          </div>
        </section>

        <canvas ref={frameCanvasRef} className="browser-hidden-canvas" />
        <canvas ref={cropCanvasRef} className="browser-hidden-canvas" />
      </div>
    </div>
  );
}

export default BrowserEmotionPage;
