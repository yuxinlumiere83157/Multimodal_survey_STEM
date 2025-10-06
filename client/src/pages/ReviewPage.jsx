import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import './ReviewPage.css';

function ReviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get the answers and questions from the navigation state
  const answers = useMemo(() => location.state?.answers || {}, [location.state]);
  const questions = useMemo(() => location.state?.questions || [], [location.state]);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);

  // If no data is provided, redirect back to questionnaire
  useEffect(() => {
    if (!location.state || Object.keys(answers).length === 0) {
      navigate('/questionnaire');
    }
  }, [location.state, answers, navigate]);

  // Fetch analysis results when component mounts
  useEffect(() => {
    const fetchAnalysis = async () => {
      let sessionId = null;
      if (answers.sessionId) {
        sessionId = answers.sessionId;
      } else if (location.state?.sessionId) {
        sessionId = location.state.sessionId;
      }

      if (!sessionId) {
        setLoadingAnalysis(false);
        return;
      }

      try {
        const response = await fetch('http://localhost:5006/api/analyze-survey-results', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionId,
            answers: answers
          })
        });

        if (response.ok) {
          const result = await response.json();
          setAnalysisResult(result);
        } else {
          console.error('Failed to fetch analysis results');
        }
      } catch (error) {
        console.error('Error fetching analysis:', error);
      } finally {
        setLoadingAnalysis(false);
      }
    };

    fetchAnalysis();
  }, [answers, location.state?.sessionId]);

  const handleSubmit = async () => {
    // Try to get sessionId from any answer object (if present)
    let sessionId = null;
    if (answers.sessionId) {
      sessionId = answers.sessionId;
    } else if (location.state?.sessionId) {
      sessionId = location.state.sessionId;
    }
    try {
      const response = await fetch('http://localhost:5006/api/save-survey-answers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId,
          answers: answers
        })
      });
      if (response.ok) {
        const result = await response.json();
        console.log('Survey answers saved:', result);
        navigate('/completion');
      } else {
        const error = await response.json();
        alert('Error submitting survey: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error submitting survey:', error);
      alert('Error submitting survey: ' + error.message);
    }
  };

  const handleEditClick = () => {
    // Navigate back to questionnaire with current answers
    navigate('/questionnaire', { state: { answers, questions } });
  };

  // Get answered questions
  const answeredQuestions = questions.filter(q => answers[q.id]);

  if (answeredQuestions.length === 0) {
    return <div>Loading...</div>;
  }

  return (
    <div className="review-page">
      <div className="review-container">

        {/* Header */}
        <div className="review-header">
          <button onClick={handleEditClick} className="back-link">
            ← Back to Survey
          </button>
        </div>

        {/* Review Card */}
        <div className="review-card">
          <div className="card-header">
            <div className="table-header">
              <div className="header-question">Question</div>
              <div className="header-answer">Your Answer</div>
            </div>
          </div>

          <div className="answers-table">
            <div className="table-body">
              {answeredQuestions.map((question, index) => (
                <div key={question.id} className="table-row">
                  <div className="question-cell">
                    <div className="question-number-badge">{index + 1}</div>
                    <div className="question-content">
                      <div className="question-category">{question.category}</div>
                      <div className="question-preview">
                        {question.question.length > 80
                          ? `${question.question.substring(0, 80)}...`
                          : question.question}
                      </div>
                    </div>
                  </div>
                  <div className="answer-cell">
                    <span className="answer-text">{answers[question.id]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Analysis Results Section */}
        {loadingAnalysis && (
          <div className="analysis-loading">
            Loading analysis results...
          </div>
        )}

        {!loadingAnalysis && analysisResult && (
          <div className="analysis-results">
            <h2>Analysis Results</h2>

            {/* Questionnaire-Based Result */}
            <div className="result-section">
              <h3>Questionnaire-Based Result</h3>
              <div className="result-content">
                <div className="result-label">Result: <strong>{analysisResult.questionnaire?.result}</strong></div>
                <div className="result-label">Confidence: <strong>{analysisResult.questionnaire?.confidence}%</strong></div>
                <div className="result-label">Average Score: <strong>{analysisResult.questionnaire?.averageScore}</strong></div>
              </div>
            </div>

            {/* AI-Analyzed Result */}
            <div className="result-section">
              <h3>AI-Analyzed Result (Facial Expression)</h3>
              <div className="result-content">
                <div className="result-label">Result: <strong>{analysisResult.ai_analysis?.result}</strong></div>
                <div className="result-label">Confidence: <strong>{analysisResult.ai_analysis?.confidence}%</strong></div>

                <div className="emotion-breakdown">
                  <h4>Emotion Breakdown:</h4>
                  <div className="result-label">Positive: {analysisResult.ai_analysis?.emotion_breakdown?.positive}%</div>
                  <div className="result-label">Neutral: {analysisResult.ai_analysis?.emotion_breakdown?.neutral}%</div>
                  <div className="result-label">Negative: {analysisResult.ai_analysis?.emotion_breakdown?.negative}%</div>
                </div>
              </div>
            </div>

            {/* Discrepancy Detection */}
            {analysisResult.discrepancy?.detected && (
              <div className="discrepancy-section">
                <h3>⚠️ Discrepancy Detected</h3>
                <div className="result-content">
                  <div className="result-label">Severity: <strong>{analysisResult.discrepancy?.severity}%</strong></div>
                  <p className="discrepancy-message">{analysisResult.discrepancy?.message}</p>
                </div>
              </div>
            )}

            <div className="card-actions">
              <button
                onClick={handleSubmit}
                className="submit-button"
              >
                Submit Survey
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default ReviewPage;