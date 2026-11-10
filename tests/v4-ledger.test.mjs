import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate,withEvent} from '../dist/core/model.mjs';
import {replay,holdings} from '../dist/core/ledger.mjs';
import {statement} from '../dist/core/statement.mjs';
import {demoState} from '../dist/core/sample.mjs';
import {ledgerSheet} from './fixtures/sheet.mjs';
import {D,S} from '../dist/core/decimal.mjs';

const cents=v=>v==null?null:Number(v).toFixed(2);

test('the yearly sheet is reproduced to the cent in both views',()=>{
 const s=ledgerSheet();
 const e=statement(s,'d1',2026,'economic'),t=statement(s,'d1',2026,'tax');
 const er=e.rows[0],tr=t.rows[0];
 assert.equal(cents(er.opening.value),'1812345.67');assert.equal(er.opening.quantity,'24000');
 // Je Anteil 1.812.345,67 / 24.000 = 75,514402916…; 1.200 Anteile = 90.617,2835, 900 Anteile = 67.962,9626.
 assert.deepEqual(er.lines.map(l=>cents(l.value)),['-90617.28','-67962.96','-67962.96']);
 // Seit 4.17.1 geht jeder Abgang auf den Cent gerundet ab wie im Sachkonto: 1.812.345,67 − 90.617,28 − 2 × 67.962,96. Ungerundet wären es ,46.
 assert.equal(cents(er.closing.value),'1585802.47');assert.equal(er.closing.quantity,'21000');
 assert.equal(Number(er.unitValue).toFixed(4),'75.5144');
 // Steuerlich: 24.000 × 125,8940325 = 3.021.456,78 plus Vorabpauschale 98.765,43 = 3.120.222,21, je Anteil 130,00925875.
 assert.equal(cents(tr.opening.value),'3021456.78');
 assert.equal(tr.lines[0].type,'vap');assert.equal(tr.lines[0].value,'98765.43');assert.equal(tr.lines[0].quantity,'0');
 assert.deepEqual(tr.lines.slice(1).map(l=>cents(l.value)),['-156011.11','-117008.33','-117008.33']);
 // Steuerlich rechnet das Los genau weiter, gerundet wird nur die Anzeige: 3.120.222,21 × 21.000 / 24.000 = 2.730.194,43375.
 assert.equal(cents(tr.closing.value),'2730194.43');assert.equal(Number(tr.unitValue).toFixed(4),'130.0093');
 assert.ok(e.balanced&&t.balanced);
 assert.ok(er.lines.every(l=>l.gain==='0'),'Schenkung zum Buchwert ohne Gewinn');
 assert.equal(er.lines.some(l=>l.type==='vap'),false,'Vorabpauschale nur steuerlich');
});

test('a gifted lot keeps acquisition group, its share of advance lumps and the transfer history',()=>{
 const s=ledgerSheet(),r=replay(s,{until:'2026-12-31'}),lot=r.positions.get('d2|f')[0];
 assert.equal(lot.group,'pre2009');assert.equal(lot.quantity,'1200');assert.equal(cents(lot.vap),'4938.27');
 assert.equal(lot.history.length,1);assert.equal(lot.history[0].kind,'gift');
 // Was beim Schenker abgeht, kommt beim Kind mit demselben Wert an.
 const out=statement(s,'d1',2026,'tax').rows[0].lines.find(l=>l.eventId==='g1'),into=statement(s,'d2',2026,'tax').rows[0].lines[0];
 assert.equal(D(out.value)+D(into.value),0n);assert.match(into.label,/Schenkung von Elternteil/);
});

test('the calculation never changes the stored state',()=>{
 const s=demoState(),before=structuredClone(s);
 replay(s,{until:'2026-12-31'});for(const d of s.depots)for(const b of ['economic','tax'])statement(s,d.id,2026,b);
 assert.deepEqual(s,before);
});

test('partial sales take cost, base and advance lumps proportionally in FIFO order',()=>{
 const s=emptyState();s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];s.securities=[{id:'a',isin:'X',name:'Aktie',kind:'stock'}];
 s.events=[{id:'b1',type:'buy',date:'2020-01-10',depotId:'d',securityId:'a',quantity:'100',amount:'1000'},
  {id:'b2',type:'buy',date:'2021-01-10',depotId:'d',securityId:'a',quantity:'100',amount:'3000'},
  {id:'s',type:'sell',date:'2022-05-02',depotId:'d',securityId:'a',quantity:'150',amount:'4500'}];
 const sale=replay(s,{until:'2022-12-31'}).moves.find(m=>m.type==='sell');
 // Wirtschaftlich gleitender Durchschnitt: 4.000 € für 200 Stück = 20 € je Stück; steuerlich FIFO 1.000 + 1.500 €.
 assert.equal(sale.economic,'-3000');assert.equal(sale.gainEconomic,'1500');assert.equal(sale.tax,'-2500');assert.equal(sale.gainTax,'2000');
 assert.deepEqual(sale.consumed.map(l=>[l.id,l.quantity,l.cost]),[['b1','100','1000'],['b2','50','1500']]);
 const rest=replay(s,{until:'2022-12-31'}).positions.get('d|a');assert.deepEqual(rest.map(l=>[l.quantity,l.cost]),[['50','1500']]);
 assert.throws(()=>replay({...s,events:[...s.events,{id:'x',type:'sell',date:'2022-06-01',depotId:'d',securityId:'a',quantity:'51',amount:'1'}]},{until:'2022-12-31'}),/nur 50 Stück/);
});

