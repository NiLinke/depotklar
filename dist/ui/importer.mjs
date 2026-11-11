import {D,S,div} from '../core/decimal.mjs';
import {FX_KINDS,accountHolder,isEventClosed,validateEvent,validDate,dateWarning,withEvents,uid} from '../core/model.mjs';
import {fxReplay,eurValue} from '../core/fx.mjs';
import {replay} from '../core/ledger.mjs';
import {draftToEvent} from './entry.mjs';
import {esc,date,pieces,money,decimalInput,inputValue} from './format.mjs';

// Excel-Import für Währungskonten mit fester Vorlage: keine Spaltenzuordnung, erkannt wird jede Spalte an ihrer
// Überschrift. Jede Zeile wird wie im Formular zu einem Vorgang (gleiche Prüfungen, EZB-Kurs, Steuerfelder).
// Die Datei wird nur im Browser gelesen. Übernommen wird erst nach der Vorschau und nur ohne Fehler, dann alle
// Zeilen zusammen; schon erfasste Zeilen werden übersprungen. Der Import lässt sich im Protokoll als Ganzes zurücknehmen.

export const COLUMNS=[
 ['date','Datum','Tag der Buchung, z. B. 15.03.2026.'],
 ['account','Konto','Aus der Liste; so wie das Konto in Depotklar heißt.'],
 ['kind','Art','Aus der Liste. Leer: negativer Betrag gilt als Zahlung, positiver als Gutschrift.'],
 ['amount','Betrag','In der Währung des Kontos. Abgänge positiv oder negativ, Zugänge positiv.'],
 ['eur','EUR-Betrag','Gegenwert laut Abrechnung, optional.'],
 ['rate','Devisenkurs','Währung je 1 EUR laut Abrechnung, optional. Ohne EUR-Betrag und Kurs gilt der EZB-Referenzkurs des Tages.'],
 ['target','Zielkonto','Nur bei Übertrag, Umtausch in andere Währung, Schenkung und Erbschaft.'],
 ['targetAmount','Betrag Zielkonto','Nur bei Umtausch in andere Währung: was auf dem Zielkonto ankommt.'],
 ['gross','Zinsen brutto EUR','Nur bei Zinsen, optional. Leer: Gutschrift in EUR plus Steuer.'],
 ['capitalTax','KapESt','Nur bei Zinsen, optional.'],
 ['solidarity','Soli','Nur bei Zinsen, optional.'],
 ['churchTax','KiSt','Nur bei Zinsen, optional.'],
 ['note','Notiz','Optional, etwa Beleg oder Verwendungszweck.']];
const KINDS=[...Object.entries(FX_KINDS).filter(([k])=>k!=='opening'),['interest','Zinsen']];
const ALIASES={zahlung:'debit',gebühr:'debit',gebuehr:'debit',überweisung:'debit',ueberweisung:'debit',lastschrift:'debit',gutschrift:'credit',eingang:'credit',zins:'interest',zinsen:'interest',übertrag:'transfer',schenkung:'gift',erbschaft:'inheritance','umtausch aus eur':'exchangeIn','umtausch in eur':'exchangeOut','umtausch in andere währung':'exchange'};
const OUTFLOWS=['debit','exchangeOut','exchange','transfer','gift','inheritance'];
const MAX_ROWS=1000;

const norm=t=>String(t??'').trim().toLowerCase().replace(/\s+/g,' ');
const kindLabel=k=>k==='interest'?'Zinsen':FX_KINDS[k]||k;
const personOf=(s,a)=>s.persons.find(p=>p.id===accountHolder(s,a)?.personId)?.name||'';
// Bezeichnung in der Vorlage: eindeutig auch bei gleichnamigen Konten verschiedener Personen.
export const accountKey=(s,a)=>`${a.name} · ${a.currency} · ${personOf(s,a)}`;

