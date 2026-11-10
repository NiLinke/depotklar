import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate,withEvent,withRecord,withClosing} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {statement} from '../dist/core/statement.mjs';
import {fxReplay} from '../dist/core/fx.mjs';
import {yearReport,yearDefaults} from '../dist/core/year.mjs';
import {RELATIONS} from '../dist/core/rules.mjs';

// Gegenproben zum Prüfbericht vom 01.11.2026, erfundene Personen und Beträge.
const PARAMS={churchRate:'0',stockLossCarry:'0',otherLossCarry:'0',externalAllowance:'1000',protectedRemaining:'100000'};
function base(kind='equityFund'){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person A'},{id:'q',name:'Person B'}];
 s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot A'},{id:'e',personId:'p',bank:'Bank B',name:'Depot B'},{id:'f',personId:'q',bank:'Bank C',name:'Depot C'}];
 s.securities=[{id:'x',name:'Fonds X',kind}];
 s.years={p:Object.fromEntries([2023,2024,2025,2026].map(y=>[y,{...PARAMS}])),q:Object.fromEntries([2023,2024,2025,2026].map(y=>[y,{...PARAMS}]))};
 return s;
}
const ev=(type,id,date,more={})=>({type,id,date,depotId:'d',securityId:'x',...more});
const interest=(id,depotId,amount,withheld)=>({id,type:'interest',date:'2026-06-01',depotId,amount,...(withheld==null?{}:{withheld})});

test('F01/F02: bank comparison per bank; an incomplete certificate leaves it open',()=>{
 let s=base('stock');s.events=[interest('i','d','1000','100'),interest('j','e','1000','200')];
 s.certificates=[{id:'c',personId:'p',bank:'Bank A',year:2026,capitalTax:'100',solidarity:'0',churchTax:'0'}];validate(s);
 let r=yearReport(s,'p',2026);assert.equal(r.bankWithheld,'300');
 assert.deepEqual(r.withholding.map(w=>[w.bank,w.source,w.amount]),[['Bank A','certificate','100'],['Bank B','events','200']]);
 s=base('stock');s.events=[interest('i','d','1000','100')];s.certificates=[{id:'c',personId:'p',bank:'Bank A',year:2026,capitalTax:'200'}];validate(s);
 r=yearReport(s,'p',2026);assert.equal(r.bankWithheld,null);assert.equal(r.difference,null);assert.match(r.withholding[0].missing,/Bescheinigung/);
});

test('F03/F04: proposals keep loss carries over a year without income and leave an unknown allowance empty',()=>{
 let s=base();s.years.p[2025]={...PARAMS,stockLossCarry:'12000',otherLossCarry:'500'};delete s.years.p[2026];validate(s);
 let d=yearDefaults(s,'p',2026);assert.deepEqual([d.stockLossCarry,d.otherLossCarry],['12000','500']);
 // Ohne Vorjahresdaten: Vorträge unbekannt statt null Euro.
 s=base();s.years={};validate(s);d=yearDefaults(s,'p',2026);assert.deepEqual([d.stockLossCarry,d.otherLossCarry],[null,null]);
 // Offener Verkauf eines Alt-Anteils 2023: kein Vorschlag von 100.000 €.
 s=base();s.events=[ev('opening','o','2023-05-01',{group:'pre2009',quantity:'1',cost:'10',oldIncome:'0',vapBefore:'0'}),ev('sell','s','2023-06-01',{quantity:'1',amount:'20'})];delete s.years.p[2024];validate(s);
 assert.equal(yearDefaults(s,'p',2024).protectedRemaining,null);
});

