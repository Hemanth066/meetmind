const axios = require('axios');
const config = require('../config');

async function analyzeFrame(frameBase64, participantId) {
  try {
    const { data } = await axios.post(`${config.mlServiceUrl}/analyze/frame`, {
      frame: frameBase64,
      participant_id: participantId
    }, { timeout: 10000 });
    return data;
  } catch (err) {
    console.error('ML frame analysis error:', err.message);
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
