export function parseNumber(raw,grouping=true){
  if(typeof raw==='number')return Number.isFinite(raw)?raw:NaN;
  const value=String(raw??'').trim().replace(/[\s\u00a0\u202f]/g,'');
  if(!value)return 0;
  if(!/^[+]?[0-9.,]+$/.test(value))return NaN;
  if(!grouping){if((value.match(/[.,]/g)||[]).length>1)return NaN;return Number(value.replace(',','.'));}
  let normalized=value;
  if(value.includes(',')){
    if((value.match(/,/g)||[]).length!==1)return NaN;
    const [integer,decimal]=value.split(',');
    if(integer.includes('.')&&!/^\d{1,3}(\.\d{3})+$/.test(integer))return NaN;
    if(decimal.includes('.'))return NaN;
    normalized=integer.replaceAll('.','')+'.'+decimal;
  }else if(/^\d{1,3}(\.\d{3})+$/.test(value))normalized=value.replaceAll('.','');
  else if((value.match(/\./g)||[]).length>1)return NaN;
  return Number(normalized);
}
