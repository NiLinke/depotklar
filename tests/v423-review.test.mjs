import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {emptyState,validate,withEvent,withRecord,withoutRecord,withRelation,dateWarning} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {statement,periodStatement} from '../dist/core/statement.mjs';
import {undoAudit,undoPlan} from '../dist/core/undo.mjs';
import {demoState} from '../dist/core/sample.mjs';
import {decimalInput,date} from '../dist/ui/format.mjs';
import {draftFromEvent,draftToEvent,apply,previewHTML,entryFormHTML} from '../dist/ui/entry.mjs';
import {loadRates,ecbRate,referenceRate} from '../dist/ui/fxrates.mjs';
import {planImport,importPreviewHTML} from '../dist/ui/importer.mjs';
import {workbook} from '../dist/ui/xlsx.mjs';
import {securitiesPdf,taxPdf} from '../dist/ui/pdf.mjs';
import {taxPageHTML} from '../dist/ui/taxpage.mjs';
import {auditHTML,subject,auditTarget} from '../dist/ui/audit.mjs';
import {createDepotklarServer} from '../server.mjs';

const fxState=()=>{const s=emptyState();s.persons=[{id:'p',name:'P'},{id:'q',name:'Q'}];s.depots=[{id:'d',personId:'p',name:'Depot',bank:'B'}];s.securities=[{id:'st',name:'Aktie',kind:'stock'}];
 s.accounts=[{id:'usd',name:'USD-Konto',currency:'USD',kind:'payment',personId:'p',bank:'B'},{id:'chf',name:'CHF-Konto',currency:'CHF',kind:'payment',personId:'p',bank:'B'},{id:'dep',name:'USD am Depot',currency:'USD',kind:'payment',depotId:'d'}];validate(s);return s;};

test('Zahleneingabe: englische Schreibweise mit Tausenderkomma wird richtig gelesen, Mehrdeutiges abgelehnt',()=>{
 assert.equal(decimalInput('1,234.56'),'1234.56');assert.equal(decimalInput('-12,345,678.9'),'-12345678.9');
 // Deutsch bleibt, wie es war.
 assert.equal(decimalInput('1.234,56'),'1234.56');assert.equal(decimalInput('1,085'),'1.085');assert.equal(decimalInput('1.000'),'1000');assert.equal(decimalInput('78.20'),'78.2');
 for(const bad of ['1,23.4','12,34.56','1,2345.6','1.234,56.7'])assert.throws(()=>decimalInput(bad),/kein gültiger Betrag/,bad);
});

test('EZB-Kurs bleibt beim Bearbeiten erhalten, wenn die Kurstabelle nicht geladen ist',()=>{
 // CHF wird in dieser Datei nie geladen: wie nach einem fehlgeschlagenen Nachladen.
 let s=fxState();assert.equal(ecbRate('CHF','2025-03-14'),null);
 s=withEvent(s,{id:'e1',type:'fx',kind:'credit',date:'2025-03-14',accountId:'chf',amount:'1000',rate:'0.9631',rateSource:'ecb',rateDate:'2025-03-14'});
 s=withEvent(s,{id:'e2',type:'interest',date:'2025-06-30',amount:'10.5',fx:{accountId:'chf',amount:'10',rate:'0.9347',rateSource:'ecb',rateDate:'2025-06-30'}});
 const edit=(st,id,change)=>apply(st,{...draftFromEvent(st.events.find(e=>e.id===id),st),...change}).next.events.find(e=>e.id===id);
 const a=edit(s,'e1',{note:'Notiz'});assert.deepEqual([a.rate,a.rateSource,a.rateDate,a.note],['0.9631','ecb','2025-03-14','Notiz']);
 const b=edit(s,'e2',{note:'Notiz'});assert.deepEqual([b.fx.rate,b.fx.rateSource,b.fx.rateDate],['0.9347','ecb','2025-06-30']);
 // Anderes Datum: Der alte Kurs gilt nicht mehr; ohne Tabelle bleibt der Wert offen statt falsch.
 assert.equal(edit(s,'e1',{date:'2025-03-17'}).rate,undefined);
 // Ein eingegebener Kurs ersetzt den übernommenen.
 const c=edit(s,'e1',{rate:'0,95'});assert.deepEqual([c.rate,c.rateSource],['0.95',undefined]);
});

