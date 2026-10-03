import mongoose from 'mongoose';
// Event log: session_start, page_view, cta_click, eligibility_started, wizard_step, submission_completed,
// report_viewed, report_downloaded, chat_opened, contact_click
export default mongoose.model('PageView', new mongoose.Schema({ visitorId: { type: String, index: true }, type: { type: String, index: true }, path: String, meta: Object, createdAt: { type: Date, default: Date.now, index: true } }));
