import { round } from './calculator.mjs?v=4.23.0';
import { MONTHS, PAYDAY_NOTE, specialMonth, salarySchedule } from './salary-timeline.mjs?v=4.23.0';

const sum=rows=>round(rows.reduce((n,r)=>n+r.available,0));

// Compare completed budgets. The foreign calendar already combines CHF paydays
// before EUR conversion; Austrian payments are already in EUR.
export function buildComparisonTimeline(foreign,atPlan,{payments=14}={}){
 if(foreign?.months?.length!==12||!Number.isFinite(foreign.annualAvailable)||!Number.isFinite(atPlan?.regular?.available)||!Number.isFinite(atPlan?.annual?.available))throw new Error('Ungültige Monatsbudgets für den Vergleich.');
 const scheduled=Array.from({length:12},()=>[]),atUnassigned=[];
 for(const extra of atPlan.extras){
  const month=specialMonth(extra.id,payments);
  if(month===null)atUnassigned.push(extra);else scheduled[month].push(extra);
 }
 const months=MONTHS.map(([name,short],month)=>{
  const f=foreign.months[month],records=[atPlan.regular,...scheduled[month]],a=sum(records);
  if(f.month!==month||!Number.isFinite(f.available))throw new Error('Ungültiges Auslandsbudget im Jahresverlauf.');
  return {month,name,short,foreign:f.available,at:a,difference:round(f.available-a),foreignCount:f.salaryCount,atCount:records.length};
 });
 const entries=new Map();
 for(const [country,rows] of [['foreign',foreign.unassigned],['at',atUnassigned]])for(const row of rows){
  const id='extra:'+row.id,entry=entries.get(id)||{id,label:row.label+' · ohne Monatszuordnung',foreign:0,at:0};
  entry[country]=round(entry[country]+row.available);entries.set(id,entry);
 }
 const atAdjustment=round(atPlan.annual.available-sum(months.map(m=>({available:m.at})))-sum(atUnassigned));
 if(Math.abs(foreign.adjustment?.available||0)>=.005||Math.abs(atAdjustment)>=.005)entries.set('adjustment',{id:'adjustment',label:'Jahres-/Rundungsabgleich',foreign:foreign.adjustment?.available||0,at:atAdjustment});
 const separate=[...entries.values()].map(r=>({...r,difference:round(r.foreign-r.at)}));
 return {basis:'monthly_available_budget_comparison',timingBasis:'payout_month',timingNote:PAYDAY_NOTE,currency:'EUR',months,separate,
  annual:{foreign:foreign.annualAvailable,at:atPlan.annual.available,difference:round(foreign.annualAvailable-atPlan.annual.available)},
  schedule:{foreign:foreign.schedule,at:salarySchedule(payments)},
  note:'Auszahlungstermine sind Planungsannahmen. Verfügbare Budgets nach Abgaben, Versicherung und eigenen Kosten; Bonus und Jahresabgleich separat.'};
}
