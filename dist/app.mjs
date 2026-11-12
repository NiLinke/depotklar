import {emptyState,validate,withEvent,withoutEvent,withoutBatch,withRecord,withoutRecord,withRelation,withYear,withYearRules,withPrice,withVapUnit,withVatRate,withClosing,closingPartners,closedThrough,today,firstWorkday,uid,lastSelectableYear,lastBookedYear,APP_VERSION} from './core/model.mjs';
import {replay} from './core/ledger.mjs';
import {fxReplay} from './core/fx.mjs';
import {demoState} from './core/sample.mjs';
import {newSession,seal,open,rekey,load,save,checkPassword,listVaults,getMeta,setMeta,remove,parseEnvelope,openBest,openWithSession,standOf,sameStand,fileChanged,fileRelation,fileAccess,filePermission,readFile as readVaultFile,writeFile as writeVaultFile} from './core/vault.mjs';
import {createSaver} from './ui/saver.mjs';
import {esc,decimalInput,inputValue,field} from './ui/format.mjs';
import {sheetHTML} from './ui/sheet.mjs';
import {accountsHTML} from './ui/accounts.mjs';
import {chooserHTML,entryFormHTML,newDraft,draftFromEvent,readDraft,previewHTML,apply,fillEcbRates,ENTRY_TITLES} from './ui/entry.mjs';
import {loadRates} from './ui/fxrates.mjs';
import {auditHTML,auditTarget,subject,changes} from './ui/audit.mjs';
import {undoPlan} from './core/undo.mjs';
import {templateWorkbook,readRows,planImport,importPreviewHTML} from './ui/importer.mjs';
import {closingHTML} from './ui/closing.mjs';
import {taxPageHTML} from './ui/taxpage.mjs';
import {pricesHTML,yearEndOf,yearStartOf,PRICE_YEARS} from './ui/prices.mjs';
import {giftsHTML} from './ui/gifts.mjs';
import {masterHTML} from './ui/master.mjs';
import {personMenuHTML,groupOf,tone,initials} from './ui/people.mjs';
import {lockHTML,vaultPageHTML,fileConflictHTML} from './ui/vaultui.mjs';
import {workbook,accountsWorkbook} from './ui/xlsx.mjs';
import {FIRST_TAX_YEAR} from './core/rules.mjs';
import {D,S,div} from './core/decimal.mjs';
import {securitiesPdf,overviewPdf,accountsPdf,taxPdf,auditPdf} from './ui/pdf.mjs';

const $=sel=>document.querySelector(sel),root=$('#app'),modalRoot=$('#modal-root'),toastRoot=$('#toast-root');
const ROUTES=[['jahr','Jahresübersicht'],['konten','Konten'],['steuer','Steuer'],['kurse','Kurse'],['schenkungen','Schenkungen'],['stammdaten','Stammdaten'],['protokoll','Protokoll'],['tresor','Tresor']];
const LOCK_AFTER=10*60*1000;
let state=null,session=null,demo=false,lockError='',busy=false;
// Tresore dieses Browsers; der geöffnete mit Verwaltungsangaben und gegebenenfalls verbundener Datei.
let vaults=[],vaultId=null,selectedVault=null,lockMode='open',vaultMeta=null,fileLink=null;
// Nicht gespeicherter Stand beim Sperren ohne Rückfrage (etwa automatisch nach zehn Minuten): verschlüsselt im
// Arbeitsspeicher, bis der Tresor wieder geöffnet wird; dann übernehmen, als Datei sichern oder verwerfen.
let rescue=null,rescueState=null;
const VAULT_KEY='depotklar.vault',FILE_TYPES=[{description:'Depotklar-Tresor (verschlüsselt)',accept:{'application/json':['.depotklar','.json']}}];
let route='jahr',year=Number(today().slice(0,4)),fromYear=year,securityId='',depotId='',vatYear=year,personId=null,view='both',auditFilter='',auditLimit=100,editing=null,savedAt=null,lockTimer=null,draft=null,previewTimer=null,pdfShown=null;
// Auf- und zugeklappte Blöcke der Seite „Konten“ (Kontoblatt, Lose, Jahres- und Monatszeilen): bleiben nach dem Speichern
// so, wie sie waren. Nur im Arbeitsspeicher, nicht im Tresor.
const openState=new Map();
// Erstes Jahr der Kurstabelle; null heißt die letzten zehn Jahre.
let pricesFrom=null;
// Eingelesene Excel-Datei bis zur Übernahme; gilt nur für den Stand, auf dem sie geprüft wurde.
let pendingImport=null;
// Verschlüsselung im Browser gibt es nur im sicheren Kontext (HTTPS oder localhost).
const secureContext=()=>Boolean(globalThis.isSecureContext&&globalThis.crypto?.subtle);
// Obergrenze für Excel-Dateien: eine Vorlage mit 1.000 Zeilen hat rund 100 KB; größere Dateien gar nicht erst entpacken.
const IMPORT_MAX_BYTES=5*1024*1024;
async function readImport(file){
 if(file.size>IMPORT_MAX_BYTES)throw Error(`${file.name} ist größer als 5 MB. Bitte nur das Blatt „Bewegungen“ verwenden oder die Datei aufteilen.`);
 const ExcelJS=await excel(),book=new ExcelJS.Workbook();
 try{await book.xlsx.load(await file.arrayBuffer());}catch{throw Error(`${file.name} lässt sich nicht als Excel-Datei (.xlsx) lesen.`);}
 const rows=readRows(book);if(!rows.length)throw Error(`${file.name}: keine Zeilen unter der Überschrift.`);
 await loadRates((state.accounts||[]).map(a=>a.currency));
 pendingImport=planImport(state,rows,{file:file.name});
 modal('Excel-Import · Vorschau',importPreviewHTML(pendingImport));
}

function toast(message,kind='info'){const el=document.createElement('div');el.className=`toast ${kind}`;el.textContent=message;toastRoot.replaceChildren(el);setTimeout(()=>el.remove(),kind==='error'?7000:3000);}
function modal(title,html){modalRoot.innerHTML=`<div class="overlay" data-action="close-overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="icon" data-action="close" aria-label="Schließen">×</button></header><div class="modal-body">${html}</div></div></div>`;modalRoot.querySelector('input:not([type=hidden]),select')?.focus();}
const closeModal=()=>{modalRoot.innerHTML='';draft=null;if(pdfShown){URL.revokeObjectURL(pdfShown.url);pdfShown=null;}};

// Jede Änderung: prüfen, rechnen lassen (eine Lücke im Bestand bricht hier ab), anzeigen, speichern.
function commit(next,message=''){
 validate(next);replay(next,{until:'9999-12-31'});fxReplay(next,{until:'9999-12-31'});
 state=next;render();if(message)toast(message);
 if(!demo)persist();
}
// Gespeichert wird je Änderung über einen eigenen Auftrag (ui/saver.mjs). Mit verbundener Datei
// prüft Depotklar vorher, ob sie anderswo geändert wurde, und schreibt sie danach.
const CONFLICT_SAVE='Die Datei hat einen anderen Stand als dieser Browser. Bis auf der Seite „Tresor“ entschieden ist, welcher Stand gilt, wird nur im Browser gespeichert.';
const saver=createSaver({seal,save,getSession:()=>session,setSession:s=>{session=s;},getVault:()=>vaultId,
 checkFile:async(id,previous)=>{
  // Im Konflikt wird die Datei nicht geschrieben; gespeichert wird dann nur im Browser.
  if(!fileLink?.handle||!fileLink.granted||fileLink.conflict)return;let current=null;try{current=await readVaultFile(fileLink.handle);}catch{return;}
  // Die Datei wurde anderswo geändert, während der Tresor offen ist: Die Änderung wird im Browser gespeichert, die Datei
  // bleibt, wie sie ist, und der Anwender entscheidet, welcher Stand gilt – wie beim Öffnen (persist meldet es).
  if(fileChanged(current,vaultMeta?.fileSeen||null,previous))fileLink={...fileLink,conflict:'both',fileRevision:current.revision,fresh:true};
 },
 writeFile:async(id,envelope)=>{
  if(!fileLink?.handle)return;
  if(fileLink.conflict)throw Error(CONFLICT_SAVE);
  if(!fileLink.granted)throw Error('Der Browser hat den Zugriff auf die Datei noch nicht erlaubt – auf der Tresorseite erlauben.');
  await writeVaultFile(fileLink.handle,envelope);await sawFile(id,envelope);
 }});
