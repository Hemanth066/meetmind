const Notification = require('../models/Notification');

async function createNotification({ userId, meetingId, type, title, message, metadata = {} }) {
  return Notification.create({ userId, meetingId, type, title, message, metadata });
}

async function notifyHost(meeting, type, title, message, metadata = {}) {
  return createNotification({
    userId: meeting.hostId,
    meetingId: meeting._id,
    type,
    title,
    message,
    metadata
  });
}

module.exports = { createNotification, notifyHost };
