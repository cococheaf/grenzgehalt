import test from 'node:test';
import assert from 'node:assert/strict';
import { CANTONS, decodeSwissTariff, swissMonthlyTax, swissAnnualSource } from '../dist/assets/swiss.mjs';
import { defaults, readInputs, calculateScenario, sanitizeState, profileFrom, sanitizeProfiles } from '../dist/assets/scenario.mjs';

const data={};
for(const canton of Object.keys(CANTONS)){
  const packed=(await import(`../dist/assets/ch-tariffs-${canton.toLowerCase()}.mjs`)).default;
  data[canton]=await decodeSwissTariff(packed);
}
const input=(extra={})=>{const raw={...defaults,foreignCountry:'ch',fx:'1,0500',...extra};return readInputs(raw,{swissData:data[raw.chCanton]});};

for(const canton of Object.keys(CANTONS))test(`Amtliche Tarifdatei ${canton}: Jahr, Kanton und Standardtarif verfügbar`,()=>{
  assert.equal(data[canton].year,2026);assert.equal(data[canton].canton,canton);
  const q=swissMonthlyTax(6500,canton,'A0N',data[canton]);
  assert.ok(q.tax>=0&&q.tax<6500);assert.ok(q.rate>=0&&q.rate<1);
});
// Independently read from ESTV's original fixed-width 2026 records (record type 06).
for(const [canton,code,income,percent,minimum]of [
 ['SG','A0N',6500,10.59,5],['ZH','A0N',7500,8.24,0],['GE','B2N',7500,0,0],
 ['VS','A0N',6500,9.88,0],['VD','C1N',8000,11.66,0],['GR','B0Y',6000,3.75,0],
])test(`ESTV-Referenz ${canton} ${code} bei ${income} CHF`,()=>{
  const q=swissMonthlyTax(income,canton,code,data[canton]);
  assert.ok(Math.abs(q.rate-percent/100)<1e-12);assert.equal(q.minimum,minimum);
  assert.ok(Math.abs(q.tax-Math.max(income*percent/100,minimum))<.011);
});
test('SG berücksichtigt den Mindestbetrag von fünf CHF',()=>assert.equal(swissMonthlyTax(1,'SG','A0N',data.SG).tax,5));
test('Kirchenvariante fällt nur bei fehlender separater Tabelle auf den kantonalen Tarif zurück',()=>{
  const source={year:2026,canton:'ZH',tables:{A0N:[[0,824,0]]}};
  assert.equal(swissMonthlyTax(7500,'ZH','A0Y',source).code,'A0N');
  assert.throws(()=>swissMonthlyTax(7500,'ZH','B0N',source));
});
test('Tarifsuche lehnt falschen Kanton und Monatsbeträge oberhalb des Modellumfangs ab',()=>{
  assert.throws(()=>swissMonthlyTax(6500,'ZH','A0N',data.SG));
  assert.throws(()=>swissMonthlyTax(100001,'SG','A0N',data.SG));
});
test('Schweizer Monatsmodell unterscheidet 12 und 13 Bezüge bei gleichem Jahresbrutto',()=>{
  const a=calculateScenario(input({liPayments:'12'})).li,b=calculateScenario(input({liPayments:'13'})).li;
  assert.notEqual(a.sourceCHF,b.sourceCHF);assert.equal(a.grossCHF,b.grossCHF);
  assert.equal(input().sourceQuote.model,'monthly');
  assert.equal(input().sourceQuote.periods.reduce((n,p)=>n+p.count,0),12);
});
test('Jahresmodell Genf verwendet Jahreslohn samt Bonus geteilt durch zwölf',()=>{
  const a=input({chCanton:'GE',liPayments:'12',liBonus:'6000'}),b=input({chCanton:'GE',liPayments:'14',liBonus:'6000'});
  assert.equal(a.sourceQuote.model,'annual');assert.equal(a.li.sourceAnnual,b.li.sourceAnnual);
  assert.ok(Math.abs(a.li.sourceAnnual-swissMonthlyTax(8000,'GE','A0N',data.GE).tax*12)<.01);
});
test('Schweizer Tarif H erfordert Kinder; Familienbonus Österreich ist davon getrennt',()=>{
  assert.throws(()=>input({chTariff:'H',chChildren:'0'}));
  assert.ok(input({chTariff:'H',chChildren:'1'}).li.sourceAnnual>=0);
  assert.equal(input({chChildren:'2'}).at.childrenYoung,0);
});
test('Schweizer Arbeitnehmerabgaben enthalten EO und die eigenen ALV-Grenzen',()=>{
  const {li}=calculateScenario(input());
  assert.equal(li.kind,'ch');assert.equal(li.contributions.ahv,3915);assert.equal(li.contributions.iv,630);
  assert.equal(li.contributions.eo,225);assert.equal(li.contributions.alv,990);assert.equal(li.contributions.fak,0);
  assert.equal(li.contributions.regional,0);assert.equal(li.subsidyCHF,0);assert.notEqual(li.sourceCHF,3600);
  const high=calculateScenario(input({liAnnual:'250.000'})).li;
  assert.equal(high.contributions.alv,1630.2);assert.equal(high.contributions.nbu,1482);assert.equal(high.contributions.ktg,741);
});
test('Schweizer PK-Modell erst über Eintrittsschwelle; eigene Beiträge gehen vor',()=>{
  assert.equal(input({liAnnual:'22.680'}).li.pension,0);
  assert.equal(input({liAnnual:'22.681'}).li.pension,1474.27);
  assert.equal(input({liExact:true,exactPension:'2.400'}).li.pension,2400);
});
test('Regionale Schweizer Arbeitnehmerbeiträge GE, VD und VS',()=>{
  for(const [chCanton,expected]of [['GE',26.1],['VD',81],['VS',117.9]])assert.equal(calculateScenario(input({chCanton})).li.contributions.regional,expected);
});
test('Schweizer Quellensteuer wird begrenzt angerechnet, nie negativ rückerstattet',()=>{
  const a=calculateScenario(input({liExact:true,exactSource:'40.000'})).li;
  assert.equal(a.sourceCHF,40000);assert.equal(a.sourceCredit,a.atTax);assert.equal(a.reserve,0);
  const b=calculateScenario(input({liExact:true,exactSource:'0'})).li;
  assert.equal(b.sourceCHF,0);assert.equal(b.reserve,b.atTax);
});
test('Bekannte Jahresquellensteuer funktioniert auch ohne Datei und über der Monatsgrenze',()=>{
  const own=readInputs({...defaults,foreignCountry:'ch',liAnnual:'2.000.000',liExact:true,exactSource:'400.000'});
  assert.equal(own.sourcePending,false);assert.equal(calculateScenario(own).li.sourceCHF,400000);
  assert.throws(()=>input({liAnnual:'2.000.000'}));
});
test('Ohne geladene Tabelle oder eigenen Quellensteuerbetrag gibt es kein CH-Netto',()=>{
  const pending=readInputs({...defaults,foreignCountry:'ch'});
  assert.equal(pending.sourcePending,true);assert.throws(()=>calculateScenario(pending));
});
for(const foreignCountry of ['li','ch'])test(`Versicherungswahl ${foreignCountry}: private Prämie ersetzt ÖGK, AT behält seine Pflicht-SV`,()=>{
  const raw={...defaults,foreignCountry,fx:'1,0500'},opts={swissData:data.SG};
  const a=calculateScenario(readInputs(raw,opts));
  const own=readInputs({...raw,healthType:'private',privateMonthly:'350',privateDeductible:'',liExact:true,exactHealth:'0'},opts);
  const b=calculateScenario(own);
  assert.equal(b.li.health,4200);assert.equal(own.li.healthDeductible,0);assert.equal(own.sources.health,'own');
  assert.deepEqual(a.at,b.at);assert.equal(a.li.social,b.li.social);assert.ok(b.li.atTax>a.li.atTax);
  const c=calculateScenario(readInputs({...raw,healthType:'private',privateMonthly:'350',privateDeductible:'350'},opts));
  assert.equal(c.li.health,4200);assert.ok(c.li.atTax<b.li.atTax);
});
test('Privatversicherung benötigt positive Prämie und Pflichtanteil höchstens in Prämienhöhe',()=>{
  for(const extra of [{privateMonthly:''},{privateMonthly:'0'},{privateMonthly:'abc'},{privateMonthly:'300',privateDeductible:'301'},{privateMonthly:'300',privateDeductible:'-1'}])
    assert.throws(()=>readInputs({...defaults,healthType:'private',...extra}));
});
test('Verdeckte Detailfelder des anderen Landes oder Versicherungstyps werden ignoriert',()=>{
  const ch=input({liExact:true,exactSubsidy:'999999999',exactOther:'100'});
  assert.equal(ch.li.healthSubsidy,0);assert.equal(calculateScenario(ch).li.contributions.other,100);
  const li=readInputs({...defaults,liExact:true,exactSource:'ungültig',exactOther:'ungültig'});
  assert.equal(calculateScenario(li).li.sourceCHF,3600);
});
test('Länderprofile bewahren eigene Lohn- und Versicherungsdaten, nicht AT-Eingaben',()=>{
  const li=profileFrom({...defaults,liAnnual:'110.000',liExact:true,exactPension:'4.000'});
  const ch=profileFrom({...defaults,liAnnual:'95.000',healthType:'private',privateMonthly:'320'});
  const restored=sanitizeProfiles(JSON.parse(JSON.stringify({li,ch})));
  assert.equal(restored.li.liAnnual,'110.000');assert.equal(restored.ch.privateMonthly,'320');
  assert.equal('atGross'in restored.ch,false);assert.equal('foreignCountry'in restored.ch,false);
  assert.throws(()=>sanitizeProfiles({ch:{liExact:'yes'}}));
});
test('CH-JSON erhält Tarif, Versicherungswahl und individuelle Abzüge',()=>{
  const raw={...defaults,foreignCountry:'ch',chCanton:'ZH',chTariff:'C',chChildren:'2',healthType:'private',privateMonthly:'400',privateDeductible:'200',liExact:true,exactSource:'5.000',exactOther:'50'};
  assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(raw))),raw);
});
