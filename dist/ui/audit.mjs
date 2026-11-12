import {EVENT_TYPES,TRANSFER_KINDS,ALLOCATIONS,COLLECTIONS,CHURCH_RATES,FX_KINDS,ACCOUNT_KINDS} from '../core/model.mjs';
import {COLOR_NAMES} from './people.mjs';
import {KINDS,GROUPS,RELATIONS} from '../core/rules.mjs';
import {undoPlan} from '../core/undo.mjs';
import {esc,date,money,pieces} from './format.mjs';

// Änderungsprotokoll lesbar machen: wer, was, vorher → nachher. Das Protokoll
// selbst bleibt unverändert im Tresor; hier wird es nur beschrieben.
export const AUDIT_FILTERS=[['','Alle Änderungen'],['events','Vorgänge'],['master','Stammdaten'],['tax','Jahresdaten und Bescheinigungen'],['prices','Kurse'],['closing','Jahresabschluss']];

const OLD_COLLECTIONS=Object.fromEntries(Object.keys(COLLECTIONS).map(k=>[k,k]));
const LABELS={toAmount:'Betrag in der Zielwährung',allowance:'Sparer-Pauschbetrag',baseRate:'Basiszins',cash:'Barausgleich',toQuantity:'Neue Stückzahl',label:'Bezeichnung',jointWith:'Zusammen veranlagt mit',date:'Datum',depotId:'Depot',toDepotId:'Zieldepot',securityId:'Wertpapier',toSecurityId:'Zielfonds',quantity:'Stück',amount:'Betrag',withheld:'Steuerabzug',foreignTax:'Quellensteuer',
 cost:'Anschaffungswert',group:'Erworben',acquired:'Erwerbsdatum',price2017:'Kurs 31.12.2017',deemed2017:'Fiktiver Gewinn 2017',oldIncome:'Akkumulierte Erträge',vapBefore:'Bisherige Vorabpauschalen',
 price:'Kurs',kind:'Art',accountId:'Währungskonto',toAccountId:'Zielkonto',eur:'Gegenwert EUR',rate:'Devisenkurs',fx:'Über Währungskonto',currency:'Währung',ratio:'Verhältnis',year:'Jahr',note:'Notiz',share:'Anteil',allocation:'Lose zuteilen',batchId:'Gemeinsame Schenkung',unitPrice:'Kurs je Stück',fees:'Gebühren',rateSource:'Kursquelle',rateDate:'Kurstag',
 name:'Name',groupId:'Gruppe',color:'Farbe',isin:'ISIN',bank:'Bank',account:'Buchhaltungskonto',personId:'Person',balance:'Saldo',value:'Wert',taxPaid:'Gezahlte Steuer',donorId:'Schenker',recipientId:'Empfänger',
 capitalTax:'Kapitalertragsteuer',solidarity:'Solidaritätszuschlag',churchTax:'Kirchensteuer',lossCertificate:'Verlustbescheinigung',certifiedStockLoss:'Bescheinigter Aktienverlust',certifiedOtherLoss:'Bescheinigter sonstiger Verlust',
 churchRate:'Kirchensteuer',externalAllowance:'Sparer-Pauschbetrag anderweitig',stockLossCarry:'Aktienverlustvortrag',otherLossCarry:'Sonstiger Verlustvortrag',protectedRemaining:'Rest-Freibetrag Alt-Anteile',joint:'Zusammenveranlagung',nonResident:'Nicht unbeschränkt steuerpflichtig'};
const AMOUNTS=new Set(['amount','fees','withheld','foreignTax','cost','deemed2017','oldIncome','vapBefore','balance','value','taxPaid','capitalTax','solidarity','churchTax','certifiedStockLoss','certifiedOtherLoss','externalAllowance','stockLossCarry','otherLossCarry','protectedRemaining']);
const SKIP=new Set(['id','confirmedAt','batchId']);