test('Devisenkurs und EUR-Betrag werden gegen den EZB-Referenzkurs geprüft: Punkt statt Komma fällt auf',async()=>{
 await loadRates(['USD']);const ref=ecbRate('USD','2025-03-14');assert.ok(ref&&Number(ref.rate)>0.9&&Number(ref.rate)<1.3);
 assert.equal(ecbRate('USD','2090-01-02'),null,'kein Vorschlag nach dem Ende der Reihe');assert.equal(referenceRate('USD','2090-01-02').last,true);assert.equal(referenceRate('CHF','2090-01-02'),null);
 const s=fxState(),fx=d=>draftToEvent(s,{type:'fx',kind:'debit',date:'2025-03-14',accountId:'usd',...d}).event;
 assert.throws(()=>fx({amount:'100',rate:'1.085'}),/Devisenkurs 1085 passt nicht zum EZB-Referenzkurs vom 14\.03\.2025.*Komma/);
 assert.equal(fx({amount:'100',rate:'1,085'}).rate,'1.085');
 // Nach dem Ende der hinterlegten Reihe (heute, künftige Jahre, Betrieb ohne Internet) dient ihr letzter Kurs als Vergleich.
 assert.throws(()=>fx({date:'2090-01-02',amount:'100',rate:'1.085'}),/Devisenkurs 1085 passt nicht zum letzten hinterlegten EZB-Referenzkurs vom/);
 assert.equal(fx({date:'2090-01-02',amount:'100',rate:'1,2'}).rate,'1.2');
 assert.equal(fx({date:'1990-01-02',amount:'100',rate:'1.085'}).rate,'1085','vor dem Beginn der Reihe gibt es keinen Vergleich');
 assert.throws(()=>fx({amount:'1000',eur:'0,92'}),/EUR-Betrag 0,92 passt nicht zu 1000 USD/);
 assert.equal(fx({amount:'1000',eur:'920'}).eur,'920');
 // Übernommener Bestand ohne Anschaffungstag: kein Vergleichstag, keine Prüfung. Währung ohne Tabelle: keine Prüfung.
 assert.equal(draftToEvent(s,{type:'fx',kind:'opening',date:'2025-03-14',accountId:'usd',amount:'1000',eur:'5'}).event.eur,'5');
 assert.equal(draftToEvent(s,{type:'fx',kind:'debit',date:'2025-03-14',accountId:'chf',amount:'100',rate:'950'}).event.rate,'950');
 // Kauf über das Währungskonto: Währungsbetrag und EUR-Betrag der Abrechnung müssen zusammenpassen.
 const buy=d=>draftToEvent(s,{type:'buy',date:'2025-03-14',depotId:'d',securityId:'st',quantity:'10',amount:'1000',fxAccount:'dep',...d}).event;
 assert.throws(()=>buy({fxAmount:'1,09'}),/passt nicht zum EUR-Betrag 1000/);assert.equal(buy({fxAmount:'1.090'}).fx.amount,'1090');
 assert.throws(()=>buy({fxAmount:'1090',fxRate:'1.085'}),/Devisenkurs 1085/);
 // In der Vorschau steht der Grund statt eines unsinnigen EUR-Werts.
 assert.match(previewHTML(s,{type:'fx',kind:'debit',date:'2025-03-14',accountId:'usd',amount:'100',rate:'1.085'}),/passt nicht zum EZB-Referenzkurs/);
});

