import {periodStatement,BASES} from '../core/statement.mjs';
import {D,S,sum} from '../core/decimal.mjs';
import {yearReport,calcLines} from '../core/year.mjs';
import {replay} from '../core/ledger.mjs';
import {giftAssessments,remainingAllowance} from '../core/gifttax.mjs';
import {EVENT_TYPES,TRANSFER_KINDS,ALLOCATIONS,FX_KINDS,ACCOUNT_KINDS,TAX_PARTS,today,eventPersons,securityPersons,accountHolder,withholdingOf,incomeType,lastSelectableYear} from '../core/model.mjs';
import {fxReplay,accountStatement,accountLots,accountInterest,balanceCheckResults} from '../core/fx.mjs';
import {KINDS,RELATIONS,GROUPS} from '../core/rules.mjs';
import {statusLabel} from './format.mjs';
import {auditEntries,subject,changes,auditStamp} from './audit.mjs';
import {blocksFromRows,isTotalRow,isPieceColumn,isRateColumn,isoDate} from './report.mjs';
import {filingSections} from './filing.mjs';
import {workingsSheet} from './workings.mjs';

// Übersicht als Excel: je Depot ein Blatt und je Wertpapier ein Blatt wie das frühere
// Excel-Blatt – wirtschaftlich oben, steuerlich darunter, quer auf eine Seitenbreite.
// Über mehrere Jahre mit dem Stand 31.12. jedes Jahres als Zwischenzeile.
// Dazu je Person das Steuerjahr mit seinem Rechenweg in Formeln, die Schenkungen, alle Vorgänge
// und das Protokoll.
// Unbekannte Werte bleiben leere Zellen mit dem Vermerk „offen“, nie 0.
const n=v=>v==null?null:Number(v);
const span=(a,b)=>a===b?String(b):`${a}–${b}`;
const day=d=>d?d.split('-').reverse().join('.'):null;
export function sheetRows(s,depotId,{from,to,securityId='',maxYears=Infinity}){
 const rows=[];let income=[],sales=[];
 for(const basis of Object.keys(BASES)){
  const ps=periodStatement(s,depotId,from,to,basis,{securityId});income=ps.income;sales=ps.sales;
  rows.push([`${BASES[basis]} ${span(from,to)}`],['Wertpapier / Vorgang','Datum','Stück','Wert','Erlös','Gewinn','Bestand Stück','Bestand Wert','Hinweis']);
  for(const r of ps.rows){
   rows.push([`${r.security.name} ${r.security.isin||''}`.trim()]);
   rows.push([`Stand 01.01.${r.firstYear}`,null,null,null,null,null,n(r.opening.quantity),n(r.opening.value),r.opening.value==null?'offen':null]);
   for(const seg of r.segments){
    for(const l of seg.lines){const from=l.from?.length?`aus ${l.from.map(f=>`${f.acquired||GROUPS[f.group]} · ${Number(f.quantity)} Stück`).join('; ')}`:null;rows.push([l.label,l.date,n(l.quantity)||null,n(l.value),n(l.proceeds),n(l.gain),n(l.balanceQuantity),n(l.balanceValue),l.value==null?'offen':[l.note,from].filter(Boolean).join(' · ')||null]);}
    rows.push([`Stand 31.12.${seg.year}`,null,null,null,null,null,n(seg.closing.quantity),n(seg.closing.value),seg.unitValue==null?null:`${Number(seg.unitValue).toFixed(4)} je Stück`]);
    // Lose zum Ende des Zeitraums in FIFO-Reihenfolge.
    if(seg.year===to)for(const l of seg.lots||[])rows.push([`Los ${l.n} · ${l.acquired||`Erwerb ${GROUPS[l.group]}`} · ${l.origin}`,null,null,null,null,null,n(l.quantity),n(l.value),l.bought!=null&&Number(l.bought)!==Number(l.quantity)?`von ${Number(l.bought)} Stück`:null]);
   }
  }
  rows.push([`Summe Stand 31.12.${to}`,null,null,null,ps.sold?n(ps.proceeds):null,ps.sold?n(ps.gains):null,null,n(ps.closing)]);
  if(ps.ledgerCheck)rows.push([`Buchhaltung Konto ${ps.depot.account||''}`,ps.ledgerCheck.date,null,null,null,null,null,n(ps.ledgerCheck.balance),ps.ledgerCheck.difference==null?'Vergleich offen':`Differenz ${ps.ledgerCheck.difference}`]);
  rows.push([]);
 }
 rows.push(...saleRows(sales,from,to));
 // Erträge ohne Bestandswirkung: Zinsen, Ausschüttungen, Dividenden.
 if(income.length){
  const sumOf=k=>n(S(sum(income.map(i=>D(i[k])))));
  rows.push([`Erträge ${span(from,to)}`],['Wertpapier / Ertrag','Datum','Art','Brutto','Teilfreistellung','Steuerpflichtig','Quellensteuer','Steuerabzug','Hinweis']);
  for(const i of income)rows.push([i.name,i.date,i.label,n(i.gross),n(i.exempt),n(i.taxable),n(i.foreignTax),n(i.withheld),null]);
  rows.push(['Summe Erträge',null,null,sumOf('gross'),sumOf('exempt'),sumOf('taxable'),null,null,null]);
  rows.push([]);
 }
 if(!securityId)rows.push(...accountRows(s,(s.accounts||[]).filter(x=>x.depotId===depotId),from,to,{maxYears}));
 return rows;
}
// Verkäufe für die Buchung; die Spalte „Übrige Differenz“ nur, wenn es eine gibt.
export function saleRows(list,from,to){
 if(!list.length)return [];
 const withRest=list.some(i=>i.rest!=null&&D(i.rest)!==0n),total=k=>list.some(i=>i[k]==null)?null:n(S(sum(list.map(i=>D(i[k]))))),taxTotal=k=>list.some(i=>i.taxes?.[k]==null)?null:n(S(sum(list.map(i=>D(i.taxes[k])))));
 const rows=[[`Verkäufe ${span(from,to)}`],['Wertpapier / Verkauf','Datum','Erlös','Buchwert','Gewinn','Steuerfrei bis 2017','Vorabpauschalen','Teilfreistellung','Steuerpflichtig',...(withRest?['Übrige Differenz']:[]),'KapESt','Soli','KiSt','Steuern']];
 for(const i of list)rows.push([`${i.name}${i.historic?' · altes Recht':i.commodity?' · § 23 EStG':''}`,i.date,n(i.proceeds),n(i.book),n(i.gain),n(i.free),n(i.vap),n(i.exempt),n(i.taxable),...(withRest?[n(i.rest)]:[]),n(i.taxes?.capitalTax??null),n(i.taxes?.solidarity??null),n(i.taxes?.churchTax??null),i.taxes?.source==='Abrechnung'?'laut Abrechnung':i.taxes?.source||null]);
 rows.push(['Summe Verkäufe',null,total('proceeds'),total('book'),total('gain'),total('free'),total('vap'),total('exempt'),total('taxable'),...(withRest?[total('rest')]:[]),taxTotal('capitalTax'),taxTotal('solidarity'),taxTotal('churchTax'),null],[]);
 return rows;
}
// Kontoblätter von Währungskonten als Zeilen – für das Depotblatt, das Kontenblatt
// eigenständiger Konten und die PDF-Übersicht.
// Matrix der Lose als Tabelle: Kopf, Zeilen und Summe, gemeinsam für Excel und PDF.
export function lotTable(m,book=null){
 const cur=m.account.currency,earlier=m.rows.some(r=>D(r.earlier)!==0n),vat=Boolean(book),free=m.account.kind==='payment',zero=v=>D(v)===0n?null:n(v);
 const head=['Herkunft','Angeschafft',`Zugang ${cur}`,'Devisenkurs','EUR-Wert',...(vat?['EUR zum USt-Kurs']:[]),...(earlier?[`Abgang bis ${m.earlierUntil??m.fromYear-1}`]:[]),...m.years.map(y=>`Abgang ${y}`),`Rest ${cur}`,'Rest EUR',...(vat?['Rest zum USt-Kurs']:[]),...(free?['Steuerfrei ab']:[])];
 const spent=o=>[...(earlier?[zero(o.earlier)]:[]),...m.years.map(y=>zero(o.perYear[y]))];
 const rows=m.rows.map((r,i)=>[r.via?`${r.origin} · ${r.via}`:r.origin,r.acquired||r.opened,n(r.amount),n(r.rate),n(r.cost),...(vat?[n(book.rows[i]?.cost??null)]:[]),...spent(r),n(r.rest),n(r.restCost),...(vat?[n(book.rows[i]?.restCost??null)]:[]),...(free?[D(r.rest)>0n?r.freeFrom:null]:[])]);
 return {head,rows,total:['Summe Lose',null,n(m.totals.amount),null,n(m.totals.cost),...(vat?[n(book.totals.cost)]:[]),...spent(m.totals),n(m.totals.rest),n(m.totals.restCost),...(vat?[n(book.totals.restCost)]:[]),...(free?[null]:[])],spentFrom:vat?6:5,spentCount:(earlier?1:0)+m.years.length,restAt:head.indexOf(`Rest ${cur}`)};
}
// Jeder Verbrauch einzeln: welcher Abgang welches Los wie weit aufgebraucht hat.
function useRows(m){
 const list=m.rows.flatMap(r=>r.uses.map(u=>({...u,lot:r}))).filter(u=>u.date>=`${m.fromYear}-01-01`).sort((a,b)=>a.date.localeCompare(b.date));
 if(!list.length)return [];
 return [[`${m.account.name} · Verbrauch je Abgang ${span(m.fromYear,m.toYear)}`],['Abgang','Datum',m.account.currency,'Los angeschafft','Anschaffung EUR','EUR-Wert','Gewinn','Frist'],...list.map(u=>[u.label,u.date,n(u.amount),u.lot.acquired||u.lot.opened,n(u.cost),n(u.proceeds),n(u.gain),u.within==null?null:u.within?'innerhalb eines Jahres':'außerhalb']),[]];
}
// Zinsen eines Kontos mit dem erfassten Steuerabzug.
function interestRows(s,a,from,to){
 const r=accountInterest(s,a.id,from,to),t=r.totals;if(!r.lines.length)return [];
 return [[`${a.name} · Zinsen ${span(from,to)}`],['Datum','Brutto EUR','Kapitalertragsteuer','Solidaritätszuschlag','Kirchensteuer',a.currency,'Devisenkurs','EUR-Wert'],...r.lines.map(l=>[l.date,n(l.gross),n(l.capitalTax),n(l.solidarity),n(l.churchTax),n(l.credit),n(l.rate),n(l.eur)]),['Summe Zinsen',n(t.gross),n(t.capitalTax),n(t.solidarity),n(t.churchTax),n(t.credit),null,n(t.eur)],[]];
}
// maxYears: Jahresspalten der Matrix der Lose für das PDF begrenzen (mit USt-Spalten zwei weniger); Excel zeigt jedes Jahr.
export function accountRows(s,accounts,from,to,{lots=true,details=false,maxYears=Infinity}={}){
 const rows=[],fx=fxReplay(s,{until:`${to}-12-31`}),bookFx=accounts.some(a=>a.vatBook)?fxReplay(s,{until:`${to}-12-31`,basis:'book'}):null,checks=balanceCheckResults(s,{replayResult:fx,until:`${to}-12-31`});
 for(const a of accounts){
  const st=accountStatement(s,a.id,from,to,{replayResult:fx});if(st.empty)continue;
  // Buchhaltung zum USt-Umrechnungskurs vor dem Blatt zum Tageskurs, das die Steuer rechnet.
  if(a.vatBook){
   const b=accountStatement(s,a.id,from,to,{replayResult:bookFx,basis:'book'});
   rows.push([`${a.name} · ${a.currency} ${span(from,to)} · Buchhaltung zum USt-Umrechnungskurs`],['Vorgang','Datum',a.currency,'EUR-Wert','Anschaffung','Währungsgewinn',`Bestand ${a.currency}`,'Buchwert EUR','USt-Devisenkurs']);
   rows.push([`Stand 01.01.${from}`,null,null,null,null,null,n(b.opening.balance),n(b.opening.bookValue)]);
   for(const m of b.lines)rows.push([m.label,m.date,n(m.amount),n(m.eur),m.realized?n(m.cost):null,m.realized?n(m.gain):null,n(m.balance),n(m.bookValue),n(m.quote?.rate??null)]);
   for(const y of b.years)rows.push([`Stand 31.12.${y.year}`,null,null,null,null,null,n(y.balance),n(y.bookValue)]);
   rows.push([]);
  }
  rows.push([`${a.name} · ${a.currency} ${span(from,to)}${a.vatBook?' · Steuerlich zum Tageskurs':''}`],['Vorgang','Datum',a.currency,'EUR-Wert','Anschaffung','Währungsgewinn',`Bestand ${a.currency}`,'Buchwert EUR','Steuer']);
  rows.push([`Stand 01.01.${from}`,null,null,null,null,null,n(st.opening.balance),n(st.opening.bookValue)]);
  for(const m of st.lines)rows.push([m.label,m.date,n(m.amount),n(m.eur),m.realized?n(m.cost):null,m.realized?n(m.gain):null,n(m.balance),n(m.bookValue),m.realized?m.regime==='capital'?'§ 20 EStG':m.taxable==null?'offen':`§ 23 EStG, steuerbar ${Number(m.taxable).toFixed(2)}`:null]);
  for(const y of st.years)rows.push([`Stand 31.12.${y.year}`,null,null,null,null,null,n(y.balance),n(y.bookValue)]);
  for(const c of checks.filter(c=>c.accountId===a.id&&c.date>=`${from}-01-01`))rows.push(['Kontostand laut Bank',c.date,null,null,null,null,n(c.balance),null,D(c.difference)===0n?'stimmt mit dem Bestand':`Differenz ${Number(c.difference)} ${a.currency} zum Bestand ${Number(c.booked)}`]);
  rows.push([],...interestRows(s,a,from,to));
  if(lots){
   const cap=a.vatBook?Math.max(1,maxYears-2):maxYears;
   const m=accountLots(s,a.id,from,to,{replayResult:fx,maxYears:cap}),t=m.rows.length?lotTable(m,a.vatBook?accountLots(s,a.id,from,to,{replayResult:bookFx,basis:'book',maxYears:cap}):null):null;
   if(t)rows.push([`${a.name} · Lose ${span(from,to)}${m.hidden?` · ohne ${m.hidden} vorher aufgebrauchte`:''}`],t.head,...t.rows,t.total,[]);
   if(t&&details)rows.push(...useRows(m));
  }
 }
 return rows;
}
// Währungskonten ohne Depot, je Person.
export const standaloneAccounts=(s,personId='')=>(s.accounts||[]).filter(a=>!a.depotId&&(!personId||a.personId===personId));

