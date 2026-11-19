import test from 'node:test';
import assert from 'node:assert/strict';
import { taxForYear } from '../dist/assets/tax-data.mjs';
import { calculateAT, tariff, credits, round } from '../dist/assets/calculator.mjs';
import { defaults, readInputs, calculateScenario, readSnapshotInputs, sanitizeState, profileFrom } from '../dist/assets/scenario.mjs';
import { calculateCountry } from '../dist/assets/country-workspace.mjs';
import { buildReport, renderReport, reportCsv } from '../dist/assets/reporting.mjs';
import { estimatedSwissPension } from '../dist/assets/planning.mjs';
import { shareHash, readShareHash } from '../dist/assets/share.mjs';
import { decodeSwissTariff, swissAnnualSource } from '../dist/assets/swiss.mjs';
import sg from '../dist/assets/ch-tariffs-sg.mjs';

const swissData=await decodeSwissTariff(sg);
const job=(country,extra={})=>{
  const raw={...defaults,taxYear:'2027',calculatorCountry:country,foreignCountry:country==='at'?'li':country,...extra};
  return calculateCountry(raw,{[raw.foreignCountry]:profileFrom(raw)},country,{swissData});
};
const atInputs=extra=>readInputs({...defaults,taxYear:'2027',atGross:'7500',...extra},{scope:'at'}).at;

// Independently evaluated from BGBl. II 260/2026 and ÖGK's provisional 2027 limits.
test('2027 Österreich 7500 × 14: nachgerechnete Monats-, Sonder- und Jahressummen',()=>{
  const a=calculateAT(atInputs());
  assert.equal(a.monthlySV,1338.99);
  assert.equal(a.monthlyTax,1701.04);
  assert.equal(a.monthlyNet,4459.97);
  assert.deepEqual(a.specials,[
    {gross:7500,sv:1280.25,tax:335.99,net:5883.76},
    {gross:7500,sv:1249.52,tax:375.02,net:5875.46},
  ]);
  assert.equal(a.social,18597.65);
  assert.equal(a.tax,21123.49);
  assert.equal(a.net,65278.86);
});

test('2027 Tarifgrenzen und Absetzbeträge folgen der Kundmachung',()=>{
  assert.equal(tariff(13846,2027),0);
  assert.equal(round(tariff(22491,2027)),1729);
  assert.equal(round(tariff(37285,2027)),6167.2);
  assert.equal(round(tariff(71960,2027)),20037.2);
  const c=credits({year:2027,childrenYoung:3,familyShare:.75,avab:true});
  assert.deepEqual({...c,family:round(c.family)},{family:4500.36,avab:1127,traffic:508});
});

for(const [gross,existing,newSV] of [[2000,312.4,322.4],[2400,398.88,410.88],[2600,458.12,469.82],[3000,542.1,542.1]]){
  test(`ALV 2027: Eintrittsdatum bei ${gross} EUR wirkt auf laufende SV und Sonderzahlungen`,()=>{
    const old=calculateAT(atInputs({atGross:String(gross),atEmployment:'existing'}));
    const fresh=calculateAT(atInputs({atGross:String(gross),atEmployment:'new'}));
    assert.equal(old.monthlySV,existing);
    assert.equal(fresh.monthlySV,newSV);
    assert.equal(round(old.monthlySV-old.specials[0].sv),round(gross*.01));
    assert.equal(round(fresh.monthlySV-fresh.specials[0].sv),round(gross*.01));
  });
}

test('2027 AT-Sonderzahlungen beachten Freigrenze und 30-Prozent-Grenze',()=>{
  assert.deepEqual(calculateAT(atInputs({atGross:'1300'})).specials.map(s=>s.tax),[0,0]);
  const a=calculateAT(atInputs({atGross:'1450'}));
  // Netto-Sonderzahlungen zusammen 2461,52 EUR liegen unter der Grenze 2547 EUR.
  assert.deepEqual(a.specials.map(s=>s.tax),[0,0]);
});

test('2027 LI verwendet zwölf Arbeitgeber-KK-Beiträge von 184 CHF und behält CHF-Abrechnung',()=>{
  const a=job('li',{foreignPeriod:'monthly',liAnnual:'8346,95',liPayments:'14',liExact:true,exactPension:'626,80',pensionPeriod:'monthly',exactNbu:'1,083',exactKtg:'0,88',healthType:'private',privateMonthly:'660',liCosts:'280',fx:'1,1'});
  assert.equal(a.inputs.li.year,2027);
  assert.equal(a.result.subsidyCHF,2208);
  assert.equal(a.plan.regular.subsidyCHF,184);
  assert.equal(a.plan.regular.contributions.pension,626.8);
  assert.ok(a.plan.extras.every(e=>e.subsidyCHF===0&&e.contributions.pension===0));
  assert.equal(a.plan.regular.sourceCHF,333.88);
  assert.equal(a.plan.regular.payout,round(a.plan.regular.payoutCHF*1.1));
});

test('2027 Schweizer BVG verwendet die neuen Grenzwerte',()=>{
  assert.equal(estimatedSwissPension(23040,'ch35',2027),0);
  assert.equal(estimatedSwissPension(24000,'ch35',2027),192);
  assert.equal(estimatedSwissPension(100000,'ch35',2027),3264);
  assert.equal(estimatedSwissPension(100000,'ch35',2026),3213);
});

