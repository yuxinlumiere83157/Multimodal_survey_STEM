import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BROWSER_EMOTION_ASSETS, loadBrowserEmotionModels } from '../lib/browserEmotion';
import './SystemCheckPage.css';

const CHECKS = {
  browser: 'browser',
  models: 'models',
  storage: 'storage',
};

function getInitialChecks() {
  return {
    [CHECKS.browser]: {
      label: 'Browser capability',
      status: 'pending',
      detail: 'Waiting to check camera and WebAssembly support.',
    },
    [CHECKS.models]: {
      label: 'Model files',
      status: 'pending',
      detail: 'Waiting to download the ONNX model, MediaPipe assets, and runtime files.',
    },
    [CHECKS.storage]: {
      label: 'Results destination',
      status: 'pending',
      detail: 'Waiting to check whether a local Flask results API is available.',
    },
  };
}

function SystemCheckPage() {
  const navigate = useNavigate();
  const [checks, setChecks] = useState(getInitialChecks);
  const [isChecking, setIsChecking] = useState(false);
  const [storageMode, setStorageMode] = useState(null);

  const updateCheck = (key, patch) => {
    setChecks((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...patch,
      },
    }));
  };

  const canContinue = checks.browser.status === 'ready' && checks.models.status === 'ready';
  const hasFailure = Object.values(checks).some((check) => check.status === 'error');

  const runChecks = async () => {
    setIsChecking(true);
    setChecks(getInitialChecks());
    setStorageMode(null);

    const browserReady =
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof WebAssembly !== 'undefined' &&
      typeof Worker !== 'undefined';

    if (browserReady) {
      updateCheck(CHECKS.browser, {
        status: 'ready',
        detail: 'This browser supports camera access, WebAssembly, and the local model runtime.',
      });
    } else {
      updateCheck(CHECKS.browser, {
        status: 'error',
        detail: 'This browser is missing camera, WebAssembly, or worker support required by the demo.',
      });
      setIsChecking(false);
      return;
    }

    updateCheck(CHECKS.models, {
      status: 'checking',
      detail: 'Downloading and initializing browser emotion models. This can take a moment on first load.',
    });

    try {
      await loadBrowserEmotionModels();
      updateCheck(CHECKS.models, {
        status: 'ready',
        detail: 'Emotion model and face-landmarker files are ready in this browser session.',
      });
    } catch (error) {
      console.error('System check model load failed:', error);
      updateCheck(CHECKS.models, {
        status: 'error',
        detail: 'The model files could not be loaded. Check your network connection and retry.',
      });
      setIsChecking(false);
      return;
    }

    updateCheck(CHECKS.storage, {
      status: 'checking',
      detail: 'Checking whether localhost:5006 is available for local result storage.',
    });

    try {
      const response = await fetch('http://localhost:5006/api/health', {
        signal: AbortSignal.timeout(2500),
      });

      if (!response.ok) {
        throw new Error(`Unexpected health status ${response.status}`);
      }

      setStorageMode('server');
      updateCheck(CHECKS.storage, {
        status: 'ready',
        detail:
          'Local Flask API detected. Survey answers will save under results/<sessionId>/survey_answers.json, and derived emotion timelines under question_videos/<sessionId>/.',
      });
    } catch {
      setStorageMode('download');
      updateCheck(CHECKS.storage, {
        status: 'ready',
        detail:
          'Static demo mode. No backend is connected, so final results will download as a JSON file in your browser instead of being saved on Hugging Face.',
      });
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    runChecks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assetRows = useMemo(
    () => [
      ['Emotion ONNX model', BROWSER_EMOTION_ASSETS.onnxModel],
      ['MediaPipe face-landmarker', BROWSER_EMOTION_ASSETS.faceLandmarker],
      ['MediaPipe WebAssembly runtime', BROWSER_EMOTION_ASSETS.mediapipeWasm],
    ],
    []
  );

  return (
    <div className="system-check-page">
      <main className="system-check-container">
        <Link to="/consent" className="back-link">
          Back to Consent Form
        </Link>

        <section className="system-check-header">
          <p className="system-check-eyebrow">Pre-survey system check</p>
          <h1>Preparing the browser model</h1>
          <p>
            This step confirms that the browser can load the local emotion model and required face-detection
            assets before camera setup begins.
          </p>
        </section>

        <section className="system-check-card" aria-live="polite">
          {Object.entries(checks).map(([key, check]) => (
            <div key={key} className={`check-row check-row-${check.status}`}>
              <div className="check-status-dot" aria-hidden="true" />
              <div>
                <h2>{check.label}</h2>
                <p>{check.detail}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="system-check-details">
          <h2>Files prepared for the survey</h2>
          <dl>
            {assetRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="system-check-details">
          <h2>Where the test results go</h2>
          <p>
            {storageMode === 'server'
              ? 'Because the local Flask API is available, the final answer JSON will be written to the project results folder and emotion timelines will be written to the question_videos folder.'
              : 'On this hosted static demo, Hugging Face does not receive or store survey submissions. When you submit, the app downloads a JSON results file through your browser.'}
          </p>
        </section>

        {hasFailure && (
          <div className="system-check-warning">
            Fix the failed check above, then retry before continuing to the survey.
          </div>
        )}

        <div className="system-check-actions">
          <button type="button" className="secondary-check-button" onClick={runChecks} disabled={isChecking}>
            {isChecking ? 'Checking...' : 'Retry checks'}
          </button>
          <button
            type="button"
            className={`primary-check-button ${canContinue ? 'enabled' : 'disabled'}`}
            onClick={() => navigate('/facecam-preview')}
            disabled={!canContinue}
          >
            Continue to camera setup
          </button>
        </div>
      </main>
    </div>
  );
}

export default SystemCheckPage;
