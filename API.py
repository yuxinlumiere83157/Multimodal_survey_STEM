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
import re
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


INSTRUMENT_NAME = "ENGE817_stress_SUS_trust_privacy_reflection"
STRESS_QUESTION_IDS = {"1", "2", "3", "4", "5", "6"}
STRESS_REVERSE_IDS = {"4", "5"}


def extract_numeric_response(answer):
    """Extract the leading numeric response from Likert strings such as '4 - Agree'."""
    if answer is None:
        return None
    match = re.search(r'\d+(?:\.\d+)?', str(answer))
    return float(match.group(0)) if match else None


def average(values):
    return round(sum(values) / len(values), 2) if values else 0


def question_lookup_from_payload(questions):
    lookup = {}
    if isinstance(questions, list):
        for question in questions:
            if isinstance(question, dict) and question.get('id') is not None:
                lookup[str(question.get('id'))] = question
    return lookup


def get_question_meta(question_id, lookup):
    question_id = str(question_id)
    if question_id in lookup:
        return lookup[question_id]
    if question_id in STRESS_QUESTION_IDS:
        return {
            'id': int(question_id),
            'category': 'Momentary Stress',
            'construct': 'stress',
            'reverse': question_id in STRESS_REVERSE_IDS,
            'type': 'likert',
            'question': f'Question {question_id}'
        }
    return {
        'id': int(question_id) if question_id.isdigit() else question_id,
        'category': '',
        'construct': '',
        'reverse': False,
        'type': '',
        'question': f'Question {question_id}'
    }


