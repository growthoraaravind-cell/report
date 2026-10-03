import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xlsx from 'xlsx';
import Scheme from '../src/models/Scheme.js';
import { missingSchemeFields, parseSchemeWorkbook } from '../src/services/schemeImport.service.js';

test('scheme completeness is computed and placeholders cannot be complete', async () => {
  const complete = new Scheme({ schemeId: 'sch010', name: 'Example', level: 'Central', eligibleEntity: ['Individual'], sectorFit: ['General'], promoterCategoryFit: ['General'], stageFit: ['New'], fundingFit: ['Loan'] });
  await complete.validate();
  assert.equal(complete.schemeId, 'SCH010');
  assert.equal(complete.isComplete, true);
  const placeholder = new Scheme({ schemeId: 'SCH082', name: 'Scheme 82', level: 'Central', eligibleEntity: ['Individual'], sectorFit: ['General'], promoterCategoryFit: ['General'], stageFit: ['New'], fundingFit: ['Loan'] });
  await placeholder.validate();
  assert.equal(placeholder.isComplete, false);
  assert.ok(missingSchemeFields(placeholder).includes('name (placeholder)'));
});

test('published incomplete schemes fail validation', async () => {
  const incomplete = new Scheme({ schemeId: 'SCH011', name: 'Incomplete', isPublished: true });
  await assert.rejects(incomplete.validate(), /cannot be published/i);
});

test('a missing level stays incomplete instead of defaulting to Central', async () => {
  const scheme = new Scheme({ schemeId: 'SCH012', name: 'No level', eligibleEntity: ['Individual'], sectorFit: ['General'], promoterCategoryFit: ['General'], stageFit: ['New'], fundingFit: ['Loan'] });
  await scheme.validate();
  assert.equal(scheme.isComplete, false);
  assert.ok(missingSchemeFields(scheme).includes('level'));
});

test('workbook parser handles expected headers, delimiter variants and placeholders', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'growthora-schemes-'));
  const file = path.join(directory, 'schemes.xlsx');
  const headers = ['Scheme ID', 'Scheme Name', 'Category', 'Level', 'Ministry/Agency', 'Target Applicant', 'Eligible Entity', 'Sector Fit', 'Promoter Category Fit', 'Stage Fit', 'State Filter', 'Must Have Regn', 'Preferred Regn', 'Funding Fit', 'Min Project ₹', 'Max Project ₹', 'Base Weight', 'Docs / Notes'];
  const rows = [
    headers,
    ['SCH001', 'PMEGP', 'Self Employment', 'Central', 'KVIC / DIC', 'New entrepreneurs', 'Individual', 'General', 'General/Women/SC/ST/Minority', 'Idea|New', 'All', 'None', 'GST', 'Loan|Subsidy', '₹100,000', '5,000,000', '8', 'Project report'],
    ['SCH082', 'Scheme 82', '', 'Central', '', '', '', '', '', '', 'All', 'None', 'None', '', '', '', '6', 'Placeholder'],
  ];
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), 'Scheme_Matrix_100');
  xlsx.writeFile(workbook, file);
  try {
    const result = parseSchemeWorkbook(file);
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows[0].isPublished, true);
    assert.deepEqual(result.rows[0].promoterCategoryFit, ['General', 'Women', 'SC', 'ST', 'Minority']);
    assert.deepEqual(result.rows[0].stageFit, ['Idea', 'New']);
    assert.equal(result.rows[0].minProject, 100000);
    assert.equal(result.rows[1].isPublished, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});