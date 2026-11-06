import { regularLIPayroll } from './payroll.mjs?v=4.23.0';
import { round, tariff, calculateAT } from './calculator.mjs?v=4.23.0';
import { TAX } from './tax-data.mjs?v=4.23.0';
import { swissMonthlyTax } from './swiss.mjs?v=4.23.0';

const sum=values=>round(values.reduce((a,b)=>a+b,0));
const split=(total,weights)=>{
  const weight=weights.reduce((a,b)=>a+b,0),lastWeight=weights.findLastIndex(w=>w>0);let used=0;
  return weights.map((w,i)=>{const part=w<=0?0:i===lastWeight?round(total-used):round(weight?total*w/weight:0);used=round(used+part);return part;});
};
const LEDGER=['grossCHF','socialCHF','sourceCHF','subsidyCHF','payoutCHF','salaryGross','subsidy','gross','social','sourceEUR','reserve','tax','health','supplement','extraCosts','available','payout','taxable','regularTax','specialTax','sourceCredit','familyCash','parking','assessmentRelief','localTax'];
function settlement(annual,regular,extras){
  const out={id:'settlement',label:'Jahresabgleich',count:1};
  for(const key of LEDGER)out[key]=round((annual[key]||0)-12*(regular[key]||0)-sum(extras.map(e=>e[key]||0)));
  return LEDGER.some(key=>Math.abs(out[key])>=.005)?out:null;
}
function finishPlan(annual,regular,extras){
  let adjustment=settlement(annual,regular,extras);
  const cash=['salaryGross','subsidy','gross','social','sourceEUR','reserve','tax','health','supplement','extraCosts','available','payout','familyCash','parking','assessmentRelief'];
  if(adjustment&&extras.length&&!('payoutCHF' in regular)&&cash.every(key=>Math.abs(adjustment[key]||0)<.5)){
    const last=extras.at(-1);last.roundingAdjustment={...adjustment};
    for(const key of LEDGER)last[key]=round((last[key]||0)+(adjustment[key]||0));
    adjustment=settlement(annual,regular,extras);
  }
  if(adjustment&&cash.every(key=>Math.abs(adjustment[key]||0)<.5))adjustment.label='Rundungsabgleich';
  return {annual,regular,extras,settlement:adjustment};
}
export function austrianPaymentPlan(inputs,at){
  const supplement=inputs.atSupplement??inputs.supplement;
  const regular={id:'regular',label:'Normaler Monat',count:12,gross:round(at.monthlyGross),salaryGross:round(at.monthlyGross),subsidy:0,social:at.monthlySV,sourceEUR:0,reserve:0,tax:at.monthlyTax,health:0,supplement,extraCosts:inputs.at.extraCosts,taxable:round(at.taxable/12),regularTax:at.monthlyTax,specialTax:0,sourceCredit:0,payout:at.monthlyNet,available:round(at.monthlyNet-supplement-inputs.at.extraCosts)};
  const extras=at.specials.map((s,i)=>({id:String(13+i),label:`${13+i}. Gehalt`,count:1,gross:round(s.gross),salaryGross:round(s.gross),subsidy:0,social:s.sv,sourceEUR:0,reserve:0,tax:s.tax,health:0,supplement:0,extraCosts:0,payout:s.net,available:s.net,taxable:0,regularTax:0,specialTax:s.tax,sourceCredit:0}));
  const annual={...at,salaryGross:at.gross,subsidy:0,sourceEUR:0,reserve:0,health:0,payout:at.net,regularTax:round(at.monthlyTax*12),specialTax:sum(extras.map(e=>e.tax)),sourceCredit:0};
  delete annual.average;
  return finishPlan(annual,regular,extras);
}
function foreignDescriptors(inputs){
  const o=inputs.li,count=Math.max(1,Number(inputs.raw.liPayments)-12),rows=[];
  if(o.special>0){const amounts=split(o.special,Array(count).fill(1));for(let i=0;i<count;i++)rows.push({id:Number(inputs.raw.liPayments)>12?String(13+i):'special',label:Number(inputs.raw.liPayments)>12?`${13+i}. Gehalt`:'Sonderzahlung',grossCHF:amounts[i]});}
  if(o.bonus>0)rows.push({id:'bonus',label:'Bonus',grossCHF:o.bonus});
  return rows;
}
export function foreignPaymentPlan(inputs,li,{swissData}={}){
  const o=inputs.li,p=li.kind==='ch'?TAX.ch:TAX.li,grossCHF=round(li.regularCHF/12),fullGross=li.grossCHF,descriptors=foreignDescriptors(inputs),weights=descriptors.map(e=>e.grossCHF);
  const annual={...li,availableCHF:li.available/o.fx,salaryGross:round(fullGross*o.fx),subsidy:round(li.gross-round(fullGross*o.fx))};
  delete annual.average;
  const fee=key=>{
    if(inputs.sources[key]==='own'&&inputs.raw.contributionUnit==='annual')return round(o[key]*(fullGross?grossCHF/fullGross:0));
    const base=Math.min(fullGross,p.accidentCap);return round(base?o[key]/base*Math.min(grossCHF,p.accidentCap/12):0);
  };
  let c={ahv:round(grossCHF*p.ahv),iv:round(grossCHF*p.iv),fak:round(grossCHF*p.fak),alv:round(Math.min(grossCHF,p.alvCap/12)*p.alv),nbu:fee('nbuAnnual'),ktg:fee('ktgAnnual'),pension:round(o.pension/12)};
  if(li.kind==='ch')Object.assign(c,{eo:round(grossCHF*p.eo),regional:round(grossCHF*(TAX.chRegional[o.canton]||0)),other:round(o.otherAnnual*(fullGross?grossCHF/fullGross:0))});
  let sourceCHF=round(grossCHF*(p.source||0));
  if(li.kind==='li'){const slip=regularLIPayroll(inputs);c=slip.contributions;sourceCHF=li.publicLI?round(li.sourceCHF*grossCHF/fullGross):slip.source;}
  if(li.kind==='ch'){
    const quote=inputs.sourceQuote;
    if(inputs.sources.sourceAnnual==='own')sourceCHF=round(li.sourceCHF*(fullGross?grossCHF/fullGross:0));
    else if(quote?.model==='annual')sourceCHF=grossCHF>0?round(Math.max(grossCHF*(quote.rate||0),quote.minimum||0)):0;
    else if(swissData&&quote)sourceCHF=swissMonthlyTax(grossCHF,o.canton,quote.code,swissData).tax;
    else sourceCHF=round(grossCHF*(quote?.periods[0]?.rate||0));
  }
  // Separate ordinary Austrian liability from the tax on special payments and
  // ordinary-tax overflow. The annual assessment and total credit stay intact.
  const ordinaryTaxable=Math.max(0,li.taxable-li.overflow),credits=li.credits;
  const ordinaryAT=Math.min(li.atTax,round(Math.max(0,tariff(ordinaryTaxable)-credits.family-credits.traffic-credits.avab-li.pp.euro)));
  const ordinaryCredit=round(Math.min(ordinaryAT,li.sourceCredit,round(sourceCHF*o.fx)*12));
  const regularTax=round(ordinaryAT/12),regularCredit=round(ordinaryCredit/12),regularReserve=round(Math.max(0,regularTax-regularCredit));
  const extraAT=round(li.atTax-ordinaryAT),extraCredit=round(Math.min(extraAT,Math.max(0,li.sourceCredit-ordinaryCredit))),extraReserve=round(Math.max(0,extraAT-extraCredit));
  function record(desc,contributions,source,subsidy,reserve,regularTax,specialTax,sourceCredit,taxable,monthly=false){
    const payoutCHF=round(desc.grossCHF-sum(Object.values(contributions))-source+subsidy);
    const familyCash=monthly?round(o.familyCashMonthly||0):0,parking=monthly?round(o.parkingMonthly||0):0,localTax=monthly?round(li.localTax/12):0;
    const salaryGross=round(desc.grossCHF*o.fx),subsidyEUR=round(subsidy*o.fx),socialCHF=sum(Object.values(contributions)),social=round(socialCHF*o.fx),sourceEUR=round(source*o.fx),gross=round(salaryGross+subsidyEUR),health=monthly?o.health:0,supplement=monthly?inputs.supplement:0,extraCosts=monthly?o.extraCosts:0,tax=round(sourceEUR+reserve+localTax),payout=round(payoutCHF*o.fx);
    return {...desc,count:monthly?12:1,salaryGross,subsidy:subsidyEUR,gross,socialCHF,social,contributions,sourceCHF:source,sourceEUR,reserve,tax,health,supplement,extraCosts,regularTax,specialTax,sourceCredit,taxable,payout,payoutCHF,subsidyCHF:subsidy,familyCash,parking,localTax,available:round(payout-reserve-health-supplement-extraCosts-parking-localTax+familyCash),availableCHF:payoutCHF-(reserve+health+supplement+extraCosts+parking+localTax-familyCash)/o.fx};
  }
  const regular=record({id:'regular',label:'Normaler Monat',grossCHF},c,sourceCHF,o.healthSubsidy,regularReserve,regularTax,0,regularCredit,round(ordinaryTaxable/12),true);
  const contributionParts={};
  for(const key of Object.keys(c)){
    const total=key==='pension'?0:Math.max(0,round((li.contributions[key]||0)-12*c[key]));
    contributionParts[key]=split(total,weights);
  }
  let sourceWeights=weights;
  if(li.kind==='ch'&&inputs.sources.sourceAnnual!=='own'&&inputs.sourceQuote?.model==='monthly'&&swissData){
    sourceWeights=descriptors.map(()=>0);const periods=inputs.sourceQuote.periods.slice(1),bonusIndex=descriptors.findIndex(e=>e.id==='bonus');
    periods.forEach((period,i)=>{
      const extra=descriptors.findIndex(e=>e.id===String(13+i)||e.id==='special'),group=[extra,...(i===periods.length-1?[bonusIndex]:[])].filter(index=>index>=0);
      const tax=Math.max(0,round(swissMonthlyTax(period.gross,o.canton,inputs.sourceQuote.code,swissData).tax-sourceCHF));
      const parts=split(tax,group.map(index=>descriptors[index].grossCHF));group.forEach((index,j)=>sourceWeights[index]+=parts[j]);
    });
    if(!sourceWeights.some(Boolean))sourceWeights=weights;
  }
  const sourceParts=split(Math.max(0,round(li.sourceCHF-12*sourceCHF)),sourceWeights),reserveParts=split(extraReserve,weights),regularTaxParts=split(Math.max(0,round(li.regularTax-12*regular.regularTax)),weights),specialTaxParts=split(li.specialTax,weights),creditParts=split(extraCredit,weights),taxableParts=split(Math.max(0,round(li.taxable-12*regular.taxable)),weights);
  const extras=descriptors.map((desc,i)=>record(desc,Object.fromEntries(Object.entries(contributionParts).map(([key,parts])=>[key,parts[i]])),sourceParts[i],0,reserveParts[i],regularTaxParts[i],specialTaxParts[i],creditParts[i],taxableParts[i]));
  return finishPlan(annual,regular,extras);
}
export function buildPaymentPlans(inputs,results,options){return {foreign:results.li?foreignPaymentPlan(inputs,results.li,options):null,at:results.at?austrianPaymentPlan(inputs,results.at):null};}
export function selectedPayment(plan,period){if(!['monthly','annual'].includes(period))throw new Error('Ungültiger Anzeigezeitraum.');return period==='monthly'?plan.regular:plan.annual;}
export function paymentDifference(plans,period){return round(selectedPayment(plans.foreign,period).available-selectedPayment(plans.at,period).available);}
export function equivalentRegularGross(target,atInputs,supplement=0){
  const budget=gross=>calculateAT({...atInputs,period:'monthly',gross}).monthlyNet-atInputs.extraCosts-supplement;
  let lo=0,hi=2000000;if(budget(hi)<target)return null;
  for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(budget(mid)<target)lo=mid;else hi=mid;}
  return round(hi);
}
export const PAYMENT_NOTE='Monatlich zeigt den normalen laufenden Bezug ohne Anteile aus 13./14. Gehalt oder Bonus. Diese Bezüge stehen separat; monatliche Krankenversicherung und laufende Kosten werden nur zwölfmal abgezogen. Die AT-Steuerrücklage für Auslandslohn bleibt eine Jahresplanung: laufende Steuer und laufende Quellensteuer werden im normalen Monat berücksichtigt; Steuer und Quellensteuer zusätzlicher Bezüge stehen separat. Ein Jahresabgleich gleicht Cent-Rundung und abweichende Abzugsverteilung aus; zwölf normale Monate plus zusätzliche Bezüge und Abgleich ergeben die Jahressumme.';

// A transparent annual cash ledger; regular month stays a single actual payment.
export function annualBudgetParts(plan){
  return [{id:'regular-year',label:'12 reguläre Monatsbudgets',available:round(plan.regular.available*12)},...plan.extras.map(({id,label,available})=>({id,label,available})),...(Math.abs(plan.settlement?.available||0)>=.005?[{id:'settlement',label:plan.settlement.label,available:plan.settlement.available}]:[])];
}

// Comparison consumes the completed budgets without recalculating deductions.
export function comparisonSummary(plans,period='monthly'){
  const foreign=selectedPayment(plans.foreign,period).available,austria=selectedPayment(plans.at,period).available;
  return {period,basis:period==='monthly'?'regular_month':'annual_total',currency:'EUR',foreign,austria,difference:round(foreign-austria)};
}
