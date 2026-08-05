const mongoose = require('mongoose');

const meetingReportSchema = new mongoose.Schema(
  {
    meetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true, unique: true },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attendanceReport: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String,
        email: String,
        joinTime: Date,
        leaveTime: Date,
        durationMinutes: Number,
        engagementScore: Number
      }
    ],
    pdfPath: { type: String, default: null },
    generatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('MeetingReport', meetingReportSchema);
