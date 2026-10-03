import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Scheme from '../models/Scheme.js';
import { missingSchemeFields, parseSchemeWorkbook } from '../services/schemeImport.service.js';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const workbookPath = path.join(dataDir, 'Growthora_Schemes.xlsx');
const seedPmegp = {
	schemeId: 'SCH001', name: 'PMEGP', category: 'Self Employment', level: 'Central', ministryAgency: 'KVIC / DIC', ministry: 'KVIC / DIC',
	targetApplicant: 'New entrepreneurs', eligibleEntity: ['Individual'], sectorFit: ['General'], promoterCategoryFit: ['General', 'Women', 'SC', 'ST', 'Minority'], promoterFit: ['General', 'Women', 'SC', 'ST', 'Minority'],
	stageFit: ['Idea', 'New'], stateFilter: 'All', mustHaveRegn: 'None', mustHaveReg: 'None', preferredRegn: 'GST', preferredReg: 'GST', fundingFit: ['Loan', 'Subsidy'],
	minProject: 100000, maxProject: 5000000, baseWeight: 8, docsNotes: 'Project report; age 18+', notes: 'Project report; age 18+', isActive: true, isPublished: true,
};

await connectDB();
let seeded = 0;
for await (const existing of Scheme.find()) {
	if (existing.schemeId === 'SCH001' && missingSchemeFields(existing).length) Object.assign(existing, seedPmegp);
	existing.isComplete = missingSchemeFields(existing).length === 0;
	if (!existing.isComplete) existing.isPublished = false;
	await existing.save();
}
if (fs.existsSync(workbookPath)) {
	const { rows, errors } = parseSchemeWorkbook(workbookPath);
	const invalidRows = new Set(errors.map((error) => error.row));
	errors.forEach((error) => console.warn(`Skipped workbook row ${error.row} (${error.schemeId || 'unknown'}): ${error.message}`));
	for (let index = 0; index < rows.length; index++) {
		const { __excelRow: rowNumber, ...data } = rows[index];
		if (invalidRows.has(rowNumber)) continue;
		if (!data.schemeId) continue;
		if (await Scheme.exists({ schemeId: data.schemeId })) continue;
		await Scheme.create(data);
		seeded++;
	}
} else {
	console.warn('Workbook not found at server/data/Growthora_Schemes.xlsx; seeding PMEGP only.');
}

if (!(await Scheme.exists({ schemeId: 'SCH001' }))) {
	await Scheme.create(seedPmegp);
	seeded++;
}
console.log(`Seeded ${seeded} new schemes; ${await Scheme.countDocuments()} schemes now available`);
await mongoose.disconnect();
