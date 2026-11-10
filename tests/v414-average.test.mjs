import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate} from '../dist/core/model.mjs';
import {replay,holdings} from '../dist/core/ledger.mjs';
import {statement,periodStatement} from '../dist/core/statement.mjs';
import {sheetHTML} from '../dist/ui/sheet.mjs';
import {sheetRows} from '../dist/ui/xlsx.mjs';
import {D,S,round} from '../dist/core/decimal.mjs';

const cents=v=>v==null?null:S(round(D(v)));

// Fiktive Person, zwei Käufe zu 10 und 20 € je Stück, Teilverkauf, Schenkung, Nachkauf, Verkauf des Rests.
function shares(){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person Eins'},{id:'k',name:'Kind Eins'}];
 s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot',account:'0999'},{id:'dk',personId:'k',bank:'Bank A',name:'Kinderdepot'}];
 s.securities=[{id:'a',isin:'DE0000000002',name:'Fiktive AG',kind:'stock'}];
 s.events=[{id:'b1',type:'buy',date:'2019-02-01',depotId:'d',securityId:'a',quantity:'300',amount:'3000'},
  {id:'b2',type:'buy',date:'2020-03-02',depotId:'d',securityId:'a',quantity:'100',amount:'2000'},
  {id:'s1',type:'sell',date:'2021-04-12',depotId:'d',securityId:'a',quantity:'120',amount:'2400'},
  {id:'g1',type:'transfer',kind:'gift',date:'2021-10-22',depotId:'d',toDepotId:'dk',securityId:'a',quantity:'80',price:'25'},
  {id:'b3',type:'buy',date:'2022-02-01',depotId:'d',securityId:'a',quantity:'100',amount:'1600'},
  {id:'s2',type:'sell',date:'2022-09-01',depotId:'d',securityId:'a',quantity:'300',amount:'4500'}];
 s.ledgerChecks=[{id:'c',depotId:'d',date:'2021-12-31',balance:'2500'}];
 return s;
}

test('economic disposals go at the moving average of the depot; the tax side stays FIFO',()=>{
 const s=shares();validate(s);
 const moves=replay(s,{until:'2022-12-31'}).moves,m=id=>moves.find(x=>x.eventId===id&&(x.direction??'out')==='out');
 // 400 Stück für 5.000 € = 12,50 € je Stück. Verkauf 120 Stück: 1.500 € Abgang, Gewinn 900 €.
 assert.deepEqual([m('s1').economic,m('s1').gainEconomic].map(cents),['-1500','900']);
 // Steuerlich FIFO: 120 Stück aus dem Kauf zu 10 € = 1.200 €, Gewinn 1.200 €.
 assert.deepEqual([m('s1').tax,m('s1').gainTax].map(cents),['-1200','1200']);
 // Schenkung 80 Stück zum Durchschnitt: 1.000 € gehen ab und kommen beim Kind an; steuerlich 800 € (FIFO).
 assert.equal(cents(m('g1').economic),'-1000');assert.equal(cents(m('g1').tax),'-800');
 const kid=moves.find(x=>x.eventId==='g1'&&x.direction==='in');assert.deepEqual([kid.economic,kid.tax].map(cents),['1000','800']);
 // Stand 31.12.2021: 200 Stück, wirtschaftlich 2.500 € (12,50 € je Stück) wie das Sachkonto; steuerlich 1.000 + 2.000 €.
 const eco=statement(s,'d',2021,'economic'),tax=statement(s,'d',2021,'tax');
 assert.deepEqual([eco.rows[0].closing.quantity,cents(eco.closing),cents(eco.rows[0].unitValue)],['200','2500','12.5']);
 assert.equal(cents(tax.closing),'3000');assert.equal(eco.balanced,true);assert.equal(cents(eco.ledgerCheck.difference),'0');
 // Nachkauf 100 Stück zu 16 €: 4.100 € für 300 Stück; Verkauf aller 300 Stück geht genau mit 4.100 € ab, das Konto auf 0.
 assert.deepEqual([m('s2').economic,m('s2').gainEconomic,m('s2').tax,m('s2').gainTax].map(cents),['-4100','400','-4600','-100']);
 const y22=statement(s,'d',2022,'economic');assert.deepEqual([y22.rows[0].closing.quantity,y22.closing],['0','0']);assert.equal(y22.balanced,true);
 // Summe der wirtschaftlichen Gewinne = Erlöse 6.900 − (Käufe 6.600 − Schenkung 1.000).
 assert.equal(cents(S(D(m('s1').gainEconomic)+D(m('s2').gainEconomic))),'1300');
 // Die Rechnung im Verkauf (sale) zeigt denselben wirtschaftlichen Gewinn.
 assert.equal(cents(m('s1').sale.economicGain),'900');
 // Bestand 2021 je Position: wirtschaftlich der Durchschnitt, steuerlich die FIFO-Lose.
 const h=holdings(s,{until:'2021-12-31',depotId:'d'}).holdings[0];assert.deepEqual([cents(h.economic),cents(h.tax)],['2500','3000']);
});

