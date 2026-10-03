export const DEFAULT_RULES = {
  points: { entity: 3, stage: 3, promoter: 3, sector: 2, state: 2, mustReg: 2, preferredReg: 1, funding: 2, project: 2 },
  thresholds: { eligibleNow: 20, afterAction: 14 },
  gates: { missingMustRegCapsAtAfterAction: true, stateMismatchIsLowFit: true, entityMismatchIsLowFit: true },
  sectorAliases: { Agri: ['General'], Textile: ['Manufacturing'], 'Pharma/MedTech': ['Manufacturing', 'Technology'], Electronics: ['Manufacturing', 'Technology'], Export: ['General'] },
  readinessWeights: { scheme: 50, website: 25, social: 25 },
};
