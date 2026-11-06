import { buildReport, renderReport, renderOverviewTable, renderLedgerTable, reportCsv } from './reporting.mjs?v=4.24.1';
import { WORK_COUNTRIES, comparisonCountries, selectedCountries, switchPrimary, restoreCountryProfiles, countryInputs, calculateCountry, pairSummary, buildCountryComparison } from './country-workspace.mjs?v=4.23.0';
import { buildComparisonTimeline } from './comparison-timeline.mjs?v=4.23.0';
import { buildSalaryTimeline, buildAustrianTimeline, MONTHS, PAYDAY_NOTE } from './salary-timeline.mjs?v=4.23.0';
import { OPTIONAL_FIELDS, optionalValues, hasOptionalValues, withoutOptionalValues } from './input-options.mjs?v=4.23.0';
import { createRateController, FX_CACHE_KEY } from './exchange-rate.mjs?v=4.23.0';
import { parseNumber } from './numbers.mjs?v=4.23.0';
import { round, tariff } from './calculator.mjs?v=4.23.0';
import { TAX, SOURCES } from './tax-data.mjs?v=4.23.0';
import { MODEL, COUNTRIES, EXACT_FIELDS, PROFILE_KEYS, exactFieldMeta, exactDisplayValue, exactFieldActive, profileFrom, sanitizeProfiles, defaults, annualGross, convertGross, mergePayrollInputs, readInputs, sanitizeState, calculateScenario } from './scenario.mjs?v=4.23.0';
import { liechtensteinPayslip, PAYSLIP_NOTE } from './payslip.mjs?v=4.23.0';
import { CANTONS, decodeSwissTariff } from './swiss.mjs?v=4.23.0';
import { displayPeriod, oppositePeriod } from './period.mjs?v=4.23.0';
import { buildPaymentPlans, selectedPayment, paymentDifference, comparisonSummary, annualBudgetParts, PAYMENT_NOTE } from './payment-plan.mjs?v=4.23.0';

import { liFamilyEstimate, suggestedLocalPremium } from './planning.mjs';
import { shareHash, readShareHash } from './share.mjs';

const APP_VERSION='4.24.1';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const form=$('#calculator-form'), result=$('#result-content');
const integer=new Intl.NumberFormat('de-AT',{maximumFractionDigits:0});
const whole=n=>integer.format(n), rounding=()=>last?.inputs.ownCount?1:10, estimate=n=>Math.round(n/rounding())*rounding()||0;
const amount=n=>n.toLocaleString('de-AT',{minimumFractionDigits:2,maximumFractionDigits:2});
const eur=n=>`${amount(round(n)||0)} €`, chf=n=>`${amount(round(n)||0)} CHF`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storageKey='grenzgehalt.v4.scenario';
let comparisonPeriod='monthly',selectedPayMonth=0,reportDetail='compact';
let resultCurrency='EUR',threeWay=false,sameGross=false;
let view='calculator', last=null, example=true, toastTimer=null, fxReady=false,previousCountry='li',countryProfiles={},previousContributionUnit='percent',previousSalaryPeriods={foreignPeriod:'annual',atPeriod:'monthly'};
const swissCache=new Map();
let optionDrafts={},renderingCountry=null,previousCalculatorCountry='li';
const atPrimary=()=>rawState().calculatorCountry==='at';
const primaryKey=()=>atPrimary()?'at':'foreign';
const primaryName=()=>WORK_COUNTRIES[rawState().calculatorCountry].name;
const countryOrder=()=>[rawState().calculatorCountry,rawState().comparisonCountry];
const reportCountries=()=>view==='compare'
 ? [...countryOrder(), ...Object.keys(last.byCountry).filter(key=>!countryOrder().includes(key))]
 : [rawState().calculatorCountry];
const editorCountry=()=>view==='compare'?rawState().comparisonCountry:rawState().calculatorCountry;
const countryName=key=>WORK_COUNTRIES[key]?.name||(key==='foreign'?foreignName():'');
const countryCode=key=>WORK_COUNTRIES[key]?.code||(key==='foreign'?foreignCode():'');
const currentPeriod=()=>atPrimary()?atDisplayPeriod():foreignPeriod();
const detailRaw=()=>renderingCountry?last.inputs.raw:rawState();
const foreignName=()=>COUNTRIES[detailRaw().foreignCountry].name,foreignCode=()=>COUNTRIES[detailRaw().foreignCountry].code;
const foreignPlace=()=>detailRaw().foreignCountry==='ch'?'der Schweiz':'Liechtenstein';
const healthLabel=()=>last?.li?.resident||detailRaw().healthType==='local'
 ? (detailRaw().foreignCountry==='ch'?'Schweizer KVG-Grundversicherung':'Liechtensteinische OKP')
 : detailRaw().healthType==='private'?'Private Grundversicherung':'ÖGK-Selbstversicherung';
function savedProfiles(){return {...countryProfiles,[rawState().foreignCountry]:profileFrom(rawState())};}
function saveEditor(){countryProfiles=savedProfiles();}
function switchEditor(country){
 saveEditor();
 if(country!=='at'&&country!==rawState().foreignCountry){
  const profile=countryProfiles[country]||profileFrom(defaults);
  for(const key of PROFILE_KEYS){const input=form.elements.namedItem(key);if(input.type==='checkbox')input.checked=profile[key];else input.value=profile[key];}
  form.elements.foreignCountry.value=country;
 }
 previousCountry=rawState().foreignCountry;previousContributionUnit=form.elements.contributionUnit.value;syncSalaryPeriods();optionDrafts={};restoreInputOptions();
}
function jobContext(job){return {inputs:job.inputs,li:job.country==='at'?null:job.result,at:job.country==='at'?job.result:null,plans:{foreign:job.country==='at'?null:job.plan,at:job.country==='at'?job.plan:null},timeline:job.timeline,foreignTimeline:job.country==='at'?null:job.timeline,atTimeline:job.country==='at'?job.timeline:null};}
function withJob(country,render){const previous=last,previousCountry=renderingCountry;last=jobContext(previous.byCountry[country]);renderingCountry=country;try{return render();}finally{last=previous;renderingCountry=previousCountry;}}
function jobPeriod(country){return displayPeriod(country==='at'?last.byCountry[country].inputs.raw.atPeriod:last.byCountry[country].inputs.raw.foreignPeriod);}
function ledgerExplanation(job,label){
 const at=job.country==='at',ch=job.country==='ch';
 const explanations={
  'Bruttogehalt':'Brutto der gewählten Periode. Laufende steuerpflichtige Arbeitgeberleistungen sind enthalten, wenn du sie separat eingetragen hast.',
  'Arbeitgeber-KK-Beitrag':'Monatlicher Zuschuss × Zahl der Kalendermonate. Ohne eigenen Betrag gilt die Modellannahme für Alter und Beschäftigungsgrad.',
  'Sozialversicherung':at?'Lohnbasis bis zur jeweiligen Beitragsgrenze × anwendbare SV-Sätze.':'Summe der gesetzlichen Beiträge und der eigenen oder geschätzten Lohnabzüge.',
  'Sozialversicherung & PK':'Summe aus Sozialversicherungsbeiträgen, Pensionskasse und weiteren berücksichtigten Lohnabzügen.',
  'Lohnsteuer':'Österreichischer Tarif nach Sozialversicherung und Absetzbeträgen. Sonderbezüge werden getrennt berechnet.',
  'Quellensteuer':ch?'Eigener Jahresbetrag oder der Tarif für Kanton, Haushaltskonstellation und Kirchensteuer.':'Im Grenzgängermodell 4 % des Bruttolohns gemäß DBA.',
  'LI-Steuer · Art. 19':'Eigene Angabe oder amtliche Abzugstabelle für bestätigte Fälle mit Besteuerungsrecht in Liechtenstein.',
  'Arbeitgeberauszahlung':at?'Bruttogehalt minus Sozialversicherung und Lohnsteuer.':'CHF-Brutto plus Arbeitgeberzuschuss minus Sozialversicherung und einbehaltene Quellensteuer.',
  'Arbeitgeberauszahlung in EUR':'Fertige Arbeitgeberauszahlung in EUR. Bei CHF wird der angezeigte Planungskurs angewendet.',
  'AT-Steuerrücklage':'Geschätzte österreichische Steuer minus anrechenbare Quellensteuer, mindestens null.',
  'Schweizer Steuerrücklage':'Übernommene Schweizer Jahressteuer. Die Rücklage wird gleichmäßig auf zwölf Kalendermonate verteilt.',
  'ÖGK-Selbstversicherung':'Eigener Beitrag oder ÖGK-Regelbeitrag. Separat von der Arbeitgeberabrechnung.',
  'Private Grundversicherung':'Deine angegebene monatliche Prämie. Der steuerlich anerkannte Pflichtanteil wird separat eingegeben.',
  'Liechtensteinische OKP':'Eigene Prämie oder amtlicher Richtwert. Ein separat ausgezahlter Zuschuss steht in der CHF-Abrechnung.',
  'Schweizer KVG-Grundversicherung':'Eigene Prämie oder BAG-Richtwert. Der Ansatz hängt vom Wohnsitz ab.',
  'Verfügbares Budget':'Auszahlung minus Rücklagen, Versicherung und eigene Kosten, zuzüglich separat erfasster Zulagen.',
  'Familienzulage / Differenzausgleich':'Bestätigter separater Nettozufluss. Die Zulage ist nicht Teil des Bruttolohns in diesem Modell.',
  'Parkplatzkosten':'Eigene monatliche Angabe in CHF, zum Planungskurs in EUR umgerechnet.',
  'PK · Arbeitnehmer':'Eigener Lohnzettelwert oder Schätzung. Die Altersstaffel bildet den Sparanteil ab. Risiko und Zusatzleistungen können abweichen.',
  'NBU':'Lohnbasis bis zur Modellgrenze × Prämiensatz oder eigener Jahresbetrag.',
  'KTG':'Modellierte versicherte Lohnbasis × Prämiensatz oder eigener Jahresbetrag.',
  'ALV':ch?'1,1 % bis zur jährlichen Beitragsgrenze.':'0,5 % bis zur jährlichen Beitragsgrenze, soweit beitragspflichtig.',
 };
 return explanations[label]??'Der ausgewiesene Beitrag folgt dem dokumentierten Tarif oder deiner eigenen Eingabe. Siehe Annahmen und amtliche Quellen.';
}
function jobDetails(country){
 const job=last.byCountry[country],c=buildReport([job]).countries[0];
 const explain=label=>ledgerExplanation(job,label);
 const taxTitle=job.result.resident?'Schweizer Steuermodell':job.result.publicLI?'Besteuerung in Liechtenstein nach Art. 19':'Österreichische Steuerplanung';
 return `<p class="ledger-period">${esc(c.name)} · ${c.periodLabel}</p><div class="ledger-grid"><section data-ledger="payout"><h4>1. Auszahlung · ${c.currency}</h4>${renderLedgerTable(c.native,c.currency,{totalLast:true,explain})}</section><section data-ledger="available"><h4>2. Verfügbar · EUR</h4>${renderLedgerTable(c.budget,'EUR',{totalLast:true,explain})}</section></div>${c.fx?`<p class="table-note">CHF-Auszahlung × ${c.fx.toLocaleString('de-AT',{maximumFractionDigits:8})} = Auszahlung in EUR. Rücklage und EUR-Kosten folgen danach.</p>`:''}${c.contributions.length?`<details class="result-details native-fees"><summary>Lohnabzüge einzeln<span aria-hidden="true">+</span></summary><div class="details-body">${renderLedgerTable(c.contributions,c.currency,{explain})}<p class="table-note">${job.inputs.ownCount?'Bekannte eigene Angaben ergänzen die Modellwerte.':'PK, NBU und KTG sind geschätzt.'}</p></div></details>`:''}${country==='at'?withJob(country,()=>atDetail()):`<details class="result-details foreign-detail"><summary>${taxTitle}<span aria-hidden="true">+</span></summary><div class="details-body">${renderLedgerTable(c.tax,'EUR',{totalLast:true,explain})}<p class="table-note">Die Jahresveranlagung bleibt maßgebend. Sonderzahlungen und ein etwaiger Jahresabgleich sind im Jahresbudget enthalten.</p></div></details>`}<button type="button" class="text-button" data-view="method">Annahmen & Quellen ↗</button>`;
}
async function ensureSwissTariff(canton){
  if(!CANTONS[canton])throw new Error('Ungültiger Schweizer Kanton.');
  let entry=swissCache.get(canton);if(entry?.data)return entry.data;if(entry?.error)throw entry.error;if(entry?.promise)return entry.promise;
  entry={};swissCache.set(canton,entry);
  entry.promise=import(`./ch-tariffs-${canton.toLowerCase()}.mjs`).then(m=>decodeSwissTariff(m.default)).then(data=>{entry.data=data;return data;}).catch(error=>{entry.error=error;throw error;});return entry.promise;
}

