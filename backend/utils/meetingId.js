const generateMeetingId = () => {
  const part = () => Math.floor(100 + Math.random() * 900);
  return `${part()}-${part()}-${part()}`;
};

const generateMeetingPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
};

module.exports = { generateMeetingId, generateMeetingPassword };
