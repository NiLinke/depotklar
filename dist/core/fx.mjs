import {D,S,sum,div,round} from './decimal.mjs';
import {FX_KINDS,today,accountHolder,withholdingOf} from './model.mjs';
import {vatRateOf,isProvisionalVatRate} from './vatrates.mjs';

// Währungskonten (z. B. USD) als eigene Wirtschaftsgüter: jeder Zugang ist ein Los
// mit Datum und EUR-Wert am Tag des Zugangs, jeder Abgang verbraucht die ältesten
// Beträge zuerst (§ 23 Abs. 1 S. 1 Nr. 2 S. 3 EStG). Der Währungsgewinn ist der
// EUR-Wert beim Abgang abzüglich des EUR-Werts der verbrauchten Beträge.
//
// Einordnung nach BMF vom 19.05.2022, Rz. 131 (geändert am 14.05.2025):
// – verzinstes Konto (Tages-, Festgeld): Kapitalertrag nach § 20 Abs. 2 S. 1 Nr. 7
//   EStG, jeder Abgang ist eine Veräußerung, keine Haltefrist;
// – unverzinstes Konto, Zahlungsverkehr: privates Veräußerungsgeschäft nach § 23
//   EStG, steuerbar nur bei nicht mehr als einem Jahr zwischen Anschaffung und
//   Veräußerung. Ein Wertpapierkauf mit Fremdwährung ist ein Tausch und damit
//   Veräußerung der Währung (BFH vom 21.01.2014, IX R 11/13).
// Unbekannte EUR-Werte bleiben unbekannt; daraus wird nie ein Gewinn von null.
//
// Buchhaltung zum Umsatzsteuer-Umrechnungskurs (Konto mit vatBook): Lauf mit basis 'book'. Jede Bewegung
// geht zum Monatskurs ein, auch wenn ein EUR-Betrag oder ein Tageskurs erfasst ist; ein übernommener
// Bestand mit EUR-Wert behält ihn. Die Steuer rechnet immer mit basis 'tax' (siehe rules.mjs).

const nS=v=>v==null?null:S(v);
const yearLater=d=>`${Number(d.slice(0,4))+1}${d.slice(4)}`;
// Erster Tag außerhalb der Jahresfrist (§ 23 Abs. 1 S. 1 Nr. 2 EStG): der Tag nach dem Jahrestag.
const freeFrom=d=>{const y=Number(d.slice(0,4))+1;return d.slice(5)==='02-29'?`${y}-03-01`:new Date(Date.UTC(y,Number(d.slice(5,7))-1,Number(d.slice(8,10))+1)).toISOString().slice(0,10);};
// Bewegungen mit Zielkonto. Der Umtausch in eine andere Fremdwährung ist ein Tausch: Veräußerung der einen und
// Anschaffung der anderen Währung zum selben EUR-Wert (wie beim Wertpapierkauf, BFH vom 21.01.2014, IX R 11/13).
const TRANSFERS=['transfer','gift','inheritance','exchange'];
export const eurValue=(amount,{eur=null,rate=null}={})=>eur!=null&&eur!==''?D(eur):rate!=null&&rate!==''?round(div(D(amount),D(rate))):null;

const LINKED_IN={sell:'Verkauf',distribution:'Ausschüttung',interest:'Zinsen'};
// Herkunft des EUR-Werts zur Anzeige: Kurs laut Abrechnung oder EZB-Referenzkurs mit Kurstag.
const quoteOf=q=>q?.rate==null||q.rate===''?null:{rate:String(q.rate),source:q.rateSource||'statement',date:q.rateDate||null};