// Zellinhalt ohne Formel, Formatierung und Verweis.
function cellValue(v){
 if(v&&typeof v==='object'&&!(v instanceof Date)){
  if('result' in v)return cellValue(v.result);
  if(Array.isArray(v.richText))return v.richText.map(x=>x.text).join('');
  if('text' in v)return v.text;
  if('error' in v)return null;
 }
 return v;
}
const text=v=>{const x=cellValue(v);return x==null?'':x instanceof Date?x.toISOString().slice(0,10):String(x).trim();};
// Zahl aus einer Zelle: Excel-Zahlen ohne Gleitkommarest, Text deutsch oder englisch geschrieben.
function number(v,label){
 const x=cellValue(v);if(x==null||x==='')return null;
 if(typeof x==='number'){if(!Number.isFinite(x))throw Error(`${label}: keine Zahl.`);const t=x.toFixed(10).replace(/\.?0+$/,'');return t==='-0'?'0':t;}
 try{return decimalInput(x);}catch{throw Error(`${label}: „${x}“ ist keine Zahl.`);}
}
// Datum aus einer Zelle: Excel-Datum, Seriennummer, TT.MM.JJJJ oder JJJJ-MM-TT.
function day(v){
 const x=cellValue(v);if(x==null||x==='')throw Error('Datum fehlt.');
 let iso=null;
 if(x instanceof Date)iso=Number.isNaN(x.getTime())?null:x.toISOString().slice(0,10);
 // Seriennummer mit Uhrzeit (Nachkommaanteil): Es zählt der Tag, nicht der nächste ab 12 Uhr.
 else if(typeof x==='number')iso=new Date(Date.UTC(1899,11,30)+Math.floor(x)*864e5).toISOString().slice(0,10);
 else{const t=String(x).trim(),de=/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:[ T]+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t);
  iso=de?`${de[3].length===2?'20'+de[3]:de[3]}-${de[2].padStart(2,'0')}-${de[1].padStart(2,'0')}`:/^\d{4}-\d{2}-\d{2}/.test(t)?t.slice(0,10):null;}
 if(!iso||!validDate(iso))throw Error(`Datum „${text(x)}“ ist ungültig.`);
 return iso;
}

