import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate,withVapUnit} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {statement,periodStatement} from '../dist/core/statement.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {sheetHTML} from '../dist/ui/sheet.mjs';
import {sheetRows} from '../dist/ui/xlsx.mjs';
import {pricesHTML} from '../dist/ui/prices.mjs';

// Fiktive Person mit zwei Käufen einer Aktie, Teilverkauf, Schenkung und Split.
function shares(){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person Eins'},{id:'k',name:'Kind Eins'}];
 s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot'},{id:'dk',personId:'k',bank:'Bank A',name:'Kinderdepot'}];
 s.securities=[{id:'st',isin:'DE0000000001',name:'Fiktive AG',kind:'stock'}];
 s.events=[{id:'b1',type:'buy',date:'2019-03-15',depotId:'d',securityId:'st',quantity:'150',amount:'1500'},
  {id:'b2',type:'buy',date:'2020-05-02',depotId:'d',securityId:'st',quantity:'200',amount:'3000'},
  {id:'s1',type:'sell',date:'2021-06-01',depotId:'d',securityId:'st',quantity:'200',amount:'4000'},
  {id:'g1',type:'transfer',kind:'gift',date:'2022-02-01',depotId:'d',toDepotId:'dk',securityId:'st',quantity:'60',price:'20'},
  {id:'x1',type:'split',date:'2023-07-03',depotId:'d',securityId:'st',ratio:'2'}];
 return s;
}

test('lots show in FIFO order with origin and what is left of the original quantity',()=>{
 const s=shares();validate(s);
 // Lose und ihre Herkunft im steuerlichen Blatt; wirtschaftlich zählt der Durchschnitt.
 const st=statement(s,'d',2021,'tax'),row=st.rows[0];
 // FIFO: der Verkauf nimmt alle 150 Stück von 2019 und 50 von 2020.
 assert.deepEqual(row.lines.find(l=>l.type==='sell').from,[{acquired:'2019-03-15',group:'from2018',quantity:'150'},{acquired:'2020-05-02',group:'from2018',quantity:'50'}]);
 assert.deepEqual(row.lots.map(l=>[l.n,l.acquired,l.origin,l.quantity,l.bought,l.value,l.unit]),[[1,'2020-05-02','Kauf','150','200','2250','15']]);
 // Schenkung von 60 Stück: beim Kind ein neues Los „Schenkung von …“ mit 60 Stück Ausgang; Split verdoppelt Rest und Ausgang.
 const kid=statement(s,'dk',2022,'tax').rows[0].lots;assert.deepEqual(kid.map(l=>[l.origin,l.quantity,l.bought,l.acquired]),[['Schenkung von Person Eins','60','60','2020-05-02']]);
 assert.deepEqual(statement(s,'d',2023,'tax').rows[0].lots.map(l=>[l.quantity,l.bought]),[['180','400']]);
 const html=sheetHTML(s,{year:2021,from:2021,personId:'p',view:'both'});
 assert.match(html,/Lose zum 31\.12\.2021 in FIFO-Reihenfolge \(1\)/);assert.match(html,/aus 15\.03\.2019 · 150 Stück; 02\.05\.2020 · 50 Stück/);assert.match(html,/150<small>von 200<\/small>/);
 const rows=sheetRows(s,'d',{from:2021,to:2021});
 assert.ok(rows.some(r=>r[0]==='Los 1 · 2020-05-02 · Kauf'&&r[6]===150&&r[8]==='von 200 Stück'));
 assert.ok(rows.some(r=>r[0]==='Verkauf'&&/aus 2019-03-15 · 150 Stück; 2020-05-02 · 50 Stück/.test(r[8])));
 // Über mehrere Jahre je Jahresende die Lose dieses Jahres.
 assert.deepEqual(periodStatement(s,'d',2021,2023,'tax').rows[0].segments.map(x=>x.lots.map(l=>l.quantity)),[['150'],['90'],['180']]);
});

