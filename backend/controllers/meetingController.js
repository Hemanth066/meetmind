const { body } = require('express-validator');
const Meeting = require('../models/Meeting');
const Participant = require('../models/Participant');
const AIAnalytics = require('../models/AIAnalytics');
const User = require('../models/User');
const validate = require('../middleware/validate');
const { generateMeetingId, generateMeetingPassword } = require('../utils/meetingId');
const { calculateEngagementScore } = require('../utils/engagementScore');
const { processMeetingRecording } = require('../services/mlService');
const { generateMeetingReportPDF } = require('../services/reportService');
const MeetingReport = require('../models/MeetingReport');
const { notifyHost } = require('../services/notificationService');

exports.createMeeting = [
  body('title').optional().trim(),
  body('scheduledAt').optional().isISO8601(),
  validate,
  async (req, res) => {
    try {
      let meetingId;
      do {
        meetingId = generateMeetingId();
      } while (await Meeting.findOne({ meetingId }));

      const password = generateMeetingPassword();
      const meeting = await Meeting.create({
        meetingId,
        password,
        title: req.body.title || 'Untitled Meeting',
        hostId: req.user._id,
        scheduledAt: req.body.scheduledAt || null,
        settings: {
          waitingRoom: req.body.settings?.waitingRoom ?? true,
          aiAnalytics: req.body.settings?.aiAnalytics ?? true,
          recording: req.body.settings?.recording ?? false,
          chat: req.body.settings?.chat ?? true,
          screenSharing: req.body.settings?.screenSharing ?? true,
          cameraRequired: req.body.settings?.cameraRequired ?? false
        }
      });

      await Participant.create({
        meetingId: meeting._id,
        userId: req.user._id,
        role: 'host',
        status: 'waiting'
      });

      await AIAnalytics.create({ meetingId: meeting._id });

      const link = `${req.protocol}://${req.get('host')}/join.html?id=${meetingId}`;

      res.status(201).json({
        success: true,
        meeting: {
          id: meeting._id,
          meetingId: meeting.meetingId,
          password: meeting.password,
          title: meeting.title,
          link,
          settings: meeting.settings,
          scheduledAt: meeting.scheduledAt
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
];

exports.joinMeeting = [
  body('meetingId').notEmpty(),
  body('password').notEmpty(),
  validate,
  async (req, res) => {
    try {
      const meeting = await Meeting.findOne({ meetingId: req.body.meetingId });
      if (!meeting) {
        return res.status(404).json({ success: false, message: 'Meeting not found' });
      }
      if (meeting.password !== req.body.password) {
        return res.status(401).json({ success: false, message: 'Invalid password' });
      }
      if (meeting.status === 'ended') {
        return res.status(400).json({ success: false, message: 'Meeting has ended' });
      }

      let participant = await Participant.findOne({
        meetingId: meeting._id,
        userId: req.user._id
      });

      if (!participant) {
        participant = await Participant.create({
          meetingId: meeting._id,
          userId: req.user._id,
          role: meeting.hostId.toString() === req.user._id.toString() ? 'host' : 'participant',
          status: 'waiting'
        });
      }

      res.json({
        success: true,
        meeting: {
          id: meeting._id,
          meetingId: meeting.meetingId,
          title: meeting.title,
          settings: meeting.settings,
          status: meeting.status,
          hostId: meeting.hostId
        },
        participant: {
          id: participant._id,
          role: participant.role,
          status: participant.status,
          cameraExempt: participant.cameraExempt
        },
        isHost: meeting.hostId.toString() === req.user._id.toString()
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
];

exports.getMeetingHistory = async (req, res) => {
  try {
    const participations = await Participant.find({ userId: req.user._id })
      .populate('meetingId')
      .sort({ updatedAt: -1 })
      .limit(50);

    const meetings = participations
      .filter((p) => p.meetingId)
      .map((p) => ({
        id: p.meetingId._id,
        meetingId: p.meetingId.meetingId,
        title: p.meetingId.title,
        status: p.meetingId.status,
        role: p.role,
        startedAt: p.meetingId.startedAt,
        endedAt: p.meetingId.endedAt,
        duration: p.meetingId.duration,
        engagementScore: p.engagementScore
      }));

    res.json({ success: true, meetings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUpcomingMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({
      hostId: req.user._id,
      scheduledAt: { $gte: new Date() },
      status: { $ne: 'ended' }
    }).sort({ scheduledAt: 1 });

    res.json({ success: true, meetings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    const isHost = meeting.hostId.toString() === req.user._id.toString();
    const participant = await Participant.findOne({
      meetingId: meeting._id,
      userId: req.user._id
    });

    if (!isHost && !participant) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, meeting, isHost, participant });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.requestCameraExemption = [
  body('reason').trim().notEmpty(),
  validate,
  async (req, res) => {
    try {
      const meetingId = req.params.meetingId || req.params.id;
      const meeting = await Meeting.findById(meetingId);
      if (!meeting) {
        return res.status(404).json({ success: false, message: 'Meeting not found' });
      }

      const participant = await Participant.findOne({
        meetingId: meeting._id,
        userId: req.user._id
      });

      if (!participant) {
        return res.status(403).json({ success: false, message: 'Not a participant' });
      }

      participant.status = 'pending_approval';
      participant.cameraExemptReason = req.body.reason;
      await participant.save();

      await notifyHost(
        meeting,
        'camera_request',
        'Camera Exemption Request',
        `${req.user.name} requested to join without camera: ${req.body.reason}`,
        { participantId: participant._id, userId: req.user._id, reason: req.body.reason }
      );

      res.json({ success: true, message: 'Request sent to host' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
];

exports.approveCameraExemption = async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.participantId);
    if (!participant) {
      return res.status(404).json({ success: false, message: 'Participant not found' });
    }

    participant.cameraExempt = true;
    participant.visualMetricsAvailable = false;
    participant.status = 'joined';
    await participant.save();

    res.json({ success: true, participant });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.rejectCameraExemption = async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.participantId);
    if (!participant) {
      return res.status(404).json({ success: false, message: 'Participant not found' });
    }

    participant.status = 'left';
    participant.cameraExemptReason = null;
    await participant.save();

    res.json({ success: true, message: 'Request rejected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.endMeeting = async (req, res) => {
  try {
    const meeting = req.meeting;
    meeting.status = 'ended';
    meeting.endedAt = new Date();
    if (meeting.startedAt) {
      meeting.duration = Math.round((meeting.endedAt - meeting.startedAt) / 60000);
    }
    await meeting.save();

    const participants = await Participant.find({ meetingId: meeting._id });
    const totalSpeaking = participants.reduce((s, p) => s + p.speakingTimeSeconds, 0);

    for (const p of participants) {
      p.leaveTime = p.leaveTime || new Date();
      p.engagementScore = calculateEngagementScore(
        p,
        (meeting.duration || 1) * 60,
        totalSpeaking
      );
      await p.save();
    }

    let analytics = await AIAnalytics.findOne({ meetingId: meeting._id });
    if (!analytics) {
      analytics = await AIAnalytics.create({ meetingId: meeting._id });
    }

    const chatMessages = await ChatMessage.find({ meetingId: meeting._id }).populate('userId', 'name').sort({ createdAt: 1 });
    let transcriptParts = [];
    transcriptParts.push(`Meeting Title: ${meeting.title}`);
    transcriptParts.push(`Duration: ${meeting.duration || 0} minutes`);
    transcriptParts.push(`Total Participants: ${participants.length}`);

    if (analytics.transcriptSegments && analytics.transcriptSegments.length > 0) {
      transcriptParts.push('\n--- Spoken Dialogue Transcript ---');
      analytics.transcriptSegments.forEach(seg => {
        transcriptParts.push(`[${seg.speaker}]: ${seg.text}`);
      });
    }

    if (chatMessages.length > 0) {
      transcriptParts.push('\n--- Meeting Chat & Notes ---');
      chatMessages.forEach(c => {
        const sender = c.senderName || c.userId?.name || 'Participant';
        transcriptParts.push(`[Chat - ${sender}]: ${c.message}`);
      });
    }

    if ((!analytics.transcriptSegments || analytics.transcriptSegments.length === 0) && chatMessages.length === 0) {
      transcriptParts.push('\nNo spoken dialogue or text chat messages were recorded during this session.');
    }

    const compiledTranscript = transcriptParts.join('\n');
    analytics.transcript = compiledTranscript;
    analytics.processingStatus = 'processing';
    await analytics.save();

    try {
      const result = await processMeetingRecording(meeting._id.toString(), null, compiledTranscript);
      if (result && (result.summary || result.key_points?.length)) {
        analytics.summary = result.summary || 'Meeting completed with ' + participants.length + ' participant(s).';
        analytics.keyPoints = result.key_points && result.key_points.length ? result.key_points : ['Meeting ended successfully', `Total participants: ${participants.length}`];
        analytics.actionItems = result.action_items || [];
        analytics.keywords = result.keywords || [];
        analytics.transcript = result.transcript || compiledTranscript;
        analytics.overallEngagement =
          participants.reduce((s, p) => s + (p.engagementScore || 0), 0) /
          Math.max(participants.length, 1);
      } else {
        const lines = compiledTranscript.split('\n').filter(l => l.trim() && !l.startsWith('Meeting Title:') && !l.startsWith('Duration:') && !l.startsWith('Total Participants:') && !l.startsWith('---'));
        analytics.summary = lines.length > 0
          ? `Meeting discussion summary: ${lines.slice(0, 4).join('. ')}`
          : `Meeting completed with ${participants.length} participant(s).`;
        analytics.keyPoints = lines.length > 0 ? lines.slice(0, 5) : [`Total duration: ${meeting.duration || 0}m`, `Participants: ${participants.length}`];
        analytics.transcript = compiledTranscript;
      }
      analytics.processingStatus = 'completed';
      await analytics.save();
    } catch (procErr) {
      console.error('Error processing meeting summary:', procErr);
      analytics.processingStatus = 'completed';
      const lines = compiledTranscript.split('\n').filter(l => l.trim() && !l.startsWith('Meeting Title:') && !l.startsWith('Duration:') && !l.startsWith('Total Participants:') && !l.startsWith('---'));
      analytics.summary = lines.length > 0
        ? `Meeting discussion summary: ${lines.slice(0, 4).join('. ')}`
        : `Meeting completed with ${participants.length} participant(s).`;
      analytics.keyPoints = lines.length > 0 ? lines.slice(0, 5) : [`Total duration: ${meeting.duration || 0}m`, `Participants: ${participants.length}`];
      analytics.transcript = compiledTranscript;
      await analytics.save();
    }

    await notifyHost(meeting, 'meeting_ended', 'Meeting Ended', `Meeting "${meeting.title}" has ended.`);

    res.json({ success: true, meeting });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getHostAnalytics = async (req, res) => {
  try {
    const meeting = req.meeting;
    const participants = await Participant.find({ meetingId: meeting._id }).populate(
      'userId',
      'name email profilePicture'
    );
    const analytics = await AIAnalytics.findOne({ meetingId: meeting._id });

    res.json({
      success: true,
      meeting,
      participants: participants.map((p) => ({
        id: p._id,
        user: p.userId,
        role: p.role,
        joinTime: p.joinTime,
        leaveTime: p.leaveTime,
        speakingTimeSeconds: p.speakingTimeSeconds,
        cameraEnabled: p.cameraEnabled,
        cameraExempt: p.cameraExempt,
        engagementScore: p.engagementScore,
        visualMetricsAvailable: p.visualMetricsAvailable,
        aiObservations: p.aiObservations,
        audioMetrics: p.audioMetrics,
        chatMessageCount: p.chatMessageCount,
        raiseHandCount: p.raiseHandCount,
        status: p.status
      })),
      analytics
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getParticipantAnalytics = async (req, res) => {
  try {
    const meetingId = req.params.meetingId || req.params.id;
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    const participant = await Participant.findOne({
      meetingId: meeting._id,
      userId: req.user._id
    });

    const isHost = meeting.hostId.toString() === req.user._id.toString();
    if (!participant && !isHost) {
      return res.status(403).json({ success: false, message: 'Access denied. You were not a participant in this meeting.' });
    }

    const analytics = await AIAnalytics.findOne({ meetingId: meeting._id });

    res.json({
      success: true,
      meeting: {
        id: meeting._id,
        title: meeting.title,
        duration: meeting.duration,
        endedAt: meeting.endedAt
      },
      summary: analytics?.summary || '',
      keyPoints: analytics?.keyPoints || [],
      actionItems: analytics?.actionItems || [],
      transcript: analytics?.transcript || '',
      participant: participant
        ? {
            joinTime: participant.joinTime,
            leaveTime: participant.leaveTime,
            speakingTimeSeconds: participant.speakingTimeSeconds,
            cameraEnabled: participant.cameraEnabled,
            cameraExempt: participant.cameraExempt,
            engagementScore: participant.engagementScore,
            visualMetricsAvailable: participant.visualMetricsAvailable,
            aiObservations: participant.visualMetricsAvailable
              ? participant.aiObservations
              : { note: 'Not Available - camera was off or exempt' },
            audioMetrics: participant.audioMetrics,
            chatMessageCount: participant.chatMessageCount,
            raiseHandCount: participant.raiseHandCount
          }
        : null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.downloadReport = async (req, res) => {
  try {
    const meeting = req.meeting;
    const participants = await Participant.find({ meetingId: meeting._id }).populate('userId', 'name email');
    const analytics = await AIAnalytics.findOne({ meetingId: meeting._id });

    const reportData = {
      title: meeting.title,
      meetingId: meeting.meetingId,
      date: meeting.endedAt || meeting.createdAt,
      duration: meeting.duration,
      summary: analytics?.summary || '',
      keyPoints: analytics?.keyPoints || [],
      actionItems: analytics?.actionItems || [],
      attendance: participants.map((p) => ({
        name: p.userId?.name || 'Unknown',
        joinTime: p.joinTime,
        leaveTime: p.leaveTime,
        engagementScore: p.engagementScore
      }))
    };

    const filename = `report-${meeting.meetingId.replace(/-/g, '')}.pdf`;
    const pdfPath = await generateMeetingReportPDF(reportData, filename);

    await MeetingReport.findOneAndUpdate(
      { meetingId: meeting._id },
      {
        meetingId: meeting._id,
        hostId: meeting.hostId,
        attendanceReport: reportData.attendance,
        pdfPath,
        generatedAt: new Date()
      },
      { upsert: true }
    );

    res.download(pdfPath);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPendingCameraRequests = async (req, res) => {
  try {
    const pending = await Participant.find({
      meetingId: req.meeting._id,
      status: 'pending_approval'
    }).populate('userId', 'name email profilePicture');

    res.json({ success: true, requests: pending });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