const rateController=createRateController({
  getValue:()=>parseNumber($('#fx-rate').value,false),
  setValue:rate=>{$('#fx-rate').value=rate.toLocaleString('de-AT',{minimumFractionDigits:4,maximumFractionDigits:4});},
  readCache:()=>JSON.parse(localStorage.getItem(FX_CACHE_KEY)||'null'),
  writeCache:quote=>localStorage.setItem(FX_CACHE_KEY,JSON.stringify(quote)),
  onChange:state=>{renderFxStatus(state);if(fxReady)update();}
});
function fxDescription(state=rateController.metadata()){
  if(state.source==='api'&&state.quote){
    const date=new Intl.DateTimeFormat('de-AT',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Vienna'}).format(new Date(state.quote.quotedAt));
    return `${state.snapshot?'Importierter API-Kurs':'API-Tageskurs'} · ${date} (Wien)`;
  }
  return state.snapshot?'Importierter Planungskurs':state.source==='example'?'Beispiel-Planungskurs':'Manueller Planungskurs';
}
function renderFxStatus(state){
  $('#fx-auto').checked=state.automatic;
  $('#fx-refresh').disabled=state.pending;
  $('#fx-refresh').textContent=state.pending?'Wird geladen …':'Kurs abrufen ↻';
  $('#fx-status').textContent=(state.pending?'Tageskurs wird geladen … ':state.error?state.error+' ':'')+fxDescription(state);
  $('#fx-status').dataset.error=String(Boolean(state.error));
  $('#fx-summary').textContent=`1 CHF = ${$('#fx-rate').value} EUR · ${state.automatic?'automatisch':'eigener Kurs'}${state.error?' · Kurs prüfen':''}`;
}
function rawState(){const data={};for(const key of Object.keys(defaults)){const el=form.elements.namedItem(key);data[key]=el.type==='checkbox'?el.checked:el.value;}return data;}
function applyState(data){const pair=selectedCountries(data.calculatorCountry||defaults.calculatorCountry,data.comparisonCountry||defaults.comparisonCountry);data={...data,calculatorCountry:pair.primary,comparisonCountry:pair.comparison};for(const [key,value] of Object.entries({...defaults,...data})){const el=form.elements.namedItem(key);if(!el)continue;if(el.type==='checkbox')el.checked=value===true;else el.value=String(value);}previousCalculatorCountry=form.elements.calculatorCountry.value;previousContributionUnit=form.elements.contributionUnit.value;syncSalaryPeriods();optionDrafts={};restoreInputOptions();}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
function persist(){
 if(!$('#remember').checked)return;
 try{localStorage.setItem(storageKey,JSON.stringify(scenarioSnapshot()));}
 catch{toast('Der Browser erlaubt keine lokale Speicherung.');$('#remember').checked=false;}
}
const foreignPeriod=()=>displayPeriod(last.inputs.raw.foreignPeriod),atDisplayPeriod=()=>displayPeriod(last.inputs.raw.atPeriod);
const payment=(country,code)=>selectedPayment(last.plans[country],code||(country==='foreign'?foreignPeriod():atDisplayPeriod()).code);
const money=value=>eur(value),moneyCHF=value=>chf(value),preciseEUR=value=>`${amount(value)} €`;
const periodNote='Monatlich: normaler Monat ohne 13./14. Gehalt und Bonus. Jährlich: alle Bezüge einschließlich Sonderzahlungen. Zusätzliche Bezüge stehen separat. Krankenversicherung und laufende Kosten fallen zwölfmal an; die AT-Steuerrücklage bleibt eine Planung.';
function periodRow(label,value,cls=''){return `<tr class="${cls}"><td>${label}</td><td>${eur(value)}</td></tr>`;}
function liRows(){const p=foreignPeriod(),other=oppositePeriod(p.code),a=nativeLines(payment('foreign',p.code)),b=nativeLines(payment('foreign',other));return a.map(([label,value],i)=>`<tr class="${i===a.length-1?'total':''}"><td>${label}</td><td>${chf(value)}</td><td>${chf(b[i][1])}</td></tr>`).join('');}
function budgetHeaders(){const p=foreignPeriod(),other=displayPeriod(oppositePeriod(p.code));return `<tr><th>Position</th><th>${p.column}</th><th>${other.column}</th></tr>`;}
function taxPlanLines(v){return [['Bemessungsgrundlage',v.taxable],['Steuer laufend',v.regularTax],['Sonderzahlungssteuer',v.specialTax],['Anrechnung ausländischer Quellensteuer',-v.sourceCredit],['Verbleibende Steuer / Rücklage',v.reserve]];}
function taxPlanRows(){return taxPlanLines(payment('foreign')).map(([label,value],i,all)=>periodRow(label,value,i===all.length-1?'total':'')).join('');}
function atPlanLines(v){return [['Brutto',v.salaryGross],['Sozialversicherung',-v.social],['Lohnsteuer',-v.tax],...(last.at.supplement?[['ÖGK-Zusatzversicherung',-v.supplement]]:[]),...(last.at.extraCosts?[['Eigene laufende Kosten',-v.extraCosts]]:[]),['Verfügbares Budget',v.available]];}
function atPlanRows(){return atPlanLines(payment('at')).map(([label,value],i,all)=>periodRow(label,value,i===all.length-1?'total':'')).join('');}
function sourceWord(key){return last.inputs.sources[key]==='own'?'Eigene Angabe':'Schätzung';}
function modeNoteText(){return last.inputs.ownCount?`${last.inputs.ownCount} von ${last.inputs.fieldCount} Detailangaben aus deinen Daten. Leere Felder bleiben geschätzt.`:'PK, NBU und KTG sind pauschal geschätzt.';}
function restoreInputOptions(){
  const raw=rawState();
  for(const control of $$('[data-input-option]'))control.checked=control.dataset.inputOption==='fx'?!rateController.state.automatic:hasOptionalValues(raw,control.dataset.inputOption);
  syncInputOptions();
}
function syncInputOptions(){
  for(const control of $$('[data-input-option]')){
    const panel=$('#'+control.getAttribute('aria-controls'));
    panel.hidden=!control.checked;panel.disabled=!control.checked;
    control.setAttribute('aria-expanded',String(control.checked));
  }
}
function toggleInputOption(control){
  const group=control.dataset.inputOption,raw=rawState(),draftKey=(group==='family'?'shared':editorCountry())+':'+group;
  if(OPTIONAL_FIELDS[group]){
    const values=control.checked?optionDrafts[draftKey]||optionalValues(raw,group):optionalValues(withoutOptionalValues(raw,group),group);
    if(!control.checked)optionDrafts[draftKey]=optionalValues(raw,group);
    for(const [key,value] of Object.entries(values)){const input=form.elements.namedItem(key);if(input.type==='checkbox')input.checked=value;else input.value=value;}
    example=false;
  }
  syncInputOptions();update();
}
function syncSalaryPeriods(){for(const name of ['foreignPeriod','atPeriod'])previousSalaryPeriods[name]=form.elements.namedItem(name).value;}
function syncSalaryUi(raw){
  const foreignValue=parseNumber(raw.liAnnual),atValue=parseNumber(raw.atGross),payments=Number(raw.liPayments),atPayments=Number(raw.atPayments),fmt=n=>n.toLocaleString('de-AT',{maximumFractionDigits:2});
  const validForeign=Number.isFinite(foreignValue)&&foreignValue>=0,validAt=Number.isFinite(atValue)&&atValue>=0;
  let annual=null;try{if(validForeign)annual=annualGross(foreignValue,raw.foreignPeriod,payments);}catch{}
  $('#li-payments-hint').textContent=payments>12?`Zwölf reguläre Monatsabrechnungen plus ${payments===13?'13. Gehalt':'13. und 14. Gehalt'}.${raw.foreignCountry==='li'?` PK und Arbeitgeber-KK-Beitrag zählen zwölfmal pro Jahr.`:''}`:'Zwölf reguläre Monatsabrechnungen pro Jahr.';
  $('#li-annual-hint').textContent=raw.foreignPeriod==='monthly'?`Brutto je Gehaltszahlung × ${payments} Bezüge${annual!==null?' = '+fmt(annual)+' CHF pro Jahr':''}. Zusätzlicher Jahresbonus separat.`:`Gesamtes Vertragsgehalt inklusive 13./14., ohne Bonus.${annual!==null?' Entspricht ca. '+fmt(annual/payments)+' CHF × '+payments+'.':''}`;
  $('label[for="at-gross"]').textContent=`${raw.atPeriod==='monthly'?'Monatsbrutto':'Jahresbrutto'} in Österreich`;
  $('#at-gross-hint').textContent=raw.atPeriod==='monthly'?`Brutto je Gehaltszahlung × ${atPayments} Bezüge${validAt?' = '+fmt(atValue*atPayments)+' EUR pro Jahr':''}.`:`Jahresbrutto über ${atPayments} Zahlungen.${validAt?' Entspricht ca. '+fmt(atValue/atPayments)+' EUR je Zahlung.':''}`;
}
function convertSalaryPeriod(name){
  const next=form.elements.namedItem(name).value,previous=previousSalaryPeriods[name];if(next===previous)return;
  const foreign=name==='foreignPeriod',input=form.elements.namedItem(foreign?'liAnnual':'atGross'),payments=foreign?Number(form.elements.liPayments.value):Number(form.elements.atPayments.value);
  if(!input.value.trim()){previousSalaryPeriods[name]=next;return;}
  try{let value=convertGross(parseNumber(input.value),previous,next,payments);
    // Keep a valid maximum annual input within the supported range after cent rounding.
    if(foreign&&next==='monthly'&&value*payments>5000000&&annualGross(parseNumber(input.value),previous,payments)<=5000000)value=Math.floor(5000000/payments*100)/100;
    input.value=value.toLocaleString('de-AT',{maximumFractionDigits:2});previousSalaryPeriods[name]=next;
  }catch{form.elements.namedItem(name).value=previous;toast('Bitte zuerst einen gültigen Bruttobetrag eingeben.');}
}
function syncPensionPeriod(){
  const target=form.elements.foreignPeriod.value,previous=form.elements.pensionPeriod.value,input=form.elements.exactPension;
  if(target===previous||!['monthly','annual'].includes(target)||!['monthly','annual'].includes(previous))return;
  if(input.value.trim()){const value=parseNumber(input.value);if(Number.isFinite(value)&&value>=0)input.value=convertGross(value,previous,target,12).toLocaleString('de-AT',{maximumFractionDigits:2});}
  form.elements.pensionPeriod.value=target;
}
function syncInputVisibility(){
 const compare=view==='compare',edit=editorCountry(),at=edit==='at',main=rawState().calculatorCountry;
 $('.main-country-selection').hidden=compare;$('.comparison-selection').hidden=!compare;
 for(const input of $$('input[name="comparisonCountry"]')){const allowed=input.value!==main;input.disabled=!allowed;input.closest('label').hidden=!allowed;}
 $('#comparison-main-name').textContent=primaryName();
 $('#comparison-selection-note').textContent='Vergleichsland wählen. Dein '+countryCode(main)+'-Gehalt aus dem Rechner bleibt erhalten.';
 const inputCard=$(at?'.compare-inputs':'#foreign-data-block'),familyControl=$('#option-family').closest('label'),familyPanel=$('#panel-family');
 if(familyControl.parentElement!==inputCard.querySelector('.option-checks'))inputCard.querySelector('.option-checks').append(familyControl);
 if(familyPanel.parentElement!==inputCard.querySelector('.optional-panels'))inputCard.querySelector('.optional-panels').append(familyPanel);
 $('#foreign-data-block').hidden=at;$('.compare-inputs').hidden=!at;
 $('.shared-inputs').hidden=['method','help'].includes(view);
 $('#li-input-title').textContent=compare?'Dein Vergleichsgehalt · '+countryName(edit):'Deine Angaben';
 $('.compare-inputs .data-block-footer .button').textContent=compare?'Vergleich ansehen ↓':'Ergebnis ansehen ↓';
 $('#at-input-title').textContent=compare?'Dein österreichisches Vergleichsgehalt':'Deine Angaben für Österreich';
 $('#at-origin-note').textContent=compare?'Dein fertiges '+countryCode(main)+'-Budget wird aus dem Rechner übernommen.':rawState().atPayments+' Gehälter pro Jahr. ÖGK und Lohnsteuer sind in der Abrechnung enthalten.';
 $('#comparison-direction').textContent='Einzelrechnung für das gewählte Land. Deine Eingaben bleiben beim Wechsel erhalten.';
}
function syncCountryUi(){
  syncPensionPeriod();
  syncInputVisibility();
  const raw=rawState(),c=COUNTRIES[raw.foreignCountry]||COUNTRIES.li,ch=raw.foreignCountry==='ch';
  const resident=ch&&raw.chResidence==='ch',local=resident||raw.healthType==='local',priv=!local&&raw.healthType==='private';
  $('#country-eyebrow').textContent=view==='help'?'HILFE ZUM RECHNER · STEUERJAHR 2026':view==='compare'?'VERFÜGBARES BUDGET · '+countryOrder().map(c=>countryName(c).toUpperCase()).join(' / '):atPrimary()?'WOHNEN & ARBEITEN IN ÖSTERREICH':'WOHNEN IN ÖSTERREICH · ARBEITEN '+(raw.calculatorCountry==='ch'?'IN DER SCHWEIZ':'IN LIECHTENSTEIN');
  $('.foreign-settings').dataset.country=raw.foreignCountry;$('#settings-country-code').textContent=`${c.code} / CHF`;$('.li-inputs .country-code').textContent=`${c.code} / CHF`;
  $('label[for="li-annual"]').textContent=`${raw.foreignPeriod==='monthly'?'Monatsbrutto':'Jahresbrutto'} ${ch?'in der Schweiz':'in Liechtenstein'}`;
  syncSalaryUi(raw);
  $('#foreign-commute-summary').textContent=`Pendeln & eigene Kosten · ${c.name}`;
  $$('.ch-inputs').forEach(el=>el.hidden=!ch);$('#private-fields').hidden=!priv;
  $('#ch-resident-fields').hidden=!resident;
  $('#li-public-fields').hidden=ch||raw.liEmployer!=='public';
  $('#ch-child-allowance').hidden=!ch;
  $('#ch-canton-label').textContent=resident?'Schweizer Wohnkanton':'Schweizer Arbeitskanton';
  $('#health-type').disabled=resident;
  $('#health-type').closest('.field').hidden=resident;
  $('#health-type option[value=local]').textContent=ch?'Schweizer Grundversicherung (KVG)':'Liechtensteinische Grundversicherung (OKP)';
  $('#local-health-fields').hidden=!local;
  $('#local-health-estimate').textContent=local&&CANTONS[raw.chCanton]
    ? 'Richtwert 2026: '+chf(suggestedLocalPremium({country:raw.foreignCountry,resident,canton:raw.chCanton,age:raw.pensionAge}))+' / Monat.'
    : '';
  for(const el of $$('[data-li-planning]'))el.hidden=ch;
  for(const option of $('#plan-pensionAge').options)option.hidden=option.value.startsWith('li')?ch:option.value.startsWith('ch')&&!ch;
  try{
    const family=liFamilyEstimate(raw.liChildAges,raw.liTwins);
    $('#li-family-estimate').textContent=family?'Volle Richtzulage: '+chf(family)+' / Monat. Bestätigten Auszahlungsbetrag oben eintragen.':'';
  }catch(error){$('#li-family-estimate').textContent=error.message;}
  if(priv||local){$('#supplement-enabled').checked=false;$('#supplement').value='0';}
  const atAddon=raw.atSupplementEnabled;$('#at-supplement-panel').hidden=!atAddon;$('#at-supplement-panel').disabled=!atAddon;$('#at-supplement-enabled').setAttribute('aria-expanded',String(atAddon));
  const addon=!priv&&!local&&$('#supplement-enabled').checked;$('#oegk-supplement').hidden=priv||local;$('#supplement-enabled').disabled=priv||local;$('#supplement-field').hidden=!addon;$('#supplement-panel').hidden=!addon;$('#supplement').disabled=!addon;$('#supplement-enabled').setAttribute('aria-expanded',String(addon));
  $('#fixed-contributions').innerHTML=ch?`<p>Automatische Sätze 2026</p><dl><div><dt>AHV / IV / EO</dt><dd>5,3 %</dd></div><div><dt>ALV</dt><dd>1,1 %</dd></div></dl><small>ALV bis 148.200 CHF. Kantonale Arbeitnehmerbeiträge werden zusätzlich berücksichtigt.</small>`:`<p>Automatische Sätze 2026</p><dl><div><dt>AHV / IV</dt><dd>4,7 %</dd></div><div><dt>ALV</dt><dd>0,5 %</dd></div><div><dt>FAK · Arbeitnehmer</dt><dd>0,2 %</dd></div></dl><small>AHV 4,025 % + IV 0,675 %. ALV bis 126.000 CHF. FAK-Beitrag Arbeitgeber: 1,9 % – kein Abzug von deinem Netto.</small>`;
  $('.li-rounding-field').hidden=ch;$('#li-rounding').disabled=ch||!raw.liExact;
  $('#insurance-hint').textContent=local?'Die Grundprämie im Arbeitsland wird separat vom Lohn berücksichtigt.':priv?'Private Grenzgänger-Grundversicherung statt ÖGK. Gleichwertigkeit und Befreiung im Arbeitsland müssen anerkannt sein.':'ÖGK-Regelbeitrag 2026: 565,25 EUR pro Monat. Bekannte Herabsetzung im Lohnzettelmodus eintragbar.';syncDisclosureIcons();
}
const formatExact=(value,meta)=>meta.percent?value.toLocaleString('de-AT',{maximumFractionDigits:8}):amount(value);
function syncExactMode(inputs){
  const raw=rawState(),active=raw.liExact,pensionCount=12;
  $('#exact-inputs').hidden=!active;$('#exact-inputs').disabled=!active;
  $('#li-exact').setAttribute('aria-expanded',String(active));
  $('#special-override').setAttribute('aria-expanded',String(active&&raw.specialOverride));
  $('#special-mode-hint').textContent=raw.specialOverride?'Eigener Jahresgesamtbetrag ersetzt die automatische Aufteilung.':'Standard: automatisch aus '+raw.liPayments+' Gehältern berechnet. Zusätzliche Gehälter stehen separat.';
  $('label[for="exact-pension"]').textContent=`PK-Beitrag / ${raw.pensionPeriod==='monthly'?'Monat':'Jahr'}`;
  $('label[for="exact-subsidy"]').textContent='Arbeitgeber-KK-Beitrag / Monat';
  $('#pension-help').textContent=raw.pensionPeriod==='monthly'?`PK = Pensionskasse. Dein Arbeitnehmerbeitrag × ${pensionCount} Zahlungen pro Jahr.`:`PK = Pensionskasse. Jahresgesamtbeitrag nur für deinen Arbeitnehmeranteil: Beitrag je Zahlung × ${pensionCount}. Der Arbeitgeberanteil ist kein weiterer Nettoabzug.`;
  $('#payroll-help').innerHTML=`Die Kürzel entsprechen deinem Lohnzettel. NBU und KTG als <strong>${raw.contributionUnit==='percent'?'Prozentsatz':'Jahresbetrag in CHF'}</strong> eintragen, PK als <strong>${raw.pensionPeriod==='monthly'?'Monatsbetrag':'Jahresbetrag'} in CHF</strong>. Leer = automatische Schätzung.`;
  $('#li-mode-description').innerHTML=active?'<strong>Eigene Angaben ergänzen die Schätzung.</strong> Bekannte Werte unten eintragen; leere Felder bleiben automatisch berechnet.':`<strong>Abzüge werden geschätzt.</strong> Sozialversicherung, PK und ${raw.healthType==='private'?'deine private Grundprämie':'ÖGK'} sind berücksichtigt. Du brauchst keinen Lohnzettel.`;
  const publicTax=raw.foreignCountry==='li'&&raw.liEmployer==='public';
  const ordinaryTax=raw.foreignCountry==='ch'&&raw.chResidence==='ch'&&raw.chTaxMode==='ordinary';
  const requiresTax=publicTax||ordinaryTax;
  $('#manual-tax-fields').hidden=!requiresTax&&!(active&&raw.foreignCountry==='ch');
  $('label[for="exact-source"]').textContent=publicTax?'Bestätigte Liechtensteiner Jahressteuer · Art. 19':ordinaryTax?'Schweizer Jahressteuer · Bund, Kanton und Gemeinde':'Schweizer Quellensteuer / Jahr';
  for(const field of Object.keys(EXACT_FIELDS)){
    const meta=exactFieldMeta(field,raw),{key,unit}=meta;
    const input=form.elements.namedItem(field),visible=exactFieldActive(field,raw);input.closest('.field').hidden=!visible;input.disabled=!visible||!(active||field==='exactSource'&&requiresTax);
    const help=$(`[data-exact-help="${field}"]`);if(help)help.hidden=!visible;
    if(['exactNbu','exactKtg'].includes(field)){const id=input.id;$(`label[for="${id}"]`).textContent=`${meta.label}${meta.percent?' (%)':' / Jahr'}`;$('#'+id+'-unit').textContent=meta.percent?'%':'CHF';}
    if(inputs&&field==='exactPension')$('#pension-help').textContent=raw.pensionPeriod==='monthly'?`PK = Pensionskasse. Dein Anteil: ${amount(inputs.li.pension/pensionCount)} CHF × ${pensionCount} = ${amount(inputs.li.pension)} CHF pro Jahr.`:`PK = Pensionskasse. Dein Arbeitnehmeranteil: ${amount(inputs.li.pension)} CHF pro Jahr = ${amount(inputs.li.pension/pensionCount)} CHF × ${pensionCount} Monatsbeiträge. Der Arbeitgeberanteil ist kein weiterer Nettoabzug.`;
    if(inputs){const value=exactDisplayValue(inputs,field,{automatic:true});input.placeholder=key==='sourceAnnual'&&inputs.sourcePending?'Wird aus Tarif ermittelt':formatExact(value,meta);$(`[data-estimate="${field}"]`).textContent=key==='sourceAnnual'&&inputs.sourcePending?'Amtlicher Kantonstarif wird geladen.':`Ohne eigene Angabe: ${formatExact(value,meta)} ${unit} · Schätzung${meta.percent?' · Lohnbasis bis 148.200 CHF':''}`;}
  }
  if(requiresTax){
    if(ordinaryTax)$('#exact-source').placeholder='';
    $('#exact-source-hint').textContent=publicTax
     ? (inputs?'Richtwert laut LI-Abzugstabelle: '+chf(inputs.automatic.sourceAnnual)+' / Jahr. ':'')+'Ein eigener Betrag hat Vorrang. Weitere Einkünfte und Progression werden separat beurteilt.'
     : 'Jahresbetrag aus dem amtlichen ESTV-Rechner oder der Veranlagung übernehmen.';
  }
}
function convertContributionUnit(){
  const next=form.elements.contributionUnit.value;if(next===previousContributionUnit)return;
  const raw=rawState();let basis;try{basis=Math.min(annualGross(parseNumber(raw.liAnnual),raw.foreignPeriod,Number(raw.liPayments))+parseNumber(raw.liBonus),148200);}catch{basis=NaN;}
  if(!Number.isFinite(basis)||basis<=0){form.elements.contributionUnit.value=previousContributionUnit;toast('Bitte zuerst ein positives Jahresbrutto eingeben.');return;}
  for(const field of ['exactNbu','exactKtg']){const input=form.elements.namedItem(field);if(!input.value.trim())continue;const value=parseNumber(previousContributionUnit==='percent'?input.value.trim().replace(/%$/,'').trim():input.value,previousContributionUnit!=='percent');if(!Number.isFinite(value))continue;const converted=next==='percent'?value/basis*100:Math.round(basis*value)/100;input.value=converted.toLocaleString('de-AT',{maximumFractionDigits:next==='percent'?8:2});}
  previousContributionUnit=next;
}
function contributionLines(v=payment('foreign')){
  const c=v.contributions,ch=last.li.kind==='ch',pct=n=>n.toLocaleString('de-AT',{maximumFractionDigits:8})+' %';
  const feeLabel=field=>{const meta=exactFieldMeta(field,last.inputs.raw);return `${meta.label} · ${meta.percent?pct(exactDisplayValue(last.inputs,field))+' · ':''}${sourceWord(meta.key)}`;};
  return [[ch?'AHV / IV / EO · 5,3 %':'AHV / IV · 4,7 %',c.ahv+c.iv+(c.eo||0)],...(!ch?[['FAK · Arbeitnehmer · 0,2 %',c.fak]]:[]),[ch?'ALV · 1,1 %':'ALV · 0,5 %',c.alv],...(ch?[[`Kantonale Beiträge · ${pct((TAX.chRegional[last.inputs.raw.chCanton]||0)*100)}`,c.regional],['Weitere Pflichtabgaben',c.other]]:[]),[feeLabel('exactNbu'),c.nbu],[feeLabel('exactKtg'),c.ktg],[`PK-Beitrag · ${sourceWord('pension')}`,c.pension]];
}
function detailRows(){return contributionLines().map(([label,value])=>`<tr><td>${label}</td><td>${chf(value)}</td></tr>`).join('');}
function extraRecords(plan){return [...plan.extras,...(plan.settlement&&['salaryGross','subsidy','social','tax','health','supplement','extraCosts','available'].some(k=>Math.abs(plan.settlement[k]||0)>=.005)?[plan.settlement]:[])];}
function extrasTable(country){const plan=last.plans[country],foreign=country==='foreign',rows=extraRecords(plan).filter(r=>r.id!=='settlement'||Math.abs(foreign?r.payoutCHF||0:r.payout||0)>=.005||Math.abs(foreign?r.grossCHF||0:r.salaryGross||0)>=.005),name=foreign?foreignName():'Österreich',currency=foreign?'CHF':'EUR';return `<div class="extras-country"><h3>${name}<span>${currency}</span></h3>${rows.length?`<div class="table-scroll"><table class="extras-table"><thead><tr><th>Bezug</th><th>Brutto</th><th>Auszahlung¹</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.label}</td><td>${amount(foreign?r.grossCHF||0:r.salaryGross)}</td><td>${amount(foreign?r.payoutCHF||0:r.payout)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="table-note">Keine zusätzlichen Gehaltszahlungen.</p>'}</div>`;}
function extrasSection(compare=view==='compare'){return `<section class="section-card separate-payments"><div class="section-heading"><div><p class="section-kicker">ZUSÄTZLICHE BEZÜGE</p><h2>13./14. Gehalt & Bonus</h2></div><span>Jeweils einmal pro Jahr</span></div><div class="extras-grid ${compare?'two-countries':''}">${extrasTable('foreign')}${compare?extrasTable('at'):''}</div><p class="table-note">¹ Arbeitgeberauszahlung in Landeswährung. Beim Auslandslohn werden österreichische Abgaben und etwaige Jahreskorrekturen erst im Budget berücksichtigt. Keine anteilige Verteilung auf den normalen Monat.</p><details class="result-details extra-budget"><summary>Budget der zusätzlichen Bezüge in Euro<span aria-hidden="true">+</span></summary><div class="details-body">${['foreign',...(compare?['at']:[])].map(country=>`<h3>${country==='foreign'?foreignName():'Österreich'}</h3><table><thead><tr><th>Bezug</th><th>Nach Umrechnung & AT-Abgaben</th></tr></thead><tbody>${extraRecords(last.plans[country]).map(r=>`<tr><td>${r.label}</td><td>${eur(r.available)}</td></tr>`).join('')}</tbody></table>`).join('')}<p class="table-note">${PAYMENT_NOTE}</p></div></details></section>`;}
function liDetail(){const p=foreignPeriod(),v=payment('foreign');return `<details class="result-details foreign-detail"><summary>Österreichische Steuerplanung & Annahmen · ${p.label}<span aria-hidden="true">+</span></summary><div class="details-body"><p class="table-note">${periodNote}</p><p class="table-note">${modeNoteText()} NBU = Nichtberufsunfall, KTG = Krankentaggeld, PK = Pensionskasse. ${last.li.kind==='li'?`Arbeitgeber-KK-Beitrag: ${chf(v.subsidyCHF||0)} / ${p.unit}. FAK-Arbeitgeberanteil von 1,9 % ist kein Nettoabzug.`:''} ${healthLabel()}: ${eur(v.health)} / ${p.unit}. Bekannte Jahresabzüge werden für laufende und zusätzliche Bezüge modelliert zugeordnet; der tatsächliche Abrechnungsverlauf kann abweichen.</p><h3>Österreichische Steuerplanung · ${p.label}</h3><table><thead><tr><th>Position</th><th>EUR · ${p.column}</th></tr></thead><tbody>${taxPlanRows()}</tbody></table><p class="table-note">Die laufende Rücklage beruht auf dem laufenden Einkommen. Steuer auf Sonderzahlungen sowie auf tarifpflichtige Überschreitungen des Jahressechstels steht bei den zusätzlichen Bezügen. Quellensteuer wird zunächst beim jeweiligen Bezug angerechnet. Eine zusätzliche Anrechnung zwischen laufenden und sonstigen Bezügen wird erst im Jahresabgleich berücksichtigt. Die Jahresveranlagung und ihre Grenzen bleiben maßgebend. Begünstigtes Jahressechstel: ca. ${eur(last.li.sixth)} pro Jahr.</p><button class="text-button" data-view="method">Alle Modellannahmen & Quellen ↗</button></div></details>`;}
function planNote(){return `<p class="plan-note">${example?'Fiktive Beispielwerte. ':''}${modeNoteText()} Beträge mit Cent/Rappen zur Nachvollziehbarkeit; die österreichische Steuerplanung bleibt eine Näherung. <button class="text-button" data-view="method">Annahmen & Quellen ↗</button></p>`;}
function nativeLines(v){return [['Bruttogehalt',v.grossCHF],...(last.li.kind==='li'?[['Arbeitgeber-KK-Beitrag',v.subsidyCHF]]:[]),['Sozialversicherung & PK',-v.socialCHF],[`Quellensteuer ${foreignCode()}`,-v.sourceCHF],['Auszahlung vom Arbeitgeber',v.payoutCHF]];}
function nativeStage(compare){const p=foreignPeriod();return `<section class="section-card native-stage"><div class="section-heading"><div><p class="section-kicker">01 / ABRECHNUNG IN LANDESWÄHRUNG</p><h2>${compare?'Beide Gehälter, sauber getrennt.':'Deine Abrechnung in CHF.'}</h2></div></div><div class="table-scroll"><table><thead>${compare?compareHeaders():budgetHeaders()}</thead><tbody>${compare?compareRows():liRows()}</tbody></table></div><p class="table-note">${compare?'Liechtenstein/Schweiz in CHF, Österreich in EUR. ':''}Normaler Monat ohne zusätzliche Gehälter. Die Auslandsauszahlung enthält noch keine österreichische Krankenversicherung oder Steuerrücklage.</p><details class="result-details native-fees"><summary>Lohnabzüge im Detail · ${p.label}<span aria-hidden="true">+</span></summary><div class="details-body"><table><thead><tr><th>Arbeitnehmerbeitrag</th><th>CHF</th></tr></thead><tbody>${detailRows()}</tbody></table><p class="table-note">${last.li.kind==='li'?'AHV/IV gemeinsam gerundet. '+(last.inputs.li.payrollRounding===.05?'Fünfrappenrundung je Abzug.':'Centrundung je Abzug.')+' FAK-Arbeitgeberanteil wird nicht von deinem Lohn abgezogen.':''} ${modeNoteText()}</p></div></details></section>`;}
function euroBudgetLines(f=payment('foreign'),a=last.plans.at?payment('at'):{payout:0,supplement:0,extraCosts:0,available:0}){return [['Arbeitgeberauszahlung in EUR',f.payout,a.payout],[healthLabel(),-f.health,0],['Steuerrücklage Österreich',-f.reserve,0],...(last.inputs.supplement?[['Private Zusatzversicherung',-f.supplement,-a.supplement]]:[]),['Eigene laufende Kosten',-f.extraCosts,-a.extraCosts],['Verfügbares Budget',f.available,a.available]];}
function conversionStage(compare){const p=foreignPeriod(),f=payment('foreign'),a=last.plans.at?payment('at'):{payout:0,supplement:0,extraCosts:0,available:0},fx=last.inputs.li.fx;return `<section class="section-card conversion-stage"><div class="section-heading"><div><p class="section-kicker">02 / UMRECHNUNG & BUDGET</p><h2>Jetzt wird daraus dein Eurobudget.</h2></div></div><div class="conversion-strip"><div><span>Fertige ${foreignCode()}-Auszahlung · ${p.label}</span><strong>${chf(f.payoutCHF)}</strong></div><div class="conversion-rate"><span>× ${fx.toLocaleString('de-AT',{minimumFractionDigits:4,maximumFractionDigits:8})}</span><b aria-hidden="true">→</b></div><div><span>Einmal in EUR umgerechnet</span><strong>${eur(f.payout)}</strong></div></div><div class="table-scroll"><table><thead><tr><th>Budget · EUR</th><th>${foreignName()}<br>${p.column}</th>${compare?`<th>Österreich<br>${atDisplayPeriod().column}</th>`:''}</tr></thead><tbody>${euroBudgetLines(f,a).map(([label,x,y],i,rows)=>`<tr class="${i===rows.length-1?'total':''}"><td>${label}</td><td>${eur(x)}</td>${compare?`<td>${eur(y)}</td>`:''}</tr>`).join('')}</tbody></table></div><p class="table-note">CHF-Abzüge werden vor der Umrechnung saldiert. AT-Abgaben und Kosten entstehen in EUR und werden danach abgezogen. Der AT-Steuertarif wird gesetzlich auf einer EUR-Bemessungsgrundlage berechnet. ${compare?'Beim österreichischen Gehalt ist die ÖGK bereits in den Sozialabgaben enthalten.':''}</p></section>`;}
function salaryStructure(){
  const count=Number(last.inputs.raw.liPayments),specials=last.plans.foreign.extras.filter(r=>r.id!=='bonus'),bonus=last.plans.foreign.extras.some(r=>r.id==='bonus');
  const extraNames=specials.map(r=>r.label),names=extraNames.length===2&&extraNames[0]==='13. Gehalt'&&extraNames[1]==='14. Gehalt'?'13. und 14. Gehalt':extraNames.join(' und ');
  const ownZero=count>12&&last.inputs.sources.special==='own'&&last.inputs.li.special===0;
  return {count,ownZero,names,yearLabel:`Jahresbudget${names?' inkl. '+names:''}${bonus?' + Bonus':''}`,description:ownZero?`${count} Gehälter gewählt. Dein eigener Sonderzahlungsbetrag ist 0 CHF; deshalb wird der gesamte Vertragslohn auf zwölf laufende Monate verteilt.`:names?`${count} Gehälter im Jahr: zwölf reguläre Monatsbezüge plus ${names}. Die zusätzlichen Gehälter sind im Jahresbudget enthalten.`:`${count} reguläre Gehaltszahlungen sind berücksichtigt.${bonus?' Der Bonus steht separat.':''}`};
}
function currentReport(){
 const keys=reportCountries(),date=new Intl.DateTimeFormat('de-AT',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Vienna'}).format(new Date());
 return buildReport(keys.map(c=>last.byCountry[c]),{period:view==='compare'?comparisonPeriod:'monthly',date,example,fxNote:fxDescription()});
}
function yearOverview(){return `<details class="result-details overview-details annual-details"><summary><span>Jahresbudget & Sonderzahlungen<small>Zwölf normale Monate plus zusätzliche Bezüge</small></span><span aria-hidden="true">+</span></summary><div class="details-body"><div class="table-scroll">${renderOverviewTable(currentReport(),{annualParts:true})}</div><p class="table-note">Die hier gezeigten Beträge ergeben zusammen das Jahresbudget. Laufende Kosten und Krankenversicherung zählen zwölfmal.</p></div></details>`;}
function calculationOverview(){const keys=reportCountries();return `<details class="result-details overview-details calculation-details"><summary><span>Abrechnung & Steuerinfos<small>${keys.map(countryName).join(' / ')}</small></span><span aria-hidden="true">+</span></summary><div class="details-body">${keys.map(c=>`<section class="country-calculation" data-country="${c}">${jobDetails(c)}</section>`).join('')}</div></details>`;}
function timelineHelp(){
 const keys=view==='compare'?countryOrder():[rawState().calculatorCountry];
 return `<details class="result-details timeline-help"><summary>Termine & Hinweise<span aria-hidden="true">+</span></summary><div class="details-body"><p>${keys.map(c=>countryCode(c)+': '+last.byCountry[c].timeline.schedule).join(' · ')}.</p><p>${PAYDAY_NOTE}</p><p>Jeder Punkt steht für einen Gehaltsbezug. Die Höhe zeigt das verfügbare Budget nach Abgaben, Versicherung und Kosten. Monatliche Kosten zählen auch am doppelten Zahltag einmal.</p></div></details>`;
}
function annualBudgetBreakdown(compare=false){
  const structure=atPrimary()?{description:last.timeline.payments===12?'Zwölf laufende Bezüge ohne Sonderzahlungen.':'14 Gehälter im Jahr: zwölf reguläre Monatsbezüge plus 13. und 14. Gehalt.',ownZero:false}:salaryStructure(),countries=compare?countryOrder():[primaryKey()];
  return `<section class="section-card annual-budget-breakdown"><div class="section-heading"><div><p class="section-kicker">JAHRESBUDGET NACH ALLEN ABGABEN</p><h2>So setzt sich dein Jahr zusammen.</h2></div><span>EUR · ca.</span></div><div class="extras-grid ${compare?'two-countries':''}">${countries.map(country=>{const plan=last.plans[country];return `<div class="extras-country">${compare?`<h3>${country==='foreign'?foreignName():'Österreich'}</h3>`:''}<table><thead><tr><th>Bezug</th><th>Verfügbar im Jahr</th></tr></thead><tbody>${annualBudgetParts(plan).map(r=>`<tr><td>${r.label}${r.id==='regular-year'?`<small>12 × ${eur(plan.regular.available)}</small>`:''}</td><td>${eur(r.available)}</td></tr>`).join('')}<tr class="total"><td>Jahresbudget gesamt</td><td>${eur(plan.annual.available)}</td></tr></tbody></table></div>`;}).join('')}</div><p class="table-note">${structure.description} Monatliche Kosten und Krankenversicherung werden zwölfmal berücksichtigt; Sonderzahlungen enthalten die dafür modellierten Abgaben. Die Jahressumme ist die Summe aller hier gezeigten Beträge.</p>${structure.ownZero?'<button type="button" class="text-button" data-reset-special>Sonderzahlungen wieder automatisch aus der Gehaltsanzahl berechnen</button>':''}</section>`;
}
const budgetMonthNote=month=>`Für deine Budgetplanung: ${MONTHS[(month+1)%12][0]}${month===11?' im Folgejahr':''} · verfügbar ab Kontoeingang.`;
function timelineMonthDetail(){
 const m=last.timeline.months[selectedPayMonth]||last.timeline.months[0];
 return `<div class="payday-detail-heading"><div><span class="section-kicker">ENDE ${m.name.toUpperCase()}</span><h3>${m.salaryCount>1?'Doppelter Zahltag':'Normaler Zahltag'}</h3></div><div><span>Verfügbar · ca.</span><strong>${eur(m.available)}</strong></div></div><p class="payday-budget-month">${budgetMonthNote(m.month)}</p><details class="payday-calculation"><summary>Abrechnung dieses Zahltags<span aria-hidden="true">+</span></summary><div class="details-body"><div class="payday-parts">${m.parts.map(r=>`<p><span>${r.label}</span><strong>${eur(r.available)}</strong></p>`).join('')}${Math.abs(m.conversionDifference)>=.005?`<p><span>Rundung nach gemeinsamer CHF-Umrechnung</span><strong>${eur(m.conversionDifference)}</strong></p>`:''}</div>${paydayBreakdown(primaryKey(),m.month)}</div></details>`;
}
function renderSalaryTimeline(){
  const t=last.timeline,max=Math.max(0,...t.months.map(m=>m.available)),min=Math.min(0,...t.months.map(m=>m.available)),range=max-min||1,zero=max/range*100;
  const shortMoney=n=>Math.abs(n)>=100000?new Intl.NumberFormat('de-AT',{notation:'compact',maximumFractionDigits:1}).format(n):whole(n);
  return `<section class="section-card salary-timeline" aria-labelledby="salary-timeline-title"><div class="section-heading"><div><h2 id="salary-timeline-title">Zahltage im Jahr</h2></div><span>${t.payments} Bezüge · EUR</span></div><div class="pay-months" role="group" aria-label="Monat auswählen">${t.months.map(m=>{const y=(max-m.available)/range*100,top=Math.min(zero,y),height=m.available===0?0:Math.abs(zero-y);return `<button type="button" class="pay-month ${m.salaryCount>1?'has-extra':''} ${m.available<0?'negative':''} ${m.month===selectedPayMonth?'selected':''}" data-pay-month="${m.month}" aria-pressed="${m.month===selectedPayMonth}" aria-controls="payday-detail" aria-describedby="pay-description-${m.month}"><span class="pay-amount">${shortMoney(m.available)}</span><span class="pay-chart" aria-hidden="true" style="--zero:${zero.toFixed(4)}%"><span class="pay-bar" style="top:${top.toFixed(4)}%;height:${height.toFixed(4)}%"></span></span><span class="pay-dots" aria-hidden="true">${Array.from({length:m.salaryCount},()=>'<i></i>').join('')}</span> <span class="pay-month-label">${m.short}</span><span hidden id="pay-description-${m.month}">${m.name}: ${eur(m.available)} verfügbar, ${m.salaryCount} ${m.salaryCount===1?'Gehaltsbezug':'Gehaltsbezüge'}</span></button>`;}).join('')}</div><p class="timeline-legend"><span><i></i> Ein Punkt je Gehaltsbezug</span><span>Monat anklicken für den genauen Betrag</span></p><div id="payday-detail" class="payday-detail" aria-live="polite">${timelineMonthDetail()}</div>${t.unassigned.length||Math.abs(t.adjustment?.available||0)>=.005?`<details class="result-details"><summary>Separate Jahrespositionen<span aria-hidden="true">+</span></summary><div class="details-body timeline-year-items">${t.unassigned.map(e=>`<p><span>${e.label} · ohne Monatszuordnung</span><strong>${eur(e.available)}</strong></p>`).join('')}${Math.abs(t.adjustment?.available||0)>=.005?`<p><span>${t.adjustment.label} · separat</span><strong>${eur(t.adjustment.available)}</strong></p>`:''}</div></details>`:''}${timelineHelp()}${!atPrimary()&&last.inputs.sources.special==='own'?`<p class="timeline-override">Eigene Sonderzahlungen: ${chf(last.inputs.li.special)} pro Jahr. Diese Angabe bestimmt die laufende Aufteilung. <button type="button" class="text-button" data-reset-special>Wieder automatisch aus ${t.payments} Gehältern berechnen</button></p>`:''}</section>`;
}
function comparisonMonthDetail(){
  const m=last.comparisonTimeline.months[selectedPayMonth]||last.comparisonTimeline.months[0],order=countryOrder(),diff=round(m[order[0]]-m[order[1]]);
  return `<div class="comparison-month-heading"><span class="section-kicker">ENDE ${m.name.toUpperCase()}</span><h3>Was bleibt von diesem Zahltag?</h3></div><p class="payday-budget-month">${budgetMonthNote(m.month)}</p><div class="comparison-month-budgets">${order.map(key=>`<div class="month-budget ${key===order[0]?'foreign':'at'}"><span>${countryName(key)}</span><strong>${eur(m[key])}</strong><small>${m[key+'Count']===2?'Doppelter Zahltag · 2 Bezüge':'Normaler Zahltag · 1 Bezug'}</small></div>`).join('')}<div class="month-budget difference"><span>Differenz ${countryCode(order[0])} − ${countryCode(order[1])}</span><strong>${diff>=0?'+ ':''}${eur(diff)}</strong><small>Verfügbares Budget · ca.</small></div></div><details class="payday-calculation"><summary>Rechenwege beider Zahltage<span aria-hidden="true">+</span></summary><div class="details-body">${order.map(key=>paydayBreakdown(key,m.month)).join('')}</div></details>`;
}
function comparisonTimelineRows(){
  const t=last.comparisonTimeline;
  return [...t.months.map(m=>({label:m.name,...m})),...t.separate,{label:'Jahresbudget gesamt',...t.annual,total:true}];
}
function comparisonBudgetTable(rows){const order=countryOrder();return `<table><thead><tr><th>Auszahlungsmonat / Position</th>${order.map(key=>`<th>${countryCode(key)} · EUR</th>`).join('')}<th>${countryCode(order[0])} − ${countryCode(order[1])} · EUR</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.total?'total':''}"><td>${esc(r.label)}</td>${order.map(key=>`<td>${eur(r[key])}</td>`).join('')}<td>${eur(round(r[order[0]]-r[order[1]]))}</td></tr>`).join('')}</tbody></table>`;}
function renderComparisonTimeline(){
  const t=last.comparisonTimeline,values=t.months.flatMap(m=>countryOrder().map(c=>m[c])),max=Math.max(0,...values),min=Math.min(0,...values),range=max-min||1,zero=max/range*100;
  const bar=(m,country)=>{const y=(max-m[country])/range*100;return `<span class="comparison-pay-chart ${country===countryOrder()[0]?'foreign':'at'}" style="--zero:${zero.toFixed(4)}%"><span class="comparison-pay-bar ${m[country]<0?'negative':''}" style="top:${Math.min(zero,y).toFixed(4)}%;height:${Math.abs(zero-y).toFixed(4)}%"></span></span>`;};
  const dots=(count,country)=>`<span class="comparison-pay-dots ${country===countryOrder()[0]?'foreign':'at'}">${Array.from({length:count},()=>'<i></i>').join('')}</span>`;
  return `<section class="section-card comparison-timeline" aria-labelledby="comparison-timeline-title"><div class="section-heading"><div><h2 id="comparison-timeline-title">Zahltage im Vergleich</h2></div><span>EUR · ca. · Auszahlungsmonat</span></div><div class="comparison-timeline-legend">${countryOrder().map(key=>`<span class="${key===countryOrder()[0]?'foreign':'at'}"><i></i>${countryName(key)}</span>`).join('')}<small>Ein Punkt je Gehaltsbezug</small></div><div class="comparison-pay-months" role="group" aria-label="Vergleichsmonat auswählen">${t.months.map(m=>`<button type="button" class="comparison-pay-month ${m.month===selectedPayMonth?'selected':''}" data-pay-month="${m.month}" aria-pressed="${m.month===selectedPayMonth}" aria-controls="payday-detail" aria-label="${m.short} · ${m.name}: ${countryOrder().map(key=>countryName(key)+' '+eur(m[key])+', '+m[key+'Count']+' Bezüge').join('; ')}; Differenz ${countryOrder().map(countryCode).join(' minus ')} ${eur(round(m[countryOrder()[0]]-m[countryOrder()[1]]))}"><span class="comparison-pay-pair" aria-hidden="true">${countryOrder().map(key=>bar(m,key)).join('')}</span><span class="comparison-dot-pair" aria-hidden="true">${countryOrder().map(key=>dots(m[key+'Count'],key)).join('')}</span><span class="pay-month-label" aria-hidden="true">${m.short}</span></button>`).join('')}</div><div id="payday-detail" class="comparison-payday-detail" aria-live="polite">${comparisonMonthDetail()}</div>${t.separate.length?`<details class="result-details comparison-separate"><summary>Bonus & Jahresabgleich separat<span aria-hidden="true">+</span></summary><div class="details-body"><div class="table-scroll">${comparisonBudgetTable(t.separate)}</div></div></details>`:''}${timelineHelp()}</section>`;
}
function comparisonTimelinePrint(){const t=last.comparisonTimeline;return `<section class="comparison-timeline-print"><h2>Jahresverlauf · beide verfügbaren Monatsbudgets</h2><p class="print-note">Planungsannahme: ${countryOrder().map(c=>countryCode(c)+' · '+t.schedule[c]).join('; ')}. Beträge nach Abgaben, Versicherung und Kosten. ${PAYDAY_NOTE}</p>${comparisonBudgetTable(comparisonTimelineRows())}</section>`;}
function timelinePrint(){const t=last.timeline;return `<section class="timeline-print"><h2>Jahresverlauf · verfügbare Monatsbeträge</h2><p class="print-note">${t.schedule}. Geplanter Zahlungszeitpunkt; Krankenversicherung, AT-Rücklage und Kosten enthalten. ${PAYDAY_NOTE}</p><table><thead><tr><th>Auszahlungsmonat</th><th>Bezüge</th><th>Verfügbar EUR · ca.</th></tr></thead><tbody>${t.months.map(m=>`<tr><td>${m.name}</td><td>${m.salaryCount}</td><td>${eur(m.available)}</td></tr>`).join('')}${t.unassigned.map(e=>`<tr><td>${e.label} · ohne Monatszuordnung</td><td>separat</td><td>${eur(e.available)}</td></tr>`).join('')}${Math.abs(t.adjustment?.available||0)>=.005?`<tr><td>${t.adjustment.label}</td><td>separat</td><td>${eur(t.adjustment.available)}</td></tr>`:''}<tr class="total"><td>Jahresbudget gesamt</td><td></td><td>${eur(t.annualAvailable)}</td></tr></tbody></table></section>`;}
function paydayBreakdown(key,month){
 const country=key==='foreign'?rawState().calculatorCountry:key,job=last.byCountry[country],m=job.timeline.months[month],at=country==='at';
 const insurance=job.inputs.raw.healthType;
 const health=job.result.resident||insurance==='local'
  ? country==='ch'?'Schweizer KVG-Grundversicherung':'Liechtensteinische OKP'
  : insurance==='private'?'Private Grundversicherung':'ÖGK-Selbstversicherung';
 const rows=at
  ? [['Brutto',m.salaryGross],['Sozialversicherung',-m.social],['Lohnsteuer',-m.tax],['Arbeitgeberauszahlung',m.payout]]
  : [['Arbeitgeberauszahlung in EUR',m.payout],
    ...(!job.result.resident&&!job.result.publicLI?[['Steuerrücklage Österreich',-m.reserve]]:[]),
    ...(m.localTax?[['Schweizer Steuerrücklage',-m.localTax]]:[]),
    [health,-m.health]];
 const cashRows=[...rows,
  ...(m.supplement?[['Private Zusatzversicherung',-m.supplement]]:[]),
  ...(m.parking?[['Parkplatzkosten',-m.parking]]:[]),
  ...(m.familyCash?[['Familienzulage / Differenzausgleich',m.familyCash]]:[]),
  ['Eigene laufende Kosten',-m.extraCosts],['Verfügbar',m.available]];
 return `<h3>${countryName(country)} · ${m.name}</h3>${!at?`<table><tbody>${[['Bruttogehalt',m.grossCHF],['Sozialversicherung & PK',-m.socialCHF],[job.result.publicLI?'LI-Steuer · Art. 19':'Quellensteuer',-m.sourceCHF],...(country==='li'?[['Arbeitgeber-KK-Beitrag',m.subsidyCHF]]:[]),['Auszahlung in CHF',m.payoutCHF]].map(([label,value])=>`<tr><td>${label}</td><td>${chf(value)}</td></tr>`).join('')}</tbody></table><p class="field-help">${chf(m.payoutCHF)} × ${job.inputs.li.fx.toLocaleString('de-AT',{maximumFractionDigits:8})} = ${eur(m.payout)}. CHF-Auszahlungen werden gemeinsam und erst zum Schluss umgerechnet.</p>`:''}<table><tbody>${cashRows.map(([label,value],i)=>periodRow(label,value,i===cashRows.length-1?'total':'')).join('')}</tbody></table>`;
}
function renderAustrianCalculator(){
 const v=last.plans.at.regular,annual=last.plans.at.annual;
 return `<section class="net-card" aria-label="Geschätztes Netto"><p class="net-structure">Österreich · 14 Bruttogehälter pro Jahr</p><p class="net-label">Verfügbar im normalen Monat</p><div class="net-main" aria-live="polite"><span class="approx">ca.</span> ${eur(v.available)}</div><p class="net-sub">Nach Sozialversicherung inklusive ÖGK, Lohnsteuer und deinen Kosten. 13. und 14. Gehalt separat im Jahresverlauf.</p><div class="net-bottom"><div><span>Jahresbudget inkl. 13. und 14. Gehalt</span><strong>ca. ${eur(annual.available)}</strong></div><div><span>Lohnsteuer / Monat</span><strong>${eur(v.tax)}</strong></div></div></section>${renderSalaryTimeline()}<p class="plan-note">${example?'Fiktive Beispielwerte. ':''}Steuerjahr 2026 · österreichische Berechnung gegen 45 AK-Referenzfälle geprüft. <button class="text-button" data-view="method">Annahmen & Quellen ↗</button></p><div class="compare-invite"><div><h3>Ein weiteres Gehaltsangebot?</h3><p>Beide verfügbaren Budgets und alle Zahltage vergleichen.</p></div><button class="button button-primary" data-view="compare">Gehälter vergleichen ↗</button></div><details class="result-details annual-details"><summary>Jahresbudget aufschlüsseln<span aria-hidden="true">+</span></summary><div class="details-body">${annualBudgetBreakdown()}</div></details>${atDetail()}`;
}
function renderCalculator(){
 const country=rawState().calculatorCountry,job=last.byCountry[country],month=job.plan.regular,year=job.plan.annual;
 const reserve=country!=='at'&&!job.result.resident&&!job.result.publicLI
  ? `<div><dt>AT-Steuerrücklage im Monat</dt><dd>${eur(month.reserve)}</dd></div>`
  : '';
 return `<div class="overview-stack">
  <section class="budget-sheet" aria-label="Verfügbares Budget">
   <div class="budget-sheet-top"><span class="sheet-code">${countryCode(country)} / ${countryName(country)}</span>${currencyControl()}</div>
   <div class="budget-sheet-body">
    <div><p class="sheet-kicker">REGULÄRER MONATSBEZUG</p><p class="net-main" aria-live="polite">${displayBudget(month.available)}</p>
     <p class="sheet-note">${example?'Fiktive Beispielrechnung. ':''}Nach Abgaben, Versicherung und eigenen Kosten.</p></div>
    <dl class="sheet-metrics">
     <div><dt>Jahr mit ${job.timeline.payments} Gehältern</dt><dd>${displayBudget(year.available)}</dd></div>
     ${reserve}
    </dl>
   </div>
  </section>
  ${renderSalaryTimeline()}
  <div class="overview-sections">${yearOverview()}${calculationOverview()}</div>
  ${planningResults()}
  <div class="overview-action"><p>Wie schneidet ein zweites Angebot ab?</p><button class="button button-primary" data-view="compare">Angebote gegenüberstellen <span aria-hidden="true">→</span></button></div>
 </div>`;
}
function compareHeaders(){return `<tr><th>Position</th><th>${foreignName()} · CHF<br>${foreignPeriod().column}</th><th>Österreich · EUR<br>${atDisplayPeriod().column}</th></tr>`;}
function nativeComparisonLines(f=payment('foreign'),a=payment('at')){return [['Bruttogehalt',f.grossCHF,a.salaryGross],...(last.li.kind==='li'?[['Arbeitgeber-KK-Beitrag',f.subsidyCHF,0]]:[]),['Sozialversicherung & PK',-f.socialCHF,-a.social],[`Quellensteuer ${foreignCode()} / Lohnsteuer AT`,-f.sourceCHF,-a.tax],['Auszahlung vom Arbeitgeber',f.payoutCHF,a.payout]];}
function compareRows(){const rows=nativeComparisonLines();return rows.map(([label,x,y],i)=>`<tr class="${i===rows.length-1?'total':''}"><td>${label}</td><td>${chf(x)}</td><td>${eur(y)}</td></tr>`).join('');}
function atDetail(){const p=atDisplayPeriod(),a=last.at,v=payment('at'),monthly=p.code==='monthly',n=monthly?1:12;
 const taxBase=round(a.taxable/12),c=a.credits,pp=a.pp,annualTariff=round(tariff(a.taxable)),credit=c.family+c.traffic+c.avab+pp.euro;
 const rows=[['Brutto inkl. Sachbezug',round((a.monthlyGross+last.inputs.at.benefit)*n)],['Laufende Sozialversicherung',-round(a.monthlySV*n)],['Freibetrag',-round(last.inputs.at.taxFree*n)],['Werbungskostenpauschale',-round(TAX.credits.expenses*n/12)],['Pendlerpauschale',-round(pp.allowance*n/12)],['Steuerpflichtiger laufender Bezug',monthly?taxBase:a.taxable]];
 return `<details class="result-details at-detail"><summary>Österreich: Steuerinfos & Rechenweg · ${p.label}<span aria-hidden="true">+</span></summary><div class="details-body"><details class="result-details"><summary>So entsteht die laufende Lohnsteuer<span aria-hidden="true">+</span></summary><div class="details-body"><table><tbody>${rows.map(([label,value])=>periodRow(label,value)).join('')}</tbody></table>${a.assessmentRelief?`<p class="table-note">Geschätzte Entlastung aus der Veranlagung: ${eur(a.assessmentRelief)} / Jahr. Sie ist im Jahresbudget enthalten.</p>`:''}<p class="table-note">Die Tarifsteuer wird aus der jährlichen Bemessungsgrundlage von ${eur(a.taxable)} berechnet: ${eur(annualTariff)} Tarifsteuer − ${eur(credit)} Absetzbeträge und Pendlereuro. Nach Begrenzung auf mindestens 0 und Division durch zwölf: ${eur(a.monthlyTax)} Lohnsteuer im normalen Monat. Gerundete Monatswerte können Cent-Differenzen zur Jahresbasis ergeben.</p><table><thead><tr><th>Jährlicher Einkommensteil 2026</th><th>Steuersatz</th></tr></thead><tbody>${TAX.brackets.map(([limit,rate],i)=>`<tr><td>${Number.isFinite(limit)?(i?'Über '+whole(TAX.brackets[i-1][0])+' bis ':'Bis ')+whole(limit)+' EUR':'Über '+whole(TAX.brackets[i-1][0])+' EUR'}</td><td>${whole(rate*100)} %</td></tr>`).join('')}</tbody></table></div></details><details class="result-details"><summary>Sozialversicherung & Sonderzahlungen<span aria-hidden="true">+</span></summary><div class="details-body"><p class="table-note">ÖGK-Krankenversicherung 3,87 %, Pension 10,25 %, Arbeitslosenversicherung einkommensabhängig bis 2,95 %, AK-Umlage 0,5 % und Wohnbauförderung ${last.inputs.at.region==='wien'?'0,75':'0,5'} %. Laufende Beitragsgrenze 6.930 EUR pro Monat; Sonderzahlungen gemeinsam bis 13.860 EUR pro Jahr. Die ÖGK ist bereits enthalten.</p><table><thead><tr><th>Bezug</th><th>Brutto EUR</th><th>SV EUR</th><th>Lohnsteuer EUR</th><th>Auszahlung EUR</th></tr></thead><tbody>${[last.plans.at.regular,...last.plans.at.extras].map(r=>`<tr><td>${r.label}</td><td>${eur(r.salaryGross)}</td><td>${eur(r.social)}</td><td>${eur(r.tax)}</td><td>${eur(r.payout)}</td></tr>`).join('')}</tbody></table><p class="table-note">${a.payments===12?'Zwölf laufende Bezüge ohne Sonderzahlungen.':'Zwölf laufende Bezüge, 13. und 14. Gehalt separat.'} Im Jahressechstel gelten für Sonderzahlungen ein Freibetrag von 620 EUR und danach gestaffelte Sätze (zunächst 6 %); Grenzen und Freigrenze werden berücksichtigt. Keine AK-Umlage oder Wohnbauförderung auf Sonderzahlungen. Zusatzversicherung und eigene Kosten werden zwölfmal vom laufenden Bezug abgezogen.</p></div></details><button class="text-button" data-view="method">Modellannahmen & amtliche Quellen ↗</button></div></details>`;
}
function comparisonRows(){const c=pairSummary(last.byCountry[countryOrder()[0]],last.byCountry[countryOrder()[1]],comparisonPeriod),values=c.values,order=countryOrder();return [[countryName(order[0]),values[order[0]]],[countryName(order[1]),values[order[1]]],[`${countryCode(order[0])} minus ${countryCode(order[1])}`,round(values[order[0]]-values[order[1]])]];}
function displayBudget(value, rate = parseNumber(rawState().fx,false)){
 return resultCurrency==='CHF'&&rate>0?chf(value/rate):eur(value);
}
function currencyControl(){
 return `<label class="budget-currency">Budget anzeigen in <select id="budget-currency"><option value="EUR">Euro</option><option value="CHF" ${resultCurrency==='CHF'?'selected':''}>Franken</option></select></label>`;
}
function comparisonProfile(raw,country){
 const profiles=savedProfiles();
 const source=countryOrder().find(key=>key!=='at');
 if(!sameGross||country==='at'||!source)return {raw,profiles};
 const contract=countryInputs(raw,profiles,source);
 const target=countryInputs(raw,profiles,country);
 const equal={...profileFrom(defaults),chCanton:target.chCanton,foreignPeriod:contract.foreignPeriod,liAnnual:contract.liAnnual,liPayments:contract.liPayments};
 return {raw:raw.foreignCountry===country?{...raw,...equal}:raw,profiles:{...profiles,[country]:equal}};
}
function thirdCountryPanel(){
 const country=Object.keys(WORK_COUNTRIES).find(key=>!countryOrder().includes(key));
 const entry=last.byCountry[country];
 const table=entry?`<div class="table-scroll"><table><thead><tr><th scope="col">Budget</th>${reportCountries().map(key=>`<th scope="col">${countryName(key)}</th>`).join('')}</tr></thead><tbody>
  ${[['Normaler Monat','regular'],['Durchschnitt je Kalendermonat','average'],['Jahr gesamt','annual']].map(([label,period])=>`<tr><th scope="row">${label}</th>${reportCountries().map(key=>{const plan=last.byCountry[key].plan;return `<td>${displayBudget(period==='average'?plan.annual.available/12:plan[period].available)}</td>`;}).join('')}</tr>`).join('')}
  </tbody></table></div>`:'';
 return `<details class="result-details planning-result" data-section="third-offer"><summary>Zusätzliches Länderprofil <span aria-hidden="true">+</span></summary><div class="details-body">
  <label class="check-label"><input type="checkbox" id="compare-three" ${threeWay?'checked':''}> ${countryName(country)} in die Gegenüberstellung aufnehmen</label>
  ${threeWay?`${country!=='at'?`<label class="check-label"><input type="checkbox" id="compare-same" ${sameGross?'checked':''}> Gleiches CHF-Vertragsbrutto als Szenario verwenden</label>`:''}
  ${sameGross&&country!=='at'?'<p class="table-note">Für das zusätzliche Land gelten Standardannahmen. Beim Schweizer Szenario wird der Kanton aus dem Schweizer Profil übernommen.</p>':''}
  ${last.thirdError?`<p class="table-note" role="status">${esc(last.thirdError)}</p>`:''}${table}
  <button class="text-button" type="button" data-edit-comparison="${country}">Angaben für ${countryName(country)} bearbeiten ↗</button>`:''}</div></details>`;
}
function fxScenarioPanel(jobs){
 const foreign=jobs.filter(job=>job.country!=='at');
 if(!foreign.length)return '';
 const raw=rawState(),base=parseNumber(raw.fx,false);
 const rows=[[-0.05,'Franken 5 % schwächer'],[0,'Aktueller Planungskurs'],[0.05,'Franken 5 % stärker']].map(([shift,label])=>{
  const rate=base*(1+shift);
  const values=jobs.map(job=>{
   if(job.country==='at'||shift===0)return job.plan.annual.available;
   try{
    const state=comparisonProfile({...raw,fx:rate.toLocaleString('de-AT',{maximumFractionDigits:8})},job.country);
    const inPair=countryOrder().includes(job.country)||view!=='compare';
    const changed=inPair?{...raw,fx:rate.toLocaleString('de-AT',{maximumFractionDigits:8})}:state.raw;
    const profiles=inPair?savedProfiles():state.profiles;
    const inputs=countryInputs(changed,profiles,job.country);
    const scenario=calculateCountry(changed,profiles,job.country,{swissData:swissCache.get(inputs.chCanton)?.data});
    return scenario.pending?null:scenario.plan.annual.available;
   }catch{return null;}
  });
  const baseline=jobs.findIndex(job=>job.country==='at');
  const relevant=baseline===-1?-1:jobs.findIndex(job=>job.country!=='at');
  return `<tr><th scope="row">${label}<small>1 CHF = ${rate.toLocaleString('de-AT',{minimumFractionDigits:4,maximumFractionDigits:4})} EUR</small></th>${values.map(value=>`<td>${value===null?'—':eur(value)}</td>`).join('')}${relevant<0?'':`<td>${values[relevant]===null?'—':eur(values[relevant]-values[baseline])}</td>`}</tr>`;
 });
 return `<details class="result-details planning-result"><summary>Währungspuffer bei ±5 %<span aria-hidden="true">+</span></summary><div class="details-body"><div class="table-scroll"><table><thead><tr><th scope="col">CHF-Kurs</th>${jobs.map(job=>`<th scope="col">${countryName(job.country)} · EUR/Jahr</th>`).join('')}${jobs.some(job=>job.country==='at')?`<th scope="col">${countryCode(foreign[0].country)} − AT</th>`:''}</tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="table-note">Für jeden Kurs wird das Jahresbudget einschließlich einer etwaigen österreichischen Steuer neu berechnet.</p></div></details>`;
}
function planningResults(){
 const jobs=reportCountries().map(country=>last.byCountry[country]);
 const rates=jobs.map(job=>{
  const annual=job.plan.annual;
  const pct=annual.gross>0?(annual.social+annual.tax+annual.health)/annual.gross:0;
  const tax=annual.gross>0?annual.tax/annual.gross:0;
  const factor=parseNumber(job.inputs.raw.chPriceFactor);
  const price=job.result.resident&&factor!==1?`<small>Nach Preisniveau ${esc(String(job.inputs.raw.chPriceFactor))}: ${displayBudget(annual.available/factor/12)} je Kalendermonat.</small>`:'';
  return `<li><strong>${countryName(job.country)}</strong><span>${pct.toLocaleString('de-AT',{style:'percent',maximumFractionDigits:1})} Abgaben inkl. Grundversicherung · davon ${tax.toLocaleString('de-AT',{style:'percent',maximumFractionDigits:1})} Steuern</span><small>Jahresbudget ÷ 12: ${displayBudget(annual.available/12)} je Kalendermonat.</small>${price}</li>`;
 });
 return `<section class="scenario-board section-card"><div class="section-heading"><div><p class="section-kicker">PLANUNG</p><h2>Budget unter der Lupe</h2></div></div>
  ${fxScenarioPanel(jobs)}
  <details class="result-details planning-result"><summary>Abgaben und Jahresdurchschnitt<span aria-hidden="true">+</span></summary><div class="details-body"><ul class="budget-indicators">${rates.join('')}</ul><p class="table-note">Für die Abgabenquote werden Sozialabgaben, Grundversicherung und Steuern durch das modellierte Brutto geteilt.</p></div></details>
 </section>`;
}
function renderCompare(){
 const order=countryOrder(),monthly=comparisonPeriod==='monthly';
 const difference=pairSummary(last.byCountry[order[0]],last.byCountry[order[1]],comparisonPeriod).difference;
 const entries=reportCountries().map(key=>({
  key,
  amount:last.byCountry[key].plan[monthly?'regular':'annual'].available,
 }));
 const largest=Math.max(1,...entries.map(entry=>Math.abs(entry.amount)));
 return `<div class="overview-stack">
  <section class="budget-sheet comparison-sheet" aria-label="Budgetvergleich">
   <div class="budget-sheet-top"><span class="sheet-code">ANGEBOTE / VERFÜGBARES BUDGET</span>${currencyControl()}</div>
   <fieldset class="salary-period comparison-period"><legend>Zeitraum im Budgetvergleich</legend>
    <label><input type="radio" name="comparisonPeriod" value="monthly" ${monthly?'checked':''}><span>Normaler Monat</span></label>
    <label><input type="radio" name="comparisonPeriod" value="annual" ${monthly?'':'checked'}><span>Jahr gesamt</span></label>
   </fieldset>
   <ul class="budget-lanes">
    ${entries.map(({key,amount},index)=>`<li class="budget-lane lane-${index}${amount<0?' lane-negative':''}">
     <span class="lane-name"><span class="station-code" aria-hidden="true">${countryCode(key)}</span>${countryName(key)}</span>
     <span class="lane-track" aria-hidden="true"><span style="--share:${Math.abs(amount)/largest*100}%"></span></span>
     <strong>${displayBudget(amount)}</strong>
    </li>`).join('')}
   </ul>
   <div class="sheet-difference"><span>Abstand der Hauptangebote <small>${countryCode(order[0])} − ${countryCode(order[1])}</small></span><strong>${difference>0?'+':''}${displayBudget(difference)}</strong></div>
   <p class="sheet-note">${example?'Fiktive Beispielrechnung. ':''}Alle Beträge nach Abgaben, Versicherung und eigenen Kosten.</p>
  </section>
  ${thirdCountryPanel()}
  ${renderComparisonTimeline()}
  <div class="overview-sections">${yearOverview()}${calculationOverview()}</div>
  ${planningResults()}
 </div>`;
}
function inputSummary(){
 const rows=[['Rechnerland',primaryName()],...(view==='compare'?[['Vergleichsland',countryName(rawState().comparisonCountry)]]:[]),['Steuerjahr','2026'],['Anzeige','Normaler Monat; zusätzliche Gehälter separat']];
 for(const country of view==='compare'?countryOrder():[rawState().calculatorCountry]){
  const job=last.byCountry[country],{raw,li,at}=job.inputs,code=countryCode(country);
  if(country==='at')rows.push([code+' Bruttoeingabe',`${raw.atGross} EUR / ${raw.atPeriod==='monthly'?'Monat × '+raw.atPayments:'Jahr'}`],[code+' Bundesland',raw.atRegion],[code+' Grundversicherung','ÖGK in Sozialversicherung enthalten'],[code+' Zusatzversicherung',eur(job.inputs.atSupplement)+' / Monat'],[code+' eigene Kosten',eur(at.extraCosts)+' / Monat']);
  else rows.push([code+' Bruttoeingabe',`${raw.liAnnual} CHF / ${raw.foreignPeriod==='monthly'?'Monat × '+raw.liPayments:'Jahr'}`],[code+' Vertrags-Jahresbrutto',chf(li.annual)],[code+' Grundversicherung',raw.healthType==='private'?'Private Grundversicherung':'ÖGK-Selbstversicherung'],[code+' Grundprämie',eur(li.health)+' / Monat'],[code+' KV-Pflichtanteil',eur(li.healthDeductible)+' / Monat'],[code+' Zusatzversicherung',eur(job.inputs.supplement)+' / Monat'],[code+' eigene Kosten',eur(li.extraCosts)+' / Monat'],[code+' EUR pro CHF',String(li.fx)],...(country==='ch'?[[code+' Kanton / Tarif',raw.chCanton+' / '+(job.inputs.sourceQuote?.code||raw.chTariff)]]:[]));
 }
 const raw=rawState();rows.push(['Kinder unter / ab 18',`${raw.childrenYoung} / ${raw.childrenAdult}`],['Familienbonus-Anteil',String(Number(raw.familyShare)*100)+' %'],['AVAB / AEAB',raw.avab?'Ja':'Nein']);return rows;
}
function updatePrint(){
 $('#print-report').innerHTML=last?renderReport(currentReport(),{detailed:reportDetail==='detailed',version:`Grenzgehalt ${APP_VERSION}`}):'';
}
function prepareReadableTables(root){
 for(const table of root.querySelectorAll('table')){
  let wrapper=table.parentElement;
  if(!wrapper.classList.contains('table-scroll')){wrapper=document.createElement('div');wrapper.className='table-scroll';table.before(wrapper);wrapper.append(table);}
  wrapper.tabIndex=0;wrapper.setAttribute('role','group');wrapper.setAttribute('aria-label','Tabelle – bei Bedarf seitlich scrollen');
 }
}
function syncDisclosureIcons(root=document){prepareReadableTables(root===document?result:root);for(const detail of root.querySelectorAll('details')){const icon=detail.querySelector(':scope > summary > span[aria-hidden="true"]');if(icon)icon.textContent=detail.open?'−':'+';}}
document.addEventListener('toggle',event=>{const detail=event.target;if(detail instanceof HTMLDetailsElement){const icon=detail.querySelector(':scope > summary > span[aria-hidden="true"]');if(icon)icon.textContent=detail.open?'−':'+';}},true);
function renderResult(html){
 const key=detail=>{
  const path=[];let node=detail;
  while(node&&node!==result){
   if(node.tagName==='DETAILS'){
    const summary=node.querySelector(':scope > summary');
    path.unshift(summary?.getAttribute('aria-label')||summary?.textContent.replace(/[+−]$/,'').trim()||'');
   }
   if(node.hasAttribute('data-ledger'))path.unshift(node.dataset.ledger);
   node=node.parentElement;
  }
  return (detail.closest('[data-country]')?.dataset.country||'main')+':'+path.join('/');
 };
 const active=document.activeElement;
 const focusedDetails=active?.matches('summary')&&result.contains(active)?key(active.parentElement):null;
 const state=new Map([...result.querySelectorAll('details')].map(detail=>[key(detail),detail.open]));
 result.innerHTML=html;
 for(const detail of result.querySelectorAll('details')){
  const id=key(detail);
  if(state.has(id))detail.open=state.get(id);
  if(id===focusedDetails)detail.querySelector(':scope > summary')?.focus({preventScroll:true});
 }
 syncDisclosureIcons(result);
}

function syncHeroBudget(){
 const key=rawState().calculatorCountry;
 const job=last?.byCountry[key];
 const annual=view==='compare'&&comparisonPeriod==='annual';
 const amount=job?.plan[annual?'annual':'regular'].available;
 $('#hero-readout-label').textContent=annual?'JAHR GESAMT':'NORMALER MONAT';
 $('#hero-budget').textContent=amount===undefined?'—':displayBudget(amount);
 $('#hero-budget-note').textContent=job
  ? countryName(key)+(example?' · Beispielrechnung':' · nach Abgaben und Kosten')
  : 'Sobald alle Angaben vorliegen';
}

function update(){syncCountryUi();syncExactMode();syncInputOptions();try{
 saveEditor();const raw=rawState(),countries=view==='compare'?countryOrder():[raw.calculatorCountry],jobs={};
 for(const country of countries){
  const source=countryInputs(raw,countryProfiles,country),job=calculateCountry(raw,countryProfiles,country,{swissData:swissCache.get(source.chCanton)?.data});jobs[country]=job;
  if(job.pending){
   last=null;$('#monthly-preview').textContent='Tarif wird geladen …';updatePrint();$('#validation').hidden=true;
   const canton=job.inputs.raw.chCanton,error=swissCache.get(canton)?.error;
   result.innerHTML=error?'<div class="results-empty"><h2>CH-Tarif konnte nicht geladen werden.</h2><p>Bitte erneut versuchen oder eine bekannte Jahresquellensteuer eingeben.</p><button class="button button-primary" data-retry-swiss>Tarif erneut laden</button></div>':'<div class="results-empty" role="status"><h2>Schweizer Tarif wird geladen …</h2><p>'+esc(CANTONS[canton])+'. Deine Gehaltsdaten bleiben im Browser.</p></div>';
   if(!error)void ensureSwissTariff(canton).then(()=>update()).catch(()=>update());return;
  }
 }
 const main=jobs[raw.calculatorCountry],edit=jobs[editorCountry()];if(edit)syncExactMode(edit.inputs);
 if(!(main.country==='at'?main.inputs.at.gross:main.inputs.li.annual)){last=null;$('#validation').hidden=true;result.innerHTML='<div class="results-empty"><h2>Beginne mit deinem Gehalt.</h2><p>Trage dein Brutto im Rechner ein.</p><button class="button button-primary" data-view="calculator">Zum Rechner</button></div>';updatePrint();return;}
 let thirdError='';
 if(view==='compare'&&threeWay){
  const country=Object.keys(WORK_COUNTRIES).find(key=>!countries.includes(key));
  try{
   const state=comparisonProfile(raw,country);
   const source=countryInputs(state.raw,state.profiles,country);
   const tariff=swissCache.get(source.chCanton);
   const job=calculateCountry(state.raw,state.profiles,country,{swissData:tariff?.data});
   if(job.pending){
    thirdError=tariff?.error?'Schweizer Tarif konnte nicht geladen werden.':'Schweizer Tarif wird geladen …';
    if(!tariff)void ensureSwissTariff(source.chCanton).then(()=>update()).catch(()=>update());
   }else if(job.plan.annual.gross>0)jobs[country]=job;
   else thirdError='Bitte zuerst ein Gehalt für '+countryName(country)+' eingeben.';
  }catch(error){thirdError=error.message;}
 }
 last={...jobContext(main),byCountry:jobs,thirdError,comparisonTimeline:view==='compare'?buildCountryComparison(main,jobs[raw.comparisonCountry]):null};
 $('#monthly-preview').textContent=edit&&edit.country!=='at'?eur(edit.plan.regular.available):'—';$('#at-monthly-preview').textContent=edit?.country==='at'?eur(edit.plan.regular.available):'—';$('#validation').hidden=true;$('#validation').textContent='';result.classList.remove('stale-results');renderResult(view==='compare'?renderCompare():renderCalculator());updatePrint();persist();
}catch(error){last=null;$('#monthly-preview').textContent='Angaben ergänzen';$('#at-monthly-preview').textContent='Angaben ergänzen';$('#validation').textContent=error.message;$('#validation').hidden=false;result.classList.remove('stale-results');result.innerHTML='<div class="results-empty"><h2>Ergänze deine Angaben.</h2><p>Nach der Korrektur wird das Budget automatisch neu berechnet.</p></div>';updatePrint();}
 finally{syncHeroBudget();}
}

function changeView(next,scroll=false){
  saveEditor();
  view=['calculator','compare','method','help'].includes(next)?next:'calculator';
  const workbench=view==='calculator'||view==='compare';
  $$('nav [data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);if(el.dataset.view===view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('#workspace').hidden=['method','help'].includes(view);$('#method-view').hidden=view!=='method';$('#help-view').hidden=view!=='help';$('.export-wrap').hidden=view==='help';$('#workspace').classList.toggle('is-comparison',view==='compare');
  $('.country-picker').hidden=view==='method';$('#example-button').hidden=view!=='calculator';$('#guide-open').hidden=!['calculator','compare'].includes(view);
  $('#hero-readout').hidden=!workbench;
  $('.workbench-hero').classList.toggle('is-reference',!workbench);
  $('#workbench-tools').hidden=!workbench;
  switchEditor(editorCountry());syncInputVisibility();
  $('#page-title').innerHTML=view==='compare'?'Angebote <span>im Budgetcheck.</span>':view==='method'?'Die Regeln <span>hinter den Zahlen.</span>':view==='help'?'Hilfe für <span>deine Rechnung.</span>':'Dein Gehalt.<br><span>Dein Spielraum.</span>';
  $('#page-subtitle').textContent=view==='compare'?'Stell deine Angebote nach Abgaben und Kosten gegenüber und prüfe, wann dir das Geld zur Verfügung steht.':view==='method'?'Hier findest du die amtlichen Quellen, die angesetzten Werte und die Annahmen des Rechners.':view==='help'?'Von der Bruttoeingabe zum Monatsbudget, zum Angebotsvergleich und zum Export.':'Schätze dein verfügbares Budget nach Steuern, Versicherung und eigenen Kosten.';
  restoreInputOptions();history.replaceState(null,'',view==='calculator'?location.pathname:`#${view}`);update();syncDisclosureIcons();if(scroll)window.scrollTo({top:0,behavior:'smooth'});
}
function exportFilename(extension,full=reportDetail==='detailed'){
 const keys=last?reportCountries():[rawState().calculatorCountry];
 return `grenzgehalt-${keys.join('-')}-${full?'vollberechnung':'kompakt'}-${new Date().toISOString().slice(0,10)}.${extension}`;
}
let printPageTitle=null;
function preparePrint(){
 if(!last)return;
 if(printPageTitle===null)printPageTitle=document.title;
 document.title=exportFilename('pdf').slice(0,-4);updatePrint();
}
function restorePrintTitle(){if(printPageTitle!==null){document.title=printPageTitle;printPageTitle=null;}}
const exportSupport=$('#export-support-dialog');
const exportPayPalForm=$('#export-support-paypal');
const printDonate=$('#print-donate');
const paypalLoad=$('#print-load-paypal');
const paypalMount=$('#print-donate-button');
const supportNote=$('#export-support-note');
const supportContinue=$('#export-support-continue');
const exportBackground=$$('body > :is(.skip-link, header, nav, main)');
let pendingExport=null;
let donateSdk;

function loadDonateSdk(){
 if(!donateSdk){
  donateSdk=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://www.paypalobjects.com/donate/sdk/donate-sdk.js';
   script.onload=()=>{
    const donation=window.PayPal?.Donation;
    if(donation?.Button)resolve(donation);
    else reject(new Error('PayPal Donate SDK unavailable'));
   };
   script.onerror=reject;
   document.head.append(script);
  }).catch(error=>{donateSdk=null;throw error;});
 }
 return donateSdk;
}