// Kennung, mit der dieser Browser die verbundene Datei zuletzt gelesen oder geschrieben hat. Weicht die Datei später
// davon ab, wurde sie anderswo geändert – dann überschreibt Depotklar nichts von selbst.
async function sawFile(id,envelope){
 const fileSeen=standOf(envelope);await setMeta(id,{fileSeen}).catch(()=>{});
 if(id===vaultId&&vaultMeta)vaultMeta={...vaultMeta,fileSeen};
}
const conflictDialog=()=>modal('Datei und Browser haben verschiedene Stände',`${fileConflictHTML(fileLink,session?.revision)}<p class="hint">Dieselben Schaltflächen stehen auf der Seite „Tresor“ unter „Datei“.</p>`);
const keptOf=(envelope,reason)=>({envelope,at:new Date().toISOString(),reason});
function persist(){
 saver.persist(state).then(()=>{
  if(saver.error)toast(saver.error,'error');
  else{savedAt=new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});setMeta(vaultId,{savedAt:new Date().toISOString()}).catch(()=>{});}
  // Eben entdeckt, dass die Datei anderswo geändert wurde: Die Änderung liegt im Browser, jetzt entscheidet der Anwender.
  // Ein offenes Formular bleibt stehen; dann genügt der Hinweis, die Entscheidung steht auf der Seite „Tresor“.
  if(fileLink?.fresh&&!saver.error){
   fileLink={...fileLink,fresh:false};
   if(modalRoot.innerHTML)toast(`Die Datei ${fileLink.name||''} wurde anderswo geändert. Gespeichert wird jetzt nur im Browser – auf der Seite „Tresor“ entscheiden, welcher Stand gilt.`,'error');else conflictDialog();
   if(route==='tresor')render();
  }
  showSaveState();
 });
 showSaveState();
}
// Seitenleiste: speichert, gespeichert, nicht gespeichert oder Datei nicht aktuell.
function saveStateText(){
 if(demo)return ['Demo · wird nicht gespeichert','demo'];
 if(saver.pending)return ['Speichert …','busy'];
 if(saver.error)return ['Nicht gespeichert','error'];
 if(saver.fileError||fileLink?.conflict)return ['Im Browser gespeichert · Datei nicht aktuell','warn'];
 return [`Gespeichert${savedAt?' '+savedAt:''}${fileLink?.handle&&fileLink.granted?' · auch in der Datei':''}`,''];
}
function showSaveState(){const el=$('#save-state');if(!el)return;const [text,cls]=saveStateText();el.textContent=text;el.className=`save-state${cls?' '+cls:''}`;}

// Die Steuerseite kennt nur Jahre des Modells; endet der Zeitraum früher, zeigt sie das erste.
const shownTaxYear=()=>Math.max(year,FIRST_TAX_YEAR);
function taxYears(){
 const last=lastSelectableYear(state);
 return Array.from({length:last-FIRST_TAX_YEAR+1},(_,i)=>last-i);
}
// Meist wird eine Person einzeln betrachtet: zuletzt gewählte Person (je Browser), sonst die erste.
const PERSON_KEY='depotklar.person';
function preferredPerson(){let saved=null;try{saved=localStorage.getItem(PERSON_KEY);}catch{}return saved===''||state.persons.some(p=>p.id===saved)?saved:state.persons[0]?.id||'';}
function choosePerson(id){personId=id;try{localStorage.setItem(PERSON_KEY,id);}catch{}render();}
// Lose im steuerlichen Blatt zeigen oder nicht: je Browser gemerkt, ohne Angabe an.
const LOTS_KEY='depotklar.lots';
let showLots=(()=>{try{return localStorage.getItem(LOTS_KEY)!=='0';}catch{return true;}})();
// Symbole der Navigation: schlichte Linien, Farbe vom Text.
const ICONS={
 jahr:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
 konten:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M15.5 15h2.5"/>',
 steuer:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 17l5-6"/><circle cx="10" cy="12" r=".9"/><circle cx="14" cy="16.2" r=".9"/>',
 kurse:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
 schenkungen:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8c-1-2.6-5-3.2-5-1.2 0 1.2 2.6 1.2 5 1.2zm0 0c1-2.6 5-3.2 5-1.2 0 1.2-2.6 1.2-5 1.2z"/>',
 stammdaten:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18.6 14.8c1.5.8 2.5 2.5 2.9 5.2"/>',
 protokoll:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 tresor:'<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>'
};
const icon=r=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[r]||''}</svg>`;
// Personenwahl als aufklappbares Menü mit vollem Namen; mit Gruppen nach Gruppen geordnet, bei vielen Personen mit
// Suchfeld (ui/people.mjs).
function personSwitcher(){
 if(!state.persons.length)return '';
 const current=route==='steuer'&&!personId?state.persons[0]?.id:personId,p=state.persons.find(x=>x.id===current);
 return `<details class="switcher"><summary aria-label="Person wechseln"><span class="avatar${p?tone(groupOf(state,p)):' all'}">${p?esc(initials(p.name)):'∑'}</span><span class="who"><small>Person</small><strong>${p?esc(p.name):'Alle Personen'}</strong></span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
  ${personMenuHTML(state,{current,all:route!=='steuer',allOn:personId===''})}</details>`;
}
// Suchfeld über einer Liste (Personenwahl, Tresorwahl): blendet aus, was nicht passt, ohne die Seite neu zu zeichnen.
function filterList(input){
 const box=input.closest('[data-searchable]');if(!box)return;
 const q=input.value.trim().toLocaleLowerCase('de');let hits=0;
 for(const el of box.querySelectorAll('[data-find]')){const hit=!q||el.dataset.find.includes(q);el.hidden=!hit;if(hit)hits++;}
 for(const group of box.querySelectorAll('[data-find-group]'))group.hidden=!group.querySelector('[data-find]:not([hidden])');
 const none=box.querySelector('[data-find-none]');if(none)none.hidden=hits>0;
}
function shell(content){
 const title=ROUTES.find(r=>r[0]===route)?.[1],person=state.persons.find(p=>p.id===personId);
 return `<div class="app-shell"><aside class="sidebar"><a class="brand" href="/">depotklar<span>.</span></a>
  ${personSwitcher()}
  <nav class="side-nav" aria-label="Bereiche">${ROUTES.map(([r,l])=>`<button data-route="${r}" aria-label="${l}" class="${route===r?'on':''}" ${route===r?'aria-current="page"':''}>${icon(r)}<span>${l}</span></button>`).join('')}</nav>
  <div class="side-foot">${!demo&&vaults.length>1?`<span class="vault-name">Tresor: ${esc(vaultMeta?.name||'Tresor')}</span>`:''}${(([text,cls])=>`<span id="save-state" class="save-state${cls?' '+cls:''}">${esc(text)}</span>`)(saveStateText())}<a href="/doku/" target="_blank" rel="noopener">Dokumentation</a><span>Depotklar ${APP_VERSION} · Modellrechnung, kein Steuerbescheid</span></div></aside>
  <div class="main-col">${demo?'<div class="demo-strip">Demo mit erfundenen Personen, Beständen und Kursen. <button class="link" data-action="leave-demo">Eigenen Tresor verwenden</button></div>':''}
  <div class="print-title">Depotklar · ${esc(title)} · ${route==='jahr'&&fromYear<year?`${fromYear}–${year}`:year}${person?' · '+esc(person.name):''}${route==='jahr'&&depotId?' · '+esc(state.depots.find(x=>x.id===depotId)?.name||''):''}${route==='jahr'&&securityId?' · '+esc(state.securities.find(x=>x.id===securityId)?.name||''):''} · Stand ${new Date().toLocaleDateString('de-DE')}</div>
  <main id="view">${content}</main></div></div>`;
}
function page(){
 if(route==='steuer')return taxPageHTML(state,{personId,year:shownTaxYear(),years:taxYears()});
 if(route==='kurse')return pricesHTML(state,{vatYear,from:pricesFrom});
 if(route==='schenkungen')return giftsHTML(state);
 if(route==='stammdaten')return masterHTML(state,{editing,open:openState});
 if(route==='protokoll')return auditHTML(state,{filter:auditFilter,limit:auditLimit});
 if(route==='tresor')return vaultPageHTML({demo,vault:{name:vaultMeta?.name||'Tresor'},revision:session?.revision,savedAt,backupRevision:vaultMeta?.backupRevision??null,fileAccess:fileAccess(),file:fileLink,error:saver.error,fileError:saver.fileError,
  kept:vaultMeta?.kept?.envelope?{revision:vaultMeta.kept.envelope.revision,reason:vaultMeta.kept.reason,when:new Date(vaultMeta.kept.at).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}:null});
 if(route==='konten')return accountsHTML(state,{year,from:fromYear,personId,open:openState});
 return sheetHTML(state,{year,from:fromYear,personId,view,securityId,depotId,lots:showLots});
}
function render(){
 // Bei vielen Tresoren bleibt der gewählte in der Liste sichtbar.
 if(!state){root.innerHTML=lockHTML({vaults,selected:selectedVault,mode:lockMode,error:lockError,busy,fileAccess:fileAccess(),secure:secureContext()});root.querySelector('.vault-list.long .vault-item.on')?.scrollIntoView({block:'nearest'});return;}
 const scroll=window.scrollY;
 if(personId===null||(personId&&!state.persons.some(p=>p.id===personId)))personId=preferredPerson();
 if(depotId&&!state.depots.some(d=>d.id===depotId&&(!personId||d.personId===personId)))depotId='';
 // Für die Druckansicht: Querformat nur auf der Jahresübersicht. Bewusst nicht
 // data-route: das ist das Merkmal der Navigation, jeder Klick würde sonst die Seite neu laden.
 document.body.dataset.page=route;
 try{root.innerHTML=shell(page());}catch(err){root.innerHTML=shell(`<div class="notice"><strong>Diese Ansicht konnte nicht berechnet werden.</strong><p>${esc(err.message)}</p></div>`);}
 window.scrollTo(0,scroll);
 // EZB-Kurse der verwendeten Währungen im Hintergrund laden; ein offenes Formular rechnet danach neu.
 loadRates((state.accounts||[]).map(a=>a.currency)).then(n=>{if(n&&modalRoot.querySelector('form[data-form="entry"]'))rerenderEntry();}).catch(()=>{});
}
function go(next){route=next;editing=null;history.pushState(null,'',`${location.search}#${route}`);render();window.scrollTo(0,0);}