// Steuerjahr einer Person: Erträge, Jahresrechnung, Abgleich mit der Bank, Werte für die Erklärung.
export function taxRows(s,personId,year){
 const r=yearReport(s,personId,year),person=s.persons.find(p=>p.id===personId),sec=id=>s.securities.find(x=>x.id===id),depot=id=>s.depots.find(d=>d.id===id);
 const rows=[[`Steuer ${year} · ${person.name}`],['Status',statusLabel[r.status]||r.status],...r.reasons.map(x=>['Offen',x.text]),...(r.hints||[]).map(x=>['Hinweis',x]),[]];
 rows.push(['Datum','Ertrag','Art','Vor Teilfreistellung','Teilfreistellung','Steuerpflichtig','Alt-Anteile-Freibetrag','Verbleibt','Quellensteuer']);
 for(const i of r.items){
  const m=i.ref,x=sec(m.securityId),type=incomeType(i,x);
  const what=i.kind==='other'?`${m.label} · ${depot(m.depotId)?.name||''}`:i.kind==='fx'?`${(s.accounts||[]).find(a=>a.id===m.accountId)?.name||'Währungskonto'} · ${m.label}`:!m.depotId&&m.accountId?`${(s.accounts||[]).find(a=>a.id===m.accountId)?.name||'Währungskonto'} · ${m.bank||''}`:x?x.name:`${depot(m.depotId)?.name||''} · ${depot(m.depotId)?.bank||''}`;
  rows.push([m.date,what,`${type}${x?' · '+KINDS[x.kind]:''}`,n(i.gross),n(i.exempt),n(i.taxable),n(i.allowance??null),n(i.taxableAfter??null),i.kind==='distribution'?n(m.income.foreignTax):null]);
 }
 if(!r.items.length)rows.push(['Keine Erträge erfasst']);
 rows.push([]);
 if(r.checks?.length){
  rows.push(['Kontrolle je Abrechnung'],['Datum','Vorgang','Art','Laut Bank','Laut Depotklar','Abweichung','Hinweis']);
  for(const c of r.checks)rows.push([c.date,sec(c.securityId)?.name||'',c.kind==='sale'?'Verkauf · Gewinn vor Teilfreistellung':`Vorabpauschale ${c.year} · ${c.from==='unit'?'aus Steuerinformation':'aus Jahreskursen'}`,n(c.bank),n(c.model),n(c.difference),c.hint]);
  rows.push([]);
 }
 if(r.status==='supported'){
  rows.push(['Jahresrechnung']);
  for(const [label,v] of calcLines(r))rows.push([label,null,null,n(v)]);
  for(const w of r.withholding||[])rows.push([`Einbehalten ${w.bank}`,w.abroad?'ausländische Bank':w.source==='certificate'?'Jahressteuerbescheinigung':'Einzelabrechnungen',w.missing||(w.parts?`KapESt ${w.parts.capitalTax} · Soli ${w.parts.solidarity} · KiSt ${w.parts.churchTax}`:w.amount!=null?'nur als Summe erfasst':null),n(w.amount)]);
  if(r.taxDifference)for(const [k,l] of Object.entries(TAX_PARTS))rows.push([`${l}: einbehalten / laut Modell / Differenz`,n(r.bankTaxes[k]),n(r[k]),n(r.taxDifference[k])]);
  rows.push(['Einbehalten laut Bank',null,null,n(r.bankWithheld)],[r.difference==null?'Abgleich offen':Number(r.difference)>=0?'Erwartete Erstattung':'Erwartete Nachzahlung',null,null,r.difference==null?null:Math.abs(Number(r.difference))]);
  rows.push(['Vortrag Aktienverlust 01.01.'+(year+1),null,null,n(r.carry.stockLoss)],['Vortrag sonstiger Verlust 01.01.'+(year+1),null,null,n(r.carry.otherLoss)],['Rest-Freibetrag Alt-Anteile 01.01.'+(year+1),null,null,n(r.carry.protectedRemaining)]);
 }
 if(r.privateSales){
  const p=r.privateSales;
  const where=[p.moves.some(m=>m.accountId)?'Währungskonten':'',p.moves.some(m=>m.securityId)?'ETCs':''].filter(Boolean).join(' und ');
  rows.push([],[`Private Veräußerungsgeschäfte (Anlage SO) · ${where}`],['Datum','Konto / ETC','Abgang','EUR-Wert','Anschaffung','Gewinn','Innerhalb der Frist']);
  for(const m of p.moves)rows.push([m.date,m.name||(s.accounts||[]).find(a=>a.id===m.accountId)?.name||'',`${m.label} · ${-Number(m.amount)} ${m.currency}`,n(m.proceeds),n(m.cost),n(m.gain),n(m.taxable)]);
  rows.push(['Gewinn innerhalb der Frist',null,null,null,null,null,n(p.total)],[`Freigrenze ${year}`,null,null,null,null,null,n(p.limit)],[Number(p.taxable)<0?'Verlust':'Steuerpflichtig',null,null,null,null,null,n(p.taxable)]);
 }
 // Werte für die Erklärung, nach Formular gegliedert wie auf der Steuerseite.
 for(const x of filingSections(r)){
  rows.push([],[x.title],[x.note]);
  if(x.rows.length){rows.push(x.head);for(const row of x.rows)rows.push([row[0],...row.slice(1).map(n)]);}
 }
 return rows;
}

