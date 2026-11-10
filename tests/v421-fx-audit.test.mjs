import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {emptyState,validate,upgrade,withEvent,withoutEvent,withRecord,withoutRecord,withPrice,withYear,withYearRules,withBatch,withClosing,lastSelectableYear} from '../dist/core/model.mjs';
import {fxReplay,accountLots,balanceCheckResults} from '../dist/core/fx.mjs';
import {D} from '../dist/core/decimal.mjs';
import {taxYearOf} from '../dist/core/rules.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {undoPlan,undoAudit} from '../dist/core/undo.mjs';
import {accountsHTML} from '../dist/ui/accounts.mjs';
import {lotsBlock,usesTitle} from '../dist/ui/lots.mjs';
import {accountBlock} from '../dist/ui/sheet.mjs';
import {accountStatement} from '../dist/core/fx.mjs';
import {auditHTML,auditTarget} from '../dist/ui/audit.mjs';
import {accountRows,lotTable} from '../dist/ui/xlsx.mjs';
import {accountsPdf} from '../dist/ui/pdf.mjs';
import {draftToEvent,newDraft,fxFormHTML} from '../dist/ui/entry.mjs';
import {pricesHTML} from '../dist/ui/prices.mjs';

const A={id:'a',personId:'p',bank:'Bank A',name:'USD Zahlung',currency:'USD',kind:'payment'};
const B={id:'b',personId:'p',bank:'Bank B',name:'USD Zweitkonto',currency:'USD',kind:'payment'};
const C={id:'c',personId:'p',bank:'Bank A',name:'CHF Zahlung',currency:'CHF',kind:'payment'};
const I={id:'i',personId:'p',bank:'Bank C',name:'USD Tagesgeld',currency:'USD',kind:'interest'};
const K={id:'k',personId:'q',bank:'Bank A',name:'CHF Kind',currency:'CHF',kind:'payment'};
function base(events=[]){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person Eins'},{id:'q',name:'Kind Eins'}];
 s.accounts=[A,B,C,I,K].map(x=>({...x}));s.events=events;validate(s);return s;
}
const IN={id:'e1',type:'fx',kind:'exchangeIn',date:'2025-01-10',accountId:'a',amount:'1000',eur:'900'};
const debits=(from,to,amount='100')=>{const list=[];for(let y=from;y<=to;y++)list.push({id:`d${y}`,type:'fx',kind:'debit',date:`${y}-07-01`,accountId:'a',amount,eur:'95'});return list;};

test('Lange Zeiträume: höchstens die jüngsten Jahresspalten, ältere Abgänge zusammen',()=>{
 const s=base([{...IN,date:'2020-01-10'},...debits(2021,2026)]);
 const all=accountLots(s,'a',2021,2026),cut=accountLots(s,'a',2021,2026,{maxYears:3}),[r]=cut.rows;
 assert.deepEqual(all.years,[2021,2022,2023,2024,2025,2026]);assert.equal(all.earlierUntil,2020);
 // Abgänge 2021–2023 (3 × 100 USD) stehen in „Abgang bis 2023“; 2024–2026 einzeln; Rest 1.000 − 600 = 400 USD.
 assert.deepEqual(cut.years,[2024,2025,2026]);assert.equal(cut.earlierUntil,2023);
 assert.equal(r.earlier,'300');assert.equal(r.perYear[2024],'100');assert.equal(r.rest,'400');assert.equal(cut.totals.earlier,'300');
 assert.equal(D(r.earlier)+[2024,2025,2026].reduce((t,y)=>t+D(r.perYear[y]),0n)+D(r.rest),D(r.amount),'Zeile geht auf');
 assert.ok(lotTable(cut).head.includes('Abgang bis 2023'));assert.match(lotsBlock(cut),/Abgang bis 2023/);
 // Seite und PDF begrenzen auf fünf Jahre, Excel zeigt jedes Jahr.
 assert.match(accountsHTML(s,{year:2026,from:2021,personId:'p'}),/Abgang bis 2021/);
 const pdfHead=accountRows(s,[s.accounts[0]],2021,2026,{maxYears:5}).find(row=>row[0]==='Herkunft');
 assert.ok(pdfHead.includes('Abgang bis 2021')&&!pdfHead.includes('Abgang 2021'));
 assert.ok(accountRows(s,[s.accounts[0]],2021,2026).find(row=>row[0]==='Herkunft').includes('Abgang 2021'));
});

