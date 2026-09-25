import math
from collections import defaultdict

import cv2
import mediapipe as mp
import numpy as np


class FrameAnalyzer:
    def __init__(self):
        self.face_detection = None
        self.face_mesh = None

        try:
            mp_face = mp.solutions.face_detection
            mp_face_mesh = mp.solutions.face_mesh
            self.face_detection = mp_face.FaceDetection(min_detection_confidence=0.3)
            self.face_mesh = mp_face_mesh.FaceMesh(
                static_image_mode=False,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.3,
                min_tracking_confidence=0.3,
            )
        except Exception as e:
            print(f"[FrameAnalyzer] Notice: MediaPipe model init notice: {e}")

        self._blink_state = defaultdict(lambda: {"ear_history": [], "blink_count": 0})
        self._yawn_state = defaultdict(lambda: {
            "mar_history": [],
            "yawn_count": 0,
            "yawn_active": False
        })
        self._smile_state = defaultdict(lambda: {"smile_frames": 0})
        self._history_state = defaultdict(lambda: {
            "face_vis": 95.0,
            "head_pose": 90.0,
            "eye_focus": 90.0
        })

    def analyze(self, image: np.ndarray, participant_id: str) -> dict:

        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        h, w = image.shape[:2]

        has_detection = False
        has_mesh = False
        face_results = None
        mesh_results = None

        if self.face_detection and self.face_mesh:
            try:
                face_results = self.face_detection.process(rgb)
                mesh_results = self.face_mesh.process(rgb)
                has_detection = bool(face_results and face_results.detections)
                has_mesh = bool(mesh_results and mesh_results.multi_face_landmarks)
            except Exception as e:
                print(f"[FrameAnalyzer] Frame process notice: {e}")

        face_detected = has_detection or has_mesh
        raw_face_visibility = 0.0
        raw_head_pose_forward = 0.0
        raw_eye_forward = 0.0
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
                    raw_face_visibility = 85.0
                    raw_head_pose_forward = 80.0
                    raw_eye_forward = 80.0
            except Exception:
                pass

        if face_detected:
            if has_mesh:
                raw_face_visibility = 96.0
            elif has_detection:
                det = face_results.detections[0]
                raw_face_visibility = min(98.0, max(75.0, float(det.score[0]) * 100))
            else:
                raw_face_visibility = 85.0

            nose = self._landmark(mesh_results, 1) if has_mesh else None
            left_eye = self._landmark(mesh_results, 33) if has_mesh else None
            right_eye = self._landmark(mesh_results, 263) if has_mesh else None
            chin = self._landmark(mesh_results, 152) if has_mesh else None
            forehead = self._landmark(mesh_results, 10) if has_mesh else None

            if nose and left_eye and right_eye:
                eye_center_x = (left_eye[0] + right_eye[0]) / 2
                eye_offset = abs(nose[0] - eye_center_x)
                # Calibrated for natural webcam FOV
                raw_eye_forward = max(35.0, min(99.0, 100.0 - eye_offset * 180))
            else:
                raw_eye_forward = 85.0

            if nose and chin and forehead:
                raw_head_pose_forward = self._estimate_head_forward(nose, chin, forehead)
            else:
                raw_head_pose_forward = 85.0

            if has_mesh and mesh_results.multi_face_landmarks:
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

        # Smooth metrics across frames for natural, stable values
        history = self._history_state[participant_id]
        if face_detected:
            history["face_vis"] = round(history["face_vis"] * 0.4 + raw_face_visibility * 0.6, 1)
            history["head_pose"] = round(history["head_pose"] * 0.5 + raw_head_pose_forward * 0.5, 1)
            history["eye_focus"] = round(history["eye_focus"] * 0.5 + raw_eye_forward * 0.5, 1)
        else:
            history["face_vis"] = 0.0
            history["head_pose"] = 0.0
            history["eye_focus"] = 0.0

        face_visibility = history["face_vis"]
        head_pose_forward = history["head_pose"]
        eye_forward = history["eye_focus"]

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
        if not mesh_results or not hasattr(mesh_results, 'multi_face_landmarks') or not mesh_results.multi_face_landmarks:
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
            return 80.0
        center_x = (forehead[0] + chin[0]) / 2
        offset = abs(nose[0] - center_x)
        # Calibrated for natural head tilt angle
        return max(35.0, min(99.0, 100.0 - offset * 160))

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

        # Keep recent mouth measurements
        state["mar_history"].append(mar)

        if len(state["mar_history"]) > 5:
            state["mar_history"].pop(0)

        # Mouth is considered open
        mouth_open = mar > 0.6

        # Count only when mouth changes from closed -> open
        if mouth_open and not state["yawn_active"]:
            state["yawn_count"] += 1
            state["yawn_active"] = True

        # Reset when mouth closes
        elif not mouth_open:
            state["yawn_active"] = False

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
