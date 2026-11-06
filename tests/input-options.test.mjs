import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,readInputs,calculateScenario,profileFrom,sanitizeProfiles,sanitizeState} from '../dist/assets/scenario.mjs';
import {OPTIONAL_FIELDS,hasOptionalValues,optionalValues,withoutOptionalValues} from '../dist/assets/input-options.mjs';

test('Basisrechnung benötigt keine geöffneten Zusatzfelder',()=>{
 for(const group of Object.keys(OPTIONAL_FIELDS))assert.equal(hasOptionalValues(defaults,group),false);
 const equivalent={...defaults,liBonus:'0,00',liDistance:'0.00',liCosts:'0,0',childrenYoung:'0',familyShare:'0'};
 for(const group of Object.keys(OPTIONAL_FIELDS))assert.equal(hasOptionalValues(equivalent,group),false);
});
test('Vorhandene Daten aus alten Dateien und Länderprofilen öffnen die passende Gruppe',()=>{
 const raw={...defaults,liBonus:'2000',liCosts:'180',childrenYoung:'1',familyShare:'0.5',atBenefit:'250',atDistance:'30',liWorkload:'80'};
 const safe=sanitizeState(JSON.parse(JSON.stringify(raw))),profile=sanitizeProfiles({li:profileFrom(raw)}).li;
 for(const group of Object.keys(OPTIONAL_FIELDS))assert.equal(hasOptionalValues(safe,group),true);
 for(const group of ['bonus','commute'])assert.equal(hasOptionalValues({...defaults,...profile},group),true);
});
test('Abgewählter Bonus ist neutral; übrige Gehalts- und Versicherungsdaten bleiben erhalten',()=>{
 const raw={...defaults,liBonus:'2000',liCosts:'180',healthType:'private',privateMonthly:'400'};
 const cleared=withoutOptionalValues(raw,'bonus');assert.equal(cleared.liBonus,'0');
 for(const key of Object.keys(defaults).filter(k=>k!=='liBonus'))assert.deepEqual(cleared[key],raw[key]);
 assert.equal(raw.liBonus,'2000');assert.equal(hasOptionalValues(cleared,'bonus'),false);
});
test('Pendeln abwählen entfernt Pauschale und Kosten nur beim zugehörigen Job',()=>{
 const raw={...defaults,liDistance:'30',liPp:'large',liDays:'8',liCosts:'180',atDistance:'40',atPp:'small',atDays:'4',atCosts:'90'};
 const foreign=withoutOptionalValues(raw,'commute'),at=withoutOptionalValues(raw,'atCommute');
 assert.equal(hasOptionalValues(foreign,'commute'),false);assert.equal(hasOptionalValues(foreign,'atCommute'),true);
 assert.equal(hasOptionalValues(at,'atCommute'),false);assert.equal(hasOptionalValues(at,'commute'),true);
 assert.deepEqual(optionalValues(foreign,'atCommute'),optionalValues(raw,'atCommute'));
});
test('Familie abwählen setzt Kinder, Bonusanteil und AVAB gemeinsam auf neutrale Angaben',()=>{
 const raw={...defaults,childrenYoung:'2',childrenAdult:'1',familyShare:'1',avab:true,liCosts:'100'};
 const cleared=withoutOptionalValues(raw,'family');assert.deepEqual(optionalValues(cleared,'family'),optionalValues(defaults,'family'));
 assert.equal(cleared.liCosts,'100');assert.doesNotThrow(()=>readInputs(cleared));
});
test('Österreichische Zusatzangaben abwählen verändert die fertige Auslandsrechnung nicht',()=>{
 const raw={...defaults,atBenefit:'250',atFree:'50',atCar:true,liAnnual:'100.000',fx:'1,09'};
 const cleared=withoutOptionalValues(raw,'atExtras');assert.equal(hasOptionalValues(cleared,'atExtras'),false);
 assert.deepEqual(calculateScenario(readInputs(raw)).li,calculateScenario(readInputs(cleared)).li);
});
test('Entfernte Gruppenwerte lassen sich als Entwurf ohne Einheitenwechsel wiederherstellen',()=>{
 const raw={...defaults,foreignPeriod:'monthly',liAnnual:'7200',liBonus:'2.345,67'};
 const draft=optionalValues(raw,'bonus'),cleared=withoutOptionalValues(raw,'bonus'),restored={...cleared,...draft};
 assert.deepEqual(restored,raw);assert.deepEqual(calculateScenario(readInputs(restored)),calculateScenario(readInputs(raw)));
});