function valueText(s,key,v){
 if(v==null||v==='')return '–';
 if(typeof v==='boolean')return v?'ja':'nein';
 if(key==='date'||key==='acquired')return date(v);
 if(key==='depotId'||key==='toDepotId')return s.depots.find(d=>d.id===v)?.name||'gelöschtes Depot';
 if(key==='securityId'||key==='toSecurityId')return s.securities.find(x=>x.id===v)?.name||'gelöschtes Wertpapier';
 if(key==='personId'||key==='donorId'||key==='recipientId')return s.persons.find(p=>p.id===v)?.name||'gelöschte Person';
 if(key==='accountId'||key==='toAccountId')return (s.accounts||[]).find(a=>a.id===v)?.name||'gelöschtes Konto';
 if(key==='fx'&&typeof v==='object'){const a=(s.accounts||[]).find(x=>x.id===v.accountId);return `${pieces(v.amount)} ${a?.currency||''} über ${a?.name||'Konto'}${v.rate?` zu ${v.rate}`:''}`;}
 if(key==='jointWith')return s.persons.find(p=>p.id===v)?.name||String(v);
 if(key==='groupId')return (s.personGroups||[]).find(g=>g.id===v)?.name||'gelöschte Gruppe';
 if(key==='color')return COLOR_NAMES[v]||String(v);
 if(key==='kind')return TRANSFER_KINDS[v]||FX_KINDS[v]||ACCOUNT_KINDS[v]||KINDS[v]||RELATIONS[v]?.label||String(v);
 if(key==='group')return GROUPS[v]||String(v);
 if(key==='allocation')return ALLOCATIONS[v]||String(v);
 if(key==='churchRate')return CHURCH_RATES[String(v)]||String(v);
 if(key==='quantity'||key==='ratio'||key==='share'||key==='toAmount')return pieces(v);
 if(AMOUNTS.has(key)||key==='price'||key==='price2017'||key==='eur'||key==='unitPrice')return money(v);
 if(key==='rateSource')return v==='ecb'?'EZB-Referenzkurs':String(v);
 if(key==='rateDate')return date(v);
 return String(v);
}

const isClosing=a=>a.ref==='closedThrough'||String(a.ref).startsWith('closing:');
function category(a){
 if(isClosing(a))return 'closing';
 if(/^(Kurs|Vorabpauschale je Anteil) /.test(a.action))return 'prices';
 if(/^Vorgang /.test(a.action))return 'events';
 if(a.action==='Jahresdaten bestätigt'||a.action==='Jahresdaten zurückgenommen'||a.action==='Jahresregeln bestätigt'||a.action==='Jahreswerte geändert'||a.collection==='certificates'||a.collection==='ledgerChecks'||a.collection==='balanceChecks'||/^(certificates|ledgerChecks|Bankbescheinigung|Buchhaltungsabgleich) /.test(a.action))return 'tax';
 return 'master';
}

// Frühere Einträge trugen den englischen Datenbereich im Text („securities geändert“).
const actionText=a=>a.action.replace(/^(\w+) (angelegt|geändert|gelöscht)$/,(m,c,verb)=>OLD_COLLECTIONS[c]?`${COLLECTIONS[c]} ${verb}`:m);

export function subject(s,a){
 const r=a.after||a.before;
 if(isClosing(a)){const who=a.ref==='closedThrough'?'Alle Personen':s.persons.find(p=>`closing:${p.id}`===a.ref)?.name||'Gelöschte Person';return `${who} · ${a.after==null?'kein Jahr abgeschlossen':`abgeschlossen bis einschließlich ${a.after}`}`;}
 if(/^Kurs /.test(a.action)){const [id,d]=String(a.ref).split(':');return `${s.securities.find(x=>x.id===id)?.name||'Wertpapier'} · ${date(d)}`;}
 if(/^Vorabpauschale je Anteil /.test(a.action)){const [id,y]=String(a.ref).split(':');return `${s.securities.find(x=>x.id===id)?.name||'Wertpapier'} · Vorabpauschale ${y}`;}
 if(a.action==='Jahresdaten bestätigt'||a.action==='Jahresdaten zurückgenommen'){const [p,y]=String(a.ref).split(':');return `${s.persons.find(x=>x.id===p)?.name||'Person'} · ${y}`;}
 if(/^USt-Umrechnungskurs /.test(a.action)){const [,c,m]=String(a.ref).split(':');return `${c} · ${m.slice(5)}/${m.slice(0,4)}`;}
 if(a.action==='Jahresregeln bestätigt'||a.action==='Jahreswerte geändert')return `Jahreswerte ${String(a.ref).split(':')[1]} · alle Personen`;
 if(String(a.ref).startsWith('relation:')&&r){const person=id=>s.persons.find(p=>p.id===id)?.name||'gelöschte Person';return `${person(r.donorId)} → ${person(r.recipientId)}`;}
 if(r&&r.type&&EVENT_TYPES[r.type]){
  const what=r.type==='transfer'&&TRANSFER_KINDS[r.kind]?TRANSFER_KINDS[r.kind]:r.type==='fx'?`${FX_KINDS[r.kind]||EVENT_TYPES.fx} · ${(s.accounts||[]).find(a=>a.id===r.accountId)?.name||'Konto'}`:EVENT_TYPES[r.type];
  const sec=r.securityId?s.securities.find(x=>x.id===r.securityId)?.name:'';
  return [what,sec,date(r.date),s.depots.find(d=>d.id===r.depotId)?.name,r.toDepotId?`an ${s.depots.find(d=>d.id===r.toDepotId)?.name||'Depot'}`:''].filter(Boolean).join(' · ');
 }
 if(r){if(r.name)return r.name;if(r.bank&&r.year)return `${r.bank} · ${r.year}`;if(r.balance!=null&&r.accountId)return `${(s.accounts||[]).find(x=>x.id===r.accountId)?.name||'Währungskonto'} · ${date(r.date)}`;if(r.balance!=null)return `${s.depots.find(d=>d.id===r.depotId)?.name||'Depot'} · ${date(r.date)}`;if(r.value!=null)return `Vorerwerb ${date(r.date)} · ${money(r.value)}`;}
 return String(a.ref??'');
}

