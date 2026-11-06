import { round } from './calculator.mjs?v=4.23.0';
export const CANTONS=Object.freeze({AG:'Aargau',AI:'Appenzell Innerrhoden',AR:'Appenzell Ausserrhoden',BE:'Bern',BL:'Basel-Landschaft',BS:'Basel-Stadt',FR:'Freiburg',GE:'Genf',GL:'Glarus',GR:'Graubünden',JU:'Jura',LU:'Luzern',NE:'Neuenburg',NW:'Nidwalden',OW:'Obwalden',SG:'St. Gallen',SH:'Schaffhausen',SO:'Solothurn',SZ:'Schwyz',TG:'Thurgau',TI:'Tessin',UR:'Uri',VD:'Waadt',VS:'Wallis',ZG:'Zug',ZH:'Zürich'});
export const ANNUAL_CANTONS=Object.freeze(['FR','GE','TI','VD','VS']);
export async function decodeSwissTariff(packed){
  const bytes=Uint8Array.from(atob(packed),c=>c.charCodeAt(0));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const data=JSON.parse(await new Response(stream).text());
  if(data.year!==2026||!CANTONS[data.canton]||!data.tables)throw new Error('Ungültiger Schweizer Quellensteuertarif.');
  return data;
}
export function swissMonthlyTax(income,canton,code,data){
  if(!Number.isFinite(income)||income<0||!CANTONS[canton]||data?.canton!==canton||data.year!==2026)throw new Error('Schweizer Quellensteuertarif nicht verfügbar.');
  if(income>100000)throw new Error('Die Schweizer Tarif-Näherung unterstützt höchstens 100.000 CHF pro Abrechnungsmonat. Nutze bei höheren Beträgen eine eigene Jahresquellensteuer.');
  let actualCode=code,rows=data.tables[code];
  // Some cantons publish only one church-tax variant, as allowed by the ESTV format.
  if(!rows){actualCode=code.slice(0,2)+(code.endsWith('Y')?'N':'Y');rows=data.tables[actualCode];}
  if(!rows)throw new Error('Diese Schweizer Tarifkombination ist nicht verfügbar. Bitte Familienstand und Kinderabzug prüfen.');
  if(income===0)return {tax:0,rate:0,minimum:0,code:actualCode};
  const cents=Math.ceil(income)*100; // Whole-franc upper bucket for planning, not a payroll rounding promise.
  let lo=0,hi=rows.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(rows[mid][0]<=cents)lo=mid;else hi=mid-1;}
  const [,basisPoints,minimumCents]=rows[lo],rate=basisPoints/10000,minimum=minimumCents/100;
  return {tax:round(Math.max(income*rate,minimum)),rate,minimum,code:actualCode};
}
export function swissAnnualSource({annual,bonus,special,payments,canton,tariff,children,church},data){
  if(!['A','B','C','H'].includes(tariff)||!Number.isInteger(children)||children<0||children>9||tariff==='H'&&children===0)throw new Error('CH-Tarif H benötigt mindestens ein abzugsberechtigtes Kind. Bitte Schweizer Tarifangaben prüfen.');
  const code=`${tariff}${children}${church?'Y':'N'}`,gross=annual+bonus;
  if(ANNUAL_CANTONS.includes(canton)){
    const q=swissMonthlyTax(gross/12,canton,code,data);
    return {...q,tax:round(q.tax*12),model:'annual',periods:[{gross:gross/12,count:12,rate:q.rate}]};
  }
  const regular=(annual-special)/12,extras=Math.max(1,Number(payments)-12);
  const normal=swissMonthlyTax(regular,canton,code,data);
  let tax=normal.tax*(12-extras),periods=[{gross:regular,count:12-extras,rate:normal.rate}];
  for(let i=0;i<extras;i++){
    const current=regular+special/extras+(i===extras-1?bonus:0),q=swissMonthlyTax(current,canton,code,data);
    tax+=q.tax;periods.push({gross:current,count:1,rate:q.rate});
  }
  return {tax:round(tax),rate:gross?tax/gross:0,code:normal.code,model:'monthly',periods};
}
