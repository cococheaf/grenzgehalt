// Each calculation selects its own immutable annual dataset. Historical files default to 2026.
export const TAX = Object.freeze({
  year: 2026, verified: '2026-10-25',
  brackets: [[13539,0],[21992,.2],[36458,.3],[70365,.4],[104859,.48],[1000000,.5],[Infinity,.55]],
  employee: { monthlyCap: 6930, specialCap: 13860, marginal: 551.10, health:.0387, pension:.1025, chamber:.005, housing:.005, housingVienna:.0075, alv:[[2225,0],[2427,.01],[2630,.02],[Infinity,.0295]] },
  credits: { traffic:496, expenses:132, childYoung:2000.16, childAdult:700.08, avab:[0,612,828], avabThird:1101, avabExtra:273 },
  special: { free:620, exemption:2615, assessmentFloor:2490, bands:[[620,0],[24380,.06],[25000,.27],[33333,.3575]] },
  li: { ahv:.04025, iv:.00675, fak:.002, alv:.005, alvCap:126000, accidentCap:148200, source:.04, healthEmployerMonthly:180.50 },
  ch: { ahv:.0435, iv:.007, eo:.0025, fak:0, alv:.011, alvCap:148200, accidentCap:148200, healthEmployerMonthly:0 },
  chRegional: { GE:.00029, VD:.0009, VS:.00131 },
  healthMonthly:565.25,
  healthYear:2026, swissTariffYear:2026, swissPremiumYear:2026, preview:false,
  swissPension:{entry:22680,coordination:26460,maximum:90720,minimum:3780},
});
const TAX_2027 = {
  ...TAX, year:2027, verified:'2026-11-19', preview:true,
  brackets:[[13846,0],[22491,.2],[37285,.3],[71960,.4],[107236,.48],[1000000,.5],[Infinity,.55]],
  employee:{...TAX.employee, monthlyCap:7410, specialCap:14820,
    alv:[[2327,.005],[2539,.015],[2751,.025],[Infinity,.0295]],
    alvNew:[[2327,.01],[2539,.02],[Infinity,.0295]]},
  credits:{...TAX.credits,traffic:508,avab:[0,626,847],avabThird:1127,avabExtra:280},
  special:{...TAX.special,exemption:2675,assessmentFloor:2547},
  li:{...TAX.li,healthEmployerMonthly:184},
  swissPension:{entry:23040,coordination:26880,maximum:92160,minimum:3840},
};
function freezeData(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freezeData(child);
    Object.freeze(value);
  }
  return value;
}
// TAX remains the 2026 export for existing consumers.
for(const value of Object.values(TAX))freezeData(value);
export const TAX_YEARS=Object.freeze({2026:TAX,2027:freezeData(TAX_2027)});
export function taxForYear(year=2026){
  if(!Number.isInteger(year)||!Object.hasOwn(TAX_YEARS,year))throw new Error('Bitte das Steuerjahr 2026 oder 2027 wählen.');
  return TAX_YEARS[year];
}
export function calculationNotes(inputs){
  const tax=taxForYear(inputs.li.year);
  if(!tax.preview)return [];
  const notes=['Vorschau 2027 · Datenstand 19.11.2026. Die österreichischen SV-Grenzen sind laut ÖGK noch vorläufig.'];
  if(inputs.scope!=='at'){
    const raw=inputs.raw;
    if(raw.foreignCountry==='ch'&&inputs.sources.sourceAnnual!=='own')notes.push('Schweizer Quellensteuer mit Kantonstarif 2026 als Übergangsschätzung. Die vollständigen Tarife 2027 sind noch nicht verfügbar.');
    if(raw.foreignCountry==='li')notes.push('LI-Sozialbeiträge und PK-Eintrittsschwelle folgen dem zuletzt bestätigten Stand. Der gesetzliche Vollzeit-Richtwert für den Arbeitgeber-KK-Beitrag beträgt 2027 neu 184 CHF.');
    const local=inputs.li.resident||raw.healthType==='local';
    if(local&&String(raw.localHealthCHF).trim()===''&&raw.foreignCountry==='ch')notes.push('Schweizer KVG-Prämie als Richtwert 2026. Eine bekannte Prämie für 2027 kann selbst eingetragen werden.');
    if(local&&String(raw.localHealthCHF).trim()===''&&raw.foreignCountry==='li'&&['liMinor','liYouth'].includes(raw.pensionAge))notes.push('LI-Jugendprämie als Richtwert 2026. Eine bekannte Prämie für 2027 kann selbst eingetragen werden.');
    if(!local&&raw.healthType==='oegk'&&inputs.sources.health!=='own')notes.push('ÖGK-Selbstversicherung mit zuletzt bestätigtem Regelbeitrag 2026 von 565,25 EUR pro Monat. Der Beitrag für 2027 ist noch offen.');
  }
  return notes;
}
export const SOURCES_2027=[
  {title:'RIS · Einkommensteuer 2027',detail:'Veröffentlichte Tarifgrenzen, Absetzbeträge und Freigrenzen für Sonderzahlungen. BGBl. II Nr. 260/2026.',url:'https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2026_II_260/BGBLA_2026_II_260.html'},
  {title:'ÖGK · Voraussichtliche Werte 2027',detail:'Vorläufige SV-Höchstbeitragsgrundlagen und ALV-Staffeln für bestehende sowie ab 2027 beginnende Dienstverhältnisse.',url:'https://www.sozialversicherung.gv.at/cdscontent/?contentid=10007.912177'},
  {title:'LI · Arbeitgeber-KK-Beitrag 2027',detail:'184 CHF pro Monat für Erwachsene bei Vollzeit, 92 CHF für Jugendliche. Richtprämie Erwachsene 394,51 CHF.',url:'https://www.regierung.li/medienportal-medium/16182/234921/0/medienmitteilung'},
  {title:'BSV · Berufliche Vorsorge 2027',detail:'BVG-Eintrittsschwelle 23.040 CHF und Koordinationsabzug 26.880 CHF. Altersstaffel und eigener Vorsorgeplan bleiben maßgebend.',url:'https://www.bsv.admin.ch/de/altersvorsorge-beruflichen-vorsorge'},
  {title:'RIS · Familienbonus ab 2027',detail:'Volle Aufteilung bei Kind unter vier Jahren, erhöhter Familienbeihilfe oder nur einem Anspruchsberechtigten. Sonst 75/25 oder hälftig.',url:'https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&FassungVom=2027-01-01&Gesetzesnummer=10004570&Paragraf=33'},
];
export const SOURCES = [
  { title:'BAG · Schweizer Krankenkasse 2026', detail:'Mittlere Wohnkantonprämien und KVG-Tarife für Versicherte mit Wohnsitz in Österreich.', url:'https://www.bag.admin.ch/de/krankenversicherung-praemienvergleich' },
  { title:'BAG · Grundversicherung mit Wohnsitz Österreich', detail:'KVG-Prämien 2026 nach Wohnstaat und Versicherer.', url:'https://www.bag.admin.ch/dam/de/sd-web/BQcAQKzAVJgV/gesamtbericht_eu.pdf' },
  { title:'ESTV · Ordentliche Schweizer Steuer', detail:'Steuerrechner für Bund, Wohnkanton und Gemeinde. Betrag im Umzugsszenario übernehmbar.', url:'https://www.estv.admin.ch/de/steuerrechner-steuern-berechnen' },
  { title:'BSV · BVG-Altersgutschriften', detail:'Koordinierter Lohn und Altersstaffel 7 %, 10 %, 15 % und 18 %.', url:'https://www.bsv.admin.ch/de/altersvorsorge-beruflichen-vorsorge' },
  { title:'LI-Steuerverwaltung · Lohnsteuerabzug', detail:'Abzugstabelle für öffentliche Funktionen und Sonderregel für Grenzgänger.', url:'https://www.llv.li/de/unternehmen/steuern-abgaben-versicherung/lohn-quellensteuer-personalvorsorge/lohn-quellensteuer' },
  { title:'LI AHV/IV/FAK · Kinderzulagen', detail:'Ansätze und Koordination bei Grenzgängern.', url:'https://www.ahv.li/leistungen/fak/kinderzulagen' },
  { title:'BMF · Einkommen mit Auslandsbezug', detail:'Amtliche Informationen zu Veranlagung, L 1i und L 17. Gehaltsberechnungen sind Planungswerte.', url:'https://www.bmf.gv.at/themen/steuern/arbeitnehmerveranlagung/lohnsteuer-mit-auslandsbezug/einkuenfte-nichtselbststaendige-arbeit-mit-auslandsbezug.html' },
  { title:'BMF · Werbungskosten und Sonderausgaben', detail:'Kirchenbeiträge können bis 600 EUR berücksichtigt werden. Weitere Werbungskosten ersetzen bei höherem Betrag das Pauschale.', url:'https://www.bmf.gv.at/themen/steuern/arbeitnehmerveranlagung/was-kann-ich-geltend-machen/sonderausgaben/sonderausgaben-im-einzelnen.html' },
  { title:'Liechtenstein · Arbeitgeber-KK-Beitrag', detail:'2026: 180,50 CHF pro Monat für Erwachsene in Vollzeit, zusätzlich zum Vertragsbrutto. Eigene tatsächlich ausgezahlte Werte sind eintragbar.', url:'https://www.llv.li/de/privatpersonen/gesundheit-vorsorge-und-pflege/krankenversicherung/praemien-beitraege' },
  { title:'Rates By Exchange Rate API', detail:'Öffentlicher CHF/EUR-Tagesreferenzkurs. Aktualisierung laut Anbieter einmal täglich; kein steuerlicher Jahresdurchschnitt.', url:'https://www.exchangerate-api.com' },
  { title:'AK Brutto-Netto-Rechner', detail:'Referenz für den österreichischen Standardlohn; unabhängige Implementierung, mit AK-Beispielrechnungen abgeglichen.', url:'https://bruttonetto.arbeiterkammer.at/' },
  { title:'BMF · Steuertarif und Absetzbeträge', detail:'Tarifgrenzen 2026, Verkehrsabsetzbetrag, Familienbonus Plus und AVAB/AEAB.', url:'https://www.bmf.gv.at/themen/steuern/arbeitnehmerveranlagung/steuertarif-steuerabsetzbetraege/steuertarif-steuerabsetzbetraege.html' },
  { title:'ÖGK · Beitragsrechtliche Werte 2026', detail:'SV-Höchstbeitragsgrundlagen, Geringfügigkeit und reduzierte Arbeitslosenversicherung.', url:'https://www.sozialversicherung.gv.at/cdscontent/?contentid=10007.907722' },
  { title:'BMF · Pendlerpauschale', detail:'Entfernungsgrenzen, Fahrtage und Pendlereuro 2026 (6 Euro je Kilometer).', url:'https://www.bmf.gv.at/themen/steuern/arbeitnehmerveranlagung/pendlerfoerderung-das-pendlerpauschale/allgemeines-zum-pendlerpauschale.html-2' },
  { title:'AHV Liechtenstein · Beiträge 2026', detail:'Arbeitnehmeranteile AHV, IV und FAK sowie ALV mit eigener Beitragsgrenze.', url:'https://www.ahv.li/fileadmin/user_upload/Dokumente/Online-Schalter/MB/AHV-IV-FAK-MB-1-01-2026--AHV-IV-FAK-ALV-Beitraege.pdf' },
  { title:'Liechtenstein · Quellensteuer', detail:'4 % des Bruttolohns für österreichische Grenzgänger in privaten Dienstverhältnissen.', url:'https://www.llv.li/servicekonto/steuerverwaltung/quellensteuer-lohnsteuer-unselbstaendige-taetigkeit-und-ersatzeinkuenfte-merkblatt.pdf' },
  { title:'BMF · Einkünfte mit Auslandsbezug', detail:'Anrechnung der liechtensteinischen Bruttoquellensteuer in Österreich und Formular L 17.', url:'https://www.bmf.gv.at/themen/steuern/arbeitnehmerveranlagung/lohnsteuer-mit-auslandsbezug/einkuenfte-nichtselbststaendige-arbeit-mit-auslandsbezug.html' },
  { title:'FMA · Betriebliche Personalvorsorge', detail:'Berichtsjahr 2024: Beitragseinnahmen 551,6 Mio. CHF, rund 40 % Arbeitnehmerbeiträge und 37.605 aktive Versicherte. Grundlage zur Einordnung der PK-Modellannahme.', url:'https://www.fma-li.li/fma-li/documents/publikationen/betriebliche-personalvorsorge-in-liechtenstein/betriebliche-personalvorsorge-in-liechtenstein-2025.pdf' },
  { title:'ÖGK · Grenzgänger nach LI und CH', detail:'ÖGK-Selbstversicherung oder gleichwertiger privater Grundschutz bei anerkannter Befreiung im Arbeitsland. Die Anerkennung ist individuell zu prüfen.', url:'https://www.oegk.at/cdscontent/?contentid=10007.870661&portal=oegkportal' },
  { title:'ESTV · Quellensteuertarife 2026', detail:'Amtliche Lohntabellen aller 26 Kantone, Stand 4. März 2026. A/B/C/H, Kinderabzüge und Kirchensteuer; lokal verdichtet und pro Kanton geladen.', url:'https://www.estv.admin.ch/de/quellensteuertarife-import-in-lohnbuchhaltungssysteme' },
  { title:'ESTV · Berechnungsgrundlagen 2026', detail:'Statistische Berechnungsannahmen zur Pensionskasse (6,5 %) und Nichtberufsunfallversicherung. Keine einheitlichen individuellen Prämiensätze.', url:'https://www.estv.admin.ch/dam/de/sd-web/nuQbhdzXDPm0/qst-berechnungsgrundlagen-2026-de.pdf' },
  { title:'Schweizer AHV/IV · Beitragssätze', detail:'AHV, IV, EO und ALV 2026 sowie Beitragsgrenzen; Arbeitnehmeranteile werden separat angesetzt.', url:'https://www.ahv-iv.ch/de/Formulare/Diverse-Listen/Synoptische-Tabelle-Beitrags-und-Pr%C3%A4miens%C3%A4tze' },
  { title:'BSV · Berufliche Vorsorge', detail:'Eintrittsschwelle 22.680 CHF; Alter und Vorsorgeplan beeinflussen die tatsächlichen Arbeitnehmerbeiträge.', url:'https://www.bsv.admin.ch/fr/prevoyance-vieillesse' },
  { title:'Thurgau · Grenzgänger aus Österreich', detail:'Für in Österreich ansässige Beschäftigte gilt die ordentliche Quellenbesteuerung. Die deutsche Grenzgänger-Sonderregel wird nicht verwendet.', url:'https://steuerpraxis.tg.ch/steuerpraxis/2025-01/stp-114-nr-3-quellenbesteuerung-von-grenzgangerinn' },
  { title:'RIS · DBA Österreich–Schweiz', detail:'Artikel 23: begrenzte Anrechnung der Schweizer Steuer auf die österreichische Einkommensteuer.', url:'https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004202' },
  { title:'BAG · Krankenversicherung für Grenzgänger', detail:'Schweizer Versicherungspflicht, Befreiungsmöglichkeiten und Optionsrecht. ÖGK oder Privat erfordern eine anerkannte Befreiung.', url:'https://www.bag.admin.ch/bag/de/home/versicherungen/krankenversicherung/krankenversicherung-versicherte-mit-wohnsitz-im-ausland/versicherungspflicht/grenzgaengerinnen-ch.html' },
  { title:'Genf · Mutterschaftsversicherung', detail:'AMat-Arbeitnehmerbeitrag 2026: 0,029 % des Bruttos.', url:'https://silgeneve.ch/legis/data/rsg_j5_07p01.htm' },
  { title:'Waadt · Familienergänzungsleistungen', detail:'PC-Fam-Arbeitnehmerbeitrag 2026: 0,09 % des Bruttos.', url:'https://www.vd.ch/gc/seances-du-grand-conseil/point-seance/point/65eab9df-d79b-4404-b46d-d89c41a98d19/meeting/1026869' },
  { title:'CVCI · Kantonale Familienbeiträge', detail:'Wallis: Arbeitnehmeranteil inklusive Berufsbildungsfonds 0,131 %. Weitere Branchenbeiträge können abweichen.', url:'https://avscvci.ch/employeur-cotisations/employeur-allocations-familiales' },
  { title:'Sozialfonds · Beiträge 2026', detail:'Eintrittsschwelle PK 14.700 CHF, variable NBU-/Taggeldprämien und Höchstverdienst 148.200 CHF.', url:'https://www.sozialfonds.li/Portal/UserFiles/Downloads/Merkbl%C3%A4tter/Beitragspflicht%20Sozialversicherungen%202026.pdf' },
  { title:'ÖGK · Selbstversicherung', detail:'Regelbeitrag 2026: 565,25 Euro monatlich. Herabsetzung nur nach tatsächlicher Bewilligung.', url:'https://www.oegk.at/cdscontent/?contentid=10007.867315' },
  { title:'Liechtenstein · Unfallversicherung', detail:'NBU-Beiträge mit versichertem Höchstverdienst von 148.200 CHF; Prämiensatz ist nicht gesetzlich einheitlich; das Modell schätzt ihn mit 1 %.', url:'https://www.llv.li/de/unternehmen/steuern-abgaben-versicherung/unfallversicherung/leistungen' },
  { title:'Liechtenstein · Lohnausweis', detail:'Arbeitgeberbeitrag zur Krankenversicherung außerhalb des liechtensteinischen Bruttolohns.', url:'https://www.llv.li/servicekonto/steuerverwaltung/lohnausweis-haeufigste-fragen.pdf' },
  { title:'BMF · Kranken- und Vorsorgebeiträge', detail:'Abzugsfähige Pflichtbeiträge und steuerpflichtiger Arbeitgeberzuschuss; freiwillige Zusatzprämien sind nicht pauschal abzugsfähig.', url:'https://findok.bmf.gv.at/findok/volltext?segmentId=5f84fac4-c128-4bdd-9553-889266f4a2d7' },
  { title:'RIS · § 41 EStG · Veranlagung', detail:'Zusätzliche 30-%-Steuerbegrenzung bei ausländischen Sonderzahlungen und Jahressechstel bis 25.000 EUR.', url:'https://ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&FassungVom=2026-10-25&Gesetzesnummer=10004570&Paragraf=41' },
  { title:'RIS · § 67 EStG', detail:'Begünstigte Sonderzahlungen, Jahressechstel, Freibetrag und Freigrenze.', url:'https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004570&Paragraf=67&FassungVom=2026-10-25' },
];