// Schenkungen je Schenker und Empfänger mit Zehnjahresrechnung (§ 14 ErbStG).
// Schenkungen je Schenker und Empfänger; mit Person nur die Paare, an denen sie beteiligt ist.
export function giftRows(s,{personId=''}={}){
 const asOf=today(),until=`${lastSelectableYear(s)}-12-31`,moves=[...replay(s,{until}).moves,...fxReplay(s,{until}).moves],name=id=>s.persons.find(p=>p.id===id)?.name||'';
 const pairs=new Map(),add=(d,r)=>{if(d&&r&&d!==r)pairs.set(`${d}|${r}`,[d,r]);};
 for(const r of s.relations)add(r.donorId,r.recipientId);
 for(const m of moves)if((m.type==='transfer'||m.type==='fx')&&m.direction==='out'&&m.transferKind==='gift')add(m.personId,m.counterpartPersonId);
 for(const g of s.priorGifts)add(g.donorId,g.recipientId);
 if(personId)for(const [k,[d,r]] of pairs)if(d!==personId&&r!==personId)pairs.delete(k);
 const rows=[['Schenker','Empfänger','Verhältnis','Datum','Erwerb','Wert','Vorerwerbe 10 Jahre','Schenkungsteuer','Status']];
 for(const [donor,recipient] of pairs.values()){
  const a=giftAssessments(s,moves,donor,recipient),rest=remainingAllowance(s,moves,donor,recipient,asOf),relation=a.relation?RELATIONS[a.relation].label:'offen';
  for(const g of a.acquisitions)rows.push([name(donor),name(recipient),relation,g.date,g.parts.map(p=>p.source==='depot'?`${s.securities.find(x=>x.id===p.securityId)?.name} · ${p.quantity} Stück`:p.source==='fx'?`${(s.accounts||[]).find(x=>x.id===p.accountId)?.name||'Währungskonto'} · ${p.amount} ${p.currency}`:`Außerhalb Depotklar${p.note?' · '+p.note:''}`).join('; '),n(g.value),n(g.priorValue),g.status==='supported'?n(g.tax):null,statusLabel[g.status]||g.status]);
  if(rest.status==='supported')rows.push([name(donor),name(recipient),relation,asOf,'Noch steuerfrei übertragbar',n(rest.remaining),n(rest.used),null,rest.frees?`Ältester Erwerb fällt am ${day(rest.frees)} heraus`:null]);
 }
 return rows.length>1?rows:[];
}