def score_enge817_answers(answers, questions):
    raw_answers = {str(qid): answer for qid, answer in answers.items() if str(qid) != 'sessionId'}
    lookup = question_lookup_from_payload(questions)
    scored_answers = {}
    stress_scores = []
    sus_contributions = []
    trust_privacy_scores = []
    reflection_answers = {}

    question_ids = set(raw_answers.keys()) | set(lookup.keys())
    for question_id in sorted(question_ids, key=lambda value: int(value) if str(value).isdigit() else str(value)):
        question = get_question_meta(question_id, lookup)
        answer = raw_answers.get(str(question_id))
        construct = question.get('construct')
        question_type = question.get('type')

        if answer is None:
            continue

        if question_type == 'text' or construct == 'reflection':
            reflection_answers[str(question_id)] = {
                'question': question.get('question', ''),
                'answer': str(answer)
            }
            continue

        numeric = extract_numeric_response(answer)
        if numeric is None:
            continue

        score = None
        if construct == 'stress':
            score = 4 - numeric if question.get('reverse') else numeric
            stress_scores.append(score)
        elif construct == 'sus':
            score = 5 - numeric if question.get('reverse') else numeric - 1
            sus_contributions.append(score)
        elif construct == 'trust_privacy':
            score = 6 - numeric if question.get('reverse') else numeric
            trust_privacy_scores.append(score)

        scored_answers[str(question_id)] = {
            'question': question.get('question', ''),
            'category': question.get('category', ''),
            'construct': construct,
            'reverse': bool(question.get('reverse')),
            'rawAnswer': answer,
            'numeric': numeric,
            'score': round(score, 2) if score is not None else None
        }

    return {
        'rawAnswers': raw_answers,
        'scoredAnswers': scored_answers,
        'summaryScores': {
            'stressAverage_0_to_4': average(stress_scores),
            'susScore_0_to_100': round(sum(sus_contributions) * 2.5, 2) if sus_contributions else 0,
            'trustPrivacyAverage_1_to_5': average(trust_privacy_scores)
        },
        'reflectionAnswers': reflection_answers
    }


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
    """Save ENGE817 study answers and instrument scores."""
    try:
        data = request.get_json()
        session_id = data.get('sessionId')
        answers = data.get('answers')  # {questionId: answerText}
        questions = data.get('questions', [])

        if not session_id:
            session_id = str(int(time.time()))

        if not answers or not isinstance(answers, dict):
            return jsonify({'error': 'Answers must be provided as a dictionary'}), 400

        scored = score_enge817_answers(answers, questions)

        session_folder = os.path.join(app.config['RESULT_FOLDER'], str(session_id))
        os.makedirs(session_folder, exist_ok=True)

        answers_path = os.path.join(session_folder, 'survey_answers.json')
        saved_payload = {
            'sessionId': session_id,
            'instrument': INSTRUMENT_NAME,
            'rawAnswers': scored['rawAnswers'],
            'scoredAnswers': scored['scoredAnswers'],
            'summaryScores': scored['summaryScores'],
            'reflectionAnswers': scored['reflectionAnswers'],
            'questions': questions
        }

        with open(answers_path, 'w') as f:
            json.dump(saved_payload, f, indent=2)

        return jsonify({
            'success': True,
            'message': 'Survey answers saved successfully',
            'sessionId': session_id,
            'answersPath': answers_path,
            'summaryScores': scored['summaryScores']
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


@app.route('/api/save-question-emotions', methods=['POST'])
def save_question_emotions():
    """Save derived browser emotion samples for a specific question without raw video."""
    try:
        data = request.get_json() or {}
        question_id = data.get('questionId')
        emotion = data.get('emotion', 'Unknown')
        emotion_timeline = data.get('emotionData', [])
        session_id = data.get('sessionId')
        source = data.get('source', 'browser-onnx')

        if not question_id:
            return jsonify({'error': 'Question ID is required'}), 400

        if not session_id:
            session_id = str(int(time.time()))

        if not isinstance(emotion_timeline, list):
            emotion_timeline = []

        session_folder = os.path.join(app.config['QUESTION_VIDEOS_FOLDER'], str(session_id))
        os.makedirs(session_folder, exist_ok=True)

        emotion_filename = f'question_{question_id}_emotions.json'
        emotion_path = os.path.join(session_folder, emotion_filename)

        with open(emotion_path, 'w') as f:
            json.dump({
                'questionId': str(question_id),
                'dominantEmotion': emotion,
                'emotionTimeline': emotion_timeline,
                'sampleCount': len(emotion_timeline),
                'source': source,
                'videoStored': False
            }, f, indent=2)

        return jsonify({
            'success': True,
            'message': 'Derived emotion samples saved successfully',
            'sessionId': session_id,
            'emotionPath': emotion_path,
            'dominantEmotion': emotion,
            'sampleCount': len(emotion_timeline),
            'videoStored': False
        })

    except Exception as e:
        print(f"Error saving derived emotion samples: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/analyze-survey-results', methods=['POST'])
def analyze_survey_results():
    """
    Analyze ENGE817 stress self-report against facial emotion data from stress items only.
    """
    try:
        data = request.get_json()
        session_id = data.get('sessionId')
        answers = data.get('answers')  # {questionId: answerText}
        questions = data.get('questions', [])

        if not session_id or not answers:
            return jsonify({'error': 'sessionId and answers are required'}), 400

        scored = score_enge817_answers(answers, questions)
        stress_average = scored['summaryScores']['stressAverage_0_to_4']

        if stress_average >= 3.0:
            stress_level = 'High stress'
        elif stress_average >= 2.0:
            stress_level = 'Moderate stress'
        else:
            stress_level = 'Low stress'

        stress_question_ids = sorted(
            [qid for qid, question in question_lookup_from_payload(questions).items()
             if question.get('construct') == 'stress'],
            key=lambda value: int(value) if str(value).isdigit() else str(value)
        ) or ['1', '2', '3', '4', '5', '6']

        stress_question_ids = [qid for qid in stress_question_ids if qid in STRESS_QUESTION_IDS]
        session_folder = os.path.join(app.config['QUESTION_VIDEOS_FOLDER'], str(session_id))

        all_emotions = []
        valid_files = []
        missing_files = []

        for question_id in ['1', '2', '3', '4', '5', '6']:
            emotion_filename = f'question_{question_id}_emotions.json'
            emotion_path = os.path.join(session_folder, emotion_filename)

            if not os.path.exists(emotion_path):
                missing_files.append(emotion_filename)
                continue

            valid_files.append(emotion_filename)
            with open(emotion_path, 'r') as f:
                emotion_info = json.load(f)
                timeline = emotion_info.get('emotionTimeline', [])
                for item in timeline:
                    emotion = item.get('emotion') if isinstance(item, dict) else None
                    if emotion:
                        all_emotions.append(emotion)

        emotion_counts = {}
        for emotion in all_emotions:
            emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1

        total_samples = len(all_emotions)
        emotion_percentages = {
            emotion: round((count / total_samples * 100), 2) if total_samples > 0 else 0
            for emotion, count in emotion_counts.items()
        }

        positive_emotions = ['Happiness', 'Surprise']
        neutral_emotions = ['Neutral']
        negative_emotions = ['Sadness', 'Fear', 'Disgust', 'Anger']

        positive_pct = round(sum(emotion_percentages.get(e, 0) for e in positive_emotions), 2)
        neutral_pct = round(sum(emotion_percentages.get(e, 0) for e in neutral_emotions), 2)
        negative_pct = round(sum(emotion_percentages.get(e, 0) for e in negative_emotions), 2)

        if total_samples == 0:
            facial_pattern = 'Unavailable'
            discrepancy_detected = False
            comparison_note = 'Facial data unavailable or insufficient.'
        else:
            if negative_pct >= neutral_pct and negative_pct >= positive_pct:
                facial_pattern = 'Mostly negative facial-emotion signals'
            elif positive_pct >= neutral_pct and positive_pct >= negative_pct:
                facial_pattern = 'Mostly positive facial-emotion signals'
            else:
                facial_pattern = 'Mostly neutral facial expressions'

            if stress_level == 'High stress' and neutral_pct >= 50:
                discrepancy_detected = True
                comparison_note = 'High self-reported stress was paired with mostly neutral facial expressions.'
            elif stress_level == 'Low stress' and negative_pct >= 25:
                discrepancy_detected = True
                comparison_note = 'Low self-reported stress was paired with noticeable negative facial-emotion signals.'
            else:
                discrepancy_detected = False
                comparison_note = 'No strong discrepancy detected at session level.'

        return jsonify({
            'success': True,
            'selfReport': {
                'instrument': 'Momentary stress items',
                'stressAverage_0_to_4': stress_average,
                'stressLevel': stress_level,
                'stressQuestionIds': stress_question_ids
            },
            'facialEmotion': {
                'facialPattern': facial_pattern,
                'emotionCounts': emotion_counts,
                'emotionPercentages': emotion_percentages,
                'emotionBreakdown': {
                    'positive': positive_pct,
                    'neutral': neutral_pct,
                    'negative': negative_pct
                },
                'totalSamples': total_samples,
                'validStressQuestionFiles': valid_files,
                'missingStressQuestionFiles': missing_files
            },
            'comparison': {
                'discrepancyDetected': discrepancy_detected,
                'note': comparison_note
            }
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5006)


