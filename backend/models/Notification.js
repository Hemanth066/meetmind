const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    meetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', default: null },
    type: {
      type: String,
      enum: [
        'participant_joined',
        'participant_left',
        'camera_disabled',
        'recording_started',
        'recording_stopped',
        'meeting_ended',
        'camera_request',
        'camera_approved',
        'camera_rejected'
      ],
      required: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