// Aus dem Protokoll an die Stelle springen, an der der Gegenstand gepflegt wird: Vorgang im Formular, Stammdaten im
// Bearbeiten, Jahresdaten und Bescheinigungen auf der Steuerseite, Kurse und Jahreswerte unter „Kurse“.
function openFromAudit(a){
 const t=auditTarget(state,a);if(!t)return toast('Den Gegenstand gibt es nicht mehr. „Rückgängig“ stellt ihn wieder her, soweit möglich.','error');
 const mark=el=>{if(!el)return;el.scrollIntoView({block:'center'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),2400);};
 const at=(r,before=()=>{})=>{closeModal();route=r;editing=null;before();history.pushState(null,'',`${location.search}#${route}`);render();window.scrollTo(0,0);};
 const inYear=y=>{year=y;fromYear=y;};
 if(t.kind==='event'){const e=state.events.find(x=>x.id===t.id);if(e)openEntry(draftFromEvent(e,state));return;}
 if(t.kind==='record'){at('stammdaten',()=>{editing={collection:t.collection,id:t.id};});mark(document.querySelector(`form[data-form="${t.collection}"][data-id="${CSS.escape(t.id)}"]`));return;}
 if(t.kind==='tax'){at('steuer',()=>{personId=t.personId;inYear(t.year);});return;}
 if(t.kind==='ledger'){const d=state.depots.find(x=>x.id===t.depotId);at('jahr',()=>{personId=d?.personId??personId;inYear(t.year);});actions['ledger-check']({dataset:{depot:t.depotId}});return;}
 if(t.kind==='balance'){at('konten',()=>{inYear(t.year);});actions['balance-check']({dataset:{account:t.accountId}});return;}
 if(t.kind==='gifts'){at('schenkungen');return;}
 // Liegt das Jahr vor den gezeigten Kursspalten, beginnt die Tabelle mit ihm.
 if(t.kind==='prices'){at('kurse',()=>{if(t.year<lastBookedYear(state)-PRICE_YEARS+1)pricesFrom=t.year;});mark(document.querySelector(`[data-security="${CSS.escape(t.securityId)}"]`)?.closest('tr'));return;}
 if(t.kind==='vat'){at('kurse',()=>{vatYear=t.year;});mark(document.getElementById('ust-kurse'));return;}
 if(t.kind==='rules'){at('kurse');mark(document.getElementById('jahreswerte'));return;}
 if(t.kind==='closing'){modal('Jahresabschluss',closingHTML(state,{personId:t.personId,year}));}
}

function openEntry(d,error=''){draft=d;modal(d.existing?'Schenkung an mehrere ändern':d.id?'Vorgang ändern':ENTRY_TITLES[d.type],entryFormHTML(state,d,error));}
// Zeilen der Schenkung an mehrere: aktuellen Formularstand übernehmen, dann ändern.
function changeRows(change){const form=modalRoot.querySelector('form[data-form="entry"]');if(!form)return;const d={...draft,...readDraft(form)};d.rows=[...(d.rows||[])];change(d.rows);openEntry(d);}
function rerenderEntry(){const form=modalRoot.querySelector('form[data-form="entry"]');if(!form)return;const d={...draft,...readDraft(form)};openEntry(d);}

