# ENGE817 Multimodal Stress, Usability, and Trust Pilot Study

## Overview

This project is a React + Flask prototype for an ENGE817 pilot study. It was adapted from an earlier multimodal survey and facial-emotion recognition project. The previous version used a general wellbeing questionnaire; the current version collects ENGE817 study instruments:

- Momentary stress self-report items for RQ2.
- SUS-style usability items for RQ1.
- Trust and privacy Likert items for RQ3.
- Open-ended reflection prompts for RQ2 and RQ3.

The system still includes webcam-based facial-emotion recognition, but browser-only emotion sampling is now used only for the momentary stress questions. SUS, trust/privacy, and reflection questions do not collect facial-emotion samples.

## Current Study Flow

The questionnaire contains 24 questions:

| Question range | Instrument | Scale/type | Facial-emotion sampling |
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
- `POST /api/save-question-emotions`
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

- **`uploads/`**: Temporary storage for legacy uploaded raw videos.
- **`results/<sessionId>/survey_answers.json`**: Saved ENGE817 survey payload with raw answers, scored answers, summary scores, reflection answers, and questions.
- **`question_videos/<sessionId>/`**: Per-question derived emotion JSON files for stress questions. In the browser-only prototype, raw webcam video is not uploaded or stored.
- **Cloudflare D1 collector (`collector/`)**: Optional free central collection path for hosted static deployments.

Expected stress-item emotion files:

- `question_1_emotions.json`
- `question_2_emotions.json`
- `question_3_emotions.json`
- `question_4_emotions.json`
- `question_5_emotions.json`
- `question_6_emotions.json`

It is expected that Q7-Q24 do not produce emotion JSON files.

On the hosted Hugging Face Static Space deployment, there is no writable backend server. In that mode, final survey submissions are downloaded by the participant's browser as a JSON file named like:

```text
submit_session_<timestamp>_survey_results.json
```

Hugging Face does not receive or store survey answers in the static deployment. When the Flask API is running locally at `http://localhost:5006`, the frontend detects it and saves results through the backend paths listed above. When `client/public/collector-config.json` enables a Cloudflare Worker collector, submissions are sent to that HTTPS endpoint first and stored centrally in D1.

## Browser System Check

After consent, the participant is routed to `/system-check` before camera setup. This page loads and initializes the browser emotion stack before the questionnaire begins:

- `/models/fer_model.onnx`
- MediaPipe FaceLandmarker model
- MediaPipe WebAssembly runtime files
- ONNX Runtime Web files

The page also reports the active results destination:

- **Cloudflare collector mode:** final results are stored in D1 through the Worker API and can later be exported as JSON or CSV.
- **Static demo mode:** final results download as a browser JSON file.
- **Local Flask mode:** final answers save under `results/<sessionId>/`, and derived emotion timelines save under `question_videos/<sessionId>/`.

## Cloudflare Worker + D1 Collector

The `collector/` folder contains a reusable Cloudflare Worker and D1 schema for central survey result collection. It provides:

- `GET /api/health`
- `POST /api/submit-survey`
- `GET /api/export.json`
- `GET /api/export.csv`

The collector stores final answer JSON, derived emotion timeline JSON, analysis JSON, and scalar summary fields. It does not store raw webcam frames, raw video, IP addresses, or user-agent strings.

To connect a deployed Worker to the static frontend, update:

```text
client/public/collector-config.json
```

Example:

```json
{
  "enabled": true,
  "projectId": "multimodal-survey-stem",
  "collectorUrl": "https://multimodal-survey-collector.<your-subdomain>.workers.dev"
}
```

See `collector/README.md` for D1 creation, Wrangler deployment, and export commands.

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

- Q1-Q6: stress Likert items with browser-only emotion sampling active.
- Q7-Q16: SUS Likert items with no emotion sampling.
- Q17-Q21: trust/privacy Likert items with no emotion sampling.
- Q22-Q24: text reflection prompts with no emotion sampling.

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

## Browser-Only Privacy Prototype

The `codex/browser-onnx-research` branch includes an experimental browser-only route:

```text
/browser-emotion-demo
```

This page loads an ONNX conversion of the emotion model from:

```text
client/public/models/fer_model.onnx
```

It runs face detection and emotion inference in the participant's browser. Webcam frames are not sent to the Flask API. The main questionnaire also uses this browser-only path for Q1-Q6, then saves derived emotion timelines through `/api/save-question-emotions` when the Flask backend is available. If the backend is unavailable, the review page falls back to local analysis and downloads a JSON results file instead of storing data remotely.

This is intended as the lowest-cost and strongest-privacy deployment direction: a static site can host the UI/model, while only consented survey answers and derived emotion labels need to be saved to durable storage.

The conversion is reproducible with:

```bash
python tools/export_onnx.py
```

The exporter validates ONNX Runtime outputs against the TorchScript model and should show very small differences (around `1e-6`) before the browser model is trusted.

## Notes

- This prototype is intended for local research/demo use.
- The Flask app runs in debug mode by default.
- For production deployment, disable debug mode, restrict upload handling, and add appropriate authentication and data protection controls.

## License

This project is released under the MIT License. See `LICENSE` for details.
