import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, readInputs, calculateScenario, sanitizeState } from '../dist/assets/scenario.mjs';
import { buildPaymentPlans, annualBudgetParts } from '../dist/assets/payment-plan.mjs';
import { buildAustrianTimeline, buildSalaryTimeline } from '../dist/assets/salary-timeline.mjs';
import { buildComparisonTimeline } from '../dist/assets/comparison-timeline.mjs';
import { round } from '../dist/assets/calculator.mjs';
const raw=(extra={})=>({...defaults,calculatorCountry:'at',atGross:'7500',...extra});
function atOnly(extra={}){const i=readInputs(raw(extra),{scope:'at'}),r=calculateScenario(i),p=buildPaymentPlans(i,r);return {i,r,p,t:buildAustrianTimeline(p.at)};}
test('AT ist unabhängig ohne CHF-Gehalt, Wechselkurs, Privatprämie oder CH-Tarif berechenbar',()=>{
 const {r,p}=atOnly({liAnnual:'',fx:'',healthType:'private',privateMonthly:'',foreignCountry:'ch',chTariff:'H',chChildren:'0',chCanton:'SG',exactPension:'ungültig'});
 assert.equal(r.li,null);assert.equal(p.foreign,null);assert.equal(r.at.monthlyNet,4477.28);assert.equal(r.at.gross,105000);assert.equal(r.at.specials.length,2);assert.equal(r.at.net,65640.61);
});
test('AT-Auszahlung und Jahresverlauf bleiben unabhängig vom CHF-Kurs',()=>{
 assert.deepEqual(atOnly({fx:'0,6'}).t,atOnly({fx:'1,9'}).t);
});
test('AT Monats- und Jahresbrutto ergeben dieselben Zahltage',()=>{
 assert.deepEqual(atOnly().t,atOnly({atGross:'105000',atPeriod:'annual'}).t);
});
test('AT bleibt fest bei 14 Bezügen; LI-Anzahl hat keinen Einfluss',()=>{
 const a=atOnly({liPayments:'12'}),b=atOnly({liPayments:'14'});assert.deepEqual(a.t,b.t);assert.equal(a.t.months.reduce((n,m)=>n+m.salaryCount,0),14);
 assert.deepEqual(a.t.months.filter(m=>m.salaryCount===2).map(m=>m.month),[5,10]);
});
test('AT-Bezugsteile, echte Monatsbudgets und Jahressumme saldieren',()=>{
 for(const extra of [{},{atGross:'3000',atCosts:'100'},{atGross:'100',atCosts:'1000'},{atGross:'15000',atSupplementEnabled:true,atSupplement:'77,77'}]){
  const {p,t}=atOnly(extra);assert.equal(round(t.months.reduce((s,m)=>s+m.available,0)+(t.adjustment?.available||0)),p.at.annual.available);
  assert.equal(round(annualBudgetParts(p.at).reduce((s,m)=>s+m.available,0)),p.at.annual.available);
  for(const m of t.months)assert.equal(m.available,round(m.payout-m.supplement-m.extraCosts));
 }
});
test('AT-Kosten und AT-Zusatzversicherung nur zwölfmal, auch bei doppelten Zahltagen',()=>{
 const a=atOnly(),b=atOnly({atCosts:'120',atSupplementEnabled:true,atSupplement:'80'});
 for(let m=0;m<12;m++)assert.equal(round(a.t.months[m].available-b.t.months[m].available),200);
 assert.equal(round(a.t.annualAvailable-b.t.annualAvailable),2400);
});
test('Unfertiges österreichisches Angebot blockiert LI-Einzelrechnung nicht',()=>{
 const i=readInputs(raw({calculatorCountry:'li',atGross:'ungültig',atSupplementEnabled:true,atSupplement:'ungültig'}),{scope:'foreign'}),r=calculateScenario(i);
 assert.equal(r.at,null);assert.ok(r.li.available>0);
});
test('Private Grenzgänger-Grundversicherung verändert den AT-Job nicht',()=>{
 assert.deepEqual(atOnly().r.at,atOnly({healthType:'private',privateMonthly:'999',privateDeductible:'300',liCosts:'800'}).r.at);
});
test('Zusatzprämien sind in beiden Jobs unabhängig',()=>{
 const run=extra=>calculateScenario(readInputs(raw(extra)));
 const a=run({}),f=run({supplementEnabled:true,supplement:'100'}),at=run({atSupplementEnabled:true,atSupplement:'80'});
 assert.equal(a.at.available,f.at.available);assert.equal(round(a.li.available-f.li.available),1200);
 assert.equal(a.li.available,at.li.available);assert.equal(round(a.at.available-at.at.available),960);
});
test('Frühere gemeinsame Zusatzversicherung migriert ohne Budgetänderung in beide Szenarien',()=>{
 const old=raw({supplementEnabled:true,supplement:'120'});delete old.calculatorCountry;delete old.atSupplementEnabled;delete old.atSupplement;
 const safe=sanitizeState(old);assert.equal(safe.calculatorCountry,'li');assert.equal(safe.atSupplementEnabled,true);assert.equal(safe.atSupplement,'120');
 const r=calculateScenario(readInputs(safe));assert.equal(r.at.supplement,1440);assert.equal(r.li.supplement,1440);
});
test('Frühere CH-Rechnung öffnet CH als primäres Rechnerland',()=>{
 const old=raw({foreignCountry:'ch'});delete old.calculatorCountry;assert.equal(sanitizeState(old).calculatorCountry,'ch');
});
test('AT-Datei kann unfertige LI-Eingaben und die Landeswahl verlustfrei erhalten',()=>{
 const input=raw({liAnnual:'',healthType:'private',privateMonthly:'',atCosts:'120'}),safe=sanitizeState(JSON.parse(JSON.stringify(input)));
 assert.deepEqual(safe,input);assert.equal(atOnly(safe).p.at.regular.available,4357.28);
});
test('AT-Einzelkalender und AT-Seite des Vergleichs sind centgenau gleich',()=>{
 const i=readInputs(raw({atCosts:'120',atSupplementEnabled:true,atSupplement:'50'})),r=calculateScenario(i),p=buildPaymentPlans(i,r),at=buildAustrianTimeline(p.at),f=buildSalaryTimeline(p.foreign,{fx:i.li.fx,payments:i.li.payments}),c=buildComparisonTimeline(f,p.at);
 assert.deepEqual(at.months.map(m=>m.available),c.months.map(m=>m.at));assert.equal(at.annualAvailable,c.annual.at);
});
test('Ungültige aktive Angaben werden weiter abgewiesen',()=>{
 assert.throws(()=>atOnly({atGross:'ungültig'}));assert.throws(()=>atOnly({atSupplementEnabled:true,atSupplement:'-1'}));assert.throws(()=>buildAustrianTimeline({regular:{available:NaN}}));
});
