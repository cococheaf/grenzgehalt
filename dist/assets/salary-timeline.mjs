import { round } from './calculator.mjs?v=4.23.0';

export const MONTHS=Object.freeze([
 ['Jänner','Jän'],['Februar','Feb'],['März','Mär'],['April','Apr'],
 ['Mai','Mai'],['Juni','Jun'],['Juli','Jul'],['August','Aug'],
 ['September','Sep'],['Oktober','Okt'],['November','Nov'],['Dezember','Dez'],
]);
export const PAYDAY_NOTE='Der Zeitstrahl zeigt den Auszahlungsmonat. Ende Juni → Budget für Juli, Ende November → Budget für Dezember. Das Geld ist ab Kontoeingang verfügbar.';
export const salarySchedule=payments=>Number(payments)===14?'13. Gehalt Ende Juni, 14. Gehalt Ende November':Number(payments)===13?'13. Gehalt Ende November':'Zwölf reguläre Monatsbezüge';
export const specialMonth=(id,payments)=>id==='13'&&Number(payments)>12?(Number(payments)===14?5:10):id==='14'&&Number(payments)===14?10:null;
const NATIVE=['grossCHF','socialCHF','sourceCHF','subsidyCHF','payoutCHF'];
const CASH=['payout','reserve','health','supplement','extraCosts','familyCash','parking','localTax','available'];
const sum=(rows,key)=>round(rows.reduce((n,r)=>n+(r[key]||0),0));

// Calendar presentation of the completed payment plan. Timing is an explicit
// planning assumption, not another tax calculation or an annual average.
export function buildSalaryTimeline(plan,{fx,payments}){
 if(!Number.isFinite(fx)||fx<=0||![12,13,14].includes(Number(payments))||!Number.isFinite(plan?.regular?.payoutCHF))throw new Error('Ungültige Angaben für den Jahresverlauf.');
 payments=Number(payments);
 const scheduled=Array.from({length:12},()=>[]),unassigned=[];
 for(const extra of plan.extras){
  const month=specialMonth(extra.id,payments);
  if(month===null)unassigned.push(extra);else scheduled[month].push(extra);
 }
 const months=MONTHS.map(([name,short],month)=>{
  const records=[plan.regular,...scheduled[month]],row={month,name,short,salaryCount:records.length,extras:scheduled[month].map(r=>r.id),parts:records.map(r=>({id:r.id,label:r.id==='regular'?'Normaler Monatsbezug':r.label,available:r.available}))};
  for(const key of NATIVE)row[key]=sum(records,key);
  // A double payday is combined in CHF before its final EUR conversion.
  row.payout=round(row.payoutCHF*fx);
  for(const key of ['reserve','health','supplement','extraCosts','familyCash','parking','localTax'])row[key]=sum(records,key);
  row.available=round(row.payout-row.reserve-row.health-row.supplement-row.extraCosts-row.parking-row.localTax+row.familyCash);
  row.conversionDifference=round(row.available-sum(row.parts,'available'));
  return row;
 });
 const adjustment={label:'Rundungsabgleich'};
 for(const key of [...NATIVE,...CASH])adjustment[key]=round((plan.annual[key]||0)-sum(months,key)-sum(unassigned,key));
 if(CASH.some(key=>Math.abs(adjustment[key])>=.5))adjustment.label='Jahresabgleich';
 const hasAdjustment=[...NATIVE,...CASH].some(key=>Math.abs(adjustment[key])>=.005);
 return {basis:'monthly_available_budget',timingBasis:'payout_month',timingNote:PAYDAY_NOTE,currency:'EUR',payments,months,unassigned,adjustment:hasAdjustment?adjustment:null,annualAvailable:plan.annual.available,
  schedule:salarySchedule(payments),
  note:'Zahltage sind eine Planungsannahme. Die Monatsbeträge enthalten Krankenversicherung, österreichische Steuerrücklage und eigene Kosten. Zusätzlicher Bonus und Jahresabgleich werden separat ausgewiesen.'};
}

// Austrian cash is already in EUR. No CHF conversion or foreign insurance applies.
export function buildAustrianTimeline(plan,{payments=14}={}){
 if(![12,13,14].includes(Number(payments))||!Number.isFinite(plan?.regular?.available))throw new Error('Ungültige Angaben für den österreichischen Jahresverlauf.');
 const scheduled=Array.from({length:12},()=>[]),unassigned=[];
 for(const extra of plan.extras){const month=specialMonth(extra.id,payments);if(month===null)unassigned.push(extra);else scheduled[month].push(extra);}
 const keys=['gross','salaryGross','social','tax','payout','reserve','health','supplement','extraCosts','available'];
 const months=MONTHS.map(([name,short],month)=>{const records=[plan.regular,...scheduled[month]],row={month,name,short,salaryCount:records.length,extras:scheduled[month].map(r=>r.id),parts:records.map(r=>({id:r.id,label:r.id==='regular'?'Normaler Monatsbezug':r.label,available:r.available})),conversionDifference:0};for(const key of keys)row[key]=sum(records,key);return row;});
 const adjustment={label:'Jahres-/Rundungsabgleich'};for(const key of keys)adjustment[key]=round((plan.annual[key]||0)-sum(months,key)-sum(unassigned,key));
 return {basis:'monthly_available_budget',timingBasis:'payout_month',timingNote:PAYDAY_NOTE,currency:'EUR',payments:Number(payments),months,unassigned,adjustment:keys.some(k=>Math.abs(adjustment[k])>=.005)?adjustment:null,annualAvailable:plan.annual.available,schedule:salarySchedule(payments),note:'Österreichische Auszahlung nach Sozialversicherung und Lohnsteuer. Zusatzversicherung und eigene Kosten fallen zwölfmal an.'};
}
