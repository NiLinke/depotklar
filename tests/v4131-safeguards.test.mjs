import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate,foreignShare,kindWarning,substituteBase} from '../dist/core/model.mjs';
import {statement} from '../dist/core/statement.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {entryFormHTML,previewHTML,newDraft} from '../dist/ui/entry.mjs';
import {masterHTML} from '../dist/ui/master.mjs';

const YEAR={churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'};

// Fiktive Person mit einem Auslandsdepot (Schweizer Aktie) und Zinsen.
function swiss({foreignTax='150',dividend='1000',interest=null,otherLossCarry='0'}={}){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person'}];s.depots=[{id:'d',personId:'p',bank:'Bank Schweiz',name:'Depot',abroad:true}];
 s.securities=[{id:'ch',isin:'CH0000000001',name:'Fiktive Schweiz AG',kind:'stock'},{id:'f',isin:'IE0000000001',name:'Fiktiver Welt-ETF',kind:'equityFund'}];
 s.events=[{id:'b',type:'buy',date:'2024-03-01',depotId:'d',securityId:'ch',quantity:'100',amount:'20000'},
  {id:'x',type:'distribution',date:'2025-04-10',depotId:'d',securityId:'ch',amount:dividend,foreignTax},
  ...(interest?[{id:'i',type:'interest',date:'2025-12-31',depotId:'d',amount:interest}]:[])];
 s.years={p:{2025:{...YEAR,otherLossCarry}}};
 return s;
}

test('withholding tax above the usual treaty rate is flagged, the creditable part stays capped',()=>{
 assert.deepEqual(foreignShare('350','1000'),{percent:'35',aboveTreaty:true});
 // 15,3 % aus Rundung und Umrechnung gilt noch als DBA-Satz.
 assert.equal(foreignShare('153','1000').aboveTreaty,false);assert.equal(foreignShare(null,'1000'),null);
 // Voller Schweizer Abzug 350 € eingetragen: angerechnet höchstens 25 % = 250 €, Hinweis auf 15 % und Erstattung.
 const wrong=yearReport(swiss({foreignTax:'350'}),'p',2025);
 assert.deepEqual([wrong.foreignTax.creditable,wrong.capitalTax],['250','0']);
 assert.ok(wrong.hints.some(h=>/beträgt 35 % des Bruttobetrags.*höchstens 15 % anrechenbar.*Schweiz: 35 % einbehalten, 15 % anrechenbar/.test(h)));
 // Richtig eingetragen (15 %): kein Hinweis. 1.000 € − 1.000 € Sparer-Pauschbetrag = 0, Quellensteuer verfällt.
 const right=yearReport(swiss(),'p',2025);
 assert.ok(!right.hints.some(h=>/Bruttobetrags/.test(h)));
 // Formular und Vorschau.
 const s=swiss({foreignTax:'350'}),d={...newDraft('distribution','d',s),securityId:'ch',amount:'1.000',foreignTax:'350'};
 const form=entryFormHTML(s,d);
 assert.match(form,/Vor Abzug von Quellensteuer und Steuern – nicht der ausgezahlte Betrag/);assert.match(form,/höchstens 15 % des Bruttobetrags \(Schweiz: 35 % einbehalten/);
 assert.doesNotMatch(form,/Steuern, die der Fonds gezahlt hat/);
 assert.match(entryFormHTML(s,{...d,securityId:'f'}),/Steuern, die der Fonds gezahlt hat, sind nicht anrechenbar/);
 assert.match(previewHTML(s,{...d,id:undefined}),/35 % des Bruttobetrags<small>Meist sind höchstens 15 % anrechenbar/);
});

test('with losses the credit is limited if the Finanzamt spreads them over foreign income too',()=>{
 // Dividende 3.000 € mit 450 € Quellensteuer (15 %), Zinsen 3.000 €, sonstiger Verlustvortrag 3.000 €.
 // Bemessungsgrundlage 6.000 − 3.000 − 1.000 = 2.000 €. Depotklar: 450 € angerechnet, Steuer (2.000 − 1.800)/4 = 50 € + 2,75 € Soli.
 // Anteilig: ein Drittel bleibt steuerpflichtig, je Dividende höchstens 25 % × 1.000 € = 250 € – Steuer 250 € + 13,75 € Soli, 211 € mehr.
 const r=yearReport(swiss({dividend:'3000',foreignTax:'450',interest:'3000',otherLossCarry:'3000'}),'p',2025);
 assert.deepEqual([r.taxable,r.foreignTax.credited,r.capitalTax,r.total],['2000','450','50','52.75']);
 assert.ok(r.hints.some(h=>/rechnet 450,00 € Quellensteuer an.*nur 250,00 € anrechenbar und die Steuer ist 211,00 € höher.*VIII R 22\/18/.test(h)));
 // Ohne Verlust und mit genug Erträgen bleibt es bei der vollen Anrechnung ohne Hinweis.
 const plain=yearReport(swiss({dividend:'3000',foreignTax:'450',interest:'3000'}),'p',2025);
 assert.equal(plain.foreignTax.credited,'450');assert.ok(!plain.hints.some(h=>/anteilig/.test(h)));
});

// Deutsche Bank, Aktie ohne übermittelte Anschaffungsdaten: Gewinn laut Abrechnung 30 % des Erlöses.
function transferred(sell){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person'}];s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot'}];
 s.securities=[{id:'st',isin:'DE0000000009',name:'Fiktive AG',kind:'stock'}];
 s.events=[{id:'o',type:'opening',date:'2023-12-31',depotId:'d',securityId:'st',quantity:'100',cost:'8000',group:'from2018',acquired:'2019-05-02'},
  {id:'s',type:'sell',date:'2025-06-02',depotId:'d',securityId:'st',quantity:'100',...sell}];
 s.years={p:{2025:YEAR}};
 return s;
}