test('Auffälliges Datum: Hinweis in Vorschau und Import, kein Verbot künftiger Jahre',()=>{
 assert.equal(dateWarning('2026-03-01','2026-11-11'),null);assert.equal(dateWarning('2031-12-31','2026-11-11'),null);
 assert.match(dateWarning('2206-03-01','2026-11-11'),/2206 liegt mehr als fünf Jahre in der Zukunft/);assert.match(dateWarning('0206-03-01','2026-11-11'),/0?206 liegt sehr weit zurück/);
 assert.equal(dateWarning('kein Datum'),null);
 const s=fxState();
 assert.match(previewHTML(s,{type:'fx',kind:'credit',date:'2206-03-01',accountId:'usd',amount:'100',eur:'90'}),/class="notice">Datum 01\.03\.2206/);
 assert.doesNotMatch(previewHTML(s,{type:'fx',kind:'credit',date:'2026-03-01',accountId:'usd',amount:'100',eur:'90'}),/class="notice"/);
 assert.match(entryFormHTML(s,{type:'fx',kind:'credit',date:'2206-03-01',accountId:'usd',amount:'100',eur:'90'},''),/liegt mehr als fünf Jahre in der Zukunft/);
 const plan=planImport(s,[{row:2,raw:{date:'15.03.2206',account:'USD-Konto',kind:'Gutschrift',amount:100,eur:90}},{row:3,raw:{date:'15.03.2026',account:'USD-Konto',kind:'Gutschrift',amount:100,eur:90}}],{file:'t.xlsx'});
 assert.deepEqual(plan.lines.map(l=>[l.status,Boolean(l.warning)]),[['new',true],['new',false]]);assert.ok(plan.next,'ein Hinweis verhindert die Übernahme nicht');
 assert.match(importPreviewHTML(plan),/1 Zeile hat ein auffälliges Datum/);
});

test('Excel-Import: Tag bei Uhrzeit, englische Zahlen, zwei gleiche Buchungen am selben Tag',()=>{
 const s=fxState(),line=raw=>planImport(s,[{row:2,raw:{account:'USD-Konto',kind:'Gutschrift',eur:90,...raw}}],{file:'t.xlsx'}).lines[0];
 assert.equal(line({date:46096,amount:100}).event.date,'2026-03-15');
 assert.equal(line({date:46096.75,amount:100}).event.date,'2026-03-15','18 Uhr bleibt derselbe Tag');
 assert.equal(line({date:'15.03.2026 18:00',amount:100}).event.date,'2026-03-15');assert.equal(line({date:'2026-03-15T18:00:00',amount:100}).event.date,'2026-03-15');
 assert.equal(line({date:'15.03.2026',amount:'1,234.56',eur:1100}).event.amount,'1234.56');
 assert.equal(line({date:'15.03.2026',amount:'1,23.4'}).status,'error');
 // Eine von zwei gleichen Buchungen ist schon erfasst: Die zweite Zeile kommt neu hinzu; beim erneuten Einlesen sind beide erfasst.
 const row={date:'16.03.2026',account:'USD-Konto',kind:'Gutschrift',amount:50,eur:45},one=planImport(s,[{row:2,raw:row}],{file:'a.xlsx'}).next;
 const two=planImport(one,[{row:2,raw:row},{row:3,raw:row}],{file:'b.xlsx'});
 assert.deepEqual(two.lines.map(l=>l.status),['duplicate','new']);assert.equal(two.counts.new,1);
 assert.deepEqual(planImport(two.next,[{row:2,raw:row},{row:3,raw:row}],{file:'b.xlsx'}).lines.map(l=>l.status),['duplicate','duplicate']);
});

const depotState=()=>{const s=emptyState();s.persons=[{id:'p',name:'P'},{id:'k',name:'K'}];s.depots=[{id:'d',personId:'p',name:'Depot',bank:'B'},{id:'dk',personId:'k',name:'Depot K',bank:'B'}];
 s.securities=[{id:'f',name:'Mischfonds',kind:'mixedFund'},{id:'st',name:'Aktie',kind:'stock'}];return s;};

