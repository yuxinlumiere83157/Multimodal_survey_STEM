import base64
import os

import cv2
import numpy as np
import torch
from flask import jsonify, request, send_from_directory
from PIL import Image

# Importing API runs torch.jit.load against a relative path, so the process
# CWD must contain the .pth. In the container WORKDIR is /app and the model
# is copied there; locally, run/import from the repo root.
from API import DICT_EMO, app, get_box, mp_face_mesh, pth_model, pth_processing


_face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)

_NO_FACE = {
    "emotion": None,
    "confidence": None,
    "box": None,
    "face_detected": False,
}


def _decode_image_to_bgr():
    """Accept JSON {"image": "..."} or multipart file field "image"."""
    raw = None
    if request.files.get("image") is not None:
        raw = request.files["image"].read()
    else:
        data = request.get_json(silent=True) or {}
        image = data.get("image")
        if image:
            if "," in image:
                image = image.split(",", 1)[1]
            raw = base64.b64decode(image)

    if not raw:
        return None

    arr = np.frombuffer(raw, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        frame = _decode_image_to_bgr()
        if frame is None:
            return jsonify({"error": "No decodable image provided"}), 400

        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = _face_mesh.process(rgb)

        if not results.multi_face_landmarks:
            return jsonify(_NO_FACE), 200

        fl = results.multi_face_landmarks[0]
        startX, startY, endX, endY = get_box(fl, w, h)
        crop = rgb[startY:endY, startX:endX]
        if crop.size == 0:
            return jsonify(_NO_FACE), 200

        tensor = pth_processing(Image.fromarray(crop))
        with torch.no_grad():
            out = torch.nn.functional.softmax(pth_model(tensor), dim=1).cpu().numpy()

        cl = int(np.argmax(out))
        return jsonify(
            {
                "emotion": DICT_EMO[cl],
                "confidence": float(out[0][cl]),
                "box": [int(startX), int(startY), int(endX), int(endY)],
                "face_detected": True,
            }
        ), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "client", "dist")


@app.route("/<path:path>", endpoint="_spa_path")
def _serve_client(path=""):
    full = os.path.join(_DIST, path)
    if path and os.path.isfile(full):
        return send_from_directory(_DIST, path)
    return send_from_directory(_DIST, "index.html")


# Replace API.py's GET "/" JSON view while keeping Flask's existing root rule.
app.view_functions["index"] = _serve_client