// Alle Bewegungen der Währungskonten bis zum Stichtag: aus Kontovorgängen und aus
// Käufen, Verkäufen, Ausschüttungen und Zinsen, die über ein Währungskonto liefen.
// Zugänge eines Tages vor den Abgängen, sonst in Erfassungsreihenfolge.
export function fxFlows(s,{until=today(),basis='tax'}={}){
 const flows=[];
 const book=f=>{
  const a=(s.accounts||[]).find(x=>x.id===f.accountId);
  if(!a?.vatBook||f.opening&&f.eur!=null&&!f.quote)return f;
  const month=(f.opening&&f.acquired||f.date).slice(0,7),rate=vatRateOf(s,a.currency,month);
  return {...f,eur:rate==null?null:round(div(f.amount,D(rate))),quote:rate==null?null:{rate,source:'vat',date:month,...(isProvisionalVatRate(s,a.currency,month)?{provisional:true}:{})},missing:rate==null?`USt-Umrechnungskurs ${a.currency} für ${month.slice(5)}/${month.slice(0,4)} fehlt: unter „Kurse“ eintragen.`:null};
 };
 s.events.forEach((e,index)=>{
  if(e.date>until)return;
  if(e.fx&&['buy','sell','distribution','interest'].includes(e.type)){
   // Kauf und Verkauf: EUR-Wert der Kontobewegung ist der Betrag laut Abrechnung – außer ein
   // Devisenkurs ist angegeben (etwa wenn Steuer in der Fremdwährung abgezogen wurde).
   // Mit Steuerabzug beim Verkauf ist ohne Kurs offen, ob die Steuer in Fremdwährung abging – dann
   // passt der EUR-Erlös vor Steuer nicht zur Gutschrift. Der Wert bleibt offen, bis der Kurs erfasst ist.
   // Gezahlte Stückzinsen (negativer Ertrag einer Anleihe) gehen vom Konto ab wie ein Kauf, mit dem EUR-Betrag der Abrechnung.
   const paid=e.type==='distribution'&&D(e.amount)<0n,rated=e.fx.rate!=null&&e.fx.rate!=='',trade=e.type==='buy'||e.type==='sell'||paid,w=withholdingOf(e);
   const taxed=e.type==='sell'&&[w.total,...Object.values(w.parts||{})].some(v=>v!=null&&D(v)!==0n);
   const eur=trade&&!rated?(taxed?null:paid?-D(e.amount):D(e.amount)):eurValue(e.fx.amount,{rate:e.fx.rate});
   const income=(e.type==='distribution'||e.type==='interest')&&!paid;
   // Die Gutschrift ist eine Anschaffung der Fremdwährung an diesem Tag (BFH vom 21.01.2014, IX R 11/13).
   flows.push({eventId:e.id,index,date:e.date,accountId:e.fx.accountId,direction:e.type==='buy'||paid?'out':'in',amount:D(e.fx.amount),eur,source:e.type,securityId:e.securityId||null,acquired:e.date,income,quote:income||rated?quoteOf(e.fx):null,
    missing:taxed&&!rated?`Verkauf vom ${e.date.split('-').reverse().join('.')} mit Steuerabzug über das Währungskonto: Devisenkurs der Abrechnung angeben – ohne ihn ist offen, ob die Steuer in Fremdwährung abgezogen wurde.`:null});
  }
  if(e.type==='fx'){
   const eur=eurValue(e.amount,{eur:e.eur,rate:e.rate});
   const direction=TRANSFERS.includes(e.kind)?'transfer':['opening','exchangeIn','credit'].includes(e.kind)?'in':'out';
   flows.push({eventId:e.id,index,date:e.date,accountId:e.accountId,toAccountId:e.toAccountId||null,direction,amount:D(e.amount),...(e.kind==='exchange'?{toAmount:D(e.toAmount)}:{}),eur,source:e.kind,acquired:e.kind==='opening'?e.acquired||null:e.date,opening:e.kind==='opening',income:e.kind==='credit',quote:e.eur!=null&&e.eur!==''?null:quoteOf(e)});
  }
 });
 return (basis==='book'?flows.map(book):flows).sort((a,b)=>a.date.localeCompare(b.date)||(a.direction==='in'?0:1)-(b.direction==='in'?0:1)||a.index-b.index);
}

