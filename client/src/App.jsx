import { useEffect, useRef, useState } from 'react'
import './App.css'

const INITIAL_RESULT = {
  emotion: null,
  confidence: null,
  box: null,
  face_detected: null,
}

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [cameraStatus, setCameraStatus] = useState('requesting')
  const [result, setResult] = useState(INITIAL_RESULT)
  const [isCapturing, setIsCapturing] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let stream

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 } },
          audio: false,
        })

        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setCameraStatus('ready')
      } catch (error) {
        console.error('Camera access error:', error)
        setCameraStatus('blocked')
        setMessage('Camera access is required for the live snapshot demo. Please allow camera access and reload this page.')
      }
    }

    startCamera()

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  async function captureSnapshot() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      setMessage('Camera is still warming up. Please try again in a moment.')
      return
    }

    setIsCapturing(true)
    setMessage('')
    setResult(INITIAL_RESULT)

    const maxSide = 640
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))

    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const image = canvas.toDataURL('image/jpeg', 0.82)

    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Prediction failed')
      }

      setResult(payload)
      if (!payload.face_detected) {
        setMessage('No face detected. Reframe your face and capture another snapshot.')
      }
    } catch (error) {
      console.error('Prediction error:', error)
      setMessage(error.message || 'The prediction request failed. Please try again.')
    } finally {
      setIsCapturing(false)
    }
  }

  const confidence =
    typeof result.confidence === 'number' ? `${Math.round(result.confidence * 100)}%` : '—'

  return (
    <main className="demo-shell">
      <section className="demo-hero" aria-labelledby="demo-title">
        <p className="eyebrow">Research technology demo</p>
        <h1 id="demo-title">Facial Emotion Recognition Snapshot</h1>
        <p className="intro">
          A single webcam frame is processed in memory by MediaPipe FaceMesh and a TorchScript emotion model to return one of seven emotion labels.
        </p>
      </section>

      <section className="notice" aria-label="Privacy notice">
        <strong>Technology demo - no data stored.</strong> Your webcam image is processed in memory to predict an emotion and is never saved or transmitted to third parties. No survey or personal data is collected. Free hosting may take up to one minute to wake on first use.
      </section>

      <section className="demo-grid" aria-label="Snapshot demo">
        <div className="camera-panel">
          <video ref={videoRef} autoPlay playsInline muted className="camera-feed" />
          {cameraStatus !== 'ready' && (
            <div className="camera-overlay">
              {cameraStatus === 'requesting' ? 'Requesting camera access...' : 'Camera unavailable'}
            </div>
          )}
        </div>

        <div className="result-panel">
          <div>
            <p className="panel-label">Snapshot result</p>
            <div className="emotion-value">{result.emotion || 'Waiting'}</div>
            <div className="confidence-row">
              <span>Confidence</span>
              <strong>{confidence}</strong>
            </div>
            <div className="confidence-row">
              <span>Face detected</span>
              <strong>{result.face_detected === null ? '—' : result.face_detected ? 'Yes' : 'No'}</strong>
            </div>
          </div>

          <button
            className="capture-button"
            type="button"
            onClick={captureSnapshot}
            disabled={cameraStatus !== 'ready' || isCapturing}
          >
            {isCapturing ? 'Analyzing...' : 'Capture single frame'}
          </button>
          <p className="capture-note">Pressing the button captures one frame and sends only that snapshot for analysis.</p>
          {message && <p className="status-message">{message}</p>}
        </div>
      </section>

      <section className="credits" aria-label="Model attribution">
        Emotion model: EMO-AffectNetModel by Elena Ryumina, Denis Dresvyanskiy, and Alexey Karpov, MIT-licensed and provided for scientific use. Citation: “In Search of a Robust Facial Expressions Recognition Model: A Large-Scale Visual Cross-Corpus Study,” Neurocomputing, 2022.
      </section>

      <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
    </main>
  )
}

export default App