async function offerPrintDonation(request){
 try{
  const donation=await loadDonateSdk();
  if(pendingExport!==request)return;
  donation.Button({
   env:'production',
   business:exportPayPalForm.elements.business.value,
   currency_code:exportPayPalForm.elements.currency_code.value,
   no_recurring:exportPayPalForm.elements.no_recurring.value,
   image:{
    src:'https://www.paypalobjects.com/de_DE/AT/i/btn/btn_donateCC_LG.gif',
    title:'Mit PayPal spenden',
    alt:'Mit PayPal spenden'
   },
   onComplete:payment=>{
    if(pendingExport!==request||request.donated)return;
    if(String(payment?.st).trim().toLowerCase()!=='completed'||!payment?.tx){
     supportNote.textContent='PayPal hat die Spende noch nicht als abgeschlossen bestätigt.';
     return;
    }
    request.donated=true;
    printDonate.hidden=true;
    supportNote.textContent='Danke für deine Spende! Du kannst jetzt drucken.';
    supportContinue.textContent='Jetzt drucken';
    // Let the SDK finish closing its checkout before opening the print dialog.
    setTimeout(tryPrintAfterDonation,0);
   }
  }).render('#print-donate-button');
  const button=printDonate.querySelector('img');
  button.setAttribute('role','button');
  button.tabIndex=0;
  button.addEventListener('keydown',event=>{
   if(!['Enter',' '].includes(event.key))return;
   event.preventDefault();
   button.click();
  });
  supportNote.textContent='Nach erfolgreicher Spende startet der Druckdialog.';
 }catch{
  if(pendingExport===request){
   paypalMount.replaceChildren();
   paypalLoad.hidden=false;
   supportNote.textContent='PayPal konnte nicht geladen werden. Du kannst direkt drucken.';
  }
 }
}

