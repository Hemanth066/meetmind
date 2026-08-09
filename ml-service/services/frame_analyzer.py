import math
from collections import defaultdict

import cv2
import mediapipe as mp
import numpy as np


class FrameAnalyzer:
    def __init__(self):
        self.mp_face = mp.solutions.face_detection
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_detection = self.mp_face.FaceDetection(min_detection_confidence=0.5)
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._blink_state = defaultdict(lambda: {"ear_history": [], "blink_count": 0})
        self._yawn_state = defaultdict(lambda: {"mar_history": [], "yawn_count": 0})
        self._smile_state = defaultdict(lambda: {"smile_frames": 0})

    def analyze(self, image: np.ndarray, participant_id: str) -> dict:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        h, w = image.shape[:2]

        face_results = self.face_detection.process(rgb)
        mesh_results = self.face_mesh.process(rgb)

        face_detected = bool(face_results.detections) or bool(mesh_results.multi_face_landmarks)
        face_visibility = 0.0
        head_pose_forward = 0.0
        eye_forward = 0.0
        emotions = {"happy": 0, "neutral": 100, "sad": 0, "angry": 0, "surprised": 0}
        blink_count = self._blink_state[participant_id]["blink_count"]
        yawn_count = self._yawn_state[participant_id]["yawn_count"]
        smile_count = self._smile_state[participant_id]["smile_frames"]
        if not face_detected:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            try:
                face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
                faces = face_cascade.detectMultiScale(gray, 1.1, 4)
                if len(faces) > 0:
                    face_detected = True
                    face_visibility = 75.0
                    head_pose_forward = 70.0
                    eye_forward = 70.0
            except Exception:
                pass

        if face_detected:
            if face_results.detections:
                det = face_results.detections[0]
                face_visibility = min(100.0, float(det.score[0]) * 100)
            elif mesh_results.multi_face_landmarks:
                face_visibility = 85.0

            nose = self._landmark(mesh_results, 1)
            left_eye = self._landmark(mesh_results, 33)
            right_eye = self._landmark(mesh_results, 263)
            chin = self._landmark(mesh_results, 152)
            forehead = self._landmark(mesh_results, 10)

            if nose and left_eye and right_eye:
                eye_center_x = (left_eye[0] + right_eye[0]) / 2
                eye_offset = abs(nose[0] - eye_center_x)
                eye_forward = max(0.0, 100.0 - eye_offset * 400)
            elif face_detected:
                eye_forward = 75.0

            if nose and chin and forehead:
                head_pose_forward = self._estimate_head_forward(nose, chin, forehead)
            elif face_detected:
                head_pose_forward = 75.0

            if mesh_results.multi_face_landmarks:
                lm = mesh_results.multi_face_landmarks[0].landmark
                ear = self._eye_aspect_ratio(lm)
                mar = self._mouth_aspect_ratio(lm)
                smile = self._detect_smile(lm)

                blink_count = self._update_blinks(participant_id, ear)
                yawn_count = self._update_yawns(participant_id, mar)
                if smile:
                    smile_count += 1
                    self._smile_state[participant_id]["smile_frames"] = smile_count

                emotions = self._estimate_emotions(lm, smile, mar)

        engagement = self._engagement_from_visuals(
            face_visibility, head_pose_forward, eye_forward, blink_count, smile_count
        )

        if not face_detected:
            attention_status = "No Face Detected / Away"
        elif head_pose_forward < 45.0 or eye_forward < 45.0:
            attention_status = "Distracted (Looking Away)"
        elif 'mar' in locals() and mar > 0.55:
            attention_status = "Drowsy / Inattentive"
        else:
            attention_status = "Attentive (Focused)"

        return {
            "face_detected": face_detected,
            "face_visibility": round(face_visibility, 2),
            "head_pose_forward": round(head_pose_forward, 2),
            "eye_forward": round(eye_forward, 2),
            "blink_count": blink_count,
            "yawn_count": yawn_count,
            "smile_count": smile_count,
            "emotions": emotions,
            "engagement_estimate": round(engagement, 2),
            "attention_status": attention_status,
        }

    def _landmark(self, mesh_results, idx):
        if not mesh_results.multi_face_landmarks:
            return None
        lm = mesh_results.multi_face_landmarks[0].landmark[idx]
        return lm.x, lm.y

    def _eye_aspect_ratio(self, landmarks):
        def dist(a, b):
            return math.hypot(landmarks[a].x - landmarks[b].x, landmarks[a].y - landmarks[b].y)

        left = (dist(33, 160) + dist(158, 144) + dist(153, 145)) / (3 * dist(33, 133) + 1e-6)
        right = (dist(362, 385) + dist(387, 373) + dist(380, 374)) / (3 * dist(362, 263) + 1e-6)
        return (left + right) / 2

    def _mouth_aspect_ratio(self, landmarks):
        return (
            abs(landmarks[13].y - landmarks[14].y)
            / (abs(landmarks[61].x - landmarks[291].x) + 1e-6)
        )

    def _detect_smile(self, landmarks):
        mouth_width = abs(landmarks[61].x - landmarks[291].x)
        mouth_height = abs(landmarks[13].y - landmarks[14].y)
        return mouth_width / (mouth_height + 1e-6) > 3.2

    def _estimate_head_forward(self, nose, chin, forehead):
        vertical = abs(forehead[1] - chin[1])
        if vertical < 1e-6:
            return 50.0
        center_x = (forehead[0] + chin[0]) / 2
        offset = abs(nose[0] - center_x)
        return max(0.0, min(100.0, 100.0 - offset * 300))

    def _update_blinks(self, participant_id, ear):
        state = self._blink_state[participant_id]
        state["ear_history"].append(ear)
        if len(state["ear_history"]) > 5:
            state["ear_history"].pop(0)
        if len(state["ear_history"]) >= 3 and ear < 0.2 and state["ear_history"][-2] >= 0.2:
            state["blink_count"] += 1
        return state["blink_count"]

    def _update_yawns(self, participant_id, mar):
        state = self._yawn_state[participant_id]
        state["mar_history"].append(mar)
        if len(state["mar_history"]) > 5:
            state["mar_history"].pop(0)
        if mar > 0.6:
            state["yawn_count"] += 1
        return state["yawn_count"]

    def _estimate_emotions(self, landmarks, smiling, mar):
        emotions = {"happy": 10, "neutral": 60, "sad": 10, "angry": 10, "surprised": 10}
        if smiling:
            emotions["happy"] = 70
            emotions["neutral"] = 20
        if mar > 0.55:
            emotions["surprised"] = 40
            emotions["neutral"] = 40
        brow = abs(landmarks[70].y - landmarks[300].y)
        if brow < 0.02:
            emotions["angry"] = 30
        return emotions

    def _engagement_from_visuals(self, face_vis, head, eye, blinks, smiles):
        score = face_vis * 0.3 + head * 0.25 + eye * 0.25
        score += min(20, smiles * 2)
        score -= min(15, max(0, blinks - 5))
        return min(100.0, max(0.0, score))