test('Lange Zeiträume passen im PDF auf die Seite (15 Jahre mit Abgängen)',async()=>{
 const req=createRequire(import.meta.url),{jsPDF}=req('jspdf'),at=req('jspdf-autotable');
 const s=base([{...IN,date:'2026-01-10',amount:'5000',eur:'4500'},...debits(2027,2041,'50')]),said=[];
 const keep={log:console.log,warn:console.warn,error:console.error};
 for(const k of Object.keys(keep))console[k]=(...x)=>said.push(x.join(' '));
 try{accountsPdf(s,{year:2041,from:2026},{jsPDF,autoTable:at.autoTable||at.default});}finally{Object.assign(console,keep);}
 assert.deepEqual(said.filter(x=>/could not fit/.test(x)),[]);
});

test('Umtausch in eine andere Fremdwährung: Veräußerung der einen, neues Los der anderen zum selben EUR-Wert',()=>{
 const ex={id:'x',type:'fx',kind:'exchange',date:'2025-06-01',accountId:'a',toAccountId:'c',amount:'400',toAmount:'360',eur:'380'};
 const back={id:'y',type:'fx',kind:'exchangeOut',date:'2025-09-01',accountId:'c',amount:'360',eur:'390'};
 const s=base([IN,ex,back]),r=fxReplay(s,{until:'2025-12-31'});
 const out=r.moves.find(m=>m.eventId==='x'&&m.direction==='out'),inn=r.moves.find(m=>m.eventId==='x'&&m.direction==='in');
 // 400 USD aus dem Los 1.000 USD für 900 €: Anschaffung 360 €, Wert des Tauschs 380 € – Gewinn 20 €, innerhalb eines Jahres.
 assert.equal(out.realized,true);assert.equal(out.regime,'private');assert.equal(out.cost,'360');assert.equal(out.gain,'20');assert.equal(out.taxable,'20');
 assert.equal(out.label,'Umtausch in CHF (CHF Zahlung)');assert.equal(out.balance,'600');
 assert.equal(inn.accountId,'c');assert.equal(inn.amount,'360');assert.equal(inn.eur,'380');assert.equal(inn.label,'Umtausch aus USD (USD Zahlung)');
 // Das CHF-Los beginnt am Tag des Tauschs mit 380 €; Rücktausch für 390 € ergibt 10 € Gewinn.
 const sold=r.moves.find(m=>m.eventId==='y');assert.equal(sold.cost,'380');assert.equal(sold.gain,'10');
 const lots=accountLots(s,'c',2025,2025);assert.equal(lots.rows[0].acquired,'2025-06-01');assert.equal(lots.rows[0].origin,'Umtausch aus USD (USD Zahlung)');
 // Vom verzinsten Konto ist der Tausch Kapitalertrag (§ 20 EStG).
 const fromI=base([{...IN,accountId:'i'},{...ex,accountId:'i'}]),cap=fxReplay(fromI,{until:'2025-12-31'}).moves.find(m=>m.eventId==='x'&&m.direction==='out');
 assert.equal(cap.regime,'capital');assert.equal(cap.gain,'20');
});

test('Umtausch: Zielkonto eigene Person, andere Währung, Zielbetrag nötig',()=>{
 const ex={id:'x',type:'fx',kind:'exchange',date:'2025-06-01',accountId:'a',toAccountId:'c',amount:'400',toAmount:'360',eur:'380'};
 assert.throws(()=>base([IN,{...ex,toAccountId:'b'}]),/andere Währung/);
 assert.throws(()=>base([IN,{...ex,toAccountId:'k'}]),/eigenes Konto/);
 assert.throws(()=>base([IN,{...ex,toAmount:undefined}]),/Betrag in CHF fehlt/);
 assert.throws(()=>base([IN,{id:'g',type:'fx',kind:'credit',date:'2025-02-01',accountId:'a',amount:'5',eur:'4',toAmount:'5'}]),/Zielbetrag/);
 const s=base([IN]),d={...newDraft('fx','',s),accountId:'a',kind:'exchange',date:'2025-06-01',toAccountId:'c',amount:'400',toAmount:'360',eur:'380'};
 const {event}=draftToEvent(s,d);assert.equal(event.toAmount,'360');assert.equal(event.toAccountId,'c');
 const html=fxFormHTML(s,d),target=/<select name="toAccountId"[^>]*>(.*?)<\/select>/.exec(html)[1];
 assert.match(html,/Betrag in CHF/);assert.match(target,/CHF Zahlung · CHF</);assert.doesNotMatch(target,/CHF Kind/,'nur eigene Konten');assert.doesNotMatch(target,/value="b"/,'nur andere Währungen');
});