// PDF-Bibliothek erst bei Bedarf laden: jsPDF, danach das Tabellen-Plugin.
const script=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('PDF-Modul konnte nicht geladen werden.'));document.head.append(s);});
async function pdfLib(){
 if(!globalThis.jspdf)await script('/vendor/jspdf.umd.min.js');
 if(!globalThis.jspdf.jsPDF.API.autoTable&&!globalThis.autoTable)await script('/vendor/jspdf.plugin.autotable.min.js');
 const jsPDF=globalThis.jspdf.jsPDF;
 return {jsPDF,autoTable:(doc,o)=>globalThis.autoTable?globalThis.autoTable(doc,o):doc.autoTable(o)};
}
const slug=v=>v.replace(/[^\wäöüÄÖÜß-]+/g,'-');
async function pdfFile(kind,make,{period=true,person=state.persons.find(p=>p.id===personId),security=state.securities.find(x=>x.id===securityId),depot=state.depots.find(x=>x.id===depotId)}={}){
 try{const doc=make(await pdfLib());
  showPdf(`depotklar-${kind}${period?`-${fromYear<year?fromYear+'-':''}${year}`:''}${person?'-'+slug(person.name):''}${depot?'-'+slug(depot.name):''}${security?'-'+slug(security.name):''}.pdf`,doc.output('blob'));}
 catch(err){toast(err.message,'error');}
}
// Vorschau im PDF-Betrachter des Browsers, dort auch Drucken; gespeichert wird erst auf
// Wunsch. Ohne eingebauten Betrachter lädt der Browser PDFs nur herunter – dann gleich speichern.
const DOWNLOAD_ICON='<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
function showPdf(name,blob){
 if(!navigator.pdfViewerEnabled)return download(name,blob);
 closeModal();pdfShown={name,blob,url:URL.createObjectURL(blob)};
 modalRoot.innerHTML=`<div class="overlay pdf" data-action="close-overlay"><div class="modal pdf-preview" role="dialog" aria-modal="true" aria-label="PDF-Vorschau"><header><div><h2>Vorschau</h2><small>${esc(name)}</small></div><div class="toolbar-group"><button class="button primary" data-action="save-pdf">${DOWNLOAD_ICON}Speichern</button><button class="icon" data-action="close" aria-label="Schließen">×</button></div></header><iframe src="${pdfShown.url}#view=FitH" title="${esc(name)}"></iframe></div></div>`;
 modalRoot.querySelector('[data-action="save-pdf"]').focus();
}
async function excel(){
 if(globalThis.ExcelJS)return globalThis.ExcelJS;
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/vendor/exceljs.min.js';s.onload=resolve;s.onerror=()=>reject(Error('Excel-Modul konnte nicht geladen werden.'));document.head.append(s);});
 return globalThis.ExcelJS;
}
function download(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function startDemo(){state=demoState();demo=true;session=null;year=2026;fromYear=2026;securityId='';depotId='';personId=null;auditFilter='';auditLimit=100;history.replaceState(null,'',`?demo=1#${route}`);render();}
// Sperren wartet auf offene Speicherungen. Ohne verbundene Datei erinnert Depotklar an die
// Sicherung, wenn sich seit der letzten heruntergeladenen Sicherung etwas geändert hat.
async function lock({ask=false}={}){
 await saver.flush();
 const fileCurrent=fileLink?.handle&&fileLink.granted&&!fileLink.conflict&&!saver.fileError;
 if(ask&&state&&!demo&&session&&!fileCurrent&&session.revision>(vaultMeta?.backupRevision??0)){
  modal('Vor dem Sperren',`<p>Seit der letzten heruntergeladenen Sicherung hat sich der Tresor geändert${vaultMeta?.backupRevision?` (Sicherung: Revision ${vaultMeta.backupRevision}, jetzt ${session.revision})`:''}. Der Stand bleibt in diesem Browser gespeichert; eine Sicherungsdatei schützt zusätzlich, falls Browserdaten gelöscht werden.</p><div class="actions"><button class="button" data-action="lock-now">Ohne Sicherung sperren</button><button class="button primary" data-action="backup-lock">Sicherung herunterladen und sperren</button></div>`);
  return;
 }
 if(ask&&saver.error&&!confirm(`Die letzte Änderung ist nicht gespeichert:\n${saver.error}\n\nTrotzdem sperren? Die Änderung geht dann verloren.`))return;
 // Ohne ausdrückliche Bestätigung geht nichts verloren: den ungespeicherten Stand verschlüsselt aufbewahren.
 if(!ask&&saver.error&&state&&session&&!demo){try{rescue={vaultId,envelope:await seal(state,session),error:saver.error};}catch{}}
 state=null;session=null;pendingImport=null;demo=false;lockError='';closeModal();clearTimeout(lockTimer);vaultId=null;vaultMeta=null;fileLink=null;lockMode='open';saver.reset();
 try{vaults=await listVaults();}catch{}
 render();
}
function touch(){if(!state||demo)return;clearTimeout(lockTimer);lockTimer=setTimeout(()=>{lock().then(()=>toast('Nach zehn Minuten ohne Eingabe gesperrt.'));},LOCK_AFTER);}
// Sicherung erst nach allen offenen Speicherungen; sie enthält den gespeicherten Stand.
async function downloadBackup(){
 await saver.flush();
 if(saver.error)toast(`Achtung: Die letzte Änderung ist nicht gespeichert und fehlt in der Sicherung (${saver.error}).`,'error');
 const envelope=await load(vaultId);if(!envelope)return toast('Noch nichts gespeichert.','error');
 download(`depotklar-${slug(vaultMeta?.name||'tresor').toLowerCase()}-${today()}.depotklar`,new Blob([JSON.stringify(envelope)],{type:'application/json'}));
 await setMeta(vaultId,{backupRevision:envelope.revision});vaultMeta=await getMeta(vaultId);
 if(route==='tresor')render();
}
// Tresordatei oder Sicherung als eigenen Tresor aufnehmen. Gleiches Salz heißt derselbe Tresor (Kopie oder Datei eines
// anderen Geräts). Ein neuerer Stand ersetzt den im Browser nicht ungeprüft: Er wird vorgemerkt und beim nächsten Öffnen
// erst mit dem Passwort geöffnet. Lässt er sich nicht öffnen (beschädigt), bleibt der Stand im Browser.
async function addVault(envelope,{handle=null,name='Tresor'}={}){
 const list=await listVaults(),same=list.find(v=>v.salt&&v.salt===envelope.salt),label=String(name).replace(/\.(depotklar|json)$/i,'')||'Tresor';
 let id;
 if(same){
  id=same.id;const open=id===vaultId&&state,newer=envelope.revision>same.revision,local=await load(id),equal=sameStand(envelope,local);
  if(newer)await setMeta(id,{incoming:envelope});
  if(handle){
   // Abgeglichen ist die Datei nur, wenn sie genau den Stand dieses Browsers trägt; sonst klärt das nächste Öffnen, welcher gilt.
   await setMeta(id,{handle,fileName:handle.name,fileSeen:equal?standOf(envelope):null});
   if(open){vaultMeta=await getMeta(id);fileLink={handle,name:handle.name,granted:await filePermission(handle).catch(()=>false),conflict:!newer&&!equal?'both':null,fileRevision:envelope.revision};}
  }
  toast(newer&&open?'Die Datei ist neuer als der geöffnete Stand. Tresor sperren und neu öffnen: Depotklar prüft sie dann mit dem Passwort und übernimmt sie.'
   :newer?`„${same.name}“: Die Datei ist neuer als der Stand in diesem Browser. Beim nächsten Öffnen prüft Depotklar sie mit dem Passwort und übernimmt sie dann.`
   :`„${same.name}“ ist schon vorhanden${handle?' und jetzt mit der Datei verbunden':''}${envelope.revision<same.revision?` – hier mit neuerem Stand (Revision ${same.revision}, Datei ${envelope.revision}). Um zum älteren Stand der Datei zurückzukehren, den Tresor zuerst aus diesem Browser entfernen und die Datei dann erneut öffnen`:''}.`,newer&&open?'error':'info');
 }else{
  id=uid();await save(envelope,0,id);
  await setMeta(id,{name:label,createdAt:new Date().toISOString(),backupRevision:envelope.revision,...(handle?{handle,fileName:handle.name,fileSeen:standOf(envelope)}:{})});
  toast(`Tresor „${label}“ hinzugefügt${state?' – zum Öffnen „Tresor wechseln“':''}.`);
 }
 vaults=await listVaults();
 if(!state){selectedVault=id;lockMode='open';}
 render();
}

const actions={
 'close':closeModal,
 'entry':el=>{if(!state.depots.length){go('stammdaten');return toast('Zuerst ein Depot anlegen.');}modal('Vorgang erfassen',chooserHTML(el.dataset.depot));},
 'entry-type':el=>openEntry(newDraft(el.dataset.type,el.dataset.depot,state)),
 'entry-fx':el=>{const a=state.accounts.find(x=>x.id===el.dataset.account);if(a)openEntry({...newDraft('fx',a.depotId,state),accountId:a.id,depotId:a.depotId||''});},
 // Zinsen auf ein Währungskonto – mit Depot wie bisher, ohne Depot direkt am Konto.
 'entry-interest':el=>{const a=state.accounts.find(x=>x.id===el.dataset.account);if(a)openEntry({...newDraft('interest',a.depotId||'',state),depotId:a.depotId||'',fxAccount:a.id});},
 'person':el=>choosePerson(el.dataset.person),
 'fill-ecb':async el=>{
  const a=state.accounts.find(x=>x.id===el.dataset.account);if(!a)return;
  try{await loadRates([a.currency]);const r=fillEcbRates(state,a.id);
   if(!r.filled)return toast(`Keine EUR-Werte ergänzt – für die offenen Buchungen gibt es keinen EZB-Kurs oder das Jahr ist abgeschlossen.`,'error');
   if(!confirm(`${a.name}: ${r.filled} fehlende EUR-Werte mit EZB-Referenzkursen ergänzen? Jede Ergänzung steht im Protokoll und lässt sich beim Vorgang ändern.`))return;
   commit(r.next,`${r.filled} EUR-Werte ergänzt${r.left?`, ${r.left} weiter offen`:''}.`);
  }catch(err){toast(err.message,'error');}},
 'edit':el=>{const e=state.events.find(x=>x.id===el.dataset.id);if(e)openEntry(draftFromEvent(e,state));},
 'delete-event':el=>{const batch=el.dataset.batch;if(!confirm(batch?'Die Schenkung an alle Empfänger löschen? Die Änderung wird protokolliert.':'Diesen Vorgang löschen? Die Änderung wird protokolliert.'))return;try{commit(batch?withoutBatch(state,batch,{reason:'Gelöscht in der Oberfläche'}):withoutEvent(state,el.dataset.id,{reason:'Gelöscht in der Oberfläche'}),'Vorgang gelöscht.');closeModal();}catch(err){toast(err.message,'error');}},
 'batch-row-add':()=>changeRows(rows=>rows.push({})),
 'batch-row-remove':el=>changeRows(rows=>{rows.splice(Number(el.dataset.index),1);if(!rows.length)rows.push({});}),
 'batch-row-up':el=>changeRows(rows=>{const i=Number(el.dataset.index);if(i>0)[rows[i-1],rows[i]]=[rows[i],rows[i-1]];}),
 'closing':()=>modal('Jahresabschluss',closingHTML(state,{personId,year})),
 'audit-more':()=>{auditLimit+=100;render();},
 'all':el=>{const q=modalRoot.querySelector(`[name="${el.dataset.target||'quantity'}"]`);if(q){q.value=el.dataset.value;q.dispatchEvent(new Event('input',{bubbles:true}));}},
 'view':el=>{view=el.dataset.view;render();},
 // Alle Ausdrucke als PDF-Datei, zuerst in der Vorschau; der Dateiname nennt Inhalt,
 // Zeitraum, Person und ein gefiltertes Wertpapier.
 'save-pdf':()=>{if(pdfShown)download(pdfShown.name,pdfShown.blob);},
 'export-pdf':()=>pdfFile('wertpapierblaetter',lib=>securitiesPdf(state,{year,from:fromYear,personId,securityId,depotId},lib)),
 'export-pdf-accounts':()=>pdfFile('waehrungskonten',lib=>accountsPdf(state,{year,from:fromYear,personId},lib),{security:null,depot:null}),
 'export-xlsx-accounts':async()=>{try{const book=await accountsWorkbook(state,year,await excel(),{personId,from:fromYear}),person=state.persons.find(p=>p.id===personId);download(`depotklar-waehrungskonten-${fromYear<year?fromYear+'-':''}${year}${person?'-'+slug(person.name):''}.xlsx`,new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));}catch(err){toast(err.message,'error');}},
 // Jahres- und Monatszeilen der Lose: Kinder zeigen oder verbergen; eine geöffnete Monatszeile zeigt ihre Lose mit.
 'lots-year':el=>{
  const body=el.closest('tbody'),table=body.closest('table'),open=el.getAttribute('aria-expanded')!=='true';
  const show=(group,visible)=>{for(const b of table.querySelectorAll('tbody[data-parent]'))if(b.dataset.parent===group){b.hidden=!visible;if(b.dataset.group)show(b.dataset.group,visible&&b.querySelector('tr[data-action="lots-year"]')?.getAttribute('aria-expanded')==='true');}};
  el.setAttribute('aria-expanded',String(open));show(body.dataset.group,open);if(el.dataset.key)openState.set(el.dataset.key,open);
 },
 // Kontostand laut Kontoauszug zum Jahresende; Depotklar vergleicht ihn mit dem gebuchten Bestand.
 'balance-check':el=>{
  const a=state.accounts.find(x=>x.id===el.dataset.account);if(!a)return;
  const date=`${year}-12-31`,c=(state.balanceChecks||[]).find(x=>x.accountId===a.id&&x.date===date)||{};
  modal(`Kontostand laut Bank · ${a.name}`,`<form data-form="balance" data-account="${esc(a.id)}" ${c.id?`data-id="${esc(c.id)}"`:''}><p class="hint">Kontostand in ${esc(a.currency)} zum ${date.split('-').reverse().join('.')} laut Kontoauszug oder Jahresbescheinigung der Bank. Depotklar vergleicht ihn mit dem gebuchten Bestand; eine Differenz deutet auf eine fehlende oder falsch erfasste Bewegung.</p><div class="grid">${field('balance',`Kontostand ${a.currency}`,inputValue(c.balance),'inputmode="decimal" required')}${field('note','Notiz',c.note||'','maxlength="120"')}</div><div class="actions">${c.id?`<button type="button" class="button danger" data-action="delete-record" data-collection="balanceChecks" data-id="${esc(c.id)}">Entfernen</button>`:'<span></span>'}<button class="button primary">Speichern</button></div></form>`);
 },
 'audit-open':el=>{const a=state.audit[Number(el.dataset.index)];if(a)openFromAudit(a);},
 // Excel-Import: Vorlage mit den Konten und Auswahllisten; Übernahme erst nach der Vorschau.
 'import-template':async()=>{const person=state.persons.find(p=>p.id===personId),book=templateWorkbook(state,await excel(),{personId});download(`depotklar-vorlage-bewegungen${person?'-'+slug(person.name):''}.xlsx`,new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));},
 'import-apply':()=>{
  const p=pendingImport;if(!p?.next)return;
  if(p.base!==state){pendingImport=null;closeModal();return toast('Inzwischen hat sich etwas geändert. Bitte die Datei neu einlesen.','error');}
  pendingImport=null;commit(p.next,`${p.counts.new} ${p.counts.new===1?'Bewegung':'Bewegungen'} aus ${p.file} übernommen.`);closeModal();
 },
 // Zurücknehmen über dieselben Wege wie jede Änderung: geprüft, in abgeschlossenen Jahren gesperrt, selbst im Protokoll.
 'audit-undo':el=>{
  const i=Number(el.dataset.index),a=state.audit[i],p=undoPlan(state,i);if(!a)return;if(!p.ok)return toast(p.reason,'error');
  // Beim Import die betroffenen Bewegungen nennen, sonst die Felder der einen Änderung.
  const group=a.importId?state.audit.filter(x=>x.importId===a.importId&&x.at===a.at):null;
  const list=[...(group?group.map(x=>subject(state,x)):changes(state,a)).slice(0,6).map(x=>`· ${x}`),...(group&&group.length>6?[`· … ${group.length-6} weitere`]:[])].join('\n');
  if(!confirm(`${p.label}?\n\n${group?'':subject(state,a)}${list?`${group?'':'\n'}${list}`:''}${p.later?`\n\nAchtung: Danach wurde derselbe Gegenstand noch ${p.later}× geändert. Diese Änderungen gehen mit zurück.`:''}\n\nDie Rücknahme steht danach selbst im Protokoll.`))return;
  commit(p.run(state),'Zurückgenommen.');
 },
 'export-pdf-overview':()=>pdfFile('uebersicht',lib=>overviewPdf(state,{year,from:fromYear,personId,securityId,depotId},lib)),
 'export-pdf-tax':()=>pdfFile(`steuer-${shownTaxYear()}`,lib=>taxPdf(state,personId||state.persons[0]?.id,shownTaxYear(),lib),{period:false,person:state.persons.find(p=>p.id===personId)||state.persons[0],security:null,depot:null}),
 'export-pdf-audit':()=>pdfFile('protokoll',lib=>auditPdf(state,{filter:auditFilter},lib),{period:false,person:null,security:null,depot:null}),
 'export-xlsx':async()=>{try{const book=await workbook(state,year,await excel(),{personId,from:fromYear,securityId,depotId}),security=state.securities.find(x=>x.id===securityId),depot=state.depots.find(x=>x.id===depotId);download(`depotklar-uebersicht-${fromYear<year?fromYear+'-':''}${year}${depot?'-'+slug(depot.name):''}${security?'-'+slug(security.name):''}.xlsx`,new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  if(security)toast(`Excel: nur ${security.name} in den Depot-, Wertpapier- und Vorgangsblättern; Steuer, Schenkungen und Protokoll enthalten alles der Person.`);}catch(err){toast(err.message,'error');}},
 // Nicht gespeicherter Stand aus einer Sperre: übernehmen, als eigene Datei sichern oder verwerfen.
 'rescue-take':()=>{if(!rescueState)return;state=rescueState;rescueState=null;rescue=null;closeModal();persist();render();toast('Nicht gespeicherte Änderung übernommen.');},
 'rescue-file':()=>{if(!rescue)return;download(`depotklar-${slug(vaultMeta?.name||'tresor').toLowerCase()}-nicht-gespeichert-${today()}.depotklar`,new Blob([JSON.stringify(rescue.envelope)],{type:'application/json'}));toast('Gesichert. Die Datei lässt sich über „Datei öffnen“ als eigener Tresor öffnen – gleiches Passwort.');},
 'rescue-drop':()=>{if(!confirm('Die nicht gespeicherte Änderung endgültig verwerfen?'))return;rescue=null;rescueState=null;closeModal();toast('Verworfen.');},
 'ledger-check':el=>{const d=state.depots.find(x=>x.id===el.dataset.depot),date=`${year}-12-31`,c=state.ledgerChecks.find(x=>x.depotId===d.id&&x.date===date)||{};
  modal(`Buchhaltung · ${d.name}`,`<form data-form="ledger" data-depot="${esc(d.id)}" ${c.id?`data-id="${esc(c.id)}"`:''}><p class="hint">Saldo des Sachkontos${d.account?' '+esc(d.account):''} zum ${date.split('-').reverse().join('.')} laut Buchhaltung. Depotklar vergleicht ihn mit dem wirtschaftlichen Buchwert.</p><div class="grid">${field('balance','Saldo EUR',inputValue(c.balance),'inputmode="decimal" required')}${field('note','Notiz',c.note||'','maxlength="120"')}</div><div class="actions">${c.id?`<button type="button" class="button danger" data-action="delete-record" data-collection="ledgerChecks" data-id="${esc(c.id)}">Entfernen</button>`:'<span></span>'}<button class="button primary">Speichern</button></div></form>`);},
 'edit-record':el=>{editing={collection:el.dataset.collection,id:el.dataset.id};render();},
 'cancel-edit':()=>{editing=null;render();},
 'delete-record':el=>{if(!confirm('Eintrag löschen?'))return;try{commit(withoutRecord(state,el.dataset.collection,el.dataset.id),'Gelöscht.');closeModal();}catch(err){toast(err.message,'error');}},
 'demo':startDemo,'demo-reset':()=>{state=demoState();render();toast('Demo zurückgesetzt.');},
 'leave-demo':()=>{demo=false;state=null;lockMode=vaults.length?'open':'create';render();},
 'lock':()=>lock({ask:true}),
 'lock-now':()=>{closeModal();return lock();},
 'backup-lock':async()=>{await downloadBackup();closeModal();await lock();},
 'switch-vault':()=>lock({ask:true}),
 'download-backup':downloadBackup,
 // Nach der Wahl steht die Eingabe im Passwortfeld – auch nach der Suche mit der Eingabetaste.
 'choose-vault':el=>{selectedVault=el.dataset.vault;lockError='';render();root.querySelector('form[data-form="unlock"] input[name="password"]')?.focus();},
 'new-vault':()=>{lockMode='create';lockError='';render();},
 'cancel-create':()=>{lockMode='open';lockError='';render();},
 'delete-vault':async el=>{
  const v=vaults.find(x=>x.id===el.dataset.vault);if(!v)return;
  if(!confirm(`Tresor „${v.name}“ aus diesem Browser entfernen?\n\n${v.linked?'Die verbundene Datei bleibt erhalten und lässt sich wieder öffnen.':'Ohne Sicherungsdatei sind die Daten danach endgültig weg.'}`))return;
  await remove(v.id);vaults=await listVaults();selectedVault=vaults[0]?.id||null;lockMode=vaults.length?'open':'create';render();toast(`„${v.name}“ entfernt.`);
 },
 // Dateizugriff (Chrome, Edge): Tresordatei öffnen, verbinden, Verbindung lösen, Zugriff erlauben.
 'open-file':async()=>{
  let handle;try{[handle]=await window.showOpenFilePicker({types:FILE_TYPES,multiple:false});}catch(err){if(err.name==='AbortError')return;throw err;}
  const envelope=await readVaultFile(handle);if(!envelope)throw Error('Die Datei ist leer.');await addVault(envelope,{handle,name:handle.name});
 },
 'link-file':async()=>{
  let handle;try{handle=await window.showSaveFilePicker({suggestedName:`${slug(vaultMeta?.name||'Tresor')}.depotklar`,types:FILE_TYPES});}catch(err){if(err.name==='AbortError')return;throw err;}
  await saver.flush();const envelope=await load(vaultId);await writeVaultFile(handle,envelope);
  // Eine gescheiterte Speicherung gilt erst als erledigt, wenn der aktuelle Stand gespeichert ist.
  const unsaved=saver.error;
  await setMeta(vaultId,{handle,fileName:handle.name,fileSeen:standOf(envelope)});vaultMeta=await getMeta(vaultId);fileLink={handle,name:handle.name,granted:true,conflict:null};saver.reset();if(unsaved)persist();render();toast(`Mit ${handle.name} verbunden.`);
 },
 'unlink-file':async()=>{const unsaved=saver.error;await setMeta(vaultId,{handle:null,fileName:null,fileSeen:null});vaultMeta=await getMeta(vaultId);fileLink=null;saver.reset();if(unsaved)persist();closeModal();render();toast('Verbindung gelöst. Die Datei bleibt erhalten.');},
 'grant-file':async()=>{
  if(!fileLink?.handle)return;fileLink.granted=await filePermission(fileLink.handle,true).catch(()=>false);
  if(fileLink.granted&&!fileLink.conflict){
   await saver.flush();const current=await readVaultFile(fileLink.handle).catch(()=>null),local=await load(vaultId),relation=fileRelation({local,file:current,seen:vaultMeta?.fileSeen||null});
   // Beide geändert: nichts überschreiben, der Anwender entscheidet. Nur die Datei geändert: nach dem Neuöffnen gilt sie.
   if(relation==='both'){fileLink={...fileLink,conflict:'both',fileRevision:current.revision};conflictDialog();}
   else if(relation==='fileAhead')toast('Die Datei wurde anderswo geändert – Tresor sperren und neu öffnen: Depotklar prüft dann, welcher Stand gilt.','error');
   else{if(relation!=='same')await writeVaultFile(fileLink.handle,local);await sawFile(vaultId,local);saver.reset();toast(relation==='same'?'Zugriff erlaubt. Die Datei hat den Stand dieses Browsers.':'Datei verbunden und aktualisiert.');}
  }
  render();
 },
 // Datei und Browser haben verschiedene Stände: ausdrücklich entscheiden, welcher gilt.
 'file-take':async()=>{
  if(!fileLink?.handle||!fileLink.conflict)return;
  const file=await readVaultFile(fileLink.handle).catch(()=>null);if(!file)return toast('Die Datei lässt sich nicht lesen.','error');
  if(!confirm(`Den Stand der Datei ${fileLink.name||''} (Revision ${file.revision}) übernehmen?\n\nDie Änderungen dieses Browsers seit dem letzten Abgleich gelten dann nicht mehr. Der jetzige Stand wird aufbewahrt und lässt sich auf der Seite „Tresor“ wiederherstellen.`))return;
  await saver.flush();const opened=await openWithSession(file,session),local=await load(vaultId);
  await save(file,local?.revision||0,vaultId);
  await setMeta(vaultId,{fileSeen:standOf(file),...(local?{kept:keptOf(local,'Stand dieses Browsers, bevor der Stand der verbundenen Datei übernommen wurde')}:{})});
  state=opened.state;session=opened.session;vaultMeta=await getMeta(vaultId);fileLink={...fileLink,conflict:null};saver.reset();closeModal();render();toast('Stand der Datei übernommen. Der bisherige Stand ist aufbewahrt.');
 },
 'file-overwrite':async()=>{
  if(!fileLink?.handle||!fileLink.granted||!fileLink.conflict)return;
  if(!confirm(`Die Datei ${fileLink.name||''} mit dem Stand dieses Browsers überschreiben?\n\nWas anderswo in die Datei gespeichert wurde, geht dabei verloren.`))return;
  await saver.flush();const unsaved=saver.error,local=await load(vaultId);await writeVaultFile(fileLink.handle,local);await sawFile(vaultId,local);
  fileLink={...fileLink,conflict:null};saver.reset();if(unsaved)persist();closeModal();render();toast('Datei überschrieben. Sie hat jetzt den Stand dieses Browsers.');
 },
 // Aufbewahrter Stand: herunterladen, verwerfen oder mit dem jetzigen tauschen.
 'kept-download':()=>{const k=vaultMeta?.kept;if(!k)return;download(`depotklar-${slug(vaultMeta?.name||'tresor').toLowerCase()}-aufbewahrt-revision-${k.envelope.revision}.depotklar`,new Blob([JSON.stringify(k.envelope)],{type:'application/json'}));},
 'kept-drop':async()=>{if(!vaultMeta?.kept||!confirm('Den aufbewahrten Stand endgültig verwerfen?'))return;await setMeta(vaultId,{kept:null});vaultMeta=await getMeta(vaultId);render();toast('Verworfen.');},
 'kept-restore':async()=>{
  const k=vaultMeta?.kept;if(!k)return;
  if(!confirm(`Den aufbewahrten Stand (Revision ${k.envelope.revision}) wiederherstellen?\n\nDer jetzige Stand wird dafür aufbewahrt – der Tausch lässt sich also zurücknehmen.`))return;
  await saver.flush();if(saver.error)throw Error('Zuerst muss die letzte Änderung gespeichert sein.');
  const opened=await openWithSession(k.envelope,session),local=await load(vaultId);
  await save(k.envelope,local?.revision||0,vaultId);
  await setMeta(vaultId,{kept:local?keptOf(local,'Stand vor dem Wiederherstellen des aufbewahrten Stands'):null});
  // Eine verbundene Datei bekommt den wiederhergestellten Stand gleich mit, sofern kein Konflikt offen ist.
  if(fileLink?.handle&&fileLink.granted&&!fileLink.conflict)await writeVaultFile(fileLink.handle,k.envelope).then(()=>sawFile(vaultId,k.envelope)).catch(err=>toast(`Datei nicht aktualisiert: ${err.message}`,'error'));
  state=opened.state;session=opened.session;vaultMeta=await getMeta(vaultId);saver.reset();render();toast('Aufbewahrter Stand wiederhergestellt. Der vorherige Stand ist aufbewahrt.');
 },
 // Rettung bei einem Konflikt: den Stand im Arbeitsspeicher in eine neue Datei schreiben.
 'save-as-file':async()=>{
  let handle;try{handle=await window.showSaveFilePicker({suggestedName:`${slug(vaultMeta?.name||'Tresor')}-${today()}.depotklar`,types:FILE_TYPES});}catch(err){if(err.name==='AbortError')return;throw err;}
  await writeVaultFile(handle,await seal(state,session));toast(`Gespeichert in ${handle.name}. Zum Weiterarbeiten sperren und diese Datei öffnen.`);
 },
};

