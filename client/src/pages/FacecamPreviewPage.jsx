import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './FacecamPreviewPage.css';

function FacecamPreviewPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [showPermissionPopup, setShowPermissionPopup] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    requestCameraAccess();

    return () => {
      // Don't stop camera when navigating to questionnaire
      // if (stream) {
      //   stream.getTracks().forEach(track => track.stop());
      // }
    };
  }, []);

  const requestCameraAccess = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setPermissionDenied(false);
    } catch (error) {
      console.error('Camera access error:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
        setShowPermissionPopup(true);
      } else if (error.name === 'NotFoundError') {
        alert('No camera found. Please connect a camera to continue.');
      } else {
        setShowPermissionPopup(true);
      }
    }
  };

  const handleRetryPermission = () => {
    setShowPermissionPopup(false);
    requestCameraAccess();
  };

  const handleContinue = () => {
    if (stream) {
      navigate('/questionnaire');
    }
  };

  return (
    <div className="facecam-preview-page">
      {showPermissionPopup && (
        <div className="permission-popup-overlay">
          <div className="permission-popup">
            <div className="popup-icon">📷</div>
            <h2 className="popup-title">Camera Access Required</h2>
            <p className="popup-text">
              This study uses camera access to derive facial-emotion samples during stress items.
              Video frames stay in your browser and are not uploaded by the privacy-first prototype.
            </p>
            {permissionDenied && (
              <p className="popup-warning">
                Camera permission was denied. Please enable camera access in your browser settings
                and click retry.
              </p>
            )}
            <div className="popup-buttons">
              <button onClick={handleRetryPermission} className="retry-btn">
                {permissionDenied ? 'Retry' : 'Allow Camera'}
              </button>
              <button onClick={() => navigate('/consent')} className="cancel-btn">
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="facecam-container">
        <h1 className="facecam-title">Camera Setup</h1>

        <div className="video-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="preview-video"
          />
          <div className="face-guide-overlay">
            <div className="face-guide-circle"></div>
          </div>
        </div>

        <div className="instructions-container">
          <div className="instruction-item">
            <span className="instruction-icon">👤</span>
            <p>Position your face within the circle</p>
          </div>
          <div className="instruction-item">
            <span className="instruction-icon">💡</span>
            <p>Ensure you are in a well-lit area</p>
          </div>
          <div className="instruction-item">
            <span className="instruction-icon">📹</span>
            <p>Keep your face visible throughout the survey</p>
          </div>
        </div>

        <button
          onClick={handleContinue}
          disabled={!stream}
          className={`continue-btn ${stream ? 'enabled' : 'disabled'}`}
        >
          Continue to Survey
        </button>
      </div>
    </div>
  );
}

export default FacecamPreviewPage;