test('Kontostand laut Bank: Vergleich mit dem gebuchten Bestand, Sperre im abgeschlossenen Jahr',()=>{
 const old=base([IN,{id:'o',type:'fx',kind:'debit',date:'2025-05-01',accountId:'a',amount:'10',eur:'9'}]);delete old.balanceChecks;
 assert.equal(upgrade(structuredClone(old)).balanceChecks.length,0);
 const s=withRecord(old,'balanceChecks',{id:'c1',accountId:'a',date:'2025-12-31',balance:'980'});
 const [c]=balanceCheckResults(s);assert.equal(c.booked,'990');assert.equal(c.difference,'-10');
 const html=accountsHTML(s,{year:2025,personId:'p'});
 assert.match(html,/Laut Bank 31\.12\.2025/);assert.match(html,/Differenz -10 USD/);assert.match(html,/Fehlt eine Bewegung\?/);
 const ok=withRecord(s,'balanceChecks',{id:'c1',accountId:'a',date:'2025-12-31',balance:'990'});
 assert.equal(balanceCheckResults(ok)[0].difference,'0');assert.match(accountsHTML(ok,{year:2025,personId:'p'}),/stimmt/);
 assert.ok(accountRows(ok,[ok.accounts[0]],2025,2025).some(row=>row[0]==='Kontostand laut Bank'&&row[8]==='stimmt mit dem Bestand'));
 assert.throws(()=>withRecord(ok,'balanceChecks',{id:'c2',accountId:'a',date:'2025-12-31',balance:'1'}),/doppelt/);
 assert.throws(()=>withoutRecord(withRecord(ok,'balanceChecks',{id:'cb',accountId:'b',date:'2025-12-31',balance:'0'}),'accounts','b'),/Kontostände/,'Konto ohne Buchungen, aber mit Kontostand');
 const closed=withClosing(ok,'p',2025);
 assert.throws(()=>withRecord(closed,'balanceChecks',{id:'c1',accountId:'a',date:'2025-12-31',balance:'995'}),/abgeschlossen/);
 assert.equal(closed.audit.find(x=>x.collection==='balanceChecks').action,'Kontostand laut Bank angelegt');
});

test('Protokoll: Änderung, Erfassung und Löschung eines Vorgangs zurücknehmen',()=>{
 const s1=withEvent(base(),IN),s2=withEvent(s1,{...IN,amount:'1200'});
 const change=undoPlan(s2,1);assert.equal(change.ok,true);assert.equal(change.label,'Vorgang auf den Stand vor dieser Änderung zurücksetzen');assert.equal(change.later,0);
 const back=undoAudit(s2,1);assert.equal(back.events[0].amount,'1000');
 const last=back.audit.at(-1);assert.equal(last.action,'Vorgang geändert');assert.match(last.reason,/Zurückgenommen aus dem Protokoll/);
 assert.equal(undoPlan(s2,0).later,1,'danach noch einmal geändert');assert.equal(undoAudit(s2,0).events.length,0,'Erfassung zurückgenommen');
 const s3=withoutEvent(s2,'e1'),restore=undoPlan(s3,2);assert.equal(restore.label,'Gelöschten Vorgang wiederherstellen');
 assert.equal(undoAudit(s3,2).events[0].amount,'1200');
 assert.equal(undoPlan(back,back.audit.length-1).ok,true,'auch die Rücknahme lässt sich zurücknehmen');
 assert.deepEqual(undoPlan(withEvent(s2,{...IN}),1),{ok:false,reason:'Der Vorgang hat schon diesen Stand.'});
 // Im abgeschlossenen Jahr gesperrt wie jede Änderung.
 assert.throws(()=>undoAudit(withClosing(s2,'p',2025),1),/2025 ist abgeschlossen/);
});

