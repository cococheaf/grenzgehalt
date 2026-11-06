import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL, defaults, readInputs, sanitizeState, calculateScenario } from '../dist/assets/scenario.mjs';
const base=()=>readInputs({...defaults,fx:'1,0500'});
test('Näherungsmodell braucht keine Angaben zu Abgaben',()=>{
 const inputs=base(),{li}=calculateScenario(inputs);
 assert.equal(inputs.li.pension,5850);
 assert.equal(li.contributions.ahv,3622.5);
 assert.equal(li.contributions.iv,607.5);
 assert.equal(li.contributions.fak,180);
 assert.equal(li.contributions.alv,450);
 assert.equal(li.contributions.nbu,900);
 assert.equal(li.contributions.ktg,450);
 assert.equal(li.health,6783);
 assert.equal(li.subsidyCHF,2166);
 assert.equal(li.sourceCHF,3600);
 assert.ok(li.available>0);
});
test('PK-Eintrittsschwelle wird berücksichtigt',()=>{
 assert.equal(readInputs({...defaults,liAnnual:'14.699'}).li.pension,0);
 assert.equal(readInputs({...defaults,liAnnual:'14.700'}).li.pension,955.5);
});
test('Hohe Gehälter begrenzen ALV, NBU und Taggeld getrennt',()=>{
 const {li}=calculateScenario(readInputs({...defaults,liAnnual:'250.000'}));
 assert.equal(li.contributions.alv,630);
 assert.equal(li.contributions.nbu,1482);
 assert.equal(li.contributions.ktg,741);
});
test('Bonus erhöht Quellensteuer, aber nicht die PK-Pauschale',()=>{
 const a=base(),b=readInputs({...defaults,fx:'1,0500',liBonus:'10.000'});
 assert.equal(b.li.pension,a.li.pension);
 assert.equal(calculateScenario(b).li.sourceCHF-calculateScenario(a).li.sourceCHF,400);
});
test('Private Zusatzversicherung ersetzt ÖGK in keinem Szenario',()=>{
 const a=calculateScenario(base()),b=calculateScenario(readInputs({...defaults,fx:'1,0500',supplementEnabled:true,supplement:'120',atSupplementEnabled:true,atSupplement:'120'}));
 for(const kind of ['li','at']){
  assert.equal(a[kind].tax,b[kind].tax);
  assert.equal(a[kind].social,b[kind].social);
  assert.ok(Math.abs(a[kind].available-b[kind].available-1440)<.01);
 }
 assert.equal(b.li.health,MODEL.health*12);
});
test('Länderkosten beeinflussen nur das eigene Szenario',()=>{
 const a=calculateScenario(base()),b=calculateScenario(readInputs({...defaults,fx:'1,0500',atCosts:'300'}));
 assert.equal(a.li.available,b.li.available);
 assert.equal(a.at.available-b.at.available,3600);
});
test('Alte individuelle Abgaben werden bei Import durch das Modell ersetzt',()=>{
 const old={...defaults,liPension:'99.999',liNbu:'9',healthType:'private',healthMonthly:'0',healthSubsidy:'0'};
 delete old.foreignCountry;
 delete old.supplement;
 const migrated=sanitizeState(old,{legacy:true}),inputs=readInputs(migrated);
 assert.equal(inputs.li.pension,5850);
 assert.equal(inputs.li.health,565.25);
 assert.equal(inputs.supplement,0);
 assert.equal('liPension' in migrated,false);
});
test('Aktuelle Szenarien erhalten Zusatzversicherung und werden validiert',()=>{
 assert.equal(sanitizeState({...defaults,supplementEnabled:true,supplement:'180',atSupplementEnabled:true,atSupplement:'180'}).supplement,'180');
 assert.throws(()=>sanitizeState({...defaults,supplementEnabled:true,supplement:'-1'}));
 assert.throws(()=>readInputs({...defaults,fx:'0'}));
 assert.throws(()=>readInputs({...defaults,liPayments:'15'}));
});

