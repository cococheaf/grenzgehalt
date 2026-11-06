import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,readInputs,calculateScenario} from '../dist/assets/scenario.mjs';
import {buildPaymentPlans,selectedPayment,equivalentRegularGross} from '../dist/assets/payment-plan.mjs';
import {round} from '../dist/assets/calculator.mjs';
import {decodeSwissTariff,swissMonthlyTax} from '../dist/assets/swiss.mjs';
import sg from '../dist/assets/ch-tariffs-sg.mjs';
import ge from '../dist/assets/ch-tariffs-ge.mjs';
const data={SG:await decodeSwissTariff(sg),GE:await decodeSwissTariff(ge)};
function scenario(raw={}){const swissData=data[raw.chCanton||'SG'],inputs=readInputs({...defaults,...raw},{swissData}),results=calculateScenario(inputs);return {inputs,results,plans:buildPaymentPlans(inputs,results,{swissData})};}
const cashKeys=['salaryGross','subsidy','gross','social','sourceEUR','reserve','tax','health','supplement','extraCosts','available','payout'];
function reconciles(plan){for(const key of cashKeys){const actual=round(12*(plan.regular[key]||0)+plan.extras.reduce((s,e)=>s+(e[key]||0),0)+(plan.settlement?.[key]||0));assert.equal(actual,round(plan.annual[key]||0),key);}}
for(const gross of [7000,7500])test(`AT ${gross} × 14: Monatsbrutto bleibt ${gross}, Sonderzahlungen separat`,()=>{
  const {plans,results}=scenario({atGross:String(gross),atCosts:'120'}),p=plans.at;
  assert.equal(selectedPayment(p,'monthly').salaryGross,gross);assert.equal(p.annual.gross,gross*14);
  assert.equal(p.regular.social,results.at.monthlySV);assert.equal(p.regular.tax,results.at.monthlyTax);assert.equal(p.regular.available,round(results.at.monthlyNet-120));
  assert.equal(p.extras.length,2);assert.equal(p.extras[0].salaryGross,gross);assert.equal(p.extras[1].salaryGross,gross);
  p.extras.forEach((e,i)=>assert.equal(e.available,results.at.specials[i].net));reconciles(p);
});
test('AT: Zusatzversicherung und Kosten werden ausschließlich zwölfmal angesetzt',()=>{
  const {plans}=scenario({atGross:'7.000',atCosts:'120',supplementEnabled:true,supplement:'80',atSupplementEnabled:true,atSupplement:'80'}),p=plans.at;
  assert.equal(p.regular.supplement,80);assert.equal(p.regular.extraCosts,120);
  assert.ok(p.extras.every(e=>e.extraCosts===0&&e.supplement===0));reconciles(p);
});
test('AT: Jahresbrutto und Monatsbrutto erzeugen dieselben einzelnen Bezüge',()=>{
  assert.deepEqual(scenario({atGross:'7.500'}).plans.at,scenario({atPeriod:'annual',atGross:'105.000'}).plans.at);
});
test('AT: Centabgleich bei nicht glatt durch vierzehn teilbarem Jahresbrutto',()=>{reconciles(scenario({atPeriod:'annual',atGross:'50.000'}).plans.at);});
for(const country of ['li','ch'])for(const payments of [12,13,14])test(`${country} mit ${payments} Bezügen: laufender Monat, Bonus und Jahressumme`,()=>{
  for(const monthly of [1000,6000,14000,40000]){
    const {plans}=scenario({foreignCountry:country,foreignPeriod:'monthly',liAnnual:String(monthly),liPayments:String(payments),liBonus:'7.000',liExact:true,pensionPeriod:'monthly',exactPension:'300',exactNbu:'1,2',exactKtg:'0,8',liCosts:'150',supplementEnabled:true,supplement:'70',atSupplementEnabled:true,atSupplement:'70'}),p=plans.foreign;
    assert.equal(p.regular.grossCHF,monthly);assert.equal(p.regular.contributions.pension,300);assert.ok(p.extras.every(e=>e.contributions.pension===0&&e.health===0&&e.extraCosts===0&&e.supplement===0));
    assert.equal(p.extras.filter(e=>e.id==='13'||e.id==='14').length,payments-12);assert.equal(p.extras.find(e=>e.id==='bonus').grossCHF,7000);reconciles(p);
  }
});
test('LI: Quellensteuer und ALV des normalen Monats enthalten keine Sonderzahlungen',()=>{
  const {plans}=scenario({foreignPeriod:'monthly',liAnnual:'8.000',liPayments:'14'}),p=plans.foreign;
  assert.equal(p.regular.sourceCHF,320);assert.equal(p.regular.contributions.alv,40);assert.equal(p.annual.sourceCHF,4480);
  assert.equal(p.extras.find(e=>e.id==='13').sourceCHF,320);reconciles(p);
});
test('LI: Bonus wird gesondert ausgewiesen, einschließlich Tarifsteuer über dem Jahressechstel',()=>{
  const {plans}=scenario({foreignPeriod:'monthly',liAnnual:'6.000',liPayments:'14',liBonus:'50.000'}),p=plans.foreign;
  assert.equal(p.regular.grossCHF,6000);assert.equal(p.extras.find(e=>e.id==='bonus').grossCHF,50000);assert.ok(p.extras.find(e=>e.id==='bonus').reserve>0);reconciles(p);
});
test('LI: Bruttolohn und Arbeitgeber-KK-Zuschuss sind getrennte Werte',()=>{
  const {plans}=scenario({foreignPeriod:'monthly',liAnnual:'6.000',liExact:true,exactSubsidy:'200',fx:'1,10'}),r=plans.foreign.regular;
  assert.equal(r.salaryGross,6600);assert.equal(r.subsidy,220);assert.equal(r.gross,6820);reconciles(plans.foreign);
});
test('CH Monatsmodell: laufende Quellensteuer kommt aus dem regulären Monatstarif',()=>{
  const {inputs,plans}=scenario({foreignCountry:'ch',foreignPeriod:'monthly',liAnnual:'6.000',liPayments:'14',liBonus:'20.000',chCanton:'SG'}),p=plans.foreign;
  assert.equal(p.regular.sourceCHF,swissMonthlyTax(6000,'SG',inputs.sourceQuote.code,data.SG).tax);
  assert.ok(p.extras.find(e=>e.id==='bonus').sourceCHF>0);reconciles(p);
});
test('CH Jahresmodell: normaler Bezug erhält den Jahresmodell-Steuersatz ohne zusätzliche Bruttoanteile',()=>{
  const {plans}=scenario({foreignCountry:'ch',foreignPeriod:'monthly',liAnnual:'6.000',liPayments:'13',chCanton:'GE'}),p=plans.foreign;
  assert.equal(p.regular.grossCHF,6000);assert.equal(p.extras.find(e=>e.id==='13').grossCHF,6000);reconciles(p);
});
test('CH eigene Jahresquellensteuer bleibt maßgebend und wird gekennzeichnet zugeordnet',()=>{
  const {plans}=scenario({foreignCountry:'ch',foreignPeriod:'monthly',liAnnual:'6.000',liPayments:'14',liExact:true,exactSource:'7.000',contributionUnit:'annual',exactNbu:'1.000',exactKtg:'500'});
  assert.equal(plans.foreign.annual.sourceCHF,7000);assert.equal(plans.foreign.regular.sourceCHF,500);reconciles(plans.foreign);
});
test('Monatsäquivalent in Österreich erreicht den laufenden Zielbetrag',()=>{
  const {inputs,plans}=scenario({atGross:'6.000',atCosts:'120',supplementEnabled:true,supplement:'80',atSupplementEnabled:true,atSupplement:'80'}),target=plans.at.regular.available;
  assert.ok(Math.abs(equivalentRegularGross(target,inputs.at,inputs.supplement)-6000)<.1);
});
test('Jahresrechenkern bleibt unverändert, Darstellung enthält keine Monatsdurchschnittswerte',()=>{
  const s=scenario({liBonus:'10.000'}),before=JSON.stringify(s.results);buildPaymentPlans(s.inputs,s.results,{swissData:data.SG});assert.equal(JSON.stringify(s.results),before);
  assert.notEqual(s.plans.at.regular.salaryGross,s.results.at.gross/12);assert.throws(()=>selectedPayment(s.plans.at,'weekly'));
});

