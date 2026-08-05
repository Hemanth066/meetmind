const mongoose = require('mongoose');

const meetingSettingsSchema = new mongoose.Schema(
  {
    waitingRoom: { type: Boolean, default: true },
    aiAnalytics: { type: Boolean, default: true },
    recording: { type: Boolean, default: false },
    chat: { type: Boolean, default: true },
    screenSharing: { type: Boolean, default: true },
    cameraRequired: { type: Boolean, default: false }
  },
  { _id: false }
);

const meetingSchema = new mongoose.Schema(
  {
    meetingId: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    title: { type: String, default: 'Untitled Meeting' },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scheduledAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['scheduled', 'live', 'ended'],
      default: 'scheduled'
    },
    settings: { type: meetingSettingsSchema, default: () => ({}) },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Meeting', meetingSchema);