function requestSupportedExport(action){
 if(exportSupport.open)return;
 closeMenu();update();if(!last){toast('Bitte zuerst gültige Gehaltsangaben eintragen.');return;}
 const request={action,donated:false,autoPrintAttempted:false};
 pendingExport=request;
 const print=action==='print',full=action==='json'||reportDetail==='detailed';
 $('#export-support-context').textContent=`${full?'Vollberechnung':'Kompakte Übersicht'} · ${print?'Druck / PDF':action.toUpperCase()}`;
 supportContinue.textContent=`Nein danke, ${print?'Druck starten':'Export starten'}`;
 supportNote.textContent=print?'Nach erfolgreicher Spende startet der Druckdialog.':'PayPal öffnet in einem neuen Tab.';
 exportPayPalForm.hidden=print;
 printDonate.hidden=!print;
 if(print){
  // PayPal's checkout overlay needs to sit above the support dialog.
  for(const element of exportBackground)element.inert=true;
  exportSupport.classList.add('export-support-checkout');
  exportSupport.setAttribute('aria-modal','true');
  exportSupport.show();
  paypalLoad.hidden=false;
 }else exportSupport.showModal();
 document.documentElement.classList.add('export-support-open');
 $('#export-support-title').focus();
}

function printReport(){
 update();if(!last){toast('Bitte zuerst gültige Gehaltsangaben eintragen.');return;}
 preparePrint();try{window.print();}catch(error){restorePrintTitle();throw error;}
}

