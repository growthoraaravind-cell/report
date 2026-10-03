// AI assistant via Anthropic API (key + model in .env; never exposed to the browser) with a rule-based FAQ fallback.
const WA = 'https://wa.me/916360886843';
const HUMAN = `For anything complex, our team is happy to help: WhatsApp +91 6360886843 (${WA}) or info@growthora.co.in.`;
export const QUICK_REPLIES = ['Am I eligible for PMEGP?', 'How to get Udyam?', 'Improve my website', 'Talk to an expert'];
const FAQ = [
  [/udyam|msme regist/i, 'Udyam registration is free and online at udyamregistration.gov.in using your Aadhaar and PAN. It unlocks most MSME schemes. ' + HUMAN],
  [/dpiit|startup india/i, 'DPIIT recognition is applied for on the Startup India portal and gives access to the Seed Fund and tax benefits. ' + HUMAN],
  [/\bgst\b/i, 'GST registration is done on gst.gov.in with PAN, address proof and bank details. It improves your eligibility for many schemes. ' + HUMAN],
  [/\biec\b|export/i, 'An Importer-Exporter Code (IEC) is issued by DGFT and is required for export-linked schemes. ' + HUMAN],
  [/fssai|food licen/i, 'FSSAI registration/licence is needed for food businesses and food-processing schemes. ' + HUMAN],
  [/pmegp|mudra|cgtmse|stand.?up/i, 'Those are great options! Your exact fit depends on your profile - run the free Eligibility Check for a personalised ranking. ' + HUMAN],
  [/website|seo|social|instagram|facebook|linkedin/i, 'Our Digital Audit scores your website and social media and gives a clear improvement plan. Try it from the Digital Audit page. ' + HUMAN],
  [/expert|human|call|talk|whatsapp|contact/i, `Our team would love to help you. ${HUMAN}`],
];
export function faqReply(msg) {
  const hit = FAQ.find(([rx]) => rx.test(msg));
  return hit ? hit[1] : 'Thanks for your question! I can help with government schemes, registrations (Udyam, GST, DPIIT, IEC, FSSAI) and improving your digital presence. Try the free Eligibility Check for a personalised report. ' + HUMAN;
}
const system = (ctx) => `You are the Growthora assistant. Growthora (growthora.co.in) helps MSMEs, startups and entrepreneurs in India with government scheme and subsidy advisory, loan/CGTMSE/Mudra support, Udyam/GST/DPIIT/IEC/FSSAI registrations, startup funding, export support and digital presence growth.
Be warm, positive and concise. Never promise approvals or guaranteed subsidies. Do not invent scheme rules - say when something needs checking with the team. For complex cases, offer the human team: WhatsApp +91 6360886843, email info@growthora.co.in.
${ctx ? 'The user\'s own result (use it when relevant): ' + JSON.stringify(ctx).slice(0, 3000) : ''}`;
export async function chatReply({ history = [], message, context }) {
  const { ANTHROPIC_API_KEY: key, ANTHROPIC_MODEL: model } = process.env;
  if (key && model) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: AbortSignal.timeout(25000), headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 600, system: system(context), messages: [...history.slice(-10), { role: 'user', content: message }] }) });
      if (r.ok) { const j = await r.json(), text = j.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n'); if (text) return { reply: text, source: 'ai' }; }
    } catch { /* fall through to FAQ */ }
  }
  return { reply: faqReply(message), source: 'faq' };
}
