import { austrianDeductions } from './planning.mjs';
import { roundedLIAnnual } from './payroll.mjs?v=4.23.0';
import { TAX } from './tax-data.mjs?v=4.23.0';
export const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const positive = n => Math.max(0, n);
export function tariff(income) {
  let prior=0, tax=0;
  for (const [limit,rate] of TAX.brackets) { const part=Math.max(0,Math.min(income,limit)-prior); tax+=part*rate; if(income<=limit)break; prior=limit; }
  return positive(tax);
}
export function pendler(distance=0,type='none',days=0,companyCar=false) {
  if(!Number.isFinite(distance)||distance<0)throw new Error('Ungültige Pendlerstrecke.');
  const factor=days>=11?1:days>=8?2/3:days>=4?1/3:0;
  let allowance=0;
  if(!companyCar && type==='small' && distance>=20)allowance=distance<=40?696:distance<=60?1356:2016;
  if(!companyCar && type==='large' && distance>=2)allowance=distance<=20?372:distance<=40?1476:distance<=60?2568:3672;
  return {allowance:allowance*factor,euro:allowance>0?distance*6*factor:0,factor};
}
export function credits(o={}) {
  const young=o.childrenYoung||0, adult=o.childrenAdult||0, children=young+adult;
  const share=o.familyShare??0;
  const family=(young*TAX.credits.childYoung+adult*TAX.credits.childAdult)*share;
  const avab=o.avab&&children>0?(children<=2?TAX.credits.avab[children]:TAX.credits.avabThird+(children-3)*TAX.credits.avabExtra):0;
  return {family,avab,traffic:TAX.credits.traffic};
}
export function specialFixedTax(amount) {
  let left=positive(amount), tax=0;
  for(const [width,rate] of TAX.special.bands){const part=Math.min(left,width);tax+=part*rate;left-=part;if(left<=0)break;}
  return {tax,overflow:left};
}
function alvRate(gross){return TAX.employee.alv.find(([limit])=>gross<=limit)[1];}
function validate(o,keys){for(const key of keys)if(typeof o[key]!=='number'||!Number.isFinite(o[key])||o[key]<0)throw new Error(`Ungültiger Wert: ${key}`);if(o.year!==2026)throw new Error('Für dieses Steuerjahr sind noch keine vollständigen Berechnungsdaten freigegeben.');}
export function calculateAT(o) {
  validate(o,['gross','benefit','taxFree','extraCosts']);
  const payments=o.payments??14;
  if(![12,14].includes(payments))throw new Error('Österreich: 12 oder 14 Bezüge wählen.');
  const monthly=o.period==='annual'?o.gross/payments:o.gross;
  if(monthly>2000000)throw new Error('Das Gehalt überschreitet den unterstützten Bereich.');
  const benefit=o.benefit, svGross=monthly+benefit;
  const marginal=svGross<=TAX.employee.marginal;
  const svRate=TAX.employee.health+TAX.employee.pension+alvRate(svGross)+TAX.employee.chamber+(o.region==='wien'?TAX.employee.housingVienna:TAX.employee.housing);
  const sv=round(marginal?0:Math.min(svGross,TAX.employee.monthlyCap)*svRate);
  const pp=pendler(o.distance||0,o.pendlerType,o.days||0,o.companyCar);
  const c=credits(o);
  const taxable=positive((monthly+benefit-sv-o.taxFree)*12-TAX.credits.expenses-pp.allowance);
  const annualRegularTax=positive(tariff(taxable)-c.family-c.traffic-c.avab-pp.euro);
  const monthlyTax=round(annualRegularTax/12);
  let specialCapLeft=TAX.employee.specialCap, cumulativeNet=0, prevFixedTax=0, cumulativeGross=0;
  const sixth=(monthly+benefit)*2;
  const specials=Array.from({length:payments-12},()=>{
    const base=Math.min(monthly,specialCapLeft);
    const specialSV=round(marginal?0:base*(TAX.employee.health+TAX.employee.pension+alvRate(svGross)));
    specialCapLeft=positive(specialCapLeft-base);
    const prevGross=cumulativeGross;cumulativeGross+=monthly;
    const privilegedGross=positive(Math.min(cumulativeGross,sixth)-Math.min(prevGross,sixth));
    const privilegedNet=monthly>0?privilegedGross*(1-specialSV/monthly):0;
    const ordinaryNet=positive(monthly-specialSV-privilegedNet);
    const previousOverflow=specialFixedTax(cumulativeNet).overflow;
    cumulativeNet+=privilegedNet;
    const fixed=specialFixedTax(cumulativeNet);
    const currentFixedTax=sixth<=TAX.special.exemption?0:round(fixed.tax);
    const overflow=ordinaryNet+positive(fixed.overflow-previousOverflow);
    const ordinaryTax=overflow>0?positive(round(positive(tariff(taxable+overflow*12)-c.family-c.traffic-c.avab-pp.euro)/12)-monthlyTax):0;
    const tax=round(currentFixedTax-prevFixedTax+ordinaryTax);
    prevFixedTax=currentFixedTax;
    return {gross:monthly,sv:specialSV,tax,net:round(monthly-specialSV-tax)};
  });
  const gross=round(monthly*payments), social=round(sv*12+specials.reduce((s,v)=>s+v.sv,0));
  const tax=round(monthlyTax*12+specials.reduce((s,v)=>s+v.tax,0));
  const net=round(gross-social-tax);
  const deductions=austrianDeductions(o)-TAX.credits.expenses;
  const assessmentRelief=deductions>0?round(Math.max(0,annualRegularTax-positive(tariff(positive(taxable-deductions))-c.family-c.traffic-c.avab-pp.euro))):0;
  const available=round(net-o.extraCosts*12+assessmentRelief);
  return {kind:'at',payments,gross,social,tax,net,assessmentRelief,available,average:available/12,monthlyGross:monthly,monthlySV:sv,monthlyTax,monthlyNet:round(monthly-sv-monthlyTax),specials,taxable,pp,credits:c,extraCosts:o.extraCosts*12,effective:(social+tax)/(gross||1)};
}
export function calculateLI(o){return calculateForeign(o,{...TAX.li,kind:'li'});}
export function calculateCH(o){return calculateForeign(o,{...TAX.ch,kind:'ch'});}
function calculateForeign(o,p) {
  validate(o,['annual','bonus','special','fx','pension','nbu','ktg','health','healthDeductible','healthSubsidy','extraCosts']);
  if(o.annual<=0||o.fx<=0)throw new Error('Bitte Jahresbrutto und einen positiven CHF/EUR-Kurs eingeben.');
  if(o.special>o.annual)throw new Error('Sonderzahlungen dürfen das Vertrags-Jahresbrutto nicht überschreiten.');
  if(o.healthDeductible>o.health)throw new Error('Der abzugsfähige Pflichtanteil darf den Krankenversicherungsbeitrag nicht überschreiten.');
  if(o.pension>o.annual+o.bonus)throw new Error('Der Pensionskassenbeitrag darf das Brutto nicht überschreiten.');
  if(o.nbu>10||o.ktg>10)throw new Error('Bitte NBU-/KTG-Prämiensätze bis 10 % eingeben.');
  const grossCHF=o.annual+o.bonus, regularCHF=o.annual-o.special, specialCHF=o.special+o.bonus;
  let ahv=round(grossCHF*p.ahv),iv=round(grossCHF*p.iv),fak=round(grossCHF*p.fak);
  let alv=round(Math.min(grossCHF,p.alvCap)*p.alv);
  if(o.liMinor)ahv=iv=fak=alv=0;
  for(const key of ['nbuAnnual','ktgAnnual'])if(o[key]!==undefined&&(typeof o[key]!=='number'||!Number.isFinite(o[key])||o[key]<0||o[key]>grossCHF))throw new Error('Ungültiger jährlicher Arbeitnehmerbeitrag.');
  let nbu=round(o.nbuAnnual??Math.min(grossCHF,p.accidentCap)*o.nbu/100),ktg=round(o.ktgAnnual??grossCHF*o.ktg/100);
  const eo=round(grossCHF*(p.eo||0)),regional=p.kind==='ch'?round(grossCHF*(TAX.chRegional[o.canton]||0)):0;
  const other=o.otherAnnual??0;
  if(!Number.isFinite(other)||other<0||other>grossCHF)throw new Error('Ungültige sonstige Pflichtabgaben.');
  let roundedLedger=null;
  if(p.kind==='li'&&o.payrollRounding===.05){roundedLedger=roundedLIAnnual(o);({ahv,iv,fak,alv,nbu,ktg}=roundedLedger.contributions);}
  const socialCHF=round(ahv+iv+fak+eo+regional+alv+nbu+ktg+o.pension+other);
  if(p.kind==='ch'&&(!Number.isFinite(o.sourceAnnual)||o.sourceAnnual<0||o.sourceAnnual>grossCHF))throw new Error('Ungültige Schweizer Jahresquellensteuer.');
  const localTaxCHF=o.ordinaryCH?round(o.sourceAnnual):0;
  const localTax=round(localTaxCHF*o.fx);
  const sourceCHF=o.ordinaryCH?0:o.publicLI?round(o.sourceAnnual):roundedLedger?.source??round(p.kind==='ch'?o.sourceAnnual:grossCHF*p.source),subsidyCHF=o.healthSubsidy*12;
  const payoutCHF=round(grossCHF-socialCHF-sourceCHF+subsidyCHF);
  const healthAnnual=round(o.health*12),healthDeductible=o.healthDeductible*12;
  const contributionEUR=socialCHF*o.fx+healthDeductible;
  const specialFraction=specialCHF/grossCHF;
  const regularContribution=contributionEUR*(1-specialFraction),specialContribution=contributionEUR*specialFraction;
  const regularNetTaxable=positive((regularCHF+subsidyCHF)*o.fx-regularContribution);
  const specialNet=positive(specialCHF*o.fx-specialContribution);
  const sixth=regularCHF*o.fx/6+subsidyCHF*o.fx/6;
  const privilegedGross=Math.min(specialCHF*o.fx,sixth);
  const privilegedNet=specialCHF>0?specialNet*(privilegedGross/(specialCHF*o.fx)):0;
  const specialData=specialFixedTax(privilegedNet);
  const overflow=positive(specialNet-privilegedNet)+specialData.overflow;
  const exempt=o.resident||o.publicLI;
  const pp=pendler(o.distance||0,o.pendlerType,o.days||0);
  const c=credits(o);
  const taxable=exempt?0:positive(regularNetTaxable+overflow-austrianDeductions(o)-pp.allowance);
  const regularTax=positive(tariff(taxable)-c.family-c.traffic-c.avab-pp.euro);
  // Annual foreign-income assessment: §41(4) has an additional 30% ceiling.
  const specialTax=sixth<=TAX.special.exemption?0:privilegedGross>TAX.special.exemption&&sixth<=25000?Math.min(specialData.tax,.30*positive(privilegedNet-2490)):specialData.tax;
  const atTax=exempt?0:round(regularTax+specialTax),sourceEUR=sourceCHF*o.fx;
  const sourceCredit=round(Math.min(sourceEUR,atTax)),reserve=round(positive(atTax-sourceCredit));
  const net=round(payoutCHF*o.fx-healthAnnual-reserve-localTax);
  const familyCash=round((o.familyCashMonthly||0)*12),parking=round((o.parkingMonthly||0)*12);
  const available=round(net-o.extraCosts*12-parking+familyCash);
  return {kind:p.kind,resident:!!o.resident,publicLI:!!o.publicLI,localTaxCHF,localTax,familyCash,parking,grossCHF,gross:round((grossCHF+subsidyCHF)*o.fx),socialCHF,social:round(socialCHF*o.fx),sourceCHF,sourceEUR:round(sourceEUR),payoutCHF,payout:round(payoutCHF*o.fx),health:healthAnnual,subsidyCHF,atTax,sourceCredit,reserve,tax:round(sourceEUR+reserve+localTax),net,available,average:available/12,extraCosts:o.extraCosts*12,regularTax:round(regularTax),specialTax:exempt?0:round(specialTax),taxable,regularCHF,specialCHF,sixth,privilegedGross,overflow:round(overflow),pp,credits:c,contributions:{ahv,iv,fak,alv,nbu,ktg,pension:o.pension,...(p.kind==='ch'?{eo,regional,other}:{})},effective:(socialCHF*o.fx+sourceEUR+reserve+localTax+healthAnnual)/(((grossCHF+subsidyCHF)*o.fx)||1),warnings:[...(o.pension===0?['Kein Pensionskassenbeitrag eingetragen. Falls ein Pflichtbeitrag anfällt, ist das Netto zu hoch.']:[]),...(o.healthSubsidy===0?['Kein zusätzlicher Arbeitgeberzuschuss zur Krankenversicherung angesetzt. Nur separat ergänzen, wenn er nicht bereits im Gehalt enthalten ist.']:[]),...(o.nbu||o.ktg?['NBU und Krankentaggeld sind arbeitgeberabhängige Beispiel-Prämiensätze. Bitte laut Lohnzettel anpassen.']:[])]};
}
export function equivalentGross(target,o) {
  let lo=0,hi=Math.max(10000,target/6);
  while(calculateAT({...o,period:'monthly',gross:hi}).available<target && hi<200000)hi*=2;
  if(hi>=200000)return null;
  for(let i=0;i<55;i++){const mid=(lo+hi)/2;if(calculateAT({...o,period:'monthly',gross:mid}).available<target)lo=mid;else hi=mid;}
  return round(hi);
}
