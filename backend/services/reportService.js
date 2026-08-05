const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function generateMeetingReportPDF(reportData, filename) {
  const reportsDir = path.join(__dirname, '..', config.uploadDir, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const filePath = path.join(reportsDir, filename);
  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(22).fillColor('#1e40af').text('MeetMind Meeting Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).fillColor('#333');

  doc.text(`Meeting: ${reportData.title || 'Untitled'}`);
  doc.text(`Meeting ID: ${reportData.meetingId}`);
  doc.text(`Date: ${reportData.date || new Date().toLocaleString()}`);
  doc.text(`Duration: ${reportData.duration || 0} minutes`);
  doc.moveDown();

  doc.fontSize(16).fillColor('#1e40af').text('Summary');
  doc.fontSize(11).fillColor('#333').text(reportData.summary || 'No summary available.');
  doc.moveDown();

  if (reportData.keyPoints?.length) {
    doc.fontSize(14).fillColor('#1e40af').text('Key Discussion Points');
    reportData.keyPoints.forEach((p) => doc.fontSize(11).fillColor('#333').text(`• ${p}`));
    doc.moveDown();
  }

  if (reportData.actionItems?.length) {
    doc.fontSize(14).fillColor('#1e40af').text('Action Items');
    reportData.actionItems.forEach((a) =>
      doc.fontSize(11).fillColor('#333').text(`• ${a.task}${a.assignee ? ` (${a.assignee})` : ''}`)
    );
    doc.moveDown();
  }

  doc.fontSize(14).fillColor('#1e40af').text('Attendance');
  doc.moveDown(0.5);
  (reportData.attendance || []).forEach((a) => {
    doc.fontSize(10).fillColor('#333').text(
      `${a.name} | Join: ${a.joinTime || 'N/A'} | Leave: ${a.leaveTime || 'N/A'} | Engagement: ${a.engagementScore ?? 'N/A'}%`
    );
  });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

module.exports = { generateMeetingReportPDF };
