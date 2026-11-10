import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate,withClosing} from '../dist/core/model.mjs';
import {fxReplay} from '../dist/core/fx.mjs';
import {demoState} from '../dist/core/sample.mjs';
import {loadRates,ecbRate,hasRates} from '../dist/ui/fxrates.mjs';
import {apply,draftFromEvent,fillEcbRates,newDraft,entryFormHTML} from '../dist/ui/entry.mjs';
import {accountsHTML} from '../dist/ui/accounts.mjs';
import {RATES} from '../dist/rates/index.mjs';

await loadRates(['USD','CHF']);

test('the ECB reference rates are looked up on the day or the last business day before',()=>{
 // Werte laut EZB-Datenportal (EXR.D.USD.EUR.SP00.A).
 assert.deepEqual(ecbRate('USD','2023-10-20'),{rate:'1.0591',date:'2023-10-20'});
 assert.deepEqual(ecbRate('USD','2023-10-22'),{rate:'1.0591',date:'2023-10-20'},'Sonntag: Kurs vom Freitag');
 assert.deepEqual(ecbRate('USD','2025-12-25'),{rate:'1.1787',date:'2025-12-24'},'Feiertag');
 assert.deepEqual(ecbRate('USD','2026-02-02'),{rate:'1.184',date:'2026-02-02'});
 assert.deepEqual(ecbRate('USD','1999-01-04'),{rate:'1.1789',date:'1999-01-04'});
 assert.equal(ecbRate('USD','1998-12-31'),null,'vor Beginn der Reihe');
 const after=new Date(Date.parse(RATES.currencies.USD.to)+864e5).toISOString().slice(0,10);
 assert.equal(ecbRate('USD',after),null,'nach dem Ende der hinterlegten Reihe kein Vorschlag');
 assert.equal(hasRates('XYZ'),false);assert.equal(ecbRate('XYZ','2024-01-02'),null);
 assert.ok(ecbRate('CHF','2024-01-02'));
});

function usd(kind='payment'){
 const s=emptyState();
 s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];
 s.accounts=[{id:'a',depotId:'d',name:'USD',currency:'USD',kind},{id:'b',depotId:'d',name:'USD Tagesgeld',currency:'USD',kind:'interest'}];
 return validate(s)&&s;
}

test('without an amount or rate from the statement the ECB rate of the day is used and stored with its source',()=>{
 let s=usd();
 const credit=apply(s,{...newDraft('fx','d',s),kind:'credit',date:'2023-10-22',amount:'1059.10'});
 assert.deepEqual([credit.event.rate,credit.event.rateSource,credit.event.rateDate],['1.0591','ecb','2023-10-20']);
 s=credit.next;
 const m=fxReplay(s,{until:'2023-12-31'}).moves.at(-1);assert.equal(m.eur,'1000');assert.deepEqual(m.quote,{rate:'1.0591',source:'ecb',date:'2023-10-20'});
 // Ein Betrag laut Abrechnung hat Vorrang.
 assert.equal(apply(s,{...newDraft('fx','d',s),kind:'credit',date:'2023-10-23',amount:'10',eur:'9.40'}).event.rateSource,undefined);
 assert.equal(apply(s,{...newDraft('fx','d',s),kind:'credit',date:'2023-10-23',amount:'10',rate:'1,06'}).event.rate,'1.06');
 // Beim Ändern gilt der Kurs des neuen Tages, nicht der alte EZB-Kurs.
 const d=draftFromEvent(s.events[0],s);assert.equal(d.rate,'');assert.equal(d.rateSource,undefined);
 assert.equal(apply(s,{...d,date:'2026-02-02'}).event.rate,'1.184');
 // Übertrag zwischen unverzinsten Konten braucht keinen Kurs, auf ein verzinstes Konto schon.
 s.accounts.push({id:'c',depotId:'d',name:'USD Giro 2',currency:'USD',kind:'payment'});
 assert.equal(apply(s,{...newDraft('fx','d',s),kind:'transfer',date:'2023-11-02',amount:'100',toAccountId:'c'}).event.rate,undefined);
 assert.equal(apply(s,{...newDraft('fx','d',s),kind:'transfer',date:'2023-11-02',amount:'100',toAccountId:'b'}).event.rateSource,'ecb');
 // Übernommener Bestand: Kurs des Anschaffungstags, ohne Anschaffungstag keiner.
 assert.equal(apply(usd(),{...newDraft('fx','d',usd()),kind:'opening',date:'2024-01-01',acquired:'2023-10-20',amount:'100'}).event.rate,'1.0591');
 assert.equal(apply(usd(),{...newDraft('fx','d',usd()),kind:'opening',date:'2024-01-01',amount:'100'}).event.rate,undefined);
 assert.throws(()=>validate({...s,events:[{...s.events[0],rateSource:'bank'}]}),/Herkunft des Devisenkurses/);
});

test('dividends and interest credited in foreign currency take the ECB rate when the statement gives none',()=>{
 const s=demoState();
 const r=apply(s,{...newDraft('distribution','d2',s),securityId:'us',date:'2026-06-12',amount:'50',fxAccount:'a1',fxAmount:'45'});
 assert.equal(r.event.fx.rateSource,'ecb');assert.ok(Number(r.event.fx.rate)>1);
 assert.equal(apply(s,{...newDraft('distribution','d2',s),securityId:'us',date:'2026-06-12',amount:'50',fxAccount:'a1',fxAmount:'45',fxRate:'1,10'}).event.fx.rate,'1.1');
 const html=entryFormHTML(s,{...newDraft('distribution','d2',s),securityId:'us',fxAccount:'a1'});
 assert.match(html,/Leer lassen, dann gilt der EZB-Referenzkurs des Tages/);
});

test('missing euro values of an account can be filled from the ECB rates, except in closed years',()=>{
 let s=usd();
 s.events=[{id:'e1',type:'fx',kind:'credit',date:'2023-10-20',depotId:'d',accountId:'a',amount:'1059.1'},{id:'e2',type:'fx',kind:'credit',date:'2026-02-02',depotId:'d',accountId:'a',amount:'1184'},{id:'e3',type:'fx',kind:'credit',date:'2026-02-03',depotId:'d',accountId:'a',amount:'5',eur:'4'}];
 validate(s);
 assert.match(accountsHTML(s,{year:2026,from:2023}),/data-action="fill-ecb" data-account="a"/);
 const r=fillEcbRates(withClosing(s,'p',2023),'a');
 assert.equal(r.filled,1);assert.equal(r.left,1,'2023 ist abgeschlossen');
 assert.equal(r.next.events.find(e=>e.id==='e2').rate,'1.184');assert.equal(r.next.events.find(e=>e.id==='e1').rate,undefined);
 assert.equal(r.next.audit.at(-1).reason,'EUR-Wert zum EZB-Referenzkurs ergänzt');
 const all=fillEcbRates(s,'a').next;
 assert.deepEqual(fxReplay(all,{until:'2026-12-31'}).moves.map(m=>m.eur),['1000','1000','4']);
 const html=accountsHTML(all,{year:2026,from:2023});
 assert.match(html,/EZB-Referenzkurs 1,0591 vom 20\.10\.2023/);assert.doesNotMatch(html,/data-action="fill-ecb"/);
});
