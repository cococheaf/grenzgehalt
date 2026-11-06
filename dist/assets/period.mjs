// Public display periods distinguish a normal salary payment from the full year.
const PERIODS=Object.freeze({
  monthly:Object.freeze({code:'monthly',basis:'regular_month',label:'im normalen Monat',column:'Normaler Monat',unit:'Monat',available:'Verfügbar im normalen Monat'}),
  annual:Object.freeze({code:'annual',basis:'annual_total',label:'pro Jahr',column:'Jahr gesamt',unit:'Jahr',available:'Verfügbares Jahresbudget'}),
});
export function displayPeriod(code){if(!PERIODS[code])throw new Error('Ungültiger Anzeigezeitraum.');return PERIODS[code];}
export function oppositePeriod(code){displayPeriod(code);return code==='monthly'?'annual':'monthly';}