function tryPrintAfterDonation(){
 if(!pendingExport?.donated||pendingExport.autoPrintAttempted||!document.hasFocus())return;
 pendingExport.autoPrintAttempted=true;
 supportContinue.focus({preventScroll:true});
 try{printReport();}catch{supportContinue.focus();}
}

function closeExportSupport(){
 pendingExport=null;
 exportSupport.close();
 exportSupport.removeAttribute('aria-modal');
 exportSupport.classList.remove('export-support-checkout');
 document.documentElement.classList.remove('export-support-open');
 for(const element of exportBackground)element.inert=false;
 paypalMount.replaceChildren();
 $('#export-toggle').focus();
}

paypalLoad.addEventListener('click',()=>{
 if(pendingExport?.action!=='print')return;
 paypalLoad.hidden=true;
 supportNote.textContent='PayPal wird geladen …';
 void offerPrintDonation(pendingExport);
});
supportContinue.addEventListener('click',()=>{
 const action=pendingExport?.action;
 if(!action)return;
 closeExportSupport();
 if(action==='print')printReport();
 else exportData(action);
});
$('#export-support-close').addEventListener('click',closeExportSupport);
exportSupport.addEventListener('cancel',event=>{
 event.preventDefault();
 closeExportSupport();
});
window.addEventListener('focus',tryPrintAfterDonation);
window.addEventListener('afterprint',()=>{
 if(pendingExport?.donated&&pendingExport.autoPrintAttempted)closeExportSupport();
});
exportSupport.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&exportSupport.classList.contains('export-support-checkout')){
  event.preventDefault();
  closeExportSupport();
  return;
 }
 if(event.key!=='Tab')return;
 const first=$('#export-support-close'),last=supportContinue;
 if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
});
exportPayPalForm.addEventListener('submit',()=>{
 supportContinue.textContent='Export starten';
 supportNote.textContent='Kehre danach hierher zurück, um fortzufahren.';
});
function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportData(type){
 update();if(!last){toast('Bitte zuerst gültige Gehaltsangaben eintragen.');return;}
 const raw=rawState(),keys=reportCountries();
 if(type==='json'){
  const payload={schema:'grenzgehalt/4',version:APP_VERSION,model:MODEL.version,year:2026,resultCurrency,threeWay,sameGross,createdAt:new Date().toISOString(),approximate:true,example,view:view==='compare'?'compare':'calculator',country:raw.calculatorCountry,comparisonCountry:raw.comparisonCountry,inputs:raw,countryProfiles:savedProfiles(),exchangeRate:rateController.metadata(),comparisonPeriod,selectedPayMonth,headline:{basis:'regular_month',country:raw.calculatorCountry,currency:'EUR',available:last.byCountry[raw.calculatorCountry].plan.regular.available},payment_plans:Object.fromEntries(keys.map(c=>[c,last.byCountry[c].plan])),monthly_timeline:last.timeline,country_timelines:Object.fromEntries(keys.map(c=>[c,last.byCountry[c].timeline])),comparison_timeline:last.comparisonTimeline,comparison:view==='compare'?pairSummary(last.byCountry[keys[0]],last.byCountry[keys[1]],comparisonPeriod):null,display:Object.fromEntries(keys.map(c=>[c,{...jobPeriod(c),currency:WORK_COUNTRIES[c].currency,values:selectedPayment(last.byCountry[c].plan,jobPeriod(c).code)}])),annual_budget_parts:Object.fromEntries(keys.map(c=>[c,annualBudgetParts(last.byCountry[c].plan)])),country_calculations:Object.fromEntries(keys.map(c=>[c,{applied:last.byCountry[c].inputs,result:last.byCountry[c].result}])),cash_conversion:'Jede CHF-Abrechnung zuerst; fertige Arbeitgeberauszahlung einmal in EUR. Österreich bleibt in EUR. Der Vergleich übernimmt fertige Budgets.',payment_note:PAYMENT_NOTE};
  download(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),exportFilename('json',true));toast('Vollberechnung als JSON gespeichert.');return;
 }
 const csv=reportCsv(currentReport(),{detailed:reportDetail==='detailed'});
 download(new Blob([csv],{type:'text/csv;charset=utf-8'}),exportFilename('csv'));toast(reportDetail==='detailed'?'Vollberechnung als CSV exportiert.':'Kompakte Übersicht als CSV exportiert.');
}

