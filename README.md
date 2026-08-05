# MeetMind – AI-Based Video Meeting Analyzer

MeetMind is a full-stack AI-powered video conferencing platform with ML-based meeting analytics, engagement scoring, and intelligent post-meeting reports.

## Features

- **Authentication** – Register, login, forgot/reset password, JWT sessions, profile management
- **Video Meetings** – WebRTC HD video/audio, screen sharing, chat, raise hand, recording
- **Host Controls** – Waiting room, camera-required policy, AI analytics toggle, meeting settings
- **Camera Policy** – Pre-join exemption requests, 2-minute grace period, auto-removal
- **AI / ML Analytics** – OpenCV + MediaPipe (face, pose, blink, yawn, emotion estimates)
- **Audio Analysis** – Speaking time, voice activity detection
- **Post-Meeting Intelligence** – Whisper transcription, LLM summaries, action items, keywords
- **Dashboards** – Host analytics (all participants) vs participant view (self only)
- **Reports** – Downloadable PDF meeting reports

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, JavaScript, Glassmorphism UI |
| Backend | Node.js, Express.js, Socket.IO |
| Database | MongoDB |
| Real-time | WebRTC, Socket.IO |
| ML Service | Python, FastAPI, OpenCV, MediaPipe |
| AI | Whisper, OpenAI LLM, spaCy |

## Project Structure

```
Meetmind/
├── backend/           # Express API + Socket.IO signaling
├── frontend/          # Static web app (HTML/CSS/JS)
├── ml-service/        # Python FastAPI ML microservice
├── .env.example       # Environment template
└── README.md
```

## Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB (local or MongoDB Atlas)

## Setup

### 1. Clone and configure

```bash
cd Meetmind
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, and optional OpenAI key
```

### 2. Install dependencies

```bash
# Backend
cd backend
npm install

# ML Service
cd ../ml-service
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### 3. Start MongoDB

Ensure MongoDB is running locally on `mongodb://localhost:27017` or update `MONGODB_URI` in `.env`.

### 4. Run services

**Terminal 1 – Backend (serves frontend + API on port 5000):**
```bash
cd backend
npm run dev
```

**Terminal 2 – ML Service (port 8001):**
```bash
cd ml-service
python -m uvicorn main:app --reload --port 8001
```

### 5. Open the app

Visit **http://localhost:5000**

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend port | 5000 |
| `MONGODB_URI` | MongoDB connection string | localhost |
| `JWT_SECRET` | JWT signing secret | (change in prod) |
| `ML_SERVICE_URL` | Python ML service URL | http://localhost:8001 |
| `OPENAI_API_KEY` | For LLM summaries (optional) | — |
| `WHISPER_MODEL` | Whisper model size | base |
| `SMTP_*` | Email for password reset | — |

## Usage Flow

1. **Register** an account and log in
2. **Create a meeting** from the dashboard (you become host)
3. Share **Meeting ID + Password** with participants
4. **Join** with camera/mic permissions
5. During meeting: chat, share screen, raise hand; AI analyzes consenting cameras
6. **End meeting** as host → view analytics dashboard
7. **Download PDF report** with summary, attendance, and engagement

## Role Model

- No permanent admin or host role
- Any user can create a meeting → becomes **host for that meeting only**
- Joiners are **participants**
- Host sees all analytics; participants see **only their own stats**

## Deployment

- **Backend + Frontend**: Render, Railway, or AWS
- **Database**: MongoDB Atlas
- **ML Service**: Railway/Render with GPU optional; Whisper `base` works on CPU

## License

MIT