test('F05/F06: currency lots keep their acquisition order after a transfer; a trade can carry its own rate',()=>{
 let s=base('stock');s.accounts=[{id:'a',depotId:'d',name:'USD A',currency:'USD',kind:'payment'},{id:'b',depotId:'d',name:'USD B',currency:'USD',kind:'payment'}];
 s.events=[{id:'a1',type:'fx',kind:'exchangeIn',date:'2025-07-01',depotId:'d',accountId:'a',amount:'100',eur:'50'},{id:'b1',type:'fx',kind:'exchangeIn',date:'2026-01-01',depotId:'d',accountId:'b',amount:'100',eur:'100'},
  {id:'t',type:'fx',kind:'transfer',date:'2026-02-01',depotId:'d',accountId:'a',toAccountId:'b',amount:'100'},{id:'out',type:'fx',kind:'exchangeOut',date:'2026-03-01',depotId:'d',accountId:'b',amount:'100',eur:'150'}];validate(s);
 let m=fxReplay(s,{until:'2026-12-31'}).moves.find(m=>m.eventId==='out');assert.deepEqual([m.cost,m.gain,m.taxable],['50','100','100']);
 // Verkauf, Steuer in USD abgezogen: Gutschrift 800 USD zum Kurs 1,0 ist 800 € wert, nicht der Erlös vor Steuer.
 s=base('stock');s.accounts=[{id:'a',depotId:'d',name:'USD',currency:'USD',kind:'interest'}];
 s.events=[ev('buy','b','2025-01-02',{quantity:'1',amount:'500'}),ev('sell','s','2026-03-02',{quantity:'1',amount:'1000',withheld:'200',fx:{accountId:'a',amount:'800',rate:'1'}}),{id:'out',type:'fx',kind:'exchangeOut',date:'2026-04-01',depotId:'d',accountId:'a',amount:'800',eur:'800'}];validate(s);
 const r=fxReplay(s,{until:'2026-12-31'});assert.equal(r.moves.find(m=>m.eventId==='s').bookValue,'800');assert.equal(r.moves.find(m=>m.eventId==='out').gain,'0');
});

test('F07/F08: the advance lump sum uses split-adjusted prices and fund-level distributions per unit',()=>{
 // Split 2 : 1 im Juni: Anfangskurs 100 entspricht 50 je neuem Stück; 50 × 70 % × 2,55 % × 200 Stück = 178,50 €.
 let s=base();s.events=[ev('buy','b','2022-01-10',{quantity:'100',amount:'10000'}),ev('split','sp','2023-06-01',{ratio:'2'})];
 s.prices=[{securityId:'x',date:'2023-01-02',price:'100'},{securityId:'x',date:'2023-12-29',price:'55'}];validate(s);
 let v=replay(s,{until:'2024-01-02'}).moves.find(m=>m.type==='vap'&&m.year===2023);assert.equal(v.income.gross,'178.5');assert.equal(v.split,true);
 // Ausschüttung 1 € je Anteil im Mai, Übertrag ins eigene Depot im Juli: (1,785 − 1) × 100 = 78,50 € im Zieldepot.
 s=base();s.events=[ev('buy','b','2022-01-10',{quantity:'100',amount:'10000'}),ev('distribution','di','2023-05-02',{amount:'100'}),ev('transfer','t','2023-07-03',{kind:'own',quantity:'100',toDepotId:'e'})];
 s.prices=[{securityId:'x',date:'2023-01-02',price:'100'},{securityId:'x',date:'2023-12-29',price:'110'}];validate(s);
 const vaps=replay(s,{until:'2024-01-02'}).moves.filter(m=>m.type==='vap'&&m.year===2023);
 assert.deepEqual(vaps.map(m=>[m.depotId,m.income.gross]),[['e','78.5']]);
 // Dieselbe Ausschüttung in zwei Depots zählt je Anteil einmal.
 s=base();s.events=[ev('buy','b','2022-01-10',{quantity:'100',amount:'10000'}),ev('buy','b2','2022-01-10',{depotId:'e',quantity:'50',amount:'5000'}),ev('distribution','d1','2023-05-02',{amount:'100'}),ev('distribution','d2','2023-05-03',{depotId:'e',amount:'50'})];
 s.prices=[{securityId:'x',date:'2023-01-02',price:'100'},{securityId:'x',date:'2023-12-29',price:'110'}];validate(s);
 assert.deepEqual(replay(s,{until:'2024-01-02'}).moves.filter(m=>m.type==='vap').map(m=>m.income.gross),['78.5','39.25']);
});

