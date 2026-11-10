import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {emptyState,validate,withClosing} from '../dist/core/model.mjs';
import {fxReplay} from '../dist/core/fx.mjs';
import {undoPlan,undoAudit} from '../dist/core/undo.mjs';
import {COLUMNS,templateWorkbook,readRows,planImport,importPreviewHTML,accountKey} from '../dist/ui/importer.mjs';
import {auditHTML} from '../dist/ui/audit.mjs';
import {loadRates} from '../dist/ui/fxrates.mjs';

const A={id:'a',personId:'p',bank:'Bank A',name:'USD Zahlung',currency:'USD',kind:'payment'};
const C={id:'c',personId:'p',bank:'Bank A',name:'CHF Zahlung',currency:'CHF',kind:'payment'};
const I={id:'i',personId:'p',bank:'Bank C',name:'USD Tagesgeld',currency:'USD',kind:'interest'};
const Q={id:'k',personId:'q',bank:'Bank A',name:'USD Zahlung',currency:'USD',kind:'payment'};
function base(){
 const s=emptyState();s.persons=[{id:'p',name:'Person Eins'},{id:'q',name:'Kind Eins'}];
 s.accounts=[A,C,I,Q].map(x=>({...x}));validate(s);return s;
}
// Datei wie aus Excel: schreiben und wieder lesen, damit Datums- und Zahlzellen echt sind.
async function file(rows,headers=COLUMNS.map(c=>c[1])){
 const book=new ExcelJS.Workbook(),ws=book.addWorksheet('Bewegungen');ws.addRow(headers);for(const r of rows)ws.addRow(r);
 const back=new ExcelJS.Workbook();await back.xlsx.load(await book.xlsx.writeBuffer());return back;
}
const KEY='USD Zahlung · USD · Person Eins';
const GOOD=[
 [new Date(Date.UTC(2026,0,10)),KEY,'Umtausch aus EUR',1000,900],
 ['15.02.2026',KEY,'',-120.5,110],
 ['2026-03-31','USD Tagesgeld','Zinsen',4.4,null,1.1,null,null,null,1,0.05,0.09,'Zinsen März'],
 [new Date(Date.UTC(2026,3,1)),KEY,'Umtausch in andere Währung',400,380,null,'CHF Zahlung',360],
 ['01.05.2026',KEY,'Gebühr',5,4.6],
 ['30.06.2026','USD Tagesgeld','Zinsen',11,10]];

test('Vorlage: Blatt mit Überschriften, Auswahllisten für Konto, Art und Zielkonto, Hinweise',()=>{
 const s=base(),book=templateWorkbook(s,ExcelJS),ws=book.getWorksheet('Bewegungen');
 assert.deepEqual(book.worksheets.map(w=>[w.name,w.state]),[['Bewegungen','visible'],['Listen','hidden'],['Hinweise','visible']]);
 assert.deepEqual(ws.getRow(1).values.slice(1),COLUMNS.map(c=>c[1]));
 assert.deepEqual(book.getWorksheet('Listen').getColumn(1).values.slice(2),s.accounts.map(a=>accountKey(s,a)));
 assert.ok(book.getWorksheet('Listen').getColumn(2).values.includes('Umtausch in andere Währung'));
 const v=ws.dataValidations.model;assert.equal(v['B2:B1001'].formulae[0],'Listen!$A$2:$A$5');assert.equal(v['C2:C1001'].type,'list');assert.ok(v['G2:G1001']);
 assert.throws(()=>templateWorkbook(emptyState(),ExcelJS),/kein Währungskonto/);
});

