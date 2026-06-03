import { Link } from 'react-router-dom';
import './CompletionPage.css';

function CompletionPage() {
  return (
    <div className="completion-page">
      <div className="completion-container">
        <h1 className="completion-title">Thank you for participating in our research.</h1>
        
        <p className="completion-message">
          Your responses have been successfully recorded and will contribute to ENGE817 research on prototype
          usability, momentary stress self-reporting, and trust and privacy perceptions around webcam-based
          emotion detection. We deeply appreciate the time you've taken to complete the pilot study. All data
          will be kept confidential and used solely for research purposes as outlined in the consent form.
        </p>
        
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
