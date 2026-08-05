if (!requireAuth()) throw new Error('Auth required');

const joinInfo = JSON.parse(sessionStorage.getItem('meetmind_join') || 'null');
if (!joinInfo) {
  window.location.href = '/join.html';
}

const user = api.getUser();
const webrtc = new WebRTCManager();
let socket = null;
let isHost = joinInfo.isHost || false;
let cameraRequired = joinInfo.settings?.cameraRequired || false;
let cameraExempt = joinInfo.cameraExempt || false;
let micOn = true;
let camOn = true;
let handRaised = false;
let recording = false;
let meetingStart = Date.now();
let timerInterval = null;
let graceTimer = null;
let graceInterval = null;
let vad = null;
let frameCapture = null;
const remoteVideos = new Map();

// DOM
const videoGrid = document.getElementById('videoGrid');
const chatMessages = document.getElementById('chatMessages');
const participantList = document.getElementById('participantList');
const meetingTitle = document.getElementById('meetingTitle');
const meetingTimer = document.getElementById('meetingTimer');
const meetingIdDisplay = document.getElementById('meetingIdDisplay');

document.getElementById('meetingIdDisplay').textContent = `ID: ${joinInfo.meetingId}`;
if (isHost) {
  document.getElementById('endMeetingBtn').classList.remove('hidden');
  document.getElementById('toggleRecord').classList.remove('hidden');
  document.getElementById('requestsTab').classList.remove('hidden');
  document.getElementById('analyticsTab').classList.remove('hidden');
}

// Tabs
document.querySelectorAll('.sidebar-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
  });
});

function addVideoTile(id, stream, name, isLocal = false) {
  let tile = document.getElementById(`tile-${id}`);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.id = `tile-${id}`;
    tile.innerHTML = `<video autoplay playsinline ${isLocal ? 'muted' : ''}></video><span class="name-tag"></span><span class="hand-icon hidden">✋</span>`;
    videoGrid.appendChild(tile);
  }
  const video = tile.querySelector('video');
  if (video.srcObject !== stream) {
    video.srcObject = stream;
    if (!isLocal) {
      video.muted = false;
    }
    video.play().catch(err => {
      console.warn(`[meeting.js] Video play error for tile ${id}:`, err);
    });
  }
  const displayName = name || (isLocal ? user.name : (remoteVideos.get(id) || 'Participant'));
  tile.querySelector('.name-tag').textContent = displayName + (isLocal ? ' (You)' : '');
  if (isLocal && !frameCapture) frameCapture = new FrameCapture(video, 2000);
}

function removeVideoTile(id) {
  const tile = document.getElementById(`tile-${id}`);
  if (tile) tile.remove();
  remoteVideos.delete(id);
}