function closeMenu(){$('#export-menu').hidden=true;$('#export-toggle').setAttribute('aria-expanded','false');}
function scenarioSnapshot(){
 return {
  schema:'grenzgehalt/4',model:MODEL.version,year:2026,view:view==='compare'?'compare':'calculator',
  inputs:rawState(),countryProfiles:savedProfiles(),comparisonPeriod,selectedPayMonth,
  resultCurrency,threeWay,sameGross,example,exchangeRate:rateController.metadata(),
 };
}
function applySnapshot(data){
 if(data?.schema!=='grenzgehalt/4'||data.year!==2026)throw new Error('Bitte eine Grenzgehalt-4-Berechnung für 2026 wählen.');
 const safe=sanitizeState(data.inputs,{legacy:data.model!==MODEL.version});
 const profiles=restoreCountryProfiles(safe,data.countryProfiles);
 comparisonPeriod=data.comparisonPeriod==='annual'?'annual':'monthly';
 selectedPayMonth=Number.isInteger(data.selectedPayMonth)&&data.selectedPayMonth>=0&&data.selectedPayMonth<12?data.selectedPayMonth:0;
 resultCurrency=data.resultCurrency==='CHF'?'CHF':'EUR';
 threeWay=data.threeWay===true;
 sameGross=data.sameGross===true;
 applyState(safe);
 countryProfiles=profiles;
 previousCountry=safe.foreignCountry;
 example=data.example===true;
 rateController.restore(data.exchangeRate,{snapshot:true});
 changeView(data.view==='compare'?'compare':'calculator');
}

