import {periodStatement,BASES} from '../core/statement.mjs';
import {fxReplay,accountStatement} from '../core/fx.mjs';
import {replay} from '../core/ledger.mjs';
import {KINDS,GROUPS,FIRST_TAX_YEAR} from '../core/rules.mjs';
import {today,isClosed,isEventClosed,closedThrough,lastSelectableYear} from '../core/model.mjs';
import {yearReport} from '../core/year.mjs';
import {hasRates} from './fxrates.mjs';
import {D,S,sum} from '../core/decimal.mjs';
import {esc,money,pieces,unit,date,num,exact,statusLabel} from './format.mjs';

// Jahresblatt je Depot: oben die wirtschaftliche, darunter die steuerliche
// Betrachtung, je Wertpapier Stand 01.01. → jeder Vorgang → Stand 31.12.
// Über mehrere Jahre steht der Stand 31.12. jedes Jahres als Zwischenzeile.
const span=(from,to)=>from===to?String(to):`${from}–${to}`;
const standRow=(label,note,quantity,value,cls='')=>`<tr class="stand ${cls}"><td>${label}${note?`<small>${note}</small>`:''}</td><td></td><td></td><td></td><td></td><td></td><td class="num">${pieces(quantity)}</td>${num(value)}</tr>`;

// Gesperrt nach dem Jahresabschluss der beteiligten Personen; Zeilen ohne Vorgang
// (berechnete Vorabpauschale) nach dem Abschluss des Depotinhabers.
export const lockCheck=(s,events,ownerId)=>l=>{const e=l.eventId?events.get(l.eventId):null;return e?isEventClosed(s,e):isClosed(s,l.date,[ownerId]);};

// Abgang aus Losen, kurz: „aus 15.03.2019 · 100 Stück; …“, höchstens vier Lose.
const fromText=list=>{const part=f=>`${f.acquired?date(f.acquired):`Erwerb ${GROUPS[f.group]||''}`} · ${pieces(f.quantity)} Stück`;return `aus ${list.slice(0,4).map(part).join('; ')}${list.length>4?` und ${list.length-4} weiteren Losen`:''}`;};
// Lose zum Jahresende, aufklappbar: was noch da ist und in welcher Reihenfolge FIFO es verbraucht.
function lotsRow(lots,year){
 if(!lots?.length)return '';
 const rows=lots.map(l=>`<tr><td class="num">${l.n}</td><td>${l.acquired?date(l.acquired):esc(`Erwerb ${GROUPS[l.group]||''}`)}</td><td>${esc(l.origin)}</td><td class="num">${pieces(l.quantity)}${l.bought!=null&&D(l.bought)!==D(l.quantity)?`<small>von ${pieces(l.bought)}</small>`:''}</td>${num(l.value)}<td class="num">${l.unit==null?'':unit(l.unit)}</td></tr>`).join('');
 return `<tr class="lots"><td colspan="8"><details><summary>Lose zum 31.12.${year} in FIFO-Reihenfolge (${lots.length})</summary><table class="mini"><thead><tr><th class="num">Nr.</th><th>Erwerb</th><th>Herkunft</th><th class="num">Stück</th><th class="num">Wert</th><th class="num">je Stück</th></tr></thead><tbody>${rows}</tbody></table></details></td></tr>`;
}

function lineRow(l,isLocked){
 const locked=isLocked(l);
 const action=l.eventId?`data-action="edit" data-id="${esc(l.eventId)}"`:l.type==='vap'?'data-route="kurse"':'';
 const missing=l.value==null&&l.type==='vap';
 return `<tr class="${['line',action&&'click',missing&&'missing',locked&&'locked'].filter(Boolean).join(' ')}" ${action} tabindex="${action?0:-1}"><td>${esc(l.label)}${l.note?`<small>${esc(l.note)}</small>`:''}${l.from?.length?`<small>${esc(fromText(l.from))}</small>`:''}</td><td>${date(l.date)}</td><td class="num${Number(l.quantity)<0?' neg':''}">${l.quantity&&Number(l.quantity)!==0?pieces(l.quantity):''}</td>${num(l.value)}<td class="num">${l.proceeds==null?'':money(l.proceeds)}</td><td class="num">${l.gain==null?'':money(l.gain)}</td><td class="num">${pieces(l.balanceQuantity)}</td>${num(l.balanceValue)}</tr>`;
}

