import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,readInputs,calculateScenario,exactDisplayValue,exactFieldMeta,sanitizeState,profileFrom,sanitizeProfiles,convertGross} from '../dist/assets/scenario.mjs';
import {displayPeriod} from '../dist/assets/period.mjs';
import {buildPaymentPlans,selectedPayment,paymentDifference} from '../dist/assets/payment-plan.mjs';
const input=raw=>readInputs({...defaults,...raw});
const near=(a,b)=>assert.ok(Math.abs(a-b)<.000001,`${a} != ${b}`);

for(const country of ['li','ch'])for(const payments of [12,13,14])test(`${country}, ${payments} Gehälter: PK-Monatsdurchschnitt wird genau zwölfmal angesetzt`,()=>{
  const common={foreignCountry:country,liAnnual:'78.000',liPayments:String(payments),liExact:true,exactSource:'3.000'};
  const annual=input({...common,exactPension:'4.500',pensionPeriod:'annual'}),monthly=input({...common,exactPension:'375',pensionPeriod:'monthly'});
  assert.equal(monthly.li.pension,4500);assert.deepEqual(calculateScenario(monthly),calculateScenario(annual));
  assert.equal(exactDisplayValue(monthly,'exactPension'),375);
});
test('Automatische PK-Schätzung folgt dem Anzeigezeitraum ohne Änderung des Jahresbeitrags',()=>{
  const m=input({pensionPeriod:'monthly'}),a=input({pensionPeriod:'annual'});
  assert.equal(m.li.pension,5850);assert.equal(exactDisplayValue(m,'exactPension',{automatic:true}),487.5);
  assert.equal(exactDisplayValue(a,'exactPension',{automatic:true}),5850);assert.deepEqual(calculateScenario(m),calculateScenario(a));
  assert.equal(exactFieldMeta('exactPension',m.raw).unit,'CHF / Monat');
});
test('Eigene PK null, leer oder ausgeschaltet behält seine Bedeutung in beiden Einheiten',()=>{
  for(const pensionPeriod of ['monthly','annual']){
    assert.equal(input({pensionPeriod,liExact:true,exactPension:'0'}).li.pension,0);
    assert.equal(input({pensionPeriod,liExact:true,exactPension:''}).li.pension,5850);
    assert.equal(input({pensionPeriod,liExact:false,exactPension:'ungültig'}).li.pension,5850);
  }
  assert.throws(()=>input({liExact:true,pensionPeriod:'monthly',exactPension:'8.000'}),/Brutto/);
  assert.throws(()=>input({liExact:true,pensionPeriod:'monthly',exactPension:'-10'}),/PK/);
});
test('PK-Umschaltung ist von 13./14. Gehalt unabhängig und rundet auf Cent',()=>{
  assert.equal(convertGross(4500,'annual','monthly',12),375);
  assert.equal(convertGross(375,'monthly','annual',12),4500);
  assert.equal(convertGross(5000,'annual','monthly',12),416.67);
  assert.equal(input({liExact:true,exactPension:'416,67',pensionPeriod:'monthly'}).li.pension,5000.04);
});
test('Alte Monatsgehalt-Dateien interpretieren eigene PK weiterhin als Jahresbetrag',()=>{
  const old={...defaults,foreignPeriod:'monthly',liAnnual:'6.000',liExact:true,exactPension:'4.500'};delete old.pensionPeriod;
  const safe=sanitizeState(old,{legacy:true});assert.equal(safe.pensionPeriod,'annual');assert.equal(readInputs(safe).li.pension,4500);
  const profile=profileFrom(old);delete profile.pensionPeriod;
  assert.equal(sanitizeProfiles({li:profile}).li.pensionPeriod,'annual');
});
test('PK-Zeitraum bleibt je Länderprofil und beim JSON-Rundlauf erhalten',()=>{
  const raw={...defaults,foreignPeriod:'monthly',pensionPeriod:'monthly',liAnnual:'6.000',liExact:true,exactPension:'375'};
  const imported=sanitizeState(JSON.parse(JSON.stringify(raw)));assert.equal(readInputs(imported).li.pension,4500);
  const profiles=sanitizeProfiles({li:profileFrom(raw),ch:profileFrom({...defaults,exactPension:'6.000'})});
  assert.equal(profiles.li.pensionPeriod,'monthly');assert.equal(profiles.ch.pensionPeriod,'annual');
});
for(const code of ['monthly','annual'])test(`${code}: laufender Bezug bzw. Jahr saldiert zum Budget`,()=>{
  const i=input({liBonus:'7.000',supplementEnabled:true,supplement:'80',liCosts:'150',atCosts:'100'}),results=calculateScenario(i),plans=buildPaymentPlans(i,results);
  for(const country of ['foreign','at']){const v=selectedPayment(plans[country],code);near(country==='foreign'?Math.round((v.payoutCHF*i.li.fx-v.reserve-v.health-v.supplement-v.extraCosts)*100)/100:v.gross-v.social-v.tax-v.health-v.supplement-v.extraCosts,v.available);}
});
test('Normale Monatsdarstellung enthält volle ÖGK-Prämie und zwölfmonatige PK',()=>{
  const i=input({liExact:true,exactPension:'4.500'}),plans=buildPaymentPlans(i,calculateScenario(i));
  assert.equal(plans.foreign.regular.health,565.25);assert.equal(plans.foreign.regular.contributions.pension,375);assert.equal(plans.foreign.regular.subsidyCHF,180.5);
  assert.equal(displayPeriod('monthly').basis,'regular_month');assert.ok(!displayPeriod('monthly').label.includes('Ø'));
});
test('Private Grundprämie wird nur im laufenden Monat und zwölfmal im Jahr abgezogen',()=>{
  const i=input({healthType:'private',privateMonthly:'350'}),plans=buildPaymentPlans(i,calculateScenario(i));
  assert.equal(plans.foreign.regular.health,350);assert.equal(plans.foreign.annual.health,4200);
  assert.ok(plans.foreign.extras.every(e=>e.health===0));
});
test('Gemischte Eingabezeiträume vergleichen normale Monate oder ganze Jahre',()=>{
  const i=input({foreignPeriod:'annual',atPeriod:'monthly'}),plans=buildPaymentPlans(i,calculateScenario(i));
  assert.equal(paymentDifference(plans,'annual'),Math.round((plans.foreign.annual.available-plans.at.annual.available)*100)/100);
  near(paymentDifference(plans,'monthly'),plans.foreign.regular.available-plans.at.regular.available);
  assert.notEqual(paymentDifference(plans,'monthly'),(plans.foreign.annual.available-plans.at.annual.available)/12);
});