test('Jahresblatt: Nach dem Abgang eines Loses mit unbekanntem Wert stehen die bekannten Werte, ohne Warnzeile',()=>{
 // Altbestand ohne Kurs 31.12.2017 (steuerlicher Wert offen), späterer Kauf mit bekanntem Wert, dann geht der Altbestand per FIFO ab.
 const s=depotState();s.events=[
  {id:'o',type:'opening',date:'2019-03-22',depotId:'d',securityId:'f',quantity:'100',group:'pre2009',acquired:'2002-05-17',cost:'5000',oldIncome:'0',vapBefore:'0'},
  {id:'b',type:'buy',date:'2021-07-17',depotId:'d',securityId:'f',quantity:'50',amount:'4000'},
  {id:'g',type:'transfer',kind:'gift',date:'2022-12-26',depotId:'d',toDepotId:'dk',securityId:'f',quantity:'100'}];validate(s);
 const y21=statement(s,'d',2021,'tax').rows[0],y22=statement(s,'d',2022,'tax').rows[0],y23=statement(s,'d',2023,'tax').rows[0];
 assert.equal(y21.closing.value,null,'solange das unbekannte Los da ist, bleibt der Wert offen');
 assert.equal(y22.opening.value,null);assert.equal(Number(y22.closing.value),4000,'Endstand = Wert der verbliebenen Lose');assert.ok(y22.balanced);
 assert.equal(Number(y23.opening.value),4000,'Anfangsstand des Folgejahrs');assert.equal(Number(y23.closing.value),4000);assert.ok(y23.balanced);
 assert.ok(periodStatement(s,'d',2019,2024,'tax').balanced);
 // Wirtschaftlich war alles bekannt und bleibt es.
 assert.equal(Number(statement(s,'d',2023,'economic').rows[0].closing.value),3000);
});

test('Jahresblatt: Eine aufgelöste und neu aufgebaute Position beginnt in den Folgejahren bekannt, in beiden Betrachtungen',()=>{
 const s=depotState();s.events=[
  {id:'o',type:'opening',date:'2019-01-10',depotId:'d',securityId:'st',quantity:'10',group:'from2018'},          // Anschaffungswert unbekannt
  {id:'v',type:'sell',date:'2020-05-05',depotId:'d',securityId:'st',quantity:'10',amount:'900'},
  {id:'b',type:'buy',date:'2021-03-30',depotId:'d',securityId:'st',quantity:'5',amount:'700'}];validate(s);
 for(const basis of ['economic','tax']){
  assert.equal(statement(s,'d',2019,basis).rows[0].closing.value,null,basis);
  const y21=statement(s,'d',2021,basis).rows[0],y22=statement(s,'d',2022,basis).rows[0],y23=statement(s,'d',2023,basis).rows[0];
  assert.deepEqual([Number(y21.opening.value),Number(y21.closing.value)],[0,700],basis);
  assert.deepEqual([Number(y22.opening.value),Number(y22.closing.value),y22.balanced],[700,700,true],`${basis}: Folgejahr`);
  assert.deepEqual([Number(y23.opening.value),y23.balanced],[700,true],basis);
  assert.ok(periodStatement(s,'d',2019,2023,basis).balanced,basis);
 }
 // Die echte Gegenprobe bleibt: Kette und Lose müssen übereinstimmen, wo beide einen Wert haben (Demo, alle Jahre).
 const demo=demoState();for(const d of demo.depots)for(let y=2018;y<=2026;y++)for(const basis of ['economic','tax'])assert.ok(statement(demo,d.id,y,basis).balanced,`${d.id} ${y} ${basis}`);
});

test('Excel-Ausgabe bricht nicht an Namen: Groß- und Kleinschreibung, Hochkomma, „History“',async()=>{
 const cases=[s=>{s.securities[0].name='Weltfonds';s.securities[1].name='WELTFONDS';},s=>{s.persons[0].name='Weber';s.persons[1].name='WEBER';},
  s=>{s.securities[0].name="'Fonds'";s.persons[0].name="'O'Brien'";s.depots[0].name="'Depot'";},s=>{s.securities[0].name='History';s.persons[0].name='history';}];
 for(const change of cases){
  const s=demoState();change(s);validate(s);
  const book=await workbook(s,2026,ExcelJS,{from:2018}),names=book.worksheets.map(w=>w.name),again=new ExcelJS.Workbook();
  await again.xlsx.load(await book.xlsx.writeBuffer());
  assert.equal(new Set(names.map(n=>n.toLowerCase())).size,names.length,'Blattnamen eindeutig ohne Rücksicht auf Groß und Klein');
  for(const n of names){assert.ok(n.length<=31,n);assert.doesNotMatch(n,/^'|'$/,n);assert.notEqual(n.toLowerCase(),'history');}
 }
});

