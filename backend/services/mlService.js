const axios = require('axios');
const config = require('../config');

async function analyzeFrame(frameBase64, participantId) {
  try {
    console.log('[AI Pipeline] Sending frame to Python ML service...');

    const { data } = await axios.post(
      `${config.mlServiceUrl}/analyze/frame`,
      {
        frame: frameBase64,
        participant_id: participantId
      },
      { timeout: 10000 }
    );

    console.log('[AI Pipeline] Python ML response received:', data);

    return data;
  } catch (err) {
    console.error('[AI Pipeline] ML frame analysis error:', err.message);
    return null;
  }
}

async function processMeetingRecording(meetingId, audioPath, transcriptText) {
  try {
    const { data } = await axios.post(`${config.mlServiceUrl}/analyze/meeting`, {
      meeting_id: meetingId,
      audio_path: audioPath,
      transcript: transcriptText
    }, { timeout: 300000 });
    return data;
  } catch (err) {
    console.error('ML meeting analysis error:', err.message);
    return null;
  }
}

async function checkMlHealth() {
  try {
    const { data } = await axios.get(`${config.mlServiceUrl}/health`, { timeout: 5000 });
    return data;
  } catch {
    return { status: 'unavailable' };
  }
}

module.exports = { analyzeFrame, processMeetingRecording, checkMlHealth };
