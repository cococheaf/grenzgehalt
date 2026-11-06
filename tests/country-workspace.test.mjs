import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults,profileFrom,sanitizeState,readInputs,calculateScenario } from '../dist/assets/scenario.mjs';
import { WORK_COUNTRIES,comparisonCountries,selectedCountries,switchPrimary,restoreCountryProfiles,countryInputs,calculateCountry,pairSummary,buildCountryComparison } from '../dist/assets/country-workspace.mjs';
import { decodeSwissTariff } from '../dist/assets/swiss.mjs';
import { round } from '../dist/assets/calculator.mjs';
import sg from '../dist/assets/ch-tariffs-sg.mjs';
import ge from '../dist/assets/ch-tariffs-ge.mjs';
const data={SG:await decodeSwissTariff(sg),GE:await decodeSwissTariff(ge)};
const raw={...defaults,calculatorCountry:'li',comparisonCountry:'ch',foreignCountry:'li',liAnnual:'98000',liPayments:'13',liCosts:'280',fx:'1,0812',atGross:'7500',atCosts:'120'};
const profiles={li:profileFrom(raw),ch:profileFrom({...defaults,liAnnual:'110000',liPayments:'14',liCosts:'330',chCanton:'GE',exactNbu:'1,2',liExact:true,exactPension:'6500'})};
function job(country,extra={},ps=profiles){const r={...raw,...extra},source=countryInputs(r,ps,country);return calculateCountry(r,ps,country,{swissData:data[source.chCanton]});}
function reconciles(t){for(const key of [...t.order,'difference'])assert.equal(round([...t.months,...t.separate].reduce((s,m)=>s+m[key],0)),t.annual[key],key);}
for(const primary of Object.keys(WORK_COUNTRIES))for(const comparison of comparisonCountries(primary))test(`${primary} → ${comparison}: getrennte Rechnung, echte Monate und centgenaue Jahressumme`,()=>{
 const a=job(primary),b=job(comparison),t=buildCountryComparison(a,b),summary=pairSummary(a,b);
 assert.deepEqual(t.order,[primary,comparison]);assert.equal(summary.values[primary],a.plan.regular.available);assert.equal(summary.values[comparison],b.plan.regular.available);
 for(let i=0;i<12;i++){assert.equal(t.months[i][primary],a.timeline.months[i].available);assert.equal(t.months[i][comparison],b.timeline.months[i].available);assert.equal(t.months[i].difference,round(a.timeline.months[i].available-b.timeline.months[i].available));}
 assert.equal(pairSummary(a,b,'annual').difference,t.annual.difference);reconciles(t);
});
test('Der Wechsel des Vergleichslandes verändert Hauptrechnung und ihre Zahltage nicht',()=>{
 for(const primary of Object.keys(WORK_COUNTRIES)){
  const a=job(primary),before=JSON.stringify(a);
  for(const target of comparisonCountries(primary)){buildCountryComparison(a,job(target));pairSummary(a,job(target));assert.equal(JSON.stringify(a),before);}
 }
});
test('Beim Vertauschen bleiben beide Budgets gleich und die Differenz kehrt ihr Vorzeichen um',()=>{
 const a=job('li'),b=job('ch'),forward=buildCountryComparison(a,b),reverse=buildCountryComparison(b,a);
 for(let i=0;i<12;i++){assert.equal(forward.months[i].li,reverse.months[i].li);assert.equal(forward.months[i].ch,reverse.months[i].ch);assert.equal(forward.months[i].difference,-reverse.months[i].difference);}
 assert.equal(forward.annual.difference,-reverse.annual.difference);
});
test('Jedes Rechnerland bietet genau die anderen beiden Länder',()=>{
 for(const country of Object.keys(WORK_COUNTRIES)){const choices=comparisonCountries(country);assert.equal(choices.length,2);assert.equal(choices.includes(country),false);}
 assert.throws(()=>comparisonCountries('xx'));
});
test('Der Hauptlandwechsel behält einen gültigen Vergleich bei und vertauscht nur bei Kollision',()=>{
 assert.deepEqual(switchPrimary('li','at','ch'),{primary:'ch',comparison:'at'});
 assert.deepEqual(switchPrimary('li','ch','ch'),{primary:'ch',comparison:'li'});
 assert.deepEqual(switchPrimary('at','ch','ch'),{primary:'ch',comparison:'at'});
 assert.deepEqual(selectedCountries('at','at'),{primary:'at',comparison:'li'});
});
test('LI und CH behalten eigene Gehälter, Kosten, PK und Schweizer Tarifangaben',()=>{
 const li=job('li'),ch=job('ch');assert.equal(li.inputs.li.annual,98000);assert.equal(ch.inputs.li.annual,110000);assert.equal(li.inputs.li.payments,13);assert.equal(ch.inputs.li.payments,14);assert.equal(li.inputs.li.extraCosts,280);assert.equal(ch.inputs.li.extraCosts,330);assert.equal(ch.inputs.raw.chCanton,'GE');assert.equal(ch.inputs.li.pension,6500);assert.notEqual(li.inputs.li.pension,ch.inputs.li.pension);
 const edited={...raw,...profiles.ch,foreignCountry:'ch',calculatorCountry:'li',comparisonCountry:'ch'},saved=restoreCountryProfiles(edited,profiles);
 assert.equal(countryInputs(edited,saved,'li').liAnnual,'98000');assert.equal(countryInputs(edited,saved,'ch').liAnnual,'110000');
});
test('Ein gespeicherter LI-CH-Vergleich mit sichtbarem CH-Editor erhält nach Import beide Länder',()=>{
 const editor={...raw,...profiles.ch,foreignCountry:'ch'},safe=sanitizeState(JSON.parse(JSON.stringify(editor))),ps=restoreCountryProfiles(safe,JSON.parse(JSON.stringify(profiles)));
 assert.equal(safe.calculatorCountry,'li');assert.equal(safe.comparisonCountry,'ch');assert.equal(countryInputs(safe,ps,'li').liAnnual,'98000');assert.equal(countryInputs(safe,ps,'ch').liAnnual,'110000');
 const a=calculateCountry(safe,ps,'li'),b=calculateCountry(safe,ps,'ch',{swissData:data.GE});assert.equal(a.plan.regular.available,job('li').plan.regular.available);assert.equal(b.plan.regular.available,job('ch').plan.regular.available);
});
test('Alte Berechnungen ergänzen den bisherigen Gegenpart',()=>{
 for(const calculatorCountry of ['at','li','ch']){const old={...defaults,calculatorCountry};delete old.comparisonCountry;assert.equal(sanitizeState(old).comparisonCountry,calculatorCountry==='at'?'li':'at');}
});
test('Bisher global gespeicherter Schweizer Kanton wird in ein altes CH-Profil übernommen',()=>{
 const oldProfile={...profiles.ch};for(const key of ['chCanton','chTariff','chChildren','chChurch'])delete oldProfile[key];
 const restored=restoreCountryProfiles({...raw,chCanton:'GE',chTariff:'C'}, {ch:oldProfile});assert.equal(restored.ch.chCanton,'GE');assert.equal(restored.ch.chTariff,'C');
});
test('Schweizer Tarifladen blockiert keine eigenständige AT-Rechnung',()=>{
 const chRaw={...raw,...profiles.ch,foreignCountry:'ch',calculatorCountry:'at'};
 const pending=calculateCountry(chRaw,profiles,'ch');assert.equal(pending.pending,true);
 const at=calculateCountry(chRaw,profiles,'at',{swissData:data.GE});assert.equal(at.result.monthlyNet,4477.28);assert.equal(at.plan.regular.available,4357.28);
});
test('AT ignoriert einen fremden Schweizer Tarif auch im bisherigen Szenariomodul',()=>{
 const input=readInputs({...raw,foreignCountry:'ch',chCanton:'GE'},{scope:'at',swissData:data.GE});assert.equal(calculateScenario(input).at.monthlyNet,4477.28);
});
test('Native CHF-Werte bleiben bei jedem Paar vor der abschließenden Umrechnung unverändert',()=>{
 for(const country of ['li','ch']){const a=job(country,{fx:'0,91'}),b=job(country,{fx:'1,21'});assert.equal(a.plan.regular.payoutCHF,b.plan.regular.payoutCHF);assert.equal(a.result.socialCHF,b.result.socialCHF);assert.notEqual(a.plan.regular.available,b.plan.regular.available);}
 const a=job('at',{fx:'0,91'}),b=job('at',{fx:'1,21'});assert.deepEqual(a.timeline,b.timeline);
});
test('Bonus und Jahresabgleich bleiben auch bei LI-CH separat und saldieren',()=>{
 const a=job('li',{liBonus:'5000'}),b=job('ch',{}, {...profiles,ch:{...profiles.ch,liBonus:'1200'}}),t=buildCountryComparison(a,b);assert.ok(t.separate.some(r=>r.id==='extra:bonus'));reconciles(t);
});
test('Negative Budgets werden bei frei gewählten Paaren nicht auf null begrenzt',()=>{
 const a=job('li',{liCosts:'20000'}),b=job('ch'),t=buildCountryComparison(a,b);assert.ok(t.months[0].li<0);assert.equal(t.months[0].li,a.timeline.months[0].available);reconciles(t);
});
test('Vergleich und Berechnungen verändern keine ursprünglichen Profile oder Eingaben',()=>{
 const before=JSON.stringify({raw,profiles});for(const c of Object.keys(WORK_COUNTRIES))job(c);buildCountryComparison(job('li'),job('ch'));assert.equal(JSON.stringify({raw,profiles}),before);
 assert.throws(()=>buildCountryComparison(job('li'),job('li')));assert.throws(()=>pairSummary(job('ch'),job('ch')));
});
for(const liPayments of ['12','13','14'])for(const chPayments of ['12','13','14'])test(`LI/CH ${liPayments}/${chPayments}: getrennte Zahltage und zwölfmal laufende Kosten`,()=>{
 const a=job('li',{liPayments}),b=job('ch',{}, {...profiles,ch:{...profiles.ch,liPayments:chPayments}}),t=buildCountryComparison(a,b);
 assert.equal(t.months.reduce((n,m)=>n+m.liCount,0),Number(liPayments));assert.equal(t.months.reduce((n,m)=>n+m.chCount,0),Number(chPayments));
 for(const [country,payments] of [['li',liPayments],['ch',chPayments]])assert.deepEqual(t.months.filter(m=>m[country+'Count']===2).map(m=>m.month),payments==='14'?[5,10]:payments==='13'?[10]:[]);
 assert.equal(t.months[0].li,a.plan.regular.available);assert.equal(t.months[0].ch,b.plan.regular.available);reconciles(t);
});