// Vorlage: Blatt „Bewegungen“ mit Überschriften und Auswahllisten, „Hinweise“ mit Erklärung je Spalte und den Konten.
export function templateWorkbook(s,ExcelJS,{personId=''}={}){
 const accounts=(s.accounts||[]).filter(a=>!personId||accountHolder(s,a)?.personId===personId);
 if(!accounts.length)throw Error('Noch kein Währungskonto angelegt.');
 const book=new ExcelJS.Workbook();book.creator='Depotklar';book.created=new Date();
 const ws=book.addWorksheet('Bewegungen',{views:[{state:'frozen',ySplit:1}]});
 ws.columns=COLUMNS.map(([key,label])=>({header:label,key,width:{date:12,account:40,kind:30,note:36,target:40}[key]||15}));
 const head=ws.getRow(1);head.font={bold:true};head.alignment={wrapText:true,vertical:'bottom'};
 head.eachCell((c,i)=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF4F1'}};c.note=COLUMNS[i-1][2];});
 const lists=book.addWorksheet('Listen',{state:'hidden'});
 lists.getColumn(1).values=['Konten',...(s.accounts||[]).map(a=>accountKey(s,a))];
 lists.getColumn(2).values=['Arten',...KINDS.map(([,l])=>l)];
 const rows=MAX_ROWS+1,col=k=>ws.getColumn(k).letter,list=(k,ref,n)=>ws.dataValidations.add(`${col(k)}2:${col(k)}${rows}`,{type:'list',allowBlank:true,formulae:[`Listen!$${ref}$2:$${ref}$${n+1}`],showErrorMessage:true,errorTitle:'Depotklar',error:'Bitte einen Eintrag aus der Liste wählen.'});
 list('account','A',(s.accounts||[]).length);list('target','A',(s.accounts||[]).length);list('kind','B',KINDS.length);
 ws.getColumn('date').numFmt='dd.mm.yyyy';
 for(const k of ['amount','eur','targetAmount','gross','capitalTax','solidarity','churchTax'])ws.getColumn(k).numFmt='#,##0.00##';
 ws.getColumn('rate').numFmt='0.0000##';
 const info=book.addWorksheet('Hinweise');info.columns=[{width:22},{width:90}];
 const add=(a,b='',bold=false)=>{const r=info.addRow([a,b]);if(bold)r.font={bold:true};r.alignment={wrapText:true,vertical:'top'};};
 add('Depotklar · Vorlage für Bewegungen auf Währungskonten','',true);
 add('So geht es','Je Zeile eine Bewegung im Blatt „Bewegungen“ eintragen oder aus dem Kontoauszug hineinkopieren. In Depotklar unter „Konten“ mit „Excel importieren“ einlesen: Die Vorschau zeigt jede Zeile mit ihrer Wirkung oder ihrem Fehler. Übernommen wird erst nach Bestätigung und nur, wenn keine Zeile einen Fehler hat. Schon erfasste Bewegungen (gleicher Tag, gleiches Konto, gleiche Art, gleicher Betrag) werden übersprungen; dieselbe Datei lässt sich also gefahrlos erneut einlesen. Der ganze Import lässt sich im Protokoll mit „Rückgängig“ zurücknehmen.');
 add('');add('Spalte','Bedeutung',true);for(const [,label,hint] of COLUMNS)add(label,hint);
 add('');add('Arten','Bedeutung',true);
 for(const [k,l] of KINDS)add(l,{exchangeIn:'Kauf der Fremdwährung gegen EUR; EUR-Betrag = bezahlt.',exchangeOut:'Verkauf der Fremdwährung gegen EUR; EUR-Betrag = erhalten.',exchange:'Tausch in eine andere Fremdwährung auf ein eigenes Konto; Zielkonto und Betrag Zielkonto angeben.',credit:'Eingang auf dem Konto.',debit:'Abgang: Zahlung, Gebühr oder Überweisung an Dritte.',transfer:'Auf ein eigenes Konto derselben Währung.',gift:'An ein Konto einer anderen Person derselben Währung; EUR-Betrag = Wert am Tag der Schenkung.',inheritance:'An ein Konto einer anderen Person derselben Währung.',interest:'Zinsgutschrift; Betrag = Gutschrift in Fremdwährung, Steuern optional.'}[k]||'');
 add('');add('Konten','',true);for(const a of accounts)add(accountKey(s,a),a.kind==='interest'?'verzinst (§ 20 EStG)':'unverzinst (§ 23 EStG)');
 add('');add('Beispiel','15.03.2026 · USD-Konto · Zahlung / Gebühr / Überweisung · 120 · leer · leer – Depotklar nimmt den EZB-Kurs des Tages.');
 return book;
}

// Zeilen des Blatts „Bewegungen“ (oder des ersten Blatts) mit den erkannten Spalten; leere Zeilen fallen weg.
export function readRows(book){
 const ws=book.getWorksheet('Bewegungen')||book.worksheets.find(w=>w.state!=='hidden');if(!ws)throw Error('Die Datei hat kein Tabellenblatt.');
 const cols={},clean=t=>norm(t).replace(/\s*\(.*\)$/,'');
 ws.getRow(1).eachCell((c,i)=>{const t=clean(text(c.value)),found=COLUMNS.find(([,label])=>norm(label)===t);if(found&&!cols[found[0]])cols[found[0]]=i;});
 const missing=['date','account','amount'].filter(k=>!cols[k]);
 if(missing.length)throw Error(`Die Datei passt nicht zur Vorlage: ${missing.map(k=>`„${COLUMNS.find(c=>c[0]===k)[1]}“`).join(', ')} fehlt in der ersten Zeile. Die Vorlage gibt es unter „Excel-Vorlage“.`);
 const rows=[];
 ws.eachRow((r,n)=>{if(n===1)return;const raw={};for(const [k,i] of Object.entries(cols))raw[k]=r.getCell(i).value;if(Object.values(raw).some(v=>text(v)!==''))rows.push({row:n,raw});});
 if(rows.length>MAX_ROWS)throw Error(`Höchstens ${MAX_ROWS} Zeilen je Datei; die Datei hat ${rows.length}. Bitte aufteilen.`);
 return rows;
}

function accountFinder(s){
 const accounts=s.accounts||[];
 return value=>{
  const t=norm(value);if(!t)throw Error('Konto fehlt.');
  const exact=accounts.filter(a=>norm(accountKey(s,a))===t);if(exact.length===1)return exact[0];
  for(const key of [a=>a.name,a=>`${a.name} · ${a.currency}`]){
   const hits=accounts.filter(a=>norm(key(a))===t);
   if(hits.length===1)return hits[0];
   if(hits.length>1)throw Error(`Konto „${value}“ gibt es mehrfach – bitte die Bezeichnung aus der Liste der Vorlage nehmen.`);
  }
  throw Error(`Konto „${value}“ ist in Depotklar nicht angelegt.`);
 };
}
function kindOf(value){
 const t=norm(value);if(!t)return null;
 const hit=KINDS.find(([k,l])=>norm(l)===t||k.toLowerCase()===t);if(hit)return hit[0];
 if(ALIASES[t])return ALIASES[t];
 throw Error(`Art „${value}“ ist unbekannt. Bitte aus der Liste der Vorlage wählen.`);
}

// Eine Zeile als Entwurf des Formulars. Beträge gehen in der Schreibweise des Formulars hinein (Komma).
function toDraft(s,raw,findAccount){
 const on=day(raw.date),a=findAccount(text(raw.account)),f=v=>v==null?'':inputValue(v);
 let amount=number(raw.amount,'Betrag');if(amount==null)throw Error('Betrag fehlt.');
 let kind=kindOf(text(raw.kind));const negative=amount.startsWith('-');if(negative)amount=amount.slice(1);
 if(D(amount)===0n)throw Error('Betrag ist null.');
 if(!kind)kind=negative?'debit':'credit';
 else if(negative&&!OUTFLOWS.includes(kind))throw Error(`Negativer Betrag passt nicht zu „${kindLabel(kind)}“.`);
 const eur=number(raw.eur,'EUR-Betrag'),rate=number(raw.rate,'Devisenkurs'),note=text(raw.note);
 const targetText=text(raw.target),target=targetText?findAccount(targetText):null,targetAmount=number(raw.targetAmount,'Betrag Zielkonto');
 if(target&&!['transfer','exchange','gift','inheritance'].includes(kind))throw Error(`Ein Zielkonto passt nicht zu „${kindLabel(kind)}“.`);
 if(kind==='interest'){
  // Ohne Kurs, aber mit EUR-Betrag: der Kurs der Gutschrift ergibt sich aus beidem.
  const fxRate=rate??(eur!=null&&D(eur)>0n?S(div(D(amount),D(eur))):null);
  return {type:'interest',date:on,depotId:a.depotId||'',fxAccount:a.id,fxAmount:f(amount),fxRate:f(fxRate),amount:f(number(raw.gross,'Zinsen brutto EUR')),
   capitalTax:f(number(raw.capitalTax,'KapESt')),solidarity:f(number(raw.solidarity,'Soli')),churchTax:f(number(raw.churchTax,'KiSt')),note};
 }
 for(const k of ['gross','capitalTax','solidarity','churchTax'])if(text(raw[k]))throw Error(`„${COLUMNS.find(c=>c[0]===k)[1]}“ nur bei Zinsen.`);
 return {type:'fx',date:on,accountId:a.id,depotId:a.depotId||'',kind,amount:f(amount),eur:f(eur),rate:f(rate),toAccountId:target?.id||'',toAmount:f(targetAmount),note};
}

// Schon erfasst: gleicher Tag, gleiches Konto, gleiche Art und gleicher Betrag.
const keyOf=e=>{const account=e.type==='fx'?e.accountId:e.fx?.accountId,amount=e.type==='fx'?e.amount:e.fx?.amount;return account&&amount!=null?`${e.type}|${e.kind||''}|${e.date}|${account}|${S(D(amount))}`:null;};

// Vorschau und Ergebnis: je Zeile neu, schon erfasst oder Fehler; next ist der Stand nach der Übernahme (nur ohne Fehler).
export function planImport(s,rows,{file=''}={}){
 // Schon erfasste Bewegungen je Schlüssel gezählt: Zwei echte gleiche Buchungen am selben Tag sind zwei Bewegungen –
 // ist erst eine davon erfasst, gilt nur eine Zeile der Datei als „schon erfasst“, die zweite kommt neu hinzu.
 const findAccount=accountFinder(s),known=new Map(),lines=[];
 for(const k of s.events.map(keyOf).filter(Boolean))known.set(k,(known.get(k)||0)+1);
 for(const {row,raw} of rows){
  const line={row,raw,status:'error',message:'',warning:null,event:null};lines.push(line);
  try{
   const {event}=draftToEvent(s,toDraft(s,raw,findAccount));
   validateEvent(s,event,null,{fresh:true});
   if(isEventClosed(s,event))throw Error(`${event.date.slice(0,4)} ist abgeschlossen.`);
   const k=keyOf(event),left=known.get(k)||0;
   line.event=event;line.status=left>0?'duplicate':'new';
   if(left>0){known.set(k,left-1);line.message='Schon erfasst, wird übersprungen.';}
   else line.warning=dateWarning(event.date);
  }catch(err){line.message=err.message;}
 }
 const fresh=lines.filter(l=>l.status==='new').map(l=>l.event),count=k=>lines.filter(l=>l.status===k).length;
 let next=null,problem='';
 if(!count('error')&&fresh.length){
  try{next=withEvents(s,fresh,{reason:`Excel-Import${file?` aus ${file}`:''}`,importId:uid()});fxReplay(next,{until:'9999-12-31'});replay(next,{until:'9999-12-31'});}
  catch(err){next=null;problem=err.message;}
 }
 return {base:s,lines,next,problem,file,counts:{new:fresh.length,duplicate:count('duplicate'),error:count('error')}};
}

const SHOWN=300;
export function importPreviewHTML(plan){
 const s=plan.base,c=plan.counts,account=id=>(s.accounts||[]).find(a=>a.id===id);
 const cells=l=>{
  const e=l.event;
  if(!e)return `<td>${esc(text(l.raw.date))}</td><td>${esc(text(l.raw.account))}</td><td>${esc(text(l.raw.kind))}</td><td class="num">${esc(text(l.raw.amount))}</td><td></td>`;
  const a=account(e.type==='fx'?e.accountId:e.fx.accountId),amount=e.type==='fx'?e.amount:e.fx.amount,q=e.type==='fx'?e:e.fx;
  const eur=e.type==='interest'?`${money(e.amount)} brutto`:e.eur!=null?money(e.eur):q.rate!=null?`${money(S(eurValue(amount,{rate:q.rate})))}<small>${q.rateSource==='ecb'?'EZB ':'Kurs '}${esc(String(q.rate).replace('.',','))}</small>`:'—';
  const to=e.toAccountId?`<small>→ ${esc(account(e.toAccountId)?.name||'')}${e.toAmount?` · ${pieces(e.toAmount)} ${esc(account(e.toAccountId)?.currency||'')}`:''}</small>`:'';
  return `<td>${date(e.date)}</td><td>${esc(a?.name||'')}</td><td>${esc(kindLabel(e.type==='interest'?'interest':e.kind))}${to}</td><td class="num">${pieces(amount)} ${esc(a?.currency||'')}</td><td class="num">${eur}</td>`;
 };
 const ordered=[...plan.lines.filter(l=>l.status==='error'),...plan.lines.filter(l=>l.status!=='error')],shown=ordered.slice(0,SHOWN);
 const badge={new:'<span class="tag add">neu</span>',duplicate:'<span class="tag">schon erfasst</span>',error:'<span class="tag del">Fehler</span>'};
 const rows=shown.map(l=>`<tr class="${l.status==='error'||l.warning?'warn':''}"><td class="num">${l.row}</td>${cells(l)}<td>${badge[l.status]}${l.message?`<small>${esc(l.message)}</small>`:''}${l.warning?`<small>${esc(l.warning)}</small>`:''}</td></tr>`).join('');
 const odd=plan.lines.filter(l=>l.warning).length;
 // Bestand je Konto vorher und nachher, damit sich das Ergebnis mit dem Kontoauszug vergleichen lässt.
 let effect='';
 if(plan.next){
  const last=(r,id)=>r.moves.filter(m=>m.accountId===id).at(-1)?.balance??'0',before=fxReplay(s,{until:'9999-12-31'}),after=fxReplay(plan.next,{until:'9999-12-31'});
  const ids=[...new Set(plan.lines.filter(l=>l.status==='new').flatMap(l=>[l.event.type==='fx'?l.event.accountId:l.event.fx.accountId,l.event.toAccountId].filter(Boolean)))];
  effect=`<h4 class="sub">Bestand nach allen Buchungen</h4><div class="table-wrap"><table class="list compact"><thead><tr><th>Konto</th><th class="num">Bisher</th><th class="num">Mit Import</th></tr></thead><tbody>${ids.map(id=>{const a=account(id);return `<tr><td>${esc(a.name)}</td><td class="num">${pieces(last(before,id))} ${esc(a.currency)}</td><td class="num">${pieces(last(after,id))} ${esc(a.currency)}</td></tr>`;}).join('')}</tbody></table></div>`;
 }
 const summary=`${c.new} ${c.new===1?'neue Bewegung':'neue Bewegungen'}${c.duplicate?`, ${c.duplicate} schon erfasst (werden übersprungen)`:''}${c.error?`, ${c.error} mit Fehler`:''}.`;
 const blocked=c.error?'<div class="notice"><strong>Noch nichts übernommen.</strong> Bitte die Zeilen mit Fehler in der Datei korrigieren und die Datei erneut einlesen. Übernommen wird erst, wenn keine Zeile einen Fehler hat.</div>':plan.problem?`<div class="notice"><strong>So lässt sich die Datei nicht übernehmen.</strong> ${esc(plan.problem)}</div>`:!c.new?'<p class="ok">Alle Zeilen sind schon erfasst. Es gibt nichts zu übernehmen.</p>':'';
 const dates=odd&&!c.error?`<div class="notice"><strong>${odd} ${odd===1?'Zeile hat':'Zeilen haben'} ein auffälliges Datum.</strong> Bitte vor der Übernahme prüfen – ein Tippfehler im Jahr lässt die Bewegung im gemeinten Jahr fehlen.</div>`:'';
 return `<div class="import"><p>${esc(plan.file)} · ${esc(summary)}</p>${blocked}${dates}${effect}
  <div class="table-wrap"><table class="list compact"><thead><tr><th class="num">Zeile</th><th>Datum</th><th>Konto</th><th>Art</th><th class="num">Betrag</th><th class="num">EUR</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
  ${ordered.length>SHOWN?`<p class="hint">${ordered.length-SHOWN} weitere Zeilen ohne Fehler sind nicht einzeln gezeigt.</p>`:''}
  <p class="hint">Jede Bewegung steht danach einzeln im Kontoblatt und im Protokoll. Der ganze Import lässt sich im Protokoll mit „Rückgängig“ zurücknehmen.</p>
  <div class="actions"><span></span><button type="button" class="button" data-action="close">Abbrechen</button>${plan.next?`<button type="button" class="button primary" data-action="import-apply">${c.new} ${c.new===1?'Bewegung':'Bewegungen'} übernehmen</button>`:''}</div></div>`;
}
