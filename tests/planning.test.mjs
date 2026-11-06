import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, profileFrom, sanitizeState } from '../dist/assets/scenario.mjs';
import { calculateCountry } from '../dist/assets/country-workspace.mjs';
import { round } from '../dist/assets/calculator.mjs';
import { buildReport } from '../dist/assets/reporting.mjs';
import { liFamilyEstimate, estimatedSwissPension } from '../dist/assets/planning.mjs';
import { shareHash, readShareHash } from '../dist/assets/share.mjs';

function job(country, extra={}) {
  const state = {
    ...defaults, calculatorCountry:country, foreignCountry:country==='at'?'li':country,
    liAnnual:'100000', foreignPeriod:'annual', fx:'1,1', ...extra,
  };
  return calculateCountry(state, {[state.foreignCountry]:profileFrom(state)}, country);
}

test('AT ohne Sonderzahlungen und mit Veranlagungsentlastung trennt Auszahlung und Jahresbudget', () => {
  const basic = job('at',{atPayments:'12',atPeriod:'annual',atGross:'60000'});
  const tax = job('at',{atPayments:'12',atPeriod:'annual',atGross:'60000',atChurch:'900',atExpenses:'232'});
  assert.equal(tax.result.monthlyGross,5000);
  assert.equal(tax.timeline.payments,12);
  assert.equal(tax.plan.extras.length,0);
  assert.equal(tax.plan.regular.available,basic.plan.regular.available);
  assert.equal(tax.result.assessmentRelief,280);
  assert.equal(round(tax.plan.annual.available-basic.plan.annual.available),280);
});

test('Bestätigte öffentliche LI-Funktion nutzt die Lohnsteuertabelle statt AT-Rücklage', () => {
  const single = job('li',{liEmployer:'public'});
  const married = job('li',{liEmployer:'public',liCivil:'married'});
  const known = job('li',{liEmployer:'public',exactSource:'8000'});
  assert.equal(single.result.sourceCHF,9000);
  assert.equal(married.result.sourceCHF,5000);
  assert.equal(known.result.sourceCHF,8000);
  assert.equal(single.result.reserve,0);
  assert.equal(single.result.sourceCredit,0);
  assert.equal(single.plan.regular.reserve,0);
});

test('CH-Umzug mit ordentlicher Steuer zieht die Jahressteuer nicht vom Lohnzettel ab', () => {
  const ch = job('ch',{chResidence:'ch',chTaxMode:'ordinary',exactSource:'10000',localHealthCHF:'400',chPriceFactor:'1,4'});
  assert.equal(ch.result.sourceCHF,0);
  assert.equal(ch.result.localTaxCHF,10000);
  assert.equal(ch.result.localTax,11000);
  assert.equal(ch.result.health,5280);
  assert.equal(ch.plan.regular.localTax,916.67);
  assert.equal(ch.result.reserve,0);
  assert.equal(ch.result.atTax,0);
  assert.equal(ch.result.payoutCHF,round(ch.result.grossCHF-ch.result.socialCHF));
  const cash = ch.timeline.months.reduce((sum,month)=>sum+month.available,0);
  assert.equal(round(cash+(ch.timeline.adjustment?.available||0)),ch.plan.annual.available);
  assert.throws(()=>job('ch',{chResidence:'ch',chTaxMode:'ordinary'}),/Jahressteuer/);
});

test('Arbeitgeberleistungen, Krankenkasse und Familienzahlung sind getrennte Positionen', () => {
  const li = job('li',{healthType:'local',localHealthCHF:'400',liWorkload:'50',mobilityCHF:'30',mealsCHF:'20',parkingCHF:'100',familyCashCHF:'75',atChurch:'600'});
  const withoutChurch = job('li',{healthType:'local',localHealthCHF:'400',liWorkload:'50',mobilityCHF:'30',mealsCHF:'20',parkingCHF:'100',familyCashCHF:'75'});
  assert.equal(li.result.grossCHF,100600);
  assert.equal(li.plan.regular.subsidyCHF,90.25);
  assert.equal(li.plan.regular.parking,110);
  assert.equal(li.plan.regular.familyCash,82.5);
  assert.ok(li.result.reserve<withoutChurch.result.reserve);
  assert.equal(liFamilyEstimate('3, 10'),670);
  assert.equal(liFamilyEstimate('3, 3',true),720);
  assert.equal(estimatedSwissPension(100000,'ch35'),3213);
});

test('Drei Länder bleiben in Bericht und Kalender getrennt und Rechenlinks sind rücklesbar', () => {
  const jobs = [job('li'),job('at'),job('ch',{liExact:true,exactSource:'6000'})];
  const report = buildReport(jobs);
  assert.deepEqual(report.order,['li','at','ch']);
  assert.equal(report.months[0].values.ch,jobs[2].timeline.months[0].available);
  const payload = {inputs:{...defaults,liChildAges:'4, 11'},view:'compare',threeWay:true};
  assert.deepEqual(readShareHash(shareHash(payload)),payload);
  assert.throws(()=>readShareHash('#rechnung=<img>'));
  const older = {...defaults};
  delete older.atPayments;
  delete older.chResidence;
  assert.equal(sanitizeState(older).atPayments,'14');
  assert.equal(sanitizeState(older).chResidence,'at');
});
