import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,readInputs,calculateScenario} from '../dist/assets/scenario.mjs';
import {liechtensteinPayslip,payslipLines} from '../dist/assets/payslip.mjs';
const input=raw=>readInputs({...defaults,foreignPeriod:'monthly',pensionPeriod:'monthly',liAnnual:'8.000',liPayments:'14',liExact:true,exactPension:'600',exactNbu:'1,2',exactKtg:'0,8',...raw});

test('Normaler LI-Lohnmonat saldiert zum Auszahlungsbetrag vor AT-Abgaben',()=>{
  const i=input({}),r=liechtensteinPayslip(i);
  assert.equal(r.gross,8000);assert.deepEqual(r.contributions,{ahv:322,iv:54,fak:16,alv:40,nbu:96,ktg:64,pension:600});
  assert.equal(r.social,1192);assert.equal(r.netBeforeSource,6808);assert.equal(r.source,320);assert.equal(r.subsidy,180.5);assert.equal(r.payout,6668.5);
  assert.equal(r.beforeAustrianHealthAndTax,true);
});
test('Vierzehn Gehälter verändern weder zwölf PK-Abzüge noch den regulären Quellensteuerbetrag',()=>{
  const i=input({}),annual=calculateScenario(i).li,month=liechtensteinPayslip(i);
  assert.equal(annual.contributions.pension,7200);assert.equal(month.contributions.pension,600);
  assert.equal(annual.sourceCHF,4480);assert.equal(month.source,320);assert.notEqual(annual.sourceCHF/12,month.source);
  assert.equal(month.contributions.alv,40);assert.notEqual(annual.contributions.alv/12,40);
});
test('Jahresbrutto und Jahres-PK ergeben denselben laufenden Lohnmonat',()=>{
  assert.deepEqual(liechtensteinPayslip(input({})),liechtensteinPayslip(input({foreignPeriod:'annual',pensionPeriod:'annual',liAnnual:'112.000',exactPension:'7.200'})));
});
test('Bonus bleibt außerhalb des normalen Lohnmonats',()=>{
  const a=liechtensteinPayslip(input({})),b=liechtensteinPayslip(input({liBonus:'5.000'}));
  assert.deepEqual(a,b);assert.ok(calculateScenario(input({liBonus:'5.000'})).li.sourceCHF>4480);
});
test('Eigener KK-Arbeitgeberbeitrag erhöht Auszahlung ohne Änderung der Abzüge',()=>{
  const a=liechtensteinPayslip(input({exactSubsidy:'0'})),b=liechtensteinPayslip(input({exactSubsidy:'200'}));
  assert.deepEqual(a.contributions,b.contributions);assert.equal(b.payout-a.payout,200);assert.equal(a.source,b.source);
});
test('ÖGK, Privatprämie und AT-Kosten gehören zum Budget, nicht zur Arbeitgeberauszahlung',()=>{
  const a=liechtensteinPayslip(input({})),b=liechtensteinPayslip(input({healthType:'private',privateMonthly:'350',liCosts:'200'}));
  assert.deepEqual(a,b);assert.notEqual(calculateScenario(input({})).li.available,calculateScenario(input({healthType:'private',privateMonthly:'350',liCosts:'200'})).li.available);
});
test('ALV- und Unfall-Monatsgrenzen bleiben im Lohnmonatsmodell gedeckelt',()=>{
  const r=liechtensteinPayslip(input({liAnnual:'20.000'}));
  assert.equal(r.contributions.alv,52.5);assert.equal(r.contributions.nbu,148.2);assert.equal(r.contributions.ktg,98.8);
  assert.equal(calculateScenario(input({liAnnual:'20.000'})).li.contributions.alv,630);
});
test('Bekannte NBU-/KTG-Jahresbeträge werden als solche anteilig zugeordnet',()=>{
  const r=liechtensteinPayslip(input({contributionUnit:'annual',exactNbu:'1.400',exactKtg:'700'}));
  assert.equal(r.contributions.nbu,100);assert.equal(r.contributions.ktg,50);
});
test('Eigene Sonderzahlungen bestimmen den laufenden Gehaltsteil',()=>{
  const r=liechtensteinPayslip(input({specialOverride:true,exactSpecial:'4.000'}));assert.equal(r.gross,9000);assert.equal(r.source,360);
});
test('Ohne laufenden Gehaltsanteil und für CH wird keine LI-Lohnabrechnung erfunden',()=>{
  assert.equal(liechtensteinPayslip(input({specialOverride:true,exactSpecial:'112.000'})),null);
  assert.equal(liechtensteinPayslip(input({foreignCountry:'ch',exactSource:'5.000'})),null);
});
test('Die zusätzliche Lohnansicht verändert die bestehende Jahresberechnung nicht',()=>{
  const i=input({}),before=calculateScenario(i);liechtensteinPayslip(i);assert.deepEqual(calculateScenario(i),before);
  assert.equal(payslipLines(liechtensteinPayslip(i)).at(-1)[1],6668.5);
});