export function fxReplay(s,{until=today(),basis='tax'}={}){
 const accounts=new Map((s.accounts||[]).map(a=>[a.id,a])),lots=new Map(),moves=[],issues=[],history=new Map();
 // Jedes Los mit seinem Verbrauch, für die Matrix der Lose.
 const entered=(account,data)=>{const entry={...data,accountId:account.id,uses:[]};if(!history.has(account.id))history.set(account.id,[]);history.get(account.id).push(entry);return entry;};
 const security=id=>s.securities.find(x=>x.id===id);
 // Inhaber und Bank des Kontos (vom Depot oder vom eigenständigen Konto) für die Jahresrechnung.
 const holderOf=a=>{const h=accountHolder(s,a);return {personId:h.personId,bank:h.bank,abroad:h.abroad};};
 const lotsOf=id=>{if(!lots.has(id))lots.set(id,[]);return lots.get(id);};
 // Bestand und Buchwert laufend mitgeführt statt bei jeder Bewegung über alle Lose summiert: bei Tausenden
 // Bewegungen sonst quadratischer Aufwand. unknown zählt Lose ohne EUR-Wert; dann ist der Buchwert offen.
 const totals=new Map(),tot=id=>{let t=totals.get(id);if(!t){t={amount:0n,cost:0n,unknown:0};totals.set(id,t);}return t;};
 const balance=id=>tot(id).amount;
 const book=id=>{const t=tot(id);return t.unknown?null:t.cost;};
 // Einsortieren nach dem ursprünglichen Anschaffungstag, bei gleichem Tag hinter die vorhandenen (Erfassungsreihenfolge).
 const since=l=>l.acquired||l.opened;
 const insert=(id,l)=>{const list=lotsOf(id),k=since(l),t=tot(id);let i=list.length;while(i>0&&since(list[i-1])>k)i--;list.splice(i,0,l);t.amount+=l.amount;if(l.cost==null)t.unknown++;else t.cost+=l.cost;};
 const issue=(text,f)=>issues.push({status:'incomplete',reason:text,eventId:f.eventId,accountId:f.accountId,date:f.date});
 const record=(account,f,m)=>moves.push({type:'fx',eventId:f.eventId,date:f.date,source:f.source,securityId:f.securityId??null,accountId:account.id,depotId:account.depotId||null,...holderOf(account),currency:account.currency,
  proceeds:null,cost:null,gain:null,regime:null,taxable:null,parts:[],realized:false,quote:f.quote??null,...m,balance:S(balance(account.id)),bookValue:nS(book(account.id))});
 const label=(f,account,direction)=>{
  if(f.source==='transfer'){const other=accounts.get(direction==='out'?f.toAccountId:f.accountId);return direction==='out'?`Übertrag nach ${other?.name||'Konto'}`:`Übertrag aus ${other?.name||'Konto'}`;}
  if(f.source==='exchange'){const other=accounts.get(direction==='out'?f.toAccountId:f.accountId);return direction==='out'?`Umtausch in ${other?.currency||''} (${other?.name||'Konto'})`:`Umtausch aus ${other?.currency||''} (${other?.name||'Konto'})`;}
  if(f.source==='gift'||f.source==='inheritance'){const word=f.source==='gift'?'Schenkung':'Erbschaft',other=s.persons.find(p=>p.id===holderOf(accounts.get(direction==='out'?f.toAccountId:f.accountId)).personId)?.name||'';return direction==='out'?`${word} an ${other}`:`${word} von ${other}`;}
  if(f.source==='buy')return `Kauf ${security(f.securityId)?.name||''}`.trim();
  if(LINKED_IN[f.source])return `${f.source==='distribution'&&security(f.securityId)?.kind==='stock'?'Dividende':f.source==='distribution'&&security(f.securityId)?.kind==='bond'?'Zinsen':LINKED_IN[f.source]}${f.securityId?' '+(security(f.securityId)?.name||''):''}`;
  return FX_KINDS[f.source]||f.source;
 };

 // FIFO-Verbrauch; Lose behalten Anschaffungstag und EUR-Wert anteilig.
 function consume(f,account){
  const list=lotsOf(account.id),have=balance(account.id),t=tot(account.id);
  if(have<f.amount)throw Error(`${f.date.split('-').reverse().join('.')}: ${account.name}: Abgang von ${S(f.amount)} ${account.currency}, im Konto sind nur ${S(have)} ${account.currency}.`);
  let left=f.amount;const out=[];
  while(left>0n){
   const l=list[0],q=l.amount<=left?l.amount:left,cost=l.cost==null?null:q===l.amount?l.cost:l.cost*q/l.amount;
   out.push({...l,amount:q,cost});
   t.amount-=q;
   if(q===l.amount){list.shift();if(l.cost==null)t.unknown--;else t.cost-=l.cost;}else{l.amount-=q;if(l.cost!=null){l.cost-=cost;t.cost-=cost;}}
   left-=q;
  }
  return out;
 }

 for(const f of fxFlows(s,{until,basis})){
  const account=accounts.get(f.accountId);
  if(!account)throw Error('Währungskonto fehlt.');
  if(f.direction==='in'){
   // FIFO nach dem ursprünglichen Anschaffungstag, auch bei übernommenen Beständen desselben Stichtags;
   // bei gleichem Tag bleibt die Erfassungsreihenfolge (§ 23 Abs. 1 S. 1 Nr. 2 S. 3 EStG).
   const entry=entered(account,{eventId:f.eventId,acquired:f.acquired,opened:f.date,income:f.income,amount:f.amount,cost:f.eur,origin:label(f,account,'in')});
   insert(account.id,{amount:f.amount,cost:f.eur,acquired:f.acquired,opened:f.date,income:f.income,eventId:f.eventId,entry});
   if(f.eur==null)issue(f.missing?`${account.name}: ${f.missing}`:`${account.name}: EUR-Wert des Zugangs vom ${f.date.split('-').reverse().join('.')} fehlt (Devisenkurs oder Gegenwert erfassen).`,f);
   record(account,f,{direction:'in',label:label(f,account,'in'),amount:S(f.amount),eur:nS(f.eur)});
   continue;
  }
  const pieces=consume(f,account),target=f.direction==='transfer'?accounts.get(f.toAccountId):null;
  // Abgänge vom verzinsten Konto sind immer Veräußerungen, auch ein Übertrag
  // (Wiederanlage). Wird ein unverzinstes Guthaben erstmalig verzinslich angelegt,
  // ist das ebenfalls ein Anschaffungs- und Veräußerungsvorgang (Rz. 131). Nur der
  // Übertrag zwischen zwei unverzinsten eigenen Konten ist keine Veräußerung.
  // Schenkung und Erbschaft sind keine Veräußerung: Dem Empfänger werden Anschaffung und Anschaffungskosten des
  // Rechtsvorgängers zugerechnet (§ 23 Abs. 1 S. 3 EStG, § 20 Abs. 4 S. 6 EStG).
  // Der Umtausch in eine andere Währung ist immer eine Veräußerung, das Zielkonto beginnt mit dem EUR-Wert des Tauschs.
  const gratis=f.source==='gift'||f.source==='inheritance',realized=!gratis&&(!target||f.source==='exchange'||account.kind==='interest'||target.kind==='interest');
  const cost=pieces.some(p=>p.cost==null)?null:sum(pieces.map(p=>p.cost));
  const outLabel=label(f,account,'out'),withinOf=p=>p.acquired?f.date<=yearLater(p.acquired):yearLater(p.opened)<f.date?false:null;
  // Anteil jedes verbrauchten Loses am EUR-Wert des Abgangs; der letzte Anteil nimmt den Rest.
  let assigned=0n;
  const shares=pieces.map((p,i)=>{if(!realized||f.eur==null)return null;const share=i===pieces.length-1?f.eur-assigned:f.eur*p.amount/f.amount;assigned+=share;return share;});
  if(f.source==='gift'&&f.eur==null&&basis==='tax')issue(`${account.name}: EUR-Wert der Schenkung vom ${f.date.split('-').reverse().join('.')} fehlt (Devisenkurs oder Gegenwert erfassen).`,f);
  let result={};
  if(realized){
   const proceeds=f.eur,gain=proceeds==null||cost==null?null:proceeds-cost;
   if(proceeds==null)issue(f.missing?`${account.name}: ${f.missing}`:`${account.name}: EUR-Wert des Abgangs vom ${f.date.split('-').reverse().join('.')} fehlt (Devisenkurs oder Gegenwert erfassen).`,f);
   if(account.kind==='interest')result={regime:'capital',proceeds:nS(proceeds),cost:nS(cost),gain:nS(gain),taxable:nS(gain)};
   else{
    const parts=pieces.map((p,i)=>{
     // Ohne bekannten Anschaffungstag: nach mehr als einem Jahr seit der Übernahme sicher außerhalb der Frist.
     const share=shares[i],within=withinOf(p);
     return {amount:S(p.amount),acquired:p.acquired,opened:p.opened,income:p.income,proceeds:nS(share),cost:nS(p.cost),gain:share==null||p.cost==null?null:S(share-p.cost),within};
    });
    const inside=parts.filter(p=>p.within!==false);
    if(parts.some(p=>p.within==null))issue(`${account.name}: Anschaffungstag eines übernommenen Bestands fehlt – ob der Abgang vom ${f.date.split('-').reverse().join('.')} innerhalb eines Jahres liegt, ist offen.`,f);
    const taxable=inside.some(p=>p.within==null||p.gain==null)?null:S(sum(inside.map(p=>D(p.gain))));
    result={regime:'private',proceeds:nS(proceeds),cost:nS(cost),gain:nS(gain),taxable,parts};
   }
  }
  pieces.forEach((p,i)=>p.entry.uses.push({date:f.date,eventId:f.eventId,label:outLabel,amount:p.amount,cost:p.cost,proceeds:shares[i],gain:shares[i]==null||p.cost==null?null:shares[i]-p.cost,realized,within:realized&&account.kind!=='interest'?withinOf(p):null}));
  if(target){
   const via=label(f,target,'in'),incoming=f.toAmount??f.amount;
   if(realized)insert(target.id,{amount:incoming,cost:f.eur,acquired:f.date,opened:f.date,income:false,eventId:f.eventId,entry:entered(target,{eventId:f.eventId,acquired:f.date,opened:f.date,income:false,amount:incoming,cost:f.eur,origin:via})});
   else{
    // Steuerneutral übertragene Beträge behalten ihren Anschaffungstag: die zuerst angeschafften
    // gelten als zuerst veräußert (BMF vom 14.05.2025, Rz. 131), auch im Zielkonto.
    for(const p of pieces)insert(target.id,{...p,eventId:f.eventId,entry:entered(target,{eventId:f.eventId,acquired:p.acquired,opened:p.opened,income:p.income,amount:p.amount,cost:p.cost,origin:p.entry.origin,via})});
   }
  }
  // Ohne Veräußerung wandert der Buchwert; er steht dann als EUR-Wert des Abgangs.
  record(account,f,{direction:'out',label:outLabel,amount:S(-f.amount),eur:realized?nS(f.eur):nS(cost),realized,...result,bookOut:nS(cost),...(gratis?{transferKind:f.source,counterpartPersonId:holderOf(target).personId,marketValue:nS(f.eur)}:{})});
  if(target)record(target,{...f,accountId:target.id},{direction:'in',label:label(f,target,'in'),amount:S(f.toAmount??f.amount),eur:realized?nS(f.eur):nS(cost)});
 }
 const out=new Map();for(const [id,list] of lots)out.set(id,list.filter(l=>l.amount>0n).map(({entry,...l})=>({...l,amount:S(l.amount),cost:nS(l.cost)})));
 return {accounts:out,moves,issues,history};
}