test('Protokoll: Kurse, Jahreswerte, Jahresdaten und Stammdaten zurücknehmen',()=>{
 let s=base();s.securities=[{id:'etf',name:'Fiktiver ETF',kind:'equityFund'}];
 s=withPrice(s,'etf','2026-03-02','100');s=withPrice(s,'etf','2026-03-02','105');
 assert.equal(undoAudit(s,1).prices[0].price,'100');assert.equal(undoAudit(s,0).prices.length,0);
 s=withYearRules(s,2027,{baseRate:'0.025'});assert.equal(undoAudit(s,s.audit.length-1).yearRules,undefined);
 s=withYear(s,'p',2026,{churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0'});
 const off=undoAudit(s,s.audit.length-1);assert.equal(off.years.p,undefined);assert.equal(off.audit.at(-1).action,'Jahresdaten zurückgenommen');
 assert.equal(undoAudit(off,off.audit.length-1).years.p[2026].churchRate,'0','Rücknahme der Rücknahme');
 s=withRecord(s,'persons',{id:'x',name:'Neu'});s=withRecord(s,'persons',{id:'x',name:'Umbenannt'});
 assert.equal(undoAudit(s,s.audit.length-1).persons.find(p=>p.id==='x').name,'Neu');
 const gone=withoutRecord(s,'persons','x');assert.match(undoPlan(gone,gone.audit.length-1).reason,/Jahresdaten/);
 assert.equal(undoPlan(withClosing(base(),'p',2025),0).ok,false,'Abschluss nur über den Jahresabschluss');
});

test('Protokoll: Schenkung an mehrere wird als Ganzes zurückgenommen',()=>{
 let s=base();s.persons.push({id:'r',name:'Kind Zwei'});
 s.depots=[{id:'d1',personId:'p',name:'Depot',bank:'Bank'},{id:'d3',personId:'q',name:'Kind',bank:'Bank'},{id:'d4',personId:'r',name:'Kind 2',bank:'Bank'}];
 s.securities=[{id:'etf',name:'Fiktiver ETF',kind:'equityFund'}];
 s=withEvent(s,{id:'b1',type:'buy',date:'2024-03-01',depotId:'d1',securityId:'etf',quantity:'100',amount:'5000'});
 const gift=(id,to,q)=>({id,type:'transfer',kind:'gift',date:'2026-01-13',depotId:'d1',toDepotId:to,securityId:'etf',quantity:q,price:'60',batchId:'gb',allocation:'sequence'});
 s=withBatch(s,'gb',[gift('g1','d3','10'),gift('g2','d4','20')]);
 const created=s.audit.findIndex(a=>a.ref==='g2');
 const none=undoAudit(s,created);assert.equal(none.events.filter(e=>e.batchId==='gb').length,0,'beide Empfänger weg');
 const again=undoAudit(none,none.audit.length-1);assert.deepEqual(again.events.filter(e=>e.batchId==='gb').map(e=>e.quantity),['10','20']);
});

test('Protokoll: „Öffnen“ kennt das Ziel jedes Eintrags, die Seite zeigt Öffnen und Rückgängig',()=>{
 let s=withEvent(base(),IN);s.securities=[{id:'etf',name:'Fiktiver ETF',kind:'equityFund'}];
 s=withPrice(s,'etf','2026-03-02','100');s=withYearRules(s,2027,{baseRate:'0.025'});s=withYear(s,'p',2026,{churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0'});
 s=withRecord(s,'balanceChecks',{id:'c1',accountId:'a',date:'2025-12-31',balance:'1000'});
 const kinds=s.audit.map(a=>auditTarget(s,a)?.kind);
 assert.deepEqual(kinds,['event','prices','rules','tax','balance']);
 assert.equal(auditTarget(withoutEvent(s,'e1'),{action:'Vorgang erfasst',ref:'e1'}),null,'gelöscht: nur Rückgängig');
 const html=auditHTML(s);assert.equal((html.match(/data-action="audit-open"/g)||[]).length,5);assert.equal((html.match(/data-action="audit-undo"/g)||[]).length,5);
});

test('Viele Lose: Hinweis zusammengefasst, Monate in großen Jahren, Zustand bleibt nach dem Speichern',()=>{
 const uses=n=>({uses:Array.from({length:n},(_,i)=>({date:`2026-01-${String(i+1).padStart(2,'0')}`,amount:'1',label:'Zahlung'}))});
 assert.match(usesTitle(uses(3)),/^Verbraucht: 01\.01\.2026 1 \(Zahlung\); /);
 const many=usesTitle(uses(20));assert.match(many,/^Verbraucht durch 20 Abgänge vom 01\.01\.2026 bis 20\.01\.2026, zuletzt: 18\.01\.2026/);assert.ok(many.length<300);
 const events=[];for(let i=0;i<30;i++)events.push({id:`z${i}`,type:'interest',date:`2025-${String(i%12+1).padStart(2,'0')}-${String(Math.floor(i/12)+10)}`,amount:'2',fx:{accountId:'a',amount:'2',rate:'1'}});
 const s=base(events),m=accountLots(s,'a',2025,2025);
 const closed=lotsBlock(m,null,{key:'k'});assert.match(closed,/data-group="2025-01"/);assert.match(closed,/<td>Januar 2025<\/td><td>3 Lose, 3 offen<\/td>/);assert.match(closed,/<tbody data-parent="2025" data-group="2025-01" hidden>/);
 const open=lotsBlock(m,null,{key:'k',open:new Map([['k:2025',true],['k:2025-01',true],['k:lots',true]])});
 assert.match(open,/<tbody data-parent="2025" data-group="2025-01">/);assert.match(open,/<tbody data-parent="2025-01">/);assert.match(open,/class="block lots"[^>]* open>/);
 assert.match(open,/<tbody data-parent="2025-02" hidden>/,'nicht geöffnete Monate bleiben zu');
 // Kontoblatt ab 30 Bewegungen zugeklappt, mit Bestand im Kopf; gemerkter Zustand gilt.
 const st=accountStatement(s,'a',2025,2025);
 assert.doesNotMatch(accountBlock(st,()=>false,{key:'k'}),/ open>/);assert.match(accountBlock(st,()=>false,{key:'k'}),/30 Bewegungen · Bestand 31\.12\.2025: 60 USD/);
 assert.match(accountBlock(st,()=>false,{key:'k',open:new Map([['k:tax',true]])}),/class="block account fold"[^>]* open>/);
});

test('Folgejahre: Kursseite zeigt zehn Jahre und auf Wunsch alle, Abschluss ohne Obergrenze',()=>{
 // Buchung 2090: unabhängig vom heutigen Datum das letzte gebuchte Jahr.
 const s=base([{...IN,date:'2090-02-01'}]);s.securities=[{id:'etf',name:'Fiktiver ETF',kind:'equityFund'}];validate(s);
 const cols=h=>(h.match(/<th>20\d\d<small>Anfang/g)||[]).map(x=>Number(x.slice(4,8)));
 assert.deepEqual(cols(pricesHTML(s,{vatYear:2090})),[2081,2082,2083,2084,2085,2086,2087,2088,2089,2090]);
 assert.match(pricesHTML(s,{vatYear:2090}),/64 frühere Jahre ausgeblendet/);
 const all=pricesHTML(s,{vatYear:2090,from:2017});assert.equal(cols(all).length,73);assert.equal(cols(all)[0],2018);assert.match(all,/<th>31\.12\.2017<small>Übergang/);
 assert.deepEqual(cols(pricesHTML(s,{vatYear:2090,from:2050})).slice(0,2),[2050,2051],'„Jahre ab“ wählt den Beginn');
 // Jahreswerte bis zum letzten gebuchten Jahr; welche zugeklappt sind, hängt vom heutigen Datum ab.
 const values=pricesHTML(s,{vatYear:2090});assert.match(values,/data-year-rule="baseRate" data-year="2090"/);assert.match(values,/<th scope="row">2026<\/th>/);
 const closed=structuredClone(s);closed.closing={p:2150};assert.equal(validate(closed),true,'Abschluss ohne Obergrenze');
});

test('Folgejahre ohne Grenze: 2040 rechnet nach geltendem Recht, Jahre sind wählbar',()=>{
 const s=base([{...IN,date:'2039-02-01'},{id:'o',type:'fx',kind:'exchangeOut',date:'2040-01-15',accountId:'a',amount:'500',eur:'470'}]);
 assert.equal(taxYearOf(s,2040).allowance,'1000');assert.equal(taxYearOf(s,2040).continued,true);
 assert.ok(lastSelectableYear(s)>=2040);
 const r=yearReport(s,'p',2040);assert.notEqual(r.status,'unsupported');assert.equal(r.privateSales.limit,'1000');
 // 500 USD aus 1.000 USD für 900 €: Anschaffung 450 €, Erlös 470 €; innerhalb eines Jahres, unter der Freigrenze steuerfrei.
 assert.equal(r.privateSales.total,'20');assert.equal(r.privateSales.taxable,'0');
});