// Fiktiver Auslands-Immobilienfonds (80 % Teilfreistellung) wie im Steuerinformationsblatt: VAP 2023 je Anteil 0,1565 €.
function fund(units=[{securityId:'f',year:2023,perUnit:'0.1565'}]){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person'}];s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot'}];
 s.securities=[{id:'f',isin:'LU0000000001',name:'Fiktiver Immobilienfonds',kind:'foreignRealEstate'},{id:'st',isin:'DE0000000002',name:'Fiktive AG',kind:'stock'}];
 s.events=[{id:'o',type:'opening',date:'2022-12-31',depotId:'d',securityId:'f',quantity:'1000',cost:'50000',group:'from2018',acquired:'2020-01-06',vapBefore:'0'},
  {id:'b',type:'buy',date:'2023-03-10',depotId:'d',securityId:'f',quantity:'600',amount:'30000'}];
 s.vapUnits=units;
 return s;
}

test('the advance lump sum per unit from the fund tax sheet replaces the price calculation, twelfths for purchases in the year',()=>{
 const s=fund();validate(s);
 const m=replay(s).moves.find(x=>x.type==='vap'&&x.year===2023);
 // 1.000 × 0,1565 = 156,50 €; 600 Stück gekauft im März: 600 × 0,1565 × 10/12 = 78,25 € – zusammen 234,75 €, steuerpflichtig 20 %.
 assert.deepEqual([m.source,m.tax,m.income.taxable],['unit','234.75','46.95']);
 assert.match(statement(s,'d',2024,'tax').rows[0].lines.find(l=>l.type==='vap').note,/aus Vorabpauschale je Anteil laut Steuerinformation/);
 // Mit Bankwert: Kontrolle gegen den Wert aus der Steuerinformation.
 s.events.push({id:'v',type:'vap',date:'2024-01-02',year:2023,depotId:'d',securityId:'f',amount:'234.75'});
 const c=yearReport(s,'p',2024).checks[0];assert.deepEqual([c.from,c.bank,c.model,c.difference],['unit','234.75','234.75','0']);
 assert.match(statement(s,'d',2024,'tax').rows[0].lines.find(l=>l.type==='vap').note,/laut Bank, aus Steuerinformation ebenso/);
});

test('per-unit values only for funds and years with a positive base rate, once per year, locked like prices',()=>{
 assert.throws(()=>validate(fund([{securityId:'f',year:2021,perUnit:'0.1'}])),/Für 2021 gibt es keine Vorabpauschale/);
 assert.throws(()=>validate(fund([{securityId:'st',year:2023,perUnit:'0.1'}])),/nur bei Fonds/);
 assert.throws(()=>validate(fund([{securityId:'f',year:2023,perUnit:'0.1'},{securityId:'f',year:2023,perUnit:'0.2'}])),/doppelt/);
 let s=fund([]);s=withVapUnit(s,'f',2023,'0.1565');assert.deepEqual(s.vapUnits,[{securityId:'f',year:2023,perUnit:'0.1565'}]);assert.match(s.audit.at(-1).action,/Vorabpauschale je Anteil erfasst/);
 s=withVapUnit(s,'f',2023,null);assert.deepEqual(s.vapUnits,[]);
 assert.throws(()=>withVapUnit({...fund([]),closing:{p:2024}},'f',2023,'0.1565'),/abgeschlossen/);
 // Kursseite: Feld nur für Fondsjahre mit positivem Basiszins, nicht für das laufende Jahr.
 const html=pricesHTML(fund());
 assert.match(html,/data-vap data-security="f" data-year="2023" value="0,1565"/);assert.doesNotMatch(html,/data-vap data-security="f" data-year="2021"/);assert.doesNotMatch(html,/data-vap data-security="st"/);
 assert.doesNotMatch(html,new RegExp(`data-vap data-security="f" data-year="${new Date().getFullYear()}"`));
});
