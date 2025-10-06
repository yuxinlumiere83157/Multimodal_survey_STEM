
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './QuestionnairePage.css';

function QuestionnairePage() {
  const navigate = useNavigate();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [answers, setAnswers] = useState({});
  const [showQuitModal, setShowQuitModal] = useState(false);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const canvasRef = useRef(null);
  const emotionIntervalRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState(null);
  const [emotionData, setEmotionData] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const location = useLocation();

  // CRITICAL FIX: Store question ID when recording starts
  const recordingQuestionIdRef = useRef(null);

  const [questions] = useState([
    {
      id: 1,
      category: "Satisfaction",
      question: "How in touch are you with your positive emotions?",
      options: ["Extremely in touch", "In touch", "Neutral", "Out of touch", "Extremely out of touch"]
    },
    {
      id: 2,
      category: "Satisfaction",
      question: "How much do you trust your skills and capabilities?",
      options: ["Full trust", "Lots of trust", "Neutral", "Little trust", "No trust"]
    },
    {
      id: 3,
      category: "Satisfaction",
      question: "How satisfied are you with the support you get from your friends?",
      options: ["Extremely satisfied", "Satisfied", "Neutral", "Dissatisfied", "Extremely dissatisfied"]
    },
    {
      id: 4,
      category: "Satisfaction",
      question: "How satisfied are you with the support you get from your family?",
      options: ["Extremely satisfied", "Satisfied", "Neutral", "Dissatisfied", "Extremely dissatisfied"]
    },
    {
      id: 5,
      category: "Satisfaction",
      question: "How often do you positively think of the future?",
      options: ["Always", "Often", "Sometimes", "Rarely", "Never"]
    },
    {
      id: 6,
      category: "Self-Management",
      question: "How would you rate your ability to deal with personal problems?",
      options: ["Very good", "Good", "Fair", "Poor", "Very poor"]
    },
    {
      id: 7,
      category: "Self-Management",
      question: "How would you rate your ability to organize your thoughts?",
      options: ["Very good", "Good", "Fair", "Poor", "Very poor"]
    },
    {
      id: 8,
      category: "Self-Management",
      question: "How much control do you feel you have on important aspects of your life?",
      options: ["Full control", "Lots of control", "Neutral", "Little control", "No control"]
    },
    {
      id: 9,
      category: "Quality Rest",
      question: "How in touch are you with your inner peace?",
      options: ["Extremely in touch", "In touch", "Neutral", "Out of touch", "Extremely out of touch"]
    },
    {
      id: 10,
      category: "Quality Rest",
      question: "How often do you sleep 7-9 hours a day?",
      options: ["Always", "Often", "Sometimes", "Rarely", "Never"]
    },
    {
      id: 11,
      category: "Quality Rest",
      question: "How often are you able to focus or concentrate on something?",
      options: ["Always", "Often", "Sometimes", "Rarely", "Never"]
    },
    {
      id: 12,
      category: "Quality Rest",
      question: "How often do you plan ahead to avoid stressful situations?",
      options: ["Always", "Often", "Sometimes", "Rarely", "Never"]
    },
    {
      id: 13,
      category: "Quality Rest",
      question: "How often do you prioritize doing tasks, and thinking of a solution, instead of letting stress and emotions affect you?",
      options: ["Always", "Often", "Sometimes", "Rarely", "Never"]
    },
    {
      id: 14,
      category: "Quality Rest",
      question: "How often do you take a much needed break, instead of letting stress and emotions affect you?",
      options: ["Always", "Often", "Sometimes", "Rarely", "Never"]
    },
    {
      id: 15,
      category: "Productivity",
      question: "How much do you enjoy your daily routine?",
      options: ["Extremely satisfied", "Satisfied", "Neutral", "Dissatisfied", "Extremely dissatisfied"]
    },
    {
      id: 16,
      category: "Productivity",
      question: "How much do you feel unbothered about daily challenges?",
      options: ["Extremely unbothered", "Unbothered", "Neutral", "Bothered", "Extremely bothered"]
    },
    {
      id: 17,
      category: "Productivity",
      question: "How much time do you spend on leisurely activities?",
      options: ["All the time", "Most of the time", "About half of the time", "Some of the time", "None of the time"]
    },
    {
      id: 18,
      category: "Productivity",
      question: "How much time do you spend on quality time with friends and family?",
      options: ["All the time", "Most of the time", "About half of the time", "Some of the time", "None of the time"]
    },
    {
      id: 19,
      category: "Productivity",
      question: "How often are you free from situations under time pressure?",
      options: ["Always", "Often", "Sometimes", "Rarely", "Never"]
    },
    {
      id: 20,
      category: "Productivity",
      question: "How often do you feel unbothered about unexpected events?",
      options: ["Always", "Often", "Sometimes", "Rarely", "Never"]
    }
  ]);

  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;
  const progressPercentage = ((currentQuestionIndex + 1) / totalQuestions) * 100;

  useEffect(() => {
    if (location.state?.answers) {
      setAnswers(location.state.answers);
    }
  }, [location.state]);

  useEffect(() => {
    const savedAnswer = answers[currentQuestion?.id] || '';
    setSelectedAnswer(savedAnswer);
  }, [currentQuestionIndex, answers, currentQuestion]);

  const captureAndAnalyzeFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL('image/jpeg');

    try {
      const response = await fetch('http://localhost:5006/api/analyze-frame', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageData })
      });

      const result = await response.json();

      if (result.success && result.faces && result.faces.length > 0) {
        const emotion = result.faces[0].emotion;
        setCurrentEmotion(emotion);
        setEmotionData(prev => [...prev, {
          timestamp: Date.now(),
          emotion: emotion,
          confidence: result.faces[0].confidence
        }]);
      }
    } catch (error) {
      console.error('Error analyzing frame:', error);
    }
  };

  // FIXED: Accept questionId parameter
  const startRecording = (stream, questionId) => {
    try {
      console.log(`[Q${questionId}] startRecording called`);
      console.log(`[Q${questionId}] Stream active:`, stream && stream.active);
      console.log(`[Q${questionId}] Video tracks:`, stream ? stream.getVideoTracks().length : 0);

      // CRITICAL FIX: Ensure any previous recorder is fully stopped and cleared
      if (mediaRecorderRef.current) {
        console.log(`[Q${questionId}] WARNING: Previous MediaRecorder still exists, state:`, mediaRecorderRef.current.state);
        if (mediaRecorderRef.current.state !== 'inactive') {
          console.log(`[Q${questionId}] Force stopping previous recorder`);
          mediaRecorderRef.current.stop();
        }
        // Remove all event listeners by setting them to null
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.onerror = null;
        mediaRecorderRef.current = null;
        console.log(`[Q${questionId}] Previous recorder cleared`);
      }

      // Store the question ID for this recording session
      recordingQuestionIdRef.current = questionId;

      let options = { mimeType: 'video/webm;codecs=vp8,opus' };

      // Fallback if vp8 not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('vp8,opus not supported, trying fallback');
        options = { mimeType: 'video/webm' };
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      console.log(`[Q${questionId}] MediaRecorder created with:`, options.mimeType);

      // Clear any existing chunks
      recordedChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          console.log(`[Q${questionId}] Chunk: ${event.data.size} bytes, total: ${recordedChunksRef.current.length}`);
        } else {
          console.warn(`[Q${questionId}] Received chunk with 0 size!`);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error(`[Q${questionId}] MediaRecorder error:`, event);
      };

      mediaRecorder.onstop = () => {
        console.log(`[Q${questionId}] MediaRecorder onstop event fired naturally`);
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

      console.log(`[Q${questionId}] Recording started successfully, state:`, mediaRecorder.state);

      emotionIntervalRef.current = setInterval(() => {
        captureAndAnalyzeFrame();
      }, 500);

    } catch (error) {
      console.error(`[Q${questionId}] Error starting recording:`, error);
    }
  };

  const stopRecordingAndSave = async () => {
    console.log('========== stopRecordingAndSave called ==========');
    console.log('isRecording:', isRecording);
    console.log('mediaRecorderRef.current:', !!mediaRecorderRef.current);
    console.log('mediaRecorder state:', mediaRecorderRef.current?.state);

    if (!mediaRecorderRef.current || !isRecording) {
      console.log('No active recording to stop');
      return;
    }

    if (emotionIntervalRef.current) {
      clearInterval(emotionIntervalRef.current);
      emotionIntervalRef.current = null;
    }

    // CRITICAL: Capture the question ID BEFORE stopping
    const questionIdForThisRecording = recordingQuestionIdRef.current;
    console.log(`Stopping recording for question ${questionIdForThisRecording}`);
    console.log(`Current chunks before stop: ${recordedChunksRef.current.length}`);

    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;

      recorder.onstop = async () => {
        console.log(`\n[Q${questionIdForThisRecording}] ===== ONSTOP EVENT FIRED =====`);
        console.log(`[Q${questionIdForThisRecording}] Recording stopped. Chunks: ${recordedChunksRef.current.length}`);
        console.log(`[Q${questionIdForThisRecording}] Recorder state: ${recorder.state}`);

        setIsRecording(false);

        // Small delay to ensure all chunks are collected
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log(`[Q${questionIdForThisRecording}] After delay, chunks: ${recordedChunksRef.current.length}`);

        try {
          // Pass the captured question ID
          await saveVideoWithEmotion(questionIdForThisRecording);
          console.log(`[Q${questionIdForThisRecording}] Video saved successfully`);
        } catch (error) {
          console.error(`[Q${questionIdForThisRecording}] Error saving video:`, error);
        }

        recordedChunksRef.current = [];
        setEmotionData([]);
        recordingQuestionIdRef.current = null;
        console.log(`[Q${questionIdForThisRecording}] Cleanup complete\n`);
        resolve();
      };

      console.log(`Calling recorder.stop()...`);
      recorder.stop();
    });
  };

  // FIXED: Accept questionId parameter instead of using current state
  const saveVideoWithEmotion = async (questionId) => {
    if (recordedChunksRef.current.length === 0) {
      console.warn(`[Q${questionId}] No recorded chunks to save`);
      return;
    }

    console.log(`[Q${questionId}] Creating blob from ${recordedChunksRef.current.length} chunks`);

    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });

    if (blob.size === 0) {
      console.error(`[Q${questionId}] Blob has zero size!`);
      return;
    }

    console.log(`[Q${questionId}] Blob created: ${blob.size} bytes`);

    const emotionCounts = {};
    emotionData.forEach(item => {
      emotionCounts[item.emotion] = (emotionCounts[item.emotion] || 0) + 1;
    });

    const dominantEmotion = emotionData.length > 0
      ? Object.keys(emotionCounts).reduce((a, b) =>
          emotionCounts[a] > emotionCounts[b] ? a : b
        )
      : 'Unknown';

    console.log(`[Q${questionId}] Dominant emotion: ${dominantEmotion} from ${emotionData.length} samples`);

    const formData = new FormData();
    formData.append('video', blob, `question_${questionId}_${dominantEmotion}.webm`);
    formData.append('questionId', questionId.toString());
    formData.append('emotion', dominantEmotion);
    formData.append('emotionData', JSON.stringify(emotionData));

    if (sessionId) {
      formData.append('sessionId', sessionId);
    }

    try {
      const response = await fetch('http://localhost:5006/api/save-question-video', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`[Q${questionId}] Server response:`, result);

      if (result.sessionId && !sessionId) {
        setSessionId(result.sessionId);
        console.log('Session ID set:', result.sessionId);
      }
    } catch (error) {
      console.error(`[Q${questionId}] Error saving video:`, error);
      throw error;
    }
  };

  const stopCamera = () => {
    console.log('Stopping camera');

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }

    if (emotionIntervalRef.current) {
      clearInterval(emotionIntervalRef.current);
      emotionIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const submitSurvey = async (finalAnswers) => {
    console.log('Submitting survey');

    if (isRecording) {
      await stopRecordingAndSave();
    }

    stopCamera();

    navigate('/review', {
      state: {
        answers: finalAnswers,
        questions: questions,
        sessionId: sessionId
      }
    });
  };

  const handleNext = async () => {
    const questionId = currentQuestion.id;
    console.log(`\n========== handleNext called for question ${questionId} ==========`);

    const updatedAnswers = {
      ...answers,
      [questionId]: selectedAnswer
    };
    setAnswers(updatedAnswers);

    console.log(`[Q${questionId}] About to stop and save recording...`);
    // Stop and save current recording
    await stopRecordingAndSave();
    console.log(`[Q${questionId}] Recording stopped and saved`);

    if (currentQuestionIndex < totalQuestions - 1) {
      // Move to next question
      const nextIndex = currentQuestionIndex + 1;
      const nextQuestionId = questions[nextIndex].id;

      console.log(`Moving from Q${questionId} to Q${nextQuestionId}`);
      setCurrentQuestionIndex(nextIndex);

      // Wait for state to update, then start recording with NEW question ID
      setTimeout(() => {
        console.log(`\n--- Starting new recording for Q${nextQuestionId} ---`);
        console.log(`Stream exists:`, !!streamRef.current);
        console.log(`Stream active:`, streamRef.current?.active);

        if (streamRef.current) {
          startRecording(streamRef.current, nextQuestionId);
        } else {
          console.error(`No stream available for Q${nextQuestionId}!`);
        }
      }, 500);
    } else {
      console.log('Last question - submitting survey');
      submitSurvey(updatedAnswers);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        // Start recording with question ID
        startRecording(stream, questions[0].id);
      } catch (error) {
        console.error('Camera access error:', error);
      }
    };

    initCamera();

    return () => {
      console.log('Component unmounting');

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      if (emotionIntervalRef.current) {
        clearInterval(emotionIntervalRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const isAnswered = selectedAnswer !== '';
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  if (!currentQuestion) {
    return <div>Loading...</div>;
  }

  return (
    <div className="questionnaire-page">
      <div className="questionnaire-container">
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div className="questionnaire-header">
          <button onClick={handleQuitClick} className="quit-link">
            ← Quit Survey
          </button>
          {currentEmotion && (
            <div className="emotion-indicator">
              Detected: {currentEmotion}
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
            <div className="radio-options">
              {currentQuestion.options.map((option, index) => (
                <label key={index} className="radio-container">
                  <input
                    type="radio"
                    name={`question-${currentQuestion.id}`}
                    value={option}
                    checked={selectedAnswer === option}
                    onChange={() => handleAnswerChange(option)}
                    className="radio-input"
                  />
                  <div className="custom-radio"></div>
                  <span className="radio-label">{option}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="bottom-navigation">
          {currentQuestionIndex > 0 && (
            <button
              onClick={handlePrevious}
              className="previous-button-bottom"
            >
              ← Previous
            </button>
          )}

          <button
            onClick={handleNext}
            disabled={!isAnswered}
            className={`next-button-bottom ${isAnswered ? 'enabled' : 'disabled'}`}
          >
            {isLastQuestion ? 'Submit Survey' : 'Next →'}
          </button>
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