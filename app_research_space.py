import os

from flask import jsonify, send_from_directory

from API import app


def _configure_storage():
    data_root = os.environ.get("APP_DATA_DIR")
    if not data_root:
        data_root = "/data" if os.path.isdir("/data") else os.getcwd()

    folders = {
        "UPLOAD_FOLDER": os.path.join(data_root, "uploads"),
        "RESULT_FOLDER": os.path.join(data_root, "results"),
        "QUESTION_VIDEOS_FOLDER": os.path.join(data_root, "question_videos"),
    }

    for folder in folders.values():
        os.makedirs(folder, exist_ok=True)

    app.config.update(folders)


_configure_storage()

_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "client", "dist")


@app.route("/<path:path>", endpoint="_space_client_path")
def _serve_client(path=""):
    if path.startswith("api/"):
        return jsonify({"error": "API route not found"}), 404

    full = os.path.join(_DIST, path)
    if path and os.path.isfile(full):
        return send_from_directory(_DIST, path)
    return send_from_directory(_DIST, "index.html")


app.view_functions["index"] = _serve_client
