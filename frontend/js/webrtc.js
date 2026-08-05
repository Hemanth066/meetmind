class WebRTCManager {
  constructor() {
    this.localStream = null;
    this.screenStream = null;
    this.peers = new Map();
    this.config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    this.onRemoteStream = null;
    this.onPeerDisconnected = null;
  }

  async getLocalStream(video = true, audio = true) {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }

    // Check for Secure Context (HTTPS or localhost)
    if (typeof window !== 'undefined' && window.isSecureContext === false && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      throw new Error('Camera/Microphone access requires HTTPS or localhost. Browser blocked mediaDevices on unencrypted http://' + location.host);
    }

    // Polyfill navigator.mediaDevices if undefined
    if (typeof navigator !== 'undefined' && !navigator.mediaDevices) {
      navigator.mediaDevices = {};
    }

    // Polyfill getUserMedia for legacy browsers if supported
    if (typeof navigator !== 'undefined' && !navigator.mediaDevices.getUserMedia) {
      const legacyGetUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
      if (legacyGetUserMedia) {
        navigator.mediaDevices.getUserMedia = function(constraints) {
          return new Promise((resolve, reject) => {
            legacyGetUserMedia.call(navigator, constraints, resolve, reject);
          });
        };
      }
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('navigator.mediaDevices.getUserMedia is unavailable. Your browser may be in an insecure context (HTTP) or does not support MediaDevices.');
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: video ? { width: 1280, height: 720 } : false,
        audio: audio ? { echoCancellation: true, noiseSuppression: true } : false
      });
      return this.localStream;
    } catch (err) {
      console.error('[webrtc.js:L15] getUserMedia error:', err);
      throw err;
    }
  }

  toggleVideo(enabled) {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach(t => { t.enabled = enabled; });
  }

  toggleAudio(enabled) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }

  async startScreenShare() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Screen sharing (getDisplayMedia) is unavailable or not supported in this context.');
    }
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      return this.screenStream;
    } catch (err) {
      console.error('[webrtc.js:L33] getDisplayMedia error:', err);
      throw err;
    }
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
  }

  createPeer(socketId, initiator) {
    const pc = new RTCPeerConnection(this.config);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.ontrack = (e) => {
      if (this.onRemoteStream) {
        this.onRemoteStream(socketId, e.streams[0]);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && this.onIceCandidate) {
        this.onIceCandidate(socketId, e.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.removePeer(socketId);
        if (this.onPeerDisconnected) this.onPeerDisconnected(socketId);
      }
    };

    this.peers.set(socketId, { pc, initiator });
    return pc;
  }

  async createOffer(socketId) {
    const peer = this.peers.get(socketId);
    if (!peer) return null;
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(socketId, offer) {
    let peer = this.peers.get(socketId);
    if (!peer) {
      this.createPeer(socketId, false);
      peer = this.peers.get(socketId);
    }
    await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(socketId, answer) {
    const peer = this.peers.get(socketId);
    if (peer) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  async handleIceCandidate(socketId, candidate) {
    const peer = this.peers.get(socketId);
    if (peer && candidate) {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  removePeer(socketId) {
    const peer = this.peers.get(socketId);
    if (peer) {
      peer.pc.close();
      this.peers.delete(socketId);
    }
  }

  cleanup() {
    this.peers.forEach((_, id) => this.removePeer(id));
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    this.stopScreenShare();
  }
}

class VoiceActivityDetector {
  constructor(onSpeaking) {
    this.onSpeaking = onSpeaking;
    this.audioContext = null;
    this.analyser = null;
    this.interval = null;
    this.speakingSeconds = 0;
    this.wasSpeaking = false;
  }

  start(stream) {
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);

    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.interval = setInterval(() => {
      this.analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const speaking = avg > 15;
      if (speaking) {
        this.speakingSeconds += 1;
        if (this.onSpeaking) this.onSpeaking(1);
      }
      this.wasSpeaking = speaking;
    }, 1000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.audioContext) this.audioContext.close();
  }
}

class FrameCapture {
  constructor(videoEl, intervalMs = 2000) {
    this.videoEl = videoEl;
    this.intervalMs = intervalMs;
    this.canvas = document.createElement('canvas');
    this.timer = null;
    this.onFrame = null;
  }

  start() {
    this.timer = setInterval(() => {
      if (!this.videoEl || this.videoEl.readyState < 2) return;
      const w = this.videoEl.videoWidth;
      const h = this.videoEl.videoHeight;
      if (!w || !h) return;
      this.canvas.width = w;
      this.canvas.height = h;
      const ctx = this.canvas.getContext('2d');
      ctx.drawImage(this.videoEl, 0, 0, w, h);
      const dataUrl = this.canvas.toDataURL('image/jpeg', 0.6);
      if (this.onFrame) this.onFrame(dataUrl);
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
