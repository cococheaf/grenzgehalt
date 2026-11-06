import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults,profileFrom } from '../dist/assets/scenario.mjs';
import { calculateCountry } from '../dist/assets/country-workspace.mjs';
import { decodeSwissTariff } from '../dist/assets/swiss.mjs';
import sg from '../dist/assets/ch-tariffs-sg.mjs';
import { round } from '../dist/assets/calculator.mjs';
import { buildReport,renderReport,reportCsv,reportCsvRows } from '../dist/assets/reporting.mjs';

const swissData=await decodeSwissTariff(sg);
function job(country,extra={}){
 const raw={...defaults,foreignCountry:country==='at'?'li':country,foreignPeriod:'monthly',liAnnual:'7911,33',liPayments:'14',liBonus:'1900,27',liCosts:'280',fx:'1,0812',liExact:true,exactPension:'588,25',pensionPeriod:'monthly',exactNbu:'1,125',exactKtg:'0,79',exactSubsidy:'169,40',healthType:'private',privateMonthly:'660',atGross:'7500',atCosts:'120',...extra};
 const profiles={li:profileFrom(raw),ch:profileFrom(raw)};
 return calculateCountry(raw,profiles,country,{swissData});
}
function reconciles(report,jobs){
 for(const j of jobs){
  const key=j.country;
  assert.equal(report.countries.find(c=>c.country===key).regular,j.plan.regular.available);
  assert.equal(report.countries.find(c=>c.country===key).annual,j.plan.annual.available);
  assert.equal(round(report.annualRows.filter(r=>!r.total).reduce((s,r)=>s+r.values[key],0)),j.plan.annual.available,'annual parts');
  assert.equal(round([...report.months,...report.calendarSeparate].reduce((s,r)=>s+r.values[key],0)),j.plan.annual.available,'calendar total');
 }
 const covered=report.groups.flatMap(g=>g.months.map(m=>m.month)).sort((a,b)=>a-b);
 assert.deepEqual(covered,Array.from({length:12},(_,i)=>i));
 for(const g of report.groups)for(const m of g.months){assert.deepEqual(m.values,g.values);assert.deepEqual(m.counts,g.counts);}
 for(const m of report.months)for(const j of jobs){assert.equal(m.values[j.country],j.timeline.months[m.month].available);assert.equal(m.counts[j.country],j.timeline.months[m.month].salaryCount);}
 if(jobs.length===2)for(const r of [...report.overview,...report.months,...report.calendarSeparate])assert.equal(r.difference,round(r.values[jobs[0].country]-r.values[jobs[1].country]));
}
for(const primary of ['li','ch','at'])for(const comparison of [null,...['li','ch','at'].filter(c=>c!==primary)])test(`Bericht ${primary}/${comparison||'einzeln'} übernimmt fertige Budgets und saldiert`,()=>{
 const jobs=[job(primary),...(comparison?[job(comparison,{liPayments:'13'})]:[])],before=JSON.stringify(jobs),r=buildReport(jobs);
 reconciles(r,jobs);assert.equal(JSON.stringify(jobs),before);
 const compact=renderReport(r),detailed=renderReport(r,{detailed:true});
 assert.ok(compact.includes('Kompakte Übersicht'));assert.equal(compact.includes('Arbeitgeberabrechnung'),false);
 assert.ok(detailed.includes('Arbeitgeberabrechnung'));assert.ok(detailed.includes('Zahltage im Detail'));
 assert.equal((detailed.match(/class="report-page report-country"/g)||[]).length,jobs.length);
 for(const text of [compact,detailed,reportCsv(r),reportCsv(r,{detailed:true})])assert.doesNotMatch(text,/NaN|undefined|Infinity/);
});
for(const country of ['li','ch'])for(const payments of ['12','13','14'])test(`${country}/${payments}: exakte Zahltage statt Durchschnitte`,()=>{
 const j=job(country,{liPayments:payments}),r=buildReport([j]);reconciles(r,[j]);
 assert.equal(r.months.reduce((n,m)=>n+m.counts[country],0),Number(payments));
 assert.deepEqual(r.months.filter(m=>m.counts[country]===2).map(m=>m.month),payments==='14'?[5,10]:payments==='13'?[10]:[]);
 assert.ok(r.calendarSeparate.some(p=>p.id==='extra:bonus'));
});
test('Berichte halten CHF-Abrechnung und fertige EUR-Budgets getrennt',()=>{
 for(const country of ['li','ch']){
  const a=buildReport([job(country,{fx:'0,91'})]).countries[0],b=buildReport([job(country,{fx:'1,21'})]).countries[0];
  assert.deepEqual(a.native,b.native);assert.deepEqual(a.contributions,b.contributions);assert.notDeepEqual(a.budget,b.budget);
  assert.equal(a.currency,'CHF');assert.equal(a.native.at(-1).value,job(country,{fx:'0,91'}).plan.regular.payoutCHF);
 }
 const at=buildReport([job('at')]).countries[0];assert.equal(at.currency,'EUR');assert.equal(at.budget.at(-1).value,at.regular);
});
test('ÖGK, Zusatzprämien und Kosten werden klar getrennt und Jahrespositionen sinnvoll sortiert',()=>{
 const jobs=[job('li',{healthType:'oegk',supplementEnabled:true,supplement:'80'}),job('at',{atSupplementEnabled:true,atSupplement:'70'})],r=buildReport(jobs);reconciles(r,jobs);
 for(const c of r.countries){
  assert.equal(c.budget.find(p=>p.label==='Private Zusatzversicherung').value,c.country==='at'?-70:-80);
  assert.equal(c.budget.find(p=>p.label==='Eigene laufende Kosten').value,c.country==='at'?-120:-280);
 }
 assert.ok(r.countries[0].budget.some(p=>p.label==='ÖGK-Selbstversicherung'));
 assert.deepEqual(r.overview.filter(p=>['13','14','bonus','settlement'].includes(p.id)).map(p=>p.id),['13','14','bonus',...(r.overview.some(p=>p.id==='settlement')?['settlement']:[])]);
});
test('Jahresrechenwege verwenden die gewählte Jahresbasis und negative Budgets bleiben sichtbar',()=>{
 const j=job('li',{foreignPeriod:'annual',liAnnual:'100800,07',pensionPeriod:'annual',exactPension:'7059,00',liCosts:'20000'}),r=buildReport([j],{period:'annual'});reconciles(r,[j]);
 assert.equal(r.countries[0].periodLabel,'Jahr gesamt');assert.equal(r.countries[0].native[0].value,round(j.plan.annual.grossCHF));assert.ok(r.countries[0].annual<0);
});
test('CSV enthält klare Einheiten, vollständige Detailzeilen und korrekt maskierte Texte',()=>{
 const r=buildReport([job('at'),job('li')],{date:'5.11.2026'}),compact=reportCsvRows(r),detailed=reportCsvRows(r,{detailed:true});
 assert.ok(compact.some(row=>row.includes('Normaler Monat · 12 × im Jahr')));assert.equal(compact.some(row=>row[0]==='Arbeitgeberabrechnung'),false);
 assert.ok(detailed.every(row=>row.length===6));assert.ok(detailed.some(row=>row[0]==='Arbeitgeberabrechnung'&&row[1]==='Liechtenstein'&&row[4]==='CHF'));
 assert.ok(detailed.some(row=>row[0]==='Budget'&&row[1]==='Liechtenstein'&&row[4]==='EUR'));
 r.overview[1].label='A; "B" <script>';
 assert.ok(reportCsv(r).startsWith('\uFEFF'));assert.ok(reportCsv(r).includes('"A; ""B"" <script>"'));
 assert.ok(renderReport(r).includes('A; &quot;B&quot; &lt;script&gt;'));assert.equal(renderReport(r).includes('<script>'),false);
});
test('Unvollständige, doppelte und ungültige Berichtsauswahl wird zurückgewiesen',()=>{
 const j=job('at');for(const jobs of [[],[j,j],[j,j,j],[{...j,pending:true}],[{...j,timeline:{months:[]}}]])assert.throws(()=>buildReport(jobs));
 assert.throws(()=>buildReport([j],{period:'weekly'}));
});
