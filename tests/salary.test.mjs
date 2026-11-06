import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, annualGross, convertGross, readInputs, calculateScenario, sanitizeState, profileFrom, sanitizeProfiles } from '../dist/assets/scenario.mjs';
import { decodeSwissTariff } from '../dist/assets/swiss.mjs';
import sg from '../dist/assets/ch-tariffs-sg.mjs';
const swissData=await decodeSwissTariff(sg);
const inputs=raw=>readInputs({...defaults,...raw},{swissData});

for(const foreignCountry of ['li','ch'])for(const payments of [12,13,14])test(`${foreignCountry}: 6.000 CHF monatlich × ${payments} entspricht dem Jahresbrutto`,()=>{
  const common={foreignCountry,liPayments:String(payments)};
  const monthly=inputs({...common,foreignPeriod:'monthly',liAnnual:'6.000'}),annual=inputs({...common,foreignPeriod:'annual',liAnnual:String(6000*payments)});
  assert.equal(monthly.li.annual,6000*payments);assert.deepEqual(monthly.li,annual.li);
  assert.deepEqual(calculateScenario(monthly),calculateScenario(annual));
});
test('Österreich: 5.000 EUR monatlich und 70.000 EUR jährlich ergeben dieselben Auszahlungen',()=>{
  const monthly=calculateScenario(inputs({atPeriod:'monthly',atGross:'5.000'}));
  const annual=calculateScenario(inputs({atPeriod:'annual',atGross:'70.000'}));
  assert.deepEqual(monthly,annual);
});
test('Umschalten rechnet in beide Richtungen mit der passenden Gehaltsanzahl',()=>{
  for(const payments of [12,13,14]){
    assert.equal(convertGross(6000,'monthly','annual',payments),6000*payments);
    assert.equal(convertGross(6000*payments,'annual','monthly',payments),6000);
  }
  assert.equal(convertGross(70000,'annual','monthly',14),5000);
});
test('Nicht glatt teilbare Gehälter werden beim Umschalten auf Cent gerundet',()=>{
  assert.equal(convertGross(90000,'annual','monthly',13),6923.08);
  assert.equal(annualGross(6923.08,'monthly',13),90000.04);
  assert.equal(convertGross(0,'annual','monthly',13),0);
});
test('Bonus ist weiterhin ein Jahresbetrag und wird nicht mit der Gehaltsanzahl multipliziert',()=>{
  const i=inputs({foreignPeriod:'monthly',liAnnual:'6.000',liPayments:'13',liBonus:'10.000'}),{li}=calculateScenario(i);
  assert.equal(li.grossCHF,88000);assert.equal(li.sourceCHF,3520);assert.equal(li.specialCHF,16000);
  assert.equal(li.contributions.pension,5070);assert.equal(li.health,6783);
});
test('Eigene jährliche Lohnabzüge und NBU-Sätze sind unabhängig vom Eingabezeitraum',()=>{
  const common={liExact:true,exactPension:'4.000',exactNbu:'1,1',liPayments:'13'};
  const m=inputs({...common,foreignPeriod:'monthly',liAnnual:'6.000'}),a=inputs({...common,foreignPeriod:'annual',liAnnual:'78.000'});
  assert.equal(m.li.pension,4000);assert.equal(m.li.nbuAnnual,858);assert.deepEqual(calculateScenario(m),calculateScenario(a));
});
test('Alte Berechnungen ohne foreignPeriod behalten das Jahresbrutto und den AT-Zeitraum',()=>{
  const old={...defaults,atPeriod:'annual',atGross:'70.000'};delete old.foreignPeriod;
  const safe=sanitizeState(old,{legacy:true});assert.equal(safe.foreignPeriod,'annual');assert.equal(safe.liAnnual,'90.000');
  assert.equal(safe.atPeriod,'annual');assert.equal(safe.atGross,'70.000');
  assert.equal(readInputs(safe).li.annual,90000);
});
test('Monats-/Jahreswahl bleibt je Land in Profilen und JSON erhalten',()=>{
  const raw={...defaults,foreignPeriod:'monthly',liAnnual:'6.000'},safe=sanitizeState(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(safe,raw);
  const profiles=sanitizeProfiles({li:profileFrom(raw),ch:profileFrom({...defaults,foreignPeriod:'annual',liAnnual:'95.000'})});
  assert.equal(profiles.li.foreignPeriod,'monthly');assert.equal(profiles.ch.foreignPeriod,'annual');
  const old=profileFrom(defaults);delete old.foreignPeriod;
  assert.equal(sanitizeProfiles({li:old}).li.foreignPeriod,'annual');
});
test('Ungültige Zeiträume, Beträge und überhöhte Jahreshochrechnung werden abgelehnt',()=>{
  for(const args of [[-1,'monthly',13],[NaN,'annual',13],[5000,'weekly',13],[5000,'monthly',15]])assert.throws(()=>annualGross(...args));
  assert.throws(()=>convertGross(5000,'monthly','weekly',13));
  assert.throws(()=>inputs({foreignPeriod:'weekly'}));
  assert.throws(()=>inputs({foreignPeriod:'monthly',liAnnual:'400.000',liPayments:'14'}));
});
test('Die AT-Eingabegrenzen entsprechen demselben Jahresbetrag in beiden Einheiten',()=>{
  const yearly=convertGross(2000000,'monthly','annual',14);
  assert.equal(yearly,28000000);
  assert.deepEqual(calculateScenario(inputs({atGross:'2.000.000'})).at,calculateScenario(inputs({atPeriod:'annual',atGross:String(yearly)})).at);
  assert.throws(()=>inputs({atGross:'2.000.001'}));
});
