import { WORK_COUNTRIES } from './country-workspace.mjs?v=4.23.0';
import { annualBudgetParts,selectedPayment } from './payment-plan.mjs?v=4.23.0';
import { round } from './calculator.mjs?v=4.23.0';

const nf=new Intl.NumberFormat('de-AT',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>nf.format(n)+' €';
const present=n=>Math.abs(n||0)>=.005;
const row=(label,value)=>({label,value:round(value)});
function calendarGroups(months,order){
 const groups=new Map();
 for(const m of months){
  const key=JSON.stringify(order.map(c=>[m.values[c],m.counts[c]]));
  if(!groups.has(key))groups.set(key,{months:[],values:{...m.values},counts:{...m.counts},difference:m.difference});
  groups.get(key).months.push(m);
 }
 return [...groups.values()].map(g=>{const runs=[];for(const month of g.months){const previous=runs.at(-1);if(previous&&month.month===previous.at(-1).month+1)previous.push(month);else runs.push([month]);}return {...g,label:runs.map(r=>r.length===1?r[0].short:r[0].short+'–'+r.at(-1).short).join(', '),monthCount:g.months.length};});
}
function countryReport(job){
 const {country,inputs,plan,timeline}=job,meta=WORK_COUNTRIES[country],at=country==='at',period=at?inputs.raw.atPeriod:inputs.raw.foreignPeriod,v=selectedPayment(plan,period),periodLabel=period==='annual'?'Jahr gesamt':'Normaler Monat';
 const noAT=job.result?.resident||job.result?.publicLI;
 const health=job.result?.resident||inputs.raw.healthType==='local'?(country==='ch'?'Schweizer KVG-Grundversicherung':'Liechtensteinische OKP'):inputs.raw.healthType==='private'?'Private Grundversicherung':'ÖGK-Selbstversicherung';
 const native=at?[row('Bruttogehalt',v.salaryGross),row('Sozialversicherung',-v.social),row('Lohnsteuer',-v.tax),row('Arbeitgeberauszahlung',v.payout)]:[row('Bruttogehalt',v.grossCHF),...(country==='li'?[row('Arbeitgeber-KK-Beitrag',v.subsidyCHF)]:[]),row('Sozialversicherung & PK',-v.socialCHF),row(job.result?.publicLI?'LI-Steuer · Art. 19':'Quellensteuer',-v.sourceCHF),row('Arbeitgeberauszahlung',v.payoutCHF)];
 const budget=[row('Arbeitgeberauszahlung in EUR',v.payout),...(!at?[row(health,-v.health),...(!noAT?[row('AT-Steuerrücklage',-v.reserve)]:[]),...(present(v.localTax)?[row('Schweizer Steuerrücklage',-v.localTax)]:[])]:[]),...(present(v.supplement)?[row('Private Zusatzversicherung',-v.supplement)]:[]),...(present(v.extraCosts)?[row('Eigene laufende Kosten',-v.extraCosts)]:[]),...(present(v.familyCash)?[row('Familienzulage / Differenzausgleich',v.familyCash)]:[]),...(present(v.parking)?[row('Parkplatzkosten',-v.parking)]:[]),...(present(v.assessmentRelief)?[row('Geschätzte Entlastung aus Veranlagung',v.assessmentRelief)]:[]),row('Verfügbares Budget',v.available)];
 const tax=at?[row('Laufende Bemessungsgrundlage',v.taxable),row('Laufende Lohnsteuer',v.regularTax),row('Steuer auf Sonderzahlungen',v.specialTax)]:noAT?[row(job.result.resident?'Schweizer Steuer in EUR':'Liechtensteiner Steuer in EUR',v.tax)]:[row('Bemessungsgrundlage',v.taxable),row('Steuer laufend',v.regularTax),row('Steuer auf Sonderzahlungen',v.specialTax),row('Anrechnung Quellensteuer',-v.sourceCredit),row('Verbleibende AT-Rücklage',v.reserve)];
 const c=v.contributions,contributions=at?[]:[row(country==='ch'?'AHV / IV / EO':'AHV / IV',c.ahv+c.iv+(c.eo||0)),...(country==='li'?[row('FAK · Arbeitnehmer',c.fak)]:[]),row('ALV',c.alv),...(country==='ch'?[row('Kantonale Beiträge',c.regional),row('Weitere Pflichtabgaben',c.other)]:[]),row('NBU',c.nbu),row('KTG',c.ktg),row('PK · Arbeitnehmer',c.pension)];
 const basis=[{label:'Vertragsbrutto / Jahr',value:nf.format(at?plan.annual.salaryGross:(inputs.li.contractAnnual??inputs.li.annual))+' '+meta.currency},{label:'Gehaltszahlungen / Jahr',value:String(timeline.payments)},{label:'Krankenversicherung',value:at?'ÖGK in Sozialversicherung':health},...(country==='ch'?[{label:job.result?.resident?'Wohnkanton / Tarif':'Arbeitskanton / Tarif',value:inputs.raw.chCanton+' / '+(inputs.sourceQuote?.code||inputs.raw.chTariff)}]:[])];
 return {country,...meta,period,periodLabel,regular:plan.regular.available,annual:plan.annual.available,parts:annualBudgetParts(plan),extras:plan.extras.map(r=>({id:r.id,label:r.label,available:r.available,gross:at?r.salaryGross:r.grossCHF,social:at?r.social:r.socialCHF,tax:at?r.tax:r.sourceCHF,reserve:r.reserve,payout:r.payout})),native,budget,tax,contributions,basis,fx:at?null:inputs.li.fx};
}
// Presentation consumes completed budgets and native ledgers; no tax calculation
// or currency conversion is performed here.
export function buildReport(jobs,{period='monthly',date='',example=false,fxNote=''}={}){
 if(!Array.isArray(jobs)||jobs.length<1||jobs.length>3||new Set(jobs.map(j=>j.country)).size!==jobs.length||!['monthly','annual'].includes(period))throw new Error('Ungültige Berichtsauswahl.');
 for(const j of jobs)if(!WORK_COUNTRIES[j.country]||j.pending||j.timeline?.months?.length!==12||!Number.isFinite(j.plan?.regular?.available)||!Number.isFinite(j.plan?.annual?.available))throw new Error('Bericht benötigt vollständige Berechnungen.');
 const countries=jobs.map(countryReport),order=countries.map(c=>c.country),values=read=>Object.fromEntries(jobs.map(j=>[j.country,round(read(j))])),withDiff=r=>({...r,difference:jobs.length===2?round(r.values[order[0]]-r.values[order[1]]):null});
 const extras=new Map();for(const c of countries)for(const p of c.parts.filter(r=>r.id!=='regular-year'))if(!extras.has(p.id))extras.set(p.id,p.label);
 const rank=id=>({'13':0,'14':1,bonus:2,settlement:3}[id]??2);
 const positions=[...extras].sort((a,b)=>rank(a[0])-rank(b[0])).map(([id,label])=>withDiff({id,label,unit:'EUR / Jahr',values:values(j=>j.plan.extras.find(e=>e.id===id)?.available??(id==='settlement'?j.plan.settlement?.available||0:0))}));
 const regular=withDiff({id:'regular',label:'Normaler Monat · 12 × im Jahr',unit:'EUR / Monat',values:values(j=>j.plan.regular.available)}),annual=withDiff({id:'annual',label:'Verfügbar im Jahr',unit:'EUR / Jahr',values:values(j=>j.plan.annual.available),total:true});
 const annualRows=[withDiff({id:'regular-year',label:'12 reguläre Monatsbudgets',unit:'EUR / Jahr',values:values(j=>round(j.plan.regular.available*12))}),...positions,annual];
 const months=jobs[0].timeline.months.map((m,i)=>withDiff({month:i,label:m.name,short:m.short,values:values(j=>j.timeline.months[i].available),counts:Object.fromEntries(jobs.map(j=>[j.country,j.timeline.months[i].salaryCount]))}));
 const separate=new Map();for(const j of jobs)for(const r of [...j.timeline.unassigned,...(present(j.timeline.adjustment?.available)?[{...j.timeline.adjustment,id:'adjustment'}]:[])]){
  const id=r.id==='adjustment'?'calendar-adjustment':'extra:'+r.id,entry=separate.get(id)||{id,label:r.id==='adjustment'?'Kalender-Jahresabgleich':r.label+' · ohne Monatszuordnung',values:Object.fromEntries(order.map(c=>[c,0]))};entry.values[j.country]=round(entry.values[j.country]+r.available);separate.set(id,entry);
 }
 return {year:2026,date,example,period,currency:'EUR',order,countries,overview:[regular,...positions,annual],annualRows,months,groups:calendarGroups(months,order),calendarSeparate:[...separate.values()].map(withDiff),fxNote,title:jobs.length>1?'Gehaltsvergleich':'Gehaltsübersicht'};
}
export function renderOverviewTable(report,{annualParts=false}={}){
 const rows=annualParts?report.annualRows:report.overview;
 return `<table class="report-table"><thead><tr><th>Verfügbares Budget</th>${report.countries.map(c=>`<th>${esc(c.name)}<small>EUR</small></th>`).join('')}${report.order.length===2?`<th>Differenz<small>${report.countries[0].code} − ${report.countries[1].code}</small></th>`:''}</tr></thead><tbody>${rows.map(r=>`<tr class="${r.total?'report-total':r.id==='regular'?'report-primary':''}"><th scope="row">${esc(r.id==='regular'?'Normaler Monat':r.label)}${r.id==='regular'?'<small>12 × pro Jahr</small>':''}</th>${report.order.map(c=>`<td>${money(r.values[c])}</td>`).join('')}${r.difference!==null?`<td>${money(r.difference)}</td>`:''}</tr>`).join('')}</tbody></table>`;
}
function calendarTable(report,detailed=false){
 const rows=detailed?[...report.months,...report.calendarSeparate]:report.groups;
 return `<table class="report-table report-calendar"><thead><tr><th>${detailed?'Auszahlungsmonat / Position':'Auszahlungsmonate'}</th>${report.countries.map(c=>`<th>${esc(c.name)}<small>${detailed?'EUR':'EUR je Monat'}</small></th>`).join('')}${report.order.length===2?`<th>Differenz<small>${detailed?'EUR':'EUR je Monat'}</small></th>`:''}</tr></thead><tbody>${rows.map(r=>`<tr><th scope="row">${esc(r.label)}</th>${report.order.map(c=>`<td>${money(r.values[c])}</td>`).join('')}${r.difference!==null?`<td>${money(r.difference)}</td>`:''}</tr>`).join('')}</tbody></table>`;
}
export function renderLedgerTable(rows,currency,{totalLast=false,explain}={}){
 const body=rows.map((r,i)=>{
  const note=explain?.(r.label);
  const hint=note?`<details class="formula-hint">
   <summary aria-label="Rechenhinweis zu ${esc(r.label)}">
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
     <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.4"/>
     <circle cx="10" cy="6.3" r="1" fill="currentColor"/>
     <path d="M10 9.5v4.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
   </summary><p>${esc(note)}</p>
  </details>`:'';
  return `<tr class="${totalLast&&i===rows.length-1?'report-total':''}"><th scope="row">${esc(r.label)}${hint}</th><td>${nf.format(r.value)} ${esc(currency)}</td></tr>`;
 });
 return `<table class="report-table"><thead><tr><th>Position</th><th>${esc(currency)}</th></tr></thead><tbody>${body.join('')}</tbody></table>`;
}
export function renderReport(report,{detailed=false,version=''}={}){
 const label=report.countries.map(c=>c.name).join(' / '),basisLabels=[...new Set(report.countries.flatMap(c=>c.basis.map(r=>r.label)))];
 const basis=`<table class="report-table report-basis"><thead><tr><th>Eingabebasis</th>${report.countries.map(c=>`<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${basisLabels.map(label=>`<tr><th scope="row">${esc(label)}</th>${report.countries.map(c=>`<td>${esc(c.basis.find(r=>r.label===label)?.value||'—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
 const note='Nach modellierten Abgaben, Versicherung und eigenen Kosten. Monatsbudget ohne anteilige Sonderzahlungen; Jahresbudget = zwölf Monatsbudgets + zusätzliche Bezüge + Abgleich.';
 const compact=`<section class="report-overview"><header class="report-header"><div><p class="report-brand">grenzgehalt.</p><h1>${report.title}</h1><p class="report-subtitle">${esc(label)} · Steuerjahr ${report.year}</p></div><p class="report-date">${esc(report.date)}<br>${detailed?'Mit Rechenwegen':'Kompakte Übersicht'}</p></header>${report.example?'<p class="report-example">Fiktive Beispielwerte</p>':''}<h2>Was bleibt dir?</h2>${renderOverviewTable(report)}<p class="report-note">${note}</p><h2>Zahltage auf einen Blick</h2>${calendarTable(report)}<p class="report-note">Beträge je angeführtem Monat, gleiche Zahltage zusammengefasst. Zusätzlicher Bezug Ende Juni/November bei 14 bzw. Ende November bei 13 Gehältern. Budgetplanung: Juni → Juli, November → Dezember. Bonus und Jahresabgleich separat.</p>${basis}${report.countries.some(c=>c.fx)?`<p class="report-note">Planungskurs: 1 CHF = ${report.countries.find(c=>c.fx).fx.toLocaleString('de-AT',{maximumFractionDigits:8})} EUR. ${esc(report.fxNote)} CHF-Abrechnung vor der Umrechnung; Tageskurs ist kein steuerlicher Jahresdurchschnitt.</p>`:''}<footer class="report-footer">Unverbindliche Näherung · grenzgehalt.amgnet.at · ${esc(version)}</footer></section>`;
 if(!detailed)return `<article class="budget-report">${compact}</article>`;
 const calendar=`<section class="report-page"><h2>Zahltage im Detail</h2><p class="report-subtitle">${esc(label)} · Auszahlungsmonate · EUR</p>${calendarTable(report,true)}<p class="report-note">Die Monatsbudgets und separaten Positionen ergeben zusammen das Jahresbudget. Der Jahresabgleich kann durch gemeinsame CHF-Umrechnung um Centbeträge von der Aufteilung einzelner Bezugsteile abweichen.</p></section>`;
 const detail=report.countries.map(c=>`<section class="report-page report-country"><header><p class="report-brand">${c.code} / ${c.currency}</p><h2>${esc(c.name)} · Rechenweg</h2><p class="report-subtitle">${esc(c.periodLabel)}</p></header><div class="report-ledger-pair"><section><h3>1. Arbeitgeberabrechnung · ${c.currency}</h3>${renderLedgerTable(c.native,c.currency,{totalLast:true})}</section><section><h3>2. Verfügbares Budget · EUR</h3>${renderLedgerTable(c.budget,'EUR',{totalLast:true})}</section></div>${c.fx?`<p class="report-note">Fertige CHF-Auszahlung × ${c.fx.toLocaleString('de-AT',{maximumFractionDigits:8})} = Auszahlung in EUR. Österreichische Rücklage und EUR-Kosten folgen danach.</p>`:''}<div class="report-ledger-pair"><section><h3>Steuerberechnung · EUR</h3>${renderLedgerTable(c.tax,'EUR')}</section>${c.contributions.length?`<section><h3>Lohnabzüge · ${c.currency}</h3>${renderLedgerTable(c.contributions,c.currency)}</section>`:''}</div>${c.extras.length?`<h3>Zusätzliche Gehälter · einmal pro Jahr</h3><table class="report-table"><thead><tr><th>Bezug</th><th>Brutto ${c.currency}</th><th>SV ${c.currency}</th><th>Steuer ${c.currency}</th><th>Verfügbar EUR</th></tr></thead><tbody>${c.extras.map(r=>`<tr><th scope="row">${esc(r.label)}</th><td>${nf.format(r.gross)}</td><td>${nf.format(r.social)}</td><td>${nf.format(r.tax)}</td><td>${money(r.available)}</td></tr>`).join('')}</tbody></table>`:''}<p class="report-note">${c.country==='at'?'ÖGK ist in der Sozialversicherung enthalten; 14 Gehälter.':'PK und monatliche Krankenversicherung zählen zwölfmal; zusätzliche Gehälter werden separat berücksichtigt.'} Abgaben und Steuerplanung sind modelliert. Voraussetzungen, Grenzen und amtliche Quellen: grenzgehalt.amgnet.at/#method.</p></section>`).join('');
 return `<article class="budget-report">${compact}${calendar}${detail}</article>`;
}
const csvCell=value=>{const v=typeof value==='number'?String(round(value)).replace('.',','):String(value??'');return '"'+v.replaceAll('"','""')+'"';};
export function reportCsvRows(report,{detailed=false}={}){
 if(detailed){
  const rows=[['Bereich','Land','Position','Zeitraum','Währung','Betrag']];
  for(const c of report.countries){
   for(const r of report.overview)rows.push(['Übersicht',c.name,r.label,r.unit==='EUR / Monat'?'Normaler Monat':'Jahr','EUR',r.values[c.country]]);
   for(const [label,ledger,currency] of [['Arbeitgeberabrechnung',c.native,c.currency],['Budget',c.budget,'EUR'],['Steuerberechnung',c.tax,'EUR'],['Lohnabzüge',c.contributions,c.currency]])for(const r of ledger)rows.push([label,c.name,r.label,c.periodLabel,currency,r.value]);
   for(const m of [...report.months,...report.calendarSeparate])rows.push(['Zahltage',c.name,m.label,'Auszahlungsmonat / separat','EUR',m.values[c.country]]);
  }
  if(report.order.length===2)for(const r of report.overview)rows.push(['Vergleich',report.countries.map(c=>c.code).join(' − '),r.label,r.unit==='EUR / Monat'?'Normaler Monat':'Jahr','EUR',r.difference]);
  return rows;
 }
 return [[report.title,'Steuerjahr',report.year],['Stand',report.date],['Verfügbares Budget nach Abgaben, Versicherung und eigenen Kosten'],[],['Position','Zeitraum',...report.countries.map(c=>c.name+' · EUR'),...(report.order.length===2?[report.countries.map(c=>c.code).join(' − ')+' · EUR']:[])],...report.overview.map(r=>[r.label,r.unit,...report.order.map(c=>r.values[c]),...(r.difference!==null?[r.difference]:[])]),[],['Zahltage · gleiche normale Monate zusammengefasst'],['Monate','Beträge gelten je Monat',...report.countries.map(c=>c.name+' · EUR'),...(report.order.length===2?['Differenz · EUR']:[])],...report.groups.map(r=>[r.label,'EUR / Monat',...report.order.map(c=>r.values[c]),...(r.difference!==null?[r.difference]:[])]),[],['Hinweis','Bonus und Jahres-/Rundungsabgleich sind separat in der Jahressumme enthalten. Planungswerte; normale Monate enthalten keine anteiligen Sonderzahlungen.']];
}
export function reportCsv(report,options){return '\uFEFF'+reportCsvRows(report,options).map(r=>r.map(csvCell).join(';')).join('\r\n');}