// Alle Vorgänge im Zeitraum, so wie erfasst.
export function eventRows(s,{from,to,personId='',securityId='',depotId=''}){
 const depot=id=>s.depots.find(d=>d.id===id),person=id=>s.persons.find(p=>p.id===id)?.name||'',sec=id=>s.securities.find(x=>x.id===id);
 const account=id=>(s.accounts||[]).find(a=>a.id===id);
 const list=s.events.filter(e=>e.date>=`${from}-01-01`&&e.date<=`${to}-12-31`).filter(e=>!securityId||e.securityId===securityId||e.toSecurityId===securityId).filter(e=>!depotId||e.depotId===depotId||e.toDepotId===depotId)
  .filter(e=>!personId||eventPersons(s,e).includes(personId)).sort((a,b)=>a.date.localeCompare(b.date));
 const rows=[['Datum','Vorgang','Depot','Person','Wertpapier','ISIN','Stück','Betrag','Steuerabzug','Kapitalertragsteuer','Solidaritätszuschlag','Kirchensteuer','Quellensteuer','An Depot','Kurs am Stichtag','Währungskonto','Betrag in Währung','Devisenkurs','Notiz']];
 for(const e of list){
  const x=sec(e.securityId),what=e.type==='merger'?`${x?.kind==='stock'?'Aktientausch':EVENT_TYPES.merger} in ${sec(e.toSecurityId)?.name||''}`:e.type==='otherIncome'?`${EVENT_TYPES.otherIncome} · ${e.label}`:e.type==='transfer'?`${TRANSFER_KINDS[e.kind]}${e.batchId?` an mehrere · ${ALLOCATIONS[e.allocation]}`:''}`:e.type==='vap'?`${EVENT_TYPES.vap} ${e.year}`:e.type==='fx'?`${EVENT_TYPES.fx} · ${FX_KINDS[e.kind]}`:EVENT_TYPES[e.type];
  const fx=e.type==='fx'?{accountId:e.accountId,amount:e.amount,rate:e.rate}:e.fx;
  rows.push([e.date,what,depot(e.depotId)?.name||'',person(depot(e.depotId)?.personId??accountHolder(s,account(e.accountId||e.fx?.accountId))?.personId),x?.name||'',x?.isin||'',n(e.quantity??e.toQuantity??null),n(e.type==='fx'?e.eur??null:e.amount??e.cash??e.cost??null),...(w=>[n(w.total),n(w.parts?.capitalTax??null),n(w.parts?.solidarity??null),n(w.parts?.churchTax??null)])(withholdingOf(e)),n(e.foreignTax??null),e.toDepotId?depot(e.toDepotId)?.name||'':e.toAccountId?account(e.toAccountId)?.name||'':'',n(e.price??null),fx?`${account(fx.accountId)?.name||''} · ${account(fx.accountId)?.currency||''}`:'',n(fx?.amount??null),n(fx?.rate??null),e.note||'']);
 }
 return rows;
}

