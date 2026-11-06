import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,readInputs,calculateScenario} from '../dist/assets/scenario.mjs';
import {buildPaymentPlans} from '../dist/assets/payment-plan.mjs';
import {buildSalaryTimeline} from '../dist/assets/salary-timeline.mjs';
import {buildComparisonTimeline} from '../dist/assets/comparison-timeline.mjs';
import {round} from '../dist/assets/calculator.mjs';
import {decodeSwissTariff} from '../dist/assets/swiss.mjs';
import sg from '../dist/assets/ch-tariffs-sg.mjs';
import ge from '../dist/assets/ch-tariffs-ge.mjs';
const data={SG:await decodeSwissTariff(sg),GE:await decodeSwissTariff(ge)};
function run(raw={}){
 const swissData=data[raw.chCanton||'SG'],inputs=readInputs({...defaults,foreignPeriod:'monthly',liAnnual:'7200',liPayments:'14',atGross:'7500',fx:'1,09529',...raw},{swissData});
 const plans=buildPaymentPlans(inputs,calculateScenario(inputs),{swissData}),foreign=buildSalaryTimeline(plans.foreign,{fx:inputs.li.fx,payments:inputs.li.payments});
 return {plans,foreign,t:buildComparisonTimeline(foreign,plans.at)};
}
function reconciles(t){
 for(const country of ['foreign','at','difference'])assert.equal(round([...t.months,...t.separate].reduce((sum,m)=>sum+m[country],0)),t.annual[country],country);
}
for(const foreignCountry of ['li','ch'])for(const liPayments of ['12','13','14'])test(`Vergleich ${foreignCountry}/${liPayments}: fertige Monatsbudgets, separate Zahltage und Jahressumme`,()=>{
 const {t,foreign,plans}=run({foreignCountry,liPayments});
 assert.equal(t.months.length,12);assert.equal(t.months.reduce((n,m)=>n+m.foreignCount,0),Number(liPayments));assert.equal(t.months.reduce((n,m)=>n+m.atCount,0),14);
 for(const m of t.months){assert.equal(m.foreign,foreign.months[m.month].available);assert.equal(m.difference,round(m.foreign-m.at));}
 assert.deepEqual(t.months.filter(m=>m.atCount===2).map(m=>m.month),[5,10]);
 assert.equal(t.months[0].at,plans.at.regular.available);
 assert.equal(t.months[5].at,round(plans.at.regular.available+plans.at.extras.find(e=>e.id==='13').available));
 assert.equal(t.months[10].at,round(plans.at.regular.available+plans.at.extras.find(e=>e.id==='14').available));reconciles(t);
});
test('Österreich bleibt in EUR und wird vom CHF-Wechselkurs nicht verändert',()=>{
 const a=run({fx:'0,97'}),b=run({fx:'1,31'});
 assert.deepEqual(a.t.months.map(m=>m.at),b.t.months.map(m=>m.at));assert.notEqual(a.t.months[0].foreign,b.t.months[0].foreign);
});
test('Vergleich erhält die gemeinsame späte CHF-Umrechnung des doppelten Zahltags',()=>{
 const {t,foreign}=run({liAnnual:'7200,13'});
 assert.deepEqual(t.months.map(m=>m.foreign),foreign.months.map(m=>m.available));reconciles(t);
});
test('Monatliche AT-Kosten und Zusatzversicherung werden am Doppelzahltag nur einmal abgezogen',()=>{
 const a=run(),b=run({atCosts:'180',supplementEnabled:true,supplement:'70',atSupplementEnabled:true,atSupplement:'70'});
 for(let i=0;i<12;i++)assert.equal(round(a.t.months[i].at-b.t.months[i].at),250);
 assert.equal(round(a.t.annual.at-b.t.annual.at),3000);reconciles(b.t);
});
test('Bonus ohne Auszahlungsmonat steht separat statt in einem erfundenen Kalendervergleich',()=>{
 const {t}=run({liBonus:'3500'}),bonus=t.separate.find(r=>r.id==='extra:bonus');assert.ok(bonus);assert.equal(bonus.at,0);assert.equal(bonus.difference,bonus.foreign);reconciles(t);
});
test('Eigene Null-Sonderzahlung zeigt zwölf Auslandsbezüge gegenüber vierzehn AT-Bezügen',()=>{
 const {t}=run({liExact:true,specialOverride:true,exactSpecial:'0'});assert.ok(t.months.every(m=>m.foreignCount===1));assert.equal(t.months[5].atCount,2);reconciles(t);
});
test('Jahresmodell und negative Budgets behalten ihre Vorzeichen und saldieren',()=>{
 for(const raw of [{foreignCountry:'ch',chCanton:'GE',liAnnual:'9000'},{liAnnual:'1000',healthType:'private',privateMonthly:'1800',atGross:'100',atCosts:'800'}]){
  const {t}=run(raw);reconciles(t);if(raw.atCosts){assert.ok(t.months[0].at<0);assert.ok(t.months[0].foreign<0);}
 }
});
test('Monats- und Jahresbrutto ergeben denselben Vergleichskalender',()=>{
 assert.deepEqual(run().t,run({foreignPeriod:'annual',liAnnual:'100800',atPeriod:'annual',atGross:'105000'}).t);
});
test('Vergleich verändert weder Auslandsverlauf noch Zahlungspläne',()=>{
 const {foreign,plans}=run(),before=JSON.stringify({foreign,plans});buildComparisonTimeline(foreign,plans.at);assert.equal(JSON.stringify({foreign,plans}),before);
 assert.throws(()=>buildComparisonTimeline({...foreign,months:[]},plans.at));assert.throws(()=>buildComparisonTimeline(foreign,{...plans.at,annual:{available:NaN}}));
});
