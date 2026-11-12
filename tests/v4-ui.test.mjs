import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyState} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {demoState} from '../dist/core/sample.mjs';
import {sheetHTML} from '../dist/ui/sheet.mjs';
import {taxPageHTML} from '../dist/ui/taxpage.mjs';
import {pricesHTML} from '../dist/ui/prices.mjs';
import {giftsHTML} from '../dist/ui/gifts.mjs';
import {masterHTML} from '../dist/ui/master.mjs';
import {lockHTML,vaultPageHTML} from '../dist/ui/vaultui.mjs';
import {chooserHTML,entryFormHTML,newDraft,draftFromEvent,draftToEvent,apply,previewHTML} from '../dist/ui/entry.mjs';
import {sheetRows} from '../dist/ui/xlsx.mjs';
import {decimalInput} from '../dist/ui/format.mjs';
import {ledgerSheet} from './fixtures/sheet.mjs';

const pages=s=>[
 ...[2018,2025,2026].flatMap(year=>['both','economic','tax'].map(view=>sheetHTML(s,{year,view}))),
 ...s.persons.flatMap(p=>[2025,2026].map(year=>taxPageHTML(s,{personId:p.id,year}))),
 pricesHTML(s),giftsHTML(s),masterHTML(s),masterHTML(s,{editing:{collection:'depots',id:s.depots[0]?.id}}),
 lockHTML({hasVault:true}),lockHTML({hasVault:false}),vaultPageHTML({demo:false,revision:2}),vaultPageHTML({demo:true}),chooserHTML(s.depots[0]?.id),
 ...['opening','transition','buy','sell','transfer','giftBatch','distribution','interest','fx','vap','split','merger'].map(t=>entryFormHTML(s,{...newDraft(t,s.depots[0]?.id,s),securityId:s.securities[0]?.id||''})),
 ...s.events.map(e=>entryFormHTML(s,draftFromEvent(e,s)))];

