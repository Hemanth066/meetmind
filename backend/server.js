const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const config = require('./config');
const { setupSocketHandlers } = require('./socket/meetingSocket');

const authRoutes = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');
const notificationRoutes = require('./routes/notifications');

connectDB();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

setupSocketHandlers(io);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const frontendPath = path.join(__dirname, '..', 'frontend');
const uploadsPath = path.join(__dirname, config.uploadDir);

app.use(express.static(frontendPath));
app.use('/uploads', express.static(uploadsPath));

app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok', service: 'MeetMind API' });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  const file = path.join(frontendPath, req.path === '/' ? 'index.html' : req.path);
  res.sendFile(file, (err) => {
    if (err) res.sendFile(path.join(frontendPath, 'index.html'));
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

const PORT = config.port;
server.listen(PORT, () => {
  console.log(`MeetMind server running on http://localhost:${PORT}`);
});

module.exports = { app, server, io };
