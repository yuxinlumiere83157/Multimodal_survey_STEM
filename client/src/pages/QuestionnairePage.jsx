
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { STUDY_QUESTIONS } from '../studyQuestions';
import { analyzeVideoFrame, loadBrowserEmotionModels } from '../lib/browserEmotion';
import './QuestionnairePage.css';

function QuestionnairePage() {
  const navigate = useNavigate();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [answers, setAnswers] = useState({});
  const [showQuitModal, setShowQuitModal] = useState(false);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const emotionIntervalRef = useRef(null);
  const emotionModelsRef = useRef(null);
  const emotionTimelineRef = useRef([]);
  const questionEmotionDataRef = useRef({});
  const analysisBusyRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState(null);
  const [emotionData, setEmotionData] = useState([]);
  const [emotionStatus, setEmotionStatus] = useState('Loading browser emotion models...');
  const [sessionId, setSessionId] = useState(null);
  const sessionIdRef = useRef(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const location = useLocation();

  // Store the active question ID while local emotion sampling runs.
  const recordingQuestionIdRef = useRef(null);
  const isNavigatingRef = useRef(false);

  const [questions] = useState(STUDY_QUESTIONS);
  const shouldRecordQuestion = (question) => question?.recordEmotion === true;

  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;
  const progressPercentage = ((currentQuestionIndex + 1) / totalQuestions) * 100;

  useEffect(() => {
    if (location.state?.answers) {
      setAnswers(location.state.answers);
    }
    if (location.state?.sessionId) {
      sessionIdRef.current = location.state.sessionId;
      setSessionId(location.state.sessionId);
    }
    if (location.state?.emotionSession) {
      questionEmotionDataRef.current = location.state.emotionSession;
    }
  }, [location.state]);

  useEffect(() => {
    if (!currentQuestion) return;

    // Prevent race condition: don't update if we're in the middle of navigation
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }

    const savedAnswer = answers[currentQuestion.id] || '';
    setSelectedAnswer(savedAnswer);
  }, [currentQuestionIndex, currentQuestion, answers]);

  const captureAndAnalyzeFrame = async () => {
    if (analysisBusyRef.current) return;
    if (!videoRef.current || !canvasRef.current || !cropCanvasRef.current || !emotionModelsRef.current) return;

    analysisBusyRef.current = true;

    try {
      const sample = await analyzeVideoFrame({
        video: videoRef.current,
        frameCanvas: canvasRef.current,
        cropCanvas: cropCanvasRef.current,
        models: emotionModelsRef.current
      });

      if (!sample?.success) {
        setEmotionStatus(sample?.reason === 'no-face' ? 'No face detected locally.' : 'Local emotion sampling active.');
        return;
      }

      const questionId = recordingQuestionIdRef.current;
      const emotionSample = {
        timestamp: sample.timestamp,
        questionId,
        emotion: sample.emotion,
        confidence: sample.confidence,
        box: sample.box,
        source: sample.source
      };

      emotionTimelineRef.current = [...emotionTimelineRef.current, emotionSample];
      setCurrentEmotion(sample.emotion);
      setEmotionData(emotionTimelineRef.current);
      setEmotionStatus('Local emotion sampling active.');
    } catch (error) {
      console.error('Error analyzing frame locally:', error);
      setEmotionStatus('Local emotion sampling is temporarily unavailable.');
    } finally {
      analysisBusyRef.current = false;
    }
  };

  const startRecording = (stream, questionId) => {
    try {
      console.log(`[Q${questionId}] start local emotion sampling called`);

      if (!stream?.active || !emotionModelsRef.current) {
        setEmotionStatus('Camera or browser models are not ready yet.');
        return;
      }

      if (emotionIntervalRef.current) {
        clearInterval(emotionIntervalRef.current);
        emotionIntervalRef.current = null;
      }

      recordingQuestionIdRef.current = questionId;
      emotionTimelineRef.current = [];
      setEmotionData([]);
      setCurrentEmotion(null);
      setIsRecording(true);
      setEmotionStatus('Local emotion sampling active. No video is being uploaded.');

      emotionIntervalRef.current = setInterval(() => {
        captureAndAnalyzeFrame();
      }, 700);

      captureAndAnalyzeFrame();

    } catch (error) {
      console.error(`[Q${questionId}] Error starting local emotion sampling:`, error);
      setEmotionStatus('Local emotion sampling could not start.');
    }
  };

  const getDominantEmotion = (samples) => {
    const emotionCounts = {};
    samples.forEach(item => {
      emotionCounts[item.emotion] = (emotionCounts[item.emotion] || 0) + 1;
    });

    return samples.length > 0
      ? Object.keys(emotionCounts).reduce((a, b) =>
          emotionCounts[a] > emotionCounts[b] ? a : b
        )
      : 'Unknown';
  };

  const stopRecordingAndSave = async () => {
    if (!isRecording) {
      console.log('No active local emotion sampling to stop');
      return;
    }

    if (emotionIntervalRef.current) {
      clearInterval(emotionIntervalRef.current);
      emotionIntervalRef.current = null;
    }

    const questionIdForThisRecording = recordingQuestionIdRef.current;
    const samples = emotionTimelineRef.current;
    const dominantEmotion = getDominantEmotion(samples);

    if (questionIdForThisRecording) {
      questionEmotionDataRef.current = {
        ...questionEmotionDataRef.current,
        [questionIdForThisRecording]: {
          questionId: questionIdForThisRecording,
          dominantEmotion,
          emotionTimeline: samples,
          sampleCount: samples.length,
          source: 'browser-onnx'
        }
      };

      await saveEmotionTimeline(questionIdForThisRecording, dominantEmotion, samples);
    }

    setIsRecording(false);
    setEmotionData([]);
    emotionTimelineRef.current = [];
    recordingQuestionIdRef.current = null;
  };

  const saveEmotionTimeline = async (questionId, dominantEmotion, samples) => {
    console.log(`[Q${questionId}] Saving ${samples.length} derived emotion samples`);

    const payload = {
      questionId,
      emotion: dominantEmotion,
      emotionData: samples,
      sessionId: sessionIdRef.current || sessionId || undefined,
      source: 'browser-onnx'
    };

    try {
      const response = await fetch('http://localhost:5006/api/save-question-emotions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        console.warn(`[Q${questionId}] Emotion timeline save failed: ${response.status}`);
        return;
      }

      const result = await response.json();
      console.log(`[Q${questionId}] Server response:`, result);

      if (result.sessionId) {
        sessionIdRef.current = result.sessionId;
        if (!sessionId) {
          setSessionId(result.sessionId);
          console.log('Session ID set:', result.sessionId);
        }
      }
    } catch (error) {
      console.error(`[Q${questionId}] Error saving derived emotions (survey will continue):`, error);
    }
  };

  const stopCamera = () => {
    console.log('Stopping camera');

    if (emotionIntervalRef.current) {
      clearInterval(emotionIntervalRef.current);
      emotionIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    recordingQuestionIdRef.current = null;
  };

  const submitSurvey = async (finalAnswers) => {
    console.log('Submitting survey');
    
    setIsLoadingPreview(true);

    if (isRecording) {
      await stopRecordingAndSave();
    }

    stopCamera();

    navigate('/review', {
        state: {
          answers: finalAnswers,
          questions: questions,
          sessionId: sessionIdRef.current || sessionId,
          emotionSession: questionEmotionDataRef.current
        }
      });
  };

  const handleNext = async () => {
    const questionId = currentQuestion.id;
    console.log(`\n========== handleNext called for question ${questionId} ==========`);

    // Prevent multiple clicks while processing
    if (isNavigatingRef.current) {
      console.log('Navigation already in progress, ignoring click');
      return;
    }

    const updatedAnswers = {
      ...answers,
      [questionId]: selectedAnswer
    };

    try {
      // Set flag to prevent race conditions
      isNavigatingRef.current = true;

      if (shouldRecordQuestion(currentQuestion) || isRecording) {
        console.log(`[Q${questionId}] About to stop and save local emotion samples...`);
        await stopRecordingAndSave();
        console.log(`[Q${questionId}] Local emotion sampling stopped and saved`);
      }

      if (currentQuestionIndex < totalQuestions - 1) {
        // Move to next question
        const nextIndex = currentQuestionIndex + 1;
        const nextQuestion = questions[nextIndex];
        const nextQuestionId = nextQuestion.id;

        console.log(`Moving from Q${questionId} to Q${nextQuestionId}`);

        // Update state synchronously to prevent rollback
        setAnswers(updatedAnswers);
        setCurrentQuestionIndex(nextIndex);
        setSelectedAnswer(updatedAnswers[nextQuestionId] || '');

        if (shouldRecordQuestion(nextQuestion)) {
          console.log(`\n--- Starting local emotion sampling for Q${nextQuestionId} ---`);
          console.log(`Stream exists:`, !!streamRef.current);
          console.log(`Stream active:`, streamRef.current?.active);

          if (streamRef.current && streamRef.current.active) {
            startRecording(streamRef.current, nextQuestionId);
          } else {
            console.error(`No stream available for Q${nextQuestionId}!`);
          }
        } else {
          setCurrentEmotion(null);
          setEmotionData([]);
          console.log(`Q${nextQuestionId} does not require local emotion sampling.`);
        }
      } else {
        console.log('Last question - submitting survey');
        setAnswers(updatedAnswers);
        submitSurvey(updatedAnswers);
      }
    } catch (error) {
      console.error(`[Q${questionId}] Error in handleNext:`, error);
      // Don't navigate if there's an error
    } finally {
      // Reset navigation flag after a short delay
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 100);
    }
  };

  const handlePrevious = async () => {
    if (currentQuestionIndex > 0) {
      if (shouldRecordQuestion(currentQuestion) || isRecording) {
        await stopRecordingAndSave();
      }

      const prevIndex = currentQuestionIndex - 1;
      const prevQuestion = questions[prevIndex];
      const prevQuestionId = prevQuestion.id;

      // Set flag to prevent race condition in useEffect
      isNavigatingRef.current = true;

      setCurrentQuestionIndex(prevIndex);
      setSelectedAnswer(answers[prevQuestionId] || '');

      if (shouldRecordQuestion(prevQuestion)) {
        if (streamRef.current && streamRef.current.active) {
          startRecording(streamRef.current, prevQuestionId);
        }
      } else {
        setCurrentEmotion(null);
        setEmotionData([]);
        console.log(`Q${prevQuestionId} does not require local emotion sampling.`);
      }
    }
  };

  const handleAnswerChange = (value) => {
    setSelectedAnswer(value);
  };

  const handleQuitClick = (e) => {
    e.preventDefault();
    setShowQuitModal(true);
  };

  const handleQuitConfirm = () => {
    console.log('User quit survey');
    stopCamera();
    navigate('/');
  };

  const handleQuitCancel = () => {
    setShowQuitModal(false);
  };

  useEffect(() => {
    const initCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false
        });
        streamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        try {
          const models = await loadBrowserEmotionModels();
          emotionModelsRef.current = models;
          setEmotionStatus('Browser emotion models ready. No video is uploaded.');
        } catch (modelError) {
          console.error('Browser emotion model load error:', modelError);
          setEmotionStatus('Browser emotion models could not be loaded. The survey can continue without emotion samples.');
          return;
        }

        if (shouldRecordQuestion(questions[0])) {
          startRecording(mediaStream, questions[0].id);
        }
      } catch (error) {
        console.error('Camera access error:', error);
      }
    };

    initCamera();

    return () => {
      console.log('Component unmounting');

      if (emotionIntervalRef.current) {
        clearInterval(emotionIntervalRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const isAnswered = selectedAnswer.trim() !== '';
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  if (!currentQuestion) {
    return <div>Loading...</div>;
  }

  return (
    <div className="questionnaire-page">
      <div className="questionnaire-container">
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <canvas ref={cropCanvasRef} style={{ display: 'none' }} />

        <div className="questionnaire-header">
          <button onClick={handleQuitClick} className="quit-link">
            Quit Survey
          </button>
          {shouldRecordQuestion(currentQuestion) && (
            <div className="emotion-indicator">
              {currentEmotion
                ? `Detected locally: ${currentEmotion} (${emotionData.length} samples)`
                : emotionStatus}
            </div>
          )}
        </div>

        <div className="progress-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{width: `${progressPercentage}%`}}></div>
          </div>
        </div>

        <div className="question-section">
          <div className="question-header">
            <div className="question-number">
              {currentQuestionIndex + 1}
            </div>
            <h2 className="question-title">Question {currentQuestionIndex + 1}: {currentQuestion.category}</h2>
          </div>
          <p className="question-text">
            {currentQuestion.question}
          </p>
        </div>

        <div className="answer-section">
          <div className="camera-section">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-video"
            />
            <div className="camera-overlay">
              <div className="camera-frame"></div>
            </div>
          </div>

          <div className="options-section">
            {currentQuestion.type === 'text' ? (
              <textarea
                value={selectedAnswer}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder="Type your response here..."
                rows={6}
                className="reflection-textarea"
              />
            ) : (
              <div className="likert-scale">
                {(currentQuestion.options || []).map((option, index) => (
                  <label
                    key={option}
                    className={`likert-option likert-${index + 1}`}
                    title={option}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQuestion.id}`}
                      value={option}
                      checked={selectedAnswer === option}
                      onChange={() => handleAnswerChange(option)}
                      className="likert-input"
                      aria-label={option}
                    />
                    <div className="likert-button">
                      <span>{option}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bottom-navigation">
          {currentQuestionIndex > 0 && (
            <button
              onClick={handlePrevious}
              className="previous-button-bottom"
            >
              Previous
            </button>
          )}

          <button
            onClick={handleNext}
            disabled={!isAnswered || isLoadingPreview}
            className={`next-button-bottom ${(isAnswered && !isLoadingPreview) ? 'enabled' : 'disabled'}`}
          >
            {isLoadingPreview ? 'Loading Answers Preview...' : (isLastQuestion ? 'Finish and Check Answers' : 'Next')}
          </button>
          
          {isLoadingPreview && (
            <div className="loading-message">
              <p>Processing your responses and preparing the Answers Preview Page...</p>
              <p>You'll be able to review all your answers before final submission.</p>
            </div>
          )}
        </div>
      </div>

      {showQuitModal && (
        <div className="modal-overlay">
          <div className="quit-modal">
            <h3 className="modal-title">Quitting the Survey: Are you sure?</h3>
            <p className="modal-message">
              Once you quit, all your input data will be deleted everywhere. If you take this survey again, you will have to redo your answers.
            </p>
            <div className="modal-buttons">
              <button
                onClick={handleQuitCancel}
                className="cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={handleQuitConfirm}
                className="quit-confirm-button"
              >
                Quit Survey
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuestionnairePage;