// Gehört ein Protokolleintrag zu einer Person? Vorgänge über die Depots, Stammdaten über den
// Inhaber, Kurse über die Personen mit diesem Wertpapier.
export function auditInvolves(s,a,personId){
 const r=a.after||a.before||{},owner=id=>s.depots.find(d=>d.id===id)?.personId,ref=String(a.ref||'');
 if(a.collection==='persons')return a.ref===personId;
 if(a.collection==='depots')return r.personId===personId||a.before?.personId===personId;
 if(a.collection==='accounts')return [a.before,a.after].filter(Boolean).some(x=>(x.depotId?owner(x.depotId):x.personId)===personId);
 if(a.collection==='ledgerChecks')return owner(r.depotId)===personId;
 if(a.collection==='balanceChecks')return accountHolder(s,(s.accounts||[]).find(x=>x.id===r.accountId))?.personId===personId;
 if(a.collection==='certificates')return r.personId===personId;
 if(a.collection==='priorGifts')return r.donorId===personId||r.recipientId===personId;
 if(a.collection==='securities')return securityPersons(s,a.ref).includes(personId);
 // Jahreswerte und USt-Kurse gelten für alle Personen.
 if(ref.startsWith('rules:')||ref.startsWith('vat:'))return true;
 if(ref.startsWith('closing:'))return ref===`closing:${personId}`;
 if(s.persons.some(p=>ref.startsWith(`${p.id}:`))&&/:\d{4}$/.test(ref))return ref.startsWith(`${personId}:`);
 if(r.type)return [a.before,a.after].filter(Boolean).some(e=>eventPersons(s,e).includes(personId));
 if(r.securityId&&(r.date||r.perUnit!=null))return securityPersons(s,r.securityId).includes(personId);
 return false;
}
export function auditRows(s,{filter='',personId=''}={}){
 return [['Zeitpunkt','Aktion','Gegenstand','Grund','Änderung'],...auditEntries(s,{filter}).filter(a=>!personId||auditInvolves(s,a,personId)).map(a=>[auditStamp(a.at),a.text,subject(s,a),a.reason||'',changes(s,a).join('; ')])];
}