test('Import: jede Zeile wird zum Vorgang wie im Formular; Übernahme alle zusammen mit einer Import-Kennung',async()=>{
 const s=base(),plan=planImport(s,readRows(await file(GOOD)),{file:'auszug.xlsx'});
 assert.deepEqual(plan.counts,{new:6,duplicate:0,error:0});assert.equal(plan.problem,'');
 const ev=plan.next.events,[ein,zahlung,zins,tausch,gebuehr,zins2]=ev;
 assert.equal(ein.kind,'exchangeIn');assert.equal(ein.date,'2026-01-10');assert.equal(ein.amount,'1000');assert.equal(ein.eur,'900');
 // Leere Art, negativer Betrag: Zahlung über 120,50 USD.
 assert.equal(zahlung.kind,'debit');assert.equal(zahlung.amount,'120.5');assert.equal(zahlung.eur,'110');
 // Zinsen: 4,40 USD ÷ 1,10 = 4,00 €, dazu Steuer 1,14 € = brutto 5,14 €.
 assert.equal(zins.type,'interest');assert.equal(zins.fx.accountId,'i');assert.equal(zins.fx.rate,'1.1');assert.equal(zins.amount,'5.14');assert.equal(zins.capitalTax,'1');assert.equal(zins.note,'Zinsen März');
 assert.equal(tausch.kind,'exchange');assert.equal(tausch.toAccountId,'c');assert.equal(tausch.toAmount,'360');
 assert.equal(gebuehr.kind,'debit','„Gebühr“ ist eine Zahlung');
 // Zinsen mit EUR-Betrag statt Kurs: 11 USD für 10 € ergibt den Kurs 1,1 und brutto 10 €.
 assert.equal(zins2.fx.rate,'1.1');assert.equal(zins2.amount,'10');
 const bal=id=>fxReplay(plan.next,{until:'2026-12-31'}).moves.filter(m=>m.accountId===id).at(-1).balance;
 assert.equal(bal('a'),'474.5');assert.equal(bal('c'),'360');assert.equal(bal('i'),'15.4');
 const entries=plan.next.audit.filter(x=>x.importId);assert.equal(entries.length,6);assert.equal(new Set(entries.map(x=>x.importId)).size,1);
 assert.equal(entries[0].reason,'Excel-Import aus auszug.xlsx');
 const html=importPreviewHTML(plan);assert.match(html,/6 neue Bewegungen\./);assert.match(html,/Bestand nach allen Buchungen/);assert.match(html,/474,5 USD/);assert.match(html,/6 Bewegungen übernehmen/);
});

test('Import: dieselbe Datei noch einmal – alles schon erfasst, nichts doppelt',async()=>{
 const s=base(),first=planImport(s,readRows(await file(GOOD)),{file:'a.xlsx'}).next;
 const again=planImport(first,readRows(await file(GOOD)),{file:'a.xlsx'});
 assert.deepEqual(again.counts,{new:0,duplicate:6,error:0});assert.equal(again.next,null);
 assert.match(importPreviewHTML(again),/Alle Zeilen sind schon erfasst/);
 const one=planImport(first,readRows(await file([...GOOD,['02.07.2026',KEY,'Zahlung',7,6.5]])),{file:'a.xlsx'});
 assert.deepEqual(one.counts,{new:1,duplicate:6,error:0},'nur die neue Zeile');
});

test('Import: Fehler je Zeile, dann wird nichts übernommen',async()=>{
 const s=withClosing(base(),'p',2025),rows=readRows(await file([
  ['10.01.2026','Gibt es nicht','Gutschrift',1],
  ['10.01.2026','USD Zahlung','Gutschrift',1],
  ['10.01.2026',KEY,'Kauf',1],
  ['10.01.2026',KEY,'Gutschrift',-5],
  ['31.02.2026',KEY,'Gutschrift',5],
  ['10.01.2026',KEY,'Gutschrift',5,null,null,null,null,null,1],
  ['10.01.2026',KEY,'Gutschrift',null,5],
  ['10.06.2025',KEY,'Gutschrift',5,4],
  ['11.01.2026',KEY,'Gutschrift',5,4]]));
 const plan=planImport(s,rows,{file:'x.xlsx'}),msg=plan.lines.map(l=>l.message);
 assert.match(msg[0],/„Gibt es nicht“ ist in Depotklar nicht angelegt/);assert.match(msg[1],/gibt es mehrfach/);assert.match(msg[2],/Art „Kauf“ ist unbekannt/);
 assert.match(msg[3],/Negativer Betrag passt nicht zu „Gutschrift“/);assert.match(msg[4],/Datum „31\.02\.2026“ ist ungültig/);assert.match(msg[5],/nur bei Zinsen/);
 assert.match(msg[6],/Betrag fehlt/);assert.match(msg[7],/2025 ist abgeschlossen/);
 assert.equal(plan.lines[8].status,'new');assert.deepEqual(plan.counts,{new:1,duplicate:0,error:8});assert.equal(plan.next,null);
 assert.deepEqual(plan.lines.map(l=>l.row),[2,3,4,5,6,7,8,9,10],'Zeilennummern wie in Excel');
 const html=importPreviewHTML(plan);assert.match(html,/Noch nichts übernommen/);assert.doesNotMatch(html,/data-action="import-apply"/);
});

