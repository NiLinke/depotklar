import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {demoState} from '../dist/core/sample.mjs';
import {securitiesPdf,securityPages,overviewPdf,taxPdf,auditPdf} from '../dist/ui/pdf.mjs';
import {withEvent} from '../dist/core/model.mjs';

// Unkomprimiert, damit sich der Text der Seiten prüfen lässt.
const lib={jsPDF:function(o){return new jsPDF({...o,compress:false});},autoTable};

test('the securities PDF has one landscape page per person, depot and security with both views as text',()=>{
 const s=demoState();
 const pages=securityPages(s,{year:2026,from:2025});
 assert.deepEqual(pages.map(p=>`${p.person.id}/${p.depot.id}/${p.security.id}`),['p1/d1/af','p1/d1/mf','p1/d1/f12','p1/d2/st','p1/d2/etf','p1/d2/us','p3/d3/af','p4/d4/af']);
 const doc=securitiesPdf(s,{year:2026,from:2025},lib),text=doc.output();
 assert.equal(doc.getNumberOfPages(),8);
 assert.ok(doc.internal.pageSize.getWidth()>doc.internal.pageSize.getHeight(),'Querformat');
 for(const t of ['Fiktiver Aktienfonds Alt','Wirtschaftliche Betrachtung 2025','Steuerliche Betrachtung 2025','289.000,00','545.238,70','Seite 1 von 8','Buchhaltung Konto 530'])assert.ok(text.includes(t),t);
 // Je Person: nur ihre Depots.
 const laura=securityPages(s,{year:2026,from:2026,personId:'p3'});
 assert.deepEqual(laura.map(p=>p.security.id),['af']);
 assert.equal(securitiesPdf(s,{year:2026,from:2026,personId:'p3',securityId:'af'},lib).getNumberOfPages(),1);
 assert.equal(securityPages(s,{year:2026,personId:'p2'}).length,0);
 assert.match(securitiesPdf(s,{year:2026,personId:'p2'},lib).output(),/keine Wertpapiere/);
});

test('every printout is a PDF: overview per depot, tax year per person in portrait and the protocol',()=>{
 let s=demoState();s=withEvent(s,{...s.events.find(e=>e.id==='s2'),amount:'52100'},{reason:'Abrechnung korrigiert'});
 const overview=securitiesPdfText(overviewPdf(s,{year:2026,from:2026},lib));
 for(const t of ['Altfonds','Wirtschaftliche Betrachtung 2026','Steuerliche Betrachtung 2026','Summe Stand 31.12.2026','311.875,00','559.749,39','USD-Konto Direktbank'])assert.ok(overview.includes(t),t);
 const one=overviewPdf(s,{year:2026,personId:'p3'},lib);assert.equal(one.getNumberOfPages(),1);
 const tax=taxPdf(s,'p1',2026,lib);assert.ok(tax.internal.pageSize.getWidth()<tax.internal.pageSize.getHeight(),'Hochformat');
 const text=securitiesPdfText(tax);for(const t of ['Steuer 2026','Jahresrechnung','Bemessungsgrundlage','10.744,62','2.993,78','Abgleich offen','Anlage SO'])assert.ok(text.includes(t),t);
 const audit=securitiesPdfText(auditPdf(s,{},lib));assert.ok(audit.includes('Abrechnung korrigiert'));assert.ok(audit.includes('52.100,00'));
});
const securitiesPdfText=doc=>doc.output();

test('no browser printing is left: every print button produces a PDF and the PDF module ships',async()=>{
 const css=await readFile(new URL('../dist/app.css',import.meta.url),'utf8'),app=await readFile(new URL('../dist/app.mjs',import.meta.url),'utf8'),build=await readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 assert.match(css,/@page\{size:A4 portrait/);assert.match(css,/@page wide\{size:A4 landscape/);assert.match(css,/body\[data-page="jahr"\]\{page:wide\}/);
 assert.match(css,/@media print\{[^]*font-family:Arial/);
 assert.match(app,/document\.body\.dataset\.page=route/);
 // Der Seitenrahmen darf kein Navigationsmerkmal tragen, sonst baut jeder Klick die Seite neu auf.
 assert.doesNotMatch(app,/body\.dataset\.(route|action)\b/);assert.doesNotMatch(css,/body\[data-(route|action)/);for(const a of ['export-pdf','export-pdf-overview','export-pdf-tax','export-pdf-audit'])assert.ok(app.includes(`'${a}'`),a);
 assert.doesNotMatch(app,/window\.print/);
 for(const f of ['sheet','taxpage','audit'])assert.doesNotMatch(await readFile(new URL(`../dist/ui/${f}.mjs`,import.meta.url),'utf8'),/data-action="print"/,f);
 for(const f of ['jspdf.umd.min.js','jspdf.plugin.autotable.min.js','JSPDF-LICENSE.txt','JSPDF-AUTOTABLE-LICENSE.txt'])assert.ok(build.includes(f),f);
});

test('PDFs open in a preview first and follow the security filter, also in file name and heading',async()=>{
 const app=await readFile(new URL('../dist/app.mjs',import.meta.url),'utf8'),server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
 // Vorschau im Betrachter des Browsers; ohne Betrachter direkt speichern, beim Schließen Speicher freigeben.
 // Zeilenende offen lassen: unter Windows checkt Git die Dateien mit CRLF aus.
 assert.match(app,/function showPdf\(name,blob\)\{\r?\n if\(!navigator\.pdfViewerEnabled\)return download\(name,blob\);/);
 assert.match(app,/<iframe src="\$\{pdfShown\.url\}#view=FitH"/);assert.match(app,/'save-pdf':\(\)=>\{if\(pdfShown\)download\(pdfShown\.name,pdfShown\.blob\);\}/);
 assert.match(app,/if\(pdfShown\)\{URL\.revokeObjectURL\(pdfShown\.url\);pdfShown=null;\}/);
 // Die CSP lässt nur Rahmen aus blob: zu; eingebettete Objekte bleiben gesperrt.
 assert.match(server,/frame-src blob:; object-src 'none'/);
 // Dateiname mit Wertpapier; Steuer und Protokoll ohne.
 assert.match(app,/\$\{security\?'-'\+slug\(security\.name\):''\}\.pdf/);
 assert.match(app,/person:null,security:null,depot:null\}\)/);
 const s=demoState(),one=securitiesPdf(s,{year:2026,from:2026,personId:'p1',securityId:'af'},lib),all=securitiesPdf(s,{year:2026,from:2026,personId:'p1'},lib);
 assert.equal(one.getNumberOfPages(),1);assert.ok(all.getNumberOfPages()>1);
 const over=overviewPdf(s,{year:2026,from:2026,personId:'p1',securityId:'af'},lib).output();
 assert.ok(over.includes('nur Fiktiver Aktienfonds Alt'));assert.ok(!over.includes('Fiktiver Mischfonds Alt'));
 const {sheetHTML}=await import('../dist/ui/sheet.mjs');
 const html=sheetHTML(s,{year:2026,from:2026,personId:'p1',view:'both',securityId:'af'});
 assert.match(html,/<select id="security-filter" class="active">/);assert.match(html,/title="Nur Fiktiver Aktienfonds Alt: je Depot eine Seite/);
 assert.match(sheetHTML(s,{year:2026,from:2026,personId:'p1',view:'both'}),/<select id="security-filter" class="">/);
});
