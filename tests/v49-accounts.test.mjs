import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {emptyState,validate,withEvent,withRecord,withoutRecord,withClosing,eventPersons,accountHolder} from '../dist/core/model.mjs';
import {fxReplay} from '../dist/core/fx.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {accountsHTML} from '../dist/ui/accounts.mjs';
import {masterHTML} from '../dist/ui/master.mjs';
import {entryFormHTML,newDraft,apply} from '../dist/ui/entry.mjs';
import {workbook} from '../dist/ui/xlsx.mjs';
import {overviewPdf} from '../dist/ui/pdf.mjs';

// Währungskonto ohne Depot: gehört einer Person und trägt seine eigene Bank. Erfundene Werte.
const PARAMS={churchRate:'0',stockLossCarry:'0',otherLossCarry:'0',externalAllowance:'1000',protectedRemaining:'100000'};
function base(){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person A'},{id:'q',name:'Person B'}];
 s.accounts=[{id:'u',personId:'p',bank:'Bank X',name:'USD-Tagesgeld',currency:'USD',kind:'interest'}];
 s.years={p:{2026:{...PARAMS}}};
 s.events=[{id:'in',type:'fx',kind:'exchangeIn',date:'2026-01-05',accountId:'u',amount:'1000',eur:'900'},
  {id:'z',type:'interest',date:'2026-03-31',amount:'20',withheld:'5.28',fx:{accountId:'u',amount:'21.6',rate:'1.08'}},
  {id:'out',type:'fx',kind:'exchangeOut',date:'2026-06-01',accountId:'u',amount:'500',eur:'480'}];
 validate(s);return s;
}

test('a currency account works without any depot: holder and bank come from the account',()=>{
 const s=base();assert.equal(s.depots.length,0);
 assert.deepEqual(accountHolder(s,s.accounts[0]),{personId:'p',bank:'Bank X',abroad:false,depot:null});
 assert.throws(()=>validate({...s,accounts:[{...s.accounts[0],bank:''}]}),/Bank fehlt/);
 assert.throws(()=>validate({...s,accounts:[{...s.accounts[0],personId:'x'}]}),/Inhaber fehlt/);
 assert.throws(()=>withEvent(s,{type:'fx',kind:'credit',date:'2026-02-02',depotId:'d',accountId:'u',amount:'1',eur:'1'}),/gehört zu keinem Depot/);
 assert.throws(()=>withEvent(s,{type:'interest',date:'2026-02-02',amount:'1'}),/Depot oder Währungskonto/);
 assert.deepEqual(eventPersons(s,s.events[0]),['p']);assert.deepEqual(eventPersons(s,s.events[1]),['p']);
});

test('gains and interest of a stand-alone account count for its holder and its own bank',()=>{
 let s=base();
 const move=fxReplay(s,{until:'2026-12-31'}).moves.find(m=>m.eventId==='out');
 assert.deepEqual([move.personId,move.bank,move.cost,move.gain],['p','Bank X','450','30']);
 let r=yearReport(s,'p',2026);
 assert.equal(r.status,'supported');assert.deepEqual(r.items.map(i=>[i.kind,i.taxable]),[['interest','20'],['fx','30']]);assert.equal(r.taxable,'50');
 // Bank X: Steuer auf den Zins ist bekannt, auf den Währungsgewinn steht sie nur in der Bescheinigung.
 assert.deepEqual(r.withholding.map(w=>[w.bank,w.source,w.amount]),[['Bank X','events',null]]);
 s.certificates=[{id:'c',personId:'p',bank:'Bank X',year:2026,capitalTax:'12.5',solidarity:'0.68',churchTax:'0'}];validate(s);
 r=yearReport(s,'p',2026);assert.equal(r.bankWithheld,'13.18');assert.equal(r.difference,'0');
 // Ausländische Bank: kein deutscher Steuerabzug, Werte für die Anlage KAP.
 s=base();s.accounts[0].abroad=true;validate(s);r=yearReport(s,'p',2026);
 assert.deepEqual(r.withholding.map(w=>[w.bank,w.source,w.amount]),[['Bank X','abroad','0']]);assert.equal(r.abroad.kap.income,'50');
 assert.equal(yearReport(s,'q',2026).status,'none');
});

test('stand-alone accounts follow the year closing of their holder and stay tied to their holder',()=>{
 const s=base(),closed=withClosing({...s,events:s.events.map(e=>({...e,date:e.date.replace('2026','2025')})),years:{p:{2025:{...PARAMS}}}},'p',2025);
 assert.throws(()=>withEvent(closed,{type:'fx',kind:'credit',date:'2025-07-01',accountId:'u',amount:'1',eur:'1'}),/abgeschlossen/);
 assert.throws(()=>withRecord(s,'accounts',{...s.accounts[0],personId:'q'}),/Inhaber bleiben fest/);
 assert.throws(()=>withoutRecord(s,'persons','p'),/Währungskonten/);
 // Ein Depot ist nicht nötig, darf aber weiterhin gewählt werden.
 const withDepot={...s,depots:[{id:'d',personId:'p',bank:'Bank Y',name:'Depot'}],accounts:[...s.accounts,{id:'v',depotId:'d',name:'USD am Depot',currency:'USD',kind:'payment'}]};validate(withDepot);
 assert.deepEqual(accountHolder(withDepot,withDepot.accounts[1]),{personId:'p',bank:'Bank Y',abroad:false,depot:withDepot.depots[0]});
});

test('master data, accounts page and entry offer accounts and interest without a depot',async()=>{
 const s=base();
 const master=masterHTML(s,{editing:null});
 assert.match(master,/<option value="person:p" [^>]*>Person A – eigenes Konto ohne Depot<\/option>/);assert.match(master,/name="bank"/);assert.match(master,/USD · Person A · eigenes Konto · Bank X/);
 const page=accountsHTML(s,{year:2026,personId:'p'});
 assert.match(page,/USD-Tagesgeld/);assert.match(page,/Person A · eigenes Konto · Bank X/);assert.match(page,/data-action="entry-interest" data-account="u"/);
 assert.doesNotMatch(accountsHTML(s,{year:2026,personId:'q'}),/USD-Tagesgeld/);
 const d={...newDraft('interest','',s),depotId:'',fxAccount:'u',date:'2026-09-30',amount:'10',fxAmount:'10,8',fxRate:'1,08'};
 const form=entryFormHTML(s,d);
 assert.match(form,/<option value="" selected>Ohne Depot – Zinsen auf ein Währungskonto<\/option>/);assert.doesNotMatch(form,/Nein, in EUR abgerechnet/);
 const r=apply(s,d);assert.equal(r.event.depotId,undefined);assert.deepEqual(r.event.fx,{accountId:'u',amount:'10.8',rate:'1.08'});
 const book=await workbook(s,2026,ExcelJS,{from:2026,personId:'p'});assert.ok(book.worksheets.some(w=>w.name==='Konten Person A'));
 const pdf=overviewPdf(s,{year:2026,from:2026,personId:'p'},{jsPDF:function(o){return new jsPDF({...o,compress:false});},autoTable}).output();
 assert.ok(pdf.includes('Konten ohne Depot'));assert.ok(pdf.includes('USD-Tagesgeld'));
});