// Matrix der Lose eines Kontos: je Los der Zugang, der Verbrauch je Jahr und der Rest zum Ende des Zeitraums, in der
// Reihenfolge des Verbrauchs. Lose, die schon vor dem Zeitraum aufgebraucht waren, werden nur gezählt.
// maxYears: höchstens so viele Jahresspalten mit Abgängen, die jüngsten; ältere Abgänge stehen zusammen in „earlier“
// (bis einschließlich earlierUntil). So bleibt die Matrix auch über lange Zeiträume lesbar und passt aufs Blatt.
export function accountLots(s,accountId,fromYear,toYear,{replayResult=null,basis='tax',maxYears=Infinity}={}){
 const account=(s.accounts||[]).find(a=>a.id===accountId);if(!account)throw Error('Währungskonto fehlt.');
 const r=replayResult||fxReplay(s,{until:`${toYear}-12-31`,basis}),start=`${fromYear}-01-01`,end=`${toYear}-12-31`,span=[],rows=[],since=l=>l.acquired||l.opened;
 for(let y=fromYear;y<=toYear;y++)span.push(y);
 const amounts=list=>sum(list.map(u=>u.amount));let hidden=0;
 for(const l of (r.history.get(accountId)||[]).filter(x=>x.opened<=end).sort((a,b)=>since(a).localeCompare(since(b)))){
  const uses=l.uses.filter(u=>u.date<=end),rest=l.amount-amounts(uses),earlier=amounts(uses.filter(u=>u.date<start));
  if(rest===0n&&earlier===l.amount){hidden++;continue;}
  const restCost=l.cost==null||uses.some(u=>u.cost==null)?null:l.cost-sum(uses.map(u=>u.cost));
  rows.push({eventId:l.eventId,acquired:l.acquired??null,opened:l.opened,income:l.income,origin:l.origin,via:l.via||null,amount:S(l.amount),cost:nS(l.cost),rate:l.cost==null||l.cost===0n?null:S(round(div(l.amount,l.cost),4)),earlier:S(earlier),
   perYear:Object.fromEntries(span.map(y=>[y,S(amounts(uses.filter(u=>u.date.startsWith(String(y)))))])),rest:S(rest),restCost:nS(restCost),freeFrom:account.kind==='payment'?freeFrom(since(l)):null,freeKnown:Boolean(l.acquired),
   uses:uses.map(u=>({...u,amount:S(u.amount),cost:nS(u.cost),proceeds:nS(u.proceeds),gain:nS(u.gain)}))});
 }
 const add=k=>S(sum(rows.map(x=>D(x[k])))),open=k=>rows.some(x=>x[k]==null)?null:add(k);
 const totals={amount:add('amount'),cost:open('cost'),earlier:add('earlier'),perYear:Object.fromEntries(span.map(y=>[y,S(sum(rows.map(x=>D(x.perYear[y]))))])),rest:add('rest'),restCost:open('restCost')};
 let years=span.filter(y=>D(totals.perYear[y])!==0n),earlierUntil=fromYear-1;
 if(years.length>maxYears){
  const merged=years.slice(0,years.length-maxYears);years=years.slice(-maxYears);earlierUntil=years[0]-1;
  for(const x of [...rows,totals])x.earlier=S(D(x.earlier)+sum(merged.map(y=>D(x.perYear[y]))));
 }
 return {account,basis,fromYear,toYear,rows,totals,hidden,years,earlierUntil,openCount:rows.filter(x=>D(x.rest)>0n).length};
}

