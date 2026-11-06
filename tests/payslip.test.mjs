import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, readInputs, calculateScenario, sanitizeState, sanitizeProfiles, exactFieldMeta, exactDisplayValue } from '../dist/assets/scenario.mjs';
const own=extra=>readInputs({...defaults,liExact:true,...extra});
test('NBU und KTG werden als Prozentsätze auf den Lohn samt Bonus angewendet',()=>{
  const inputs=own({liBonus:'9.000',exactNbu:'1,2',exactKtg:'0,7'}),{li}=calculateScenario(inputs);
  assert.equal(li.contributions.nbu,1188);assert.equal(li.contributions.ktg,693);
  assert.equal(inputs.sources.nbuAnnual,'own');assert.equal(exactFieldMeta('exactNbu',inputs.raw).unit,'%');
  assert.equal(exactDisplayValue(inputs,'exactNbu'),1.2);assert.equal(exactDisplayValue(inputs,'exactPension'),5850);
});
test('Drei Nachkommastellen im Prozentsatz sind keine Tausendergruppierung',()=>{
  for(const exactNbu of ['0.675','0,675','0,675 %']){
    const inputs=own({liAnnual:'250.000',exactNbu});
    assert.equal(calculateScenario(inputs).li.contributions.nbu,1000.35);
    assert.equal(exactDisplayValue(inputs,'exactNbu'),.675);
  }
});
test('Eigene Prozentsätze respektieren die modellierte NBU-/KTG-Lohngrenze',()=>{
  const {li}=calculateScenario(own({liAnnual:'250.000',exactNbu:'2',exactKtg:'1'}));
  assert.equal(li.contributions.nbu,2964);assert.equal(li.contributions.ktg,1482);
  assert.equal(li.contributions.alv,630);
});
test('Nullprozentsätze sind eigene Angaben; leere Prozentfelder bleiben geschätzt',()=>{
  const zero=own({exactNbu:'0',exactKtg:'0'}),blank=own({});
  assert.equal(zero.li.nbuAnnual,0);assert.equal(zero.li.ktgAnnual,0);assert.equal(zero.ownCount,2);
  assert.equal(blank.li.nbuAnnual,900);assert.equal(exactDisplayValue(blank,'exactKtg',{automatic:true}),.5);
});
test('Ungültige aktive Prozentsätze werden abgewiesen und ausgeschaltet ignoriert',()=>{
  for(const value of ['-1','10,001','1e3','1%2','100','abc'])assert.throws(()=>own({exactNbu:value}));
  assert.doesNotThrow(()=>readInputs({...defaults,exactNbu:'500'}));
  assert.throws(()=>own({contributionUnit:'unknown'}));
});
test('Alte NBU-/KTG-Jahresbeträge bleiben beim Import Jahresbeträge',()=>{
  const old={...defaults,liExact:true,exactNbu:'1.234,56',exactKtg:'444,44',supplement:'120'};
  delete old.contributionUnit;delete old.supplementEnabled;
  const migrated=sanitizeState(old,{legacy:true}),inputs=readInputs(migrated),{li}=calculateScenario(inputs);
  assert.equal(migrated.contributionUnit,'annual');assert.equal(migrated.supplementEnabled,true);
  assert.equal(li.contributions.nbu,1234.56);assert.equal(li.contributions.ktg,444.44);assert.equal(li.supplement,1440);
  assert.equal(exactFieldMeta('exactNbu',migrated).unit,'CHF / Jahr');
});
test('Alte leere Prozentfelder erhalten den neuen Standard ohne Modelländerung',()=>{
  const old={...defaults};delete old.contributionUnit;delete old.supplementEnabled;
  const migrated=sanitizeState(old,{legacy:true});assert.equal(migrated.contributionUnit,'percent');
  assert.deepEqual(calculateScenario(readInputs(migrated)),calculateScenario(readInputs({...defaults})));
});
for(const foreignCountry of ['li','ch'])test(`${foreignCountry}: private Grundversicherung schließt ÖGK und Zusatzprämie aus`,()=>{
  const inputs=own({foreignCountry,healthType:'private',privateMonthly:'350',supplementEnabled:true,supplement:'120',atSupplementEnabled:true,atSupplement:'120',exactSource:'5.000'});
  const {li,at}=calculateScenario(inputs);
  assert.equal(inputs.supplement,0);assert.equal(li.health,4200);assert.equal(li.supplement,0);assert.equal(at.supplement,1440);
  const stale=own({foreignCountry,healthType:'private',privateMonthly:'350',supplementEnabled:true,supplement:'ungültig',exactSource:'5.000'});
  assert.equal(stale.supplement,0);
});
test('ÖGK-Zusatzversicherung wird nur nach Aktivierung zusätzlich abgezogen',()=>{
  const off=own({supplement:'120'}),on=own({supplementEnabled:true,supplement:'120',atSupplementEnabled:true,atSupplement:'120'});
  const a=calculateScenario(off),b=calculateScenario(on);
  for(const key of ['li','at']){assert.equal(a[key].available-b[key].available,1440);assert.equal(a[key].tax,b[key].tax);}
  assert.equal(b.li.health,6783);
  assert.throws(()=>own({supplementEnabled:true,supplement:'-1'}));
  assert.doesNotThrow(()=>own({supplement:'ungültig'}));
});
test('Import und Länderprofile normalisieren Privat plus Zusatzversicherung',()=>{
  const privateRaw={...defaults,healthType:'private',privateMonthly:'350',supplementEnabled:true,supplement:'120',atSupplementEnabled:true,atSupplement:'120'};
  const safe=sanitizeState(privateRaw);assert.equal(safe.supplementEnabled,false);assert.equal(safe.supplement,'0');
  const li={...defaults,supplement:'120',exactNbu:'750'},ch={...privateRaw,exactNbu:'800'};
  for(const row of [li,ch]){delete row.contributionUnit;delete row.supplementEnabled;}
  const profiles=sanitizeProfiles({li,ch});assert.equal(profiles.li.contributionUnit,'annual');assert.equal(profiles.li.supplementEnabled,true);
  assert.equal(profiles.ch.contributionUnit,'annual');assert.equal(profiles.ch.supplementEnabled,false);assert.equal(profiles.ch.supplement,'0');
});
test('Prozentangaben und PK-Betrag überstehen JSON ohne Einheitenwechsel',()=>{
  const raw={...defaults,liExact:true,exactNbu:'1,25',exactKtg:'0,6',exactPension:'4.500',supplementEnabled:true,supplement:'90',atSupplementEnabled:true,atSupplement:'90'};
  const loaded=sanitizeState(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(loaded,raw);assert.deepEqual(calculateScenario(readInputs(loaded)),calculateScenario(readInputs(raw)));
});
