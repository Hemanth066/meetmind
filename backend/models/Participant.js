const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema(
  {
    meetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['host', 'participant'], default: 'participant' },
    joinTime: { type: Date, default: null },
    leaveTime: { type: Date, default: null },
    speakingTimeSeconds: { type: Number, default: 0 },
    cameraEnabled: { type: Boolean, default: false },
    cameraExempt: { type: Boolean, default: false },
    cameraExemptReason: { type: String, default: null },
    muteEnabled: { type: Boolean, default: false },
    handRaised: { type: Boolean, default: false },
    chatMessageCount: { type: Number, default: 0 },
    raiseHandCount: { type: Number, default: 0 },
    engagementScore: { type: Number, default: 0 },
    visualMetricsAvailable: { type: Boolean, default: false },
    aiObservations: {
      faceVisibility: { type: Number, default: 0 },
      headPoseForward: { type: Number, default: 0 },
      eyeForward: { type: Number, default: 0 },
      blinkCount: { type: Number, default: 0 },
      yawnCount: { type: Number, default: 0 },
      smileCount: { type: Number, default: 0 },
      frameCount: { type: Number, default: 0 },
      emotions: {
        happy: { type: Number, default: 0 },
        neutral: { type: Number, default: 0 },
        sad: { type: Number, default: 0 },
        angry: { type: Number, default: 0 },
        surprised: { type: Number, default: 0 }
      }
    },
    audioMetrics: {
      voiceActivityRatio: { type: Number, default: 0 },
      silenceDurationSeconds: { type: Number, default: 0 },
      speechFrequency: { type: Number, default: 0 }
    },
    status: {
      type: String,
      enum: ['waiting', 'pending_approval', 'joined', 'left', 'removed'],
      default: 'waiting'
    }
  },
  { timestamps: true }
);

participantSchema.index({ meetingId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Participant', participantSchema);