// Kontostand laut Bank gegen den gebuchten Bestand am selben Tag. Eine Differenz zeigt eine fehlende oder
// falsch erfasste Bewegung; bei vielen Buchungen fällt sie sonst nicht auf.
export function balanceCheckResults(s,{replayResult=null,until=null,accountId=null}={}){
 const list=(s.balanceChecks||[]).filter(c=>(!until||c.date<=until)&&(!accountId||c.accountId===accountId));if(!list.length)return [];
 const r=replayResult||fxReplay(s,{until:until||list.reduce((m,c)=>c.date>m?c.date:m,'0000-01-01')}),byAccount=new Map();
 for(const m of r.moves){if(!byAccount.has(m.accountId))byAccount.set(m.accountId,[]);byAccount.get(m.accountId).push(m);}
 return list.map(c=>{
  const last=(byAccount.get(c.accountId)||[]).filter(m=>m.date<=c.date).at(-1),booked=last?last.balance:'0';
  return {...c,account:(s.accounts||[]).find(a=>a.id===c.accountId)||null,booked,difference:S(D(c.balance)-D(booked))};
 }).sort((a,b)=>a.date.localeCompare(b.date));
}

// Zinsen eines Kontos im Zeitraum mit dem Steuerabzug laut Abrechnung, soweit er erfasst ist.
export function accountInterest(s,accountId,fromYear,toYear){
 const lines=s.events.filter(e=>e.type==='interest'&&e.fx?.accountId===accountId&&e.date>=`${fromYear}-01-01`&&e.date<=`${toYear}-12-31`).sort((a,b)=>a.date.localeCompare(b.date)).map(e=>{
  const parts=withholdingOf(e).parts||{},eur=eurValue(e.fx.amount,{rate:e.fx.rate});
  return {eventId:e.id,date:e.date,gross:String(e.amount),capitalTax:parts.capitalTax??null,solidarity:parts.solidarity??null,churchTax:parts.churchTax??null,credit:String(e.fx.amount),rate:e.fx.rate??null,eur:nS(eur)};
 });
 const add=k=>{const v=lines.map(l=>l[k]).filter(x=>x!=null);return v.length?S(sum(v.map(D))):null;};
 return {lines,totals:{gross:add('gross'),capitalTax:add('capitalTax'),solidarity:add('solidarity'),churchTax:add('churchTax'),credit:add('credit'),eur:add('eur')}};
}