test('Eigene Jahresbeiträge ersetzen die Schätzung genau einmal',()=>{
 const inputs=readInputs({...defaults,fx:'1,0500',liExact:true,contributionUnit:'annual',exactPension:'3.600,25',exactNbu:'750,50',exactKtg:'225,75'});
 const {li}=calculateScenario(inputs);
 assert.equal(li.contributions.pension,3600.25);
 assert.equal(li.contributions.nbu,750.5);
 assert.equal(li.contributions.ktg,225.75);
 assert.equal(inputs.ownCount,3);
 assert.equal(inputs.sources.pension,'own');
 assert.equal(inputs.sources.health,'model');
});
test('Aktivierter Modus mit leeren Feldern bleibt bei derselben Näherung',()=>{
 const a=calculateScenario(base()),inputs=readInputs({...defaults,fx:'1,0500',liExact:true}),b=calculateScenario(inputs);
 assert.deepEqual(a,b);
 assert.equal(inputs.ownCount,0);
 assert.ok(Object.values(inputs.sources).every(s=>s==='model'));
});
test('Ausgeschaltete eigene Werte beeinflussen weder Rechnung noch Validierung',()=>{
 const inputs=readInputs({...defaults,fx:'1,0500',exactPension:'ungültig',exactHealth:'0',specialOverride:true,exactSpecial:'999.999'});
 assert.equal(inputs.ownCount,0);
 assert.deepEqual(calculateScenario(inputs),calculateScenario(base()));
});
test('Null ist eine eigene Angabe und wird nicht durch eine Pauschale ersetzt',()=>{
 const inputs=readInputs({...defaults,liExact:true,exactPension:'0',exactNbu:'0',exactKtg:'0',exactSubsidy:'0',specialOverride:true,exactSpecial:'0'});
 const {li}=calculateScenario(inputs);
 assert.equal(inputs.ownCount,5);
 assert.equal(li.contributions.pension,0);
 assert.equal(li.contributions.nbu,0);
 assert.equal(li.contributions.ktg,0);
 assert.equal(li.subsidyCHF,0);
 assert.equal(li.specialCHF,0);
});
test('Bekannte NBU- und Taggeldbeträge werden nicht erneut als Prozentsatz gedeckelt',()=>{
 const {li}=calculateScenario(readInputs({...defaults,liAnnual:'250.000',liExact:true,contributionUnit:'annual',exactNbu:'1.234,56',exactKtg:'444,44'}));
 assert.equal(li.contributions.nbu,1234.56);
 assert.equal(li.contributions.ktg,444.44);
 assert.equal(li.contributions.alv,630);
});
test('Tatsächliche ÖGK-Prämie gilt nur für LI, Zusatzversicherung bleibt zusätzlich',()=>{
 const a=calculateScenario(base()),b=calculateScenario(readInputs({...defaults,fx:'1,0500',liExact:true,exactHealth:'400',supplementEnabled:true,supplement:'100',atSupplementEnabled:true,atSupplement:'100'}));
 assert.equal(b.li.health,4800);
 assert.equal(b.li.supplement,1200);
 assert.equal(b.at.social,a.at.social);
 assert.equal(b.at.tax,a.at.tax);
 assert.equal(b.at.available,a.at.available-1200);
});
test('Tatsächliche Sonderzahlungen bleiben unabhängig von der Auszahlungszahl erhalten',()=>{
 for(const liPayments of ['12','13','14']){
  const inputs=readInputs({...defaults,liExact:true,liPayments,specialOverride:true,exactSpecial:'8.000',liBonus:'2.000'});
  assert.equal(inputs.li.special,8000);
  assert.equal(calculateScenario(inputs).li.specialCHF,10000);
 }
});
test('Ungültige aktive Detailangaben werden abgelehnt',()=>{
 for(const extra of [{exactPension:'-1'},{exactNbu:'abc'},{exactKtg:'1e3'},{exactHealth:'0'},{specialOverride:true,exactSpecial:'100.000'},{exactPension:'89.000',exactNbu:'2.000'}])
  assert.throws(()=>readInputs({...defaults,liExact:true,...extra}));
});
test('Version 4.1 lädt im Schätzmodus und erhält bestehende Zusatzkosten',()=>{
 const old={...defaults,supplement:'120'};
 for(const key of ['liExact','exactPension','exactNbu','exactKtg','exactHealth','exactSubsidy','exactSpecial'])delete old[key];
 const migrated=sanitizeState(old,{legacy:true});
 assert.equal(migrated.liExact,false);
 assert.equal(migrated.supplement,'120');
 assert.equal(readInputs(migrated).ownCount,0);
});
test('Speichern und Laden erhält Checkbox, eigene Werte und leere Rückfallfelder',()=>{
 const raw={...defaults,liExact:true,exactPension:'3.456,78',exactHealth:'450,25',exactNbu:'0'};
 const loaded=sanitizeState(JSON.parse(JSON.stringify(raw)));
 assert.deepEqual(loaded,raw);
 assert.deepEqual(calculateScenario(readInputs(loaded)),calculateScenario(readInputs(raw)));
 assert.equal(readInputs(loaded).sources.ktgAnnual,'model');
});
