import { planningDefaults, foreignPlanningKeys, estimatedSwissPension, suggestedLocalPremium, liPublicWithholding } from './planning.mjs';
import { TAX } from './tax-data.mjs?v=4.23.0';
import { parseNumber } from './numbers.mjs?v=4.23.0';
import { calculateLI, calculateCH, calculateAT, round } from './calculator.mjs?v=4.23.0';
import { CANTONS, swissAnnualSource } from './swiss.mjs?v=4.23.0';
export const COUNTRIES=Object.freeze({li:{name:'Liechtenstein',code:'LI'},ch:{name:'Schweiz',code:'CH'}});
export const MODEL=Object.freeze({version:'2026.12',pension:.065,pensionEntry:14700,nbu:1,ktg:.5,health:TAX.healthMonthly,subsidy:TAX.li.healthEmployerMonthly,chPensionEntry:22680});
export const defaults=Object.freeze({
  ...planningDefaults,
  calculatorCountry:'li',comparisonCountry:'at',foreignCountry:'li',healthType:'oegk',privateMonthly:'',privateDeductible:'',chCanton:'SG',chTariff:'A',chChildren:'0',chChurch:false,
  foreignPeriod:'annual',liAnnual:'90.000',liPayments:'13',liBonus:'0',fx:'1,0600',liDistance:'0',liPp:'none',liDays:'11',liCosts:'0',
  atGross:'5.000',atPeriod:'monthly',atRegion:'vorarlberg',atBenefit:'0',atFree:'0',atCar:false,atDistance:'0',atPp:'none',atDays:'11',atCosts:'0',
  supplementEnabled:false,supplement:'0',atSupplementEnabled:false,atSupplement:'0',contributionUnit:'percent',pensionPeriod:'annual',childrenYoung:'0',childrenAdult:'0',familyShare:'0',avab:false,
  liRounding:'cent',liExact:false,specialOverride:false,exactPension:'',exactNbu:'',exactKtg:'',exactHealth:'',exactSubsidy:'',exactSpecial:'',exactSource:'',exactOther:'',
});
export function annualGross(value,period,payments){
  if(!Number.isFinite(value)||value<0||!['monthly','annual'].includes(period)||![12,13,14].includes(payments))throw new Error('Bitte einen gültigen Bruttobetrag und Bezugszeitraum wählen.');
  return period==='monthly'?round(value*payments):value;
}
export function convertGross(value,from,to,payments){
  const annual=annualGross(value,from,payments);
  if(!['monthly','annual'].includes(to))throw new Error('Ungültiger Bezugszeitraum.');
  return round(to==='monthly'?annual/payments:annual);
}
export const EXACT_FIELDS=Object.freeze({
  exactPension:{key:'pension',label:'PK-Beitrag',unit:'CHF / Jahr',max:5000000},
  exactNbu:{key:'nbuAnnual',label:'NBU',unit:'CHF / Jahr',max:5000000},
  exactKtg:{key:'ktgAnnual',label:'KTG',unit:'CHF / Jahr',max:5000000},
  exactHealth:{key:'health',label:'ÖGK-Beitrag',unit:'EUR / Monat',max:100000},
  exactSubsidy:{key:'healthSubsidy',label:'Arbeitgeber-KV-Beitrag',unit:'CHF / Monat',max:100000},
  exactSpecial:{key:'special',label:'Enthaltene Sonderzahlungen',unit:'CHF / Jahr',max:5000000},
  exactSource:{key:'sourceAnnual',label:'Schweizer Quellensteuer',unit:'CHF / Jahr',max:5000000},
  exactOther:{key:'otherAnnual',label:'Weitere Pflichtabgaben',unit:'CHF / Jahr',max:5000000},
});
export function exactFieldMeta(field,raw){const base=EXACT_FIELDS[field];if(field==='exactPension'&&raw.pensionPeriod==='monthly')return {...base,unit:'CHF / Monat',pensionMonth:true};return ['exactNbu','exactKtg'].includes(field)&&raw.contributionUnit==='percent'?{...base,unit:'%',max:10,percent:true}:base;}
export function exactDisplayValue(inputs,field,{automatic=false}={}){
  const meta=exactFieldMeta(field,inputs.raw),values=automatic?inputs.automatic:inputs.li;
  if(meta.pensionMonth)return values[meta.key]/12;
  if(!meta.percent)return values[meta.key];
  if(automatic||inputs.sources[meta.key]!=='own')return field==='exactNbu'?MODEL.nbu:MODEL.ktg;
  return parseNumber(String(inputs.raw[field]).trim().replace(/%$/,'').trim(),false);
}
export function exactFieldActive(field,raw){return !(field==='exactSpecial'&&raw.specialOverride!==true||field==='exactHealth'&&(raw.healthType!=='oegk'||raw.foreignCountry==='ch'&&raw.chResidence==='ch')||field==='exactSubsidy'&&raw.foreignCountry==='ch'||field==='exactOther'&&raw.foreignCountry!=='ch'||field==='exactSource'&&raw.foreignCountry!=='ch'&&raw.liEmployer!=='public');}
export const PROFILE_KEYS=Object.freeze([...foreignPlanningKeys,'foreignPeriod','liAnnual','liPayments','liBonus','liDistance','liPp','liDays','liCosts','liExact','liRounding','specialOverride','healthType','privateMonthly','privateDeductible','supplementEnabled','supplement','contributionUnit','pensionPeriod','chCanton','chTariff','chChildren','chChurch',...Object.keys(EXACT_FIELDS)]);
export function profileFrom(raw){return Object.fromEntries(PROFILE_KEYS.map(k=>[k,raw[k]??defaults[k]]));}
export function sanitizeProfiles(profiles){
  if(profiles==null)return {};
  if(typeof profiles!=='object'||Array.isArray(profiles))throw new Error('Ungültige Länderprofile.');
  const safe={};for(const country of ['li','ch'])if(profiles[country]){
    const original=profiles[country];if(typeof original!=='object'||Array.isArray(original))throw new Error('Ungültiges Länderprofil.');const raw=migratePayrollInputs(original);
    safe[country]={};for(const key of PROFILE_KEYS){const value=raw[key]??defaults[key];if(typeof value!==typeof defaults[key]||typeof value==='string'&&value.length>50)throw new Error('Ungültige Angabe im Länderprofil.');safe[country][key]=value;}
  }return safe;
}
const rules={atChurch:[0,100000,'Kirchenbeitrag'],atExpenses:[0,500000,'Werbungskosten'],liWorkload:[1,100,'Pensum'],chPriceFactor:[0.1,10,'Preisniveau'],mobilityCHF:[0,100000,'Mobilitätsbonus'],mealsCHF:[0,100000,'Essenszuschuss'],parkingCHF:[0,100000,'Parkplatz'],familyCashCHF:[0,100000,'Familienzulagen'],liAnnual:[0,5000000,'Brutto im Arbeitsland'],liBonus:[0,5000000,'Bonus'],fx:[0,10,'CHF/EUR-Kurs'],liDistance:[0,1000,'Pendlerstrecke Ausland'],liCosts:[0,100000,'Kosten Ausland'],atGross:[0,28000000,'Brutto Österreich'],atBenefit:[0,100000,'Sachbezug'],atFree:[0,100000,'Freibetrag'],atDistance:[0,1000,'Pendlerstrecke AT'],atCosts:[0,100000,'Kosten AT'],childrenYoung:[0,20,'Kinder unter 18'],childrenAdult:[0,20,'Kinder ab 18']};
const choices={atPayments:['12','14'],liEmployer:['private','public'],liCivil:['single','married'],pensionAge:['standard','liMinor','liYouth','chUnder25','ch25','ch35','ch45','ch55'],chResidence:['at','ch'],chTaxMode:['withholding','ordinary'],foreignCountry:['li','ch'],healthType:['oegk','private','local'],chCanton:Object.keys(CANTONS),chTariff:['A','B','C','H'],chChildren:Array.from({length:10},(_,i)=>String(i)),liPayments:['12','13','14'],atPeriod:['monthly','annual'],atRegion:['vorarlberg','tirol','salzburg','oberoesterreich','niederoesterreich','wien','steiermark','kaernten','burgenland'],liPp:['none','small','large'],atPp:['none','small','large'],liDays:['0','4','8','11'],atDays:['0','4','8','11'],familyShare:['0','0.5','1']};
choices.liRounding=['cent','nickel'];
choices.contributionUnit=['percent','annual'];
choices.foreignPeriod=['monthly','annual'];
choices.pensionPeriod=['monthly','annual'];
const NEW_KEYS=new Set([...Object.keys(planningDefaults),'specialOverride','liRounding','pensionPeriod','foreignPeriod','foreignCountry','healthType','privateMonthly','privateDeductible','chCanton','chTariff','chChildren','chChurch','liExact','supplementEnabled','contributionUnit',...Object.keys(EXACT_FIELDS)]);
function migratePayrollInputs(data){
  const migrated={...data};
  if(!('calculatorCountry'in data))migrated.calculatorCountry=data.foreignCountry||'li';
  if(!('comparisonCountry'in data))migrated.comparisonCountry=migrated.calculatorCountry==='at'?'li':'at';

  // Earlier saved zeroes suppressed 13th/14th salaries without an explicit choice.
  if(!('specialOverride'in data)){migrated.specialOverride=parseNumber(data.exactSpecial)>0;if(!migrated.specialOverride)migrated.exactSpecial='';}
  // Earlier files stored NBU/KTG as annual CHF. Never reinterpret amounts as rates.
  if(!('contributionUnit'in data))migrated.contributionUnit=['exactNbu','exactKtg'].some(key=>String(data[key]??'').trim()!=='')?'annual':'percent';
  if(!('supplementEnabled'in data))migrated.supplementEnabled=data.healthType!=='private'&&parseNumber(data.supplement)>0;
  if(data.healthType==='private'){migrated.supplementEnabled=false;migrated.supplement='0';}
  if(!('atSupplementEnabled'in data))migrated.atSupplementEnabled=migrated.healthType!=='private'&&migrated.supplementEnabled===true;
  if(!('atSupplement'in data))migrated.atSupplement=migrated.atSupplementEnabled?migrated.supplement||'0':'0';
  return migrated;
}
export function sanitizeState(data,{legacy=false}={}){
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Die Datei enthält keine gültigen Eingaben.');
  data=migratePayrollInputs(data);
  const safe={};for(const [key,original]of Object.entries(defaults)){
    // Old v4.0 private selection did not contain enough data for this model: start at ÖGK.
    const oldHealth=legacy&&!('foreignCountry'in data)&&key==='healthType';
    const value=oldHealth?original:!(key in data)&&(NEW_KEYS.has(key)||legacy&&key==='supplement')?original:data[key];
    if(typeof value!==typeof original||typeof value==='string'&&value.length>50)throw new Error('Unvollständige oder ungültige Eingaben in der Datei.');safe[key]=value;
  }readInputs(safe,{scope:safe.calculatorCountry==='at'?'at':'foreign'});return safe;
}
export function readInputs(original,{swissData,scope='both'}={}){
  if(!['both','at','foreign'].includes(scope))throw new Error('Ungültiger Berechnungsumfang.');
  // An independent calculator must not depend on unfinished fields of the other job.
  const raw={...defaults,...original};
  if(scope==='at')for(const key of [...PROFILE_KEYS,'fx','chCanton','chTariff','chChildren','chChurch'])raw[key]=defaults[key];
  if(scope==='at')raw.foreignCountry=defaults.foreignCountry;
  if(scope==='foreign')for(const key of Object.keys(defaults).filter(k=>k.startsWith('at')&&!['atExpenses','atChurch'].includes(k)))raw[key]=defaults[key];
  if(!['li','ch','at'].includes(raw.calculatorCountry??raw.foreignCountry))throw new Error('Bitte ein gültiges Arbeitsland wählen.');
  const n={};for(const [key,[min,max,label]]of Object.entries(rules)){
    n[key]=parseNumber(raw[key],key!=='fx');if(!Number.isFinite(n[key])||n[key]<min||n[key]>max)throw new Error(`${label}: Bitte einen gültigen Wert zwischen ${min.toLocaleString('de-AT')} und ${max.toLocaleString('de-AT')} eingeben.`);
  }
  for(const [key,allowed]of Object.entries(choices))if(!allowed.includes(raw[key]))throw new Error('Bitte eine gültige Länder-, Versicherungs- oder Tarifauswahl treffen.');
  if(raw.atPeriod==='monthly'&&n.atGross>2000000)throw new Error('Das österreichische Monatsbrutto darf 2.000.000 EUR nicht überschreiten.');
  for(const key of ['childrenYoung','childrenAdult'])if(!Number.isInteger(n[key]))throw new Error('Die Anzahl der Kinder muss eine ganze Zahl sein.');
  if(raw.avab&&n.childrenYoung+n.childrenAdult===0)throw new Error('Für AVAB / AEAB muss mindestens ein anspruchsberechtigtes Kind eingetragen sein.');
  if(n.liAnnual>0&&n.fx<=0)throw new Error('Bitte einen positiven CHF/EUR-Kurs eingeben.');
  const annual=annualGross(n.liAnnual,raw.foreignPeriod,Number(raw.liPayments));
  if(annual>5000000)throw new Error('Das hochgerechnete Vertrags-Jahresbrutto darf 5.000.000 CHF nicht überschreiten.');
  const ch=raw.foreignCountry==='ch';
  const liMinor=!ch&&raw.pensionAge==='liMinor';
  const liYouth=liMinor||!ch&&raw.pensionAge==='liYouth';
  const resident=ch&&raw.chResidence==='ch',publicLI=!ch&&raw.liEmployer==='public';
  const localHealth=resident||raw.healthType==='local',privateHealth=!localHealth&&raw.healthType==='private';
  const taxableExtras=(n.mobilityCHF+n.mealsCHF)*12, fullAnnual=round(annual+taxableExtras),gross=fullAnnual+n.liBonus;
  const supplement=raw.supplementEnabled===true&&!privateHealth&&!localHealth?parseNumber(raw.supplement):0;
  const atSupplement=raw.atSupplementEnabled===true?parseNumber(raw.atSupplement):0;
  if(!Number.isFinite(atSupplement)||atSupplement<0||atSupplement>100000)throw new Error('Zusatzversicherung Österreich: Bitte eine gültige monatliche Prämie eingeben.');
  if(!Number.isFinite(supplement)||supplement<0||supplement>100000)throw new Error('Zusatzversicherung: Bitte eine gültige monatliche Prämie eingeben.');
  let health=MODEL.health,healthDeductible=MODEL.health;
  if(localHealth){
    const premium=String(raw.localHealthCHF).trim()===''
      ? suggestedLocalPremium({country:raw.foreignCountry,resident,canton:raw.chCanton,age:raw.pensionAge})
      : parseNumber(raw.localHealthCHF);
    if(!Number.isFinite(premium)||premium<=0||premium>100000)throw new Error('Bitte eine gültige monatliche OKP-/KVG-Prämie in CHF eingeben.');
    health=premium*n.fx;
    healthDeductible=health;
  }
  if(privateHealth){
    health=parseNumber(raw.privateMonthly);healthDeductible=parseNumber(raw.privateDeductible);
    if(!Number.isFinite(health)||health<=0||health>100000)throw new Error('Bitte die monatliche Prämie deiner privaten Grenzgänger-Krankenversicherung eingeben.');
    if(!Number.isFinite(healthDeductible)||healthDeductible<0||healthDeductible>health)throw new Error('Der steuerlich anerkannte Pflichtanteil muss zwischen 0 und der privaten Prämie liegen.');
  }
  const shared={year:2026,childrenYoung:n.childrenYoung,childrenAdult:n.childrenAdult,familyShare:Number(raw.familyShare),avab:raw.avab,expenses:n.atExpenses,church:n.atChurch};
  const pension=ch
    ? (raw.pensionAge==='standard'&&!resident ? (annual>MODEL.chPensionEntry?round(annual*MODEL.pension):0)
      : estimatedSwissPension(annual,raw.pensionAge==='standard'?'ch35':raw.pensionAge))
    : (annual>=MODEL.pensionEntry&&!liYouth?round(annual*MODEL.pension):0);
  const automatic={pension,nbuAnnual:round(Math.min(gross,148200)*MODEL.nbu/100),ktgAnnual:round(Math.min(gross,148200)*MODEL.ktg/100),health,healthSubsidy:ch?0:round(MODEL.subsidy*n.liWorkload/100*(liYouth?.5:1)),special:annual*(Number(raw.liPayments)-12)/Number(raw.liPayments),sourceAnnual:publicLI?liPublicWithholding(gross,raw.liCivil):0,otherAnnual:0};
  const applied={...automatic},sources={};let ownCount=privateHealth?1:0;
  for(const field of Object.keys(EXACT_FIELDS)){
    const {key,label,max,percent,pensionMonth}=exactFieldMeta(field,raw);
    const own=exactFieldActive(field,raw)&&(raw.liExact===true||field==='exactSource'&&(publicLI||resident&&raw.chTaxMode==='ordinary'))&&String(raw[field]??'').trim()!=='';sources[key]=own?'own':'model';if(!own)continue;
    const value=parseNumber(percent?String(raw[field]).trim().replace(/%$/,'').trim():raw[field],!percent);if(!Number.isFinite(value)||value<0||value>max)throw new Error(percent?`${label}: Bitte einen Prozentsatz zwischen 0 und 10 eingeben.`:`${label}: Bitte einen gültigen positiven Betrag oder 0 eingeben.`);
    if(key==='health'&&value<=0)throw new Error('Der ÖGK-Beitrag muss größer als 0 sein. Für einen privaten Grundschutz bitte oben „Privatversicherung“ wählen.');
    applied[key]=percent?round(Math.min(gross,148200)*value/100):pensionMonth?round(value*12):value;ownCount++;
  }
  if(privateHealth){sources.health='own';healthDeductible=Math.min(healthDeductible,applied.health);}else healthDeductible=applied.health;
  if(applied.special>annual)throw new Error('Enthaltene Sonderzahlungen dürfen das Vertrags-Jahresbrutto nicht überschreiten.');
  if(gross>0&&applied.pension+applied.nbuAnnual+applied.ktgAnnual+applied.otherAnnual>gross)throw new Error('Die eingetragenen Arbeitnehmerbeiträge dürfen zusammen nicht höher als das Brutto sein.');
  if(gross>0&&resident&&raw.chTaxMode==='ordinary'&&sources.sourceAnnual!=='own'){
    throw new Error('Bitte die geschätzte Schweizer Jahressteuer aus dem amtlichen Steuerrechner eingeben.');
  }
  if(publicLI&&applied.sourceAnnual>gross)throw new Error('Die LI-Jahressteuer darf das Brutto nicht überschreiten.');
  let sourceQuote=null;
  if(ch){
    if(sources.sourceAnnual!=='own'&&raw.chTariff==='H'&&raw.chChildren==='0')throw new Error('CH-Tarif H benötigt mindestens ein abzugsberechtigtes Kind.');
    if(swissData&&sources.sourceAnnual!=='own'){try{sourceQuote=swissAnnualSource({annual:fullAnnual,bonus:n.liBonus,special:applied.special,payments:raw.liPayments,canton:raw.chCanton,tariff:raw.chTariff,children:Number(raw.chChildren),church:raw.chChurch},swissData);automatic.sourceAnnual=sourceQuote.tax;}catch(error){if(sources.sourceAnnual!=='own')throw error;}}
    if(sources.sourceAnnual!=='own')applied.sourceAnnual=automatic.sourceAnnual;
    if(applied.sourceAnnual>gross)throw new Error('Die Schweizer Quellensteuer darf das Brutto nicht überschreiten.');
  }
  return {raw:{...defaults,...original},scope,automatic,sources,ownCount,sourceQuote,sourcePending:scope!=='at'&&ch&&!sourceQuote&&sources.sourceAnnual!=='own',fieldCount:Object.keys(EXACT_FIELDS).filter(f=>exactFieldActive(f,raw)).length+(privateHealth?1:0),supplement,atSupplement,
    li:{...shared,pensionPayments:12,subsidyPayments:12,contractAnnual:annual,resident,publicLI,liMinor,ordinaryCH:resident&&raw.chTaxMode==='ordinary',taxableExtras,familyCashMonthly:n.familyCashCHF*n.fx,parkingMonthly:n.parkingCHF*n.fx,payments:Number(raw.liPayments),payrollRounding:!ch&&raw.liExact&&raw.liRounding==='nickel'?.05:.01,annualFeeKeys:raw.contributionUnit==='annual'?['nbuAnnual','ktgAnnual'].filter(k=>sources[k]==='own'):[],annual:fullAnnual,bonus:n.liBonus,fx:n.fx,nbu:MODEL.nbu,ktg:MODEL.ktg,...applied,nbuRate:sources.nbuAnnual==='own'&&raw.contributionUnit==='percent'?parseNumber(String(raw.exactNbu).replace(/%$/,'').trim(),false):MODEL.nbu,ktgRate:sources.ktgAnnual==='own'&&raw.contributionUnit==='percent'?parseNumber(String(raw.exactKtg).replace(/%$/,'').trim(),false):MODEL.ktg,healthDeductible,canton:raw.chCanton,extraCosts:n.liCosts,distance:n.liDistance,pendlerType:raw.liPp,days:Number(raw.liDays)},
    at:{...shared,payments:Number(raw.atPayments),gross:n.atGross,period:raw.atPeriod,region:raw.atRegion,benefit:n.atBenefit,taxFree:n.atFree,companyCar:raw.atCar,extraCosts:n.atCosts,distance:n.atDistance,pendlerType:raw.atPp,days:Number(raw.atDays)}};
}
function withSupplement(result,monthly){const supplement=round(monthly*12),available=round(result.available-supplement);return {...result,supplement,available,average:available/12};}
export function calculateScenario(inputs){
  if(inputs.sourcePending)throw new Error('Der Schweizer Quellensteuertarif wird noch geladen.');
  const li=inputs.scope==='at'?null:withSupplement((inputs.raw.foreignCountry==='ch'?calculateCH:calculateLI)(inputs.li),inputs.supplement);if(li)li.warnings=[];
  return {li,at:inputs.scope==='foreign'?null:withSupplement(calculateAT(inputs.at),inputs.atSupplement??inputs.supplement)};
}

