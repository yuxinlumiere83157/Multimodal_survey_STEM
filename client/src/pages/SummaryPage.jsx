import { Link } from 'react-router-dom';
import './SummaryPage.css';
import questionnairePreview from '../assets/questionnaire-preview.png';

function SummaryPage() {
  return (
    <div className="summary-page">
      <div className="summary-container">
        
        <Link to="/" className="back-link">
          Back to Home Page
        </Link>
        
        <h1 className="summary-title">About this survey...</h1>
        
        {/* Questionnaire Preview Image */}
        <div className="preview-section">
          <img 
            src={questionnairePreview} 
            alt="Questionnaire preview showing camera view and multiple choice questions" 
            className="questionnaire-preview-image"
          />
        </div>
        
        <p className="summary-text">
          This ENGE817 pilot study collects momentary stress self-reports, SUS usability responses, trust and
          privacy perceptions, and open-ended reflections. Browser-only facial-emotion sampling is used only
          during the stress self-report items so researchers can compare stress ratings with derived facial-emotion
          signals without uploading webcam frames. The survey takes approximately 10-15 minutes to complete. All responses are confidential
          and will be used solely for research purposes.
        </p>
        
        <Link to="/consent" className="proceed-link">
          <button className="proceed-button">
            Proceed to Consent Form &gt;&gt;
          </button>
        </Link>
        
      </div>
    </div>
  );
}

export default SummaryPage;