// Gleicher Betrag in anderer Schreibweise ("125.10" und "125.1") ist keine Änderung.
const numeric=v=>v!=null&&/^-?\d+(\.\d+)?$/.test(String(v));
const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y)||numeric(x)&&numeric(y)&&Number(x)===Number(y);

export function changes(s,a){
 if(isClosing(a))return [`${a.before??'kein Jahr'} → ${a.after??'kein Jahr'}`];
 const before=a.before&&typeof a.before==='object'?a.before:{},after=a.after&&typeof a.after==='object'?a.after:{};
 const keys=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>!SKIP.has(k)&&k!=='type');
 const out=[];
 for(const k of keys){
  const x=before[k],y=after[k];if(same(x,y))continue;
  const label=LABELS[k]||k;
  if(!a.before)out.push(`${label}: ${valueText(s,k,y)}`);
  else if(!a.after)out.push(`${label}: ${valueText(s,k,x)}`);
  else out.push(`${label}: ${valueText(s,k,x)} → ${valueText(s,k,y)}`);
 }
 return out;
}

// Wohin „Öffnen“ springt: zum Vorgang, zum Eintrag in den Stammdaten oder zur Seite, auf der der Wert gepflegt wird.
// null, wenn es den Gegenstand nicht mehr gibt (dann hilft „Rückgängig“).
export function auditTarget(s,a){
 const ref=String(a.ref??''),r=a.after||a.before||{},year=d=>Number(String(d).slice(0,4));
 if(isClosing(a))return {kind:'closing',personId:ref.startsWith('closing:')?ref.slice(8):''};
 if(/^Vorgang /.test(a.action))return s.events.some(e=>e.id===a.ref)?{kind:'event',id:a.ref}:null;
 const collection=a.collection||(/^(persons|depots|accounts|securities|certificates|ledgerChecks|balanceChecks|priorGifts) /.exec(a.action)?.[1]);
 if(collection){
  const now=(s[collection]||[]).find(x=>x.id===a.ref);if(!now)return null;
  if(['persons','personGroups','depots','accounts','securities'].includes(collection))return {kind:'record',collection,id:now.id};
  if(collection==='certificates')return {kind:'tax',personId:now.personId,year:now.year};
  if(collection==='ledgerChecks')return {kind:'ledger',depotId:now.depotId,year:year(now.date)};
  if(collection==='balanceChecks')return {kind:'balance',accountId:now.accountId,year:year(now.date)};
  if(collection==='priorGifts')return {kind:'gifts'};
 }
 if(a.action==='Jahresdaten bestätigt'||a.action==='Jahresdaten zurückgenommen'){const [personId,y]=ref.split(':');return s.persons.some(p=>p.id===personId)?{kind:'tax',personId,year:Number(y)}:null;}
 if(/^(Kurs|Vorabpauschale je Anteil) /.test(a.action)){const [securityId,when]=ref.split(':');return s.securities.some(x=>x.id===securityId)?{kind:'prices',securityId,year:year(when)}:null;}
 if(/^USt-Umrechnungskurs /.test(a.action))return {kind:'vat',year:year(ref.split(':')[2])};
 if(ref.startsWith('rules:'))return {kind:'rules'};
 if(ref.startsWith('relation:'))return {kind:'gifts'};
 return null;
}

export function auditEntries(s,{filter=''}={}){
 return s.audit.map((a,i)=>({...a,index:i,category:category(a),text:actionText(a)})).filter(a=>!filter||a.category===filter).reverse();
}
const stamp=at=>{const d=new Date(at);return Number.isNaN(d.getTime())?String(at||''):d.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};
export const auditStamp=stamp;

