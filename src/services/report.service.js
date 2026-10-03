// Branded PDF (pdfkit). Saved to server/uploads/documents/reports/; only the URL is stored in Mongo.
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { UPLOAD_ROOT } from '../config/multer.js';
const PLUM = '#5E1F4F', COPPER = '#B8643C', MUTED = '#6F6269';
const LOGO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/public/assets/images/logo.avif');
export async function generateReport(sub, result) {
  const dir = path.join(UPLOAD_ROOT, 'documents', 'reports'); fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-eligibility-report-${String(sub._id)}.pdf`, file = path.join(dir, name);
  const doc = new PDFDocument({ size: 'A4', margin: 48 }), out = fs.createWriteStream(file); doc.pipe(out);
  doc.rect(0, 0, 595, 90).fill(PLUM);
  if (fs.existsSync(LOGO)) doc.image(LOGO, 48, 18, { height: 54 });
  doc.fillColor('#fff').fontSize(18).font('Helvetica-Bold').text('Growthora Scheme Eligibility Assessment Report', 120, 30, { width: 430 });
  doc.fontSize(9).font('Helvetica').text('growthora.co.in  |  info@growthora.co.in  |  +91 6360886843', 120, 58);
  doc.fillColor(PLUM).font('Helvetica-Bold').fontSize(14).text(`Prepared for: ${sub.clientName}`, 48, 112);
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(`${sub.entityType} | ${sub.businessStage} | ${sub.promoterCategory} | ${sub.sector}`, 48, 132);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}  |  Overall readiness: ${sub.overallReadiness ?? result.schemeReadiness}%`);
  doc.moveDown().fillColor(COPPER).font('Helvetica-Bold').fontSize(11).text(`Eligible Now: ${result.counts.eligibleNow}    After Action: ${result.counts.afterAction}    Low Fit: ${result.counts.lowFit}`);
  let y = 190; doc.fillColor(PLUM).fontSize(13).text('Top 10 Recommended Schemes', 48, y); y += 24;
  doc.rect(48, y, 500, 22).fill(PLUM); doc.fillColor('#fff').fontSize(10);
  [['Rank', 54], ['Scheme', 100], ['Score', 360], ['Status', 420]].forEach(([t, x]) => doc.text(t, x, y + 6));
  y += 22; doc.font('Helvetica').fillColor('#2B2227');
  result.top15.slice(0, 10).forEach((r, i) => {
    if (i % 2) doc.rect(48, y, 500, 24).fill('#FFF8F5'); doc.fillColor('#2B2227');
    doc.text(String(i + 1), 54, y + 7); doc.text(r.name, 100, y + 7, { width: 250, ellipsis: true, lineBreak: false }); doc.text(`${r.score}/${r.maxScore}`, 360, y + 7); doc.text(r.status, 420, y + 7); y += 24;
  });
  const todo = result.top15.filter((r) => r.actions.length).slice(0, 5);
  if (todo.length) { y += 14; doc.fillColor(PLUM).font('Helvetica-Bold').fontSize(13).text('Quick wins to unlock more schemes', 48, y); y += 22; doc.font('Helvetica').fontSize(10).fillColor('#2B2227'); todo.forEach((r) => { doc.text(`- ${r.name}: ${r.actions.join(', ')}`, 48, y, { width: 500 }); y = doc.y + 4; }); }
  doc.fontSize(8).fillColor(MUTED).text('This report is indicative and based on the details you provided. It is not a guarantee of approval. Talk to our team for a personalised plan.', 48, 780, { width: 500, align: 'center' });
  doc.end(); await new Promise((res, rej) => { out.on('finish', res); out.on('error', rej); });
  return { url: `/uploads/documents/reports/${name}`, path: file, size: fs.statSync(file).size, originalName: name };
}
