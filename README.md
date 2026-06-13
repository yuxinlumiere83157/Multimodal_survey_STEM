---
title: Multimodal Survey STEM Emotion Demo
emoji: 🙂
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
short_description: Webcam emotion demo (no data stored).
---

# Multimodal Survey STEM Emotion Demo

This is a facial-emotion-recognition technology demo. The browser captures one webcam snapshot; the server runs MediaPipe FaceMesh face detection plus a TorchScript emotion model and returns the predicted emotion (Neutral, Happiness, Sadness, Surprise, Fear, Disgust, or Anger), a confidence score, and a face bounding box.

This is a technology demonstration. Images are processed in memory only and are NOT stored. No survey responses or personal data are collected.

Free Spaces sleep after about 48 hours idle; the first request after sleep may take 30-60 seconds to wake and load the model. Emotion model: see Acknowledgements below.

## Runtime

- Hugging Face Docker Space (`sdk: docker`) on port `7860`.
- Flask + gunicorn serves both the Vite client and JSON API from one container.
- CPU-only PyTorch is installed from `https://download.pytorch.org/whl/cpu`.
- The model is loaded once at startup from `torchscript_model_0_66_49_wo_gl.pth`.
- The public inference path is a single-image snapshot request; video upload, survey submission, and participant-data persistence are removed.

## Local Docker

```powershell
npm.cmd --prefix client install
# The Dockerfile also builds the client; this local build is optional for quick checks.
npm.cmd --prefix client run build
docker build -t multimodal-survey-demo:local .
docker run --rm -p 7860:7860 --name fer-demo multimodal-survey-demo:local
```

Open `http://localhost:7860/` and use the capture button to analyze one webcam frame.

## API

`POST /api/predict`

Accepts either JSON `{ "image": "data:image/jpeg;base64,..." }` or multipart form-data with file field `image`. Returns:

```json
{
  "emotion": "Neutral",
  "confidence": 0.81,
  "box": [335, 220, 714, 637],
  "face_detected": true
}
```

If no face is detected, the endpoint returns HTTP 200 with `face_detected: false` and null result fields.

## Acknowledgements / Model Attribution

The emotion model is a TorchScript conversion from Elena Ryumina's EMO-AffectNetModel project: https://github.com/ElenaRyumina/EMO-AffectNetModel. The upstream repository is MIT-licensed and describes the shared models as for scientific usage only. This demo is therefore presented as a non-commercial research/technology demonstration.

Please cite:

Ryumina, E., Dresvyanskiy, D., & Karpov, A. (2022). "In Search of a Robust Facial Expressions Recognition Model: A Large-Scale Visual Cross-Corpus Study." Neurocomputing. https://doi.org/10.1016/j.neucom.2022.10.013

The model was fine-tuned on AffectNet, so public use should retain the scientific/research framing and attribution.
