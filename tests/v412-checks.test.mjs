import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {statement} from '../dist/core/statement.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {taxPageHTML} from '../dist/ui/taxpage.mjs';
import {taxRows} from '../dist/ui/xlsx.mjs';
import {entryFormHTML,draftToEvent} from '../dist/ui/entry.mjs';

// Fiktive Person mit einer Aktie und einem Aktienfonds bei einer deutschen Bank.
// Fonds: Basiszins 2024 2,29 %, Kurs 100 → 120 € – Vorabpauschale 2024 = 100 × 70 % × 2,29 % = 1,603 € je Stück.
function state({gainBank='500',vapBank='160.30'}={}){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person'}];s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot'}];
 s.securities=[{id:'st',isin:'DE1',name:'Fiktive AG',kind:'stock'},{id:'f',isin:'DE2',name:'Fiktiver Aktienfonds',kind:'equityFund'}];
 s.prices=[{securityId:'f',date:'2024-01-02',price:'100'},{securityId:'f',date:'2024-12-30',price:'120'}];
 s.events=[{id:'b',type:'buy',date:'2024-03-01',depotId:'d',securityId:'st',quantity:'10',amount:'1000'},
  {id:'o',type:'opening',date:'2023-12-31',depotId:'d',securityId:'f',quantity:'100',cost:'10000',group:'from2018',acquired:'2021-01-04',vapBefore:'0'},
  {id:'v',type:'vap',date:'2025-01-02',year:2024,depotId:'d',securityId:'f',amount:vapBank},
  {id:'s',type:'sell',date:'2025-06-02',depotId:'d',securityId:'st',quantity:'10',amount:'1500',...(gainBank==null?{}:{gainBank})}];
 s.years={p:{2025:{churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'}}};
 return s;
}

test('sale gain and advance lump sum from the bank are checked against the own calculation',()=>{
 const s=state();validate(s);
 const r=yearReport(s,'p',2025);
 assert.deepEqual(r.checks.map(c=>[c.kind,c.bank,c.model,c.difference]),[['vap','160.3','160.3','0'],['sale','500','500','0']]);
 const tax=statement(s,'d',2025,'tax').rows.flatMap(x=>x.lines);
 assert.match(tax.find(l=>l.type==='sell').note,/Abrechnung 500,00 € vor Teilfreistellung, Depotklar ebenso/);
 assert.match(tax.find(l=>l.type==='vap').note,/laut Bank, aus Jahreskursen ebenso/);
});

test('deviations show at the line, on the tax page and in Excel',()=>{
 const s=state({gainBank:'520',vapBank:'161'});
 const r=yearReport(s,'p',2025);
 assert.deepEqual(r.checks.map(c=>c.difference),['0.7','20']);
 const tax=statement(s,'d',2025,'tax').rows.flatMap(x=>x.lines);
 assert.match(tax.find(l=>l.type==='sell').note,/Abrechnung 520,00 € vor Teilfreistellung, Depotklar 500,00 € \(Abweichung 20,00 €\)/);
 assert.match(tax.find(l=>l.type==='vap').note,/laut Bank; aus Jahreskursen 160,30 € \(Abweichung 0,70 €\)/);
 const html=taxPageHTML(s,{personId:'p',year:2025,years:[2025]});
 assert.match(html,/<h3>Kontrolle je Abrechnung<\/h3>/);assert.match(html,/Verkauf · Gewinn vor Teilfreistellung/);assert.match(html,/Vorabpauschale 2024 · aus Jahreskursen/);
 const rows=taxRows(s,'p',2025),at=rows.findIndex(x=>x[0]==='Kontrolle je Abrechnung');
 assert.ok(at>0);assert.deepEqual(rows[at+2].slice(1,6),['Fiktiver Aktienfonds','Vorabpauschale 2024 · aus Jahreskursen',161,160.3,0.7]);
 assert.deepEqual(rows[at+3].slice(1,6),['Fiktive AG','Verkauf · Gewinn vor Teilfreistellung',520,500,20]);
});

test('without a bank gain the tax page says what to enter; the field is only for sales from 2018',()=>{
 const s=state({gainBank:null,vapBank:'160.30'});
 assert.match(taxPageHTML(s,{personId:'p',year:2025,years:[2025]}),/<h3>Kontrolle je Abrechnung<\/h3>/);
 const noVap={...s,events:s.events.filter(e=>e.type!=='vap')};
 assert.match(taxPageHTML(noVap,{personId:'p',year:2025,years:[2025]}),/beim Verkauf den Veräußerungsgewinn laut Abrechnung eintragen/);
 assert.throws(()=>validate({...s,events:[...s.events,{id:'x',type:'buy',date:'2016-01-04',depotId:'d',securityId:'st',quantity:'1',amount:'10'},{id:'y',type:'sell',date:'2017-03-01',depotId:'d',securityId:'st',quantity:'1',amount:'12',gainBank:'2'}]}),/für Verkäufe ab 2018/);
 // Formular: Feld beim Verkauf ab 2018, Vorschau mit Abweichung.
 const d={type:'sell',date:'2025-06-02',depotId:'d',securityId:'st',quantity:'10',amount:'1.500',gainBank:'520'};
 const html=entryFormHTML({...s,events:s.events.filter(e=>e.id!=='s')},d);
 assert.match(html,/Veräußerungsgewinn laut Abrechnung \(optional\)/);assert.match(html,/Abweichung Abrechnung − Depotklar<\/dt><dd>20,00 €/);
 assert.equal(draftToEvent(s,d).event.gainBank,'520');
 assert.doesNotMatch(entryFormHTML(s,{...d,date:'2017-03-01'}),/name="gainBank"/);
 assert.equal(replay(state()).moves.find(m=>m.type==='sell').gainBank,'500');
});
