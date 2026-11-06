import { defaults } from './scenario.mjs?v=4.23.0';
import { parseNumber } from './numbers.mjs?v=4.23.0';

// Presentation groups reuse the existing inputs and their neutral values.
// No separate salary, tax or contribution calculation is introduced here.
export const OPTIONAL_FIELDS=Object.freeze({
  bonus:['liBonus'],
  commute:['liDistance','liPp','liDays','liCosts'],
  family:['childrenYoung','childrenAdult','familyShare','avab','atChurch','atExpenses'],
  atExtras:['atBenefit','atFree','atCar','atPayments'],
  atCommute:['atDistance','atPp','atDays','atCosts'],
  planning:['liEmployer','liCivil','liWorkload','pensionAge','mobilityCHF','mealsCHF','parkingCHF','familyCashCHF','liChildAges','liTwins'],
});
export function optionalValues(raw,group){
  return Object.fromEntries((OPTIONAL_FIELDS[group]||[]).map(key=>[key,raw[key]??defaults[key]]));
}
export function hasOptionalValues(raw,group){
  return Object.entries(optionalValues(raw,group)).some(([key,value])=>{
    const neutral=defaults[key];
    if(typeof neutral==='boolean')return value!==neutral;
    const n=parseNumber(value),d=parseNumber(neutral);
    return Number.isFinite(n)&&Number.isFinite(d)?n!==d:value!==neutral;
  });
}
export function withoutOptionalValues(raw,group){
  return {...raw,...Object.fromEntries((OPTIONAL_FIELDS[group]||[]).map(key=>[key,defaults[key]]))};
}
