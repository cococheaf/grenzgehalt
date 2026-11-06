import { round } from './calculator.mjs?v=4.23.0';

import { regularLIPayroll } from './payroll.mjs?v=4.23.0';
export function liechtensteinPayslip(inputs) {
  if(inputs.raw.foreignCountry!=='li'||inputs.li.annual-inputs.li.special<=0)return null;
  return regularLIPayroll(inputs);
}
export function payslipLines(slip) {
  if(!slip)return [];
  const c=slip.contributions;
  return [['Brutto · laufender Bezug',slip.gross],['AHV / IV · 4,7 %',round(c.ahv+c.iv)],['FAK · Arbeitnehmer · 0,2 %',c.fak],['ALV · 0,5 %',c.alv],['NBU',c.nbu],['KTG',c.ktg],[`PK · ${slip.assumptions.pensionPayments} Arbeitnehmerbeiträge im Jahr`,c.pension],['Sozialabzüge gesamt',slip.social],['Netto vor Quellensteuer und KK',slip.netBeforeSource],['Quellensteuer · 4 %',slip.source],['Arbeitgeber-KK-Beitrag · zusätzlich',slip.subsidy],['Auszahlung vom Arbeitgeber',slip.payout]];
}
export const PAYSLIP_NOTE='Normaler Lohnmonat ohne 13./14. Gehalt oder Bonus, vollständig in CHF. ÖGK/private Grundprämie und österreichische Steuer werden anschließend separat berücksichtigt. PK und Arbeitgeber-KK werden zwölfmal pro Jahr berücksichtigt; beim 13./14. Gehalt fällt keine zusätzliche feste Zahlung an. ALV-Basis im normalen Monat: tatsächliches Brutto bis 10.500 CHF; NBU/KTG bis 12.350 CHF. Die gewählte Lohnrundung gilt je Abzugszeile. Die Planung verwendet 2026; historische Lohnzettel können andere Sätze und Bemessungsgrundlagen enthalten.';