function block(ps,isLocked,showLots=true){
 const multi=ps.fromYear!==ps.toYear;
 const head=`<thead><tr><th>Wertpapier · Vorgang</th><th>Datum</th><th class="num">Stück</th><th class="num">Wert</th><th class="num">Erlös</th><th class="num">Gewinn</th><th class="num">Bestand Stück</th><th class="num">Bestand Wert</th></tr></thead>`;
 const body=ps.rows.map(r=>{
  const sec=`<tr class="sec"><td colspan="8"><strong>${esc(r.security.name)}</strong><span>${esc(r.security.isin||'ohne ISIN')} · ${esc(KINDS[r.security.kind])}${r.regimes.length?' · '+esc(r.regimes.join(' / ')):''}</span></td></tr>`;
  const open=standRow(`Stand 01.01.${r.firstYear}`,'',r.opening.quantity,r.opening.value);
  const segments=r.segments.map((seg,i)=>{
   const last=i===r.segments.length-1&&seg.year===ps.toYear;
   const note=`${seg.unitValue==null?'Wert je Stück offen':`${unit(seg.unitValue)} je Stück`}${seg.market!=null?` · Marktwert ${money(seg.market)} (Kurs ${date(seg.price.date)})`:''}`;
   return seg.lines.map(l=>lineRow(l,isLocked)).join('')+standRow(`Stand 31.12.${seg.year}`,note,seg.closing.quantity,seg.closing.value,last||!multi?'end':'year')+(showLots?lotsRow(seg.lots,seg.year):'');
  }).join('');
  const warn=r.balanced?'':`<tr class="warn"><td colspan="8">Probe: Anfangsbestand, Vorgänge und Losbestand passen nicht zusammen. Bitte melden – es wird nichts ausgeglichen.</td></tr>`;
  return sec+open+segments+warn;
 }).join('');
 const lc=ps.ledgerCheck,label=ps.depot.name;
 const ledger=ps.basis==='economic'&&!ps.securityId?(lc?`<tr class="ledger"><td colspan="7">= Buchhaltung ${esc(ps.depot.account?'Konto '+ps.depot.account:'')} zum 31.12.${ps.toYear}: ${money(lc.balance)}${lc.difference!=null&&Number(lc.difference)!==0?` · <strong>Differenz ${money(lc.difference)}</strong>`:lc.difference==null?' · Vergleich offen':' · stimmt überein'}</td><td class="num"><button class="link" data-action="ledger-check" data-depot="${esc(ps.depot.id)}">ändern</button></td></tr>`
  :`<tr class="ledger"><td colspan="8"><button class="link" data-action="ledger-check" data-depot="${esc(ps.depot.id)}">Saldo der Buchhaltung zum 31.12.${ps.toYear} erfassen</button></td></tr>`):'';
 const foot=`<tfoot><tr class="stand total"><td>${esc(label)} · Stand 01.01.${ps.fromYear}</td><td></td><td></td><td></td><td></td><td></td><td></td>${num(ps.opening)}</tr><tr class="stand total"><td>${esc(label)} · Stand 31.12.${ps.toYear}</td><td></td><td></td><td></td><td class="num">${ps.sold&&ps.proceeds!=null?money(ps.proceeds):''}</td><td class="num">${ps.sold?money(ps.gains,'Offen'):''}</td><td></td>${num(ps.closing)}</tr>${ledger}</tfoot>`;
 return `<div class="block ${ps.basis}"><h3>${esc(ps.label)} ${span(ps.fromYear,ps.toYear)}</h3><div class="table-wrap"><table class="sheet">${head}<tbody>${body}</tbody>${foot}</table></div></div>`;
}