const forms={
 entry:form=>{
  const d={...draft,...readDraft(form)};
  try{const r=apply(state,d);commit(r.next,d.id||d.existing?'Vorgang geändert.':'Vorgang gespeichert.');closeModal();}
  catch(err){openEntry(d,err.message);}
 },
 // Abschluss je Person; „Alle Personen“ schließt jede ab, die noch nicht so weit ist.
 closing:form=>{const f=new FormData(form),y=Number(f.get('year')),id=String(f.get('personId')||''),chosen=(id?[id]:state.persons.map(p=>p.id)).filter(p=>(closedThrough(state,p)??2017)<y),ids=[...new Set(chosen.flatMap(p=>[p,...closingPartners(state,p,y).keys()]))],names=ids.map(p=>state.persons.find(x=>x.id===p)?.name).join(', ');
  if(!ids.length||!confirm(`${names}: alle Jahre bis einschließlich ${y} abschließen? Danach lassen sich ihre Vorgänge, Kurse und Jahresdaten bis zum 31.12.${y} nicht mehr ändern.`))return;
  commit(ids.reduce((next,p)=>withClosing(next,p,y),state),`Abgeschlossen bis ${y}: ${names}.`);closeModal();},
 reopen:form=>{const f=new FormData(form),y=Number(f.get('year')),id=String(f.get('personId')||'');commit(withClosing(state,id,y>2018?y-1:null,{reason:String(f.get('reason')||'')}),`${state.persons.find(p=>p.id===id)?.name||'Person'}: ab ${y} wieder geöffnet.`);closeModal();},
 year:form=>{
  const f=new FormData(form),values={churchRate:f.get('churchRate')};
  if(f.get('jointWith'))values.jointWith=f.get('jointWith');
  // Vorträge und anderweitig genutzter Pauschbetrag sind Pflicht (0, wenn keine); der Rest-Freibetrag darf offen bleiben.
  for(const [k,label] of [['stockLossCarry','Aktienverlustvortrag'],['otherLossCarry','Sonstigen Verlustvortrag'],['externalAllowance','Anderweitig genutzten Sparer-Pauschbetrag']]){values[k]=decimalInput(f.get(k));if(values[k]==null)throw Error(`${label} eintragen – 0, wenn es keinen gibt.`);}
  const rest=decimalInput(f.get('protectedRemaining'));if(rest!=null)values.protectedRemaining=rest;
  const change=f.get('churchChange'),month=Number(f.get('churchMonth'));
  if(change==='exit')values.churchUntil=month;if(change==='entry')values.churchFrom=month;
  if(form.querySelector('[name="foreignDeclared"]'))values.foreignDeclared=f.has('foreignDeclared');
  commit(withYear(state,form.dataset.person,Number(form.dataset.year),values),'Jahresdaten bestätigt.');
 },
 certificate:form=>{
  const f=new FormData(form),c={id:form.dataset.id||undefined,personId:form.dataset.person,bank:form.dataset.bank,year:Number(form.dataset.year),lossCertificate:f.has('lossCertificate')};
  for(const k of ['capitalTax','solidarity','churchTax','certifiedStockLoss','certifiedOtherLoss']){const v=decimalInput(f.get(k));if(v!=null)c[k]=v;}
  if(!c.lossCertificate){delete c.certifiedStockLoss;delete c.certifiedOtherLoss;}
  commit(withRecord(state,'certificates',c),'Bescheinigung gespeichert.');
 },
 balance:form=>{const f=new FormData(form),v=decimalInput(f.get('balance'));if(v==null)throw Error('Kontostand eintragen.');commit(withRecord(state,'balanceChecks',{id:form.dataset.id||undefined,accountId:form.dataset.account,date:`${year}-12-31`,balance:v,...(String(f.get('note')||'').trim()?{note:String(f.get('note')).trim()}:{})}),'Kontostand gespeichert.');closeModal();},
 ledger:form=>{const f=new FormData(form);commit(withRecord(state,'ledgerChecks',{id:form.dataset.id||undefined,depotId:form.dataset.depot,date:`${year}-12-31`,balance:decimalInput(f.get('balance')),note:String(f.get('note')||'')}),'Saldo gespeichert.');closeModal();},
 // Verwandtschaft über withRelation: geprüft und mit Eintrag im Protokoll wie jede andere Änderung.
 relation:form=>{const kind=new FormData(form).get('kind'),next=withRelation(state,form.dataset.donor,form.dataset.recipient,kind||null);if(next!==state)commit(next,kind?'Verhältnis gespeichert.':'Verhältnis aufgehoben.');},
 'relation-new':form=>{const f=new FormData(form),next=withRelation(state,f.get('donorId'),f.get('recipientId'),f.get('kind'));if(next!==state)commit(next,'Verhältnis angelegt.');else toast('Dieses Verhältnis besteht schon.');},
 'prior-gift':form=>{const f=new FormData(form),g={donorId:form.dataset.donor,recipientId:form.dataset.recipient,date:f.get('date'),value:decimalInput(f.get('value')),note:String(f.get('note')||'')};const t=decimalInput(f.get('taxPaid'));if(t!=null)g.taxPaid=t;commit(withRecord(state,'priorGifts',g),'Vorerwerb gespeichert.');},
 // Die Gruppe ist freiwillig; „keine“ entfernt die Zuordnung.
 persons:form=>{const f=new FormData(form),{groupId:_,...was}=state.persons.find(p=>p.id===form.dataset.id)||{},groupId=f.get('groupId');commit(withRecord(state,'persons',{...was,id:form.dataset.id||undefined,name:String(f.get('name')).trim(),...(groupId?{groupId}:{})}),'Person gespeichert.');editing=null;render();},
 personGroups:form=>{const f=new FormData(form);commit(withRecord(state,'personGroups',{id:form.dataset.id||undefined,name:String(f.get('name')).trim(),color:f.get('color')}),'Gruppe gespeichert.');editing=null;render();},
 depots:form=>{const f=new FormData(form);commit(withRecord(state,'depots',{id:form.dataset.id||undefined,personId:f.get('personId'),name:String(f.get('name')).trim(),bank:String(f.get('bank')).trim(),account:String(f.get('account')||'').trim(),abroad:f.has('abroad')}),'Depot gespeichert.');editing=null;render();},
 accounts:form=>{
  const f=new FormData(form),[ownerKind,ref]=String(f.get('owner')||'').split(':');
  // Bei einem Depot gelten dessen Inhaber und Bank; ein eigenständiges Konto braucht beides selbst.
  const where=ownerKind==='depot'?{depotId:ref}:{personId:ref,bank:String(f.get('bank')||'').trim(),abroad:f.has('abroad')};
  commit(withRecord(state,'accounts',{id:form.dataset.id||undefined,name:String(f.get('name')).trim(),currency:String(f.get('currency')||'').trim().toUpperCase(),kind:f.get('kind'),...(f.get('bookRate')==='vat'?{vatBook:true}:{}),...where}),'Währungskonto gespeichert.');editing=null;render();
 },
 securities:form=>{const f=new FormData(form);commit(withRecord(state,'securities',{id:form.dataset.id||undefined,name:String(f.get('name')).trim(),isin:String(f.get('isin')||'').trim().toUpperCase(),kind:f.get('kind')}),'Wertpapier gespeichert.');editing=null;render();},
 unlock:async form=>{
  busy=true;lockError='';render();
  try{
   const id=form.dataset.vault||selectedVault,meta=await getMeta(id).catch(()=>null),local=await load(id);
   let link=null,file=null;
   // Verbundene Datei: Zugriff erfragen (der Klick auf Öffnen erlaubt die Rückfrage) und lesen.
   if(meta?.handle){
    const granted=await filePermission(meta.handle,true).catch(()=>false);link={handle:meta.handle,name:meta.fileName,granted};
    if(granted)file=await readVaultFile(meta.handle).catch(()=>null);
   }
   const incoming=meta?.incoming||null;
   if(!local&&!file&&!incoming)throw Error('Für diesen Tresor ist nichts gespeichert.');
   // Welcher Stand gilt, entscheidet openBest: Ein Stand aus einer Datei erst, wenn er sich mit dem Passwort öffnen ließ.
   const password=new FormData(form).get('password'),opened=await openBest({local,file,incoming,seen:meta?.fileSeen||null,password});
   const fromFile=opened.source!=='local',patch={};
   if(fromFile){
    await save(opened.envelope,local?.revision||0,id);
    // Trug der Browser eigene Änderungen, bleibt sein bisheriger Stand aufbewahrt (Seite „Tresor“).
    if(opened.keepLocal)patch.kept=keptOf(local,opened.source==='incoming'?'Stand dieses Browsers, bevor die eingelesene Datei übernommen wurde':'Stand dieses Browsers, bevor der Stand der verbundenen Datei übernommen wurde');
   }
   if(incoming)patch.incoming=null;
   if(file&&sameStand(file,opened.envelope))patch.fileSeen=standOf(file);
   if(Object.keys(patch).length)await setMeta(id,patch);
   state=opened.state;session=opened.session;vaultId=id;selectedVault=id;vaultMeta=(await getMeta(id).catch(()=>null))||meta||{name:'Tresor'};demo=false;savedAt=null;saver.reset();
   fileLink=link?{...link,conflict:opened.conflict,fileRevision:file?.revision??null}:null;
   try{localStorage.setItem(VAULT_KEY,id);}catch{}
   go(location.hash.slice(1)&&ROUTES.some(r=>r[0]===location.hash.slice(1))?location.hash.slice(1):'jahr');touch();
   let dialog=false;
   if(rescue?.vaultId===id){try{rescueState=(await open(rescue.envelope,password)).state;dialog=true;
    modal('Nicht gespeicherte Änderung',`<p>Beim Sperren war eine Änderung nicht gespeichert (${esc(rescue.error)}). Depotklar hat diesen Stand verschlüsselt aufbewahrt, solange der Browser offen ist.</p><p>„Übernehmen“ ersetzt den eben geöffneten Stand${opened.source==='file'?' aus der Datei':''}. Im Zweifel zuerst als eigene Datei sichern.</p><div class="actions"><button class="button" data-action="rescue-drop">Verwerfen</button><button class="button" data-action="rescue-file">Als Datei sichern</button><button class="button primary" data-action="rescue-take">Übernehmen</button></div>`);}catch{}}
   if(opened.conflict){if(!dialog)conflictDialog();}
   else if(opened.failed.includes('incoming'))toast('Die eingelesene Datei ließ sich mit diesem Passwort nicht öffnen und wurde nicht übernommen. Geöffnet ist der Stand dieses Browsers.','error');
   else if(opened.source==='file')toast(opened.keepLocal?'Stand der Datei übernommen. Der bisherige Stand dieses Browsers ist aufbewahrt (Seite „Tresor“).':'Neuerer Stand aus der Datei übernommen.');
   else if(opened.source==='incoming')toast(opened.keepLocal?'Stand der eingelesenen Datei übernommen. Der bisherige Stand dieses Browsers ist aufbewahrt (Seite „Tresor“).':'Stand der eingelesenen Datei übernommen.');
   else if(link&&!link.granted)toast('Zugriff auf die Datei nicht erlaubt – auf der Tresorseite erlauben.','error');
  }
  catch(err){lockError=err.message;}finally{busy=false;if(!state)render();}
 },
 create:async form=>{
  const f=new FormData(form),pw=f.get('password'),name=String(f.get('name')||'').trim()||'Tresor';
  if(pw!==f.get('repeat')){lockError='Die Passwörter stimmen nicht überein.';return render();}
  busy=true;lockError='';render();
  try{
   checkPassword(pw);const id=uid();session=await newSession(pw);state=emptyState();const envelope=await seal(state,session);
   await save(envelope,0,id);await setMeta(id,{name,createdAt:new Date().toISOString()});session={...session,revision:envelope.revision};
   vaultId=id;selectedVault=id;vaultMeta=await getMeta(id);fileLink=null;demo=false;lockMode='open';saver.reset();vaults=await listVaults();
   try{localStorage.setItem(VAULT_KEY,id);}catch{}
   go('stammdaten');touch();toast(`Tresor „${name}“ angelegt. Jetzt Personen und Depots anlegen.`);
  }
  catch(err){lockError=err.message;state=null;session=null;}finally{busy=false;if(!state)render();}
 },
 rekey:async form=>{
  const f=new FormData(form);if(f.get('next')!==f.get('repeat'))throw Error('Die neuen Passwörter stimmen nicht überein.');
  await saver.flush();if(saver.error)throw Error('Zuerst muss die letzte Änderung gespeichert sein.');
  const current=await load(vaultId),linked=fileLink?.handle&&fileLink.granted&&!fileLink.conflict;
  if(linked){const file=await readVaultFile(fileLink.handle).catch(()=>null);if(fileChanged(file,vaultMeta?.fileSeen||null,current.revision))throw Error('Die verbundene Datei wurde anderswo geändert. Zuerst den Tresor sperren und neu öffnen, dann das Passwort ändern.');}
  const changed=await rekey(current,f.get('current'),f.get('next'));
  await save(changed.envelope,current.revision,vaultId);session=changed.session;
  if(linked)await writeVaultFile(fileLink.handle,changed.envelope).then(()=>sawFile(vaultId,changed.envelope)).catch(err=>toast(`Datei nicht aktualisiert: ${err.message}`,'error'));
  toast('Passwort geändert. Ältere Sicherungsdateien behalten das bisherige Passwort.');form.reset();
 },
 'vault-name':async form=>{
  const name=String(new FormData(form).get('name')||'').trim();if(!name)throw Error('Name fehlt.');
  await setMeta(vaultId,{name});vaultMeta=await getMeta(vaultId);vaults=await listVaults();render();toast('Tresor umbenannt.');
 }
};