test('a holding taken over in groups at 2018 is valued at its average, not by group',()=>{
 const s=emptyState();
 s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];s.securities=[{id:'f',isin:'X',name:'Fiktiver Fonds',kind:'equityFund'}];
 // Zusammengefasst zum 01.01.2018: 100 Alt-Anteile vor 2009 zu 40 € und 300 Anteile 2009–2017 zu 60 € – zusammen 22.000 € für 400 Stück.
 s.events=[{id:'o1',type:'opening',date:'2018-01-01',depotId:'d',securityId:'f',quantity:'100',cost:'4000',group:'pre2009',price2017:'70',oldIncome:'0',vapBefore:'0'},
  {id:'o2',type:'opening',date:'2018-01-01',depotId:'d',securityId:'f',quantity:'300',cost:'18000',group:'from2009',price2017:'70',deemed2017:'3000',oldIncome:'0',vapBefore:'0'},
  {id:'s',type:'sell',date:'2018-06-01',depotId:'d',securityId:'f',quantity:'100',amount:'7500'}];
 validate(s);
 const sale=replay(s,{until:'2018-12-31'}).moves.find(m=>m.type==='sell');
 // Wirtschaftlich 100 × 55 € = 5.500 €; FIFO nähme die Alt-Anteile zu 40 € (4.000 €).
 assert.deepEqual([sale.economic,sale.gainEconomic].map(cents),['-5500','2000']);
 assert.deepEqual(sale.consumed.map(l=>[l.group,l.quantity]),[['pre2009','100']]);
 assert.equal(cents(statement(s,'d',2018,'economic').closing),'16500');
});

test('the economic sheet names the average and shows no lots; lots in the tax sheet can be switched off',()=>{
 const s=shares();
 const eco=statement(s,'d',2021,'economic').rows[0],tax=statement(s,'d',2021,'tax').rows[0];
 const ecoSell=eco.lines.find(l=>l.type==='sell'),taxSell=tax.lines.find(l=>l.type==='sell'),ecoGift=eco.lines.find(l=>l.type==='transfer');
 assert.match(ecoSell.note,/Abgang zum Durchschnitt 12,5000 € je Stück/);assert.equal(ecoSell.from,null);
 assert.match(ecoGift.note,/Unentgeltlich zum Buchwert.*Abgang zum Durchschnitt 12,5000 € je Stück/);
 assert.doesNotMatch(taxSell.note,/Durchschnitt/);assert.deepEqual(taxSell.from,[{acquired:'2019-02-01',group:'from2018',quantity:'120'}]);
 assert.deepEqual(eco.lots,[]);assert.deepEqual(tax.lots.map(l=>[l.acquired,l.quantity,cents(l.value)]),[['2019-02-01','100','1000'],['2020-03-02','100','2000']]);
 // Über mehrere Jahre: je Jahr eine Losezeile im steuerlichen Blatt, keine im wirtschaftlichen; ausgeschaltet keine.
 const on=sheetHTML(s,{year:2022,from:2019,personId:'p'}),off=sheetHTML(s,{year:2022,from:2019,personId:'p',lots:false});
 assert.equal((on.match(/<tr class="lots">/g)||[]).length,3);assert.equal((off.match(/<tr class="lots">/g)||[]).length,0);
 assert.match(on,/id="show-lots" checked/);assert.match(off,/id="show-lots" >/);
 assert.doesNotMatch(sheetHTML(s,{year:2022,personId:'p',view:'economic'}),/show-lots/);
 // Excel: Lose nur im steuerlichen Teil, Verkauf wirtschaftlich mit Durchschnitt.
 const rows=sheetRows(s,'d',{from:2021,to:2021}),cut=rows.findIndex(r=>/^Steuerliche Betrachtung/.test(r[0]||''));
 assert.ok(!rows.slice(0,cut).some(r=>/^Los /.test(r[0]||'')));assert.equal(rows.slice(cut).filter(r=>/^Los /.test(r[0]||'')).length,2);
 assert.ok(rows.slice(0,cut).some(r=>r[0]==='Verkauf'&&/Abgang zum Durchschnitt 12,5000 € je Stück/.test(r[8])));
 assert.deepEqual(periodStatement(s,'d',2019,2022,'economic').rows[0].segments.map(x=>x.lots.length),[0,0,0,0]);
});

test('an unknown acquisition value leaves the average and every later disposal open',()=>{
 const s=emptyState();
 s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];s.securities=[{id:'a',isin:'X',name:'Aktie',kind:'stock'}];
 s.events=[{id:'o',type:'opening',date:'2018-01-01',depotId:'d',securityId:'a',quantity:'100',group:'pre2009'},
  {id:'b',type:'buy',date:'2019-01-10',depotId:'d',securityId:'a',quantity:'100',amount:'2000'},
  {id:'s',type:'sell',date:'2020-01-10',depotId:'d',securityId:'a',quantity:'50',amount:'1500'}];
 validate(s);
 const sale=replay(s,{until:'2020-12-31'}).moves.find(m=>m.type==='sell');
 assert.equal(sale.economic,null);assert.equal(sale.gainEconomic,null);
 assert.equal(statement(s,'d',2020,'economic').closing,null);
});