const shareDialog=$('#share-dialog');
$('#share-button').addEventListener('click',()=>{
 closeMenu();
 update();
 if(!last){toast('Bitte zuerst gültige Gehaltsangaben eintragen.');return;}
 $('#share-fallback').hidden=true;
 shareDialog.showModal();
});
$('#share-confirm').addEventListener('click',async()=>{
 try{
  const url=new URL(location.pathname,location.origin);
  url.hash=shareHash(scenarioSnapshot());
  try{
   await navigator.clipboard.writeText(url.href);
   shareDialog.close();
   toast('Rechenlink kopiert.');
  }catch{
   $('#share-fallback').hidden=false;
   const field=$('#share-url');
   field.value=url.href;
   field.focus();
   field.select();
  }
 }catch(error){toast(error.message);}
});

const guideDialog=$('#guide-dialog');
const guideForm=$('#guide-form');
let guide;
const options=(entries,value)=>entries.map(([key,label])=>`<option value="${esc(key)}" ${key===value?'selected':''}>${esc(label)}</option>`).join('');
const countryOptions=except=>Object.keys(WORK_COUNTRIES).filter(key=>key!==except).map(key=>[key,countryName(key)]);
function guideSalary(name,country){
 const at=country==='at';
 const data=guide.salaries[country];
 return `<div class="field"><label for="guide-${name}-gross">Bruttogehalt</label>
  <div class="input-affix"><input id="guide-${name}-gross" name="${name}Gross" value="${esc(data.gross)}" inputmode="decimal" autocomplete="off" required><span>${at?'EUR':'CHF'}</span></div></div>
  <div class="field-grid"><div class="field"><label for="guide-${name}-period">Zeitraum</label><select id="guide-${name}-period" name="${name}Period">${options([['monthly','Monatlich'],['annual','Jährlich']],data.period)}</select></div>
  <div class="field"><label for="guide-${name}-payments">Gehälter im Jahr</label><select id="guide-${name}-payments" name="${name}Payments">${options((at?['14','12']:['12','13','14']).map(value=>[value,value]),data.payments)}</select></div></div>`;
}
function renderGuide(){
 const swissDetails=`<div class="field-grid"><div class="field"><label for="guide-residence">Wohnsitz</label><select id="guide-residence" name="residence">${options([['at','Österreich'],['ch','Schweiz']],guide.residence)}</select></div><div class="field"><label for="guide-canton">Arbeits- oder Wohnkanton</label><select id="guide-canton" name="canton">${options(Object.entries(CANTONS),guide.canton)}</select></div></div>`;
 $('#guide-step').innerHTML=`
  <fieldset class="offer-column">
   <legend>Dein Hauptangebot</legend>
   <div class="field"><label for="guide-country">Arbeitsort</label><select id="guide-country" name="country">${options(countryOptions(),guide.country)}</select></div>
   ${guideSalary('main',guide.country)}
   ${guide.country==='ch'?swissDetails:''}
  </fieldset>
  <fieldset class="offer-column">
   <legend>Zweites Angebot <small>optional</small></legend>
   <div class="field"><label for="guide-compare">Vergleichsort</label><select id="guide-compare" name="compare">${options([['','Kein zweites Angebot'],...countryOptions(guide.country)],guide.compare)}</select></div>
   ${guide.compare?guideSalary('other',guide.compare):'<p class="field-help">Wähle einen Arbeitsort, wenn du zwei Angebote gegenüberstellen möchtest.</p>'}
   ${guide.compare==='ch'?swissDetails:''}
  </fieldset>`;
}
function saveGuideInputs(){
 const elements=guideForm.elements;
 for(const [prefix,country] of [['main',guide.country],['other',guide.compare]]){
  if(country&&elements[prefix+'Gross']){
   guide.salaries[country]={gross:elements[prefix+'Gross'].value,period:elements[prefix+'Period'].value,payments:elements[prefix+'Payments'].value};
  }
 }
 if(elements.residence){
  guide.residence=elements.residence.value;
  guide.canton=elements.canton.value;
 }
}
function applyGuide(){
 const raw=rawState(),profiles=savedProfiles(),state={...raw,calculatorCountry:guide.country,comparisonCountry:guide.compare||selectedCountries(guide.country,raw.comparisonCountry).comparison};
 for(const country of [guide.country,guide.compare].filter(Boolean)){
  const data=guide.salaries[country];
  if(country==='at')Object.assign(state,{atGross:data.gross,atPeriod:data.period,atPayments:data.payments});
  else profiles[country]={
   ...(profiles[country]||profileFrom(defaults)),liAnnual:data.gross,foreignPeriod:data.period,liPayments:data.payments,
   ...(country==='ch'?{chResidence:guide.residence,chCanton:guide.canton}:{}),
  };
 }
 const foreign=guide.country==='at'?(guide.compare||raw.foreignCountry):guide.country;
 applyState({...state,...(profiles[foreign]||profileFrom(defaults)),foreignCountry:foreign});
 countryProfiles=profiles;
 previousCountry=foreign;
 example=false;
 guideDialog.close();
 changeView(guide.compare?'compare':'calculator');
 $('#results-panel').scrollIntoView({block:'start'});
}
$('#guide-open').addEventListener('click',()=>{
 const raw=rawState(),profiles=savedProfiles(),swiss=countryInputs(raw,profiles,'ch');
 const salaries=Object.fromEntries(Object.keys(WORK_COUNTRIES).map(country=>{
  const state=countryInputs(raw,profiles,country);
  return [country,country==='at'?{gross:state.atGross,period:state.atPeriod,payments:state.atPayments}
   :{gross:state.liAnnual,period:state.foreignPeriod,payments:state.liPayments}];
 }));
 guide={country:raw.calculatorCountry,compare:view==='compare'?raw.comparisonCountry:'',residence:swiss.chResidence,canton:swiss.chCanton,salaries};
 renderGuide();
 guideDialog.showModal();
 $('#guide-main-gross').focus();
});
$('#guide-close').addEventListener('click',()=>guideDialog.close());
guideForm.addEventListener('change',event=>{
 const {name,value,id}=event.target;
 if(name!=='country'&&name!=='compare')return;
 saveGuideInputs();
 guide[name]=value;
 if(guide.compare===guide.country)guide.compare='';
 renderGuide();
 document.getElementById(id).focus();
});
guideForm.addEventListener('submit',event=>{
 event.preventDefault();
 for(const gross of $$('#guide-step input')){
  if(parseNumber(gross.value)>0)continue;
  gross.setCustomValidity('Bitte ein positives Bruttogehalt eingeben.');
  gross.reportValidity();
  gross.addEventListener('input',()=>gross.setCustomValidity(''),{once:true});
  return;
 }
 saveGuideInputs();
 applyGuide();
});

