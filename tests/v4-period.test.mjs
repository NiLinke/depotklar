import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate} from '../dist/core/model.mjs';
import {statement,periodStatement} from '../dist/core/statement.mjs';
import {demoState} from '../dist/core/sample.mjs';
import {sheetHTML} from '../dist/ui/sheet.mjs';
import {sheetRows} from '../dist/ui/xlsx.mjs';
import {ledgerSheet} from './fixtures/sheet.mjs';
import {D,S} from '../dist/core/decimal.mjs';

test('several years chain the verified yearly sheets: each year end is the next year start',()=>{
 const s=demoState();
 for(const basis of ['economic','tax']){
  const p=periodStatement(s,'d1',2018,2026,basis);
  assert.equal(p.balanced,true,basis);
  for(const r of p.rows)for(let i=1;i<r.segments.length;i++){
   const year=r.segments[i].year,single=statement(s,'d1',year,basis).rows.find(x=>x.securityId===r.securityId);
   assert.equal(single.opening.quantity,r.segments[i-1].closing.quantity);assert.equal(single.opening.value,r.segments[i-1].closing.value);
  }
  assert.equal(p.closing,statement(s,'d1',2026,basis).closing);assert.equal(p.opening,statement(s,'d1',2018,basis).opening);
 }
 // Steuerlich wächst die Basis mit jeder Vorabpauschale, wirtschaftlich bleibt der Buchwert.
 const tax=periodStatement(s,'d1',2018,2025,'tax').rows.find(r=>r.securityId==='af'),eco=periodStatement(s,'d1',2018,2025,'economic').rows.find(r=>r.securityId==='af');
 assert.ok(D(tax.segments.at(-1).closing.value)>D(tax.segments[0].closing.value));
 assert.deepEqual([...new Set(eco.segments.map(x=>x.closing.value))],['289000']);
 assert.equal(eco.segments.length,8);
});

test('one security is followed into every depot it reaches, including gifts to the children',()=>{
 const s=demoState(),depots=s.depots.map(d=>[d.id,periodStatement(s,d.id,2025,2026,'economic',{securityId:'af'})]);
 const held=depots.filter(([,p])=>p.rows.length).map(([id])=>id);
 assert.deepEqual(held,['d1','d3','d4']);
 const total=depots.reduce((a,[,p])=>a+D(p.rows[0]?.closing.quantity??'0'),0n);
 assert.equal(S(total),'6400','6.800 Stück, davon 400 bei Laura verkauft');
 assert.ok(depots.every(([,p])=>p.rows.every(r=>r.securityId==='af')));
 assert.equal(depots.find(([id])=>id==='d1')[1].ledgerCheck,null,'Buchhaltungsabgleich nur für das ganze Depot');
});

test('a security sold and bought again later restarts from zero without breaking the chain',()=>{
 const s=emptyState();s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];s.securities=[{id:'a',isin:'A',name:'Aktie',kind:'stock'}];
 s.events=[{id:'b1',type:'buy',date:'2019-03-01',depotId:'d',securityId:'a',quantity:'10',amount:'1000'},
  {id:'s1',type:'sell',date:'2020-05-01',depotId:'d',securityId:'a',quantity:'10',amount:'1500'},
  {id:'b2',type:'buy',date:'2023-02-01',depotId:'d',securityId:'a',quantity:'5',amount:'800'}];
 validate(s);
 const p=periodStatement(s,'d',2019,2024,'economic'),r=p.rows[0];
 assert.equal(p.balanced,true);assert.deepEqual(r.segments.map(x=>x.year),[2019,2020,2023,2024]);
 assert.equal(r.closing.quantity,'5');assert.equal(p.gains,'500');
 assert.throws(()=>periodStatement(s,'d',2024,2019,'economic'),/Zeitraum/);
});

test('the overview shows the period, intermediate year ends, the security filter and its family total',()=>{
 const s=demoState();
 const html=sheetHTML(s,{year:2026,from:2018});
 assert.match(html,/Übersicht 2018–2026/);assert.match(html,/Wirtschaftliche Betrachtung 2018–2026/);
 assert.match(html,/class="stand year"/);assert.match(html,/Stand 31\.12\.2019/);assert.match(html,/id="from-year"/);
 const one=sheetHTML(s,{year:2026,from:2025,securityId:'af'});
 assert.match(one,/alle Depots zum 31\.12\.2026/);assert.match(one,/6\.400/);
 assert.doesNotMatch(one,/<h2>Wertpapiere<\/h2>/,'Depot ohne das Wertpapier wird ausgeblendet');
 assert.doesNotMatch(one,/Fiktiver Mischfonds Alt<\/strong>/);
 assert.match(sheetHTML(s,{year:2026}),/Jahresübersicht 2026/);
});

test('the Excel rows carry every year end of the period and still reproduce the yearly sheet',()=>{
 const rows=sheetRows(demoState(),'d1',{from:2024,to:2026});
 const ends=rows.filter(r=>String(r[0]).startsWith('Stand 31.12.')).map(r=>r[0]);
 assert.ok(['Stand 31.12.2024','Stand 31.12.2025','Stand 31.12.2026'].every(e=>ends.includes(e)));
 const sheet=sheetRows(ledgerSheet(),'d1',{from:2026,to:2026}).filter(r=>String(r[0]).startsWith('Stand 31.12.2026')).map(r=>Number(r[7]).toFixed(2));
 assert.deepEqual(sheet,['1585802.47','2730194.43']);
});