test('Quellensteuer zusätzlicher Bezüge wird nicht vorweg im normalen Monat angerechnet',()=>{
  const {plans}=scenario({foreignPeriod:'monthly',liAnnual:'8.000',liPayments:'14'}),p=plans.foreign;
  assert.ok(p.regular.sourceCredit<=p.regular.sourceEUR+.005);
  assert.equal(p.regular.reserve,round(p.regular.regularTax-p.regular.sourceCredit));
  assert.ok(p.extras.every(e=>e.reserve>=0));reconciles(p);
});
test('14 Auszahlungen, leeres Sonderzahlungsfeld: Jahresbudget enthält beide zusätzlichen Nettogehälter',async()=>{
  const {annualBudgetParts}=await import('../dist/assets/payment-plan.mjs');
  const {plans}=scenario({foreignPeriod:'monthly',liAnnual:'8.000',liPayments:'14',liExact:true,exactSpecial:'',pensionPeriod:'monthly',exactPension:'600'}),p=plans.foreign,parts=annualBudgetParts(p);
  assert.deepEqual(parts.filter(r=>r.id==='13'||r.id==='14').map(r=>r.label),['13. Gehalt','14. Gehalt']);
  assert.equal(parts[0].available,round(12*p.regular.available));assert.ok(parts[1].available>0);assert.ok(parts[2].available>0);
  assert.equal(round(parts.reduce((s,r)=>s+r.available,0)),p.annual.available);
  assert.ok(p.annual.available>round(12*p.regular.available));
});
test('Jahresübersicht zeigt einen expliziten Null-Sonderzahlungsbetrag ohne erfundene 13./14. Auszahlung',async()=>{
  const {annualBudgetParts}=await import('../dist/assets/payment-plan.mjs');
  const {plans}=scenario({foreignPeriod:'monthly',liAnnual:'8.000',liPayments:'14',liExact:true,specialOverride:true,exactSpecial:'0'}),p=plans.foreign,parts=annualBudgetParts(p);
  assert.equal(p.extras.length,0);assert.ok(!parts.some(r=>r.id==='13'||r.id==='14'));
  assert.equal(round(parts.reduce((s,r)=>s+r.available,0)),p.annual.available);
});
for(const foreignCountry of ['li','ch'])test(`${foreignCountry}: schlanker Vergleich übernimmt fertige Budgets auf gemeinsamer Basis ohne erneute Abzüge`,async()=>{
  const {comparisonSummary}=await import('../dist/assets/payment-plan.mjs');
  const {plans}=scenario({foreignCountry,foreignPeriod:'annual',liAnnual:'112.000',liPayments:'14',atPeriod:'monthly',atGross:'7.500',liCosts:'180',atCosts:'120',supplementEnabled:true,supplement:'70',atSupplementEnabled:true,atSupplement:'70'}),before=JSON.stringify(plans);
  for(const period of ['monthly','annual']){
    const c=comparisonSummary(plans,period),foreign=selectedPayment(plans.foreign,period),at=selectedPayment(plans.at,period);
    assert.equal(c.foreign,foreign.available);assert.equal(c.austria,at.available);assert.equal(c.difference,round(foreign.available-at.available));
    assert.equal(c.basis,period==='monthly'?'regular_month':'annual_total');assert.equal(c.currency,'EUR');
  }
  assert.notEqual(comparisonSummary(plans,'monthly').foreign,round(plans.foreign.annual.available/12));assert.equal(JSON.stringify(plans),before);
  assert.throws(()=>comparisonSummary(plans,'other'),/Anzeigezeitraum/);
});
test('AT-Angebot ändern lässt das übernommene Auslandsbudget unverändert',async()=>{
 const {comparisonSummary}=await import('../dist/assets/payment-plan.mjs');
 const a=scenario({liAnnual:'112.000',liPayments:'14',atGross:'7.000'}),b=scenario({liAnnual:'112.000',liPayments:'14',atGross:'7.500'});
 assert.equal(comparisonSummary(a.plans).foreign,comparisonSummary(b.plans).foreign);assert.notEqual(comparisonSummary(a.plans).austria,comparisonSummary(b.plans).austria);
});