// Erträge (Zinsen, Ausschüttungen, Dividenden) stehen je Depot einmal unter den beiden
// Betrachtungen: Sie gehen als Geld zu und bewegen weder Anschaffungswert noch steuerliche Basis.
const taxTitle=t=>`Kapitalertragsteuer ${money(t.capitalTax)} · Solidaritätszuschlag ${money(t.solidarity)} · Kirchensteuer ${money(t.churchTax)}`;
function incomeBlock(list,span,isLocked){
 if(!list.length)return '';
 const total=k=>S(sum(list.map(i=>D(i[k]))));
 const opt=v=>`<td class="num">${v==null||!Number(v)?'':money(v)}</td>`;
 const rows=list.map(i=>{const locked=isLocked(i);return `<tr class="line click${locked?' locked':''}" data-action="edit" data-id="${esc(i.eventId)}" tabindex="0"><td>${esc(i.name)}<small>${esc(i.label)}</small></td><td>${date(i.date)}</td>${num(i.gross)}${opt(i.exempt)}${num(i.taxable)}${opt(i.foreignTax)}<td class="num"${i.taxes?` title="${esc(taxTitle(i.taxes))}"`:''}>${i.withheld==null?'':money(i.withheld)}</td></tr>`;}).join('');
 return `<div class="block income"><h3>Erträge ${span}</h3><div class="table-wrap"><table class="sheet"><thead><tr><th>Wertpapier · Ertrag</th><th>Datum</th><th class="num">Brutto</th><th class="num">Teilfreistellung</th><th class="num">Steuerpflichtig</th><th class="num">Quellensteuer</th><th class="num">Steuerabzug</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="stand total"><td>Summe</td><td></td>${num(total('gross'))}${num(total('exempt'))}${num(total('taxable'))}<td></td><td></td></tr></tfoot></table></div><p class="hint pad">Zinsen, Ausschüttungen und Dividenden ändern keinen Bestand. Die Vorabpauschale steht im steuerlichen Blatt, weil sie die steuerliche Basis erhöht; Thesaurierungen nach altem Recht stehen in beiden Blättern.</p></div>`;
}

// Verkäufe für die Buchung: je Verkauf Erlös, Abgang zum Buchwert, woraus der Gewinn besteht und die Steuern.
function salesBlock(list,period,isLocked){
 if(!list.length)return '';
 const withRest=list.some(i=>i.rest!=null&&D(i.rest)!==0n),total=k=>list.some(i=>i[k]==null)?null:S(sum(list.map(i=>D(i[k]))));
 const part=(i,k)=>i.historic?'<td></td>':num(i[k]);
 const tax=(i,k)=>`<td class="num${i.taxes?.source==='rechnerisch'?' calc':''}">${i.taxes?.[k]==null?'':money(i.taxes[k])}</td>`;
 const taxSum=k=>{const v=list.map(i=>i.taxes?.[k]);return `<td class="num">${v.some(x=>x==null)?'':money(S(sum(v.map(D))))}</td>`;};
 const rows=list.map(i=>{
  const note=i.historic?' · altes Recht, nicht nachgerechnet':i.commodity?' · privates Veräußerungsgeschäft':'';
  const title=i.taxes?.source==='rechnerisch'?'Rechnerisch auf diesen Verkauf allein, vor Verlustverrechnung und Freistellungsauftrag':i.model?`Rechnerisch: ${taxTitle(i.model)}`:'';
  return `<tr class="line click${isLocked(i)?' locked':''}" data-action="edit" data-id="${esc(i.eventId)}" tabindex="0"${title?` title="${esc(title)}"`:''}><td>${esc(i.name)}<small>${pieces(i.quantity)} Stück${esc(note)}</small></td><td>${date(i.date)}</td>${num(i.proceeds)}${num(i.book)}${num(i.gain)}${part(i,'free')}${part(i,'vap')}${part(i,'exempt')}${part(i,'taxable')}${withRest?part(i,'rest'):''}${tax(i,'capitalTax')}${tax(i,'solidarity')}${tax(i,'churchTax')}</tr>`;
 }).join('');
 return `<div class="block sale"><h3>Verkäufe ${period}</h3><div class="table-wrap"><table class="sheet"><thead><tr><th>Wertpapier</th><th>Datum</th><th class="num">Erlös</th><th class="num">Buchwert</th><th class="num">Gewinn</th><th class="num">Steuerfrei bis 2017</th><th class="num">Vorab&shy;pauschalen</th><th class="num">Teilfrei&shy;stellung</th><th class="num">Steuer&shy;pflichtig</th>${withRest?'<th class="num">Übrige Differenz</th>':''}<th class="num">KapESt</th><th class="num">Soli</th><th class="num">KiSt</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="stand total"><td>Summe</td><td></td>${num(total('proceeds'))}${num(total('book'))}${num(total('gain'))}${num(total('free'))}${num(total('vap'))}${num(total('exempt'))}${num(total('taxable'))}${withRest?num(total('rest')):''}${taxSum('capitalTax')}${taxSum('solidarity')}${taxSum('churchTax')}</tr></tfoot></table></div><p class="hint pad">Gewinn = Steuerfrei bis 2017 + Vorabpauschalen + Teilfreistellung + Steuerpflichtig${withRest?' + Übrige Differenz (Durchschnitt gegen FIFO, versteuerte Thesaurierungen)':''}. Steuerfrei bis 2017 gibt es nur bei Alt-Anteilen von vor 2009 (Zuwachs bis zum Kurs 31.12.2017) und Altaktien (ganzer Gewinn); bei Fonds von 2009 bis 2017 wird der Zuwachs als fiktiver Gewinn versteuert und steckt in „Steuerpflichtig“. Vorabpauschalen sind in den Vorjahren schon versteuert und mindern deshalb den Gewinn. Steuern laut Abrechnung, kursiv rechnerisch auf diesen Verkauf allein, vor Verlustverrechnung und Freistellungsauftrag.</p></div>`;
}