test('Import: Abgang über den Bestand wird erkannt, bevor etwas übernommen ist',async()=>{
 const plan=planImport(base(),readRows(await file([['10.01.2026',KEY,'Zahlung',50,45]])),{file:'x.xlsx'});
 assert.equal(plan.next,null);assert.match(plan.problem,/im Konto sind nur 0 USD/);assert.match(importPreviewHTML(plan),/So lässt sich die Datei nicht übernehmen/);
});

test('Einlesen: Spalten an der Überschrift, Formeln mit Ergebnis, leere Zeilen, EZB-Kurs ohne Angabe',async()=>{
 await loadRates(['USD']);
 const book=await file([['Betrag (USD)','Konto','Datum','Art'].map(()=>null)].slice(1),['Art','Betrag (USD)','Konto','Datum']);
 const ws=book.getWorksheet('Bewegungen');ws.addRow(['Umtausch aus EUR',1000,KEY,'02.03.2026']);ws.addRow([]);ws.addRow(['Zahlung',{formula:'100-40',result:60},KEY,'03.03.2026']);
 const rows=readRows(book);assert.deepEqual(rows.map(r=>r.row),[2,4]);
 const plan=planImport(base(),rows,{file:'x.xlsx'}),[ein,aus]=plan.next.events;
 assert.equal(ein.rateSource,'ecb');assert.equal(ein.rateDate,'2026-03-02');assert.equal(aus.amount,'60');
 // Vorschau: EUR-Wert aus dem EZB-Kurs als Betrag (1.000 USD ÷ Kurs), mit Kurs darunter.
 const eur=(Number(1000)/Number(ein.rate)).toFixed(2).replace('.',',');
 assert.match(importPreviewHTML(plan),new RegExp(`${eur.replace(/\B(?=(\d{3})+,)/g,'.')}<small>EZB `));
 await assert.rejects(async()=>readRows(await file([[1]],['Irgendwas'])),/passt nicht zur Vorlage: „Datum“, „Konto“, „Betrag“ fehlt/);
});

test('Protokoll: ein Import als eine Zeile, Rücknahme und Wiederherstellung als Ganzes',async()=>{
 const s=base(),next=planImport(s,readRows(await file(GOOD)),{file:'a.xlsx'}).next,first=next.audit.findIndex(x=>x.importId);
 const html=auditHTML(next);assert.equal((html.match(/Excel-Import<\/span>/g)||[]).length,1);assert.match(html,/6 Vorgänge/);assert.equal((html.match(/data-action="audit-undo"/g)||[]).length,1);
 const p=undoPlan(next,first+3);assert.equal(p.label,'Import zurücknehmen: 6 Vorgänge löschen','jeder Eintrag des Imports nimmt den ganzen zurück');
 const gone=undoAudit(next,first);assert.equal(gone.events.length,0);assert.equal(gone.audit.filter(x=>x.action==='Vorgang gelöscht'&&x.importId).length,6);
 assert.match(auditHTML(gone),/Import gelöscht/);
 const back=undoAudit(gone,gone.audit.length-1);assert.equal(back.events.length,6);assert.equal(undoPlan(back,back.audit.length-1).label,'Import zurücknehmen: 6 Vorgänge löschen');
 // Im abgeschlossenen Jahr gesperrt wie jede Änderung.
 const old=planImport(s,readRows(await file([['10.01.2025',KEY,'Umtausch aus EUR',100,90]])),{file:'b.xlsx'}).next;
 assert.throws(()=>undoAudit(withClosing(old,'p',2025),old.audit.findIndex(x=>x.importId)),/2025 ist abgeschlossen/);
});
