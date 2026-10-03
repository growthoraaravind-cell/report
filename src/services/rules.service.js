import Scheme from '../models/Scheme.js';
import RuleSetting from '../models/RuleSetting.js';
import { DEFAULT_RULES } from '../config/defaultRules.js';
import { cached } from '../utils/cache.js';
export const SITE_DEFAULTS = { company: 'Growthora', website: 'https://growthora.co.in', phone: '+91 6360886843', whatsapp: 'https://wa.me/916360886843', email: 'info@growthora.co.in', social: {}, seo: { title: 'Growthora - Government Scheme Eligibility', description: 'Discover every government scheme your business qualifies for.' } };
export const getRules = () => cached('rules', 60_000, async () => ({ ...DEFAULT_RULES, ...((await RuleSetting.findOne({ key: 'default' }).lean())?.value || {}) }));
export const getSchemes = () => cached('schemes', 60_000, () => Scheme.find({ isActive: true, isPublished: true, isComplete: true }).lean());
export const getSite = async () => ({ ...SITE_DEFAULTS, ...((await RuleSetting.findOne({ key: 'site' }).lean())?.value || {}) });
