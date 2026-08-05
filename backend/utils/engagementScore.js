/**
 * Calculate engagement score from measurable factors.
 * Visual metrics marked N/A when camera unavailable.
 */
function calculateEngagementScore(participant, meetingDurationSeconds, totalSpeakingSeconds) {
  const weights = {
    attendance: 0.15,
    speaking: 0.25,
    faceVisibility: 0.15,
    headPose: 0.1,
    eyeDirection: 0.1,
    chat: 0.1,
    raiseHand: 0.15
  };

  const joinTime = participant.joinTime ? new Date(participant.joinTime).getTime() : null;
  const leaveTime = participant.leaveTime
    ? new Date(participant.leaveTime).getTime()
    : Date.now();
  const attendedSeconds =
    joinTime && meetingDurationSeconds > 0
      ? Math.min((leaveTime - joinTime) / 1000, meetingDurationSeconds)
      : 0;

  const attendanceScore = meetingDurationSeconds
    ? Math.min(100, (attendedSeconds / meetingDurationSeconds) * 100)
    : 0;

  const speakingScore =
    totalSpeakingSeconds > 0
      ? Math.min(100, (participant.speakingTimeSeconds / totalSpeakingSeconds) * 100 * 3)
      : participant.speakingTimeSeconds > 0
        ? 50
        : 0;

  const chatScore = Math.min(100, participant.chatMessageCount * 10);
  const raiseHandScore = Math.min(100, participant.raiseHandCount * 20);

  let visualAvailable = participant.visualMetricsAvailable && !participant.cameraExempt;
  let faceScore = null;
  let headScore = null;
  let eyeScore = null;

  if (visualAvailable && participant.aiObservations) {
    const obs = participant.aiObservations;
    faceScore = obs.faceVisibility || 0;
    headScore = obs.headPoseForward || 0;
    eyeScore = obs.eyeForward || 0;
  }

  let score;
  if (visualAvailable) {
    score =
      weights.attendance * attendanceScore +
      weights.speaking * speakingScore +
      weights.faceVisibility * faceScore +
      weights.headPose * headScore +
      weights.eyeDirection * eyeScore +
      weights.chat * chatScore +
      weights.raiseHand * raiseHandScore;
  } else {
    const renormalized =
      weights.attendance + weights.speaking + weights.chat + weights.raiseHand;
    score =
      ((weights.attendance / renormalized) * attendanceScore +
        (weights.speaking / renormalized) * speakingScore +
        (weights.chat / renormalized) * chatScore +
        (weights.raiseHand / renormalized) * raiseHandScore);
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

module.exports = { calculateEngagementScore };
