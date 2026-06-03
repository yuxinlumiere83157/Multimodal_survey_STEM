import { Link } from 'react-router-dom';
import './HomePage.css';

function HomePage() {
  return (
    <div className="homepage">
      <div className="background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
        <div className="shape shape-4"></div>
        <div className="shape shape-5"></div>
      </div>
      
      <div className="content-container">
        <main className="main-content">
          <h1 className="headline">
            ENGE817 Stress, Usability, and Trust Pilot Study
          </h1>
          
          <p className="subtext">
            Your participation helps us study prototype usability, momentary stress self-reporting, 
            and trust and privacy perceptions around webcam-based emotion detection.
          </p>
          
          <Link to="/summary" className="cta-link">
            <button className="cta-button" aria-label="Start the survey">
              Take the survey &gt;&gt;
            </button>
          </Link>
        </main>
      </div>
    </div>
  );
}

export default HomePage;
