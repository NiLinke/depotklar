import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate,roundingOnly} from '../dist/core/model.mjs';
import {statement} from '../dist/core/statement.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {demoState} from '../dist/core/sample.mjs';
import {taxPageHTML} from '../dist/ui/taxpage.mjs';
import {entryFormHTML,newDraft} from '../dist/ui/entry.mjs';

// Fiktiver Aktienfonds, 100 Stück für 10.000 €; Vorabpauschale 2024 aus Kursen 160,30 € (100 → 120 €, Basiszins 2,29 %).
function fund({vapBank='160.32',sell=null}={}){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person'}];s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot'}];
 s.securities=[{id:'f',isin:'IE00TEST0001',name:'Fiktiver Aktienfonds',kind:'equityFund'},{id:'g',isin:'DE000TEST002',name:'Fiktiver deutscher Fonds',kind:'equityFund'},{id:'st',isin:'DE0000000003',name:'Fiktive AG',kind:'stock'}];
 s.prices=[{securityId:'f',date:'2024-01-02',price:'100'},{securityId:'f',date:'2024-12-30',price:'120'}];
 s.events=[{id:'o',type:'opening',date:'2023-12-31',depotId:'d',securityId:'f',quantity:'100',cost:'10000',group:'from2018',acquired:'2021-01-04',vapBefore:'0'},
  {id:'v23',type:'vap',date:'2024-01-02',year:2023,depotId:'d',securityId:'f',amount:'0',capitalTax:'0',solidarity:'0',churchTax:'0'},
  {id:'v',type:'vap',date:'2025-01-02',year:2024,depotId:'d',securityId:'f',amount:vapBank,capitalTax:'0',solidarity:'0',churchTax:'0'},
  ...(sell?[{id:'s',type:'sell',date:'2025-06-02',depotId:'d',securityId:'f',quantity:'100',amount:'12000',gainBank:sell}]:[])];
 s.years={p:{2025:{churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'}}};
 return s;
}

test('cent differences from bank rounding are marked as rounding, larger ones stay deviations',()=>{
 assert.equal(roundingOnly('160.32','160.30'),true);assert.equal(roundingOnly('161','160.30'),false);
 assert.equal(roundingOnly('25000.80','25000'),true);assert.equal(roundingOnly('25002','25000'),false);
 const s=fund();validate(s);
 const c=yearReport(s,'p',2025).checks[0];assert.deepEqual([c.difference,c.rounding,c.hint],['0.02',true,'Rundung']);
 assert.match(statement(s,'d',2025,'tax').rows.flatMap(r=>r.lines).find(l=>l.type==='vap').note,/Abweichung 0,02 €, Rundung/);
});

test('a bank gain that matches the gain after partial exemption is flagged as swapped',()=>{
 // Gewinn vor Teilfreistellung 12.000 − 10.000 − 160,32 = 1.839,68 €; nach 30 % Teilfreistellung 1.287,78 €.
 const s=fund({sell:'1287.78'});validate(s);
 const c=yearReport(s,'p',2025).checks.find(x=>x.kind==='sale');
 assert.deepEqual([c.model,c.difference,c.rounding],['1839.68','-551.9',false]);assert.match(c.hint,/nach Teilfreistellung/);
 assert.match(statement(s,'d',2025,'tax').rows.flatMap(r=>r.lines).find(l=>l.type==='sell').note,/entspricht dem Gewinn nach Teilfreistellung/);
 assert.equal(yearReport(fund({sell:'1839.68'}),'p',2025).checks.find(x=>x.kind==='sale').hint,null);
});

test('old-law income is preset to none for German funds and explained for foreign ones',()=>{
 const s=fund(),draft=id=>({...newDraft('opening','d',s),securityId:id,group:'from2009',acquired:'2012-05-02',quantity:'10',cost:'1000'});
 const german=entryFormHTML(s,draft('g')),foreign=entryFormHTML(s,draft('f'));
 assert.match(german,/name="oldIncomeNone" checked/);assert.match(german,/Deutscher Fonds: keine/);
 assert.doesNotMatch(foreign,/name="oldIncomeNone" checked/);assert.match(foreign,/Nur bei ausländischen thesaurierenden Fonds/);
 // Ausdrücklich abgewählt bleibt abgewählt.
 assert.doesNotMatch(entryFormHTML(s,{...draft('g'),oldIncomeNone:false,oldIncomeFor:'g'}),/name="oldIncomeNone" checked/);
 // Wird vom deutschen auf den ausländischen Fonds gewechselt, wandert die Vorbelegung nicht mit.
 assert.doesNotMatch(entryFormHTML(s,{...draft('f'),oldIncomeNone:true,oldIncomeFor:'g'}),/name="oldIncomeNone" checked/);
});

test('forms warn about capital repayments and say the certificate makes per-event tax unnecessary',()=>{
 const s=fund();
 const dividend=entryFormHTML(s,{...newDraft('distribution','d',s),securityId:'st'});
 assert.match(dividend,/Einlagenrückgewähr/);assert.match(dividend,/Jahressteuerbescheinigung der Bank erfasst wird – sie hat Vorrang/);
 assert.doesNotMatch(entryFormHTML(s,{...newDraft('distribution','d',s),securityId:'f'}),/Einlagenrückgewähr/);
});

test('an expected additional payment mentions the missing Günstigerprüfung; the demo shows a consistent refund',()=>{
 const s=fund({vapBank:'160.30'});s.events.push({id:'x',type:'distribution',date:'2025-07-01',depotId:'d',securityId:'f',amount:'2000',capitalTax:'0',solidarity:'0',churchTax:'0'});
 const html=taxPageHTML(s,{personId:'p',year:2025,years:[2025]});
 assert.match(html,/Erwartete Nachzahlung/);assert.match(html,/Ohne Günstigerprüfung gerechnet/);
 const r=yearReport(demoState(),'p1',2025);
 assert.deepEqual([r.bankWithheld,r.total,r.difference],['3596.7','3482.1','114.6']);
});
