const Meeting = require('../models/Meeting');
const Participant = require('../models/Participant');
const ChatMessage = require('../models/ChatMessage');
const AIAnalytics = require('../models/AIAnalytics');
const { analyzeFrame } = require('../services/mlService');
const { notifyHost, createNotification } = require('../services/notificationService');

const roomState = new Map();

function getRoom(meetingDbId) {
  if (!roomState.has(meetingDbId)) {
    roomState.set(meetingDbId, {
      participants: new Map(),
      recording: false,
      hostSocketId: null
    });
  }
  return roomState.get(meetingDbId);
}

function setupSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const jwt = require('jsonwebtoken');
      const config = require('../config');
      const User = require('../models/User');
      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.user.name}`);

    socket.on('join-room', async ({ meetingDbId, meetingCode }) => {
      try {
        const meeting = await Meeting.findById(meetingDbId);
        if (!meeting) {
          socket.emit('error', { message: 'Meeting not found' });
          return;
        }

        let participant = await Participant.findOne({
          meetingId: meeting._id,
          userId: socket.user._id
        });

        if (!participant) {
          participant = await Participant.create({
            meetingId: meeting._id,
            userId: socket.user._id,
            role: meeting.hostId.toString() === socket.user._id.toString() ? 'host' : 'participant'
          });
        }

        const isHost = meeting.hostId.toString() === socket.user._id.toString();
        const room = getRoom(meetingDbId);

        // Check if meeting has not been started by the host yet
        if (!isHost && meeting.status !== 'live') {
          socket.join(`waiting-host-${meetingDbId}`);
          socket.emit('waiting-for-host', {
            message: 'Waiting for the host to start the meeting',
            meetingTitle: meeting.title
          });
          return;
        }

        if (participant.status === 'pending_approval') {
          socket.emit('waiting-approval', { message: 'Waiting for host approval' });
          return;
        }

        if (meeting.settings.cameraRequired && !participant.cameraExempt && !isHost) {
          socket.emit('camera-required', {
            message: 'Camera is required for this meeting'
          });
        }

        socket.leave(`waiting-host-${meetingDbId}`);
        socket.join(meetingDbId);
        socket.meetingDbId = meetingDbId;
        socket.participantId = participant._id.toString();
        socket.isHost = isHost;

        if (isHost) room.hostSocketId = socket.id;

        room.participants.set(socket.id, {
          odId: socket.user._id.toString(),
          participantId: participant._id.toString(),
          name: socket.user.name,
          profilePicture: socket.user.profilePicture,
          isHost,
          cameraOn: false,
          micOn: false,
          handRaised: false
        });

        if (isHost && meeting.status !== 'live') {
          meeting.status = 'live';
          meeting.startedAt = meeting.startedAt || new Date();
          await meeting.save();

          // Notify all waiting participants that host started the meeting
          io.to(`waiting-host-${meetingDbId}`).emit('host-started-meeting', {
            meetingDbId: meeting._id.toString()
          });
        }

        participant.status = 'joined';
        participant.joinTime = participant.joinTime || new Date();
        await participant.save();

        const peers = [];
        room.participants.forEach((p, sid) => {
          if (sid !== socket.id) peers.push({ socketId: sid, ...p });
        });

        socket.emit('room-joined', {
          meeting: {
            id: meeting._id,
            meetingId: meeting.meetingId,
            title: meeting.title,
            settings: meeting.settings
          },
          participant: {
            id: participant._id,
            role: participant.role,
            cameraExempt: participant.cameraExempt
          },
          peers,
          isHost
        });

        socket.to(meetingDbId).emit('user-joined', {
          socketId: socket.id,
          odId: socket.user._id.toString(),
          name: socket.user.name,
          profilePicture: socket.user.profilePicture,
          isHost
        });

        if (!isHost) {
          await notifyHost(
            meeting,
            'participant_joined',
            'Participant Joined',
            `${socket.user.name} joined the meeting`
          );
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('webrtc-offer', ({ targetSocketId, offer }) => {
      io.to(targetSocketId).emit('webrtc-offer', {
        offer,
        senderSocketId: socket.id,
        senderName: socket.user.name
      });
    });

    socket.on('webrtc-answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('webrtc-answer', {
        answer,
        senderSocketId: socket.id
      });
    });

    socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('webrtc-ice-candidate', {
        candidate,
        senderSocketId: socket.id
      });
    });

    socket.on('media-state', async ({ cameraOn, micOn }) => {
      const room = getRoom(socket.meetingDbId);
      const p = room.participants.get(socket.id);
      if (p) {
        p.cameraOn = cameraOn;
        p.micOn = micOn;
      }

      await Participant.findByIdAndUpdate(socket.participantId, {
        cameraEnabled: cameraOn,
        visualMetricsAvailable: cameraOn && !p?.cameraExempt,
        muteEnabled: !micOn
      });

      socket.to(socket.meetingDbId).emit('media-state-changed', {
        socketId: socket.id,
        cameraOn,
        micOn,
        name: socket.user.name
      });
    });

    socket.on('camera-disabled-warning', async () => {
      if (socket.isHost) return;
      socket.emit('camera-warning', {
        message: 'Camera is required for this meeting. Turn it ON within 2 minutes for 1st warning or 15s for 2nd warning.',
        gracePeriodMs: 120000
      });
    });

    socket.on('camera-grace-expired', async () => {
      if (socket.isHost) return;
      const meeting = await Meeting.findById(socket.meetingDbId);
      if (!meeting?.settings.cameraRequired) return;

      const participant = await Participant.findById(socket.participantId);
      if (participant?.cameraExempt) return;

      participant.status = 'removed';
      participant.leaveTime = new Date();
      await participant.save();

      socket.emit('removed-from-meeting', {
        reason: 'You were automatically removed from the meeting due to camera-off grace period expiration.'
      });

      const room = getRoom(socket.meetingDbId);
      if (room) {
        room.participants.delete(socket.id);
      }
      socket.leave(socket.meetingDbId);

      await notifyHost(
        meeting,
        'camera_disabled',
        'Participant Removed',
        `${socket.user.name} was removed (camera off)`
      );
    });

    socket.on('raise-hand', async ({ raised }) => {
      const room = getRoom(socket.meetingDbId);
      const p = room.participants.get(socket.id);
      if (p) p.handRaised = raised;

      if (raised) {
        await Participant.findByIdAndUpdate(socket.participantId, {
          $inc: { raiseHandCount: 1 },
          handRaised: true
        });
      } else {
        await Participant.findByIdAndUpdate(socket.participantId, { handRaised: false });
      }

      io.to(socket.meetingDbId).emit('hand-raised', {
        socketId: socket.id,
        name: socket.user.name,
        raised
      });
    });

    socket.on('chat-message', async ({ message }) => {
      const meeting = await Meeting.findById(socket.meetingDbId);
      if (!meeting?.settings.chat) return;

      const chatMsg = await ChatMessage.create({
        meetingId: meeting._id,
        userId: socket.user._id,
        senderName: socket.user.name,
        message
      });

      await Participant.findByIdAndUpdate(socket.participantId, {
        $inc: { chatMessageCount: 1 }
      });

      io.to(socket.meetingDbId).emit('chat-message', {
        id: chatMsg._id,
        senderName: socket.user.name,
        message,
        timestamp: chatMsg.createdAt
      });
    });

    socket.on('speaking-time', async ({ seconds }) => {
      await Participant.findByIdAndUpdate(socket.participantId, {
        $inc: { speakingTimeSeconds: seconds }
      });
    });

    socket.on('analyze-frame', async ({ frame }) => {
      console.log('[AI Pipeline] Frame received from browser');
      if (!socket.meetingDbId || !socket.participantId || !frame) return;

      const meeting = await Meeting.findById(socket.meetingDbId);
      if (!meeting || meeting.status !== 'live') return;

      const participant = await Participant.findById(socket.participantId);
      if (!participant || participant.cameraExempt) return;

      const result = await analyzeFrame(frame, socket.participantId);
      if (!result) return;

      participant.visualMetricsAvailable = true;
      participant.cameraEnabled = true;

      const count = (participant.aiObservations.frameCount || 0) + 1;
      const oldFace = participant.aiObservations.faceVisibility || 0;
      const oldHead = participant.aiObservations.headPoseForward || 0;
      const oldEye = participant.aiObservations.eyeForward || 0;

      const newFace = result.face_visibility ?? (result.face_detected ? 85 : 0);
      const newHead = result.head_pose_forward ?? (result.face_detected ? 80 : 0);
      const newEye = result.eye_forward ?? (result.face_detected ? 80 : 0);

      participant.aiObservations.frameCount = count;
      participant.aiObservations.faceVisibility = Math.round(((oldFace * (count - 1)) + newFace) / count);
      participant.aiObservations.headPoseForward = Math.round(((oldHead * (count - 1)) + newHead) / count);
      participant.aiObservations.eyeForward = Math.round(((oldEye * (count - 1)) + newEye) / count);
      participant.aiObservations.blinkCount = result.blink_count ?? participant.aiObservations.blinkCount;
      participant.aiObservations.yawnCount = result.yawn_count ?? participant.aiObservations.yawnCount;
      participant.aiObservations.smileCount = result.smile_count ?? participant.aiObservations.smileCount;

      if (result.engagement_estimate !== undefined) {
        // Smooth engagement score update
        const prevScore = participant.engagementScore || 0;
        participant.engagementScore = Math.round(prevScore === 0 ? result.engagement_estimate : (prevScore * 0.4 + result.engagement_estimate * 0.6));
      }

      if (result.emotions) {
        Object.keys(result.emotions).forEach((k) => {
          if (participant.aiObservations.emotions[k] !== undefined) {
            participant.aiObservations.emotions[k] = result.emotions[k];
          }
        });
      }

      participant.markModified('aiObservations');
      participant.save().catch(e => console.warn('[meetingSocket] Save error:', e.message));

      const room = getRoom(socket.meetingDbId);
      if (socket.isHost && room) {
        room.hostSocketId = socket.id;
      }

      const payload = {
        participantId: socket.participantId,
        participantName: socket.user.name,
        metrics: result
      };

      if (room && room.hostSocketId) {
        io.to(room.hostSocketId).emit('analytics-update', payload);
      }
      socket.emit('analytics-update', payload);
    });

    socket.on('recording-started', async () => {
      if (!socket.isHost) return;
      const room = getRoom(socket.meetingDbId);
      room.recording = true;
      const meeting = await Meeting.findById(socket.meetingDbId);
      await notifyHost(meeting, 'recording_started', 'Recording Started', 'Meeting recording has started');
      io.to(socket.meetingDbId).emit('recording-state', { recording: true });
    });

    socket.on('recording-stopped', async () => {
      if (!socket.isHost) return;
      const room = getRoom(socket.meetingDbId);
      room.recording = false;
      const meeting = await Meeting.findById(socket.meetingDbId);
      await notifyHost(meeting, 'recording_stopped', 'Recording Stopped', 'Meeting recording has stopped');
      io.to(socket.meetingDbId).emit('recording-state', { recording: false });
    });

    socket.on('approve-camera-request', async ({ participantId, approved }) => {
      if (!socket.isHost) return;

      const participant = await Participant.findById(participantId);
      if (!participant) return;

      if (approved) {
        participant.cameraExempt = true;
        participant.visualMetricsAvailable = false;
        participant.status = 'joined';
        await participant.save();

        io.to(socket.meetingDbId).emit('camera-request-resolved', {
          participantId,
          approved: true
        });

        await createNotification({
          userId: participant.userId,
          meetingId: socket.meetingDbId,
          type: 'camera_approved',
          title: 'Camera Request Approved',
          message: 'You may join without camera. Visual analytics disabled.'
        });
      } else {
        participant.status = 'left';
        await participant.save();

        io.to(socket.meetingDbId).emit('camera-request-resolved', {
          participantId,
          approved: false
        });

        await createNotification({
          userId: participant.userId,
          meetingId: socket.meetingDbId,
          type: 'camera_rejected',
          title: 'Camera Request Rejected',
          message: 'Your request to join without camera was rejected.'
        });
      }
    });

    socket.on('end-meeting', async () => {
      if (!socket.isHost) return;
      io.to(socket.meetingDbId).emit('meeting-ended', { message: 'Host ended the meeting' });
    });

    socket.on('disconnect', async () => {
      if (!socket.meetingDbId) return;

      const room = getRoom(socket.meetingDbId);
      room.participants.delete(socket.id);

      socket.to(socket.meetingDbId).emit('user-left', {
        socketId: socket.id,
        name: socket.user.name
      });

      await Participant.findByIdAndUpdate(socket.participantId, {
        leaveTime: new Date(),
        status: 'left'
      }).catch(() => { });

      const meeting = await Meeting.findById(socket.meetingDbId);
      if (meeting && !socket.isHost) {
        await notifyHost(
          meeting,
          'participant_left',
          'Participant Left',
          `${socket.user.name} left the meeting`
        );
      }

      if (room.participants.size === 0) {
        roomState.delete(socket.meetingDbId);
      }
    });
  });
}

module.exports = { setupSocketHandlers };
