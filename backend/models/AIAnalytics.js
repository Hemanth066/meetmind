const mongoose = require('mongoose');

const aiAnalyticsSchema = new mongoose.Schema(
  {
    meetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true, unique: true },
    transcript: { type: String, default: '' },
    transcriptSegments: [
      {
        speaker: String,
        text: String,
        startTime: Number,
        endTime: Number
      }
    ],
    summary: { type: String, default: '' },
    keyPoints: [{ type: String }],
    actionItems: [
      {
        task: String,
        assignee: String,
        deadline: String
      }
    ],
    keywords: [{ type: String }],
    overallEngagement: { type: Number, default: 0 },
    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AIAnalytics', aiAnalyticsSchema);