test('every page renders for the demo and for an empty vault without leaking undefined or NaN',()=>{
 for(const s of [demoState(),emptyState()])for(const html of pages(s)){assert.equal(typeof html,'string');assert.doesNotMatch(html,/undefined|NaN|\[object/);}
});

test('user-entered names are escaped everywhere',()=>{
 const s=demoState();s.persons[0].name='<img src=x onerror=alert(1)>';s.depots[0].name='<script>bad()</script>';s.securities[0].name='"><b>x</b>';
 for(const html of pages(s)){assert.doesNotMatch(html,/<img src=x|<script>bad|"><b>x<\/b>/);}
 assert.match(sheetHTML(s,{year:2026}),/&lt;script&gt;bad/);
});

test('the yearly sheet shows both views, editable lines, open values and the ledger comparison',()=>{
 const s=demoState(),html=sheetHTML(s,{year:2026});
 assert.match(html,/Wirtschaftliche Betrachtung 2026/);assert.match(html,/Steuerliche Betrachtung 2026/);
 assert.match(html,/data-action="edit" data-id="g1"/);assert.match(html,/Schenkung an Laura Weber/);
 assert.ok(html.indexOf('Wirtschaftliche Betrachtung 2026')<html.indexOf('Steuerliche Betrachtung 2026'));
 const y2025=sheetHTML(s,{year:2025});assert.match(y2025,/stimmt überein/);
 s.ledgerChecks[0].balance='441000';assert.match(sheetHTML(s,{year:2025}),/Differenz -500,00/);
 const gap=demoState();gap.prices=gap.prices.filter(p=>!(p.securityId==='af'&&p.date.startsWith('2024')));
 const open=sheetHTML(gap,{year:2025});assert.match(open,/class="line click missing"/);assert.match(open,/Offen/);assert.match(open,/Offene Angaben/);
});

test('the tax page carries the allowance values for the return and the bank comparison',()=>{
 const s=demoState();
 const laura=taxPageHTML(s,{personId:'p3',year:2026});
 assert.match(laura,/Ermittelt/);assert.match(laura,/12\.701,87/);assert.match(laura,/87\.298,13/);
 // Deutsches Depot: Alt-Anteile-Gewinne laut Steuerbescheinigung in die Anlage KAP, Rest-Freibetrag in der Anlage Sonstiges.
 assert.match(laura,/Deutsche Depots · Anlage KAP/);assert.match(laura,/Zeile 10/);assert.match(laura,/Anlage Sonstiges/);assert.doesNotMatch(laura,/Anlage KAP-INV/);
 const father=taxPageHTML(s,{personId:'p1',year:2025});
 // Freistellungsauftrag bei der Direktbank nur teilweise genutzt: Erstattung über die Veranlagung.
 assert.match(father,/Erwartete Erstattung/);assert.match(father,/114,60/);
 assert.match(taxPageHTML(s,{personId:'p4',year:2026}),/Keine Erträge erfasst/);
 const unconfirmed=taxPageHTML({...s,years:{}},{personId:'p1',year:2026});
 assert.match(unconfirmed,/Jahresdaten 2026 bestätigen/);assert.match(unconfirmed,/data-form="year"/);assert.ok(unconfirmed.indexOf('data-form="year"')<unconfirmed.indexOf('Erträge 2026'),'unbestätigt: Jahresdaten zuerst');
});

test('entry turns a per-unit cost into the total, keeps an explicit zero and creates a new security',()=>{
 const s=demoState();
 const {event,newSecurity}=draftToEvent(s,{type:'opening',date:'2018-01-01',depotId:'d2',securityId:'__new',newName:'Alt-Fonds B',newIsin:'de0001112223',newKind:'mixedFund',quantity:'1.000',cost:'42,50',costMode:'unit',group:'pre2009',price2017:'78,20',oldIncomeNone:true});
 assert.equal(event.cost,'42500');assert.equal(event.oldIncome,'0');assert.equal(event.price2017,'78.2');assert.equal(newSecurity.isin,'DE0001112223');
 const next=apply(s,{type:'opening',date:'2018-01-01',depotId:'d2',securityId:'__new',newName:'Alt-Fonds B',newKind:'mixedFund',quantity:'1000',cost:'42,50',costMode:'unit',group:'pre2009',price2017:'78,20'}).next;
 assert.equal(next.events.at(-1).oldIncome,undefined,'ohne Angabe bleibt Alt-Ertrag unbekannt');
 assert.throws(()=>draftToEvent(s,{type:'buy',date:'2026-01-01',depotId:'d2',securityId:'',quantity:'1',amount:'1'}),/Wertpapier/);
 assert.throws(()=>draftToEvent(s,{type:'buy',date:'2026-01-01',depotId:'d2',securityId:'__new',newName:'Dup',newIsin:'DE000DEMO0001'}),/schon angelegt/);
});

test('the preview shows tax effects before saving and refuses impossible sales',()=>{
 const s=demoState();
 const sale=previewHTML(s,{type:'sell',date:'2026-10-20',depotId:'d1',securityId:'af',quantity:'500',amount:'65700'});
 assert.match(sale,/Alt-Anteile-Freibetrag anrechenbar/);assert.match(sale,/16\.612,33/);
 const gift=previewHTML(s,{type:'transfer',date:'2026-11-02',depotId:'d1',securityId:'af',quantity:'2000',toDepotId:'d3',kind:'gift',price:'131.40'});
 assert.match(gift,/Schenkungsteuer/);assert.match(gift,/5\.450,00/);
 assert.match(previewHTML(s,{type:'sell',date:'2026-10-20',depotId:'d1',securityId:'af',quantity:'999999',amount:'1'}),/nur 3750 Stück/);
 assert.throws(()=>apply(s,{type:'sell',date:'2026-10-20',depotId:'d1',securityId:'af',quantity:'999999',amount:'1'}),/vorhanden/);
});

test('decimal input accepts German notation and refuses garbage',()=>{
 assert.equal(decimalInput('1.234,56'),'1234.56');assert.equal(decimalInput('1234.5'),'1234.5');assert.equal(decimalInput('1.812.345,67'),'1812345.67');
 assert.equal(decimalInput(' 42,50 € '),'42.5');assert.equal(decimalInput(''),null);assert.equal(decimalInput('-19.000'),'-19000');
 // Deutscher Tausenderpunkt gegenüber Dezimalpunkt: der Faktor 1.000 darf nie still entstehen.
 assert.equal(decimalInput('1.000'),'1000');assert.equal(decimalInput('78.20'),'78.2');assert.equal(decimalInput('0.025'),'0.025');assert.equal(decimalInput('0,0253'),'0.0253');
 for(const stored of ['78.2','42500','1234.567','0.0253','-19000'])assert.equal(decimalInput(stored.replace('.',',')),stored,'Vorbelegung mit Komma liest sich zurück');
 assert.throws(()=>decimalInput('12a'),/kein gültiger Betrag/);
});

test('the Excel rows reproduce the yearly sheet',()=>{
 const s=ledgerSheet(),rows=sheetRows(s,'d1',{from:2026,to:2026});
 const closing=rows.filter(r=>String(r[0]).startsWith('Stand 31.12.2026')).map(r=>Number(r[7]).toFixed(2));
 assert.deepEqual(closing,['1585802.47','2730194.43']);
});

test('the running app is wired to the new renderers and nothing from version 3',async()=>{
 const app=await readFile(new URL('../dist/app.mjs',import.meta.url),'utf8'),html=await readFile(new URL('../dist/app.html',import.meta.url),'utf8');
 assert.match(html,/src="\/app.mjs"/);assert.match(html,/href="\/app.css"/);assert.doesNotMatch(html,/style\.css|workspace\.css/);
 for(const fn of ['sheetHTML','taxPageHTML','pricesHTML','giftsHTML','masterHTML','lockHTML','vaultPageHTML','entryFormHTML','workbook'])assert.match(app,new RegExp(`\\b${fn}\\(`),fn);
 assert.doesNotMatch(app,/engine\.mjs|experience\.mjs/);
 assert.match(app,/alias=\{tax:'steuer',family:'schenkungen',journal:'jahr'\}/);
 assert.match(app,/LOCK_AFTER=10\*60\*1000/);
 // Klicks im Dialog dürfen nicht vom Dialoghintergrund abgefangen werden – sonst
 // ließen sich Formulare per Maus weder speichern noch Häkchen setzen.
 assert.match(app,/if\(target\.dataset\.action==='close-overlay'\)\{if\(ev\.target===target\)closeModal\(\);return;\}/);
 assert.ok(app.indexOf("target.dataset.action==='close-overlay'")<app.indexOf('const action=actions[target.dataset.action]'),'Hintergrund wird vor der Aktionsauswahl behandelt');
 assert.doesNotMatch(app,/'close-overlay':/);
 assert.match(app,/addEventListener\('hashchange'/);
 // Zeitraum und Wertpapierauswahl reichen bis in Ansicht und Excel.
 assert.match(app,/el\.id==='from-year'/);assert.match(app,/el\.id==='to-year'/);assert.match(app,/el\.id==='security-filter'/);
 // Anfangs- und Endjahr stehen nebeneinander; die Kopfleiste zeigt auf der Übersicht kein zweites Jahr.
 assert.match(sheetHTML(demoState(),{year:2026,from:2024}),/<span>Zeitraum<\/span><select id="from-year"[^>]*>[^]*?<\/select><span class="sep">bis<\/span><select id="to-year"/);
 // Seitenleiste mit Personenmenü und Navigation; das Jahr wählt nur die Steuerseite.
 assert.match(app,/<aside class="sidebar">/);assert.match(app,/<details class="switcher">/);assert.doesNotMatch(app,/<header class="top">/);
 assert.match(app,/taxPageHTML\(state,\{personId,year:shownTaxYear\(\),years:taxYears\(\)\}\)/);
 const tax=taxPageHTML(demoState(),{personId:'p1',year:2026,years:[2026,2025]});assert.match(tax,/<select id="year"><option value="2026" selected>2026<\/option><option value="2025" >2025<\/option>/);
 // Meist eine Person: zuletzt gewählte, sonst die erste; „Alle“ bleibt wählbar.
 assert.match(app,/personId=null/);assert.match(app,/function preferredPerson\(\)/);assert.match(app,/personMenuHTML\(state,\{current,/);assert.match(app,/\['konten','Konten'\]/);
 const one=sheetHTML(demoState(),{year:2026,personId:'p1'});
 assert.match(one,/Alexander Weber · Jahresübersicht 2026/);assert.match(one,/class="kpi eco"[^]*378\.924,95 €/);assert.match(one,/class="kpi status supported" data-route="steuer"[^]*2\.993,78 €/);
 assert.doesNotMatch(sheetHTML(demoState(),{year:2026}),/kpi status/,'ohne Person kein Steuerjahr');
 // Der aktuelle Kurs ist freiwillig und als solcher gekennzeichnet.
 const prices=pricesHTML(demoState());assert.match(prices,/Aktuell <small>optional<\/small>/);assert.match(prices,/data-current[^>]*|placeholder="optional" data-current/);assert.match(prices,/„Aktuell“ muss nicht gepflegt werden/);
 assert.match(app,/sheetHTML\(state,\{year,from:fromYear,personId,view,securityId,depotId,lots:showLots\}\)/);assert.match(app,/el\.id==='show-lots'/);
 assert.match(app,/workbook\(state,year,await excel\(\),\{personId,from:fromYear,securityId,depotId\}\)/);
});

test('the overview may start before 2018, the tax page only offers model years from 2018',async()=>{
 const {withEvent}=await import('../dist/core/model.mjs'),{FIRST_TAX_YEAR}=await import('../dist/core/rules.mjs');
 assert.equal(FIRST_TAX_YEAR,2018);
 const s=withEvent(demoState(),{type:'buy',date:'2012-05-02',depotId:'d2',securityId:'etf',quantity:'100',amount:'4000'});
 // Übersicht: Zeitraum reicht bis zum ersten Vorgang zurück, ohne Steuerkachel vor 2018.
 const early=sheetHTML(s,{year:2016,from:2012,personId:'p1',view:'both'});
 assert.match(early,/<select id="from-year"[^>]*>[^]*<option value="2012" selected>2012<\/option><\/select>/);
 assert.doesNotMatch(early,/data-route="steuer"/);assert.match(early,/class="kpi tax"><span>Steuerliche Basis 31\.12\.2016/);
 assert.match(sheetHTML(s,{year:2018,from:2012,personId:'p1',view:'both'}),/data-route="steuer"/);
 // Steuerseite: Jahresliste endet bei 2018, die App zeigt bei früherem Endjahr 2018.
 assert.doesNotMatch(taxPageHTML(s,{personId:'p1',year:2018}),/<option value="2017"/);
 const app=await readFile(new URL('../dist/app.mjs',import.meta.url),'utf8');
 assert.match(app,/const shownTaxYear=\(\)=>Math\.max\(year,FIRST_TAX_YEAR\);/);
 assert.match(app,/taxPageHTML\(state,\{personId,year:shownTaxYear\(\),years:taxYears\(\)\}\)/);
 assert.match(app,/taxPdf\(state,personId\|\|state\.persons\[0\]\?\.id,shownTaxYear\(\),lib\)/);
});
