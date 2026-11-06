import test from 'node:test';
import assert from 'node:assert/strict';
import { FX_ENDPOINT, FX_PROVIDER, decodeQuote, validateQuote, isFreshQuote,
  fetchExchangeRate, createRateController } from '../dist/assets/exchange-rate.mjs';
const now=Date.UTC(2026,9,25,12), hour=3600000;
const payload=(changes={})=>({result:'success',base_code:'CHF',rates:{CHF:1,EUR:1.082391},time_last_update_unix:(now-12*hour)/1000,time_next_update_unix:(now+12*hour)/1000,...changes});
const quote=decodeQuote(payload(),now);
function harness(options={}){
 let value=1.06, calls=0, cached=null;
 const controller=createRateController({getValue:()=>value,setValue:v=>{value=v;},now:()=>now,
  fetchQuote:async()=>{calls++;return quote;},readCache:()=>cached,writeCache:q=>{cached=q;},...options});
 return {controller,get value(){return value;},set value(v){value=v;},get calls(){return calls;},get cached(){return cached;}};
}
test('API verwendet CHF als Basis und EUR pro CHF, auf vier Stellen gerundet',()=>{
 assert.equal(FX_ENDPOINT,'https://open.er-api.com/v6/latest/CHF');assert.equal(quote.rate,1.0824);
 assert.equal(quote.quotedAt,now-12*hour);assert.equal(FX_PROVIDER,'https://www.exchangerate-api.com');
});
test('Falsche Basis, Fehlermeldungen und ungültige Kurse werden abgelehnt',()=>{
 for(const data of [payload({base_code:'EUR'}),payload({result:'error'}),payload({rates:{CHF:2,EUR:1.08}}),payload({rates:{CHF:1,EUR:'1.08'}}),payload({rates:{CHF:1,EUR:0}}),payload({rates:{CHF:1,EUR:-1}}),payload({rates:{CHF:1,EUR:Infinity}}),payload({rates:{CHF:1,EUR:11}}),{}])assert.throws(()=>decodeQuote(data,now));
});
test('Veraltete, zukünftige und unplausible Kurszeitpunkte werden abgelehnt',()=>{
 for(const patch of [{time_last_update_unix:(now-49*hour)/1000},{time_last_update_unix:(now+hour)/1000},{time_next_update_unix:(now-13*hour)/1000},{time_next_update_unix:(now+50*hour)/1000},{time_last_update_unix:'123'}])assert.throws(()=>decodeQuote(payload(patch),now));
});
test('Tagescache gilt nur bis zum angekündigten nächsten Update',()=>{
 assert.equal(isFreshQuote(quote,now),true);assert.equal(isFreshQuote(quote,quote.nextUpdateAt),false);assert.equal(isFreshQuote(null,now),false);assert.equal(isFreshQuote({...quote,rate:'1.08'},now),false);
});
test('HTTP-Anfrage enthält keine Gehaltsdaten, Cookies oder Referrer',async()=>{
 let request;const actual=await fetchExchangeRate({now:()=>now,fetchImpl:async(url,options)=>{request={url,options};return{ok:true,json:async()=>payload()};}});
 assert.equal(actual.rate,1.0824);assert.equal(request.url,FX_ENDPOINT);assert.equal(request.options.credentials,'omit');assert.equal(request.options.referrerPolicy,'no-referrer');assert.equal(request.options.redirect,'error');assert.equal(request.options.body,undefined);
});
test('HTTP-Fehler und ungültiges JSON ändern keinen Kurs',async()=>{
 await assert.rejects(fetchExchangeRate({fetchImpl:async()=>({ok:false,status:429})}),/HTTP 429/);
 await assert.rejects(fetchExchangeRate({fetchImpl:async()=>({ok:true,json:async()=>{throw new SyntaxError('bad JSON');}})}));
});
test('Timeout bricht den API-Abruf ab',async()=>{
 await assert.rejects(fetchExchangeRate({timeoutMs:1,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});})}),/aborted/);
});
test('Erster Abruf übernimmt den Kurs und speichert nur die öffentliche Quote',async()=>{
 const h=harness();assert.equal(await h.controller.refresh(),true);assert.equal(h.value,1.0824);assert.equal(h.calls,1);assert.deepEqual(h.cached,quote);assert.equal(h.controller.state.pending,false);assert.equal(h.controller.metadata().source,'api');
});
test('Frischer Tagescache verhindert wiederholte Anfragen und sperrt weitere Abrufe nicht',async()=>{
 const h=harness({readCache:()=>quote});await h.controller.refresh();assert.equal(h.calls,0);h.value=1.1;h.controller.manualEdit();await h.controller.refresh();assert.equal(h.value,quote.rate);assert.equal(h.calls,0);assert.equal(h.controller.state.pending,false);
});
test('Ein abgelaufener Cache wird neu geladen',async()=>{
 const h=harness({readCache:()=>({...quote,nextUpdateAt:now-1000})});await h.controller.refresh();assert.equal(h.calls,1);assert.equal(h.value,quote.rate);
});
test('Manuelle Eingabe während eines laufenden Abrufs wird nicht überschrieben',async()=>{
 let finish;const h=harness({fetchQuote:()=>new Promise(resolve=>{finish=resolve;})});const request=h.controller.refresh();await Promise.resolve();h.value=1.1234;h.controller.manualEdit();finish(quote);assert.equal(await request,false);assert.equal(h.value,1.1234);assert.equal(h.controller.metadata().automatic,false);assert.equal(h.controller.metadata().source,'manual');
});
test('Importierte Kurssnapshots bleiben auch bei laufendem Abruf unverändert',async()=>{
 let finish;const h=harness({fetchQuote:()=>new Promise(resolve=>{finish=resolve;})});const request=h.controller.refresh();await Promise.resolve();h.value=1.04;h.controller.restore({automatic:true},{snapshot:true});finish(quote);await request;assert.equal(h.value,1.04);assert.equal(h.controller.metadata().automatic,false);assert.equal(h.controller.metadata().snapshot,true);
});
test('Verbindungsfehler behält den vorhandenen Kurs und erlaubt einen manuellen Neuabruf',async()=>{
 let calls=0;const h=harness({fetchQuote:async()=>{calls++;if(calls===1)throw new Error('offline');return quote;}});assert.equal(await h.controller.refresh(),false);assert.equal(h.value,1.06);assert.match(h.controller.state.error,/bisherige Kurs bleibt/);await h.controller.refresh();assert.equal(calls,1);assert.equal(await h.controller.refresh({force:true}),true);assert.equal(h.value,quote.rate);
});
test('Nicht verfügbarer Speicher verhindert den Abruf nicht',async()=>{
 const h=harness({readCache:()=>{throw new Error('denied');},writeCache:()=>{throw new Error('denied');}});assert.equal(await h.controller.refresh(),true);assert.equal(h.value,quote.rate);
});
test('Gleichzeitige Abrufe werden zusammengefasst',async()=>{
 let finish,calls=0;const h=harness({fetchQuote:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});const a=h.controller.refresh(),b=h.controller.refresh();assert.equal(a,b);await Promise.resolve();finish(quote);await a;assert.equal(calls,1);
});
test('Historischer Import zeigt seinen Stand, wird aber nicht als frischer Tagescache akzeptiert',()=>{
 const historical={...quote,quotedAt:now-100*hour,nextUpdateAt:now-76*hour};assert.doesNotThrow(()=>validateQuote(historical,now,false));assert.equal(isFreshQuote(historical,now),false);const h=harness();h.value=quote.rate;h.controller.restore({source:'api',automatic:true,quote:historical},{snapshot:true});assert.equal(h.controller.metadata().source,'api');assert.equal(h.controller.metadata().automatic,false);
});
test('Ältere API-Antwort überschreibt keinen neueren übernommenen Kurs',async()=>{
 const newer={...quote,quotedAt:now-hour,nextUpdateAt:now+23*hour};const h=harness({fetchQuote:async()=>quote});h.value=quote.rate;h.controller.restore({source:'api',quote:newer,automatic:true});assert.equal(await h.controller.refresh({force:true}),false);assert.equal(h.controller.metadata().quote.quotedAt,newer.quotedAt);assert.equal(h.cached,null);
});
