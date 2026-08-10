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

  let visualAvailable = (participant.visualMetricsAvailable || (participant.cameraEnabled && (participant.aiObservations?.frameCount > 0 || participant.aiObservations?.faceVisibility > 0))) && !participant.cameraExempt;
  let faceScore = 0;
  let headScore = 0;
  let eyeScore = 0;

  if (visualAvailable && participant.aiObservations) {
    const obs = participant.aiObservations;
    faceScore = obs.faceVisibility || 80;
    headScore = obs.headPoseForward || 80;
    eyeScore = obs.eyeForward || 80;
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
    
    // If participant is on camera attending the meeting attentively, baseline score should reflect attendance & face score
    if (score < 40 && faceScore > 50) {
      score = Math.max(score, Math.round(faceScore * 0.7 + attendanceScore * 0.3));
    }
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
