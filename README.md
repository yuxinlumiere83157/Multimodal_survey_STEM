# ENGE817 Multimodal Stress, Usability, and Trust Pilot Study

## Overview

This project is a React + Flask prototype for an ENGE817 pilot study. It was adapted from an earlier multimodal survey and facial-emotion recognition project. The previous version used a general wellbeing questionnaire; the current version collects ENGE817 study instruments:

- Momentary stress self-report items for RQ2.
- SUS-style usability items for RQ1.
- Trust and privacy Likert items for RQ3.
- Open-ended reflection prompts for RQ2 and RQ3.

The system still includes webcam-based facial-emotion recognition, but facial recording is now used only for the momentary stress questions. SUS, trust/privacy, and reflection questions do not record facial emotion.

## Current Study Flow

The questionnaire contains 24 questions:

| Question range | Instrument | Scale/type | Facial recording |
| --- | --- | --- | --- |
| Q1-Q6 | Momentary stress self-report | 0-4 Likert | Yes |
| Q7-Q16 | SUS usability | 1-5 Likert | No |
| Q17-Q21 | Trust/privacy perceptions | 1-5 Likert | No |
| Q22-Q24 | Open-ended reflection | Text | No |

The purpose of the prototype is to support these research questions:

- **RQ1:** How usable is the prototype?
- **RQ2:** What is the relationship between momentary stress self-report and facial emotion during stress items?
- **RQ3:** What trust and privacy concerns arise around webcam-based emotion detection?

## Key Changes From the Previous Version

- Replaced the old 20-item wellbeing questionnaire with ENGE817 instruments.
- Added `client/src/studyQuestions.js` as the shared source of truth for all questionnaire items.
- Updated the questionnaire page so only stress items record webcam video and emotion timelines.
- Added text-entry support for open-ended reflection prompts.
- Updated the review page to display category, construct, question text, and answer for Likert and text responses.
- Updated `/api/save-survey-answers` to save raw answers, scored answers, summary scores, reflection answers, and question metadata.
- Updated `/api/analyze-survey-results` to compare stress self-report only with emotion data from Q1-Q6.
- Updated visible app copy so the project is no longer presented as a wellbeing questionnaire.

## Architecture

| Component | Description |
| --- | --- |
| **Flask API (`API.py`)** | Provides health checks, frame analysis, video analysis, question-video saving, ENGE817 survey-answer saving, and stress/facial-emotion comparison. |
| **React frontend (`client/`)** | Provides the participant flow: home, summary, consent, webcam preview, questionnaire, review, and completion pages. |
| **Study questions (`client/src/studyQuestions.js`)** | Defines all ENGE817 questions, constructs, scoring metadata, question types, and whether each question records emotion. |

## Backend Endpoints

The existing emotion-recognition endpoints are preserved:

- `GET /api/health`
- `POST /api/analyze-frame`
- `POST /api/analyze-video`
- `POST /api/save-question-video`
- `GET /api/download/<filename>`
- `GET /api/emotions`

ENGE817 survey endpoints:

- `POST /api/save-survey-answers`
- `POST /api/analyze-survey-results`

## Scoring

### Stress

Stress items use a 0-4 scale. Higher final scores indicate higher stress.

- Normal items: `score = numeric`
- Reverse-coded stress items: `score = 4 - numeric`
- Summary: `stressAverage_0_to_4`

### SUS

SUS items use a 1-5 scale.

- Positive items: `contribution = numeric - 1`
- Reverse-coded items: `contribution = 5 - numeric`
- Summary: `susScore_0_to_100 = sum(contributions) * 2.5`

### Trust/Privacy

Trust/privacy items use a 1-5 scale.

- Normal items: `score = numeric`
- Reverse-coded privacy concern item: `score = 6 - numeric`
- Summary: `trustPrivacyAverage_1_to_5`

### Reflection

Reflection items are text responses and are not scored. They are saved in `reflectionAnswers`.

## Data Storage

- **`uploads/`**: Temporary storage for uploaded raw videos.
- **`results/<sessionId>/survey_answers.json`**: Saved ENGE817 survey payload with raw answers, scored answers, summary scores, reflection answers, and questions.
- **`question_videos/<sessionId>/`**: Per-question webcam videos and emotion JSON files for stress questions.

Expected stress-item emotion files:

- `question_1_emotions.json`
- `question_2_emotions.json`
- `question_3_emotions.json`
- `question_4_emotions.json`
- `question_5_emotions.json`
- `question_6_emotions.json`

It is expected that Q7-Q24 do not produce emotion JSON files.

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yuxinlumiere83157/Multimodal_survey_STEM.git
cd Multimodal_survey_STEM
```

To work from the ENGE817 update branch:

```bash
git checkout codex/enge817-study-instruments
```

### 2. Backend setup

Create a Python virtual environment and install dependencies:

```bash
python -m venv venv
venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

Start the Flask server:

```bash
python API.py
```

By default, the server runs on:

```text
http://localhost:5006
```

### 3. Frontend setup

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Vite serves the application at:

```text
http://localhost:5173
```

Keep the Flask backend running while using the frontend.

## Manual Test Checklist

Expected questionnaire flow:

- Q1-Q6: stress Likert items with webcam/emotion recording active.
- Q7-Q16: SUS Likert items with no webcam/emotion recording.
- Q17-Q21: trust/privacy Likert items with no webcam/emotion recording.
- Q22-Q24: text reflection prompts with no webcam/emotion recording.

Expected saved survey fields:

- `instrument: "ENGE817_stress_SUS_trust_privacy_reflection"`
- `rawAnswers`
- `scoredAnswers`
- `summaryScores.stressAverage_0_to_4`
- `summaryScores.susScore_0_to_100`
- `summaryScores.trustPrivacyAverage_1_to_5`
- `reflectionAnswers`
- `questions`

## Model and Emotion Categories

The facial-emotion model is preserved from the previous version. It uses MediaPipe face detection and a TorchScript model file:

```text
torchscript_model_0_66_49_wo_gl.pth
```

The model recognizes:

- Neutral
- Happiness
- Sadness
- Surprise
- Fear
- Disgust
- Anger

For ENGE817 analysis, facial emotion is grouped as:

- Positive: Happiness, Surprise
- Neutral: Neutral
- Negative: Sadness, Fear, Disgust, Anger

## Notes

- This prototype is intended for local research/demo use.
- The Flask app runs in debug mode by default.
- For production deployment, disable debug mode, restrict upload handling, and add appropriate authentication and data protection controls.

## License

This project is released under the MIT License. See `LICENSE` for details.