// Währungskonto wie ein Kontoblatt der Buchhaltung: Bestand in Währung, EUR-Buchwert
// nach FIFO, bei Abgängen EUR-Wert, Anschaffung und Währungsgewinn.
// Kontoblatt eines Währungskontos, zuklappbar; ab FOLD_FROM Bewegungen zunächst zu. open/key: von der Seite gemerkter Zustand.
const FOLD_FROM=30;
export function accountBlock(st,isLocked,{open=null,key=''}={}){
 const cur=esc(st.account.currency),multi=st.fromYear!==st.toYear,book=st.basis==='book',heading=book?'Buchhaltung zum USt-Umrechnungskurs':st.account.vatBook?'Steuerlich zum Tageskurs':`Kontoblatt ${cur}`;
 const lines=[];let y=st.fromYear;
 // Herkunft des EUR-Werts: Kurs laut Abrechnung oder EZB-Referenzkurs; ohne Angabe der EUR-Betrag laut Abrechnung.
 const quote=q=>!q?'':q.source==='vat'?`USt-Kurs ${q.rate.replace('.',',')} für ${q.date.slice(5)}/${q.date.slice(0,4)}${q.provisional?' (vorläufig)':''}`:q.source==='ecb'?`EZB-Referenzkurs ${q.rate.replace('.',',')} vom ${date(q.date)}`:`Kurs ${q.rate.replace('.',',')} laut Abrechnung`;
 const missing=st.lines.some(m=>m.eur==null&&(m.direction==='in'||m.realized)&&!isLocked(m));
 const yearRow=(year,cls)=>{const v=st.years.find(x=>x.year===year);return `<tr class="stand ${cls}"><td>Stand 31.12.${year}</td><td></td><td></td><td></td><td></td><td></td><td></td><td class="num">${pieces(v.balance)}</td>${num(v.bookValue)}</tr>`;};
 for(const m of st.lines){
  while(Number(m.date.slice(0,4))>y){if(multi)lines.push(yearRow(y,'year'));y++;}
  const locked=isLocked(m),tax=book?'':m.realized?m.regime==='capital'?'§ 20':m.taxable==null?'offen':D(m.taxable)!==0n?'§ 23':'außerhalb der Frist':'';
  lines.push(`<tr class="${['line','click',locked&&'locked'].filter(Boolean).join(' ')}" data-action="edit" data-id="${esc(m.eventId)}" tabindex="0"><td>${esc(m.label)}${m.realized&&m.regime==='private'&&m.parts.length>1?`<small>${m.parts.map(p=>`${pieces(p.amount)} vom ${p.acquired?date(p.acquired):'Bestand'}${p.within?' · innerhalb eines Jahres':p.within===false?' · außerhalb':''}`).join('; ')}</small>`:''}${m.quote?`<small>${esc(quote(m.quote))}</small>`:''}</td><td>${date(m.date)}</td><td class="num${D(m.amount)<0n?' neg':''}">${pieces(m.amount)}</td>${num(m.eur)}<td class="num">${m.realized?money(m.cost):''}</td><td class="num">${m.realized?money(m.gain):''}</td><td>${esc(tax)}${!book&&m.realized&&m.regime==='private'&&m.taxable!=null&&D(m.taxable)!==0n?`<small>${money(m.taxable)} steuerbar</small>`:''}</td><td class="num">${pieces(m.balance)}</td>${num(m.bookValue)}</tr>`);
 }
 for(;y<=st.toYear;y++)if(multi||y===st.toYear)lines.push(yearRow(y,y===st.toYear?'end':'year'));
 const k=`${key}:${st.basis}`,shown=open?.has(k)?open.get(k):st.lines.length<FOLD_FROM;
 return `<details class="block account fold" data-keep="${esc(k)}"${shown?' open':''}><summary><h3>${heading} ${span(st.fromYear,st.toYear)}</h3><small>${st.lines.length} ${st.lines.length===1?'Bewegung':'Bewegungen'} · Bestand 31.12.${st.toYear}: ${pieces(st.closing.balance)} ${cur}</small></summary><div class="table-wrap"><table class="sheet"><thead><tr><th>Vorgang</th><th>Datum</th><th class="num">${cur}</th><th class="num">EUR-Wert</th><th class="num">Anschaffung</th><th class="num">Währungsgewinn</th><th>${book?'':'Steuer'}</th><th class="num">Bestand ${cur}</th><th class="num">Buchwert EUR</th></tr></thead>
  <tbody><tr class="stand"><td>Stand 01.01.${st.fromYear}</td><td></td><td></td><td></td><td></td><td></td><td></td><td class="num">${pieces(st.opening.balance)}</td>${num(st.opening.bookValue)}</tr>${lines.join('')}</tbody>
  ${st.realized?`<tfoot><tr class="stand total"><td>Währungsgewinn ${span(st.fromYear,st.toYear)}</td><td></td><td></td><td></td><td></td>${num(st.gains)}<td></td><td></td><td></td></tr></tfoot>`:''}</table></div>
  ${book?'<p class="hint pad">Für die Buchhaltung: jede Bewegung zum Monatskurs des BMF. Steuerlich gilt der Kurs am Tag des Geschäfts (§ 20 Abs. 4 S. 1 EStG), die Steuer rechnet deshalb mit dem Tageskurs.</p>':''}${!book&&missing&&hasRates(st.account.currency)?`<p class="block-actions"><button class="button" data-action="fill-ecb" data-account="${esc(st.account.id)}">Fehlende EUR-Werte mit EZB-Referenzkursen ergänzen</button></p>`:''}</details>`;
}

