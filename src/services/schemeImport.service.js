import xlsx from 'xlsx';
const normalizeHeader = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const split = (value, extraSeparators = false) => String(value ?? '')
  .split(extraSeparators ? /[|,\/]/ : '|')
  .map((entry) => entry.trim())
  .filter(Boolean);
const num = (value, row, field, errors, schemeId) => {
  if (value === undefined || value === null || String(value).trim() === '') return 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(parsed)) errors.push({ row, schemeId, message: `${field} must be a valid number` });
  return Number.isFinite(parsed) ? parsed : 0;
};

export function missingSchemeFields(scheme) {
  const required = [
    ['level', Boolean(scheme.level)],
    ['eligibleEntity', Boolean(scheme.eligibleEntity?.length)],
    ['stageFit', Boolean(scheme.stageFit?.length)],
    ['fundingFit', Boolean(scheme.fundingFit?.length)],
    ['promoterCategoryFit', Boolean((scheme.promoterCategoryFit || scheme.promoterFit)?.length)],
    ['sectorFit', Boolean(scheme.sectorFit?.length)],
  ];
  if (/^scheme\s*\d+$/i.test(String(scheme.name || '').trim())) required.push(['name (placeholder)', false]);
  return required.filter(([, present]) => !present).map(([field]) => field);
}

function rowToScheme(row, rowNumber, errors) {
  const headers = Object.keys(row);
  const get = (...aliases) => {
    const header = headers.find((key) => aliases.some((alias) => normalizeHeader(key).includes(alias)));
    return header ? row[header] : '';
  };
  const schemeId = String(get('schemeid')).trim().toUpperCase();
  const name = String(get('schemename', 'name')).trim();
  if (!schemeId) errors.push({ row: rowNumber, schemeId: '', message: 'Scheme ID is required' });
  if (!name) errors.push({ row: rowNumber, schemeId, message: 'Scheme name is required' });
  const ministryAgency = String(get('ministryagency', 'ministry')).trim();
  const promoterCategoryFit = split(get('promotercategoryfit', 'promoterfit'), true);
  const scheme = {
    schemeId,
    name,
    category: String(get('category')).trim(),
    level: String(get('level')).trim() || undefined,
    ministryAgency,
    ministry: ministryAgency,
    targetApplicant: String(get('targetapplicant')).trim(),
    eligibleEntity: split(get('eligibleentity')),
    sectorFit: split(get('sectorfit')),
    promoterCategoryFit,
    promoterFit: promoterCategoryFit,
    stageFit: split(get('stagefit')),
    stateFilter: String(get('statefilter')).trim() || 'All',
    mustHaveRegn: String(get('musthaveregn', 'musthave')).trim() || 'None',
    mustHaveReg: String(get('musthaveregn', 'musthave')).trim() || 'None',
    preferredRegn: String(get('preferredregn', 'preferred')).trim() || 'None',
    preferredReg: String(get('preferredregn', 'preferred')).trim() || 'None',
    fundingFit: split(get('fundingfit')),
    minProject: num(get('minproject'), rowNumber, 'Min Project', errors, schemeId),
    maxProject: num(get('maxproject'), rowNumber, 'Max Project', errors, schemeId),
    baseWeight: num(get('baseweight'), rowNumber, 'Base Weight', errors, schemeId) || 6,
    docsNotes: String(get('docsnotes', 'notes')).trim(),
    notes: String(get('docsnotes', 'notes')).trim(),
    isActive: true,
  };
  const placeholder = /^scheme\s*\d+$/i.test(name);
  scheme.isComplete = missingSchemeFields(scheme).length === 0;
  scheme.isPublished = !placeholder && scheme.isComplete;
  return scheme;
}

// Parses Scheme_Matrix_100 or the first sheet. Data row numbers match Excel's visible rows.
export function parseSchemeWorkbook(file) {
  const workbook = xlsx.readFile(file, { cellDates: false });
  const sheet = workbook.Sheets.Scheme_Matrix_100 || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [], errors: [{ row: 1, schemeId: '', message: 'Workbook has no worksheets' }] };
  const source = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false, blankrows: true });
  const errors = [];
  const rows = source.map((row, index) => {
    if (!Object.values(row).some((value) => String(value ?? '').trim())) return null;
    const scheme = rowToScheme(row, index + 2, errors);
    return scheme.schemeId || scheme.name ? { ...scheme, __excelRow: index + 2 } : null;
  }).filter(Boolean);
  return { rows, errors };
}

export function parseSchemeSheet(file) {
  const { rows, errors } = parseSchemeWorkbook(file);
  if (errors.length) throw new Error(errors.map((error) => `Row ${error.row}: ${error.message}`).join('; '));
  return rows.filter((scheme) => scheme.schemeId);
}
