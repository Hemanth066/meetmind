require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

module.exports = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/meetmind',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5000',
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8001',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'MeetMind <noreply@meetmind.app>'
  }
};