result.addEventListener('change',event=>{
 if(event.target.id==='budget-currency'){
  resultCurrency=event.target.value;
  update();
  $('#budget-currency')?.focus();
 }
 if(event.target.id==='compare-three'){
  threeWay=event.target.checked;
  update();
  $('#compare-three')?.focus();
 }
 if(event.target.id==='compare-same'){
  sameGross=event.target.checked;
  update();
  $('#compare-same')?.focus();
 }
});
result.addEventListener('click',event=>{
 const edit=event.target.closest('[data-edit-comparison]');
 if(!edit)return;
 const country=edit.dataset.editComparison;
 const field=form.querySelector(`[name="comparisonCountry"][value="${country}"]`);
 field.click();
 $(country==='at'?'#at-gross':'#li-annual').focus();
});
function exampleState(){const country=rawState().foreignCountry,calculatorCountry=rawState().calculatorCountry;applyState({...defaults,calculatorCountry,foreignCountry:country});previousCountry=country;example=true;rateController.restore({source:'example',automatic:true});restoreInputOptions();update();void rateController.setAutomatic(true);toast('Fiktive Beispielrechnung geladen.');}
document.addEventListener('change',event=>{if(event.target.name==='comparisonPeriod'&&['monthly','annual'].includes(event.target.value)){comparisonPeriod=event.target.value;update();result.querySelector('[name="comparisonPeriod"]:checked')?.focus({preventScroll:true});}});
document.addEventListener('click',event=>{const monthButton=event.target.closest('[data-pay-month]');if(monthButton&&last){selectedPayMonth=Number(monthButton.dataset.payMonth);for(const button of $$('[data-pay-month]')){const selected=Number(button.dataset.payMonth)===selectedPayMonth;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));}$('#payday-detail').innerHTML=view==='compare'?comparisonMonthDetail():timelineMonthDetail();syncDisclosureIcons($('#payday-detail'));persist();}const nav=event.target.closest('[data-view]');if(nav){event.preventDefault();changeView(nav.dataset.view,true);}if(event.target.closest('[data-result]')){update();$('#results-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}if(event.target.closest('[data-example]'))exampleState();if(event.target.closest('[data-reset-special]')){form.elements.specialOverride.checked=false;form.elements.exactSpecial.value='';example=false;update();toast('Sonderzahlungen werden wieder aus der Gehaltsanzahl berechnet.');}if(event.target.closest('[data-retry-swiss]')){for(const canton of [...swissCache.keys()])if(swissCache.get(canton)?.error)swissCache.delete(canton);update();}if(!event.target.closest('.export-wrap'))closeMenu();});
$('#export-toggle').addEventListener('click',()=>{const open=$('#export-menu').hidden;$('#export-menu').hidden=!open;$('#export-toggle').setAttribute('aria-expanded',String(open));if(open)$('#report-detail').focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#export-menu').hidden){closeMenu();$('#export-toggle').focus();}if(!$('#export-menu').hidden&&event.target.tagName!=='SELECT'&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const options=$$('#export-menu button');let i=options.indexOf(document.activeElement);i=(i+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options[i].focus();}});
$('#report-detail').addEventListener('change',event=>{reportDetail=event.target.value==='detailed'?'detailed':'compact';updatePrint();});
$('#csv-button').addEventListener('click',()=>requestSupportedExport('csv'));$('#json-button').addEventListener('click',()=>requestSupportedExport('json'));
$('#print-button').addEventListener('click',()=>requestSupportedExport('print'));window.addEventListener('beforeprint',preparePrint);window.addEventListener('afterprint',restorePrintTitle);
document.addEventListener('keydown',event=>{if(!event.defaultPrevented&&!$('.export-wrap').hidden&&(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='p'){event.preventDefault();requestSupportedExport('print');}});
$('#import-button').addEventListener('click',()=>{closeMenu();$('#import-file').click();});
$('#import-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{
  if(file.size>200000)throw new Error('Die JSON-Datei ist zu groß (maximal 200 KB).');
  const data=JSON.parse(await file.text());
  if(data.schema==='grenzgehalt/payroll/1'){
    if(data.year!==2026||data.country!=='li')throw new Error('Die Lohnzetteldatei muss für Liechtenstein 2026 sein.');
    const current=rawState(),profiles=savedProfiles(),base={...current,...(current.foreignCountry==='li'?{}:profiles.li||profileFrom(defaults)),foreignCountry:'li'},safe=mergePayrollInputs({...base,calculatorCountry:'li'},data.inputs),candidate=readInputs(safe);
    calculateScenario(candidate);countryProfiles=profiles;applyState(safe);previousCountry='li';example=false;changeView('calculator');toast('Lohnzetteldaten übernommen. Versicherung, Kosten, Österreich und Wechselkurs bleiben erhalten.');return;
  }
  if(data.schema!=='grenzgehalt/4'||data.year!==2026)throw new Error('Bitte eine Grenzgehalt-4-Berechnung für 2026 wählen.');
  const legacy=data.model!==MODEL.version,safe=sanitizeState(data.inputs,{legacy});const profiles=restoreCountryProfiles(safe,data.countryProfiles);for(const country of data.view==='compare'?[safe.calculatorCountry,safe.comparisonCountry]:[safe.calculatorCountry]){const source=countryInputs(safe,profiles,country),tariff=country==='ch'?await ensureSwissTariff(source.chCanton):null;calculateCountry(safe,profiles,country,{swissData:tariff});}
  applySnapshot({...data,inputs:safe,countryProfiles:profiles});
  toast(legacy?'Ältere Berechnung geladen. Eingaben und Einheiten wurden übernommen; PK und LI-KK werden zwölfmal pro Jahr berücksichtigt.':'Berechnung geladen und neu berechnet.');
}catch(error){toast(error instanceof SyntaxError?'Die Datei ist kein gültiges JSON.':error.message);}finally{event.target.value='';}});
form.addEventListener('submit',event=>event.preventDefault());
form.addEventListener('input',event=>{if(['calculatorCountry','comparisonCountry'].includes(event.target.name)||event.target.dataset.inputOption||['remember','fx-auto'].includes(event.target.id))return;example=false;if(['foreignPeriod','atPeriod'].includes(event.target.name))convertSalaryPeriod(event.target.name);if(event.target.name==='contributionUnit')convertContributionUnit();if(event.target.name==='fx'){rateController.manualEdit();return;}update();});
form.addEventListener('change',event=>{if(['calculatorCountry','comparisonCountry'].includes(event.target.name))return;if(event.target.dataset.inputOption){toggleInputOption(event.target);return;}if(['remember','fx-auto'].includes(event.target.id))return;example=false;if(['foreignPeriod','atPeriod'].includes(event.target.name))convertSalaryPeriod(event.target.name);if(event.target.name==='contributionUnit')convertContributionUnit();update();});
$('#remember').addEventListener('change',event=>{try{if(event.target.checked){update();persist();toast('Angaben werden auf diesem Gerät gespeichert.');}else{localStorage.removeItem(storageKey);toast('Gespeicherte Angaben wurden entfernt.');}}catch{event.target.checked=false;toast('Lokale Speicherung wird nicht unterstützt.');}});
$('#example-button').addEventListener('click',exampleState);
$('#clear-button').addEventListener('click',()=>{const country=rawState().foreignCountry,calculatorCountry=rawState().calculatorCountry;applyState({...defaults,calculatorCountry,foreignCountry:country,liAnnual:'',liBonus:'0',atGross:'0'});countryProfiles={};previousCountry=country;example=false;try{localStorage.removeItem(storageKey);}catch{}$('#remember').checked=false;rateController.restore({source:'example',automatic:true});restoreInputOptions();update();void rateController.setAutomatic(true);$(atPrimary()?'#at-gross':'#li-annual').focus();toast('Angaben zurückgesetzt.');});
const textSizeKey='grenzgehalt.textSize';
function setTextSize(value){
 const size=['100','115','130','150'].includes(value)?value:'100';
 document.documentElement.dataset.textSize=size;$('#text-size').value=size;
}
try{setTextSize(localStorage.getItem(textSizeKey));}catch{setTextSize('100');}
$('#text-size').addEventListener('change',event=>{setTextSize(event.target.value);try{localStorage.setItem(textSizeKey,$('#text-size').value);}catch{}});
window.addEventListener('storage',event=>{if(event.key===textSizeKey)setTextSize(event.newValue);});
function setTheme(theme){document.documentElement.dataset.theme=theme;$('#theme-toggle').setAttribute('aria-label',theme==='dark'?'Helles Farbschema aktivieren':'Dunkles Farbschema aktivieren');}
try{setTheme(localStorage.getItem('grenzgehalt.theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));}catch{setTheme('light');}
$('#theme-toggle').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';setTheme(theme);try{localStorage.setItem('grenzgehalt.theme',theme);}catch{}});
$('#sources-list').innerHTML=SOURCES.map(s=>`<a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><div><h3>${esc(s.title)}</h3><p>${esc(s.detail)}</p></div><span aria-hidden="true">↗</span></a>`).join('');
$('#ch-canton').innerHTML=Object.entries(CANTONS).map(([code,name])=>`<option value="${code}">${esc(name)} · ${code}</option>`).join('');
$$('input[name=calculatorCountry]').forEach(el=>el.addEventListener('change',()=>{
 saveEditor();const pair=switchPrimary(previousCalculatorCountry,rawState().comparisonCountry,rawState().calculatorCountry);form.elements.comparisonCountry.value=pair.comparison;previousCalculatorCountry=pair.primary;switchEditor(editorCountry());example=false;update();
}));
$$('input[name=comparisonCountry]').forEach(el=>el.addEventListener('change',()=>{saveEditor();switchEditor(editorCountry());example=false;update();}));

let savedFx=null;applyState(defaults);
try{const saved=localStorage.getItem(storageKey);if(saved){const data=JSON.parse(saved);if(data.schema==='grenzgehalt/4'&&data.year===2026){const legacy=data.model!==MODEL.version;comparisonPeriod=['monthly','annual'].includes(data.comparisonPeriod)?data.comparisonPeriod:'monthly';selectedPayMonth=Number.isInteger(data.selectedPayMonth)&&data.selectedPayMonth>=0&&data.selectedPayMonth<12?data.selectedPayMonth:0;resultCurrency=data.resultCurrency==='CHF'?'CHF':'EUR';threeWay=data.threeWay===true;sameGross=data.sameGross===true;applyState(sanitizeState(data.inputs,{legacy}));countryProfiles=restoreCountryProfiles(rawState(),data.countryProfiles);previousCountry=rawState().foreignCountry;example=data.example===true;savedFx=data.exchangeRate||{source:'manual',automatic:false};$('#remember').checked=true;if(legacy)toast('Gespeicherte Eingaben geladen. PK und LI-KK werden zwölfmal pro Jahr berücksichtigt.');}}}catch{toast('Gespeicherte Angaben konnten nicht geladen werden. Die Beispielwerte sind aktiv.');}
if(savedFx)rateController.restore(savedFx);
renderFxStatus(rateController.state);fxReady=true;
function openHash(){
 try{
  const snapshot=readShareHash(location.hash);
  if(snapshot){
   if(shareDialog.open)shareDialog.close();
   $('#remember').checked=false;
   applySnapshot(snapshot);
   toast('Geteilte Rechnung geladen.');
  }else changeView(location.hash.slice(1)||'calculator');
 }catch{
  changeView('calculator');
  toast('Der Rechenlink konnte nicht geladen werden.');
 }
}
openHash();
window.addEventListener('hashchange',openHash);
if(rateController.state.automatic)void rateController.refresh();
$('#fx-refresh').addEventListener('click',()=>{void rateController.refresh({force:true});});
$('#fx-auto').addEventListener('change',event=>{void rateController.setAutomatic(event.target.checked);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&rateController.state.automatic)void rateController.refresh();});
window.addEventListener('online',()=>{if(rateController.state.automatic)void rateController.refresh();});
