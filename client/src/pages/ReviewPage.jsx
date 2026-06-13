import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { STUDY_QUESTIONS } from '../studyQuestions';
import { analyzeStudyResults } from '../lib/studyAnalysis';
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
      1: "2 - Sometimes",
      2: "3 - Fairly often",
      3: "2 - Sometimes",
      4: "3 - Fairly often",
      5: "4 - Very often",
      7: "4 - Agree",
      8: "2 - Disagree",
      17: "4 - Agree",
      22: "I felt aware of my stress level during the check-in."
    };
  }, [location.state]);

  const questions = useMemo(() => {
    if (location.state?.questions && location.state.questions.length > 0) {
      return location.state.questions;
    }
    return STUDY_QUESTIONS;
  }, [location.state]);
  const emotionSession = useMemo(() => location.state?.emotionSession || {}, [location.state]);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);
  const backendSessionId = location.state?.sessionId || answers.sessionId || null;

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

      const localAnalysis = analyzeStudyResults({ answers, questions, emotionSession });

      // If no sessionId, create a temporary one for this session
      if (!sessionId) {
        sessionId = `review_session_${Date.now()}`;
        console.warn('No sessionId found, creating temporary one:', sessionId);
        setAnalysisResult(localAnalysis);
        setLoadingAnalysis(false);
        return;
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
            answers: answers,
            questions: questions
          }),
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
          const result = await response.json();
          console.log('Analysis results received:', result);
          setAnalysisResult(result);
        } else {
          console.error('Failed to fetch analysis results, status:', response.status);
          const errorText = await response.text();
          console.error('Error response:', errorText);
          setAnalysisResult(localAnalysis);
        }
      } catch (error) {
        console.error('Error fetching analysis:', error);
        setAnalysisResult(localAnalysis);
      } finally {
        setLoadingAnalysis(false);
      }
    };

    fetchAnalysis();
  }, [answers, emotionSession, location.state, questions]);

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

    const submissionPayload = {
      sessionId: sessionId,
      answers: answers,
      questions: questions,
      emotionSession: emotionSession,
      analysis: analysisResult,
      savedAt: new Date().toISOString()
    };
    
    try {
      const response = await fetch('http://localhost:5006/api/save-survey-answers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionPayload),
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Survey answers saved:', result);
        alert(`Survey submitted successfully! \n\nJSON file saved to: ${result.answersPath || 'results folder'}\nSession ID: ${result.sessionId}`);
        navigate('/completion', {
          state: {
            storageMode: 'server',
            sessionId: result.sessionId,
            answersPath: result.answersPath,
          }
        });
      } else {
        const errorText = await response.text();
        console.error('Submit error:', errorText);
        alert('Error submitting survey: ' + errorText);
      }
    } catch (error) {
      console.error('Error submitting survey:', error);
      const blob = new Blob([JSON.stringify(submissionPayload, null, 2)], {
        type: 'application/json'
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const downloadFilename = `${sessionId}_survey_results.json`;
      link.href = downloadUrl;
      link.download = downloadFilename;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      navigate('/completion', {
        state: {
          localOnly: true,
          storageMode: 'download',
          sessionId,
          downloadFilename
        }
      });
    }
  };

  const handleEditClick = () => {
    // Navigate back to questionnaire with current answers
    navigate('/questionnaire', { state: { answers, questions, sessionId: location.state?.sessionId, emotionSession } });
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
            Back to Survey
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
                      <div className="question-construct">{question.construct}</div>
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

                {/* Stress Self-Report Result */}
                <div className="result-section">
                  <h3>Stress Self-Report</h3>
                  <div className="result-content">
                    <div className="result-label">Instrument: <strong>{analysisResult.selfReport?.instrument}</strong></div>
                    <div className="result-label">Stress Level: <strong>{analysisResult.selfReport?.stressLevel}</strong></div>
                    <div className="result-label">Average Score: <strong>{analysisResult.selfReport?.stressAverage_0_to_4}</strong></div>
                  </div>
                </div>

                {/* Facial Emotion Result */}
                <div className="result-section">
                  <h3>Facial Emotion During Stress Items</h3>
                  <div className="result-content">
                    <div className="result-label">Pattern: <strong>{analysisResult.facialEmotion?.facialPattern}</strong></div>
                    <div className="result-label">Total Samples: <strong>{analysisResult.facialEmotion?.totalSamples}</strong></div>

                    <div className="emotion-breakdown">
                      <h4>Emotion Breakdown:</h4>
                      <div className="result-label">Positive: {analysisResult.facialEmotion?.emotionBreakdown?.positive}%</div>
                      <div className="result-label">Neutral: {analysisResult.facialEmotion?.emotionBreakdown?.neutral}%</div>
                      <div className="result-label">Negative: {analysisResult.facialEmotion?.emotionBreakdown?.negative}%</div>
                    </div>
                  </div>
                </div>

                {/* Discrepancy Detection */}
                {analysisResult.comparison && (
                  <div className="discrepancy-section">
                    <h3>Session-Level Comparison</h3>
                    <div className="result-content">
                      <div className="result-label">Discrepancy Detected: <strong>{analysisResult.comparison?.discrepancyDetected ? 'Yes' : 'No'}</strong></div>
                      <p className="discrepancy-message">{analysisResult.comparison?.note}</p>
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

        <div className="results-destination-card">
          <h2>Where These Results Go</h2>
          {backendSessionId ? (
            <p>
              A local Flask API session is active. Final answers will be saved to
              <strong> results/{backendSessionId}/survey_answers.json</strong>, and derived emotion samples
              are saved under <strong>question_videos/{backendSessionId}/</strong>. No raw webcam video is
              stored by this browser-only survey flow.
            </p>
          ) : (
            <p>
              This hosted static demo is running without a backend. When you submit, the app downloads a JSON
              results file to your browser&apos;s downloads folder. Hugging Face does not receive or store the
              survey answers from this static demo.
            </p>
          )}
        </div>

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