// Einträge eines Excel-Imports (gleiche importId, gleicher Moment) stehen als eine Zeile; die einzelnen Bewegungen klappen auf.
function grouped(list){
 const out=[];
 for(const a of list){const last=out.at(-1);if(a.importId&&last?.group&&last.importId===a.importId&&last.at===a.at&&last.action===a.action)last.group.push(a);else out.push(a.importId?{...a,group:[a]}:a);}
 return out;
}
export function auditHTML(s,{filter='',limit=100}={}){
 const all=grouped(auditEntries(s,{filter})),shown=all.slice(0,limit);
 const undoTool=a=>{const undo=undoPlan(s,a.index);return undo.ok?`<button class="link" data-action="audit-undo" data-index="${a.index}" title="${esc(undo.label+(undo.later?` – danach noch ${undo.later}× geändert, das geht mit zurück`:''))}">Rückgängig</button>`:'';};
 const rows=shown.map(a=>{
  const kind=a.action.endsWith('gelöscht')?'del':a.action.endsWith('angelegt')||a.action.endsWith('erfasst')?'add':a.category==='closing'?'closing':'mod';
  if(a.group){
   const n=a.group.length,items=a.group.map(x=>`<li>${esc(subject(s,x))}${auditTarget(s,x)?` <button class="link" data-action="audit-open" data-index="${x.index}">Öffnen</button>`:''}</li>`).join('');
   return `<tr><td class="when">${esc(stamp(a.at))}</td><td><span class="tag ${kind}">${esc(a.action==='Vorgang erfasst'?'Excel-Import':'Import gelöscht')}</span></td><td>${n} ${n===1?'Vorgang':'Vorgänge'}${a.reason?`<small>Grund: ${esc(a.reason)}</small>`:''}</td><td><details class="import-list"><summary>${n===1?'Bewegung zeigen':`Alle ${n} zeigen`}</summary><ul class="diff">${items}</ul></details></td><td class="tools">${undoTool(a)}</td></tr>`;
  }
  const list=changes(s,a),target=auditTarget(s,a);
  const tools=[target?`<button class="link" data-action="audit-open" data-index="${a.index}">Öffnen</button>`:'',undoTool(a)].filter(Boolean).join('');
  return `<tr><td class="when">${esc(stamp(a.at))}</td><td><span class="tag ${kind}">${esc(a.text)}</span></td><td>${esc(subject(s,a))}${a.reason?`<small>Grund: ${esc(a.reason)}</small>`:''}</td><td>${list.length?`<ul class="diff">${list.slice(0,8).map(x=>`<li>${esc(x)}</li>`).join('')}${list.length>8?`<li>… ${list.length-8} weitere</li>`:''}</ul>`:'<span class="muted">–</span>'}</td><td class="tools">${tools}</td></tr>`;
 }).join('');
 return `<div class="page-head"><div><h1>Protokoll</h1><p>Jede Änderung im Tresor mit Zeitpunkt, Gegenstand und vorherigem Wert – neueste zuerst. „Öffnen“ springt zum Vorgang oder zur Stelle, an der der Wert gepflegt wird; „Rückgängig“ stellt den Stand vor der Änderung wieder her, außer in abgeschlossenen Jahren. Auch das steht danach im Protokoll; das Protokoll selbst lässt sich nicht bearbeiten.</p></div>
  <div class="head-actions"><label class="inline-field"><span>Zeigen</span><select id="audit-filter">${AUDIT_FILTERS.map(([v,l])=>`<option value="${v}" ${v===filter?'selected':''}>${esc(l)}</option>`).join('')}</select></label><button class="button" data-action="export-pdf-audit" title="Öffnet die Vorschau"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg>PDF</button></div></div>
  ${all.length?`<section class="card flush"><div class="table-wrap"><table class="list audit"><thead><tr><th>Zeitpunkt</th><th>Aktion</th><th>Gegenstand</th><th>Änderung</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>
  ${all.length>shown.length?`<p class="center"><button class="button" data-action="audit-more">Weitere ${Math.min(100,all.length-shown.length)} von ${all.length-shown.length} anzeigen</button></p>`:''}`
  :`<section class="empty"><h2>Noch keine Änderungen</h2><p>${filter?'Für diese Auswahl gibt es keine Einträge.':'Jede Erfassung, Änderung und Löschung erscheint hier.'}</p></section>`}`;
}