test('advance lumps use the first and the last price of the year; a missing price leaves the tax base unknown',()=>{
 const s=emptyState();s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];s.securities=[{id:'f',isin:'X',name:'Fonds',kind:'equityFund'}];
 s.events=[{id:'o',type:'opening',date:'2018-01-01',depotId:'d',securityId:'f',quantity:'1000',cost:'50000',group:'pre2009',price2017:'78.20',oldIncome:'0',vapBefore:'0'}];
 s.prices=[{securityId:'f',date:'2022-12-30',price:'100'},{securityId:'f',date:'2023-01-02',price:'101'},{securityId:'f',date:'2023-12-29',price:'110'}];
 const r=replay(s,{until:'2024-01-02'}),v23=r.moves.find(m=>m.type==='vap'&&m.year===2023);
 // § 18 Abs. 1 InvStG: erster Kurs 2023 (101), nicht der Dezemberkurs 2022 (100).
 // 1000 × 101 × 70 % × 2,55 % = 1.802,85, gedeckelt durch Wertsteigerung 9.000 – voller Ansatz.
 assert.equal(v23.tax,'1802.85');assert.equal(v23.source,'computed');
 // Nur der Dezemberkurs des Vorjahres reicht nicht.
 const only=replay({...s,prices:s.prices.filter(p=>p.date!=='2023-01-02')},{until:'2024-01-02'});
 assert.equal(only.moves.find(m=>m.type==='vap'&&m.year===2023).source,'missing');assert.ok(only.issues.some(i=>/2023: erster Kurs des Jahres \(Anfang Januar\) fehlt/.test(i.reason)));
 // Begrenzung auf den Mehrbetrag zwischen erstem und letztem Kurs: 1000 × (102 − 101) = 1.000.
 const capped=replay({...s,prices:[...s.prices.filter(p=>p.date!=='2023-12-29'),{securityId:'f',date:'2023-12-29',price:'102'}]},{until:'2024-01-02'});
 assert.equal(capped.moves.find(m=>m.type==='vap'&&m.year===2023).tax,'1000');
 const v19=r.moves.find(m=>m.type==='vap'&&m.year===2019);assert.equal(v19.source,'missing');assert.equal(v19.tax,null);
 assert.equal(r.positions.get('d|f')[0].vap,null,'unbekannt, nicht null');
 assert.ok(r.issues.some(i=>/Vorabpauschale 2018/.test(i.reason)));
 // Negativer Basiszins 2021/2022: keine Vorabpauschale und keine Lücke.
 assert.equal(r.moves.some(m=>m.type==='vap'&&(m.year===2021||m.year===2022)),false);
});

test('the bank figure overrides the computed advance lump and future inflows are left out by default',()=>{
 const s=ledgerSheet(),r=replay(s,{until:'2026-12-31'});
 assert.equal(r.moves.find(m=>m.type==='vap').source,'bank');
 assert.equal(replay(s,{until:'2026-12-31'}).moves.some(m=>m.year===2026),false,'Zufluss 2027 gehört nicht ins Jahr 2026');
});

test('split and fund merger carry values unchanged',()=>{
 const s=emptyState();s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];
 s.securities=[{id:'a',isin:'A',name:'Fonds A',kind:'equityFund'},{id:'b',isin:'B',name:'Fonds B',kind:'equityFund'}];
 s.events=[{id:'k',type:'buy',date:'2024-02-01',depotId:'d',securityId:'a',quantity:'10',amount:'1000'},
  {id:'sp',type:'split',date:'2024-03-01',depotId:'d',securityId:'a',ratio:'2'},
  {id:'m',type:'merger',date:'2024-04-01',depotId:'d',securityId:'a',toSecurityId:'b',ratio:'0.5'}];
 const h=holdings(s,{until:'2024-12-31'}).holdings;
 assert.equal(h.length,1);assert.equal(h[0].securityId,'b');assert.equal(h[0].quantity,'10');assert.equal(h[0].economic,'1000');
 assert.equal(h[0].lots[0].acquired,'2024-02-01');
});

test('entry rules refuse what the model cannot carry',()=>{
 const s=ledgerSheet();
 assert.throws(()=>withEvent(s,{type:'buy',date:'2008-12-30',depotId:'d1',securityId:'f',quantity:'1',amount:'1'}),/vor 2009 als Bestand zum 01\.01\.2018/);
 assert.doesNotThrow(()=>withEvent(s,{type:'buy',date:'2015-01-02',depotId:'d1',securityId:'f',quantity:'1',amount:'1'}),'Fondskauf 2009–2017 einzeln');
 assert.throws(()=>withEvent(s,{type:'transfer',kind:'gift',date:'2026-02-01',depotId:'d1',toDepotId:'d1',securityId:'f',quantity:'1'}),/Zieldepot/);
 assert.throws(()=>withEvent(s,{type:'opening',date:'2017-06-30',depotId:'d1',securityId:'f',quantity:'1',group:'pre2009'}),/01\.01\.2018/);
 const next=withEvent(s,{type:'sell',date:'2026-03-01',depotId:'d1',securityId:'f',quantity:'10',amount:'1500'},{reason:'Abrechnung'});
 assert.equal(next.audit.at(-1).action,'Vorgang erfasst');assert.equal(next.audit.at(-1).reason,'Abrechnung');
 assert.equal(s.events.length,5,'ursprünglicher Zustand unverändert');
});