document.addEventListener('click',ev=>{
 // Offenes Personenmenü schließt bei Klick daneben.
 for(const d of document.querySelectorAll('details.switcher[open]'))if(!d.contains(ev.target))d.open=false;
 const target=ev.target.closest('[data-route],[data-action]');if(!target||target.matches('input[type=file]'))return;
 // Der Hintergrund des Dialogs schließt nur bei Klick auf ihn selbst. Klicks im
 // Dialog (Speichern, Häkchen) dürfen hier weder abgefangen noch verhindert werden.
 if(target.dataset.action==='close-overlay'){if(ev.target===target)closeModal();return;}
 if(target.dataset.route){ev.preventDefault();closeModal();go(target.dataset.route);return;}
 const action=actions[target.dataset.action];if(action){ev.preventDefault();Promise.resolve(action(target,ev)).catch(err=>toast(err.message,'error'));}
});
document.addEventListener('keydown',ev=>{
 if(ev.key==='Escape'&&modalRoot.innerHTML)closeModal();
 // Suchfeld: Eingabe wählt den ersten Treffer; Escape schließt die Personenwahl.
 if(ev.key==='Enter'&&ev.target.matches?.('[data-search]')){ev.preventDefault();ev.target.closest('[data-searchable]')?.querySelector('[data-find]:not([hidden])')?.click();}
 if(ev.key==='Escape'){const menu=ev.target.closest?.('details.switcher[open]');if(menu){menu.open=false;menu.querySelector('summary')?.focus();}}
 if(ev.key==='Enter'&&ev.target.matches('tr.click'))ev.target.click();
 touch();
});
document.addEventListener('submit',ev=>{
 const form=ev.target.closest('form[data-form]');if(!form)return;ev.preventDefault();
 Promise.resolve().then(()=>forms[form.dataset.form]?.(form)).catch(err=>{if(form.dataset.form==='unlock'||form.dataset.form==='create'){lockError=err.message;render();}else toast(err.message,'error');});
});
document.addEventListener('change',ev=>{
 const el=ev.target;touch();
 // Ein einzelnes Jahr folgt dem gewählten Jahr; ein Zeitraum behält seinen Beginn.
 if(el.id==='year'){const next=Number(el.value);if(fromYear===year)fromYear=next;year=next;if(fromYear>year)fromYear=year;render();return;}
 if(el.id==='from-year'){fromYear=Math.min(Number(el.value),year);render();return;}
 // Im Zeitraum bleibt der Beginn stehen; liegt er danach, rückt er mit.
 if(el.id==='to-year'){year=Number(el.value);if(fromYear>year)fromYear=year;render();return;}
 if(el.id==='security-filter'){securityId=el.value;render();return;}
 if(el.id==='depot-filter'){depotId=el.value;render();return;}
 if(el.id==='vat-year'){vatYear=Number(el.value);render();return;}
 if(el.id==='prices-from'){pricesFrom=Number(el.value);render();return;}
 // Jahreswerte: Basiszins in Prozent eingegeben, gespeichert als Anteil wie in den BMF-Tabellen (2,53 → 0.0253).
 if(el.matches('[data-year-rule]')){
  try{
   const y=Number(el.dataset.year),line=el.closest('tr'),value=key=>decimalInput(line.querySelector(`[data-year-rule="${key}"]`)?.value??''),pct=value('baseRate');
   commit(withYearRules(state,y,{allowance:value('allowance'),baseRate:pct==null?null:S(div(D(pct),D('100')))}),`Jahreswerte ${y} gespeichert.`);
  }catch(err){toast(err.message,'error');}
  return;
 }
 if(el.matches('[data-vat-rate]')){
  try{const value=decimalInput(el.value);commit(withVatRate(state,el.dataset.currency,el.dataset.month,value),value==null?'USt-Umrechnungskurs gelöscht.':'USt-Umrechnungskurs gespeichert.');}catch(err){toast(err.message,'error');}
  return;
 }
 if(el.id==='show-lots'){showLots=el.checked;try{localStorage.setItem(LOTS_KEY,showLots?'1':'0');}catch{}render();return;}
 if(el.id==='audit-filter'){auditFilter=el.value;auditLimit=100;render();return;}
 if(el.matches('[data-closing-year],[data-closing-person]')){const box=el.closest('.closing');modal('Jahresabschluss',closingHTML(state,{personId:box.querySelector('[data-closing-person]').value,year:Number(box.querySelector('[data-closing-year]')?.value)||year}));return;}
 if(el.matches('[data-rerender]')){rerenderEntry();return;}
 if(el.matches('[data-autosubmit]')){el.form.requestSubmit();return;}
 if(el.name==='oldIncomeNone'){const input=el.form.querySelector('[name="oldIncome"]');if(input){input.disabled=el.checked;if(el.checked)input.value='';}}
 if(el.matches('[data-vap]')){
  try{const value=decimalInput(el.value);commit(withVapUnit(state,el.dataset.security,Number(el.dataset.year),value),value==null?'Vorabpauschale je Anteil gelöscht.':'Vorabpauschale je Anteil gespeichert.');}catch(err){toast(err.message,'error');}
  return;
 }
 if(el.matches('[data-price],[data-start],[data-current]')){
  try{
   // Erster Kurs des Jahres am ersten Werktag, letzter am 31.12., jeweils sofern noch keiner erfasst ist.
   const value=decimalInput(el.value),y=Number(el.dataset.year),start=el.dataset.start!=null;
   const existing=el.dataset.current!=null?null:start?yearStartOf(state,el.dataset.security,y):yearEndOf(state,el.dataset.security,y);
   const date=el.dataset.current!=null?today():existing?.date||(start?firstWorkday(y):`${y}-12-31`);
   commit(withPrice(state,el.dataset.security,date,value),value==null?'Kurs gelöscht.':'Kurs gespeichert.');
  }catch(err){toast(err.message,'error');}
  return;
 }
 if(el.matches('[data-action="import-xlsx"]')&&el.files?.[0]){
  const file=el.files[0];el.value='';
  readImport(file).catch(err=>toast(err.message,'error'));
  return;
 }
 // Sicherung oder Tresordatei ohne Dateizugriff: wird ein eigener Tresor, ersetzt keinen vorhandenen.
 if(el.matches('[data-action="import-backup"]')&&el.files?.[0]){
  const file=el.files[0];el.value='';
  file.text().then(text=>addVault(parseEnvelope(text),{name:file.name})).catch(err=>toast(err.message,'error'));
 }
});
document.addEventListener('input',ev=>{
 if(ev.target.matches?.('[data-search]')){filterList(ev.target);return;}
 const form=ev.target.closest('form[data-form="entry"]');if(!form)return;
 clearTimeout(previewTimer);previewTimer=setTimeout(()=>{const d={...draft,...readDraft(form)};draft=d;const box=modalRoot.querySelector('#entry-preview');if(box)box.innerHTML=previewHTML(state,d);},250);
});
for(const type of ['mousedown','touchstart','scroll'])document.addEventListener(type,touch,{passive:true});
// Auf- und Zuklappen merken (das Ereignis steigt nicht auf, daher in der Erfassungsphase).
// Die Personenwahl mit Suchfeld beginnt beim Aufklappen im Suchfeld – nur mit Maus, damit auf dem Tablett nicht sofort die Tastatur aufgeht.
document.addEventListener('toggle',ev=>{const d=ev.target;if(!(d instanceof HTMLDetailsElement))return;if(d.dataset.keep)openState.set(d.dataset.keep,d.open);if(d.open&&d.matches('.switcher')&&matchMedia('(pointer:fine)').matches)d.querySelector('[data-search]')?.focus();},true);
// Zurück-Taste und Lesezeichen: die Sprungmarke bestimmt die Seite.
// Offene oder gescheiterte Speicherung: der Browser fragt vor dem Schließen nach.
window.addEventListener('beforeunload',ev=>{if(saver.pending||saver.error||rescue){ev.preventDefault();ev.returnValue='';}});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(state&&ROUTES.some(r=>r[0]===next)&&next!==route){route=next;editing=null;closeModal();render();window.scrollTo(0,0);}});

(async()=>{
 // Frühere Sprungmarken der Startseite führen auf die passende neue Seite.
 const alias={tax:'steuer',family:'schenkungen',journal:'jahr'},raw=location.hash.slice(1),wanted=alias[raw]||raw;if(ROUTES.some(r=>r[0]===wanted))route=wanted;
 try{vaults=await listVaults();}catch{vaults=[];lockError='Der Browser-Speicher ist nicht verfügbar (privates Fenster?). Die Demo funktioniert trotzdem.';}
 let remembered=null;try{remembered=localStorage.getItem(VAULT_KEY);}catch{}
 selectedVault=vaults.some(v=>v.id===remembered)?remembered:vaults[0]?.id||null;lockMode=vaults.length?'open':'create';
 if(wanted==='demo'||new URLSearchParams(location.search).has('demo'))return startDemo();
 render();
})();
