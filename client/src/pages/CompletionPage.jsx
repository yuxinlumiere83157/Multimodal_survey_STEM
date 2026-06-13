import { Link, useLocation } from 'react-router-dom';
import './CompletionPage.css';

function CompletionPage() {
  const location = useLocation();
  const localOnly = location.state?.localOnly;
  const storageMode = location.state?.storageMode;
  const sessionId = location.state?.sessionId;
  const answersPath = location.state?.answersPath;
  const downloadFilename = location.state?.downloadFilename;

  return (
    <div className="completion-page">
      <div className="completion-container">
        <h1 className="completion-title">Thank you for participating in our research.</h1>

        <p className="completion-message">
          {localOnly
            ? 'This privacy-first demo handled your responses locally and downloaded a JSON results file instead of saving data to a server.'
            : "Your responses have been successfully recorded and will contribute to ENGE817 research on prototype usability, momentary stress self-reporting, and trust and privacy perceptions around webcam-based emotion detection. We deeply appreciate the time you've taken to complete the pilot study. All data will be kept confidential and used solely for research purposes as outlined in the consent form."}
        </p>

        {storageMode && (
          <p className="completion-message">
            {storageMode === 'server'
              ? `Saved through the local Flask API${answersPath ? ` at ${answersPath}` : ''}${sessionId ? ` for session ${sessionId}` : ''}.`
              : `Downloaded as ${downloadFilename || 'a survey results JSON file'}${sessionId ? ` for session ${sessionId}` : ''}.`}
          </p>
        )}

        <Link to="/" className="home-link">
          <button className="home-button">
            Go back to Home Page &gt;&gt;
          </button>
        </Link>
      </div>
    </div>
  );
}

export default CompletionPage;
