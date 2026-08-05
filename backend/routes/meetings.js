const express = require('express');
const { protect } = require('../middleware/auth');
const { isMeetingHost } = require('../middleware/meetingAuth');
const meetingController = require('../controllers/meetingController');

const router = express.Router();

router.use(protect);

router.post('/create', meetingController.createMeeting);
router.post('/join', meetingController.joinMeeting);
router.get('/history', meetingController.getMeetingHistory);
router.get('/upcoming', meetingController.getUpcomingMeetings);
router.get('/:id', meetingController.getMeeting);

router.post('/:id/camera-exemption', meetingController.requestCameraExemption);
router.get('/:meetingId/analytics/participant', meetingController.getParticipantAnalytics);

router.get('/:meetingId/camera-requests', isMeetingHost, meetingController.getPendingCameraRequests);
router.post('/:meetingId/camera-requests/:participantId/approve', isMeetingHost, meetingController.approveCameraExemption);
router.post('/:meetingId/camera-requests/:participantId/reject', isMeetingHost, meetingController.rejectCameraExemption);
router.get('/:meetingId/analytics/host', isMeetingHost, meetingController.getHostAnalytics);
router.post('/:meetingId/end', isMeetingHost, meetingController.endMeeting);
router.get('/:meetingId/report/download', isMeetingHost, meetingController.downloadReport);

module.exports = router;
