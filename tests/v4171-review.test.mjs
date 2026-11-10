import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {emptyState,validate,validateEvent,withoutRecord} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {fxReplay} from '../dist/core/fx.mjs';
import {yearReport,yearDefaults,lossOffset,jointShares} from '../dist/core/year.mjs';
import {workbook} from '../dist/ui/xlsx.mjs';
import {taxPageHTML} from '../dist/ui/taxpage.mjs';
import {D,S} from '../dist/core/decimal.mjs';
import {evaluator} from './formula.mjs';

// Prüffälle zur Nachprüfung von 4.14 bis 4.17. Alle Werte fiktiv und von Hand nachgerechnet.
const PARAMS={churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0'};
function base(securities,{abroad=false}={}){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person Eins'},{id:'k',name:'Person Zwei'}];
 s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot A',...(abroad?{abroad:true}:{})},{id:'dk',personId:'k',bank:'Bank B',name:'Depot B',...(abroad?{abroad:true}:{})}];
 s.securities=securities;s.years={};return s;
}
const move=(s,id,until='2030-12-31')=>replay(s,{until}).moves.find(m=>m.eventId===id);
const near=(a,b,eps=0.006)=>assert.ok(Math.abs(Number(a)-Number(b))<=eps,`${a} ≠ ${b}`);
async function formulasAgree(s,year,personId,sheet){
 const book=await workbook(s,year,ExcelJS,{personId}),ws=book.getWorksheet(sheet);assert.ok(ws,sheet);
 const all=evaluator(ws).formulas();assert.ok(all.length);for(const f of all)near(f.own,f.result??0);
 return ws;
}
const stock={id:'st',isin:'DE0000000001',name:'Fiktive AG',kind:'stock'};
const interest=(id,depotId,amount,date='2025-06-30')=>({id,type:'interest',date,depotId,amount});
const other=(id,depotId,amount,date='2025-07-01')=>({id,type:'otherIncome',date,depotId,label:'Laut Abrechnung',amount});

// ---------- Verlustverrechnung nach BMF vom 14.05.2025, Rn. 118 ----------

test('Rn. 118: current other losses go against stock gains before the stock loss carry, which then stays a stock loss',async()=>{
 // Aktiengewinn 1.000, sonstiger Verlust −1.000, Aktienvortrag 1.000: Nr. 2 verrechnet den Verlust mit dem Aktiengewinn,
 // Nr. 3 findet keinen Aktiengewinn mehr. Vortrag 01.01.2026: Aktien 1.000, sonstige 0. Steuer 2025: 0.
 const s=base([stock]);
 s.events=[{id:'b',type:'buy',date:'2024-03-01',depotId:'d',securityId:'st',quantity:'10',amount:'1000'},{id:'v',type:'sell',date:'2025-03-03',depotId:'d',securityId:'st',quantity:'10',amount:'2000'},other('o','d','-1000')];
 s.years={p:{2025:{...PARAMS,stockLossCarry:'1000'}}};validate(s);
 const r=yearReport(s,'p',2025);
 assert.deepEqual([r.status,r.taxable,r.carry.stockLoss,r.carry.otherLoss,r.offset.againstStocks,r.offset.stockCarryUsed],['supported','0','1000','0','1000','0']);
 await formulasAgree(s,2025,'p','Rechenweg 2025 Person Eins');
 // 2026: Zinsen 2.000 € – der Aktienvortrag mindert sie nicht. 2.000 − 1.000 Pauschbetrag = 1.000; 250 € + 13,75 € Soli.
 const d=yearDefaults(s,'p',2026);assert.deepEqual([d.stockLossCarry,d.otherLossCarry],['1000','0']);
 s.events.push(interest('i','d','2000','2026-06-30'));s.years.p[2026]={...PARAMS,stockLossCarry:d.stockLossCarry,otherLossCarry:d.otherLossCarry};validate(s);
 const n=yearReport(s,'p',2026);assert.deepEqual([n.taxable,n.capitalTax,n.solidarity,n.total],['1000','250','13.75','263.75']);
 // Gleiche Einkünfte wie vorher, nur die Art des Vortrags ändert sich: Gewinn 3.000, Verlust −500, Aktienvortrag 1.000.
 const x=lossOffset(D('3000'),D('-500'),D('1000'),D('0'));assert.deepEqual([S(x.positive),S(x.stockLoss),S(x.otherLoss)],['1500','0','0']);
});

// ---------- Zusammenveranlagung nach BMF vom 14.05.2025, Rn. 273 bis 276 ----------

test('joint: each spouse deducts the allowance first, then the remaining losses of one offset the other (Rn. 274, 275)',async()=>{
 // Rn. 275 Beispiel 1: A +10.000, B −15.000. A: 10.000 − 2.000 = 8.000, mit B verrechnet → 0; B behält 7.000 Vortrag.
 const s=base([],{abroad:true});s.events=[interest('i','d','10000'),other('l','dk','-15000')];
 s.years={p:{2025:{...PARAMS,jointWith:'k'}},k:{2025:PARAMS}};validate(s);
 const a=yearReport(s,'p',2025),b=yearReport(s,'k',2025);
 assert.deepEqual([a.status,a.allowanceUsed,a.taxable,a.total,b.status,b.carry.otherLoss],['supported','2000','0','0','supported','7000']);
 assert.equal(yearDefaults(s,'k',2026).otherLossCarry,'7000');
 await formulasAgree(s,2025,'p','Rechenweg 2025 Person Eins');await formulasAgree(s,2025,'k','Rechenweg 2025 Person Zwei');
 // A +1.500, B −1.000: A 1.500 − 1.500 = 0; der Verlust von B bleibt mit 1.000 € erhalten.
 s.events=[interest('i','d','1500'),other('l','dk','-1000')];validate(s);
 assert.deepEqual([yearReport(s,'p',2025).taxable,yearReport(s,'k',2025).carry.otherLoss],['0','1000']);
 // Aktien: A Gewinn 2.000 und Zinsen 1.500, B Aktienverlust 3.000 und Zinsen 1.500. Der Pauschbetrag mindert zuerst die Zinsen:
 // A 500 Zinsen + 2.000 Aktien, B 500 Zinsen; B's Aktienverlust nimmt A's 2.000 → je 500 €, B behält 1.000 Aktienverlust.
 const [x,y]=jointShares({stockPos:D('2000'),otherPos:D('1500'),positive:D('3500'),stockLoss:0n,otherLoss:0n,half:D('1000')},{stockPos:0n,otherPos:D('1500'),positive:D('1500'),stockLoss:D('3000'),otherLoss:0n,half:D('1000')});
 assert.deepEqual([x.taxable,y.taxable,x.stockLoss,y.stockLoss].map(S),['500','500','0','1000']);
});

test('joint: a spouse without income needs confirmed year data; the shared loss is not proposed twice',()=>{
 // Person Zwei: 2023 sonstiger Verlust 800 € im Auslandsdepot, 2024 keine Erträge. Person Eins 2024: Zinsen 3.000 €.
 const s=base([],{abroad:true});s.events=[other('l','dk','-800','2023-05-02'),interest('i','d','3000','2024-06-28')];
 s.years={k:{2023:PARAMS},p:{2024:{...PARAMS,jointWith:'k'}}};validate(s);
 const open=yearReport(s,'p',2024);assert.equal(open.status,'incomplete');assert.ok(open.reasons.some(x=>/Jahresdaten 2024 von Person Zwei bestätigen/.test(x.text)));
 assert.match(taxPageHTML(s,{personId:'k',year:2024,years:[2024]}),/name="otherLossCarry"/);
 // Bestätigt mit dem Vorschlag 800 €: 3.000 − 2.000 = 1.000 − 800 = 200 €; 50 € + 2,75 € Soli = 52,75 €.
 const d=yearDefaults(s,'k',2024);assert.equal(d.otherLossCarry,'800');s.years.k[2024]={...PARAMS,otherLossCarry:d.otherLossCarry};
 const r=yearReport(s,'p',2024),k=yearReport(s,'k',2024);
 assert.deepEqual([r.status,r.taxable,r.total,k.status,k.total,k.carry.otherLoss],['supported','200','52.75','supported','0','0']);
 assert.equal(yearDefaults(s,'k',2025).otherLossCarry,'0');
 assert.match(taxPageHTML(s,{personId:'k',year:2024,years:[2024]}),/keine Erträge in Depotklar/);
});

test('joint: the same bank offsets losses of both after the joint allowance; a certificate is checked against the possible span',()=>{
 // Dieselbe deutsche Bank, A +3.000, B −1.000: Mit gemeinsamem Freistellungsauftrag bleibt bei B nichts übrig – beide gerechnet.
 const s=base([]);s.depots[1].bank='Bank A';s.events=[interest('i','d','3000'),other('l','dk','-1000')];
 s.years={p:{2025:{...PARAMS,jointWith:'k'}},k:{2025:PARAMS}};validate(s);
 assert.deepEqual([yearReport(s,'p',2025).status,yearReport(s,'p',2025).taxable,yearReport(s,'k',2025).status],['supported','0','supported']);
 // Rn. 275 Beispiel 1 bei derselben Bank: Rest bei B zwischen 5.000 € (ohne Freistellungsauftrag) und 7.000 € (2.000 €).
 s.events=[interest('i','d','10000'),other('l','dk','-15000')];validate(s);
 const k=yearReport(s,'k',2025);assert.equal(k.status,'incomplete');assert.ok(k.reasons.some(x=>/5000 € bis 7000 €/.test(x.text)));
 const cert=v=>({id:'c',personId:'k',year:2025,bank:'Bank A',capitalTax:'0',solidarity:'0',churchTax:'0',lossCertificate:true,certifiedStockLoss:'0',certifiedOtherLoss:v});
 s.certificates=[cert('7000')];validate(s);
 assert.deepEqual([yearReport(s,'k',2025).status,yearReport(s,'k',2025).carry.otherLoss,yearReport(s,'p',2025).status],['supported','7000','supported']);
 s.certificates=[cert('4000')];validate(s);assert.ok(yearReport(s,'k',2025).reasons.some(x=>/außerhalb der möglichen/.test(x.text)));
});

test('joint: withholding tax one spouse cannot credit is credited against the other (§ 26b EStG; Rn. 276)',async()=>{
 // A: Dividende 1.000 € mit 150 € Quellensteuer, B: Zinsen 5.000 €. Gemeinsam (6.000 − 2.000) × 25 % − 150 = 850 €, Soli 46,75 €.
 const s=base([stock],{abroad:true});
 s.events=[{id:'b',type:'buy',date:'2024-03-01',depotId:'d',securityId:'st',quantity:'10',amount:'1000'},{id:'v',type:'distribution',date:'2025-05-05',depotId:'d',securityId:'st',amount:'1000',foreignTax:'150'},interest('i','dk','5000')];
 s.years={p:{2025:{...PARAMS,jointWith:'k'}},k:{2025:PARAMS}};validate(s);
 const a=yearReport(s,'p',2025),b=yearReport(s,'k',2025);
 assert.deepEqual([a.total,a.foreignTax.toPartner,b.capitalTax,b.solidarity,b.total,b.foreignTax.fromPartner],['0','150','850','46.75','896.75','150']);
 assert.ok(!a.hints.some(h=>/verfällt/.test(h)));
 await formulasAgree(s,2025,'k','Rechenweg 2025 Person Zwei');await formulasAgree(s,2025,'p','Rechenweg 2025 Person Eins');
});

test('a spouse chosen for joint assessment cannot be deleted',()=>{
 const s=base([]);s.depots=s.depots.filter(d=>d.id!=='dk');s.events=[interest('i','d','3000')];
 s.years={p:{2025:{...PARAMS,jointWith:'k'}},k:{2025:PARAMS}};validate(s);
 assert.throws(()=>withoutRecord(s,'persons','k'),/Zusammenveranlagung 2025 mit Person Eins/);
});

// ---------- Fondsverschmelzung ----------

const funds=[{id:'x',isin:'DE0000000051',name:'Fiktiver Aktienfonds',kind:'equityFund'},{id:'y',isin:'DE0000000052',name:'Fiktiver Mischfonds',kind:'mixedFund'},{id:'z',isin:'DE0000000053',name:'Fiktiver sonstiger Fonds',kind:'otherFund'}];
const lot2009={id:'o',type:'opening',date:'2022-01-03',depotId:'d',securityId:'x',quantity:'100',cost:'8000',group:'from2009',acquired:'2012-05-02',price2017:'100',deemed2017:'2000',oldIncome:'0',vapBefore:'0'};

test('merger: the BFH limit only applies to the stretch from the 2017 price; a later loss after a merger gets a hint',()=>{
 // Zwei Verschmelzungen mit Satzwechsel: 2.000 fiktiv + 3.000 × 70 % − 1.500 × 85 % = 2.825 €. Der zweite Abschnitt liegt über 10.000 €.
 const s=base(funds);s.years={p:{2022:PARAMS}};
 s.events=[lot2009,{id:'m1',type:'merger',date:'2022-03-01',depotId:'d',securityId:'x',toSecurityId:'y',toQuantity:'100',price:'130'},{id:'m2',type:'merger',date:'2022-06-01',depotId:'d',securityId:'y',toSecurityId:'z',toQuantity:'100',price:'115'},{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'z',quantity:'100',amount:'11500'}];
 validate(s);assert.deepEqual([move(s,'v').sale.taxable,move(s,'v').sale.lossWithoutExemption],['2825','0']);
 // Eine Verschmelzung zu 100 €, Verkauf für 7.000 €: 2.000 − 3.000 × 85 % = −550 €; Hinweis auf bis zu 2.000 € (10.000 − 8.000).
 s.events=[lot2009,{id:'m1',type:'merger',date:'2022-07-01',depotId:'d',securityId:'x',toSecurityId:'y',toQuantity:'100',price:'100'},{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'y',quantity:'100',amount:'7000'}];
 validate(s);assert.equal(move(s,'v').sale.taxable,'-550');
 assert.ok(yearReport(s,'p',2022).hints.some(h=>/nicht entschieden/.test(h)&&/2\.000,00 €/.test(h)));
});

test('merger: Anlage KAP-INV books the loss without exemption and old-share gains with the kind of the old fund',()=>{
 // Aktienfonds → sonstiger Fonds zu 95 €, Verkauf 9.000 €: 500 € Verlust ohne Teilfreistellung aus dem alten Satz 30 %.
 const s=base(funds,{abroad:true});s.years={p:{2022:PARAMS}};
 s.events=[lot2009,{id:'m',type:'merger',date:'2022-07-01',depotId:'d',securityId:'x',toSecurityId:'z',toQuantity:'100',price:'95'},{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'z',quantity:'100',amount:'9000'}];validate(s);
 const r=yearReport(s,'p',2022);
 assert.deepEqual([move(s,'v').sale.taxable,r.abroad.inv.lossWithoutExemption.equityFund,r.abroad.inv.lossWithoutExemption.otherFund,r.abroad.inv.gains.equityFund,r.abroad.inv.gains.otherFund,r.abroad.inv.deemed.equityFund],['1000','500','0','-500','-500','2000']);
 assert.ok(r.hints.some(h=>/500 € Verlust ohne Teilfreistellung/.test(h)));
 // Alt-Anteil: Aktienfonds → Mischfonds zu 130 €, Verkauf 12.000 €. Darin Alt-Anteile beim Aktienfonds 3.000 €, beim Mischfonds 0.
 const o=base(funds,{abroad:true});o.years={p:{2022:{...PARAMS,protectedRemaining:'100000'}}};
 o.events=[{id:'o',type:'opening',date:'2022-01-03',depotId:'d',securityId:'x',quantity:'100',cost:'5000',group:'pre2009',price2017:'100',oldIncome:'0',vapBefore:'0'},{id:'m',type:'merger',date:'2022-07-01',depotId:'d',securityId:'x',toSecurityId:'y',toQuantity:'100',price:'130'},{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'y',quantity:'100',amount:'12000'}];validate(o);
 const q=yearReport(o,'p',2022);assert.deepEqual([q.abroad.inv.protectedGains.equityFund,q.abroad.inv.protectedGains.mixedFund],['3000','0']);
});

test('merger: the date is the transfer date, twelfths count from the following day; cross-border stays visible',()=>{
 // 100 Anteile, Zielfonds 3,57 € je Anteil laut Steuerinformation. Stichtag 30.06.: neue Anteile ab 01.07. → 6/12 = 178,50 €.
 const make=date=>{const s=base([funds[0],{id:'w',isin:'DE0000000054',name:'Fiktiver Aktienfonds W',kind:'equityFund'}]);s.years={p:{2023:PARAMS,2024:PARAMS}};
  s.vapUnits=[{securityId:'w',year:2023,perUnit:'3.57'}];
  s.events=[{id:'k',type:'buy',date:'2020-02-03',depotId:'d',securityId:'x',quantity:'100',amount:'10000'},{id:'m',type:'merger',date,depotId:'d',securityId:'x',toSecurityId:'w',toQuantity:'100'}];validate(s);
  return replay(s,{until:'2024-12-31'}).moves.find(m=>m.type==='vap'&&m.year===2023&&m.securityId==='w');};
 assert.equal(make('2023-06-30').income.gross,'178.5');assert.equal(make('2023-07-15').income.gross,'178.5');assert.equal(make('2023-07-31').income.gross,'148.75');
 // Grenzüberschreitend (DE → LU): Hinweis auf der Steuerseite des Jahres, nicht nur in der Vorschau.
 const s=base([funds[0],{id:'l',isin:'LU0000000001',name:'Fiktiver Fonds Luxemburg',kind:'equityFund'}]);s.years={p:{2024:PARAMS}};
 s.events=[{id:'k',type:'buy',date:'2020-02-03',depotId:'d',securityId:'x',quantity:'100',amount:'10000'},{id:'m',type:'merger',date:'2024-07-01',depotId:'d',securityId:'x',toSecurityId:'l',toQuantity:'100'}];validate(s);
 assert.ok(yearReport(s,'p',2024).hints.some(h=>/verschiedene Staaten/.test(h)));
});

// ---------- Durchschnitt, Zwölftel, Tausch, Währungskonto, Eingaben ----------

test('average: every partial disposal leaves at the cent like the ledger account',()=>{
 // 3 Stück für 10,00 €, drei Verkäufe zu je 1 Stück: 3,33 / 3,34 / 3,33 € wie im Sachkonto, am Ende genau 0.
 const s=base([stock]);s.events=[{id:'b',type:'buy',date:'2024-01-10',depotId:'d',securityId:'st',quantity:'3',amount:'10'},...['02','03','04'].map((m,i)=>({id:`v${i}`,type:'sell',date:`2024-${m}-01`,depotId:'d',securityId:'st',quantity:'1',amount:'5'}))];validate(s);
 assert.deepEqual(['v0','v1','v2'].map(id=>move(s,id).economic),['-3.33','-3.34','-3.33']);
});

test('a half cent of advance lump sum in the purchase year rounds up, in Depotklar as in Excel',async()=>{
 // 12 Anteile, Kauf im Juni 2024 (7/12), 0,355 € je Anteil: 12 × 7/12 × 0,355 = 2,485 → 2,49 €.
 const s=base([funds[0]]);s.years={p:{2025:PARAMS}};s.vapUnits=[{securityId:'x',year:2024,perUnit:'0.355'}];
 s.events=[{id:'k',type:'buy',date:'2024-06-03',depotId:'d',securityId:'x',quantity:'12',amount:'1200'}];validate(s);
 assert.equal(replay(s,{until:'2025-12-31'}).moves.find(m=>m.type==='vap'&&m.year===2024).income.gross,'2.49');
 await formulasAgree(s,2025,'p','Rechenweg 2025 Person Eins');
});

test('a share exchange by ratio gives whole new shares; paid accrued interest leaves the currency account',()=>{
 // 2 × 150 Aktien, Verhältnis 1 : 3 als 0,333333333333 → 100 neue Aktien, nicht 99,9999999999.
 const s=base([stock,{id:'n',isin:'DE0000000002',name:'Fiktive Neu AG',kind:'stock'}]);
 s.events=[{id:'b1',type:'buy',date:'2023-01-10',depotId:'d',securityId:'st',quantity:'150',amount:'1500'},{id:'b2',type:'buy',date:'2023-02-10',depotId:'d',securityId:'st',quantity:'150',amount:'1800'},
  {id:'t',type:'merger',date:'2024-05-02',depotId:'d',securityId:'st',toSecurityId:'n',ratio:'0.333333333333'},{id:'v',type:'sell',date:'2024-09-02',depotId:'d',securityId:'n',quantity:'100',amount:'4000'}];
 validate(s);assert.equal(move(s,'v').quantity,'-100');
 // USD-Konto 11.000, Kauf 10.000, gezahlte Stückzinsen 54, Umtausch 946: am Ende 0 USD.
 const f=base([{id:'b',isin:'US0000000001',name:'Fiktive USD-Anleihe',kind:'bond'}]);f.years={p:{2025:PARAMS}};
 f.accounts=[{id:'a',depotId:'d',name:'USD-Konto',currency:'USD',kind:'payment'}];
 f.events=[{id:'o',type:'fx',date:'2025-01-02',depotId:'d',accountId:'a',kind:'opening',amount:'11000',eur:'10000',acquired:'2025-01-02'},
  {id:'k',type:'buy',date:'2025-03-03',depotId:'d',securityId:'b',quantity:'10000',amount:'9200',fx:{accountId:'a',amount:'10000'}},
  {id:'z',type:'distribution',date:'2025-03-03',depotId:'d',securityId:'b',amount:'-50',fx:{accountId:'a',amount:'54',rate:'1.08'}},
  {id:'x',type:'fx',date:'2025-04-01',depotId:'d',accountId:'a',kind:'exchangeOut',amount:'946',eur:'870'}];validate(f);
 const r=fxReplay(f,{until:'2025-12-31'});
 assert.equal(r.moves.find(m=>m.eventId==='z').direction,'out');assert.equal(r.moves.at(-1).balance,'0');
});

test('implausible entries are refused instead of being dropped or credited',()=>{
 const s=base([{id:'b',isin:'DE0000000031',name:'Fiktive Anleihe',kind:'bond'},...funds]);
 s.events=[{id:'k',type:'buy',date:'2024-02-01',depotId:'d',securityId:'b',quantity:'1000',amount:'1000'},{id:'f',type:'buy',date:'2024-02-01',depotId:'d',securityId:'x',quantity:'10',amount:'1000'}];validate(s);
 assert.throws(()=>validateEvent(s,{id:'z',type:'distribution',date:'2025-03-03',depotId:'d',securityId:'b',amount:'-20',foreignTax:'3'},null,{fresh:true}),/keine anrechenbar/);
 assert.throws(()=>validateEvent(s,{id:'m',type:'merger',date:'2025-03-03',depotId:'d',securityId:'x',toSecurityId:'y',toQuantity:'10',cash:'-10'},null,{fresh:true}),/nicht negativ/);
});

test('an open merger in another depot is named on the tax page even without other income',()=>{
 const s=base(funds.slice(0,1).concat({id:'w',isin:'DE0000000054',name:'Fiktiver Aktienfonds W',kind:'equityFund'}));s.years={p:{2022:PARAMS},k:{2022:PARAMS}};
 s.events=[{id:'k',type:'buy',date:'2021-01-11',depotId:'d',securityId:'x',quantity:'100',amount:'10000'},{id:'o',type:'buy',date:'2021-06-01',depotId:'dk',securityId:'x',quantity:'10',amount:'800'},
  {id:'m',type:'merger',date:'2022-07-01',depotId:'d',securityId:'x',toSecurityId:'w',toQuantity:'100'}];validate(s);
 const r=yearReport(s,'k',2022);assert.equal(r.status,'none');assert.ok(r.hints.some(h=>/auch dort buchen/.test(h)));
});
