---
title: ENGE817 Multimodal Survey Research App
emoji: 🧪
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
short_description: Research survey app with webcam emotion analysis.
---

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

## Run With Docker (Recommended)

Docker is the simplest way to run the full research/demo app because the image builds the Vite/React client and serves the finished static files from Flask on port `7860`.

These commands work from PowerShell, Command Prompt, Terminal, or any normal shell on Windows, macOS, or Linux:

```bash
git clone https://github.com/yuxinlumiere83157/Multimodal_survey_STEM.git
cd Multimodal_survey_STEM
```

Make sure the TorchScript model file is present before building:

```bash
git lfs install
git lfs pull
git lfs checkout
```

The project root should contain:

```text
torchscript_model_0_66_49_wo_gl.pth
```

Build and run the local Docker image:

```bash
docker build -t multimodal-survey-demo:local .
docker run --rm -p 7860:7860 --name fer-demo multimodal-survey-demo:local
```

Open:

```text
http://localhost:7860/
```

### Check Output Files

After completing a questionnaire run, the saved survey output is written to:

```text
results/<sessionId>/survey_answers.json
```

Stress-question webcam/emotion outputs are written to:

```text
question_videos/<sessionId>/
```

When running with Docker, these paths live inside the container under `/data` by default. To quickly inspect files while the container is still running:

```bash
docker exec fer-demo find /data -maxdepth 3 -type f
docker exec fer-demo cat /data/results/<sessionId>/survey_answers.json
```

Replace `<sessionId>` with the folder name created by your test run.

Because the recommended `docker run --rm` command removes the container when it stops, use a local volume if you want to keep output files on your computer.

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force docker-data
docker run --rm -p 7860:7860 --name fer-demo -v "${PWD}/docker-data:/data" multimodal-survey-demo:local
```

macOS/Linux:

```bash
mkdir -p docker-data
docker run --rm -p 7860:7860 --name fer-demo -v "$PWD/docker-data:/data" multimodal-survey-demo:local
```

Then check:

```text
docker-data/results/<sessionId>/survey_answers.json
docker-data/question_videos/<sessionId>/
```

The Dockerfile uses a multi-stage build:

- A Node stage installs `client/` dependencies and runs the Vite production build.
- A Python 3.11 slim stage installs CPU-only PyTorch wheels from `https://download.pytorch.org/whl/cpu`.
- Flask/gunicorn serves both the built React app and the API from `0.0.0.0:7860`.

This is a research/demo project. When you run it locally with Docker, webcam image/video processing is handled by the local Flask container for the existing prediction and research flow; the Docker packaging does not change the app's current consent, storage, privacy, or API behavior.

## Local Development Without Docker

Use this path only if you want separate frontend and backend development servers.

### Backend setup

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

### Frontend setup

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

## Docker Troubleshooting

If the model file is missing or only a small Git LFS pointer file, install Git LFS and run:

```bash
git lfs pull
git lfs checkout
```

If `docker run` says the container name is already in use, remove the stopped container or choose a different name:

```bash
docker rm fer-demo
docker run --rm -p 7860:7860 --name fer-demo multimodal-survey-demo:local
```

If port `7860` is already in use, either stop the other service or map a different local port:

```bash
docker run --rm -p 7861:7860 --name fer-demo multimodal-survey-demo:local
```

Then open `http://localhost:7861/`.

If `docker build` fails, fix the build error before running the image. The image tag is only created after a successful build:

```bash
docker build -t multimodal-survey-demo:local . && docker run --rm -p 7860:7860 --name fer-demo multimodal-survey-demo:local
```

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

## Model File and Git LFS

This project depends on the model file:

```text
torchscript_model_0_66_49_wo_gl.pth
```

The model file is stored with Git LFS because it is too large to be handled as a normal Git file. Before building the Docker image, make sure Git LFS is installed and the real model file has been downloaded:

```bash
git lfs install
git lfs pull
git lfs checkout
ls -lh torchscript_model_0_66_49_wo_gl.pth
```

The file should be visible in the project root directory and should be around 94 MB. The Dockerfile also checks the file size during the build so a missing LFS download fails early.

## Hugging Face Research Deployment Notes

This Docker setup keeps the full ENGE817 research workflow, including survey saving and stress-question webcam video saving. It is therefore different from a public technology demo.

For Docker Spaces, the container serves both the built React client and the Flask API on port `7860`:

```bash
docker build -t multimodal-survey-research:local .
docker run --rm -p 7860:7860 --name fer-research-demo multimodal-survey-research:local
```

Then open:

```text
http://localhost:7860/
```

The hosted Docker entrypoint uses:

```text
gunicorn --bind 0.0.0.0:7860 --workers 1 --timeout 180 app_research_space:app
```

### Data Storage Warning

The Flask app writes research outputs to:

- `uploads/`
- `results/`
- `question_videos/`

In local development these folders are created under the project root. In the Docker Space wrapper, they are created under `APP_DATA_DIR`, which defaults to `/data`.

Do not rely on the default free Hugging Face Space filesystem for participant data collection. The default Space disk is ephemeral and may be lost when the Space restarts. For real data collection, attach persistent storage such as a Hugging Face Storage Bucket mounted at `/data`, or set `APP_DATA_DIR` to another durable mounted path before starting the app.

Before collecting real participant data, also confirm consent wording, ethics approval, access controls, retention rules, and whether the Space should be private or protected rather than public.

## Notes

- This prototype is intended for local research/demo use.
- The Flask app runs in debug mode when started locally with `python API.py`.
- For production deployment, disable debug mode, restrict upload handling, and add appropriate authentication and data protection controls.

## License

This project is released under the MIT License. See `LICENSE` for details.