// Zeilen mit Gliederung in ein Blatt schreiben: Überschriften und Gruppen fett, Tabellenkopf
// farbig je Betrachtung, Bestände und Summen fett, Daten als echte Datumswerte.
const FILL={economic:'FFEDF3FB',tax:'FFFBF3E6',plain:'FFF2F4F7'},INK={economic:'FF1F4F8F',tax:'FF94560F',plain:'FF101828'};
function writeRows(ws,rows){
 let tone='plain',head=null;
 for(const block of blocksFromRows(rows)){
  if(block.title){tone=/^Wirtschaftliche/.test(block.title)?'economic':/^Steuerliche/.test(block.title)?'tax':'plain';const r=ws.addRow([block.title]);r.font={bold:true,size:12,color:{argb:INK[tone]}};}
  head=block.head;
  if(head){const r=ws.addRow(head);r.font={bold:true,color:{argb:INK[tone]}};r.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:FILL[tone]}};c.border={bottom:{style:'thin',color:{argb:'FFD0D5DD'}}};});}
  for(const cells of block.rows){
   const r=ws.addRow(cells.map(v=>isoDate(v)?new Date(`${v}T00:00:00Z`):v));
   cells.forEach((v,i)=>{const c=r.getCell(i+1);if(isoDate(v))c.numFmt='dd.mm.yyyy';else if(typeof v==='number')c.numFmt=head&&isRateColumn(head[i])?'0.0000':head&&isPieceColumn(head[i])?'#,##0.####':'#,##0.00';});
   if(cells.length===1)r.font={bold:true};
   if(isTotalRow(cells))r.eachCell(c=>{c.font={bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF6F7F9'}};});
  }
  ws.addRow([]);
 }
}
// Kopf eines Blatts und Seiteneinrichtung: A4 quer, eine Seitenbreite.
function sheetHead(ws,title,lines){
 const t=ws.addRow([title]);t.font={bold:true,size:14};
 for(const l of lines.filter(Boolean))ws.addRow([l]).font={color:{argb:'FF475467'}};
 ws.addRow([]);
 ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.2,footer:0.2}};
}

