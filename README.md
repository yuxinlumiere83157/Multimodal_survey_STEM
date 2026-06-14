# ENGE817 Multimodal Survey STEM Prototype

This repository contains a privacy-focused multimodal survey prototype for an
ENGE817 pilot study. The study combines questionnaire responses with
browser-only facial-emotion sampling during the stress self-report section.

Participants should enter the study through the hosted Hugging Face demo:

[https://impale5666-multimodal-survey-demo.static.hf.space/index.html](https://impale5666-multimodal-survey-demo.static.hf.space/index.html)

## Study Overview

The prototype supports three research questions:

- **RQ1:** How usable is the prototype?
- **RQ2:** What is the relationship between momentary stress self-report and
  facial emotion during stress items?
- **RQ3:** What trust and privacy concerns arise around webcam-based emotion
  detection?

The current questionnaire contains 24 questions:

| Question range | Instrument | Scale/type | Facial-emotion sampling |
| --- | --- | --- | --- |
| Q1-Q6 | Momentary stress self-report | 0-4 Likert | Yes |
| Q7-Q16 | SUS usability | 1-5 Likert | No |
| Q17-Q21 | Trust/privacy perceptions | 1-5 Likert | No |
| Q22-Q24 | Open-ended reflection | Text | No |

Facial-emotion sampling is limited to the stress items. SUS, trust/privacy, and
reflection questions do not collect emotion samples.

## Live Services

| Service | URL or location |
| --- | --- |
| Participant demo | [https://impale5666-multimodal-survey-demo.static.hf.space/index.html](https://impale5666-multimodal-survey-demo.static.hf.space/index.html) |
| Cloudflare collector Worker | `https://multimodal-survey-collector.impale5666.workers.dev` |
| D1 database | `multimodal-survey-results` |
| Project ID | `multimodal-survey-stem` |
| Collector config | `client/public/collector-config.json` |

## Privacy Model

- Webcam frames are processed in the participant's browser.
- Raw webcam video and raw camera frames are not uploaded by the hosted static
  demo.
- The Cloudflare collector receives the project ID, session ID, source origin,
  app version, consented questionnaire answers, derived emotion timelines,
  analysis JSON, and scalar summary fields.
- The collector does not store IP addresses or user-agent strings.
- When the collector is enabled, the system-check page requires it to be
  reachable before the participant continues. If a later submission attempt
  fails, the review page falls back to local Flask saving when available, then to
  a browser JSON download.
- Hugging Face hosts the static participant interface; it does not receive or
  store the submitted survey answers from the static deployment.

## Architecture

| Component | Description |
| --- | --- |
| React frontend (`client/`) | Participant flow: home, summary, consent, system check, camera setup, questionnaire, review, and completion. |
| Browser emotion runtime | MediaPipe FaceLandmarker + ONNX Runtime Web model loaded from `client/public/models/`. |
| Flask API (`API.py`) | Local research backend for health checks, legacy frame/video analysis, local survey saving, and local stress/emotion comparison. |
| Study questions (`client/src/studyQuestions.js`) | Shared source of truth for question text, constructs, scoring metadata, question types, and sampling flags. |
| Cloudflare collector (`collector/`) | Worker + D1 central collection path for hosted static deployments. |

## Study Flow

1. The participant opens the Hugging Face demo.
2. The consent page routes to `/system-check`.
3. The system check loads the ONNX model, MediaPipe assets, WebAssembly runtime,
   and result destination.
4. Q1-Q6 collect stress self-report responses and derived browser emotion
   samples.
5. Q7-Q24 collect usability, trust/privacy, and reflection responses without
   emotion sampling.
6. The review page submits final results to the configured Cloudflare collector,
   local Flask backend, or browser JSON download fallback.

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
- Reverse-coded privacy-concern item: `score = 6 - numeric`
- Summary: `trustPrivacyAverage_1_to_5`

### Reflection

Reflection items are text responses and are not scored. They are saved in
`reflectionAnswers`.

## Data Storage

Local Flask mode can write:

- `results/<sessionId>/survey_answers.json`
- `question_videos/<sessionId>/question_1_emotions.json`
- `question_videos/<sessionId>/question_2_emotions.json`
- `question_videos/<sessionId>/question_3_emotions.json`
- `question_videos/<sessionId>/question_4_emotions.json`
- `question_videos/<sessionId>/question_5_emotions.json`
- `question_videos/<sessionId>/question_6_emotions.json`

It is expected that Q7-Q24 do not produce emotion JSON files.

Hosted static mode uses the Cloudflare collector when
`client/public/collector-config.json` is enabled:

```json
{
  "enabled": true,
  "projectId": "multimodal-survey-stem",
  "collectorUrl": "https://multimodal-survey-collector.impale5666.workers.dev"
}
```

If no collector or local backend is available, the browser downloads a local JSON
file named like:

```text
submit_session_<timestamp>_survey_results.json
```

## Cloudflare Worker + D1 Collector

The collector provides:

- `GET /api/health`
- `POST /api/submit-survey`
- `GET /api/export.json`
- `GET /api/export.csv`

Exports require the private admin bearer token stored outside the repository.

Export CSV:

```powershell
$token = Get-Content -Raw "C:\tmp\multimodal-survey-collector-admin-token.txt"
curl.exe -H "Authorization: Bearer $token" "https://multimodal-survey-collector.impale5666.workers.dev/api/export.csv?projectId=multimodal-survey-stem" -o survey-submissions.csv
```

Export JSON:

```powershell
$token = Get-Content -Raw "C:\tmp\multimodal-survey-collector-admin-token.txt"
curl.exe -H "Authorization: Bearer $token" "https://multimodal-survey-collector.impale5666.workers.dev/api/export.json?projectId=multimodal-survey-stem" -o survey-submissions.json
```

See `collector/README.md` for D1 setup, Wrangler deployment, and maintenance
commands.

## Model Files And Git LFS

The local Flask/emotion tooling depends on the TorchScript model file:

```text
torchscript_model_0_66_49_wo_gl.pth
```

The file is stored with Git LFS because it is too large for normal Git storage.
Before running local backend workflows, make sure Git LFS is installed and the
model file has been downloaded:

```bash
git lfs install
git lfs pull
git lfs checkout
ls -lh torchscript_model_0_66_49_wo_gl.pth
```

The file should be visible in the project root and should be approximately
94 MB. If it is missing, local model loading will fail.

The browser-only hosted demo uses the ONNX model at:

```text
client/public/models/fer_model.onnx
```

The ONNX export is reproducible with:

```bash
python tools/export_onnx.py
```

The exporter validates ONNX Runtime outputs against the TorchScript model and
should show very small differences, around `1e-6`, before the browser model is
trusted.

## Local Development

### Backend

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

By default, the server runs at:

```text
http://localhost:5006
```

### Frontend

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Vite serves the frontend at:

```text
http://localhost:5173
```

Useful frontend commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Vite development server. |
| `npm run build` | Build the static frontend. |
| `npm run preview` | Preview the static build locally. |
| `npm run lint` | Run ESLint over the frontend code. |

## Manual Test Checklist

- Q1-Q6 show stress Likert items and browser-only emotion sampling.
- Q7-Q16 show SUS Likert items with no emotion sampling.
- Q17-Q21 show trust/privacy Likert items with no emotion sampling.
- Q22-Q24 show text reflection prompts with no emotion sampling.
- The system-check page reports model readiness before camera setup.
- The review page shows the configured result destination.
- With the collector enabled, the system-check page blocks progress if the
  Worker is unreachable.
- If a collector submission fails after the system check, the app falls back to
  local Flask saving or a browser JSON download.

Expected saved survey fields:

- `instrument: "ENGE817_stress_SUS_trust_privacy_reflection"`
- `rawAnswers`
- `scoredAnswers`
- `summaryScores.stressAverage_0_to_4`
- `summaryScores.susScore_0_to_100`
- `summaryScores.trustPrivacyAverage_1_to_5`
- `reflectionAnswers`
- `questions`

## Backend API Endpoints

Emotion-recognition and local storage endpoints:

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

## Model And Emotion Categories

The emotion model recognizes:

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

- This prototype is intended for research and demonstration use.
- The local Flask app runs in debug mode by default.
- For production server deployments, disable debug mode, restrict upload
  handling, and add appropriate authentication and data-protection controls.

## License

This project is released under the MIT License. See `LICENSE` for details.