function familyTotal(s,statements,securityId,to){
 const sec=s.securities.find(x=>x.id===securityId);
 const pick=basis=>statements.filter(p=>p.basis===basis);
 const add=list=>list.some(v=>v==null)?null:S(sum(list.map(D)));
 const quantity=add(pick('economic').flatMap(p=>p.rows.map(r=>r.closing.quantity)));
 const eco=add(pick('economic').map(p=>p.closing)),tax=add(pick('tax').map(p=>p.closing));
 return `<section class="card total-card"><h3>${esc(sec?.name||'Wertpapier')} · alle Depots zum 31.12.${to}</h3><dl class="figures"><div><dt>Stück</dt><dd>${pieces(quantity)}</dd></div>${pick('economic').length?`<div><dt>Buchwert</dt><dd title="${esc(exact(eco))}">${money(eco)}</dd></div>`:''}${pick('tax').length?`<div><dt>Steuerliche Basis</dt><dd title="${esc(exact(tax))}">${money(tax)}</dd></div>`:''}</dl><p class="hint">Summe über die Depots verschiedener Personen – zur Übersicht. Steuerlich zählt jede Person für sich.</p></section>`;
}

// Zeitraum von–bis nebeneinander; „bis“ ist das Jahr, das auch die Steuerseite zeigt.
export function periodControls(s,fromYear,toYear){
 const years=[];for(let y=Math.max(toYear,lastSelectableYear(s));y>=Math.min(2018,...s.events.map(e=>Number(e.date.slice(0,4))));y--)years.push(y);
 const options=(list,selected)=>list.map(y=>`<option value="${y}" ${y===selected?'selected':''}>${y}</option>`).join('');
 return `<div class="inline-field period" role="group" aria-label="Zeitraum"><span>Zeitraum</span><select id="from-year" aria-label="Von">${options(years.filter(y=>y<=toYear),fromYear)}</select><span class="sep">bis</span><select id="to-year" aria-label="Bis">${options(years,toYear)}</select></div>`;
}