test('a bank gain of 30 % of the proceeds is explained as substitute base',()=>{
 // Erlös 10.000 €, Anschaffung 8.000 € – Gewinn 2.000 €; die Bank setzt 30 % = 3.000 € an.
 const s=transferred({amount:'10000',gainBank:'3000'});validate(s);
 const c=yearReport(s,'p',2025).checks[0];
 assert.deepEqual([c.bank,c.model,c.difference],['3000','2000','1000']);assert.match(c.hint,/Ersatzbemessungsgrundlage angesetzt \(§ 43a Abs\. 2 S\. 7 EStG\)/);
 assert.match(statement(s,'d',2025,'tax').rows[0].lines.find(l=>l.type==='sell').note,/entspricht 30 % des Erlöses: Ersatzbemessungsgrundlage/);
 // Mit Kurs und Gebühren: 100 × 100,10 € − 10 € = 10.000 €; die Bank rechnet 30 % vor Gebühren = 3.003 €.
 const fees=transferred({amount:'10000',unitPrice:'100.1',fees:'10',gainBank:'3003'});
 assert.match(yearReport(fees,'p',2025).checks[0].hint,/Ersatzbemessungsgrundlage/);
 const d={type:'sell',date:'2025-06-02',depotId:'d',securityId:'st',quantity:'100',amount:'10.000',gainBank:'3.000'};
 assert.match(previewHTML({...s,events:s.events.filter(e=>e.id!=='s')},d),/entspricht 30 % des Erlöses: Ersatzbemessungsgrundlage/);
 // Eine andere Abweichung ist keine Ersatzbemessungsgrundlage; ein passender Gewinn auch nicht.
 assert.equal(yearReport(transferred({amount:'10000',gainBank:'2500'}),'p',2025).checks[0].hint,null);
 assert.equal(substituteBase('3000',{gross:'3000'},'10000'),false);
});

test('names that do not fit the kind are flagged: ETF as stock, bonds, certificates and ETCs',()=>{
 assert.match(kindWarning({name:'Fiktiver MSCI World UCITS ETF (Acc)',kind:'stock'}),/klingt nach einem Fonds/);
 assert.equal(kindWarning({name:'Fiktiver MSCI World UCITS ETF (Acc)',kind:'equityFund'}),null);
 // Anleihen-ETF ist ein Fonds, ein ETC trotz Anbietername nicht.
 assert.equal(kindWarning({name:'Fiktiver Staatsanleihen UCITS ETF',kind:'otherFund'}),null);
 for(const name of ['Fiktiver Gold ETC','Xetra-Gold','Fiktive Bundesanleihe 2030','Fiktives Discount-Zertifikat','Fiktiver Turbo Long'])assert.match(kindWarning({name,kind:'otherFund'}),/weder als Aktie noch als Fonds/,name);
 for(const name of ['Fiktive AG','Fiktive Fundamenta AG','Fiktive Accor SA'])assert.equal(kindWarning({name,kind:'stock'}),null,name);
 const s=emptyState();
 s.persons=[{id:'p',name:'Person'}];s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot'}];
 s.securities=[{id:'e',isin:'IE0000000002',name:'Fiktiver MSCI World UCITS ETF',kind:'stock'}];
 s.events=[{id:'b',type:'buy',date:'2025-02-03',depotId:'d',securityId:'e',quantity:'10',amount:'1000'},{id:'x',type:'distribution',date:'2025-06-02',depotId:'d',securityId:'e',amount:'20',capitalTax:'0',solidarity:'0',churchTax:'0'}];
 s.years={p:{2025:YEAR}};
 assert.match(masterHTML(s),/<small class="warn">Der Name klingt nach einem Fonds/);
 assert.match(previewHTML(s,{...newDraft('buy','d',s),securityId:'e',quantity:'1',amount:'100'}),/<p class="notice">Der Name klingt nach einem Fonds/);
 assert.ok(yearReport(s,'p',2025).hints.some(h=>/^Fiktiver MSCI World UCITS ETF: Der Name klingt nach einem Fonds/.test(h)));
 assert.match(masterHTML(emptyState()),/ETFs sind Fonds, keine Aktien.*§ 22 InvStG/);
});