test('PDF: Namen mit Zeichen außerhalb der Standardschrift bleiben lesbar statt den ganzen Text zu entstellen',()=>{
 const lib={jsPDF:function(o){return new jsPDF({...o,compress:false});},autoTable};
 const s=demoState();s.securities[0].name='KGHM Polska Miedź − Łódź';s.persons[0].name='Çelik Čech İnci';validate(s);
 const text=securitiesPdf(s,{year:2026,from:2025,personId:''},lib).output()+taxPdf(s,s.persons[0].id,2026,lib).output();
 // ź und Ł kennt die Schrift nicht (z, L), ó und Ç schon; das lange Minus wird zum Bindestrich.
 assert.match(text,/KGHM Polska Miedz - Lódz/);assert.match(text,/Çelik Cech Inci/);
 assert.doesNotMatch(text,/\u0000K\u0000G\u0000H\u0000M/,'kein in Einzelbytes zerlegter Text');
});

test('Kennungen aus einer Tresordatei: Trennzeichen und reservierte Namen werden abgelehnt',()=>{
 const base=()=>{const s=emptyState();s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',name:'D',bank:'B'}];return s;};
 assert.doesNotThrow(()=>validate(base()));
 for(const id of ['a|b','__proto__','constructor','x\u0000y','x'.repeat(101)]){const s=base();s.depots[0].id=id;assert.throws(()=>validate(s),/ungültige Kennung/,JSON.stringify(id).slice(0,20));}
 {const s=base();s.depots[0].id=5;assert.throws(()=>validate(s),/ungültige Kennung/);}
 // Von Depotklar vergebene Kennungen und die der Demo bleiben gültig.
 assert.doesNotThrow(()=>validate(demoState()));
 const s=withRecord(base(),'securities',{name:'Aktie',kind:'stock'});assert.match(s.securities[0].id,/^[A-Za-z0-9-]+$/);
});

test('Verwandtschaft steht im Protokoll und lässt sich zurücknehmen',()=>{
 let s=emptyState();s.persons=[{id:'p',name:'Vater'},{id:'k',name:'Kind'}];validate(s);
 s=withRelation(s,'p','k','child');assert.deepEqual(s.relations,[{donorId:'p',recipientId:'k',kind:'child'}]);
 assert.equal(s.audit.at(-1).action,'Verwandtschaft angelegt');assert.equal(subject(s,s.audit.at(-1)),'Vater → Kind');assert.deepEqual(auditTarget(s,s.audit.at(-1)),{kind:'gifts'});
 assert.equal(withRelation(s,'p','k','child'),s,'ohne Änderung kein Eintrag');
 s=withRelation(s,'p','k','grandchild');assert.equal(s.audit.at(-1).action,'Verwandtschaft geändert');assert.match(auditHTML(s,{filter:'',limit:10}),/Kind → Enkel/);
 const back=undoAudit(s,s.audit.length-1);assert.equal(back.relations[0].kind,'child');
 const gone=withRelation(back,'p','k',null);assert.deepEqual(gone.relations,[]);assert.equal(gone.audit.at(-1).action,'Verwandtschaft gelöscht');
 assert.equal(undoAudit(gone,gone.audit.length-1).relations[0].kind,'child');
 assert.equal(undoPlan(gone,gone.audit.length-2).ok,true);
 assert.throws(()=>withRelation(s,'p','p','child'),/verschieden/);assert.throws(()=>withRelation(s,'p','k','unbekannt'),/Unbekannte Beziehungsart/);
});

test('Löschen mit abhängigen Einträgen: klare Meldung oder Mitlöschen dessen, was sonst nicht mehr erreichbar wäre',()=>{
 let s=emptyState();s.persons=[{id:'p',name:'P'},{id:'q',name:'Q'}];s.certificates=[{id:'c',personId:'p',bank:'B',year:2025,capitalTax:'1',solidarity:'0',churchTax:'0'}];validate(s);
 let t=withoutRecord(s,'persons','p');assert.deepEqual(t.certificates,[]);assert.deepEqual(t.audit.slice(-2).map(a=>a.action),['Bankbescheinigung gelöscht','Person gelöscht']);
 s.priorGifts=[{id:'g',donorId:'p',recipientId:'q',date:'2020-01-01',value:'1000'}];validate(s);
 assert.throws(()=>withoutRecord(s,'persons','p'),/Vorerwerbe.*Schenkungen/);assert.throws(()=>withoutRecord(s,'persons','q'),/Vorerwerbe/);
 s=emptyState();s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',name:'D',bank:'B'}];s.ledgerChecks=[{id:'l',depotId:'d',date:'2025-12-31',balance:'0'}];validate(s);
 t=withoutRecord(s,'depots','d');assert.deepEqual(t.ledgerChecks,[]);assert.equal(t.audit.at(-2).action,'Buchhaltungsabgleich gelöscht');
 s=emptyState();s.securities=[{id:'x',name:'Fonds',kind:'equityFund'}];s.vapUnits=[{securityId:'x',year:2025,perUnit:'1.2'}];validate(s);
 assert.throws(()=>withoutRecord(s,'securities','x'),/Vorabpauschale je Anteil.*Kurse/);
});

test('Datum aus einer fremden Tresordatei wird maskiert angezeigt',()=>{
 assert.equal(date('2026-03-01'),'01.03.2026');assert.equal(date('<b>x</b>'),'&lt;b&gt;x&lt;/b&gt;');assert.equal(date(null),'—');
 const s=demoState(),p=s.persons[0].id;s.years[p][2025]={...s.years[p][2025],confirmedAt:'<textarea>'};validate(s);
 const html=taxPageHTML(s,{personId:p,year:2025,years:[2026,2025]});
 assert.doesNotMatch(html,/<textarea>/);assert.match(html,/Bestätigt am &lt;textarea&gt;/);
});

test('Server: Seiten des Projekts fehlen im Modus app in jeder Schreibweise; HTTPS wird dauerhaft verlangt',async()=>{
 const server=createDepotklarServer({site:'app'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base=`http://127.0.0.1:${server.address().port}`,status=async p=>(await fetch(base+p,{redirect:'manual'})).status;
  for(const p of ['/impressum','/impressum.html','/impressum.html/','/index.html/','/index.html%2f','/datenschutz.html/','/landing.css/','/sitemap.xml/','/INDEX.HTML'])assert.equal(await status(p),404,p);
  assert.equal(await status('/app/'),200);assert.equal(await status('/doku/'),200);assert.equal(await status('/core/model.mjs'),200);
  assert.equal(await status('/core/model.mjs/'),404,'eine Datei hat keinen Schrägstrich am Ende');assert.equal(await status('/core/model.mjs::$DATA'),404);
  assert.equal((await fetch(base+'/app/')).headers.get('strict-transport-security'),'max-age=31536000');
 }finally{await new Promise(r=>server.close(r));}
});

test('Auslieferung: Laufzeit-Image ohne Paketverwaltung, Meldeweg für Schwachstellen',()=>{
 const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8');
 const runtime=read('Dockerfile').split(/^FROM \$\{NODE_IMAGE\}$/m).at(-1);
 assert.match(runtime,/^RUN rm -rf \/usr\/local\/lib\/node_modules .*\/usr\/local\/bin\/npm /m);assert.ok(runtime.indexOf('RUN rm -rf')<runtime.indexOf('USER node'),'entfernt wird als root, vor dem Wechsel des Benutzers');
 assert.match(read('.github/workflows/ci.yml'),/Runtime image without package managers/);
 assert.match(read('SECURITY.md'),/Schwachstelle melden/);assert.match(read('BETRIEB.md'),/SECURITY\.md/);assert.match(read('README.md'),/SECURITY\.md/);
});