test('F09/F10: bank values of the advance lump sum must be unique and belong to a holding',()=>{
 let s=base();s.events=[ev('buy','b','2022-01-10',{quantity:'1',amount:'100'}),ev('vap','v1','2024-01-02',{year:2023,amount:'1'})];validate(s);
 assert.throws(()=>withEvent(s,ev('vap','v2','2024-01-02',{year:2023,amount:'2'})),/schon erfasst/);
 // Bestehende Dublette: Tresor bleibt lesbar, der Wert gilt als offen.
 s.events.push(ev('vap','v2','2024-01-02',{year:2023,amount:'2'}));validate(s);
 let r=replay(s,{until:'2024-12-31'});assert.ok(r.issues.some(i=>i.kind==='vapDuplicate'));assert.equal(r.moves.find(m=>m.type==='vap'&&m.year===2023).income,null);
 // Ohne Bestand: nicht stillschweigend verworfen.
 s=base();s.events=[ev('vap','v','2024-01-02',{year:2023,amount:'100'})];validate(s);
 r=replay(s,{until:'2024-12-31'});assert.ok(r.issues.some(i=>i.kind==='vapUnused'&&/kein Bestand/.test(i.reason)));
 const y=yearReport(s,'p',2024);assert.equal(y.status,'incomplete');assert.match(y.reasons.map(x=>x.text).join(' '),/kein Bestand/);
});

test('F11/F14: acquisition date and group must agree; a merger into another exemption rate needs the price of the target',()=>{
 let s=base('stock');
 assert.throws(()=>withEvent(s,ev('opening','o','2026-01-01',{group:'pre2009',acquired:'2012-01-01',quantity:'10',cost:'100'})),/gehört zur Erwerbsgruppe „2009 bis 2017“/);
 s.events=[ev('opening','o','2026-01-01',{group:'pre2009',acquired:'2012-01-01',quantity:'10',cost:'100'}),ev('sell','s','2026-02-02',{quantity:'10',amount:'200'})];validate(s);
 let sale=replay(s,{until:'2026-12-31'}).moves.find(m=>m.type==='sell').sale;assert.equal(sale.status,'incomplete');assert.match(sale.reasons[0].reason,/passt nicht zur Erwerbsgruppe/);
 s=base();s.securities.push({id:'y',name:'Mischfonds Y',kind:'mixedFund'});s.events=[ev('buy','b','2026-01-02',{quantity:'1',amount:'100'})];validate(s);
 s.events.push(ev('merger','m','2026-02-02',{toSecurityId:'y',ratio:'1'}),ev('sell','s','2026-03-02',{securityId:'y',quantity:'1',amount:'120'}));validate(s);
 sale=replay(s,{until:'2026-12-31'}).moves.find(m=>m.type==='sell').sale;assert.equal(sale.status,'incomplete');assert.match(sale.reasons[0].reason,/Rücknahmepreis des Zielfonds.*§ 22/);
});

test('F12: losses at a foreign bank need no German loss certificate; German banks still do',()=>{
 const s=base('stock');s.events=[ev('buy','b','2026-01-02',{quantity:'1',amount:'100'}),ev('sell','s','2026-02-02',{quantity:'1',amount:'50'})];validate(s);
 assert.equal(yearReport(s,'p',2026).status,'incomplete');
 s.depots[0].abroad=true;validate(s);
 const r=yearReport(s,'p',2026);assert.equal(r.status,'supported');assert.equal(r.carry.stockLoss,'50');
 assert.deepEqual(r.withholding.map(w=>[w.bank,w.source,w.amount]),[['Bank A','abroad','0']]);
 assert.deepEqual([r.abroad.kap.income,r.abroad.kap.stockLosses,r.abroad.kap.stockGains],['-50','50','0']);
});

