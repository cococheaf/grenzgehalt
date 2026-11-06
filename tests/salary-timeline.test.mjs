import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,readInputs,calculateScenario} from '../dist/assets/scenario.mjs';
import {buildPaymentPlans} from '../dist/assets/payment-plan.mjs';
import {buildSalaryTimeline} from '../dist/assets/salary-timeline.mjs';
import {round} from '../dist/assets/calculator.mjs';
import {decodeSwissTariff} from '../dist/assets/swiss.mjs';
import sg from '../dist/assets/ch-tariffs-sg.mjs';
import ge from '../dist/assets/ch-tariffs-ge.mjs';
const data={SG:await decodeSwissTariff(sg),GE:await decodeSwissTariff(ge)};
function run(raw={}){
 const swissData=data[raw.chCanton||'SG'],i=readInputs({...defaults,foreignPeriod:'monthly',liAnnual:'7200',liPayments:'14',fx:'1,09',...raw},{swissData});
 const plan=buildPaymentPlans(i,calculateScenario(i),{swissData}).foreign;
 return {i,plan,t:buildSalaryTimeline(plan,{fx:i.li.fx,payments:i.li.payments})};
}
function reconciles({plan,t}){
 for(const key of ['grossCHF','socialCHF','sourceCHF','subsidyCHF','payoutCHF','payout','reserve','health','supplement','extraCosts','available']){
  const total=round(t.months.reduce((n,m)=>n+(m[key]||0),0)+t.unassigned.reduce((n,m)=>n+(m[key]||0),0)+(t.adjustment?.[key]||0));
  assert.equal(total,round(plan.annual[key]||0),key);
 }
}
for(const foreignCountry of ['li','ch'])for(const liPayments of ['12','13','14'])test(`${foreignCountry}: ${liPayments} Gehälter ergeben zwölf reale Monatsbudgets mit passenden Doppeltagen`,()=>{
 const r=run({foreignCountry,liPayments}),{t,plan}=r;
 assert.equal(t.months.length,12);assert.equal(t.months.reduce((n,m)=>n+m.salaryCount,0),Number(liPayments));
 assert.deepEqual(t.months.filter(m=>m.salaryCount===2).map(m=>m.month),liPayments==='14'?[5,10]:liPayments==='13'?[10]:[]);
 assert.equal(t.months[0].available,plan.regular.available);
 for(const m of t.months){assert.equal(m.health,plan.regular.health);assert.equal(m.extraCosts,plan.regular.extraCosts);assert.equal(m.supplement,plan.regular.supplement);}
 reconciles(r);
});
test('Zwei Gehälter addieren fertige CHF-Auszahlungen und ziehen Monatskosten nur einmal ab',()=>{
 const r=run({liExact:true,pensionPeriod:'monthly',exactPension:'450',exactNbu:'1',exactKtg:'0,5',healthType:'private',privateMonthly:'400',liCosts:'180'}),{plan,t}=r,m=t.months[5],extra=plan.extras.find(e=>e.id==='13');
 assert.equal(m.payoutCHF,round(plan.regular.payoutCHF+extra.payoutCHF));assert.equal(m.payout,round(m.payoutCHF*r.i.li.fx));
 assert.equal(m.health,400);assert.equal(m.extraCosts,180);assert.equal(m.subsidyCHF,plan.regular.subsidyCHF);
 assert.equal(m.available,round(m.payout-m.reserve-400-180));assert.notEqual(m.available,round(2*plan.regular.available));
 assert.equal(plan.regular.contributions.pension,450);assert.equal(extra.contributions.pension,0);reconciles(r);
});
test('Gemeinsame CHF-Umrechnung des doppelten Zahltags vermeidet vorzeitige EUR-Saldierung',()=>{
 let detected=false;
 for(const fx of ['1,09529','1,12345','0,99997'])for(const liAnnual of ['6123,45','7200,13','8123,79']){
  const r=run({fx,liAnnual}),m=r.t.months[5];assert.equal(m.payout,round(m.payoutCHF*r.i.li.fx));
  if(Math.abs(m.conversionDifference)>=.005)detected=true;reconciles(r);
 }
 assert.ok(detected,'fixtures must expose a cent difference from premature EUR addition');
});
test('CHF-Verlauf bleibt bei anderem Wechselkurs identisch',()=>{
 const a=run({fx:'1,01'}),b=run({fx:'1,23'});
 for(let n=0;n<12;n++)for(const key of ['grossCHF','socialCHF','sourceCHF','subsidyCHF','payoutCHF'])assert.equal(a.t.months[n][key],b.t.months[n][key]);
});
test('Jahresbrutto und Monatsbrutto liefern denselben monatlichen Verlauf',()=>{
 const a=run(),b=run({foreignPeriod:'annual',liAnnual:'100800'});assert.deepEqual(a.t,b.t);
});
test('Gleiches Jahresbrutto mit 12/13/14 Bezügen ändert den normalen Monatsbetrag',()=>{
 const r=[12,13,14].map(n=>run({foreignPeriod:'annual',liAnnual:'100800',liPayments:String(n)}));
 assert.equal(new Set(r.map(v=>v.plan.regular.available)).size,3);assert.ok(r[0].plan.regular.available>r[2].plan.regular.available);
 for(const v of r)reconciles(v);
});
test('Bei festem Monatsbrutto bleibt das laufende Brutto erhalten und zusätzliche Bezüge ändern den Jahresplan',()=>{
 const a=run({liPayments:'12'}),b=run({liPayments:'14'});assert.equal(a.t.months[0].grossCHF,7200);assert.equal(b.t.months[0].grossCHF,7200);
 assert.ok(b.t.annualAvailable>a.t.annualAvailable);assert.equal(a.t.months[5].salaryCount,1);assert.equal(b.t.months[5].salaryCount,2);
});
test('Bonus erhält ohne bekannte Auszahlung keinen erfundenen Kalendermonat',()=>{
 const r=run({liBonus:'2500'});assert.equal(r.t.unassigned.length,1);assert.equal(r.t.unassigned[0].id,'bonus');
 assert.equal(r.t.months.reduce((n,m)=>n+m.salaryCount,0),14);reconciles(r);
});
test('Eigene Null-Sonderzahlung überschreibt die automatische Aufteilung ohne erfundene Doppeltage',()=>{
 const r=run({liExact:true,specialOverride:true,exactSpecial:'0'});assert.ok(r.t.months.every(m=>m.salaryCount===1));assert.ok(r.t.months.every(m=>m.grossCHF===8400));reconciles(r);
});
test('Eigene Sonderzahlung bei zwölf regulären Bezügen bleibt separat und wird nicht doppelt zugeordnet',()=>{
 const r=run({liPayments:'12',liExact:true,specialOverride:true,exactSpecial:'4000'});assert.equal(r.t.unassigned[0].id,'special');assert.ok(r.t.months.every(m=>m.salaryCount===1));reconciles(r);
});
test('Schweizer Jahresmodell und Beitragsgrenzen saldieren ebenfalls im Kalender',()=>{
 for(const raw of [{foreignCountry:'ch',chCanton:'GE',liAnnual:'9000'},{liAnnual:'18000',liBonus:'3000'}])reconciles(run(raw));
});
test('Negative Monatsbudgets bleiben negative Beträge und werden nicht auf null gesetzt',()=>{
 const r=run({liAnnual:'1000',healthType:'private',privateMonthly:'1500',liCosts:'180'});assert.ok(r.t.months[0].available<0);assert.ok(r.t.months.every(m=>Number.isFinite(m.available)));reconciles(r);
});
test('Jahresverlauf verändert weder Beiträge noch bestehende Zahlungspläne',()=>{
 const r=run(),before=JSON.stringify(r.plan);buildSalaryTimeline(r.plan,{fx:r.i.li.fx,payments:14});assert.equal(JSON.stringify(r.plan),before);
 assert.throws(()=>buildSalaryTimeline(r.plan,{fx:0,payments:14}));assert.throws(()=>buildSalaryTimeline(r.plan,{fx:1,payments:15}));
});