// Kennzahlen oben: Summen der gezeigten Depots; bei einer Person dazu ihr Steuerjahr.
function kpis(s,{totals,personId,toYear}){
 const sumOf=list=>list.some(v=>v==null)?null:S(sum(list.map(D)));
 const tile=(cls,label,value,hint)=>`<div class="kpi ${cls}"><span>${label}</span><strong>${value}</strong><small>${hint}</small></div>`;
 const eco=sumOf(totals.economic),tax=sumOf(totals.tax),market=sumOf(totals.market);
 let status='';
 // Steuerkachel nur für Jahre des Modells; vor 2018 rechnet Depotklar keine Steuer.
 if(personId&&toYear>=FIRST_TAX_YEAR){
  let r=null;try{r=yearReport(s,personId,toYear);}catch{}
  const text=!r?'—':r.status==='supported'?`${money(r.total)} €`:r.status==='none'?'keine Erträge':statusLabel[r.status];
  const hint=!r?'':r.status==='supported'?(r.difference==null?'Steuer laut Modell':`laut Modell · ${Number(r.difference)>=0?'Erstattung':'Nachzahlung'} ${money(Math.abs(Number(r.difference)))} €`):r.status==='none'?'im Jahr erfasst':'Details auf der Steuerseite';
  status=`<button class="kpi status ${r?.status||''}" data-route="steuer"><span>Steuer ${toYear}</span><strong>${text}</strong><small>${hint}</small></button>`;
 }
 return `<section class="kpis">${totals.economic.length?tile('eco',`Buchwert 31.12.${toYear}`,`${money(eco)} €`,'wirtschaftlich, Anschaffungswerte'):''}${totals.tax.length?tile('tax',`Steuerliche Basis 31.12.${toYear}`,`${money(tax)} €`,'die ein Verkauf vom Erlös abzieht'):''}${totals.market.length?tile('market',`Marktwert 31.12.${toYear}`,market==null?'Offen':`${money(market)} €`,market==null?(toYear>=Number(today().slice(0,4))?'Jahr läuft noch, Dezemberkurs folgt':'Jahresendkurs fehlt'):'aus den Jahresendkursen'):''}${status}</section>`;
}