const PAYROLL_PATCH_KEYS=new Set(['foreignPeriod','liAnnual','liPayments','liBonus','liExact','liRounding','specialOverride','pensionPeriod','contributionUnit','exactPension','exactNbu','exactKtg','exactSubsidy','exactSpecial']);
// A payroll-only import preserves insurance, expenses, family, AT and FX inputs.
export function mergePayrollInputs(current,patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Die Datei enthält keine gültigen Lohnzetteldaten.');
  // Accept and discard the removed checkbox in earlier private import files.
  if('liSamePayroll' in patch&&typeof patch.liSamePayroll!=='boolean')throw new Error('Ungültige frühere Lohnzettelauswahl.');
  patch=Object.fromEntries(Object.entries(patch).filter(([key])=>key!=='liSamePayroll'));
  for(const [key,value] of Object.entries(patch))if(!PAYROLL_PATCH_KEYS.has(key)||typeof value!==typeof defaults[key]||typeof value==='string'&&value.length>50)throw new Error('Die Lohnzetteldatei enthält unerlaubte oder ungültige Angaben.');
  if('exactSpecial'in patch&&!('specialOverride'in patch)){patch={...patch,specialOverride:parseNumber(patch.exactSpecial)>0};if(!patch.specialOverride)patch.exactSpecial='';}
  return sanitizeState({...current,...patch,calculatorCountry:'li',foreignCountry:'li'});
}
