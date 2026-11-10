import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate,withholdingOf} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {demoState} from '../dist/core/sample.mjs';
import {entryFormHTML,draftToEvent,draftFromEvent} from '../dist/ui/entry.mjs';
import {eventRows} from '../dist/ui/xlsx.mjs';

// Fiktive Person, Kirchenaustritt Ende März, Sparer-Pauschbetrag anderswo verbraucht.
// Die Bank behält für die Dividende noch Kirchensteuer für das ganze Jahr ein.
function dividend(taxes={capitalTax:'244.50',solidarity:'13.44',churchTax:'22.00'}){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person'}];s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot'}];
 s.securities=[{id:'C',isin:'DE1',name:'Fiktive AG',kind:'stock'}];
 s.events=[{id:'o',type:'opening',date:'2025-12-31',depotId:'d',securityId:'C',quantity:'100',cost:'1000',group:'from2018',acquired:'2021-01-01'},
  {id:'div',type:'distribution',date:'2026-07-01',depotId:'d',securityId:'C',amount:'1000',...taxes}];
 s.years={p:{2026:{churchRate:'0.09',churchUntil:3,externalAllowance:'1000',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'}}};
 return s;
}

test('bank tax is captured per tax type and compared per type against the model',()=>{
 const s=dividend();validate(s);
 const m=replay(s).moves.find(x=>x.type==='distribution');
 assert.equal(m.income.withheld,'279.94');assert.deepEqual(m.income.taxes,{capitalTax:'244.50',solidarity:'13.44',churchTax:'22.00'});
 const r=yearReport(s,'p',2026);
 // Modell: k = 9 % × 3/12; 1.000 € / 4,0225 = 248,60 € KapESt, 13,67 € Soli, 5,59 € KiSt.
 assert.deepEqual([r.capitalTax,r.solidarity,r.churchTax,r.total],['248.6','13.67','5.59','267.86']);
 assert.equal(r.withholding[0].source,'events');assert.deepEqual(r.withholding[0].parts,{capitalTax:'244.5',solidarity:'13.44',churchTax:'22'});
 assert.equal(r.bankWithheld,'279.94');assert.equal(r.difference,'12.08');
 // Die Kirchensteuer nach dem Austritt ist zu viel einbehalten, KapESt und Soli zu wenig.
 assert.deepEqual(r.taxDifference,{capitalTax:'-4.1',solidarity:'-0.23',churchTax:'16.41'});
});

test('an older entry with only the total still counts, but without the per-type comparison',()=>{
 const s=dividend({withheld:'279.94'});validate(s);
 assert.deepEqual(withholdingOf(s.events[1]),{total:'279.94',parts:null});
 const r=yearReport(s,'p',2026);
 assert.equal(r.bankWithheld,'279.94');assert.equal(r.withholding[0].parts,null);assert.equal(r.bankTaxes,null);assert.equal(r.taxDifference,null);
 // Die Jahressteuerbescheinigung liefert die Steuerarten ohnehin.
 s.certificates=[{id:'c',personId:'p',bank:'Bank A',year:2026,capitalTax:'244.50',solidarity:'13.44',churchTax:'22.00'}];
 assert.deepEqual(yearReport(s,'p',2026).taxDifference,{capitalTax:'-4.1',solidarity:'-0.23',churchTax:'16.41'});
});

test('tax parts come together, not mixed with a total, and only where a deduction exists',()=>{
 const s=dividend();
 const bad=(patch,msg)=>assert.throws(()=>validate({...s,events:[s.events[0],{...s.events[1],...patch}]}),msg);
 bad({churchTax:undefined},/zusammen angeben/);
 bad({withheld:'279.94'},/entweder einzeln oder als Summe/);
 bad({capitalTax:'-1'},/Kapitalertragsteuer darf nicht negativ sein/);
 assert.throws(()=>validate({...s,events:[...s.events,{id:'x',type:'split',date:'2026-08-01',depotId:'d',securityId:'C',ratio:'2',capitalTax:'1',solidarity:'0',churchTax:'0'}]}),/kein Steuerabzug vorgesehen/);
 // Beim Verkauf erstattet die Bank nach Verlustverrechnung: dann negativ.
 const refund={...s,events:[...s.events,{id:'v',type:'sell',date:'2026-09-01',depotId:'d',securityId:'C',quantity:'100',amount:'500',capitalTax:'-125',solidarity:'-6.87',churchTax:'-11.25'}]};
 validate(refund);assert.equal(replay(refund).moves.find(m=>m.type==='sell').withheld,'-143.12');
});

test('the form asks for the three taxes; empty ones count as zero once one is filled',()=>{
 const s=dividend({}),d={type:'distribution',date:'2026-07-01',depotId:'d',securityId:'C',amount:'1.000',capitalTax:'244,50',solidarity:'13,44',churchTax:''};
 const html=entryFormHTML(s,d);
 for(const label of ['Kapitalertragsteuer (optional)','Solidaritätszuschlag','Kirchensteuer'])assert.ok(html.includes(`<span>${label}</span>`),label);
 assert.doesNotMatch(html,/name="withheld"/);
 const {event}=draftToEvent(s,d);assert.deepEqual([event.capitalTax,event.solidarity,event.churchTax,event.withheld],['244.5','13.44','0',undefined]);
 // Älterer Eintrag mit Summe: bleibt, bis einzeln eingetragen wird.
 const old=draftFromEvent({...s.events[0],id:'div',type:'distribution',date:'2026-07-01',amount:'1000',withheld:'279.94'},s);
 assert.match(entryFormHTML(s,old),/Bisher nur als Summe erfasst: 279,94 €/);
 assert.equal(draftToEvent(s,old).event.withheld,'279.94');
 assert.deepEqual((({capitalTax,solidarity,churchTax,withheld})=>({capitalTax,solidarity,churchTax,withheld}))(draftToEvent(s,{...old,capitalTax:'244,50',solidarity:'13,44',churchTax:'22'}).event),{capitalTax:'244.5',solidarity:'13.44',churchTax:'22',withheld:undefined});
});

test('the demo carries split taxes and Excel lists them per event',()=>{
 const s=demoState();validate(s);
 const rows=eventRows(s,{from:2025,to:2025});
 const head=rows[0],sale=rows.find(r=>r[1]==='Verkauf');
 assert.deepEqual(head.slice(7,12),['Betrag','Steuerabzug','Kapitalertragsteuer','Solidaritätszuschlag','Kirchensteuer']);
 assert.deepEqual(sale.slice(8,12),[1340.2,1170.49,64.37,105.34]);
});