export function sheetHTML(s,{year,from=year,personId='',view='both',securityId='',lots=true,depotId=''}){
 if(!s.persons.length||!s.depots.length)return `<section class="empty"><h2>Noch keine Depots</h2><p>Lege eine Person und ein Depot an. Danach Bestände übernehmen oder Vorgänge erfassen.</p><button class="button primary" data-route="stammdaten">Stammdaten anlegen</button></section>`;
 const fromYear=Math.min(from,year),toYear=year,multi=fromYear!==toYear;
 const choosable=s.depots.filter(d=>!personId||d.personId===personId),chosen=choosable.find(d=>d.id===depotId)||null,depots=chosen?[chosen]:choosable;
 // Abschluss im Titel, wenn er für alle gezeigten Personen gleich ist; sonst je Depot.
 const shown=[...new Set(depots.map(d=>closedThrough(s,d.personId)))];
 const bases=view==='both'?Object.keys(BASES):[view];
 const all=[],fx=fxReplay(s,{until:`${toYear}-12-31`}),bookFx=(s.accounts||[]).some(a=>a.vatBook)?fxReplay(s,{until:`${toYear}-12-31`,basis:'book'}):null,events=new Map(s.events.map(e=>[e.id,e])),totals={economic:[],tax:[],market:[]};
 const badge=year=>year==null?'':` <span class="badge locked" title="Vorgänge bis 31.12.${year} sind gesperrt">Abgeschlossen bis ${year}</span>`;
 const cards=depots.map(d=>{
  const owner=s.persons.find(p=>p.id===d.personId)?.name,isLocked=lockCheck(s,events,d.personId);
  const sts=bases.map(b=>periodStatement(s,d.id,fromYear,toYear,b,{securityId}));all.push(...sts);
  const income=sts[0].income,accounts=securityId?[]:(s.accounts||[]).filter(a=>a.depotId===d.id).map(a=>accountStatement(s,a.id,fromYear,toYear,a.vatBook?{replayResult:bookFx,basis:'book'}:{replayResult:fx})).filter(st=>!st.empty);
  const has=sts.some(st=>st.rows.length)||income.length>0||accounts.length>0;
  if(!has&&securityId)return '';
  const eco=sts.find(st=>st.basis==='economic'),tax=sts.find(st=>st.basis==='tax');
  if(has&&sts.some(st=>st.rows.length)){if(eco)totals.economic.push(eco.closing);if(tax)totals.tax.push(tax.closing);totals.market.push((eco||tax).market);}
  // Währungskonten stehen im Reiter „Konten“; hier nur der Stand als Verweis.
  const accountLine=accounts.length?`<div class="block accounts-link"><span>Währungskonten</span>${accounts.map(st=>`<button class="link" data-route="konten">${esc(st.account.name)}: ${pieces(st.closing.balance)} ${esc(st.account.currency)} · Buchwert ${money(st.closing.bookValue)} €</button>`).join('')}</div>`:'';
  const figures=has?`<dl class="figures">${eco?`<div><dt>Buchwert 31.12.${toYear}</dt><dd title="${esc(exact(eco.closing))}">${money(eco.closing)}</dd></div>`:''}${tax?`<div><dt>Steuerliche Basis 31.12.${toYear}</dt><dd title="${esc(exact(tax.closing))}">${money(tax.closing)}</dd></div>`:''}${(eco||tax).market!=null?`<div><dt>Marktwert 31.12.${toYear}</dt><dd>${money((eco||tax).market)}</dd></div>`:''}</dl>`:'';
  return `<section class="depot"><header class="depot-head"><div><h2>${esc(d.name)}${shown.length>1?badge(closedThrough(s,d.personId)):''}</h2><p>${esc(owner)} · ${esc(d.bank||'Bank offen')}${d.account?` · Buchhaltung Konto ${esc(d.account)}`:''}</p></div>${figures}<button class="button" data-action="entry" data-depot="${esc(d.id)}">+ Vorgang</button></header>
   ${has?sts.filter(st=>st.rows.length).map(st=>block(st,isLocked,lots)).join('')+salesBlock(sts[0].sales,span(fromYear,toYear),isLocked)+incomeBlock(income,span(fromYear,toYear),isLocked)+accountLine:`<p class="muted pad">${multi?`Von ${fromYear} bis ${toYear}`:`Im Jahr ${toYear}`} keine Bestände und keine Vorgänge in diesem Depot.</p>`}</section>`;
 }).join('');
 const r=replay(s,{until:`${toYear}-12-31`});
 const issues=r.issues.filter(i=>!personId||s.depots.find(d=>d.id===i.depotId)?.personId===personId).filter(i=>!securityId||i.securityId===securityId).filter(i=>!chosen||i.depotId===chosen.id).filter(i=>!i.date||i.date.slice(0,4)<=String(toYear));
 const notice=issues.length?`<div class="notice"><strong>Offene Angaben</strong><ul>${[...new Set(issues.map(i=>i.reason))].slice(0,8).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>${issues.length>8?`<p>${issues.length-8} weitere.</p>`:''}<p>Betroffene Werte stehen als „Offen“ im Blatt und werden nicht durch null ersetzt.</p></div>`:'';
 const depotChoice=choosable.length>1?`<label class="inline-field"><span>Depot</span><select id="depot-filter" class="${chosen?'active':''}"><option value="">Alle</option>${choosable.map(d=>`<option value="${esc(d.id)}" ${d.id===chosen?.id?'selected':''}>${esc(d.name)}${personId?'':` · ${esc(s.persons.find(p=>p.id===d.personId)?.name||'')}`}</option>`).join('')}</select></label>`:'';
 const controls=`${periodControls(s,fromYear,toYear)}
  ${depotChoice}<label class="inline-field"><span>Wertpapier</span><select id="security-filter" class="${securityId?'active':''}"><option value="">Alle</option>${s.securities.map(x=>`<option value="${esc(x.id)}" ${x.id===securityId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`;
 const person=s.persons.find(p=>p.id===personId),title=`${person?`${esc(person.name)} · `:''}${chosen?`${esc(chosen.name)} · `:''}${multi?`Übersicht ${fromYear}–${toYear}`:`Jahresübersicht ${toYear}`}`;
 // Ist ein Wertpapier gewählt, enthalten PDF und Excel nur dieses; die Hinweise sagen es.
 const only=securityId?esc(s.securities.find(x=>x.id===securityId)?.name||''):'',pdfIcon='<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg>';
 return `<div class="page-head"><div><h1>${title}${shown.length===1?badge(shown[0]):''}</h1><p>Je Depot die Fortschreibung vom 01.01. zum 31.12. – wirtschaftlich mit den Anschaffungswerten der Buchhaltung im gleitenden Durchschnitt, steuerlich nach FIFO mit der Basis, die ein Verkauf vom Erlös abzieht.${multi?' Über mehrere Jahre steht der Stand 31.12. jedes Jahres als Zwischenzeile.':''} Eine Zeile anklicken, um den Vorgang zu ändern.</p></div></div>
  ${kpis(s,{totals,personId,toYear})}
  <div class="toolbar head-actions"><div class="toolbar-group">${controls}<div class="segmented" role="group" aria-label="Betrachtung">${[['both','Beide'],['economic','Wirtschaftlich'],['tax','Steuerlich']].map(([v,l])=>`<button data-action="view" data-view="${v}" class="${view===v?'on':''}">${l}</button>`).join('')}</div>${view==='economic'?'':`<label class="inline-field check" title="Lose zum 31.12. unter jedem Wertpapier im steuerlichen Blatt"><input type="checkbox" id="show-lots" ${lots?'checked':''}><span>Lose zeigen</span></label>`}</div><div class="toolbar-group"><button class="button" data-action="closing">Jahresabschluss</button><div class="button-group" role="group" aria-label="Export"><button class="button" data-action="export-pdf-overview" title="${only?`Nur ${only}: je Depot beide Betrachtungen`:'Je Depot beide Betrachtungen aller Wertpapiere, Erträge und Währungskonten'} – öffnet die Vorschau">${pdfIcon}PDF Übersicht</button><button class="button" data-action="export-pdf" title="${only?`Nur ${only}: je Depot`:'Je Wertpapier'} eine Seite im Querformat, oben wirtschaftlich, unten steuerlich – öffnet die Vorschau">${pdfIcon}PDF je Wertpapier</button><button class="button" data-action="export-xlsx" title="${only?`Nur ${only} in Depot-, Wertpapier- und Vorgangsblättern; Steuer, Schenkungen und Protokoll der Person vollständig`:'Je Depot und je Wertpapier ein Blatt, dazu Steuer, Schenkungen, Vorgänge und Protokoll'}"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Excel</button></div></div></div>
  ${notice}${securityId?familyTotal(s,all,securityId,toYear):''}${cards||`<p class="muted">${securityId?'Dieses Wertpapier liegt im Zeitraum in keinem der gewählten Depots.':'Für diese Person sind keine Depots angelegt.'}</p>`}`;
}
