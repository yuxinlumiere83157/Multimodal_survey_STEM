# CS705 Group 7 - Real‑Time Survey Emotion Recognition System

## Overview

This project is a multimodal emotion‑recognition project consisting of a Python/Flask API and a React front‑end. The system uses Google’s MediaPipe to detect faces and extract facial landmarks, and a pre‑trained PyTorch model (packaged as a TorchScript file) to classify expressions into seven emotions: neutral, happiness, sadness, surprise, fear, disgust and anger. The API supports both single‑frame and video analysis and is designed to run locally for research or demonstration purposes. A web user interface allows participants to answer a questionnaire while their facial expressions are recorded and analysed.

## Features

- **Real‑time face detection and emotion classification** – The system detects faces in each frame and crops the facial region for analysis. The cropped face is then fed to a TorchScript model trained to recognise facial emotions; predictions include per‑emotion probabilities and bounding boxes.
- **Video and frame analysis APIs** – REST endpoints allow clients to analyse a single image frame (as base64) or an uploaded video. The API returns the detected emotions for each face along with a processed image or a processed video file.
- **Session‑based video recording** – When used with the provided front‑end, each survey question records a short video. Each video is saved alongside JSON metadata describing the dominant emotion and an emotion timeline. Files are organised by session ID for easy retrieval.
- **Survey integration** – Additional endpoints permit saving Likert‑scale questionnaire responses. Responses are mapped to numerical scores and stored with the session.
- **Cross‑origin support** – CORS is enabled by default so the API can be accessed from a locally hosted web application.

## Architecture

The system is divided into two components:

| Component | Description |
| --- | --- |
| **Flask API (`API.py`)** | Implements REST endpoints for health checking, analysing a single frame (`/api/analyse‑frame`), analysing uploaded videos (`/api/analyse‑video`), saving question‑specific videos (`/api/save‑question‑video`), saving survey responses (`/api/save‑survey‑answers`), and downloading processed videos.  It uses MediaPipe Face Mesh for face detection and a TorchScript model for emotion classification. |
| **React Front‑end (`client/`)** | Provides user pages for consent, webcam preview, questionnaire, review and summary.  It uses the browser’s MediaRecorder API to capture video snippets while participants answer questions.  Every 500 ms it sends a frame to the `/api/analyse‑frame` endpoint to obtain the current emotion and displays it in the UI. |

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/SauravK12/705_backend.git
cd 705_backend
```

### 2. Back‑end setup

1. Create a Python virtual environment and install dependencies:
    
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    
    ```
    
2. Start the Flask server:
    
    ```bash
    python API.py
    
    ```
    
    By default the server runs in debug mode on `http://localhost:5006`.  You should see a JSON message at the root endpoint confirming that the *Emotion Recognition API* is running.
    

### 3. Front‑end setup

The front‑end uses React and Vite.  To start it:

```bash
cd client
npm install
npm run dev

```

Vite will serve the application at `http://localhost:5173`.  Ensure the back‑end is running so that API calls succeed.

## PyCharm Setup (Windows PowerShell Users)

If you are using PyCharm on Windows and encounter permission issues when running the Flask server (for example, when the terminal blocks script execution), open PowerShell and temporarily allow script execution with:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
---

The response includes a list of detected faces, each with the predicted emotion, confidence scores for all emotions, the bounding box coordinates, and a processed image annotated with bounding boxes and labels.  Emotion labels correspond to the seven categories noted above.

### Analysing a video

Upload a video file via a multipart/form‑data POST request to `/api/analyze-video` with the `video` field.  Accepted formats include `.mp4`, `.avi`, `.mov` and `.webm`.  The server processes each frame, annotates detected faces with emotions, saves a processed video to the `results/` folder, and returns statistics such as the number of frames processed, how many frames contained faces, a histogram of detected emotions and a download link to the processed file.

### Saving questionnaire videos and responses

When used with the questionnaire interface, each call to `/api/save-question-video` uploads a WebM recording for a specific question along with its dominant emotion and the full emotion timeline.  Videos are stored in `question_videos/{sessionId}/` and named `question_{questionId}_{emotion}.webm`.  An accompanying JSON file `question_{questionId}_emotions.json` stores the dominant emotion, emotion timeline and file size.  The `/api/save-survey-answers` endpoint stores Likert‑scale responses, mapping textual answers (“Always”, “Often”, etc.) to numerical scores.

## Emotion Categories

The underlying model recognises the following emotions.  These classes are widely used in facial expression research and originate from the FER/FER+ datasets:

| Label | Description |
| --- | --- |
| **Neutral** | No strong emotional expression; serves as a baseline. |
| **Happiness** | Indicates joy or satisfaction. |
| **Sadness** | Reflects sorrow or disappointment. |
| **Surprise** | Expression of amazement or astonishment. |
| **Fear** | Displays apprehension or distress. |
| **Disgust** | Reaction to unpleasant stimuli. |
| **Anger** | Shows irritation or hostility. |

## Data Storage

- **`uploads/`** – Temporary storage for uploaded raw videos.
- **`results/`** – Contains processed videos and survey answer files. When analysing a video with `/api/analyze-video`, the processed video will be saved here. Survey answers are stored as JSON files inside session‑specific folders.
- **`question_videos/`** – Stores question‑specific videos and emotion metadata. The front‑end writes to this folder when saving per‑question recordings.

## Customisation & Extensions

- **Model replacement** – The current model `torchscript_model_0_66_49_wo_gl.pth` can be replaced with any TorchScript model that accepts 224×224 RGB images and outputs probabilities over the seven emotion classes. To train or convert your own PyTorch model to TorchScript, see the PyTorch documentation.
- **Multiple faces** – The frame analysis endpoint supports detection of up to five faces; the video analysis endpoint processes a single face to reduce computational load.
- **Deployment considerations** – The API is configured for development use. For production deployment behind a reverse proxy, disable debug mode, restrict allowed file sizes and implement authentication as needed.

## License

This project is released under the MIT License.  See the LICENSE file for more details.