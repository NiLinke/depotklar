import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {emptyState,validate,validateEvent,withEvent,withYear,withClosing,jointPartner,kindWarning} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {statement} from '../dist/core/statement.mjs';
import {workbook,taxRows} from '../dist/ui/xlsx.mjs';
import {taxPageHTML} from '../dist/ui/taxpage.mjs';
import {chooserHTML,entryFormHTML,newDraft,draftFromEvent,apply,previewHTML} from '../dist/ui/entry.mjs';
import {filingSections} from '../dist/ui/filing.mjs';
import {D,S,round} from '../dist/core/decimal.mjs';
import {evaluator} from './formula.mjs';

const cents=v=>v==null?null:S(round(D(v)));
const PARAMS={churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0'};
function base(securities,years={},extra={}){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person Eins'},{id:'k',name:'Person Zwei'}];
 s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot A'},{id:'dk',personId:'k',bank:'Bank B',name:'Depot B',...extra}];
 s.securities=securities;s.years={p:years};
 return s;
}
const move=(s,id,until='2030-12-31')=>replay(s,{until}).moves.find(m=>m.eventId===id);
const near=(a,b,eps=0.006)=>assert.ok(Math.abs(Number(a)-Number(b))<=eps,`${a} ≠ ${b}`);
async function formulasAgree(s,year,personId,sheet){
 const book=await workbook(s,year,ExcelJS,{personId}),ws=book.getWorksheet(sheet);assert.ok(ws,sheet);
 const all=evaluator(ws).formulas();assert.ok(all.length);for(const f of all)near(f.own,f.result??0);
 return ws;
}
const cell=(ws,label,col=2)=>{let out=null;ws.eachRow(r=>{if(out==null&&r.getCell(1).value===label){const c=r.getCell(col);out=c.value&&typeof c.value==='object'?c.result??0:c.value;}});return out;};

// ---------- Anleihen und Zertifikate ----------

test('a bond is taxed without partial exemption in the general pot, accrued interest as negative income',async()=>{
 const s=base([{id:'b',isin:'DE0000000031',name:'Fiktive Anleihe',kind:'bond'}],{2020:PARAMS,2021:PARAMS});
 s.events=[{id:'k',type:'buy',date:'2020-03-02',depotId:'d',securityId:'b',quantity:'10000',amount:'10100'},
  {id:'z',type:'distribution',date:'2020-03-02',depotId:'d',securityId:'b',amount:'-50'},
  {id:'c',type:'distribution',date:'2021-03-02',depotId:'d',securityId:'b',amount:'300',foreignTax:'45'},
  {id:'v',type:'sell',date:'2021-09-01',depotId:'d',securityId:'b',quantity:'10000',amount:'11400'}];
 s.certificates=[{id:'b20',personId:'p',year:2020,bank:'Bank A',capitalTax:'0',solidarity:'0',churchTax:'0',lossCertificate:true,certifiedStockLoss:'0',certifiedOtherLoss:'50'}];
 validate(s);
 assert.equal(replay(s,{until:'2030-12-31'}).moves.some(m=>m.type==='vap'),false,'keine Vorabpauschale');
 // 2020: 50 € gezahlte Stückzinsen sind negative Einnahmen und werden Verlustvortrag.
 const y20=yearReport(s,'p',2020);assert.equal(y20.status,'supported');assert.equal(y20.taxable,'0');assert.equal(y20.carry.otherLoss,'50');
 // 2021: Gewinn 1.300 + Kupon 300 = 1.600; Pauschbetrag 801; 799 × ¼ − Quellensteuer 45 = 154,75 €; Soli 8,51 €.
 const y21=yearReport(s,'p',2021);assert.equal(y21.items.find(i=>i.kind==='sale').stock,false);assert.equal(y21.items.find(i=>i.kind==='sale').exempt,'0');
 assert.deepEqual([y21.otherResult,y21.taxable,y21.capitalTax,y21.solidarity,y21.total],['1600','799','154.75','8.51','163.26']);
 const ws=await formulasAgree(s,2021,'p','Rechenweg 2021 Person Eins');near(cell(ws,'Steuer laut Modell'),'163.26');
 assert.equal(kindWarning({name:'Fiktive Bundesanleihe 2030',kind:'bond'}),null);
 assert.match(taxRows(s,'p',2021).flat().join('|'),/Zinsen/);
 // Negativer Betrag nur bei Anleihen; ohne Kaufdatum vor 2009 gesperrt.
 const t=base([{id:'a',isin:'X',name:'Aktie',kind:'stock'}]);t.events=[{id:'o',type:'distribution',date:'2021-03-02',depotId:'d',securityId:'a',amount:'-1'}];assert.throws(()=>validate(t),/nicht negativ/);
 const u=base([{id:'b',isin:'X',name:'Altanleihe',kind:'bond'}]);u.events=[{id:'o',type:'opening',date:'2018-01-01',depotId:'d',securityId:'b',quantity:'100',cost:'100',group:'pre2009',acquired:'2005-01-03'},{id:'v',type:'sell',date:'2021-03-01',depotId:'d',securityId:'b',quantity:'100',amount:'120'}];validate(u);
 const sale=move(u,'v').sale;assert.equal(sale.status,'unsupported');assert.match(sale.reasons[0].reason,/§ 52 Abs. 28/);
});

test('a worthless write-off is a sale for nothing, a stock loss stays in the stock pot',()=>{
 const s=base([{id:'a',isin:'X',name:'Aktie',kind:'stock'}],{2025:PARAMS});
 s.events=[{id:'k',type:'buy',date:'2024-02-01',depotId:'d',securityId:'a',quantity:'10',amount:'1000'},{id:'v',type:'sell',date:'2025-02-03',depotId:'d',securityId:'a',quantity:'10',amount:'0',capitalTax:'0',solidarity:'0',churchTax:'0'}];validate(s);
 s.certificates=[{id:'c',personId:'p',year:2025,bank:'Bank A',capitalTax:'0',solidarity:'0',churchTax:'0',lossCertificate:true,certifiedStockLoss:'1000',certifiedOtherLoss:'0'}];validate(s);
 const r=yearReport(s,'p',2025);assert.equal(r.status,'supported');assert.equal(r.carry.stockLoss,'1000');assert.equal(r.carry.otherLoss,'0');
});

// ---------- Sonstiger Ertrag ----------

test('other income from the statement goes into the general pot, a loss is allowed, a label is required',async()=>{
 const s=base([],{2025:PARAMS});
 s.events=[{id:'a',type:'otherIncome',date:'2025-02-03',depotId:'d',label:'Verkauf Bezugsrechte Fiktive AG',amount:'500'},
  {id:'b',type:'otherIncome',date:'2025-03-03',depotId:'d',label:'Option verfallen',amount:'-200'},
  {id:'i',type:'interest',date:'2025-06-30',depotId:'d',amount:'2000'}];validate(s);
 // 500 − 200 + 2.000 = 2.300; Pauschbetrag 1.000; 1.300 × ¼ = 325 €; Soli 17,87 €.
 const r=yearReport(s,'p',2025);assert.deepEqual([r.otherResult,r.taxable,r.capitalTax,r.solidarity],['2300','1300','325','17.87']);
 assert.equal(r.items.filter(i=>i.kind==='other').length,2);
 assert.match(taxRows(s,'p',2025).flat().join('|'),/Verkauf Bezugsrechte Fiktive AG · Depot A/);
 assert.match(taxPageHTML(s,{personId:'p',year:2025,years:[2025]}),/Sonstiger Ertrag/);
 const st=statement(s,'d',2025,'tax');assert.ok(st.income.some(x=>x.name==='Option verfallen'&&x.label==='Sonstiger Ertrag'));
 await formulasAgree(s,2025,'p','Rechenweg 2025 Person Eins');
 const t=structuredClone(s);t.events[0].label=' ';assert.throws(()=>validate(t),/Bezeichnung fehlt/);
 const d={...newDraft('otherIncome','d',s),date:'2025-04-01',label:'Stillhalterprämie',amount:'90'};
 assert.match(entryFormHTML(s,d),/name="label"/);assert.match(previewHTML(s,d),/Allgemeiner Verlusttopf/);assert.equal(apply(s,d).event.type,'otherIncome');
});

// ---------- Aktientausch ----------

function exchange(extra={}){
 const s=base([{id:'a',isin:'DE0000000041',name:'Fiktive Alt AG',kind:'stock'},{id:'n',isin:'DE0000000042',name:'Fiktive Neu AG',kind:'stock'}],{2024:PARAMS,2025:PARAMS});
 s.events=[{id:'o',type:'opening',date:'2018-01-01',depotId:'d',securityId:'a',quantity:'50',cost:'1000',group:'pre2009',acquired:'2005-05-05'},
  {id:'k',type:'buy',date:'2019-03-01',depotId:'d',securityId:'a',quantity:'50',amount:'4000'},
  {id:'t',type:'merger',date:'2024-06-03',depotId:'d',securityId:'a',toSecurityId:'n',ratio:'0.5',...extra},
  {id:'v',type:'sell',date:'2025-02-03',depotId:'d',securityId:'n',quantity:'50',amount:'9000'}];
 return s;
}
test('a share exchange carries lots, dates and the protection of old shares; cash counts as a dividend only on newer shares',async()=>{
 const s=exchange();validate(s);
 const moves=replay(s,{until:'2025-12-31'}).moves,into=moves.find(m=>m.eventId==='t'&&m.direction==='in');
 assert.deepEqual([into.quantity,cents(into.economic),cents(into.tax),into.exchange],['50','5000','5000',true]);
 // 25 Altaktien von 2005: nicht steuerbar. 25 aus 2019: 4.500 − 4.000 = 500 € im Aktientopf.
 const sale=moves.find(m=>m.eventId==='v').sale;assert.deepEqual(sale.details.map(d=>[d.acquired,d.regime,d.taxable]),[['2005-05-05','stockPre2009','0'],['2019-03-01','regular','500']]);
 const y25=yearReport(s,'p',2025);assert.equal(y25.items[0].stock,true);assert.equal(y25.stockResult,'500');
 assert.match(statement(s,'d',2024,'tax').rows.flatMap(r=>r.lines.map(l=>l.label)).join('|'),/Getauscht in Fiktive Neu AG/);
 await formulasAgree(s,2025,'p','Rechenweg 2025 Person Eins');
 // Barausgleich 100 €: die Hälfte der Stücke sind Altaktien, 50 € sind Dividende (BMF vom 14.05.2025, Rn. 100a).
 const c=exchange({cash:'100',price:'200'});validate(c);
 const cash=replay(c,{until:'2024-12-31'}).moves.find(m=>m.eventId==='t'&&m.cash);assert.deepEqual([cash.income.gross,cash.income.taxable],['50','50']);
 assert.ok(yearReport(c,'p',2024).items.some(i=>i.kind==='distribution'&&i.ref.cash));
 // Über 10 % des Börsenkurses (50 × 200 = 10.000 €): der ganze Vorgang gilt als Tausch.
 assert.throws(()=>replay(exchange({cash:'1001',price:'200'}),{until:'2024-12-31'}),/VIII R 44\/18/);
 assert.throws(()=>validate(exchange({cash:'100'})),/Kurs der neuen Aktie/);
 // Neue Stückzahl laut Abrechnung statt Verhältnis; Ziel muss eine Aktie sein.
 const q=exchange({ratio:undefined,toQuantity:'50'});delete q.events[2].ratio;validate(q);assert.equal(move(q,'t').quantity,'-100');assert.equal(replay(q,{until:'2024-12-31'}).moves.find(m=>m.eventId==='t'&&m.direction==='in').quantity,'50');
 const f=exchange();f.securities[1].kind='equityFund';assert.throws(()=>validate(f),/muss eine Aktie sein/);
 // Eigener Vorgang: Formular und Rückweg aus dem gespeicherten Vorgang.
 assert.match(chooserHTML('d'),/Aktientausch/);assert.equal(draftFromEvent(s.events[2],s).type,'exchange');
 const html=entryFormHTML(s,{...newDraft('exchange','d',s),securityId:'a'});assert.match(html,/Neue Aktie/);assert.doesNotMatch(html,/Fonds \(bisher\)/);
});

// ---------- Fondsverschmelzung ----------

function merged(targetKind,extra={},first=[{id:'k',type:'buy',date:'2021-01-11',depotId:'d',securityId:'x',quantity:'750',amount:'50000'}],after=[]){
 const s=base([{id:'x',isin:'DE0000000051',name:'Fiktiver Fonds X',kind:'equityFund'},{id:'z',isin:'DE0000000052',name:'Fiktiver Fonds Z',kind:targetKind}],{2022:PARAMS});
 s.events=[...first,{id:'m',type:'merger',date:'2022-07-01',depotId:'d',securityId:'x',toSecurityId:'z',toQuantity:'700',...extra},...after];
 return s;
}
test('a merger at the same exemption rate is tax neutral, cash is income at the rate of the old fund, other depots are reminded',()=>{
 const s=merged('equityFund',{cash:'300'},[{id:'k1',type:'buy',date:'2021-01-11',depotId:'d',securityId:'x',quantity:'250',amount:'10000'},{id:'k2',type:'buy',date:'2021-02-01',depotId:'d',securityId:'x',quantity:'500',amount:'40000'}],
  [{id:'o',type:'opening',date:'2022-01-03',depotId:'dk',securityId:'x',quantity:'10',cost:'800',group:'from2018',acquired:'2021-06-01',vapBefore:'0'}]);validate(s);
 const r=replay(s,{until:'2022-12-31'}),into=r.moves.find(m=>m.eventId==='m'&&m.direction==='in');
 assert.deepEqual([into.quantity,cents(into.economic),cents(into.tax),into.frozenRate],['700','50000','50000',undefined]);
 // Neue Stückzahl genau laut Abrechnung; Erwerbsdaten bleiben.
 const lots=r.positions.get('d|z');assert.deepEqual(lots.map(l=>l.acquired),['2021-01-11','2021-02-01']);assert.equal(cents(S(lots.reduce((a,l)=>a+D(l.quantity),0n))),'700');
 // Barausgleich 300 € mit 30 % Teilfreistellung des alten Fonds (BMF vom 21.05.2019, Rz. 23.22).
 const cash=r.moves.find(m=>m.eventId==='m'&&m.cash);assert.deepEqual([cash.income.taxable,cash.income.exempt],['210','90']);
 // Derselbe Fonds liegt noch in einem anderen Depot.
 assert.ok(r.issues.some(i=>i.kind==='mergerOpen'&&i.depotId==='dk'));
 s.years.k={2022:PARAMS};assert.ok(yearReport(s,'k',2022).hints.some(h=>/auch dort buchen/.test(h))||yearReport(s,'k',2022).status==='none');
 const d={...draftFromEvent(s.events.find(e=>e.id==='m'),s)};assert.equal(d.type,'merger');
 const html=previewHTML(s,d);assert.match(html,/Wirtschaftlich unverändert/);assert.match(html,/Steuerlich unverändert/);assert.match(html,/zu 6\/12/);assert.match(html,/Depot B/);
});

test('official examples: a different exemption rate defers the gain to the real sale at the old rate (§ 22 InvStG)',async()=>{
 // BMF vom 21.05.2019, Rz. 23.24: 750 Anteile, Anschaffung 50.000 €; 700 neue Anteile zu 100 € = 70.000 €,
 // fiktiver Gewinn 20.000 €, Teilfreistellung des alten Fonds 30 %. Der neue Fonds hat keine Teilfreistellung.
 const s=merged('otherFund',{price:'100'},undefined,[{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'z',quantity:'700',amount:'77000'}]);validate(s);
 const r=replay(s,{until:'2022-12-31'}),into=r.moves.find(m=>m.eventId==='m'&&m.direction==='in');
 assert.deepEqual([cents(into.frozen),into.frozenRate,cents(into.tax),cents(into.economic)],['20000','0.3','70000','50000']);
 // Verkauf: 7.000 € neu ohne Teilfreistellung, dazu 20.000 € × 70 % = 14.000 €.
 const sale=r.moves.find(m=>m.eventId==='v').sale;assert.deepEqual([sale.status,cents(sale.gross),cents(sale.taxable),cents(sale.exempt),cents(sale.frozenGain)],['supported','27000','21000','6000','20000']);
 assert.equal(cents(r.moves.find(m=>m.eventId==='v').gainEconomic),'27000');
 assert.match(statement(s,'d',2022,'tax').rows.flatMap(x=>x.lines.map(l=>l.note)).join('|'),/Fiktive Veräußerung \(§ 22 InvStG\)/);
 const ws=await formulasAgree(s,2022,'p','Rechenweg 2022 Person Eins');let sub=null;ws.eachRow(row=>{const v=row.getCell(1).value;if(typeof v==='string'&&v.startsWith('· Gewinn bis zur Verschmelzung'))sub=row;});
 assert.ok(sub,'eigene Zeile für den aufgeschobenen Gewinn');assert.equal(sub.getCell(8).value,20000);assert.equal(sub.getCell(11).value.formula,`(H${sub.number}+J${sub.number})*0.3`);
 // Teilverkauf: Der aufgeschobene Gewinn geht anteilig mit.
 const half=merged('otherFund',{price:'100'},undefined,[{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'z',quantity:'350',amount:'38500'}]);
 const part=replay(half,{until:'2022-12-31'});assert.deepEqual([cents(move(half,'v').sale.gross),cents(move(half,'v').sale.taxable)],['13500','10500']);
 assert.equal(cents(part.positions.get('d|z')[0].frozen[0].gain),'10000');
 // BMF vom 21.05.2019, Rz. 22.11: Kauf 100 €, Preis bei der Änderung 110 €, Verkauf 100 € – 7 € − 10 € = −3 €.
 const e=merged('otherFund',{price:'110',toQuantity:'1'},[{id:'k',type:'buy',date:'2021-01-11',depotId:'d',securityId:'x',quantity:'1',amount:'100'}],[{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'z',quantity:'1',amount:'100'}]);
 assert.deepEqual([cents(move(e,'v').sale.gross),cents(move(e,'v').sale.taxable)],['0','-3']);
 // Ohne Rücknahmepreis offen, nie geschätzt.
 const open=merged('otherFund',{},undefined,[{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'z',quantity:'700',amount:'77000'}]);
 assert.equal(move(open,'v').sale.status,'incomplete');assert.match(move(open,'v').sale.reasons[0].reason,/Rücknahmepreis des Zielfonds/);
 // Formular fragt den Preis nur bei anderem Satz; Hinweis auf verschiedene Staaten.
 assert.match(entryFormHTML(s,{...newDraft('merger','d',s),date:'2022-07-01',securityId:'x',toSecurityId:'z'}),/Rücknahmepreis des Zielfonds/);
 const same=merged('equityFund');assert.doesNotMatch(entryFormHTML(same,{...newDraft('merger','d',same),date:'2022-07-01',securityId:'x',toSecurityId:'z'}),/name="price"/);
 const cross=merged('equityFund');cross.securities[1].isin='LU0000000052';assert.match(previewHTML(cross,draftFromEvent(cross.events.at(-1),cross)),/verschiedene Staaten/);
 // Ziel neu anlegen.
 const fresh=merged('equityFund');const a=apply(fresh,{...newDraft('merger','d',fresh),date:'2022-07-01',securityId:'x',toSecurityId:'__new',newName:'Neuer Zielfonds',newIsin:'DE0000000099',newKind:'mixedFund',toQuantity:'1',price:'10',id:'m'});
 assert.equal(a.newSecurity.kind,'mixedFund');assert.equal(a.event.toSecurityId,a.newSecurity.id);
});

test('deferred gains of older funds keep their rules: deemed gain 2017, loss without exemption, form values by fund type',()=>{
 const opening={id:'o',type:'opening',date:'2022-01-03',depotId:'d',securityId:'x',quantity:'100',cost:'8000',group:'from2009',acquired:'2012-05-02',price2017:'100',deemed2017:'2000',oldIncome:'0',vapBefore:'0'};
 // Basis 10.000 €, Preis 110 €: 1.000 € zu 30 % (700 €). Verkauf 12.000 €: 1.000 € zu 15 % (850 €), dazu 2.000 € fiktiver Gewinn 2017.
 const s=merged('mixedFund',{price:'110',toQuantity:'100'},[opening],[{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'z',quantity:'100',amount:'12000'}]);validate(s);
 const sale=move(s,'v').sale;assert.deepEqual([cents(sale.gross),cents(sale.taxable),cents(sale.exempt),cents(sale.deemedGain)],['4000','3550','450','2000']);
 // Preis unter der Basis: Verlust 1.000 €, voll aus dem Kurs 2017 über den Anschaffungskosten – ohne Teilfreistellung (BFH vom 25.11.2025).
 const l=merged('mixedFund',{price:'90',toQuantity:'100'},[opening],[{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'z',quantity:'100',amount:'9000'}]);
 const loss=move(l,'v').sale;assert.deepEqual([cents(loss.gross),cents(loss.taxable),cents(loss.lossWithoutExemption)],['1000','1000','1000']);
 // Alt-Anteil vor 2009: Der aufgeschobene Gewinn nach Teilfreistellung zählt für den Freibetrag.
 const old={...opening,group:'pre2009',acquired:'2005-05-02'};delete old.deemed2017;
 const p=merged('mixedFund',{price:'110',toQuantity:'100'},[old],[{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'z',quantity:'100',amount:'12000'}]);
 assert.equal(cents(move(p,'v').sale.protectedEligible),'1550');
 // Ausländisches Depot: Anlage KAP-INV nach der Fondsart, zu der der Gewinn gehört.
 const f=merged('otherFund',{price:'100'},undefined,[{id:'v',type:'sell',date:'2022-09-01',depotId:'d',securityId:'z',quantity:'700',amount:'77000'}]);f.depots[0].abroad=true;
 const inv=yearReport(f,'p',2022).abroad.inv;assert.deepEqual([cents(inv.gains.equityFund),cents(inv.gains.otherFund)],['20000','7000']);
 assert.ok(filingSections(yearReport(f,'p',2022)).some(x=>x.rows.some(r=>r[0]==='Aktienfonds')&&x.rows.some(r=>r[0]==='Sonstiger Fonds')));
});

// ---------- ETC mit Rohstoffanspruch ----------

function gold(events,years={}){
 const s=base([{id:'g',isin:'DE000A0S9GB0',name:'Fiktives Gold-ETC',kind:'commodity'}],years);s.events=events;return s;
}
const goldBuy={id:'k',type:'buy',date:'2024-03-01',depotId:'d',securityId:'g',quantity:'10',amount:'1000'};
test('an ETC with a commodity claim is no capital income: taxable only within one year, with the exemption limit',async()=>{
 const s=gold([goldBuy,{id:'a',type:'sell',date:'2024-12-02',depotId:'d',securityId:'g',quantity:'5',amount:'600'},{id:'b',type:'sell',date:'2025-04-01',depotId:'d',securityId:'g',quantity:'5',amount:'650'}]);validate(s);
 assert.equal(replay(s,{until:'2030-12-31'}).moves.some(m=>m.type==='vap'),false);
 // 2024: 100 € Gewinn innerhalb der Frist, unter der Freigrenze von 1.000 €. Keine Kapitalerträge.
 const a=yearReport(s,'p',2024);assert.equal(a.items.length,0);assert.equal(a.status,'none');assert.deepEqual([a.privateSales.total,a.privateSales.limit,a.privateSales.taxable,a.privateSales.exempt],['100','1000','0',true]);
 // 2025: nach mehr als einem Jahr, 150 € Gewinn sind nicht steuerbar.
 const b=yearReport(s,'p',2025);assert.deepEqual([b.privateSales.total,b.privateSales.moves[0].gain,b.privateSales.moves[0].parts[0].within],['0','150',false]);
 assert.ok(taxRows(s,'p',2024).some(r=>r[0]==='Private Veräußerungsgeschäfte (Anlage SO) · ETCs'));
 assert.match(taxPageHTML(s,{personId:'p',year:2024,years:[2024]}),/Private Veräußerungsgeschäfte 2024 · ETCs/);
 const ws=await formulasAgree(s,2024,'p','Rechenweg 2024 Person Eins');near(cell(ws,'Innerhalb der Jahresfrist steuerbar (Anlage SO, Freigrenze für alle privaten Veräußerungsgeschäfte des Jahres)'),'100');
 // Genau ein Jahr ist noch innerhalb der Frist; ab der Freigrenze voll steuerpflichtig.
 const c=gold([goldBuy,{id:'c',type:'sell',date:'2025-03-01',depotId:'d',securityId:'g',quantity:'10',amount:'2200'}]);
 const y=yearReport(c,'p',2025).privateSales;assert.deepEqual([y.total,y.taxable,y.exempt],['1200','1200',false]);
 // Nach einer Schenkung zählt die Anschaffung des Schenkers.
 const g=gold([goldBuy,{id:'s',type:'transfer',kind:'gift',date:'2024-06-03',depotId:'d',toDepotId:'dk',securityId:'g',quantity:'10',price:'110'},{id:'v',type:'sell',date:'2025-04-01',depotId:'dk',securityId:'g',quantity:'10',amount:'1500'}]);
 assert.deepEqual([yearReport(g,'k',2025).privateSales.moves[0].gain,yearReport(g,'k',2025).privateSales.total],['500','0']);
 // Ohne Kaufdatum offen; vor 2009 gesperrt.
 const n=gold([{id:'o',type:'opening',date:'2024-01-02',depotId:'d',securityId:'g',quantity:'1',cost:'100',group:'from2018'},{id:'v',type:'sell',date:'2024-06-03',depotId:'d',securityId:'g',quantity:'1',amount:'120'}],{2024:PARAMS});
 assert.equal(move(n,'v').sale.status,'incomplete');assert.match(move(n,'v').sale.reasons[0].reason,/Kaufdatum/);
 const o=gold([{id:'o',type:'opening',date:'2018-01-01',depotId:'d',securityId:'g',quantity:'1',cost:'100',group:'pre2009',acquired:'2008-01-02'},{id:'v',type:'sell',date:'2024-06-03',depotId:'d',securityId:'g',quantity:'1',amount:'120'}]);
 assert.equal(move(o,'v').sale.status,'unsupported');
 assert.match(previewHTML(s,{...draftFromEvent(s.events[1],s)}),/Privates Veräußerungsgeschäft/);
 assert.equal(kindWarning({name:'Xetra-Gold',kind:'commodity'}),null);assert.match(kindWarning({name:'Xetra-Gold',kind:'stock'}),/ETC mit Rohstoffanspruch/);
});

// ---------- Zusammenveranlagung ----------

function couple({a={},b={},events=[],abroad=true}={}){
 const s=base([{id:'st',isin:'X',name:'Aktie',kind:'stock'}],{},abroad?{abroad:true}:{});
 s.years={p:{2025:{...PARAMS,churchRate:'0.09',...a}},k:{2025:{...PARAMS,...b}}};
 s.events=events;validate(s);return s;
}
const interest=(id,depotId,amount)=>({id,type:'interest',date:'2025-06-30',depotId,amount});
const other=(id,depotId,amount)=>({id,type:'otherIncome',date:'2025-07-01',depotId,label:'Laut Abrechnung',amount});
test('joint assessment is optional per year: common loss offset and allowance, each spouse keeps church tax and share',async()=>{
 // Ohne Wahl rechnet jede Person für sich: 3.000 − 1.000 = 2.000 €, der Verlust bleibt beim anderen.
 const events=[interest('i','d','3000'),other('l','dk','-500')];
 const solo=couple({events});assert.equal(yearReport(solo,'p',2025).taxable,'2000');assert.equal(yearReport(solo,'k',2025).carry.otherLoss,'500');assert.equal(yearReport(solo,'p',2025).joint??null,null);
 // Gewählt: erst jeder für sich, 3.000 − Pauschbetrag 2.000 (1.000 ungenutzt vom anderen) = 1.000, dann − 500 Verlust des
 // anderen = 500 € (BMF vom 14.05.2025, Rn. 274, 275). KapESt 500 ÷ 4,09 = 122,25 €; Soli 6,72 €; KiSt 11,00 €.
 const s=couple({events,a:{jointWith:'k'}});
 const r=yearReport(s,'p',2025),q=yearReport(s,'k',2025);
 assert.equal(jointPartner(s,'k',2025),'p');
 assert.deepEqual([r.status,r.afterLoss,r.allowanceUsed,r.taxable,r.capitalTax,r.solidarity,r.churchTax,r.total],['supported','3000','2000','500','122.25','6.72','11','139.97']);
 assert.deepEqual([r.joint.transfer,r.joint.otherReceived],['1000','500']);
 assert.deepEqual([q.status,q.taxable,q.total,q.carry.otherLoss],['supported','0','0','0']);
 const ws=await formulasAgree(s,2025,'p','Rechenweg 2025 Person Eins');near(cell(ws,'Steuer laut Modell'),'139.97');near(cell(ws,'Sparer-Pauschbetrag, eigene Hälfte und ungenutzter Teil des anderen'),'2000');near(cell(ws,'Sonstiger Verlust von Person Zwei'),'500');
 await formulasAgree(s,2025,'k','Rechenweg 2025 Person Zwei');
 assert.ok(taxRows(s,'p',2025).some(x=>x[0]==='Abzüglich Verlust von Person Zwei'));
 const page=taxPageHTML(s,{personId:'p',year:2025,years:[2025]});assert.match(page,/Zusammenveranlagung 2025 mit Person Zwei/);assert.match(page,/Abzüglich Verlust von Person Zwei/);assert.match(page,/Rn\. 118/);assert.match(page,/§ 20 Abs. 6 und 9 EStG/);
 // Das Folgejahr ist wieder einzeln, solange nichts gewählt ist.
 assert.equal(jointPartner(s,'p',2026),null);
 assert.match(taxPageHTML(s,{personId:'p',year:2025,years:[2025]}),/name="jointWith"/);
});

test('joint assessment: spouse without income, stock losses only against stock gains, losses of both are carried separately',async()=>{
 // Ehegatte ohne Erträge: Ohne seine Jahresdaten bleibt die Rechnung offen – Vorträge und genutzter Pauschbetrag sind unbekannt.
 const s=base([],{});s.years={p:{2025:{...PARAMS,jointWith:'k'}}};s.events=[interest('i','d','3000')];validate(s);
 const blocked=yearReport(s,'p',2025);assert.equal(blocked.status,'incomplete');assert.ok(blocked.reasons.some(x=>/Jahresdaten 2025 von Person Zwei bestätigen/.test(x.text)));
 // Mit Jahresdaten: 2.000 € Pauschbetrag, 3.000 − 2.000 = 1.000 €; KapESt ohne Kirchensteuer 250 €. Der Ehegatte selbst: 0 €.
 s.years.k={2025:PARAMS};
 const r=yearReport(s,'p',2025);assert.deepEqual([r.allowanceUsed,r.taxable,r.capitalTax],['2000','1000','250']);
 assert.deepEqual([yearReport(s,'k',2025).status,yearReport(s,'k',2025).total],['supported','0']);assert.equal(yearReport(s,'k',2025).jointWith,'p');
 assert.match(taxPageHTML(s,{personId:'k',year:2025,years:[2025]}),/keine Erträge in Depotklar/);
 await formulasAgree(s,2025,'p','Rechenweg 2025 Person Eins');
 // Aktien: +2.000 bei einem, −3.000 beim anderen; beide 1.000 € übrige Erträge. Aktienverlust nicht gegen übrige Erträge.
 const stock=[{id:'b1',type:'buy',date:'2024-01-02',depotId:'d',securityId:'st',quantity:'10',amount:'1000'},{id:'v1',type:'sell',date:'2025-02-03',depotId:'d',securityId:'st',quantity:'10',amount:'3000'},
  {id:'b2',type:'buy',date:'2024-01-02',depotId:'dk',securityId:'st',quantity:'10',amount:'4000'},{id:'v2',type:'sell',date:'2025-02-03',depotId:'dk',securityId:'st',quantity:'10',amount:'1000'},
  interest('i1','d','1500'),interest('i2','dk','1500')];
 const c=couple({events:stock,a:{jointWith:'k',churchRate:'0'}});const x=yearReport(c,'p',2025),y=yearReport(c,'k',2025);
 assert.deepEqual([x.taxable,x.carry.stockLoss,y.taxable,y.carry.stockLoss],['500','0','500','1000']);
 await formulasAgree(c,2025,'p','Rechenweg 2025 Person Eins');await formulasAgree(c,2025,'k','Rechenweg 2025 Person Zwei');
 // Beide mit Verlust: Jeder behält seinen eigenen Vortrag.
 const both=couple({events:[other('a','d','-200'),other('b','dk','-300')],a:{jointWith:'k'},abroad:true});both.depots[0].abroad=true;
 assert.deepEqual([yearReport(both,'p',2025).carry.otherLoss,yearReport(both,'k',2025).carry.otherLoss],['200','300']);
 // Der Vortrag des anderen zählt erst nach dem Pauschbetrag: 1.500 − 1.500 (eigene Hälfte und die ungenutzte des anderen) = 0;
 // die 300 € Vortrag bleiben beim anderen (Rn. 274, 275).
 const carried=couple({events:[interest('i','d','1500')],a:{jointWith:'k',churchRate:'0'},b:{otherLossCarry:'300'}});
 assert.deepEqual([yearReport(carried,'p',2025).afterLoss,yearReport(carried,'p',2025).allowanceUsed,yearReport(carried,'p',2025).taxable,yearReport(carried,'k',2025).carry.otherLoss],['1500','1500','0','300']);
 // Offene Angaben des Ehegatten halten die Rechnung offen.
 const open=couple({events:[interest('i','d','3000'),interest('j','dk','100')],a:{jointWith:'k'}});delete open.years.k[2025];
 const w=yearReport(open,'p',2025);assert.equal(w.status,'incomplete');assert.ok(w.reasons.some(t=>/Jahresrechnung von Person Zwei ist noch offen/.test(t.text)));
});

test('joint assessment: same bank offsets losses of both, wrong links are refused, spouses close and reopen together',()=>{
 // Dieselbe deutsche Bank: Verlust des einen, Gewinn des anderen – keine Verlustbescheinigung nötig, nur der Hinweis.
 const same=couple({events:[interest('i','d','3000'),other('l','dk','-500')],a:{jointWith:'k'},abroad:false});same.depots[1].bank='Bank A';
 const r=yearReport(same,'k',2025);assert.equal(r.status,'supported');assert.ok(r.hints.some(h=>/gemeinsamen Freistellungsauftrag/.test(h)));
 // Andere Bank: Verlustbescheinigung bleibt nötig.
 const other2=couple({events:[interest('i','d','3000'),other('l','dk','-500')],a:{jointWith:'k'},abroad:false});
 assert.equal(yearReport(other2,'k',2025).status,'incomplete');assert.ok(yearReport(other2,'k',2025).reasons.some(t=>/Verlustbescheinigung/.test(t.text)));
 assert.equal(yearReport(other2,'p',2025).status,'incomplete');
 // Ungültige Verknüpfungen.
 const s=couple({events:[interest('i','d','3000')]});
 assert.throws(()=>withYear(s,'p',2025,{...PARAMS,jointWith:'p'}),/Ehegatte für die Zusammenveranlagung ungültig/);
 const three=structuredClone(s);three.persons.push({id:'c',name:'Dritte'});
 const linked=withYear(three,'p',2025,{...PARAMS,jointWith:'k'});
 assert.throws(()=>withYear(linked,'c',2025,{...PARAMS,jointWith:'k'}),/nur mit einer Person/);
 assert.throws(()=>withYear(linked,'c',2025,{...PARAMS,jointWith:'p'}),/nur mit einer Person|schon mit einer anderen/);
 // Aufheben bei der anderen Person entfernt den Eintrag mit; Protokoll bei beiden.
 const off=withYear(linked,'k',2025,PARAMS);assert.equal(jointPartner(off,'p',2025),null);assert.equal(off.years.p[2025].jointWith,undefined);
 assert.equal(off.audit.filter(a=>a.action==='Jahresdaten bestätigt').length,linked.audit.filter(a=>a.action==='Jahresdaten bestätigt').length+2);
 // Abschluss und Wiederöffnen gemeinsam.
 const closed=withClosing(linked,'p',2025);assert.deepEqual([closed.closing.p,closed.closing.k],[2025,2025]);
 assert.throws(()=>withYear(closed,'k',2025,PARAMS),/abgeschlossen/);
 const reopened=withClosing(closed,'k',2024,{reason:'Bescheid geändert'});assert.deepEqual([reopened.closing.k,reopened.closing.p],[2024,2024]);
 assert.ok(reopened.audit.filter(a=>String(a.ref).startsWith('closing:')).every(a=>a.action));
});

test('all new forms render, and fund-only events refuse the new kinds',()=>{
 const s=base([{id:'b',isin:'X',name:'Anleihe',kind:'bond'},{id:'g',isin:'Y',name:'Gold-ETC',kind:'commodity'}],{2025:PARAMS});
 for(const t of ['buy','sell','distribution','opening','otherIncome','merger','exchange'])for(const id of ['b','g'])assert.doesNotMatch(entryFormHTML(s,{...newDraft(t,'d',s),securityId:id,date:'2025-02-03'}),/undefined|NaN/,`${t} ${id}`);
 const f=entryFormHTML(s,{...newDraft('buy','d',s),securityId:'b',date:'2025-02-03'});assert.match(f,/ohne Stückzinsen/);assert.doesNotMatch(f,/amountMode/);
 s.events=[{id:'k',type:'buy',date:'2024-02-01',depotId:'d',securityId:'b',quantity:'1',amount:'100'}];
 assert.throws(()=>validateEvent(s,{id:'v',type:'vap',date:'2025-01-02',year:2024,depotId:'d',securityId:'b',amount:'1'},null,{fresh:true}),/nur bei Fonds/);
 assert.throws(()=>validateEvent(s,{id:'t',type:'accumulation',date:'2017-06-01',depotId:'d',securityId:'g',amount:'1'},null,{fresh:true}),/nur für Fonds/);
 assert.throws(()=>withEvent(s,{id:'m',type:'merger',date:'2025-03-03',depotId:'d',securityId:'b',toSecurityId:'g',ratio:'1'}),/nur für Fonds/);
});
