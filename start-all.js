const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting MeetMind Services (Backend + ML Service)...');

const mlService = spawn('python', ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8001'], {
  cwd: path.join(__dirname, 'ml-service'),
  shell: true,
  stdio: 'inherit'
});

const backendService = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, 'backend'),
  shell: true,
  stdio: 'inherit'
});

process.on('SIGINT', () => {
  mlService.kill();
  backendService.kill();
  process.exit();
});
