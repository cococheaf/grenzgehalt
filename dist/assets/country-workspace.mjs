import { defaults, profileFrom, readInputs, calculateScenario, sanitizeProfiles } from './scenario.mjs?v=4.23.0';
import { buildPaymentPlans, selectedPayment } from './payment-plan.mjs?v=4.23.0';
import { buildSalaryTimeline, buildAustrianTimeline, PAYDAY_NOTE } from './salary-timeline.mjs?v=4.23.0';
import { round } from './calculator.mjs?v=4.23.0';

export const WORK_COUNTRIES=Object.freeze({li:{name:'Liechtenstein',code:'LI',currency:'CHF'},ch:{name:'Schweiz',code:'CH',currency:'CHF'},at:{name:'Österreich',code:'AT',currency:'EUR'}});
export function comparisonCountries(primary){
 if(!WORK_COUNTRIES[primary])throw new Error('Ungültiges Rechnerland.');
 return Object.keys(WORK_COUNTRIES).filter(c=>c!==primary);
}
export function selectedCountries(primary,comparison){
 const options=comparisonCountries(primary);
 return {primary,comparison:options.includes(comparison)?comparison:primary==='at'?'li':'at'};
}
export function switchPrimary(primary,comparison,next){
 comparisonCountries(next);
 return selectedCountries(next,comparison===next?primary:comparison);
}
export function restoreCountryProfiles(raw,profiles){
 // Before 4.17 the CH tariff was shared outside the stored LI/CH profiles.
 const restored=sanitizeProfiles(profiles),keys=['chCanton','chTariff','chChildren','chChurch'];
 if(profiles?.ch)for(const key of keys)if(!(key in profiles.ch))restored.ch[key]=raw[key]??defaults[key];
 if(raw.foreignCountry==='li'||raw.foreignCountry==='ch')restored[raw.foreignCountry]=profileFrom(raw);
 return restored;
}
export function countryInputs(raw,profiles,country){
 if(!WORK_COUNTRIES[country])throw new Error('Ungültiges Arbeitsland.');
 if(country==='at')return {...raw,calculatorCountry:'at'};
 const profile=country===raw.foreignCountry?profileFrom(raw):profiles[country]||profileFrom(defaults);
 return {...raw,...profile,calculatorCountry:country,foreignCountry:country};
}
export function calculateCountry(raw,profiles,country,{swissData}={}){
 const ownRaw=countryInputs(raw,profiles,country),inputs=readInputs(ownRaw,{scope:country==='at'?'at':'foreign',swissData});
 if(inputs.sourcePending)return {country,inputs,pending:true};
 const result=calculateScenario(inputs),plans=buildPaymentPlans(inputs,result,{swissData}),plan=country==='at'?plans.at:plans.foreign;
 const timeline=country==='at'?buildAustrianTimeline(plan,{payments:inputs.at.payments}):buildSalaryTimeline(plan,{fx:inputs.li.fx,payments:inputs.li.payments});
 return {country,inputs,result:country==='at'?result.at:result.li,plan,timeline,pending:false};
}
export function pairSummary(primary,comparison,period='monthly'){
 if(primary.country===comparison.country)throw new Error('Bitte zwei unterschiedliche Länder wählen.');
 const a=selectedPayment(primary.plan,period).available,b=selectedPayment(comparison.plan,period).available;
 return {primary:primary.country,comparison:comparison.country,period,basis:period==='monthly'?'regular_month':'annual_total',currency:'EUR',values:{[primary.country]:a,[comparison.country]:b},difference:round(a-b)};
}
// Both input timelines already contain completed EUR budgets. This layer only
// compares them; it never converts currencies or recalculates contributions.
export function buildCountryComparison(primary,comparison){
 if(primary.country===comparison.country)throw new Error('Bitte zwei unterschiedliche Länder wählen.');
 const order=[primary.country,comparison.country],jobs=[primary,comparison];
 for(const job of jobs)if(job.timeline?.months?.length!==12||!Number.isFinite(job.timeline.annualAvailable))throw new Error('Ungültiger Jahresverlauf.');
 const months=primary.timeline.months.map((m,i)=>{
  const n=comparison.timeline.months[i];
  if(m.month!==i||n.month!==i||![m.available,n.available].every(Number.isFinite))throw new Error('Ungültiges Monatsbudget.');
  return {month:i,name:m.name,short:m.short,[order[0]]:m.available,[order[1]]:n.available,[order[0]+'Count']:m.salaryCount,[order[1]+'Count']:n.salaryCount,difference:round(m.available-n.available)};
 });
 const separateMap=new Map();
 for(const job of jobs){
  const timeline=job.timeline;
  for(const row of [...timeline.unassigned,...(Math.abs(timeline.adjustment?.available||0)>=.005?[{...timeline.adjustment,id:'adjustment'}]:[])]){
   const id=row.id==='adjustment'?'adjustment':'extra:'+row.id,entry=separateMap.get(id)||{id,label:id==='adjustment'?'Jahres-/Rundungsabgleich':row.label+' · ohne Monatszuordnung',[order[0]]:0,[order[1]]:0};
   entry[job.country]=round(entry[job.country]+row.available);separateMap.set(id,entry);
  }
 }
 const separate=[...separateMap.values()].map(row=>({...row,difference:round(row[order[0]]-row[order[1]])}));
 const annual=Object.fromEntries(jobs.map(job=>[job.country,job.timeline.annualAvailable]));annual.difference=round(annual[order[0]]-annual[order[1]]);
 return {basis:'monthly_available_budget_comparison',timingBasis:'payout_month',timingNote:PAYDAY_NOTE,currency:'EUR',order,months,separate,annual,schedule:Object.fromEntries(jobs.map(job=>[job.country,job.timeline.schedule]))};
}
