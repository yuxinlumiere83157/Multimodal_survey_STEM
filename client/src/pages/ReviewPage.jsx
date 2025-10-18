import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import './ReviewPage.css';

function ReviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get the answers and questions from the navigation state, or use test data
  const answers = useMemo(() => {
    if (location.state?.answers && Object.keys(location.state.answers).length > 0) {
      return location.state.answers;
    }
    // Return test data for demonstration
    return {
      1: "Often",
      2: "Lots of trust",
      3: "Satisfied", 
      4: "Satisfied",
      5: "Sometimes"
    };
  }, [location.state]);

  const questions = useMemo(() => {
    if (location.state?.questions && location.state.questions.length > 0) {
      return location.state.questions;
    }
    // Return test questions for demonstration
    return [
      {id: 1, category: "Satisfaction", question: "How in touch are you with your positive emotions?", options: ["Extremely in touch", "In touch", "Neutral", "Out of touch", "Extremely out of touch"]},
      {id: 2, category: "Satisfaction", question: "How much do you trust your skills and capabilities?", options: ["Full trust", "Lots of trust", "Neutral", "Little trust", "No trust"]},
      {id: 3, category: "Satisfaction", question: "How satisfied are you with the support you get from your friends?", options: ["Extremely satisfied", "Satisfied", "Neutral", "Dissatisfied", "Extremely dissatisfied"]},
      {id: 4, category: "Satisfaction", question: "How satisfied are you with the support you get from your family?", options: ["Extremely satisfied", "Satisfied", "Neutral", "Dissatisfied", "Extremely dissatisfied"]},
      {id: 5, category: "Satisfaction", question: "How often do you positively think of the future?", options: ["Always", "Often", "Sometimes", "Rarely", "Never"]}
    ];
  }, [location.state]);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);

  // If no data is provided, use test data for demo purposes
  useEffect(() => {
    if (!location.state || Object.keys(answers).length === 0) {
      console.log('No state data found, using test data for demonstration');
      // For testing purposes, we'll use sample data instead of redirecting
      // navigate('/questionnaire');
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

      console.log('ReviewPage: sessionId =', sessionId);
      console.log('ReviewPage: answers =', answers);
      console.log('ReviewPage: location.state =', location.state);

      // If no sessionId, create a temporary one for this session
      if (!sessionId) {
        sessionId = `review_session_${Date.now()}`;
        console.warn('No sessionId found, creating temporary one:', sessionId);
      }

      try {
        console.log('Fetching analysis results for sessionId:', sessionId);
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
          console.log('Analysis results received:', result);
          setAnalysisResult(result);
        } else {
          console.error('Failed to fetch analysis results, status:', response.status);
          const errorText = await response.text();
          console.error('Error response:', errorText);
        }
      } catch (error) {
        console.error('Error fetching analysis:', error);
      } finally {
        setLoadingAnalysis(false);
      }
    };

    fetchAnalysis();
  }, [answers, location.state]);

  const handleSubmit = async () => {
    // Get sessionId from state or create a new one
    let sessionId = null;
    if (answers.sessionId) {
      sessionId = answers.sessionId;
    } else if (location.state?.sessionId) {
      sessionId = location.state.sessionId;
    } else {
      sessionId = `submit_session_${Date.now()}`;
    }

    console.log('Submitting survey with sessionId:', sessionId);
    
    try {
      const response = await fetch('http://localhost:5006/api/save-survey-answers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId,
          answers: answers,
          questions: questions
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Survey answers saved:', result);
        alert(`Survey submitted successfully! \n\nJSON file saved to: ${result.answersPath || 'results folder'}\nSession ID: ${result.sessionId}`);
        navigate('/completion');
      } else {
        const errorText = await response.text();
        console.error('Submit error:', errorText);
        alert('Error submitting survey: ' + errorText);
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

        {!loadingAnalysis && (
          <div className="analysis-results">
            {analysisResult ? (
              <>
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
              </>
            ) : (
              <div className="analysis-error">
                <h2>Survey Complete</h2>
                <p>Analysis results could not be loaded, but your survey responses have been recorded.</p>
              </div>
            )}
          </div>
        )}

      </div>
      
      {/* Fixed Bottom Submit Container */}
      <div className="fixed-bottom-container">
        <button
          onClick={handleSubmit}
          className="submit-button"
        >
          Submit Survey
        </button>
      </div>
    </div>
  );
}

export default ReviewPage;