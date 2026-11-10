import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyState,validate,withRecord} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {fxReplay} from '../dist/core/fx.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {giftAssessments} from '../dist/core/gifttax.mjs';
import {filingSections} from '../dist/ui/filing.mjs';
import {sheetHTML} from '../dist/ui/sheet.mjs';

// Gegenproben zur Nachprüfung vom 04.11.2026 (N01–N12, T01, T02), alle mit erfundenen Daten.
const YEAR={churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'};
function base({abroad=false}={}){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person'},{id:'k',name:'Kind'}];
 s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot',abroad},{id:'d2',personId:'k',bank:'Bank A',name:'Kinderdepot'}];
 s.securities=[{id:'A',isin:'LU0000000001',name:'Fiktiver Aktienfonds A',kind:'equityFund'},{id:'B',isin:'LU0000000002',name:'Fiktiver Aktienfonds B',kind:'equityFund'},{id:'st',isin:'US0000000001',name:'Fiktive Inc.',kind:'stock'}];
 s.years={p:{2023:YEAR,2025:YEAR,2026:YEAR}};
 return s;
}

test('N01: accumulated old-law income is no income of the sale year; the bank withholding on it shows as expected refund',()=>{
 // Aktienfonds 2009–2017: Basis 2018 10.000 €, fiktiver Gewinn 1.000 €, akkumulierte Erträge 1.000 €, Verkauf 12.000 €,
 // Sparer-Pauschbetrag anderweitig genutzt. Einkünfte 2.000 × 70 % + 1.000 = 2.400 €, Steuer 600 + 33 = 633,00 €.
 const s=base();s.years.p[2025]={...YEAR,externalAllowance:'1000'};
 s.events=[{id:'o',type:'opening',date:'2025-01-02',depotId:'d',securityId:'A',quantity:'100',cost:'8000',group:'from2009',acquired:'2012-05-02',price2017:'100',deemed2017:'1000',oldIncome:'1000',vapBefore:'0'},
  {id:'s',type:'sell',date:'2025-06-02',depotId:'d',securityId:'A',quantity:'100',amount:'12000',capitalTax:'850',solidarity:'46.75',churchTax:'0'}];
 validate(s);
 const r=yearReport(s,'p',2025);
 assert.deepEqual([r.taxable,r.total,r.bankWithheld,r.difference],['2400','633','896.75','263.75']);
 assert.equal(r.kap.accumulated.equityFund,'1000');
 assert.ok(r.hints.some(h=>/1\.000,00 € akkumulierte ausschüttungsgleiche Erträge.*nicht zu den Einkünften des Verkaufsjahres.*BMF-Schreibens vom 17\.12\.2012/.test(h)));
 assert.match(filingSections(r).find(x=>x.title==='Deutsche Depots · Anlage KAP').note,/von den bescheinigten Kapitalerträgen abziehen/);
 // Ohne deutschen Steuerabzug: nicht im Verkaufsjahr erklären.
 const a=base({abroad:true});a.years.p[2025]={...YEAR,externalAllowance:'1000'};a.events=s.events.map(e=>({...e,capitalTax:undefined,solidarity:undefined,churchTax:undefined}));
 const ra=yearReport(a,'p',2025);assert.equal(ra.taxable,'2400');
 assert.match(filingSections(ra).find(x=>x.title.startsWith('Akkumulierte')).note,/Nicht im Verkaufsjahr erklären/);
});

function merged(date,units){
 const s=base();
 s.events=[{id:'o',type:'opening',date:'2022-12-30',depotId:'d',securityId:'A',quantity:'100',cost:'10000',group:'from2018',acquired:'2020-01-06',vapBefore:'0'},
  {id:'m',type:'merger',date,depotId:'d',securityId:'A',toSecurityId:'B',ratio:'1'}];
 s.vapUnits=units;return s;
}
test('N02: advance lump sum in the merger year – twelfths from the merger month, at 31.12. from the old fund',()=>{
 // Zielfonds 1,785 € je Anteil für das volle Jahr; Verschmelzung zum 01.07.: 6/12 – 89,25 €.
 const july=replay(merged('2023-07-01',[{securityId:'B',year:2023,perUnit:'1.785'}]),{until:'2024-12-31'}).moves.find(m=>m.type==='vap'&&m.year===2023);
 assert.deepEqual([july.securityId,july.tax],['B','89.25']);
 // Zum 31.12.: Werte des untergegangenen Fonds, 0,50 € je Anteil – 50,00 €.
 const dec=replay(merged('2023-12-31',[{securityId:'A',year:2023,perUnit:'0.5'},{securityId:'B',year:2023,perUnit:'1.785'}]),{until:'2024-12-31'}).moves.find(m=>m.type==='vap'&&m.year===2023);
 assert.equal(dec.tax,'50');
 // Im Folgejahr wieder volles Jahr.
 const next=replay({...merged('2023-07-01',[{securityId:'B',year:2023,perUnit:'1.785'},{securityId:'B',year:2024,perUnit:'1'}])},{until:'2025-12-31'}).moves.find(m=>m.type==='vap'&&m.year===2024);
 assert.equal(next.tax,'100');
});

test('N03: two distributions in the same depot within seven days are both counted; the same one in two depots once',()=>{
 // 100 Anteile, Kurs 100 → 110 €, Basisertrag 1,785 € je Anteil; zwei Ausschüttungen je 1 € je Anteil: Vorabpauschale 0.
 const s=base();s.prices=[{securityId:'A',date:'2023-01-02',price:'100'},{securityId:'A',date:'2023-12-29',price:'110'}];
 s.events=[{id:'o',type:'opening',date:'2022-12-30',depotId:'d',securityId:'A',quantity:'100',cost:'10000',group:'from2018',acquired:'2020-01-06',vapBefore:'0'},
  {id:'x1',type:'distribution',date:'2023-05-02',depotId:'d',securityId:'A',amount:'100'},{id:'x2',type:'distribution',date:'2023-05-05',depotId:'d',securityId:'A',amount:'100'}];
 assert.equal(replay(s,{until:'2024-12-31'}).moves.filter(m=>m.type==='vap'&&m.year===2023&&Number(m.tax)>0).length,0);
 // Dieselbe Ausschüttung in zwei Depots: 1 € je Anteil, je Depot (1,785 − 1) × 100 = 78,50 €.
 const t=base();t.prices=s.prices;
 t.events=[s.events[0],{...s.events[0],id:'o2',depotId:'d2'},{id:'y1',type:'distribution',date:'2023-05-02',depotId:'d',securityId:'A',amount:'100'},{id:'y2',type:'distribution',date:'2023-05-03',depotId:'d2',securityId:'A',amount:'100'}];
 assert.deepEqual(replay(t,{until:'2024-12-31'}).moves.filter(m=>m.type==='vap'&&m.year===2023).map(m=>m.tax),['78.5','78.5']);
});

function fx(events){const s=base();s.accounts=[{id:'a',depotId:'d',name:'USD',currency:'USD',kind:'payment'}];s.events=events;return s;}
test('N04: opening lots on the same day are consumed by their original acquisition date',()=>{
 // Je 100 USD: erworben 01.12.2025 für 100 € (zuerst erfasst) und 01.07.2025 für 50 €; März: 100 USD für 150 €.
 const s=fx([{id:'f1',type:'fx',kind:'opening',date:'2026-01-01',accountId:'a',acquired:'2025-12-01',amount:'100',eur:'100'},
  {id:'f2',type:'fx',kind:'opening',date:'2026-01-01',accountId:'a',acquired:'2025-07-01',amount:'100',eur:'50'},
  {id:'f3',type:'fx',kind:'exchangeOut',date:'2026-03-02',accountId:'a',amount:'100',eur:'150'}]);
 const m=fxReplay(s,{until:'2026-12-31'}).moves.find(x=>x.eventId==='f3');
 assert.deepEqual([m.gain,m.parts[0].acquired],['100','2025-07-01']);
});

test('N05/N10: a sale credited to a currency account with tax needs the rate; the credit is acquired on the sale day',()=>{
 const buy={id:'b',type:'buy',date:'2025-03-03',depotId:'d',securityId:'st',quantity:'10',amount:'150'};
 // Steuer 20 € auf 200 € Erlös, Gutschrift 180 USD: ohne Kurs offen.
 const open=fx([buy,{id:'s',type:'sell',date:'2026-01-10',depotId:'d',securityId:'st',quantity:'10',amount:'200',capitalTax:'20',solidarity:'0',churchTax:'0',fx:{accountId:'a',amount:'180'}}]);
 const r=fxReplay(open,{until:'2026-12-31'});
 assert.equal(r.moves.find(m=>m.eventId==='s').eur,null);assert.ok(r.issues.some(i=>/Devisenkurs der Abrechnung angeben/.test(i.reason)));
 // Mit Kurs 1: EUR-Wert 180, Rücktausch für 180 € ohne Gewinn.
 const rated=fx([buy,{...open.events[1],fx:{accountId:'a',amount:'180',rate:'1'}},{id:'e',type:'fx',kind:'exchangeOut',date:'2026-06-01',accountId:'a',amount:'180',eur:'180'}]);
 assert.equal(fxReplay(rated,{until:'2026-12-31'}).moves.find(m=>m.eventId==='e').gain,'0');
 // Ohne Steuer genügt der EUR-Erlös; Rücktausch nach knapp fünf Monaten: 50 € steuerbar, kein offener Anschaffungstag.
 const plain=fx([buy,{id:'s',type:'sell',date:'2026-01-10',depotId:'d',securityId:'st',quantity:'10',amount:'200',fx:{accountId:'a',amount:'100'}},{id:'e',type:'fx',kind:'exchangeOut',date:'2026-06-01',accountId:'a',amount:'100',eur:'250'}]);
 const p=fxReplay(plain,{until:'2026-12-31'});const e=p.moves.find(m=>m.eventId==='e');
 assert.deepEqual([e.gain,e.taxable,e.parts[0].within],['50','50',true]);assert.equal(p.issues.length,0);
});

test('N06: gains from protected old shares are listed per sale without netting losses',()=>{
 // Zwei Aktienfonds vor 2009: +50 € und −50 € ab 2018. Ausweis 50 € vor und 35 € nach Teilfreistellung.
 const s=base();
 s.events=[{id:'oA',type:'opening',date:'2025-01-02',depotId:'d',securityId:'A',quantity:'10',cost:'50',group:'pre2009',price2017:'10',oldIncome:'0',vapBefore:'0'},
  {id:'oB',type:'opening',date:'2025-01-02',depotId:'d',securityId:'B',quantity:'10',cost:'50',group:'pre2009',price2017:'10',oldIncome:'0',vapBefore:'0'},
  {id:'sA',type:'sell',date:'2025-06-02',depotId:'d',securityId:'A',quantity:'10',amount:'150',capitalTax:'0',solidarity:'0',churchTax:'0'},
  {id:'sB',type:'sell',date:'2025-06-03',depotId:'d',securityId:'B',quantity:'10',amount:'50',capitalTax:'0',solidarity:'0',churchTax:'0'}];
 const r=yearReport(s,'p',2025);
 assert.deepEqual([r.kap.protectedGain.equityFund,r.kap.protectedGainAfterExemption.equityFund,r.protectedUsed],['50','35','35']);
 assert.ok(filingSections(r).some(x=>x.title==='Deutsche Depots · Anlage KAP'));
});

test('N07: the Sparer-Pauschbetrag lines ask for the amount already used, also with only Anlage KAP-INV',()=>{
 const s=base({abroad:true});
 s.events=[{id:'o',type:'opening',date:'2025-01-02',depotId:'d',securityId:'A',quantity:'10',cost:'1000',group:'from2018',acquired:'2020-01-06',vapBefore:'0'},{id:'x',type:'distribution',date:'2025-05-02',depotId:'d',securityId:'A',amount:'100'}];
 const f=filingSections(yearReport(s,'p',2025)),k=f.find(x=>x.title==='Sparer-Pauschbetrag · Anlage KAP');
 assert.ok(f.some(x=>x.title.endsWith('Anlage KAP-INV')));assert.match(k.note,/bereits in Anspruch genommen wurde – laut Steuerbescheinigungen, gegebenenfalls 0 –, nicht den noch offenen Rest/);
 assert.ok(!f.some(x=>/nicht schon über Freistellungsaufträge genutzt/.test(x.note)));
});

test('N08: renaming the bank of a stand-alone account moves its certificate; another carrier of the old name keeps it',()=>{
 const s=base();s.depots=s.depots.filter(d=>d.id!=='d');s.accounts=[{id:'a',personId:'p',bank:'Bank X',name:'USD',currency:'USD',kind:'interest'}];
 s.certificates=[{id:'c',personId:'p',bank:'Bank X',year:2026,capitalTax:'100',solidarity:'0',churchTax:'0'}];
 assert.equal(withRecord(s,'accounts',{...s.accounts[0],bank:'Bank Y'}).certificates[0].bank,'Bank Y');
 const both={...s,accounts:[...s.accounts,{id:'b',personId:'p',bank:'Bank X',name:'CHF',currency:'CHF',kind:'interest'}]};
 assert.equal(withRecord(both,'accounts',{...both.accounts[0],bank:'Bank Y'}).certificates[0].bank,'Bank X');
});

test('N09: entering the deemed gain of the sold shares does not lift another block',()=>{
 // Verschmelzung Aktienfonds → Mischfonds ohne Rücknahmepreis des Zielfonds (§ 22 InvStG), dann Verkauf mit Bankwert.
 const s=base();s.securities.push({id:'M',isin:'LU0000000003',name:'Fiktiver Mischfonds',kind:'mixedFund'});
 s.events=[{id:'o',type:'opening',date:'2024-01-02',depotId:'d',securityId:'A',quantity:'100',cost:'8000',group:'from2009',acquired:'2012-05-02',price2017:'100',deemed2017:'2000',oldIncome:'0',vapBefore:'0'},
  {id:'m',type:'merger',date:'2024-04-02',depotId:'d',securityId:'A',toSecurityId:'M',ratio:'1'},
  {id:'s',type:'sell',date:'2024-06-03',depotId:'d',securityId:'M',quantity:'50',amount:'6000',deemedSold:'1000'}];
 assert.equal(replay(s,{until:'2024-12-31'}).moves.find(m=>m.type==='sell').sale.status,'incomplete');
});

test('N11: a recorded actual tax of a prior acquisition is credited even in a supported year',()=>{
 // Vorerwerb 600.000 € im Januar 2026 mit tatsächlich 60.000 € Steuer; Erwerb 450.000 € im Juni.
 // Gesamt 1.050.000 − 400.000 = 650.000 €: 115.000 € mit Härteausgleich, abzüglich 60.000 € = 55.000 €.
 const s=base();s.relations=[{donorId:'p',recipientId:'k',kind:'child'}];
 s.priorGifts=[{id:'pg',donorId:'p',recipientId:'k',date:'2026-01-15',value:'600000',taxPaid:'60000'}];
 s.events=[{id:'o',type:'opening',date:'2025-12-31',depotId:'d',securityId:'st',quantity:'4500',cost:'100000',group:'from2018',acquired:'2020-01-02'},
  {id:'g',type:'transfer',kind:'gift',date:'2026-06-01',depotId:'d',toDepotId:'d2',securityId:'st',quantity:'4500',price:'100'}];
 const g=giftAssessments(s,replay(s,{until:'2026-12-31'}).moves,'p','k').acquisitions.find(a=>a.date==='2026-06-01');
 assert.deepEqual([g.credit,g.tax],['60000','55000']);
});

test('N12: the loss without partial exemption is listed for the return with the difference it makes',()=>{
 // Fonds 2009–2017 ohne deutschen Steuerabzug: Kosten 100 €, Kurs 31.12.2017 200 €, fiktiver Gewinn 100 €, Verkauf 150 €.
 // Einkünfte 100 − 50 = 50 €; das Finanzamt würde −50 € teilfreistellen (65 €) – 15 € zu hoch.
 const s=base({abroad:true});
 s.events=[{id:'o',type:'opening',date:'2025-01-02',depotId:'d',securityId:'A',quantity:'1',cost:'100',group:'from2009',acquired:'2012-05-02',price2017:'200',deemed2017:'100',oldIncome:'0',vapBefore:'0'},
  {id:'s',type:'sell',date:'2025-06-02',depotId:'d',securityId:'A',quantity:'1',amount:'150'}];
 const r=yearReport(s,'p',2025),x=filingSections(r).find(y=>y.title.startsWith('Verlust ohne Teilfreistellung'));
 assert.equal(r.items[0].taxable,'50');assert.deepEqual(x.rows,[['Ohne deutschen Steuerabzug · Aktienfonds','50','15']]);
});

test('T01/T02: unsaved changes survive unlinking a file and an automatic lock; the Excel export says what it contains',()=>{
 const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
 assert.match(app,/'unlink-file':async\(\)=>\{const unsaved=saver\.error;.*saver\.reset\(\);if\(unsaved\)persist\(\);/);
 assert.match(app,/if\(!ask&&saver\.error&&state&&session&&!demo\)\{try\{rescue=\{vaultId,envelope:await seal\(state,session\)/);
 assert.match(app,/'rescue-take':/);assert.match(app,/'rescue-file':/);
 const s=base();s.events=[{id:'o',type:'opening',date:'2025-01-02',depotId:'d',securityId:'st',quantity:'1',cost:'10',group:'from2018',acquired:'2020-01-02'}];
 assert.match(sheetHTML(s,{year:2025,from:2025,personId:'p',securityId:'st',view:'both'}),/Steuer, Schenkungen und Protokoll der Person vollständig/);
});