test('F13: after selling everything, the holding is zero even if the original cost was unknown',()=>{
 const s=base('stock');s.events=[ev('opening','o','2026-01-01',{group:'from2018',acquired:'2020-01-01',quantity:'1'}),ev('sell','s','2026-03-02',{quantity:'1',amount:'100'})];validate(s);
 const r=statement(s,'d',2026,'economic');assert.deepEqual([r.rows[0].closing.quantity,r.rows[0].closing.value,r.balanced],['0','0',true]);
});

test('F15: the bank of a depot stays fixed in closed years; a rename in open years carries the certificates along',()=>{
 let s=base('stock');s.events=[ev('buy','b','2025-01-02',{quantity:'1',amount:'100'}),ev('sell','s','2025-02-03',{quantity:'1',amount:'50'})];
 s.certificates=[{id:'c',personId:'p',bank:'Bank A',year:2025,lossCertificate:true,certifiedStockLoss:'50',certifiedOtherLoss:'0'}];validate(s);
 assert.equal(yearReport(s,'p',2025).status,'supported');
 const closed=withClosing(s,'p',2025);
 assert.throws(()=>withRecord(closed,'depots',{...closed.depots[0],bank:'Bank umbenannt'}),/abgeschlossene Jahre/);
 assert.throws(()=>withRecord(closed,'depots',{...closed.depots[0],abroad:true}),/abgeschlossene Jahre/);
 const renamed=withRecord(s,'depots',{...s.depots[0],bank:'Bank Neu'});
 assert.equal(renamed.certificates[0].bank,'Bank Neu');assert.equal(yearReport(renamed,'p',2025).status,'supported');
});

test('church tax for part of the year is divided into twelfths, also inside the capital gains tax formula',()=>{
 const s=base('stock');s.events=[interest('i','d','10000')];s.years.p[2026]={...PARAMS,churchRate:'0.09',churchUntil:1};validate(s);
 // k = 9 % × 1/12 = 0,75 %: 10.000 / 4,0075 = 2.495,32; Soli 137,24; Kirchensteuer 18,71 (BMF Rz. 133).
 const r=yearReport(s,'p',2026);assert.deepEqual([r.churchMonths,r.capitalTax,r.solidarity,r.churchTax,r.total],[1,'2495.32','137.24','18.71','2651.27']);
 delete s.years.p[2027];assert.equal(yearDefaults(s,'p',2027).churchRate,'0','nach dem Austritt keine Kirchensteuer vorschlagen');
 assert.throws(()=>validate({...s,years:{p:{2026:{...PARAMS,churchRate:'0',churchUntil:3}}}}),/Kirchensteuersatz angeben/);
 assert.throws(()=>validate({...s,years:{p:{2026:{...PARAMS,churchRate:'0.09',churchUntil:3,churchFrom:5}}}}),/Austritt und Eintritt/);
});

test('F19: with several purchases 2009-2017 a partial sale needs the deemed gain from the sale statement',()=>{
 const history=()=>{const s=base();s.events=[ev('buy','a','2010-01-04',{quantity:'1',amount:'100'}),ev('buy','b','2015-01-05',{quantity:'1',amount:'200'}),ev('transition','t','2017-12-31',{price2017:'300',deemed2017:'240',oldIncome:'0'}),
  ev('vap','v18','2019-01-02',{year:2018,amount:'0'}),ev('vap','v19','2020-01-02',{year:2019,amount:'0'}),ev('vap','v20','2021-01-04',{year:2020,amount:'0'})];return s;};
 let s=history();s.events.push(ev('sell','s','2021-06-01',{quantity:'1',amount:'400'}));validate(s);
 let sale=replay(s,{until:'2021-12-31'}).moves.find(m=>m.type==='sell').sale;assert.equal(sale.status,'incomplete');assert.match(sale.reasons[0].reason,/laut Verkaufsabrechnung/);
 // Mit dem Wert der Abrechnung: 200 € fiktiver Gewinn + (400 − 300) × 70 % = 270 €; der Rest der Bank (40 €) bleibt beim zweiten Stück.
 s=history();s.events.push(ev('sell','s','2021-06-01',{quantity:'1',amount:'400',deemedSold:'200'}),ev('sell','s2','2021-07-01',{quantity:'1',amount:'400'}));validate(s);
 const sales=replay(s,{until:'2021-12-31'}).moves.filter(m=>m.type==='sell').map(m=>m.sale);
 assert.deepEqual(sales.map(x=>[x.status,x.taxable,x.deemedGain]),[['supported','270','200'],['supported','110','40']]);
 // Verkauf aller Stücke auf einmal: die Summe der Bank genügt.
 s=history();s.events.push(ev('sell','s','2021-06-01',{quantity:'2',amount:'800'}));validate(s);
 sale=replay(s,{until:'2021-12-31'}).moves.find(m=>m.type==='sell').sale;assert.deepEqual([sale.status,sale.taxable],['supported','380']);
});

