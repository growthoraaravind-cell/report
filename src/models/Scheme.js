import mongoose from 'mongoose';
const arr = [String];
const schema = new mongoose.Schema({
  schemeId: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true }, category: { type: String, trim: true, index: true },
  level: { type: String, enum: ['Central', 'Central/State', 'State'], index: true },
  ministryAgency: { type: String, trim: true }, ministry: String, targetApplicant: String,
  eligibleEntity: arr, sectorFit: arr, promoterCategoryFit: arr, promoterFit: arr, stageFit: arr,
  stateFilter: { type: String, default: 'All', index: true },
  mustHaveRegn: { type: String, enum: ['None', 'Udyam', 'DPIIT', 'IEC', 'FSSAI', 'GST'], default: 'None' },
  mustHaveReg: { type: String, default: 'None' },
  preferredRegn: { type: String, enum: ['None', 'GST', 'Udyam'], default: 'None' }, preferredReg: String,
  fundingFit: arr, minProject: { type: Number, default: 0 }, maxProject: { type: Number, default: 0 },
  baseWeight: { type: Number, min: 1, max: 10, default: 6 }, docsNotes: String, notes: String,
  minBusinessAge: Number, maxTurnover: Number, requiresGeM: Boolean, districts: arr,
  description: String, benefits: [String], subsidyPercent: Number, officialUrl: String,
  documentsRequired: [String], howToApply: [String],
  isActive: { type: Boolean, default: true, index: true }, isPublished: { type: Boolean, default: false, index: true },
  isComplete: { type: Boolean, default: false, index: true },
}, { timestamps: true });
schema.index({ name: 'text', category: 'text' });
schema.index({ isPublished: 1, isActive: 1 });
schema.pre('validate', function computeCompleteness(next) {
  this.schemeId = String(this.schemeId || '').trim().toUpperCase();
  this.name = String(this.name || '').trim();
  this.ministryAgency ||= this.ministry;
  this.ministry ||= this.ministryAgency;
  this.promoterCategoryFit = this.promoterCategoryFit?.length ? this.promoterCategoryFit : this.promoterFit;
  this.promoterFit = this.promoterFit?.length ? this.promoterFit : this.promoterCategoryFit;
  if ((!this.mustHaveRegn || this.mustHaveRegn === 'None') && this.mustHaveReg && this.mustHaveReg !== 'None') this.mustHaveRegn = this.mustHaveReg;
  this.mustHaveRegn ||= 'None';
  this.mustHaveReg ||= this.mustHaveRegn;
  if ((!this.preferredRegn || this.preferredRegn === 'None') && this.preferredReg && this.preferredReg !== 'None') this.preferredRegn = this.preferredReg;
  this.preferredRegn ||= 'None';
  this.preferredReg ||= this.preferredRegn;
  this.docsNotes ||= this.notes;
  this.notes ||= this.docsNotes;
  this.isComplete = !/^scheme\s*\d+$/i.test(this.name)
    && Boolean(this.level)
    && Boolean(this.eligibleEntity?.length)
    && Boolean(this.stageFit?.length)
    && Boolean(this.fundingFit?.length)
    && Boolean(this.promoterCategoryFit?.length)
    && Boolean(this.sectorFit?.length);
  if (this.maxProject > 0 && this.maxProject < this.minProject) this.invalidate('maxProject', 'Maximum project cost must be at least the minimum');
  if (this.isPublished && !this.isComplete) {
    this.invalidate('isPublished', 'Scheme cannot be published until all required eligibility fields are complete');
  }
  next();
});
export default mongoose.model('Scheme', schema);
