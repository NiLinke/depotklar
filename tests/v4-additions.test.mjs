import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyState,validate,upgrade,withEvent,withoutEvent,withRecord,withYear,withPrice,withBatch,withoutBatch,withClosing,today} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {fxReplay,accountStatement} from '../dist/core/fx.mjs';
import {demoState} from '../dist/core/sample.mjs';
import {splitByRatio,batchDraft,applyBatch,entryFormHTML,newDraft,draftFromEvent,apply} from '../dist/ui/entry.mjs';
import {auditHTML,changes} from '../dist/ui/audit.mjs';
import {closingHTML} from '../dist/ui/closing.mjs';
import {taxPageHTML} from '../dist/ui/taxpage.mjs';
import {sheetHTML} from '../dist/ui/sheet.mjs';
import {accountsHTML} from '../dist/ui/accounts.mjs';
import {masterHTML} from '../dist/ui/master.mjs';
import {pricesHTML} from '../dist/ui/prices.mjs';
import {workbook,taxRows} from '../dist/ui/xlsx.mjs';
import ExcelJS from 'exceljs';

// ---------- Zinsen und ausländische Quellensteuer ----------

// Eine Aktie und ein Fonds, Sparer-Pauschbetrag anderweitig voll genutzt: jeder Ertrag ist voll steuerpflichtig.
function income({church='0',external='1000',foreignTax='150',amount='1000',kind='stock',extra=[]}={}){
 const s=emptyState();
 s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];
 s.securities=[{id:'C',isin:'US1',name:'Aktie USA',kind:'stock'},{id:'F',isin:'IE1',name:'Fonds',kind:'equityFund'}];
 s.events=[{id:'oC',type:'opening',date:'2025-12-31',depotId:'d',securityId:'C',quantity:'100',cost:'1000',group:'from2018',acquired:'2021-01-01'},
  {id:'oF',type:'opening',date:'2025-12-31',depotId:'d',securityId:'F',quantity:'100',cost:'1000',group:'from2018',acquired:'2021-01-01',vapBefore:'0'},
  {id:'vF',type:'vap',date:'2026-01-02',year:2025,depotId:'d',securityId:'F',amount:'0'},
  {id:'div',type:'distribution',date:'2026-07-01',depotId:'d',securityId:kind==='stock'?'C':'F',amount,foreignTax},...extra];
 s.years={p:{2026:{churchRate:church,externalAllowance:external,stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'}}};
 validate(s);return s;
}

test('foreign withholding on a share dividend reduces the tax by q in (e − 4q)/(4 + k), capped at 25 % per dividend',()=>{
 let r=yearReport(income(),'p',2026);
 assert.equal(r.status,'supported');assert.equal(r.taxable,'1000');
 assert.deepEqual(r.foreignTax,{creditable:'150',credited:'150'});
 assert.equal(r.capitalTax,'100');assert.equal(r.solidarity,'5.5');assert.equal(r.total,'105.5');
 // 280 € einbehalten, anrechenbar höchstens 250 € (25 % von 1.000 €): Steuer null.
 r=yearReport(income({foreignTax:'280'}),'p',2026);
 assert.deepEqual(r.foreignTax,{creditable:'250',credited:'250'});assert.equal(r.capitalTax,'0');assert.match(r.hints.join(' '),/über 25 %/);
 // Kirchensteuer 9 %: (1.000 − 600) / 4,09 = 97,80; Soli 5,37; KiSt 8,80.
 r=yearReport(income({church:'0.09'}),'p',2026);
 assert.equal(r.capitalTax,'97.8');assert.equal(r.solidarity,'5.37');assert.equal(r.churchTax,'8.8');assert.equal(r.total,'111.97');
});

test('withholding beyond the German tax lapses, fund distributions get the credit after partial exemption, and interest is fully taxable',()=>{
 let r=yearReport(income({external:'0'}),'p',2026);
 assert.equal(r.taxable,'0');assert.deepEqual(r.foreignTax,{creditable:'150',credited:'0'});assert.equal(r.total,'0');assert.match(r.hints.join(' '),/verfällt/);
 // BMF vom 14.05.2025, Rz. 148: Quellensteuer auf Fondsausschüttungen ist anrechenbar, höchstens 25 % des Ertrags nach Teilfreistellung.
 r=yearReport(income({kind:'fund'}),'p',2026);
 assert.equal(r.status,'supported');assert.deepEqual(r.foreignTax,{creditable:'150',credited:'150'});
 assert.equal(r.taxable,'700','Teilfreistellung 30 %');assert.equal(r.capitalTax,'25','(700 − 4 × 150) / 4');
 r=yearReport(income({kind:'fund',foreignTax:'300'}),'p',2026);
 assert.deepEqual(r.foreignTax,{creditable:'175',credited:'175'});assert.equal(r.capitalTax,'0');assert.match(r.hints.join(' '),/über 25 % des steuerpflichtigen Ertrags nach Teilfreistellung/);
 r=yearReport(income({extra:[{id:'z',type:'interest',date:'2026-12-31',depotId:'d',amount:'200',withheld:'52.75'}]}),'p',2026);
 assert.equal(r.taxable,'1200');assert.equal(r.capitalTax,'150');assert.ok(r.items.some(i=>i.kind==='interest'&&i.taxable==='200'));
 // Ohne Steuereinbehalt an der Dividende ist der Abgleich offen, nicht stillschweigend vollständig.
 assert.equal(r.bankWithheld,null);assert.match(r.withholding[0].missing,/Steuereinbehalt/);
 const withDividend=income({extra:[{id:'z',type:'interest',date:'2026-12-31',depotId:'d',amount:'200',withheld:'52.75'}]});withDividend.events.find(e=>e.id==='div').withheld='0';
 assert.equal(yearReport(withDividend,'p',2026).bankWithheld,'52.75');
 assert.throws(()=>validate({...income(),events:[{id:'z',type:'interest',date:'2026-01-01',depotId:'d',securityId:'C',amount:'1'}]}),/ohne Wertpapier/);
});

// ---------- Schenkung an mehrere ----------

function family(){
 const s=emptyState();
 s.persons=[{id:'A',name:'Mutter'},{id:'B',name:'Kind B'},{id:'C',name:'Kind C'}];
 s.relations=[{donorId:'A',recipientId:'B',kind:'child'},{donorId:'A',recipientId:'C',kind:'child'}];
 s.depots=[{id:'dA',personId:'A',bank:'H',name:'Mutter'},{id:'dB',personId:'B',bank:'H',name:'B'},{id:'dC',personId:'C',bank:'H',name:'C'}];
 s.securities=[{id:'F',isin:'F1',name:'Fonds',kind:'equityFund'}];
 s.events=[{id:'o1',type:'opening',date:'2018-01-01',depotId:'dA',securityId:'F',quantity:'600',cost:'6000',group:'pre2009',price2017:'20',oldIncome:'0',vapBefore:'0'},
  {id:'k1',type:'buy',date:'2020-01-15',depotId:'dA',securityId:'F',quantity:'400',amount:'10000'}];
 validate(s);return s;
}
const lots=(s,depot)=>(replay(s,{until:'2024-12-31'}).positions.get(`${depot}|F`)||[]).map(l=>[l.group,l.quantity,l.cost]);
const batch=(s,allocation,[b,c])=>withBatch(s,'gb',[{type:'transfer',date:'2024-06-01',depotId:'dA',securityId:'F',toDepotId:'dB',quantity:b,kind:'gift',allocation,price:'30'},{type:'transfer',date:'2024-06-01',depotId:'dA',securityId:'F',toDepotId:'dC',quantity:c,kind:'gift',allocation,price:'30'}]);

test('a gift to several children allocates the lots in row order or pro rata with the same acquisition mix',()=>{
 const seq=batch(family(),'sequence',['500','300']);
 assert.deepEqual(lots(seq,'dB'),[['pre2009','500','5000']]);
 assert.deepEqual(lots(seq,'dC'),[['pre2009','100','1000'],['from2018','200','5000']]);
 const pro=batch(family(),'prorata',['500','300']);
 assert.deepEqual(lots(pro,'dB'),[['pre2009','375','3750'],['from2018','125','3125']]);
 assert.deepEqual(lots(pro,'dC'),[['pre2009','225','2250'],['from2018','75','1875']]);
 assert.deepEqual(lots(pro,'dA'),[['from2018','200','5000']]);
 // Gemeinsam gespeichert, gemeinsam gelöscht; jede Zeile steht im Protokoll.
 assert.equal(pro.events.filter(e=>e.batchId==='gb').length,2);assert.equal(pro.audit.filter(a=>a.action==='Vorgang erfasst').length,2);
 assert.equal(withoutBatch(pro,'gb').events.length,2);
 assert.throws(()=>withBatch(family(),'gb',[{type:'transfer',date:'2024-06-01',depotId:'dA',securityId:'F',toDepotId:'dB',quantity:'1',kind:'gift',allocation:'sequence'},{type:'transfer',date:'2024-06-02',depotId:'dA',securityId:'F',toDepotId:'dC',quantity:'1',kind:'gift',allocation:'sequence'}]),/dasselbe Datum/);
});

test('shares by ratio always add up to the total at the precision of the total',()=>{
 assert.deepEqual(splitByRatio('800',['5','3']),['500','300']);
 assert.deepEqual(splitByRatio('10',['1','1','1']),['4','3','3']);
 assert.deepEqual(splitByRatio('1234.567',['50','30','20']),['617.284','370.37','246.913']);
 assert.deepEqual(splitByRatio('1000',['1','2']),['333','667']);
 const s=demoState(),d=batchDraft(s,'gb1');
 assert.equal(d.rows.length,2);assert.equal(d.total,'3050');
 const r=applyBatch(s,{...d,mode:'ratio',total:'3050',rows:d.rows.map(x=>({...x,value:'1'}))});
 assert.deepEqual(r.events.map(e=>e.quantity),['1525','1525']);assert.deepEqual(r.events.map(e=>e.share),['1','1']);
 assert.match(entryFormHTML(s,draftFromEvent(s.events.find(e=>e.id==='g2'),s)),/Schenkung an mehrere|Lose zuteilen/);
});

// ---------- Jahresabschluss ----------

test('a closed year cannot be changed through events, prices, year data, certificates or master data',()=>{
 const s=withClosing(demoState(),'p1',2024,{});
 assert.deepEqual(s.closing,{p1:2024});assert.equal(s.audit.at(-1).action,'Abgeschlossen bis 2024');
 assert.throws(()=>withEvent(s,{type:'buy',date:'2024-05-01',depotId:'d2',securityId:'etf',quantity:'1',amount:'100'}),/2024 ist abgeschlossen/);
 assert.throws(()=>withEvent(s,{...s.events.find(e=>e.id==='x1'),amount:'1'}),/abgeschlossen/);
 assert.throws(()=>withEvent(s,{...s.events.find(e=>e.id==='x2'),date:'2024-12-01'}),/abgeschlossen/,'auch nicht in ein abgeschlossenes Jahr verschieben');
 assert.throws(()=>withoutEvent(s,'x1'),/abgeschlossen/);
 assert.throws(()=>withPrice(s,'af','2024-12-30','1'),/Kurs: 2024 ist abgeschlossen/);
 assert.throws(()=>withYear(s,'p1',2024,{churchRate:'0'}),/Jahresdaten/);
 assert.throws(()=>withRecord(s,'certificates',{personId:'p1',bank:'Hausbank',year:2024,capitalTax:'1'}),/Bankbescheinigung/);
 assert.throws(()=>withRecord(s,'securities',{...s.securities.find(x=>x.id==='af'),kind:'mixedFund'}),/Wertpapierart/);
 assert.doesNotThrow(()=>withRecord(s,'securities',{...s.securities.find(x=>x.id==='af'),name:'Neuer Name'}));
 assert.doesNotThrow(()=>withoutEvent(s,'x2'));assert.doesNotThrow(()=>withPrice(s,'af','2025-12-30','125'));
 assert.throws(()=>withClosing(s,'p1',2022,{reason:' '}),/Grund/);
 const open=withClosing(s,'p1',2022,{reason:'Bescheid geändert'});
 assert.equal(open.closing.p1,2022);assert.equal(open.audit.at(-1).ref,'closing:p1');assert.equal(open.audit.at(-1).action,'Wieder geöffnet ab 2023');assert.equal(open.audit.at(-1).reason,'Bescheid geändert');
 assert.throws(()=>withClosing(demoState(),'p1',Number(today().slice(0,4))),/nach seinem Ende/);
 assert.equal(withClosing(open,'p1',null,{reason:'alles offen'}).closing.p1,undefined);
});

test('each person closes on their own; a gift or a price is locked once any person involved has closed the year',()=>{
 const s=withClosing(demoState(),'p3',2025,{});
 // Laura hat 2025 abgeschlossen, Alexander nicht.
 assert.doesNotThrow(()=>withEvent(s,{...s.events.find(e=>e.id==='x2'),amount:'1'}));
 assert.doesNotThrow(()=>withYear(s,'p1',2025,{churchRate:'0'}));
 assert.throws(()=>withYear(s,'p3',2025,{churchRate:'0'}),/Jahresdaten: 2025 ist abgeschlossen \(Laura Weber\)/);
 assert.throws(()=>withEvent(s,{type:'transfer',kind:'gift',date:'2025-06-01',depotId:'d1',toDepotId:'d3',securityId:'af',quantity:'1',price:'120'}),/Vorgang: 2025 ist abgeschlossen \(Laura Weber\)/,'Schenkung an eine abgeschlossene Empfängerin');
 assert.doesNotThrow(()=>withEvent(s,{type:'transfer',kind:'gift',date:'2025-06-01',depotId:'d1',toDepotId:'d4',securityId:'af',quantity:'1',price:'120'}));
 assert.throws(()=>withPrice(s,'af','2025-12-30','125'),/Kurs: 2025 ist abgeschlossen \(Laura Weber\)/,'Laura hält den Altfonds');
 assert.doesNotThrow(()=>withPrice(s,'mf','2025-12-30','61'));
 const prices=pricesHTML(s);
 assert.match(prices,/data-security="af" data-year="2025"[^>]*disabled/);assert.doesNotMatch(prices,/data-security="mf" data-year="2025"[^>]*disabled/);assert.doesNotMatch(prices,/data-security="af" data-year="2026"[^>]*disabled/);
 assert.match(sheetHTML(s,{year:2025}),/Kinderdepot Laura <span class="badge locked"/);assert.doesNotMatch(sheetHTML(s,{year:2025}),/Altfonds <span class="badge locked"/);
 // Daten bis 4.1.1 mit gemeinsamem Abschluss werden je Person übernommen.
 const old={...demoState(),closedThrough:2024};upgrade(old);
 assert.deepEqual(old.closing,{p1:2024,p2:2024,p3:2024,p4:2024});assert.equal(old.closedThrough,undefined);assert.doesNotThrow(()=>validate(old));
 assert.throws(()=>validate({...demoState(),closedThrough:2024}),/alten Format/);
});

test('the closing dialog lists open points and locked entries open read-only',()=>{
 const s=withClosing(demoState(),'p1',2024,{});
 const html=closingHTML(s,{personId:'p1',year:2025});
 assert.match(html,/Alexander Weber<\/td><td><strong>2024<\/strong>/);assert.match(html,/Laura Weber<\/td><td><span class="muted">noch kein Jahr/);assert.match(html,/data-closing-person/);
 assert.doesNotMatch(closingHTML(s,{year:2025}),/data-form="reopen"/,'Wieder öffnen nur für eine gewählte Person');assert.match(html,/data-form="reopen"/);assert.match(html,/data-closing-year/);
 const form=entryFormHTML(s,draftFromEvent(s.events.find(e=>e.id==='x1'),s));
 assert.match(form,/2024 ist abgeschlossen/);assert.match(form,/<fieldset class="grid" disabled>/);assert.doesNotMatch(form,/Änderung speichern/);
 assert.doesNotMatch(form,/zuerst wieder öffnen/,'die Vorschau rechnet trotzdem');assert.match(form,/2024 ist abgeschlossen für Alexander Weber/);
 assert.match(sheetHTML(s,{year:2024}),/Abgeschlossen bis 2024/);assert.match(sheetHTML(s,{year:2024}),/class="line click locked"|locked/);
 assert.match(taxPageHTML(s,{personId:'p1',year:2024}),/2024 ist für Alexander Weber abgeschlossen/);
 assert.doesNotMatch(taxPageHTML(s,{personId:'p3',year:2024}),/ist für .* abgeschlossen/);
});

// ---------- Verlust bei Fonds 2009–2017 nach BFH vom 25.11.2025 ----------

test('a loss after 2018 on a 2009–2017 fund lot is not partly exempt where it only stems from the 2017 step-up',()=>{
 const s=emptyState();s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];s.securities=[{id:'F',name:'Aktienfonds',kind:'equityFund'}];
 // Urteilsfall VIII R 31/23 (Rz. 40): Kauf 2014 111.094,80 €, Rücknahmepreis 31.12.2017 161.663,40 €, Verkauf 2019 139.039,92 €.
 s.events=[{id:'o',type:'opening',date:'2018-01-01',depotId:'d',securityId:'F',quantity:'1000',group:'from2009',acquired:'2014-03-03',cost:'111094.80',price2017:'161.6634',deemed2017:'46765.10',oldIncome:'0',vapBefore:'0'},
  {id:'v',type:'vap',date:'2019-01-02',depotId:'d',securityId:'F',year:2018,amount:'0'},
  {id:'x',type:'sell',date:'2019-06-03',depotId:'d',securityId:'F',quantity:'1000',amount:'139039.92'}];
 validate(s);
 const sale=replay(s,{until:'2019-12-31'}).moves.find(m=>m.type==='sell').sale;
 assert.equal(sale.taxable,'24141.62');assert.equal(sale.lossWithoutExemption,'22623.48');
 s.years={p:{2019:{churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'}}};
 const r=yearReport(s,'p',2019);assert.match(r.hints.join(' '),/22623\.48 € Verlust ohne Teilfreistellung/);
 // Ohne ursprünglichen Anschaffungswert bleibt der Verkauf offen.
 const open=structuredClone(s);delete open.events[0].cost;
 assert.match(replay(open,{until:'2019-12-31'}).issues.map(i=>i.reason).join(' '),/ursprünglicher Anschaffungswert/);
 // Bestandsgeschützte Alt-Anteile sind ausgenommen: Teilfreistellung auf den ganzen Verlust.
 const old=structuredClone(s);Object.assign(old.events[0],{group:'pre2009',acquired:'2006-03-03'});delete old.events[0].deemed2017;
 assert.equal(replay(old,{until:'2019-12-31'}).moves.find(m=>m.type==='sell').sale.taxable,'-15836.436');
});

// ---------- Historie 2009–2017 ----------

test('fund purchases from 2009 are booked one by one and pass the deemed sale at the end of 2017',()=>{
 const s=emptyState();s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];s.securities=[{id:'F',name:'Fonds',kind:'equityFund'}];
 // 2010: 100 Stück für 5.000 €, 2014: 100 Stück für 8.000 €; 2016 Verkauf von 120 Stück für 10.800 €.
 s.events=[{id:'b1',type:'buy',date:'2010-03-01',depotId:'d',securityId:'F',quantity:'100',amount:'5000'},{id:'b2',type:'buy',date:'2014-05-02',depotId:'d',securityId:'F',quantity:'100',amount:'8000'},
  {id:'s1',type:'sell',date:'2016-06-01',depotId:'d',securityId:'F',quantity:'120',amount:'10800',taxGainBank:'4100'},
  {id:'v',type:'vap',date:'2019-01-02',depotId:'d',securityId:'F',year:2018,amount:'0'},
  {id:'s2',type:'sell',date:'2019-06-03',depotId:'d',securityId:'F',quantity:'80',amount:'8800'}];
 s.prices=[{securityId:'F',date:'2017-12-29',price:'100'}];validate(s);
 // Ohne Übergangswerte: Basis aus der Kursseite, fiktiver Gewinn und Alt-Erträge offen.
 let r=replay(s,{until:'2019-12-31'});
 assert.equal(r.moves.find(m=>m.eventId==='s1').sale.status,'historic');assert.equal(r.moves.find(m=>m.eventId==='s1').gainEconomic,'3000','Durchschnitt: 13.000 € für 200 Stück, 120 × 65 € = 7.800 €');
 assert.equal(r.moves.find(m=>m.eventId==='s2').sale.taxable,null);
 assert.match(r.issues.map(i=>i.reason).join(' '),/fiktiver Gewinn 2017 laut Bank fehlt – unter „Übergang 2017\/2018“ erfassen \(rechnerisch 1600 €\)/);
 // Mit den Werten der Bank: fiktiver Gewinn 1.500 € statt rechnerisch 1.600 €.
 const draft={...newDraft('transition','d',s),securityId:'F',deemed2017:'1.500,00',oldIncomeNone:true};
 assert.match(entryFormHTML(s,draft),/rechnerisch 1\.600,00 €/);
 const t=apply(s,draft);assert.deepEqual([t.event.date,t.event.deemed2017,t.event.oldIncome],['2017-12-31','1500','0']);
 r=replay(t.next,{until:'2019-12-31'});
 const tr=r.moves.find(m=>m.type==='transition');assert.deepEqual([tr.tax,tr.deemed,tr.computedDeemed],['1600','1500','1600']);
 // Verkauf 2019: 1.500 € fiktiver Gewinn + (8.800 − 8.000) × 70 % = 2.060 €.
 assert.equal(r.moves.find(m=>m.eventId==='s2').sale.taxable,'2060');assert.equal(r.issues.length,0);
 const html=sheetHTML(t.next,{year:2018,from:2016});
 assert.match(html,/Fiktive Veräußerung 31\.12\.2017/);assert.match(html,/Altes Recht: Gewinn laut Bank/);
 assert.throws(()=>apply(t.next,{...draft,id:undefined}),/nur einmal/);
 // Bestandsgeschützte Fonds vor 2009 bleiben beim Bestand zum 01.01.2018.
 assert.throws(()=>apply(s,{type:'buy',date:'2008-06-02',depotId:'d',securityId:'F',quantity:'1',amount:'1'}),/vor 2009/);
});

// ---------- Kauf und Verkauf aus Kurs je Stück ----------

test('a trade is entered either as the statement amount or as unit price with fees',()=>{
 const s=demoState();
 // 500 × 131,40 € − 12,50 € Gebühren = 65.687,50 € Erlös.
 const sale=apply(s,{type:'sell',date:'2026-10-20',depotId:'d1',securityId:'af',quantity:'500',amountMode:'unit',unitPrice:'131,40',fees:'12,50'});
 assert.deepEqual([sale.event.amount,sale.event.unitPrice,sale.event.fees],['65687.5','131.4','12.5']);
 assert.equal(apply(s,{type:'sell',date:'2026-10-20',depotId:'d1',securityId:'af',quantity:'500',amount:'65687,50'}).moves[0].gainEconomic,sale.moves[0].gainEconomic,'gleicher Gewinn wie mit dem Erlös laut Abrechnung');
 // Kauf: 3 × 33,333 € = 99,999 € → 100,00 €; Gebühren erhöhen die Anschaffungskosten.
 assert.equal(apply(s,{type:'buy',date:'2026-10-20',depotId:'d2',securityId:'etf',quantity:'3',amountMode:'unit',unitPrice:'33,333'}).event.amount,'100');
 assert.equal(apply(s,{type:'buy',date:'2026-10-20',depotId:'d2',securityId:'etf',quantity:'10',amountMode:'unit',unitPrice:'100,123',fees:'1,99'}).event.amount,'1003.22');
 assert.throws(()=>apply(s,{type:'sell',date:'2026-10-20',depotId:'d1',securityId:'af',quantity:'1',amountMode:'unit',unitPrice:'1',fees:'5'}),/Gebühren sind höher/);
 const next=sale.next,saved=next.events.at(-1),d=draftFromEvent(saved,next);
 assert.equal(d.amountMode,'unit');assert.equal(d.unitPrice,'131,4');assert.equal(d.fees,'12,5');
 const form=entryFormHTML(next,d);assert.match(form,/name="unitPrice"/);assert.match(form,/name="fees"/);assert.doesNotMatch(form,/name="amount"/);
 assert.match(entryFormHTML(s,newDraft('sell','d1',s)),/Erlös EUR nach Gebühren[^]*name="amountMode"/);
 assert.throws(()=>validate({...next,events:next.events.map(e=>e.id===saved.id?{...e,amount:'1'}:e)}),/passt nicht zu Kurs je Stück/);
 assert.throws(()=>validate({...s,events:[...s.events,{...s.events.find(e=>e.id==='b1'),id:'zz',fees:'1'}]}),/nur zusammen mit dem Kurs/);
 assert.match(sheetHTML(next,{year:2026}),/aus Kurs 131,40 je Stück · Gebühren 12,50 €/);
 assert.match(changes(next,next.audit.at(-1)).join(' '),/Kurs je Stück: 131,40/);
});

// ---------- Protokoll und Excel ----------

test('the protocol names subject, before and after, and treats 125.10 and 125.1 as equal',()=>{
 let s=demoState();s=withEvent(s,{...s.events.find(e=>e.id==='s2'),amount:'52100'},{reason:'Abrechnung korrigiert'});
 s=withPrice(s,'af','2026-10-30','131.4');s=withPrice(s,'af','2026-10-30','132');
 const html=auditHTML(s);
 assert.match(html,/Verkauf · Fiktiver Aktienfonds Alt · 21\.09\.2026 · Kinderdepot Laura/);assert.match(html,/Betrag: 51\.720,00 → 52\.100,00/);assert.match(html,/Grund: Abrechnung korrigiert/);
 assert.match(html,/Kurs geändert/);assert.doesNotMatch(html,/undefined|NaN/);
 assert.deepEqual(changes(s,{action:'Vorgang geändert',before:{price:'125.10'},after:{price:'125.1'}}),[]);
 assert.match(auditHTML(s,{filter:'prices'}),/Kurs geändert/);assert.doesNotMatch(auditHTML(s,{filter:'prices'}),/Verkauf ·/);
 assert.match(changes(s,{action:'securities geändert',collection:'securities',before:{name:'A'},after:{name:'B'}})[0],/Name: A → B/);
});

test('the workbook has one sheet per depot and per security like the former Excel sheet, plus tax, gifts, events and protocol',async()=>{
 let s=demoState();s=withEvent(s,{...s.events.find(e=>e.id==='s2'),amount:'52100'});
 const book=await workbook(s,2026,ExcelJS,{from:2025}),names=book.worksheets.map(x=>x.name);
 for(const n of ['Altfonds','Fiktiver Aktienfonds Alt','Fiktiver Mischfonds Alt','Wertpapiere','Fiktiver Welt-ETF','Fiktiver Akt… Kinderdepot Laura','Steuer 2026 Alexander Weber','Steuer 2026 Laura Weber','Schenkungen','Vorgänge','Protokoll'])assert.ok(names.includes(n),n);
 assert.ok(names.every(n=>n.length<=31),'Excel erlaubt höchstens 31 Zeichen');
 // Wertpapierblatt: Kopf, oben wirtschaftlich, darunter steuerlich, quer auf eine Seitenbreite.
 const ws=book.getWorksheet('Fiktiver Aktienfonds Alt'),values=[];ws.eachRow(r=>values.push(r.getCell(1).value));
 assert.equal(values[0],'Fiktiver Aktienfonds Alt');assert.ok(values.indexOf('Wirtschaftliche Betrachtung 2025–2026')<values.indexOf('Steuerliche Betrachtung 2025–2026'));
 assert.equal(ws.pageSetup.orientation,'landscape');assert.equal(ws.pageSetup.fitToWidth,1);
 let gift=null;ws.eachRow(r=>{if(r.getCell(1).value==='Schenkung an Laura Weber'&&!gift)gift=r;});
 assert.ok(gift.getCell(2).value instanceof Date,'Datum als echter Datumswert');assert.equal(gift.getCell(2).numFmt,'dd.mm.yyyy');
 assert.equal(gift.getCell(4).value,-72250);assert.equal(gift.getCell(4).numFmt,'#,##0.00');assert.equal(gift.getCell(3).numFmt,'#,##0.####');
 let stand=null;ws.eachRow(r=>{if(r.getCell(1).value==='Stand 31.12.2026'&&!stand)stand=r;});assert.equal(stand.getCell(1).font.bold,true);
 const cells=name=>{const out=[];book.getWorksheet(name).eachRow(r=>out.push(r.values.slice(1)));return out;};
 assert.ok(cells('Steuer 2026 Laura Weber').some(r=>r[0]==='Steuer laut Modell'));
 assert.ok(cells('Schenkungen').some(r=>r[4]==='Noch steuerfrei übertragbar'));
 assert.ok(taxRows(s,'p1',2026).some(r=>r[0]==='Private Veräußerungsgeschäfte (Anlage SO) · Währungskonten'));
});

// ---------- Währungskonten ----------

function usd(kind='payment',events=[],year={},targetKind='payment'){
 const s=emptyState();
 s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];
 s.accounts=[{id:'a',depotId:'d',name:'USD',currency:'USD',kind},{id:'b',depotId:'d',name:'USD Giro',currency:'USD',kind:targetKind}];
 s.events=events.map((e,i)=>({id:'e'+i,type:'fx',depotId:'d',accountId:'a',...e}));
 s.years={p:{2023:{churchRate:'0',externalAllowance:'1000',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'},2024:{churchRate:'0',externalAllowance:'1000',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'},...year}};
 validate(s);return s;
}
const roundTrip=(year,gain)=>usd('payment',[{kind:'exchangeIn',date:`${year}-01-10`,amount:'10000',eur:'9000'},{kind:'exchangeOut',date:`${year}-06-10`,amount:'10000',eur:String(9000+gain)}]);

test('the demo USD account: FIFO in EUR, a security bought with dollars is a disposal, only one year counts',()=>{
 const s=demoState(),moves=fxReplay(s,{until:'2026-12-31'}).moves;
 const buy=moves.find(m=>m.eventId==='b3');
 assert.equal(buy.regime,'private');assert.equal(Number(buy.cost).toFixed(2),'13206.67');assert.equal(Number(buy.gain).toFixed(2),'34.13');assert.equal(buy.taxable,buy.gain);
 const back=moves.find(m=>m.eventId==='u3');
 assert.deepEqual(back.parts.map(p=>[p.amount,p.within]),[['1000',false],['1500',true]]);
 assert.equal(back.taxable,'78');assert.equal(Number(back.gain).toFixed(2),'16.67');
 assert.equal(moves.find(m=>m.eventId==='x3').eur,'71.74','75,90 USD zu 1,058');
 const st=accountStatement(s,'a1',2026,2026);assert.equal(st.closing.balance,'575.9');assert.equal(st.closing.bookValue,'486.74');
 const p23=yearReport(s,'p1',2023).privateSales,p26=yearReport(s,'p1',2026).privateSales;
 assert.equal(p23.limit,'600');assert.equal(p23.taxable,'0');assert.equal(p23.exempt,true);
 assert.equal(p26.limit,'1000');assert.equal(p26.total,'78');assert.equal(p26.taxable,'0');
});

test('the exemption limit is a threshold: below it nothing, from it everything; losses stay losses',()=>{
 const p=(year,gain)=>yearReport(roundTrip(year,gain),'p',year).privateSales;
 assert.equal(p(2024,999.99).taxable,'0');assert.equal(p(2024,1000).taxable,'1000');
 assert.equal(p(2023,599.99).taxable,'0');assert.equal(p(2023,600).taxable,'600');
 assert.equal(p(2024,-50).taxable,'-50');assert.equal(p(2024,-50).exempt,false);
 // Nach mehr als einem Jahr nicht steuerbar.
 const late=usd('payment',[{kind:'exchangeIn',date:'2023-01-10',amount:'1000',eur:'900'},{kind:'exchangeOut',date:'2024-01-11',amount:'1000',eur:'2000'}]);
 assert.equal(yearReport(late,'p',2024).privateSales.taxable,'0');assert.equal(fxReplay(late,{until:'2024-12-31'}).moves.at(-1).parts[0].within,false);
 const edge=usd('payment',[{kind:'exchangeIn',date:'2023-01-10',amount:'1000',eur:'900'},{kind:'exchangeOut',date:'2024-01-10',amount:'1000',eur:'2000'}]);
 assert.equal(fxReplay(edge,{until:'2024-12-31'}).moves.at(-1).parts[0].within,true,'genau ein Jahr ist nicht mehr als ein Jahr');
});

test('an interest-bearing account realises every outflow as capital income under § 20, without holding period',()=>{
 const s=usd('interest',[{kind:'exchangeIn',date:'2023-01-10',amount:'10000',eur:'9000'},{kind:'exchangeOut',date:'2024-03-01',amount:'4000',eur:'3800'}]);
 const r=yearReport(s,'p',2024);
 assert.equal(r.status,'supported');assert.ok(r.items.some(i=>i.kind==='fx'&&i.taxable==='200'));
 assert.equal(r.taxable,'200');assert.equal(r.capitalTax,'50');assert.equal(r.privateSales,null);
});

test('transfers keep dates between payment accounts but realise when leaving an interest-bearing account',()=>{
 const keep=usd('payment',[{kind:'exchangeIn',date:'2024-01-10',amount:'1000',eur:'900'},{kind:'transfer',date:'2024-12-01',amount:'1000',toAccountId:'b'},{kind:'exchangeOut',date:'2025-03-01',amount:'1000',eur:'950',accountId:'b'}]);
 const m=fxReplay(keep,{until:'2025-12-31'}).moves;
 assert.equal(m.find(x=>x.eventId==='e1'&&x.direction==='out').realized,false);
 assert.deepEqual(m.at(-1).parts.map(p=>[p.acquired,p.within]),[['2024-01-10',false]]);
 const realise=usd('interest',[{kind:'exchangeIn',date:'2024-01-10',amount:'1000',eur:'900'},{kind:'transfer',date:'2024-12-01',amount:'1000',toAccountId:'b',eur:'980'},{kind:'exchangeOut',date:'2025-03-01',amount:'1000',eur:'950',accountId:'b'}],
  {2025:{churchRate:'0',externalAllowance:'1000',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'}});
 assert.ok(yearReport(realise,'p',2024).items.some(i=>i.kind==='fx'&&i.taxable==='80'));
 assert.equal(yearReport(realise,'p',2025).privateSales.taxable,'-30');
 // Unverzinstes Guthaben wird erstmalig verzinslich angelegt: Veräußerung nach § 23,
 // das Tagesgeld beginnt mit dem EUR-Wert des Übertrags (BMF vom 14.05.2025, Rz. 131).
 const deposit=usd('payment',[{kind:'exchangeIn',date:'2024-01-10',amount:'1000',eur:'900'},{kind:'transfer',date:'2024-12-01',amount:'1000',toAccountId:'b',eur:'980'},{kind:'exchangeOut',date:'2025-03-01',amount:'1000',eur:'950',accountId:'b'}],
  {2025:{churchRate:'0',externalAllowance:'1000',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'}},'interest');
 const out=fxReplay(deposit,{until:'2025-12-31'}).moves.find(x=>x.eventId==='e1'&&x.direction==='out');
 assert.equal(out.realized,true);assert.equal(out.regime,'private');assert.equal(out.taxable,'80');
 assert.equal(yearReport(deposit,'p',2024).privateSales.total,'80');
 assert.ok(yearReport(deposit,'p',2025).items.some(i=>i.kind==='fx'&&i.taxable==='-30'));
 assert.equal(yearReport(deposit,'p',2025).privateSales,null);
});

test('missing euro values and unknown acquisition days stay open instead of becoming zero',()=>{
 const noEur=usd('payment',[{kind:'credit',date:'2024-02-01',amount:'100'},{kind:'exchangeOut',date:'2024-03-01',amount:'100',eur:'95'}]);
 const r=fxReplay(noEur,{until:'2024-12-31'});assert.equal(r.moves.at(-1).gain,null);assert.ok(r.issues.some(i=>/EUR-Wert des Zugangs/.test(i.reason)));
 assert.equal(yearReport(noEur,'p',2024).privateSales.status,'incomplete');assert.equal(yearReport(noEur,'p',2024).privateSales.taxable,null);
 const opening=usd('payment',[{kind:'opening',date:'2024-01-01',amount:'1000',eur:'900'},{kind:'exchangeOut',date:'2024-06-01',amount:'500',eur:'470'},{kind:'exchangeOut',date:'2025-02-01',amount:'500',eur:'470'}]);
 const o=fxReplay(opening,{until:'2025-12-31'}).moves.filter(m=>m.direction==='out');
 assert.equal(o[0].parts[0].within,null);assert.equal(o[0].taxable,null);assert.equal(o[1].parts[0].within,false);
 assert.throws(()=>fxReplay(usd('payment',[{kind:'exchangeIn',date:'2024-01-10',amount:'1000',eur:'900'},{kind:'exchangeOut',date:'2024-02-10',amount:'1500',eur:'1400'}])),/nur 1000 USD/);
 const rate=usd('payment',[{kind:'exchangeIn',date:'2024-01-10',amount:'1085',rate:'1.085'}]);assert.equal(fxReplay(rate).moves[0].eur,'1000');
});

test('accounts are validated, upgraded from 4.0 data and fixed once they carry bookings',()=>{
 const old=emptyState();delete old.accounts;assert.throws(()=>validate(old),/accounts/);upgrade(old);assert.doesNotThrow(()=>validate(old));
 const s=demoState();
 assert.throws(()=>withRecord(s,'accounts',{...s.accounts[0],currency:'GBP'}),/bleiben fest/);
 assert.doesNotThrow(()=>withRecord(s,'accounts',{...s.accounts[0],name:'USD Giro'}));
 assert.throws(()=>withRecord(s,'accounts',{id:'x',depotId:'d2',name:'Euro',currency:'EUR',kind:'payment'}),/Währung/);
 assert.throws(()=>validate({...s,events:[...s.events,{id:'q',type:'buy',date:'2026-01-05',depotId:'d3',securityId:'us',quantity:'1',amount:'400',fx:{accountId:'a1',amount:'430'}}]}),/anderen Person/);
 assert.throws(()=>apply(s,{...newDraft('fx','d2',s),kind:'exchangeOut',date:'2026-10-01',amount:'9000',eur:'7000'}),/nur 575.9 USD/);
 const kept=apply(s,{...draftFromEvent(s.events.find(e=>e.id==='b3'),s)}).next.events.find(e=>e.id==='b3');assert.deepEqual(kept.fx,{accountId:'a1',amount:'14000'},'Formular behält die Kontoangaben');
});

test('the new pages render without gaps and the app is wired to them',async()=>{
 const s=withClosing(demoState(),'p1',2024,{});
 const pages=[auditHTML(s),closingHTML(s),closingHTML(s,{personId:'p1'}),closingHTML(emptyState()),masterHTML(s),masterHTML(s,{editing:{collection:'accounts',id:'a1'}}),taxPageHTML(s,{personId:'p1',year:2026}),taxPageHTML(s,{personId:'p1',year:2023}),sheetHTML(s,{year:2026,from:2023}),
  ...['exchangeIn','exchangeOut','credit','debit','transfer','opening'].map(kind=>entryFormHTML(s,{...newDraft('fx','d2',s),kind})),
  entryFormHTML(emptyState(),newDraft('fx','',emptyState())),entryFormHTML(s,{...newDraft('buy','d2',s),securityId:'us',fxAccount:'a1'}),entryFormHTML(s,{...newDraft('distribution','d2',s),securityId:'us',fxAccount:'a1'})];
 for(const html of pages)assert.doesNotMatch(html,/undefined|NaN|\[object/);
 // Währungskonten im eigenen Reiter; die Übersicht verweist nur mit dem Stand darauf.
 const konten=accountsHTML(s,{year:2026,personId:'p1'});assert.match(konten,/Alexander Weber · Währungskonten 2026/);assert.match(konten,/Kontoblatt USD 2026/);assert.match(konten,/data-action="entry-fx" data-account="a1"/);
 assert.doesNotMatch(konten,/undefined|NaN|\[object/);assert.match(accountsHTML(s,{year:2026,personId:'p3'}),/Keine Währungskonten für Laura Weber/);
 const overview=sheetHTML(s,{year:2026,personId:'p1'});assert.doesNotMatch(overview,/Kontoblatt/);assert.match(overview,/USD-Konto Direktbank: 575,9 USD · Buchwert 486,74 €/);
 assert.match(taxPageHTML(s,{personId:'p1',year:2026}),/Private Veräußerungsgeschäfte 2026/);
 const app=await readFile(new URL('../dist/app.mjs',import.meta.url),'utf8');
 assert.match(app,/\['protokoll','Protokoll'\]/);for(const f of ['accounts:form','closing:form','reopen:form'])assert.ok(app.includes(f),f);
 assert.match(app,/fxReplay\(next,\{until:'9999-12-31'\}\)/);assert.match(app,/'batch-row-add'/);assert.match(app,/withoutBatch\(state/);
});