function updateParticipantList(participants) {
  participantList.innerHTML = participants.map(p => `
    <div class="participant-item">
      <div class="avatar">${getInitials(p.name)}</div>
      <div>
        <div>${p.name}${p.isHost ? ' (Host)' : ''}</div>
        <div style="font-size:0.8rem;color:var(--text-muted)">
          ${p.cameraOn ? '📷' : '📷❌'} ${p.micOn ? '🎤' : '🔇'}
          ${p.handRaised ? ' ✋' : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function addChatMessage(sender, message, timestamp) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<div class="sender">${sender}</div>${message}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function startTimer() {
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - meetingStart) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    meetingTimer.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  }, 1000);
}

function startCameraGracePeriod() {
  if (camOn || cameraExempt) return;
  document.getElementById('cameraWarning').classList.add('show');
  let remaining = 60;
  const graceEl = document.getElementById('graceTimer');
  graceEl.textContent = '1:00';
  if (graceInterval) clearInterval(graceInterval);
  graceInterval = setInterval(() => {
    remaining--;
    graceEl.textContent = `${Math.floor(remaining/60)}:${(remaining%60).toString().padStart(2,'0')}`;
    if (remaining <= 0) {
      clearInterval(graceInterval);
      socket.emit('camera-grace-expired');
      cleanup();
      alert('You were removed from the meeting because your camera remained off.');
      window.location.href = '/dashboard.html';
    }
  }, 1000);
}

function cancelCameraGrace() {
  document.getElementById('cameraWarning').classList.remove('show');
  if (graceInterval) clearInterval(graceInterval);
}

async function init() {
  try {
    const needCamera = !cameraExempt;
    const stream = await webrtc.getLocalStream(needCamera, true);
    addVideoTile('local', stream, user.name, true);

    webrtc.onIceCandidate = (socketId, candidate) => {
      socket?.emit('webrtc-ice-candidate', { targetSocketId: socketId, candidate });
    };

    webrtc.onRemoteStream = (socketId, stream) => {
      const name = remoteVideos.get(socketId) || 'Participant';
      addVideoTile(socketId, stream, name);
    };

    webrtc.onPeerDisconnected = (socketId) => {
      removeVideoTile(socketId);
      refreshParticipants();
    };

    vad = new VoiceActivityDetector((seconds) => {
      socket?.emit('speaking-time', { seconds });
    });
    vad.start(stream);

    if (joinInfo.settings?.aiAnalytics && needCamera && camOn) {
      frameCapture = new FrameCapture(document.querySelector('#tile-local video'), 2000);
      frameCapture.onFrame = (frame) => socket?.emit('analyze-frame', { frame });
      frameCapture.start();
    }

    socket = io({ auth: { token: api.getToken() } });

    socket.on('connect', () => {
      socket.emit('join-room', {
        meetingDbId: joinInfo.meetingDbId,
        meetingCode: joinInfo.meetingId
      });
    });

    socket.on('waiting-for-host', (data) => {
      document.getElementById('waitingForHostOverlay').classList.add('show');
    });

    socket.on('host-started-meeting', () => {
      document.getElementById('waitingForHostOverlay').classList.remove('show');
      socket.emit('join-room', {
        meetingDbId: joinInfo.meetingDbId,
        meetingCode: joinInfo.meetingId
      });
    });

    socket.on('room-joined', async (data) => {
      document.getElementById('waitingForHostOverlay').classList.remove('show');
      meetingTitle.textContent = data.meeting.title;
      isHost = data.isHost;
      cameraRequired = data.meeting.settings.cameraRequired;
      startTimer();

      for (const peer of data.peers) {
        remoteVideos.set(peer.socketId, peer.name);
        await connectToPeer(peer.socketId, true);
      }
      refreshParticipants();
    });

    socket.on('user-joined', async (data) => {
      addChatMessage('System', `${data.name} joined`, new Date());
      remoteVideos.set(data.socketId, data.name);
      webrtc.createPeer(data.socketId, false);
      refreshParticipants();
    });

    socket.on('user-left', (data) => {
      addChatMessage('System', `${data.name} left`, new Date());
      webrtc.removePeer(data.socketId);
      removeVideoTile(data.socketId);
      refreshParticipants();
    });

    socket.on('webrtc-offer', async ({ offer, senderSocketId, senderName }) => {
      if (senderName) {
        remoteVideos.set(senderSocketId, senderName);
      }
      const answer = await webrtc.handleOffer(senderSocketId, offer);
      socket.emit('webrtc-answer', { targetSocketId: senderSocketId, answer });
    });

    socket.on('webrtc-answer', async ({ answer, senderSocketId }) => {
      await webrtc.handleAnswer(senderSocketId, answer);
    });

    socket.on('webrtc-ice-candidate', async ({ candidate, senderSocketId }) => {
      await webrtc.handleIceCandidate(senderSocketId, candidate);
    });

    socket.on('media-state-changed', (data) => {
      refreshParticipants();
    });

    socket.on('analytics-update', (data) => {
      if (isHost && data.metrics) {
        updateLiveAnalyticsUI(data.participantId, data.metrics);
      }
    });

    socket.on('camera-warning', (data) => {
      if (cameraRequired && !cameraExempt && !camOn) startCameraGracePeriod();
    });

    socket.on('hand-raised', (data) => {
      const tile = document.getElementById(`tile-${data.socketId}`);
      if (tile) {
        tile.querySelector('.hand-icon').classList.toggle('hidden', !data.raised);
      }
    });

    socket.on('chat-message', (data) => {
      addChatMessage(data.senderName, data.message, data.timestamp);
    });

    socket.on('recording-state', (data) => {
      recording = data.recording;
      document.getElementById('recordingIndicator').classList.toggle('active', recording);
    });

    socket.on('meeting-ended', () => {
      cleanup();
      alert('Meeting ended by host');
      window.location.href = isHost
        ? `/analytics-host.html?id=${joinInfo.meetingDbId}`
        : `/analytics-participant.html?id=${joinInfo.meetingDbId}`;
    });

    socket.on('camera-request-resolved', (data) => {
      loadCameraRequests();
    });

    socket.on('removed-from-meeting', (data) => {
      cleanup();
      alert(data.reason);
      window.location.href = '/dashboard.html';
    });

    socket.on('waiting-approval', (data) => {
      alert(data.message);
      window.location.href = '/dashboard.html';
    });

    socket.on('camera-required', () => {
      if (!cameraExempt && !camOn) {
        startCameraGracePeriod();
      }
    });

    if (isHost) loadCameraRequests();

  } catch (err) {
    console.error('[meeting.js:L264] Initialization error caught in init():', err);
    let errorMsg = 'Failed to access camera/microphone: ' + err.message;
    if (typeof window !== 'undefined' && window.isSecureContext === false && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      errorMsg += '\n\n💡 REASON: Browsers block camera/microphone access over unencrypted HTTP (http://' + location.host + '). Please use HTTPS or an SSL tunnel (like ngrok).';
    }
    alert(errorMsg);
    if (cameraRequired && !cameraExempt) {
      window.location.href = '/join.html';
    }
  }
}

async function connectToPeer(socketId, initiator) {
  webrtc.createPeer(socketId, initiator);
  if (initiator) {
    const offer = await webrtc.createOffer(socketId);
    socket.emit('webrtc-offer', { targetSocketId: socketId, offer });
  }
}

function refreshParticipants() {
  // Simplified - in production would sync from server
  const tiles = videoGrid.querySelectorAll('.video-tile');
  const parts = [{ name: user.name, isHost, cameraOn: camOn, micOn, handRaised }];
  tiles.forEach(t => {
    if (t.id !== 'tile-local') {
      parts.push({ name: t.querySelector('.name-tag')?.textContent || 'Guest', cameraOn: true, micOn: true, handRaised: false });
    }
  });
  updateParticipantList(parts);
}

const liveAnalyticsMap = new Map();
function updateLiveAnalyticsUI(participantId, metrics) {
  liveAnalyticsMap.set(participantId, metrics);
  const container = document.getElementById('liveAnalyticsList');
  if (!container) return;

  let html = '';
  liveAnalyticsMap.forEach((m, id) => {
    html += `
      <div class="glass" style="padding:0.75rem;margin-bottom:0.75rem;border-radius:10px">
        <strong style="font-size:0.85rem;color:var(--primary)">Live AI Participant Stream</strong>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.5rem;font-size:0.8rem">
          <div>Engagement: <strong>${Math.round(m.engagement_estimate || 0)}%</strong></div>
          <div>Face Vis: <strong>${Math.round(m.face_visibility || 0)}%</strong></div>
          <div>Head Pose: <strong>${Math.round(m.head_pose_forward || 0)}%</strong></div>
          <div>Eye Focus: <strong>${Math.round(m.eye_forward || 0)}%</strong></div>
          <div>Blinks: <strong>${m.blink_count || 0}</strong></div>
          <div>Yawns: <strong>${m.yawn_count || 0}</strong></div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html || '<p style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem">Analyzing video streams...</p>';
}

async function loadCameraRequests() {
  if (!isHost) return;
  try {
    const data = await api.getCameraRequests(joinInfo.meetingDbId);
    const container = document.getElementById('cameraRequests');
    if (!data.requests?.length) {
      container.innerHTML = '<p style="color:var(--text-muted)">No pending requests</p>';
      return;
    }
    container.innerHTML = data.requests.map(r => `
      <div class="glass" style="padding:1rem;margin-bottom:0.75rem">
        <strong>${r.userId?.name || 'User'}</strong>
        <p style="font-size:0.85rem;color:var(--text-muted)">${r.cameraExemptReason}</p>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
          <button class="btn btn-sm btn-success" onclick="approveRequest('${r._id}')">Approve</button>
          <button class="btn btn-sm btn-danger" onclick="rejectRequest('${r._id}')">Reject</button>
        </div>
      </div>
    `).join('');
  } catch {}
}

window.approveRequest = async (id) => {
  await api.approveCamera(joinInfo.meetingDbId, id);
  socket.emit('approve-camera-request', { participantId: id, approved: true });
  loadCameraRequests();
};

window.rejectRequest = async (id) => {
  await api.rejectCamera(joinInfo.meetingDbId, id);
  socket.emit('approve-camera-request', { participantId: id, approved: false });
  loadCameraRequests();
};

// Controls
document.getElementById('toggleMic').addEventListener('click', () => {
  micOn = !micOn;
  webrtc.toggleAudio(micOn);
  document.getElementById('toggleMic').classList.toggle('off', !micOn);
  socket?.emit('media-state', { cameraOn: camOn, micOn });
});

document.getElementById('toggleCam').addEventListener('click', () => {
  camOn = !camOn;
  webrtc.toggleVideo(camOn);
  document.getElementById('toggleCam').classList.toggle('off', !camOn);
  socket?.emit('media-state', { cameraOn: camOn, micOn });

  if (cameraRequired && !cameraExempt && !camOn) {
    socket?.emit('camera-disabled-warning');
    startCameraGracePeriod();
  } else if (camOn) {
    cancelCameraGrace();
    if (frameCapture && joinInfo.settings?.aiAnalytics) {
      frameCapture.start();
    }
  } else {
    frameCapture?.stop();
  }
});

document.getElementById('toggleScreen').addEventListener('click', async () => {
  if (!joinInfo.settings?.screenSharing) return alert('Screen sharing disabled');
  try {
    const screen = await webrtc.startScreenShare();
    addVideoTile('screen', screen, 'Screen Share', true);
  } catch {}
});

document.getElementById('raiseHand').addEventListener('click', () => {
  handRaised = !handRaised;
  document.getElementById('raiseHand').classList.toggle('active', handRaised);
  socket?.emit('raise-hand', { raised: handRaised });
});

document.getElementById('toggleRecord').addEventListener('click', () => {
  recording = !recording;
  socket?.emit(recording ? 'recording-started' : 'recording-stopped');
  document.getElementById('recordingIndicator').classList.toggle('active', recording);
});

document.getElementById('sendChat').addEventListener('click', sendChat);
document.getElementById('chatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChat();
});

function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  socket?.emit('chat-message', { message: msg });
  input.value = '';
}

function cleanup() {
  if (timerInterval) clearInterval(timerInterval);
  if (graceInterval) clearInterval(graceInterval);
  frameCapture?.stop();
  vad?.stop();
  webrtc.cleanup();
  socket?.disconnect();
}

document.getElementById('leaveBtn').addEventListener('click', () => {
  cleanup();
  window.location.href = '/dashboard.html';
});

document.getElementById('endMeetingBtn').addEventListener('click', async () => {
  if (!confirm('End meeting for everyone?')) return;
  try {
    await api.endMeeting(joinInfo.meetingDbId);
    socket?.emit('end-meeting');
    cleanup();
    window.location.href = `/analytics-host.html?id=${joinInfo.meetingDbId}`;
  } catch (err) {
    alert(err.message);
  }
});

init();
