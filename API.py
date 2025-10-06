from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import cv2
import mediapipe as mp
import math
import numpy as np
import torch
from PIL import Image
from torchvision import transforms
import base64
import io
import os
import json
import time
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration
UPLOAD_FOLDER = 'uploads'
RESULT_FOLDER = 'results'
QUESTION_VIDEOS_FOLDER = 'question_videos'
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'webm'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(RESULT_FOLDER, exist_ok=True)
os.makedirs(QUESTION_VIDEOS_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['RESULT_FOLDER'] = RESULT_FOLDER
app.config['QUESTION_VIDEOS_FOLDER'] = QUESTION_VIDEOS_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size

# Initialize model and face mesh
mp_face_mesh = mp.solutions.face_mesh
name = '0_66_49_wo_gl'
pth_model = torch.jit.load(f'torchscript_model_{name}.pth')
pth_model.eval()
DICT_EMO = {0: 'Neutral', 1: 'Happiness', 2: 'Sadness', 3: 'Surprise', 4: 'Fear', 5: 'Disgust', 6: 'Anger'}


# Helper functions
def pth_processing(fp):
    class PreprocessInput(torch.nn.Module):
        def __init__(self):
            super(PreprocessInput, self).__init__()

        def forward(self, x):
            x = x.to(torch.float32)
            x = torch.flip(x, dims=(0,))
            x[0, :, :] -= 91.4953
            x[1, :, :] -= 103.8827
            x[2, :, :] -= 131.0912
            return x

    def get_img_torch(img):
        ttransform = transforms.Compose([
            transforms.PILToTensor(),
            PreprocessInput()
        ])
        img = img.resize((224, 224), Image.Resampling.NEAREST)
        img = ttransform(img)
        img = torch.unsqueeze(img, 0)
        return img

    return get_img_torch(fp)


def norm_coordinates(normalized_x, normalized_y, image_width, image_height):
    x_px = min(math.floor(normalized_x * image_width), image_width - 1)
    y_px = min(math.floor(normalized_y * image_height), image_height - 1)
    return x_px, y_px


def get_box(fl, w, h):
    idx_to_coors = {}
    for idx, landmark in enumerate(fl.landmark):
        landmark_px = norm_coordinates(landmark.x, landmark.y, w, h)
        if landmark_px:
            idx_to_coors[idx] = landmark_px
    x_min = np.min(np.asarray(list(idx_to_coors.values()))[:, 0])
    y_min = np.min(np.asarray(list(idx_to_coors.values()))[:, 1])
    endX = np.max(np.asarray(list(idx_to_coors.values()))[:, 0])
    endY = np.max(np.asarray(list(idx_to_coors.values()))[:, 1])
    (startX, startY) = (max(0, x_min), max(0, y_min))
    (endX, endY) = (min(w - 1, endX), min(h - 1, endY))
    return startX, startY, endX, endY


def display_EMO_PRED(img, box, label='', line_width=2):
    lw = line_width or max(round(sum(img.shape) / 2 * 0.003), 2)
    text2_color = (255, 0, 255)
    p1, p2 = (int(box[0]), int(box[1])), (int(box[2]), int(box[3]))
    cv2.rectangle(img, p1, p2, text2_color, thickness=lw, lineType=cv2.LINE_AA)
    font = cv2.FONT_HERSHEY_SIMPLEX
    tf = max(lw - 1, 1)
    text_fond = (0, 0, 0)
    text_width_2, text_height_2 = cv2.getTextSize(label, font, lw / 3, tf)
    text_width_2 = text_width_2[0] + round(((p2[0] - p1[0]) * 10) / 360)
    center_face = p1[0] + round((p2[0] - p1[0]) / 2)
    cv2.putText(img, label,
                (center_face - round(text_width_2 / 2), p1[1] - round(((p2[0] - p1[0]) * 20) / 360)), font,
                lw / 3, text_fond, thickness=tf, lineType=cv2.LINE_AA)
    cv2.putText(img, label,
                (center_face - round(text_width_2 / 2), p1[1] - round(((p2[0] - p1[0]) * 20) / 360)), font,
                lw / 3, text2_color, thickness=tf, lineType=cv2.LINE_AA)
    return img


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# API Endpoints
@app.route('/', methods=['GET'])
def index():
    """Root endpoint"""
    return jsonify({
        'message': 'Emotion Recognition API',
        'version': '1.0',
        'endpoints': {
            'health': '/api/health',
            'analyze_frame': '/api/analyze-frame (POST)',
            'analyze_video': '/api/analyze-video (POST)',
            'download': '/api/download/<filename> (GET)',
            'emotions': '/api/emotions (GET)'
        }
    })


@app.route('/api/health', methods=['GET'])
def health_check():
    """Check if the API is running"""
    return jsonify({'status': 'healthy', 'message': 'Emotion Recognition API is running'})


@app.route('/api/analyze-frame', methods=['POST'])
def analyze_frame():
    """Analyze a single frame (base64 encoded image)"""
    try:
        data = request.json
        if 'image' not in data:
            return jsonify({'error': 'No image data provided'}), 400

        # Decode base64 image
        image_data = base64.b64decode(data['image'].split(',')[1] if ',' in data['image'] else data['image'])
        nparr = np.frombuffer(image_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        h, w = frame.shape[:2]
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        results_list = []

        with mp_face_mesh.FaceMesh(
                max_num_faces=5,
                refine_landmarks=False,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5) as face_mesh:

            results = face_mesh.process(frame_rgb)

            if results.multi_face_landmarks:
                for fl in results.multi_face_landmarks:
                    startX, startY, endX, endY = get_box(fl, w, h)
                    cur_face = frame_rgb[startY:endY, startX:endX]

                    if cur_face.size > 0:
                        cur_face_tensor = pth_processing(Image.fromarray(cur_face))
                        output = torch.nn.functional.softmax(pth_model(cur_face_tensor), dim=1).cpu().detach().numpy()
                        cl = np.argmax(output)
                        confidence = float(output[0][cl])
                        label = DICT_EMO[cl]

                        # Draw on frame
                        frame = display_EMO_PRED(frame, (startX, startY, endX, endY), label, line_width=3)

                        results_list.append({
                            'emotion': label,
                            'confidence': confidence,
                            'box': [int(startX), int(startY), int(endX), int(endY)],
                            'probabilities': {DICT_EMO[i]: float(output[0][i]) for i in range(len(DICT_EMO))}
                        })

        # Encode processed frame
        _, buffer = cv2.imencode('.jpg', frame)
        processed_image = base64.b64encode(buffer).decode('utf-8')

        return jsonify({
            'success': True,
            'faces': results_list,
            'processed_image': f'data:image/jpeg;base64,{processed_image}'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analyze-video', methods=['POST'])
def analyze_video():
    """Analyze an uploaded video file"""
    try:
        if 'video' not in request.files:
            return jsonify({'error': 'No video file provided'}), 400

        file = request.files['video']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Allowed types: mp4, avi, mov, webm'}), 400

        filename = secure_filename(file.filename)
        input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(input_path)

        # Process video
        output_filename = f'processed_{filename}'
        output_path = os.path.join(app.config['RESULT_FOLDER'], output_filename)

        cap = cv2.VideoCapture(input_path)
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)

        vid_writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))

        frame_emotions = []

        with mp_face_mesh.FaceMesh(
                max_num_faces=1,
                refine_landmarks=False,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5) as face_mesh:

            frame_count = 0
            while cap.isOpened():
                success, frame = cap.read()
                if not success:
                    break

                frame_copy = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = face_mesh.process(frame_copy)

                if results.multi_face_landmarks:
                    for fl in results.multi_face_landmarks:
                        startX, startY, endX, endY = get_box(fl, w, h)
                        cur_face = frame_copy[startY:endY, startX:endX]

                        if cur_face.size > 0:
                            cur_face_tensor = pth_processing(Image.fromarray(cur_face))
                            output = torch.nn.functional.softmax(pth_model(cur_face_tensor),
                                                                 dim=1).cpu().detach().numpy()
                            cl = np.argmax(output)
                            label = DICT_EMO[cl]

                            frame = display_EMO_PRED(frame, (startX, startY, endX, endY), label, line_width=3)
                            frame_emotions.append({'frame': frame_count, 'emotion': label})

                vid_writer.write(frame)
                frame_count += 1

        vid_writer.release()
        cap.release()

        # Calculate emotion statistics
        emotion_counts = {}
        for fe in frame_emotions:
            emotion_counts[fe['emotion']] = emotion_counts.get(fe['emotion'], 0) + 1

        return jsonify({
            'success': True,
            'output_file': output_filename,
            'total_frames': frame_count,
            'frames_with_faces': len(frame_emotions),
            'emotion_statistics': emotion_counts,
            'download_url': f'/api/download/{output_filename}'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/download/<filename>', methods=['GET'])
def download_file(filename):
    """Download processed video"""
    try:
        file_path = os.path.join(app.config['RESULT_FOLDER'], filename)
        if os.path.exists(file_path):
            return send_file(file_path, as_attachment=True)
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/emotions', methods=['GET'])
def get_emotions():
    """Get list of available emotions"""
    return jsonify({'emotions': list(DICT_EMO.values())})


    
@app.route('/api/save-survey-answers', methods=['POST'])
def save_survey_answers():
    """Save user's survey answers."""
    try:
        import json
        import time
        data = request.get_json()
        session_id = data.get('sessionId')
        answers = data.get('answers')  # {questionId: answerText}

        # If session_id is missing or empty, use timestamp
        if not session_id:
            session_id = str(int(time.time()))

        if not answers or not isinstance(answers, dict):
            return jsonify({'error': 'Answers must be provided as a dictionary'}), 400

        def map_answer(ans):
            # 5-point scale, leftmost=5, rightmost=1
            if ans in ["Always", "Extremely in touch", "Full trust", "Extremely satisfied", "Very good", "All the time", "Extremely unbothered", "Full control"]:
                return 5
            elif ans in ["Often", "In touch", "Lots of trust", "Satisfied", "Good", "Most of the time", "Unbothered", "Lots of control"]:
                return 4
            elif ans in ["Sometimes", "Neutral", "Fair", "About half of the time", "Neutral"]:
                return 3
            elif ans in ["Rarely", "Out of touch", "Little trust", "Dissatisfied", "Poor", "Some of the time", "Bothered", "Little control"]:
                return 2
            elif ans in ["Never", "Extremely out of touch", "No trust", "Extremely dissatisfied", "Very poor", "None of the time", "Extremely bothered", "No control"]:
                return 1
            else:
                return None

        int_answers = {str(qid): map_answer(ans) for qid, ans in answers.items()}

        # Create session folder in results if not exists
        session_folder = os.path.join(app.config['RESULT_FOLDER'], str(session_id))
        os.makedirs(session_folder, exist_ok=True)

        # Save answers to JSON file
        answers_path = os.path.join(session_folder, 'survey_answers.json')
        with open(answers_path, 'w') as f:
            json.dump({
                'sessionId': session_id,
                'answers': int_answers
            }, f, indent=2)

        return jsonify({
            'success': True,
            'message': 'Survey answers saved successfully',
            'sessionId': session_id,
            'answersPath': answers_path
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500



@app.route('/api/save-question-video', methods=['POST'])
def save_question_video():
    """Save video recording for a specific question with emotion data"""
    try:
        if 'video' not in request.files:
            return jsonify({'error': 'No video file provided'}), 400

        video_file = request.files['video']
        question_id = request.form.get('questionId')
        emotion = request.form.get('emotion', 'Unknown')
        emotion_data = request.form.get('emotionData', '[]')
        session_id = request.form.get('sessionId')
        chunk_index = request.form.get('chunkIndex')
        is_last_chunk = request.form.get('isLastChunk', 'true').lower() == 'true'

        if not question_id:
            return jsonify({'error': 'Question ID is required'}), 400

        # Generate session ID if not provided
        if not session_id:
            session_id = str(int(time.time()))

        # Create session folder
        session_folder = os.path.join(app.config['QUESTION_VIDEOS_FOLDER'], session_id)
        os.makedirs(session_folder, exist_ok=True)

        # FIXED: Use consistent .webm extension
        base_filename = f'question_{question_id}_{emotion}'
        video_path = os.path.join(session_folder, base_filename + '.webm')

        # Log file size for debugging
        video_file.seek(0, 2)  # Seek to end
        file_size = video_file.tell()
        video_file.seek(0)  # Reset to beginning
        print(f"Receiving video file: {file_size} bytes for question {question_id}")

        if chunk_index is not None:
            # Chunked upload - append to file
            with open(video_path, 'ab') as f:
                chunk_data = video_file.read()
                f.write(chunk_data)
                print(f"Wrote chunk {chunk_index}: {len(chunk_data)} bytes")
        else:
            # FIXED: Full file upload - save directly (don't use video_file.save())
            # This ensures we have full control over the write operation
            with open(video_path, 'wb') as f:
                video_data = video_file.read()
                f.write(video_data)
                print(f"Wrote complete file: {len(video_data)} bytes")

        # Save emotion JSON when done
        if is_last_chunk or chunk_index is None:
            emotion_filename = f'question_{question_id}_emotions.json'
            emotion_path = os.path.join(session_folder, emotion_filename)

            emotion_timeline = []
            try:
                emotion_timeline = json.loads(emotion_data) if emotion_data else []
            except json.JSONDecodeError:
                print(f"Warning: Could not parse emotion data: {emotion_data}")

            with open(emotion_path, 'w') as f:
                json.dump({
                    'questionId': question_id,
                    'dominantEmotion': emotion,
                    'emotionTimeline': emotion_timeline,
                    'videoSize': os.path.getsize(video_path)  # Add file size for verification
                }, f, indent=2)

            print(f"Saved emotion data and video (size: {os.path.getsize(video_path)} bytes)")

            return jsonify({
                'success': True,
                'message': 'Video saved successfully',
                'sessionId': session_id,
                'videoPath': video_path,
                'dominantEmotion': emotion,
                'videoSize': os.path.getsize(video_path)
            })

        # Not last chunk
        return jsonify({
            'success': True,
            'message': f'Chunk {chunk_index} saved',
            'sessionId': session_id
        })

    except Exception as e:
        print(f"Error saving video: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze-survey-results', methods=['POST'])
def analyze_survey_results():
    """
    Analyze survey results by comparing questionnaire answers with detected emotions.
    Returns both the questionnaire-based result and AI-analyzed result with confidence scores.
    """
    try:
        data = request.get_json()
        session_id = data.get('sessionId')
        answers = data.get('answers')  # {questionId: answerText}

        if not session_id or not answers:
            return jsonify({'error': 'sessionId and answers are required'}), 400

        # === 1. Calculate Questionnaire-Based Result ===
        def map_answer_to_score(ans):
            """Map answer text to 1-5 scale (5=positive, 1=negative)"""
            if ans in ["Always", "Extremely in touch", "Full trust", "Extremely satisfied", "Very good", "All the time", "Extremely unbothered", "Full control"]:
                return 5
            elif ans in ["Often", "In touch", "Lots of trust", "Satisfied", "Good", "Most of the time", "Unbothered", "Lots of control"]:
                return 4
            elif ans in ["Sometimes", "Neutral", "Fair", "About half of the time"]:
                return 3
            elif ans in ["Rarely", "Out of touch", "Little trust", "Dissatisfied", "Poor", "Some of the time", "Bothered", "Little control"]:
                return 2
            elif ans in ["Never", "Extremely out of touch", "No trust", "Extremely dissatisfied", "Very poor", "None of the time", "Extremely bothered", "No control"]:
                return 1
            else:
                return 3  # Default to neutral

        scores = [map_answer_to_score(ans) for ans in answers.values()]
        avg_score = sum(scores) / len(scores) if scores else 3

        # Determine questionnaire result and confidence
        if avg_score >= 4.0:
            questionnaire_result = "Happy"
            questionnaire_confidence = min(((avg_score - 4.0) / 1.0) * 50 + 50, 100)
        elif avg_score >= 3.0:
            questionnaire_result = "Neutral"
            questionnaire_confidence = 100 - abs(avg_score - 3.5) * 50
        else:
            questionnaire_result = "Unhappy"
            questionnaire_confidence = min(((3.0 - avg_score) / 2.0) * 50 + 50, 100)

        # === 2. Analyze Emotion Data from Videos ===
        session_folder = os.path.join(app.config['QUESTION_VIDEOS_FOLDER'], str(session_id))

        if not os.path.exists(session_folder):
            return jsonify({'error': 'Session data not found'}), 404

        # Collect all emotion data
        all_emotions = []
        emotion_files = [f for f in os.listdir(session_folder) if f.endswith('_emotions.json')]

        for emotion_file in emotion_files:
            with open(os.path.join(session_folder, emotion_file), 'r') as f:
                emotion_info = json.load(f)
                timeline = emotion_info.get('emotionTimeline', [])
                all_emotions.extend([e['emotion'] for e in timeline])

        # Count emotions
        emotion_counts = {}
        for emotion in all_emotions:
            emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1

        total_samples = len(all_emotions)

        # Calculate emotion percentages
        emotion_percentages = {
            emotion: (count / total_samples * 100) if total_samples > 0 else 0
            for emotion, count in emotion_counts.items()
        }

        # Classify emotions as positive, neutral, or negative
        positive_emotions = ['Happiness', 'Surprise']
        neutral_emotions = ['Neutral']
        negative_emotions = ['Sadness', 'Fear', 'Disgust', 'Anger']

        positive_pct = sum(emotion_percentages.get(e, 0) for e in positive_emotions)
        neutral_pct = sum(emotion_percentages.get(e, 0) for e in neutral_emotions)
        negative_pct = sum(emotion_percentages.get(e, 0) for e in negative_emotions)

        # Determine AI-analyzed result
        if positive_pct > negative_pct and positive_pct > neutral_pct:
            ai_result = "Happy"
            ai_confidence = min(positive_pct, 100)
        elif negative_pct > positive_pct and negative_pct > neutral_pct:
            ai_result = "Unhappy"
            ai_confidence = min(negative_pct, 100)
        else:
            ai_result = "Neutral"
            ai_confidence = min(neutral_pct, 100)

        # === 3. Detect Discrepancy ===
        discrepancy_detected = questionnaire_result != ai_result

        # Calculate discrepancy severity (0-100)
        discrepancy_score = 0
        if discrepancy_detected:
            # High discrepancy if results are opposite (Happy vs Unhappy)
            if (questionnaire_result == "Happy" and ai_result == "Unhappy") or \
               (questionnaire_result == "Unhappy" and ai_result == "Happy"):
                discrepancy_score = 100
            else:
                # Moderate discrepancy if one is Neutral
                discrepancy_score = 50

        return jsonify({
            'success': True,
            'questionnaire': {
                'result': questionnaire_result,
                'confidence': round(questionnaire_confidence, 2),
                'averageScore': round(avg_score, 2)
            },
            'ai_analysis': {
                'result': ai_result,
                'confidence': round(ai_confidence, 2),
                'emotion_breakdown': {
                    'positive': round(positive_pct, 2),
                    'neutral': round(neutral_pct, 2),
                    'negative': round(negative_pct, 2)
                },
                'emotion_counts': emotion_counts,
                'total_samples': total_samples
            },
            'discrepancy': {
                'detected': discrepancy_detected,
                'severity': discrepancy_score,
                'message': f"Your questionnaire suggests you are {questionnaire_result.lower()}, but your facial expressions during the survey suggest you might be {ai_result.lower()}." if discrepancy_detected else "Your answers align with your emotional expressions."
            }
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5006)