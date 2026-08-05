const Meeting = require('../models/Meeting');

const isMeetingHost = async (req, res, next) => {
  try {
    const meeting = await Meeting.findById(req.params.meetingId || req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }
    if (meeting.hostId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Host access required' });
    }
    req.meeting = meeting;
    next();
  } catch {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { isMeetingHost };