test('F24: advance lump sums of a foreign depot reduce the gain only once declared or within the saver allowance',()=>{
 const s=base();s.depots[0].abroad=true;
 s.events=[ev('buy','b','2023-01-03',{quantity:'100',amount:'10000'}),ev('sell','s','2025-01-01',{quantity:'100',amount:'12000'})];
 s.prices=[{securityId:'x',date:'2023-01-02',price:'100'},{securityId:'x',date:'2023-12-29',price:'110'}];
 // 2024 war der Sparer-Pauschbetrag anderweitig ausgeschöpft: die Vorabpauschale 2023 hätte Steuer ausgelöst.
 s.years.p[2024]={...PARAMS,externalAllowance:'1000'};validate(s);
 let r=yearReport(s,'p',2025);assert.equal(r.status,'incomplete');assert.match(r.reasons.map(x=>x.text).join(' '),/Vorabpauschale 2023 aus einem Depot ohne deutschen Steuerabzug/);
 s.years.p[2024]={...PARAMS,externalAllowance:'1000',foreignDeclared:true};validate(s);
 r=yearReport(s,'p',2025);assert.equal(r.status,'supported');assert.equal(r.sales[0].sale.taxable,'1275.05','(12.000 − 10.000 − 178,50) × 70 %');
 // Im Sparer-Pauschbetrag geblieben: ebenfalls abziehbar.
 s.years.p[2024]={...PARAMS,externalAllowance:'0'};validate(s);assert.equal(yearReport(s,'p',2025).status,'supported');
 // Deutsche Bank: die Bank hat die Vorabpauschale selbst angesetzt.
 s.depots[0].abroad=false;s.years.p[2024]={...PARAMS,externalAllowance:'1000'};validate(s);assert.equal(yearReport(s,'p',2025).status,'supported');
});

test('foreign depots deliver the values for Anlage KAP and KAP-INV',()=>{
 const s=base();s.depots[0].abroad=true;s.securities.push({id:'st',name:'Aktie S',kind:'stock'});
 s.events=[ev('buy','b','2026-01-02',{quantity:'100',amount:'10000'}),ev('distribution','di','2026-05-04',{amount:'1000',foreignTax:'150'}),
  ev('buy','bs','2026-01-02',{securityId:'st',quantity:'10',amount:'1000'}),ev('sell','ss','2026-03-02',{securityId:'st',quantity:'10',amount:'1500'})];validate(s);
 const r=yearReport(s,'p',2026);
 assert.equal(r.abroad.inv.distributions.equityFund,'1000');assert.deepEqual([r.abroad.kap.income,r.abroad.kap.stockGains,r.abroad.kap.foreignTax],['500','500','150']);
 assert.equal(r.foreignTax.creditable,'150');
});

test('grandchildren whose parent has died get the allowance of a child',()=>{
 assert.equal(RELATIONS.grandchildOfDeceased.allowance,'400000');assert.equal(RELATIONS.grandchild.allowance,'200000');
});
