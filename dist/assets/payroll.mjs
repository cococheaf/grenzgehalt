import { TAX } from './tax-data.mjs?v=4.23.0';

export const cents=n=>Math.round((n+Number.EPSILON)*100)/100;
export function payrollRound(value,step=.01){
  if(![.01,.05].includes(step)||!Number.isFinite(value))throw new Error('Ungültige Lohnrundung.');
  return cents(Math.round((value+Number.EPSILON)/step)*step);
}
// Pure native-currency payroll. Historical verification never changes the 2026
// Austrian tax model; a supplied ALV base belongs only to this payment.
export function calculateLIPayroll({gross,year=2026,nbuRate=1,ktgRate=.5,pension=0,subsidy=year===2025?173.5:180.5,alvBasis=Math.min(gross,10500),insuredBasis=Math.min(gross,12350),nbu,ktg,rounding=.01,contributes=true}){
  if(![2025,2026].includes(year))throw new Error('LI-Lohnabrechnung: Jahr nicht unterstützt.');
  for(const value of [gross,nbuRate,ktgRate,pension,subsidy,alvBasis,insuredBasis])if(!Number.isFinite(value)||value<0)throw new Error('Ungültige LI-Lohnangabe.');
  const r=n=>payrollRound(n,rounding),ahvIV=r(gross*.047),ahv=r(gross*.04025);
  const contributions={ahv:contributes?ahv:0,iv:contributes?cents(ahvIV-ahv):0,fak:contributes&&year===2026?r(gross*.002):0,alv:contributes?r(alvBasis*.005):0,nbu:nbu??r(insuredBasis*nbuRate/100),ktg:ktg??r(insuredBasis*ktgRate/100),pension:cents(pension)};
  const social=cents(Object.values(contributions).reduce((a,b)=>a+b,0)),source=r(gross*.04),netBeforeSource=cents(gross-social);
  return {year,period:'regular_month',currency:'CHF',gross:cents(gross),contributions,social,netBeforeSource,source,subsidy:cents(subsidy),payout:cents(netBeforeSource-source+subsidy),assumptions:{pensionPayments:12,alvBasis,insuredBasis,rounding:`CHF ${rounding.toFixed(2)} per item`},beforeAustrianHealthAndTax:true};
}
export function regularLIPayroll(inputs){
  const o=inputs.li,gross=cents((o.annual-o.special)/12),total=o.annual+o.bonus,basis=Math.min(total,TAX.li.accidentCap),step=o.payrollRounding||.01;
  const fee=key=>inputs.sources[key]==='own'&&inputs.raw.contributionUnit==='annual'?cents(o[key]*gross/total):payrollRound(Math.min(gross,12350)*(key==='nbuAnnual'?o.nbuRate:o.ktgRate)/100,step);
  const slip=calculateLIPayroll({gross,contributes:!o.liMinor,pension:cents(o.pension/12),subsidy:o.healthSubsidy,nbu:fee('nbuAnnual'),ktg:fee('ktgAnnual'),rounding:step});
  slip.assumptions.subsidyPayments=12;return slip;
}
// Optional payroll-specific rounding: annual values are the sum of the actual
// modelled payments, not a percentage rounded once on the annual gross.
export function roundedLIAnnual(o){
  const count=Math.max(1,o.payments-12),normal=cents((o.annual-o.special)/12),specials=[];let used=0;
  if(o.special>0)for(let i=0;i<count;i++){const value=i===count-1?cents(o.special-used):cents(o.special/count);specials.push(value);used=cents(used+value);}
  if(o.bonus>0)specials.push(o.bonus);
  const amounts=[...Array(12).fill(normal),...specials],total=o.annual+o.bonus,basis=Math.min(total,148200),step=o.payrollRounding;
  const c={ahv:0,iv:0,fak:0,alv:0,nbu:0,ktg:0,pension:o.pension};let source=0,alvUsed=0,insuredUsed=0;
  amounts.forEach((gross,i)=>{
    const alvBasis=Math.min(gross,i<12?10500:Math.max(0,126000-alvUsed)),insuredBasis=Math.min(gross,i<12?12350:Math.max(0,148200-insuredUsed));
    const fee=key=>o.annualFeeKeys?.includes(key)?cents(o[key]*gross/total):payrollRound(insuredBasis*(key==='nbuAnnual'?o.nbuRate:o.ktgRate)/100,step);
    const slip=calculateLIPayroll({gross,contributes:!o.liMinor,pension:0,subsidy:0,alvBasis,insuredBasis,nbu:fee('nbuAnnual'),ktg:fee('ktgAnnual'),rounding:step});
    for(const key of Object.keys(c))if(key!=='pension')c[key]=cents(c[key]+slip.contributions[key]);source=cents(source+slip.source);alvUsed+=alvBasis;insuredUsed+=insuredBasis;
  });
  for(const [key,fee] of [['nbu','nbuAnnual'],['ktg','ktgAnnual']])if(o.annualFeeKeys?.includes(fee))c[key]=o[fee];
  return {contributions:c,source,social:cents(Object.values(c).reduce((a,b)=>a+b,0))};
}
