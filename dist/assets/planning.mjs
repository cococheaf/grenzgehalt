// Optional planning parameters leave earlier saved scenarios on their original model.
export const planningDefaults = Object.freeze({
  atPayments: '14',
  atChurch: '0',
  atExpenses: '0',
  liEmployer: 'private',
  liCivil: 'single',
  liWorkload: '100',
  pensionAge: 'standard',
  chResidence: 'at',
  chTaxMode: 'withholding',
  chPriceFactor: '1',
  localHealthCHF: '',
  mobilityCHF: '0',
  mealsCHF: '0',
  parkingCHF: '0',
  familyCashCHF: '0',
  liChildAges: '',
  liTwins: false,
});

export const foreignPlanningKeys = Object.keys(planningDefaults).filter(key => !key.startsWith('at'));

// BAG, September 2026: 2026 monthly mean premiums, adults and young adults.
const swissPremiums = {
  AG:[440.2,301.4], AI:[321.4,213.4], AR:[406.1,278.7], BE:[470.7,317.7],
  BL:[522.6,359.3], BS:[546.1,392.7], FR:[442.6,302.8], GE:[585.4,435.8],
  GL:[415.4,278.9], GR:[399.8,277.7], JU:[520.5,326.1], LU:[403.9,273.8],
  NE:[530.8,361.3], NW:[376.2,259.2], OW:[371.1,254], SG:[407.2,277],
  SH:[444.4,309.3], SO:[466.7,313.8], SZ:[399.2,265.5], TG:[413,283.9],
  TI:[582.3,404.2], UR:[361.6,231.5], VD:[526.6,371.1], VS:[436.1,295.7],
  ZG:[311.2,226.8], ZH:[451.3,317.2],
};
export function suggestedLocalPremium({country, resident, canton, age}) {
  if (country === 'li') return ['liMinor','liYouth'].includes(age) ? 197.07 : 385.70;
  const young = age === 'chUnder25';
  if (resident) return swissPremiums[canton][young ? 1 : 0];
  // Median of the 13 2026 BAG Austria tariffs without accident cover.
  return young ? 429.20 : 447.40;
}

export function estimatedSwissPension(annual, age) {
  const savingsRates = {chUnder25:0, ch25:0.07, ch35:0.10, ch45:0.15, ch55:0.18};
  if (!(age in savingsRates) || annual <= 22680) return 0;
  const coordinated = Math.max(3780, Math.min(annual, 90720) - 26460);
  return Math.round(coordinated * savingsRates[age] * 50) / 100;
}

export function liFamilyEstimate(value, twins = false) {
  const parts = String(value).trim().split(/[\s,;]+/).filter(Boolean);
  if (parts.length > 20 || parts.some(age => !/^\d{1,2}$/.test(age) || Number(age) > 17)) {
    throw new Error('Für die LI-Kinderzulagen bitte Altersangaben von 0 bis 17 eingeben.');
  }
  return parts.reduce((sum, age) => sum + (parts.length >= 3 || Number(age) >= 10 ? 360 : 310), 0)
    + (twins && parts.length === 2 && parts[0] === parts[1] && Number(parts[0]) < 10 ? 100 : 0);
}

export function austrianDeductions({expenses=0,church=0}={}) {
  return Math.max(132, expenses) + Math.min(600, church);
}

export function liPublicWithholding(annualGross, civilStatus) {
  const limits = civilStatus === 'married'
    ? [80000,140000,200000,250000,350000,450000,600000,1000000]
    : [40000,60000,80000,120000,160000,200000,300000,500000];
  const rates = [4,5,7,9,11,13,15,17,19];
  const band = limits.findIndex((limit, index) => annualGross < limit || index === limits.length - 1 && annualGross === limit);
  return Math.round(annualGross * rates[band === -1 ? rates.length - 1 : band]) / 100;
}
