import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateAT,calculateLI,tariff,pendler,equivalentGross,round} from '../dist/assets/calculator.mjs';
const atBase={year:2026,gross:3000,period:'monthly',region:'vorarlberg',benefit:0,taxFree:0,extraCosts:0,childrenYoung:0,childrenAdult:0,familyShare:0,avab:false,distance:0,pendlerType:'none',days:11,companyCar:false};
const liBase={year:2026,annual:75000,bonus:0,special:0,fx:1.05,pension:3600,nbu:1,ktg:.3,health:565.25,healthDeductible:565.25,healthSubsidy:180.50,extraCosts:0,childrenYoung:0,childrenAdult:0,familyShare:0,avab:false,distance:0,pendlerType:'none',days:11};
const parse=v=>Number(String(v).replaceAll('.','').replace(',','.'));
const fixtures=JSON.parse(fs.readFileSync(new URL('./ak-oracle.json',import.meta.url)));
for(const f of fixtures)test(`AK-Referenz · ${f.name}`,()=>{
 const i=f.input,r=calculateAT({...atBase,gross:parse(i.brutto),period:i.einkommen==='1'?'annual':'monthly',region:i.bundesland==='0'?'wien':'vorarlberg',benefit:parse(i.sachbezug),taxFree:parse(i.freibetrag),childrenYoung:Number(i.kinder17),childrenAdult:Number(i.kinder18),familyShare:i.familienBonus==='1'?1:i.familienBonus==='2'?.5:0,avab:i.alleinverdienerabsetzbetrag==='1',distance:parse(i.wegstrecke),pendlerType:parse(i.wegstrecke)>0?(i.verkehrsmittel==='1'?'small':'large'):'none',days:[0,4,8,11][Number(i.pendeltage)],companyCar:i.sachbezugKFZ==='1'});
 const actual=[[r.monthlyGross,r.specials[0].gross,r.specials[1].gross,r.gross],[r.monthlySV,r.specials[0].sv,r.specials[1].sv,r.social],[r.monthlyTax,r.specials[0].tax,r.specials[1].tax,r.tax],[r.monthlyNet,r.specials[0].net,r.specials[1].net,r.net]];
 f.rows.forEach((row,j)=>row.slice(1).forEach((v,k)=>assert.ok(round(actual[j][k])===parse(v),`${row[0]} column${k}: expected ${v}, actual ${actual[j][k]}`)));
});
test('LI · vollständig nachgerechneter 2026-Fall einschließlich AG-KV-Beitrag',()=>{const r=calculateLI(liBase);assert.equal(r.socialCHF,8625);assert.equal(r.sourceCHF,3000);assert.equal(r.payoutCHF,65541);assert.equal(round(r.taxable),65053.05);assert.equal(r.atTax,16972.42);assert.equal(r.reserve,13822.42);assert.equal(r.available,48212.63);});
test('LI · Bonus trägt zu SV und Bruttoquellensteuer bei',()=>{const a=calculateLI(liBase),b=calculateLI({...liBase,bonus:10000});assert.equal(b.sourceCHF-a.sourceCHF,400);assert.ok(b.socialCHF>a.socialCHF);assert.ok(b.available>a.available);assert.ok(b.available-a.available<10000*liBase.fx);});
test('LI · ALV und NBU haben getrennte Beitragsgrenzen',()=>{const r=calculateLI({...liBase,annual:250000});assert.equal(r.contributions.alv,630);assert.equal(r.contributions.nbu,1482);assert.equal(r.sourceCHF,10000);});
test('LI · Quellensteuer senkt nicht die AT-Bemessungsgrundlage',()=>{const r=calculateLI({...liBase,healthSubsidy:0});assert.equal(round(r.taxable),round((75000-r.socialCHF)*liBase.fx-liBase.healthDeductible*12-132));assert.equal(round(r.sourceCredit+r.reserve),r.atTax);});
test('LI · Quellensteueranrechnung ist auf die österreichische Steuer begrenzt',()=>{const r=calculateLI({...liBase,annual:15000,pension:0,health:0,healthDeductible:0,healthSubsidy:0});assert.equal(r.reserve,0);assert.ok(r.sourceCredit<=r.atTax);assert.ok(r.sourceCredit<=r.sourceEUR);});
test('LI · Pflichtanteil und tatsächlich gezahlte KV sind getrennt',()=>{const a=calculateLI(liBase),b=calculateLI({...liBase,health:665.25});assert.equal(a.atTax,b.atTax);assert.equal(round(a.available-b.available),1200);});
test('LI · eigene Kosten mindern nur das verfügbare Budget',()=>{const a=calculateLI(liBase),b=calculateLI({...liBase,extraCosts:250});assert.equal(a.atTax,b.atTax);assert.equal(a.available-b.available,3000);});
test('Fehlende oder ungültige Daten stoppen die Berechnung',()=>{assert.throws(()=>calculateLI({...liBase,fx:0}));assert.throws(()=>calculateLI({...liBase,annual:NaN}));assert.throws(()=>calculateLI({...liBase,special:80000}));assert.throws(()=>calculateLI({...liBase,healthDeductible:600}));assert.throws(()=>calculateLI({...liBase,year:2027}));assert.throws(()=>calculateAT({...atBase,year:2027}));});
test('Pendlergrenzen bleiben am Grenzkilometer in der niedrigeren Stufe',()=>{assert.equal(pendler(40,'small',11).allowance,696);assert.equal(pendler(60,'small',11).allowance,1356);assert.equal(pendler(20,'large',11).allowance,372);assert.equal(pendler(40.1,'small',11).allowance,1356);assert.equal(pendler(35,'small',0).euro,0);assert.equal(pendler(35,'small',4).euro,70);assert.equal(pendler(35,'small',11,true).allowance,0);});
test('Nullgehalt AT ergibt keine Phantomabzüge',()=>{const r=calculateAT({...atBase,gross:0});assert.equal(r.net,0);assert.equal(r.social,0);assert.equal(r.tax,0);});
test('Äquivalentes AT-Brutto erreicht das LI-Jahresbudget',()=>{const li=calculateLI(liBase),gross=equivalentGross(li.available,atBase),at=calculateAT({...atBase,gross});assert.ok(Math.abs(at.available-li.available)<.2);});
test('Einkommensteuertarif ist an jeder Grenze stetig und steigt',()=>{for(const n of [13539,21992,36458,70365,104859,1000000])assert.ok(tariff(n+.01)>=tariff(n));});

test('LI · jährliche Veranlagung begrenzt kleine Sonderzahlungssteuer nach §41(4)',()=>{const r=calculateLI({...liBase,annual:21000,special:3000,fx:1,pension:0,nbu:0,ktg:0,health:0,healthDeductible:0,healthSubsidy:0});assert.equal(r.specialTax,104.4);});

test('LI · tatsächliche Sonderzahlung unter Freigrenze löst keine §41-Neuberechnung aus',()=>{const r=calculateLI({...liBase,annual:19000,special:2500,fx:1,pension:0,nbu:0,ktg:0,health:0,healthDeductible:0,healthSubsidy:0});assert.equal(r.specialTax,104.7);});