// Kontoblatt eines Jahres oder Zeitraums: Stand zu Beginn, jede Bewegung mit
// laufendem Bestand in Währung und EUR-Buchwert (FIFO), Stand am Ende.
export function accountStatement(s,accountId,fromYear,toYear,{replayResult=null,basis='tax'}={}){
 const account=(s.accounts||[]).find(a=>a.id===accountId);if(!account)throw Error('Währungskonto fehlt.');
 const r=replayResult||fxReplay(s,{until:`${toYear}-12-31`,basis}),start=`${fromYear}-01-01`,end=`${toYear}-12-31`;
 const own=r.moves.filter(m=>m.accountId===accountId&&m.date<=end),before=own.filter(m=>m.date<start),during=own.filter(m=>m.date>=start);
 const last=before.at(-1);
 const opening={balance:last?last.balance:'0',bookValue:last?last.bookValue:'0'};
 const closingMove=own.at(-1);
 const closing={balance:closingMove?closingMove.balance:'0',bookValue:closingMove?closingMove.bookValue:'0'};
 const realized=during.filter(m=>m.realized);
 const gains=realized.some(m=>m.gain==null)?null:S(sum(realized.map(m=>D(m.gain))));
 const years=[];for(let y=fromYear;y<=toYear;y++){const upto=own.filter(m=>m.date<=`${y}-12-31`).at(-1);years.push({year:y,balance:upto?upto.balance:'0',bookValue:upto?upto.bookValue:'0'});}
 return {account,basis,fromYear,toYear,opening,closing,lines:during,years,gains,realized:realized.length>0,
  empty:!during.length&&D(opening.balance)===0n&&D(closing.balance)===0n};
}