test('Schweizer Vorschau weist das abweichende Tarifjahr aus und verwirft falsche Dateien',()=>{
  const a=job('ch');
  assert.equal(a.inputs.sourceQuote.year,2026);
  assert.equal(a.inputs.sourceQuote.calculationYear,2027);
  assert.equal(a.inputs.sourceQuote.provisional,true);
  assert.ok(a.inputs.notes.some(note=>note.includes('Kantonstarif 2026')));
  assert.throws(()=>swissAnnualSource({year:2027},{...swissData,year:2025}),/Tarif|Quellensteuer/);
});

test('Eigene 2027-Beiträge entfernen nur die tatsächlich ersetzten Übergangshinweise',()=>{
  const a=job('ch',{liExact:true,exactSource:'5000',exactHealth:'590'});
  assert.equal(a.inputs.li.sourceAnnual,5000);
  assert.equal(a.inputs.li.health,590);
  assert.ok(!a.inputs.notes.some(n=>/Kantonstarif 2026|ÖGK-Selbstversicherung/.test(n)));
  assert.ok(a.inputs.notes.some(n=>n.includes('Vorschau 2027')));
});

test('2027: LI-OKP-Erwachsenenrichtwert und halbierter KK-Beitrag bei Teilzeit',()=>{
  const a=job('li',{healthType:'local',liWorkload:'50',fx:'1'});
  assert.equal(a.inputs.li.health,394.51);
  assert.equal(a.inputs.li.healthSubsidy,92);
});

for(const country of ['at','li','ch'])test(`2027 ${country}: zwölf Monate plus Sonderzahlungen und Abgleich ergeben das Jahresbudget`,()=>{
  const a=job(country,{liPayments:'14',liBonus:'1234,56'});
  const total=a.timeline.months.reduce((s,m)=>s+m.available,0)+a.timeline.unassigned.reduce((s,m)=>s+m.available,0)+(a.timeline.adjustment?.available||0);
  assert.equal(round(total),a.plan.annual.available);
});

test('Druck und beide CSV-Umfänge kennzeichnen 2027 und verwendete Vorjahreswerte',()=>{
  const report=buildReport([job('li'),job('ch')]);
  assert.equal(report.year,2027);
  assert.equal(report.preview,true);
  for(const detailed of [false,true])for(const text of [renderReport(report,{detailed}),reportCsv(report,{detailed})]){
    assert.match(text,/2027/);
    assert.match(text,/Vorschau/);
    assert.match(text,/Kantonstarif 2026/);
    assert.match(text,/ÖGK-Selbstversicherung/);
  }
  assert.throws(()=>buildReport([job('li'),job('at',{taxYear:'2026'})]),/Steuerjahr/);
});

test('Alte JSON-Dateien ohne Eingabejahr bleiben 2026, auch nach einer 2027-Rechnung',()=>{
  const {taxYear,atEmployment,...oldInputs}=defaults;
  const historical={schema:'grenzgehalt/4',year:2026,model:'2026.12',inputs:oldInputs};
  const before=calculateScenario(readInputs(readSnapshotInputs(historical)));
  job('at');job('li');job('ch');
  const after=calculateScenario(readInputs(readSnapshotInputs(historical)));
  assert.deepEqual(after,before);
  assert.equal(after.li.year,2026);
  assert.equal(after.at.year,2026);
  assert.equal(after.li.subsidyCHF,2166);
  assert.equal(sanitizeState(oldInputs).taxYear,'2026');
});

test('2027 JSON und Rechenlink übernehmen Jahr und ALV-Status, widersprüchliche Jahre werden verworfen',()=>{
  const snapshot={schema:'grenzgehalt/4',year:2027,inputs:{...defaults,taxYear:'2027',atEmployment:'existing'}};
  const restored=readSnapshotInputs(readShareHash(shareHash(snapshot)));
  assert.equal(restored.taxYear,'2027');
  assert.equal(restored.atEmployment,'existing');
  assert.throws(()=>readSnapshotInputs({...snapshot,year:2026}),/stimmen nicht überein/);
  assert.throws(()=>readSnapshotInputs({...snapshot,year:2028}));
});

test('2026 unterstützt keine 75/25-Aufteilung, 2027 erhält den gewählten Anteil',()=>{
  assert.throws(()=>readInputs({...defaults,familyShare:'0.75'}),/2027/);
  assert.equal(readInputs({...defaults,taxYear:'2027',familyShare:'0.25',childrenYoung:'1'}).li.familyShare,.25);
});

test('Unbekannte Jahre und fehlender 2027-ALV-Status werden nicht still ersetzt',()=>{
  assert.throws(()=>taxForYear(2028));
  assert.throws(()=>taxForYear('2027'));
  assert.throws(()=>readInputs({...defaults,taxYear:'2028'}));
  assert.throws(()=>calculateAT({...atInputs(),employment:undefined}),/Dienstverhältnis/);
  assert.throws(()=>calculateAT({...atInputs(),year:undefined}),/Steuerjahr/);
});