// Blattnamen höchstens 31 Zeichen; liegt ein Wertpapier in mehreren Depots, folgt der Depotname.
function sheetMaker(book){
 const used=new Set(),clean=t=>t.replace(/[\\/*?:[\]]/g,' ').trim();
 return (title,widths,suffix='',limit=28)=>{
  let name=clean(title).slice(0,limit)||'Blatt';
  if(used.has(name)&&suffix){const tail=clean(suffix).slice(0,18);name=`${clean(title).slice(0,Math.max(8,29-tail.length))}… ${tail}`.slice(0,31);}
  while(used.has(name))name=name.slice(0,26)+'_'+used.size;
  used.add(name);const ws=book.addWorksheet(name);ws.columns=widths.map(width=>({width}));return ws;
 };
}
const WIDTHS=[46,12,12,16,16,16,14,18,36,14,14,14,14,16];

// Matrix der Lose eines Kontos: Rest als Formel aus Zugang und Abgängen, Summen als Formel, Filter und feste Kopfzeile.
function lotsSheet(ws,m,book,title,lines){
 sheetHead(ws,title,lines);
 const t=lotTable(m,book),letter=i=>ws.getColumn(i+1).letter,head=ws.addRow(t.head),first=head.number+1;
 head.eachCell(c=>{c.font={bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF4F1'}};c.alignment={wrapText:true,vertical:'bottom'};});
 const put=(r,v,i)=>{const c=r.getCell(i+1);c.numFmt=isoDate(v)?'dd.mm.yyyy':isRateColumn(t.head[i])?'0.0000':isPieceColumn(t.head[i])?'#,##0.####':'#,##0.00';};
 for(const cells of t.rows){
  const r=ws.addRow(cells.map(v=>isoDate(v)?new Date(`${v}T00:00:00Z`):v));cells.forEach((v,i)=>put(r,v,i));
  const last=t.spentFrom+t.spentCount-1,spent=t.spentCount?`-SUM(${letter(t.spentFrom)}${r.number}:${letter(last)}${r.number})`:'';
  r.getCell(t.restAt+1).value={formula:`${letter(2)}${r.number}${spent}`,result:cells[t.restAt]};
 }
 const end=ws.lastRow.number,sum=ws.addRow(t.total.map((v,i)=>typeof v==='number'?{formula:`SUM(${letter(i)}${first}:${letter(i)}${end})`,result:v}:v));
 t.total.forEach((v,i)=>put(sum,v,i));
 sum.eachCell(c=>{c.font={bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF6F7F9'}};});
 ws.autoFilter={from:{row:head.number,column:1},to:{row:end,column:t.head.length}};
 ws.views=[{state:'frozen',xSplit:2,ySplit:head.number}];
 ws.addRow([]);
 writeRows(ws,useRows(m));
}

// Eigene Mappe für die Seite „Konten“: je Konto das Kontoblatt mit Zinsen und ein Blatt mit der Matrix der Lose.
export async function accountsWorkbook(s,year,ExcelJS,{personId='',from=year}={}){
 const book=new ExcelJS.Workbook();book.creator='Depotklar';book.created=new Date();book.calcProperties.fullCalcOnLoad=true;
 const sheet=sheetMaker(book),fromYear=Math.min(from,year),period=span(fromYear,year),until=`${year}-12-31`,fx=fxReplay(s,{until});
 const accounts=(s.accounts||[]).filter(a=>!personId||accountHolder(s,a)?.personId===personId),bookFx=accounts.some(a=>a.vatBook)?fxReplay(s,{until,basis:'book'}):null;
 for(const a of accounts){
  const rows=accountRows(s,[a],fromYear,year,{lots:false});if(!rows.length)continue;
  const h=accountHolder(s,a),owner=s.persons.find(p=>p.id===h.personId)?.name||'',where=`${owner} · ${h.depot?h.depot.name:'eigenes Konto'} · ${h.bank||'Bank offen'} · ${ACCOUNT_KINDS[a.kind]} · Zeitraum ${period}`;
  const ws=sheet(a.name,WIDTHS,owner);sheetHead(ws,`${a.name} · ${a.currency}`,[where]);writeRows(ws,rows);
  const m=accountLots(s,a.id,fromYear,year,{replayResult:fx}),b=a.vatBook?accountLots(s,a.id,fromYear,year,{replayResult:bookFx,basis:'book'}):null;
  if(m.rows.length)lotsSheet(sheet(`Lose ${a.name}`,[38,12,14,12,14,14,14,14,14,14,14,14,14,14],owner),m,b,`${a.name} · Lose ${period}`,[where,m.hidden?`Ohne ${m.hidden} Lose, die schon vor ${fromYear} aufgebraucht waren.`:'']);
 }
 if(!book.worksheets.length)sheet('Keine Konten',[60]).addRow(['Für diese Auswahl gibt es keine Währungskonten.']);
 return book;
}

export async function workbook(s,year,ExcelJS,{personId='',from=year,securityId='',depotId=''}={}){
 const book=new ExcelJS.Workbook();book.creator='Depotklar';book.created=new Date();
 // Der Rechenweg enthält Formeln: Excel rechnet sie beim Öffnen neu.
 book.calcProperties.fullCalcOnLoad=true;
 const fromYear=Math.min(from,year),period=fromYear===year?String(year):`${fromYear}–${year}`,sheet=sheetMaker(book);
 for(const d of s.depots.filter(x=>(!personId||x.personId===personId)&&(!depotId||x.id===depotId))){
  const owner=s.persons.find(p=>p.id===d.personId)?.name||'',where=`${owner} · ${d.bank||'Bank offen'}${d.account?` · Buchhaltung Konto ${d.account}`:''} · Zeitraum ${period}`;
  const rows=sheetRows(s,d.id,{from:fromYear,to:year,securityId});
  if(securityId&&rows.filter(r=>String(r[0]).startsWith('Stand 31.12.')).length===0)continue;
  const ws=sheet(d.name,WIDTHS);sheetHead(ws,`${d.name} · Übersicht`,[where]);writeRows(ws,rows);
  // Je Wertpapier ein eigenes Blatt mit beiden Betrachtungen.
  const ids=[...new Set(periodStatement(s,d.id,fromYear,year,'economic',{securityId}).rows.map(r=>r.securityId))];
  for(const id of ids){
   const x=s.securities.find(y=>y.id===id),wp=sheet(x.name,WIDTHS,d.name);
   sheetHead(wp,x.name,[[x.isin||'ohne ISIN',KINDS[x.kind]].join(' · '),`${d.name} · ${where}`]);
   writeRows(wp,sheetRows(s,d.id,{from:fromYear,to:year,securityId:id}));
  }
 }
 // Währungskonten ohne Depot: je Person ein Kontenblatt.
 if(!securityId&&!depotId)for(const p of s.persons.filter(x=>!personId||x.id===personId)){
  const rows=accountRows(s,standaloneAccounts(s,p.id),fromYear,year);if(!rows.length)continue;
  const ws=sheet(`Konten ${p.name}`,WIDTHS);sheetHead(ws,`${p.name} · Währungskonten ohne Depot`,[`Zeitraum ${period}`]);writeRows(ws,rows);
 }
 for(const p of s.persons.filter(x=>!personId||x.id===personId)){
  const ws=sheet(`Steuer ${year} ${p.name}`,[36,30,24,18,16,16,18,16,14]);
  writeRows(ws,taxRows(s,p.id,year));ws.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0};
  workingsSheet(widths=>sheet(`Rechenweg ${year} ${p.name}`,widths,'',31),s,p.id,year);
 }
 const gifts=giftRows(s,{personId});
 if(gifts.length){const ws=sheet('Schenkungen',[22,22,16,12,40,16,18,16,30]);writeRows(ws,gifts);}
 const events=sheet('Vorgänge',[12,30,22,20,30,16,12,16,14,14,14,14,14,22,14,26,16,12,30]);writeRows(events,eventRows(s,{from:fromYear,to:year,personId,securityId,depotId}));
 const audit=auditRows(s,{personId});if(audit.length>1){const ws=sheet('Protokoll',[18,24,48,30,70]);writeRows(ws,audit);}
 return book;
}
