import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,readInputs,sanitizeState,sanitizeProfiles,profileFrom,mergePayrollInputs,calculateScenario} from '../dist/assets/scenario.mjs';
import {buildPaymentPlans} from '../dist/assets/payment-plan.mjs';
import {buildSalaryTimeline} from '../dist/assets/salary-timeline.mjs';
const raw=extra=>({...defaults,foreignPeriod:'monthly',liAnnual:'7200',liPayments:'14',liExact:true,fx:'1,09',...extra});
const legacy=extra=>{const r=raw(extra);delete r.specialOverride;return r;};
function timeline(r){const i=readInputs(r),plans=buildPaymentPlans(i,calculateScenario(i));return buildSalaryTimeline(plans.foreign,{fx:i.li.fx,payments:i.li.payments});}
test('Standard ignoriert ruhende eigene Sonderzahlungen und folgt 12/13/14 Bezügen',()=>{
 for(const liPayments of ['12','13','14'])for(const exactSpecial of ['0','4000','ungültig']){
  const r=raw({liPayments,exactSpecial}),i=readInputs(r),t=timeline(r);
  assert.equal(i.sources.special,'model');assert.equal(i.li.special,7200*(Number(liPayments)-12));
  assert.equal(t.months.reduce((n,m)=>n+m.salaryCount,0),Number(liPayments));
 }
});
test('Alte gespeicherte Nullbeträge werden automatisch aus 14 Gehältern berechnet',()=>{
 for(const exactSpecial of ['0','0,00','0.00','']){
  const r=sanitizeState(legacy({exactSpecial}));assert.equal(r.specialOverride,false);assert.equal(r.exactSpecial,'');
  assert.deepEqual(timeline(r).months.filter(m=>m.salaryCount===2).map(m=>m.month),[5,10]);
 }
});
test('Alte positive eigene Sonderzahlungen bleiben ausdrücklich aktiviert erhalten',()=>{
 const r=sanitizeState(legacy({exactSpecial:'12500'}));assert.equal(r.specialOverride,true);assert.equal(readInputs(r).li.special,12500);
});
test('Länderprofile migrieren Null und positive Sonderzahlungen unabhängig',()=>{
 const li=profileFrom(raw({exactSpecial:'0'})),ch=profileFrom(raw({exactSpecial:'12500'}));delete li.specialOverride;delete ch.specialOverride;
 const migrated=sanitizeProfiles({li,ch});assert.equal(migrated.li.specialOverride,false);assert.equal(migrated.li.exactSpecial,'');assert.equal(migrated.ch.specialOverride,true);
});
test('Neue ausdrücklich gewählte Null bleibt beim Export/Import erhalten',()=>{
 const r=raw({specialOverride:true,exactSpecial:'0'}),loaded=sanitizeState(JSON.parse(JSON.stringify(r)));
 assert.deepEqual(loaded,r);assert.equal(readInputs(loaded).sources.special,'own');assert.equal(timeline(loaded).months.reduce((n,m)=>n+m.salaryCount,0),12);
});
test('Rückkehr zum Standard lässt andere Lohnzettelwerte unverändert',()=>{
 const r=raw({specialOverride:true,exactSpecial:'0',pensionPeriod:'monthly',exactPension:'450',exactNbu:'1,2',exactKtg:'0,7'}),i=readInputs(r),automatic=readInputs({...r,specialOverride:false});
 for(const key of ['pension','nbuAnnual','ktgAnnual','healthSubsidy'])assert.equal(automatic.li[key],i.li[key]);assert.equal(automatic.li.special,14400);
});
test('Alte Lohnzettelimporte aktivieren nur positive eigene Sonderzahlungsbeträge',()=>{
 for(const exactSpecial of ['0','', '12500']){
  const r=mergePayrollInputs(raw({exactPension:'450'}),{exactSpecial});assert.equal(r.specialOverride,exactSpecial==='12500');assert.equal(r.exactPension,'450');
 }
 const r=mergePayrollInputs(raw(),{specialOverride:true,exactSpecial:'0'});assert.equal(r.specialOverride,true);assert.equal(readInputs(r).li.special,0);
});
