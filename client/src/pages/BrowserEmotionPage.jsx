import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyzeVideoFrame, loadBrowserEmotionModels } from '../lib/browserEmotion';
import './BrowserEmotionPage.css';

function BrowserEmotionPage() {
  const videoRef = useRef(null);
  const frameCanvasRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const modelsRef = useRef(null);

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
        const models = await loadBrowserEmotionModels();
        if (cancelled) return;
        modelsRef.current = models;
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
    const cropCanvas = cropCanvasRef.current;
    const models = modelsRef.current;

    if (!video || !frameCanvas || !cropCanvas || !models || video.readyState < 2) {
      setError('The camera or browser models are still warming up. Please try again in a moment.');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setResult(null);

    try {
      const sample = await analyzeVideoFrame({ video, frameCanvas, cropCanvas, models });
      if (!sample?.success) {
        setError('No face detected. Reframe your face and try another capture.');
        return;
      }

      drawOverlay(
        {
          x: sample.box[0],
          y: sample.box[1],
          width: sample.box[2] - sample.box[0],
          height: sample.box[3] - sample.box[1],
        },
        `${sample.emotion} ${(sample.confidence * 100).toFixed(0)}%`
      );
      setResult({
        emotion: sample.emotion,
        confidence: sample.confidence,
        box: sample.box,
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
