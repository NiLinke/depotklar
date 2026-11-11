import {D,S,sum,mul,round,div,max} from './decimal.mjs';
import {GROUPS,REGIMES,regimeOf,isFund,churchMonths,taxOn} from './rules.mjs';
import {replay,economicValue,taxValue,fifoKey} from './ledger.mjs';
import {TRANSFER_KINDS,roundingOnly,afterExemption,substituteBase} from './model.mjs';

export const BASES=Object.freeze({economic:'Wirtschaftliche Betrachtung',tax:'Steuerliche Betrachtung'});
const add=(a,b)=>a==null||b==null?null:S(D(a)+D(b));
const totalOf=values=>values.some(v=>v==null)?null:S(sum(values.map(D)));
const fmtRatio=r=>String(Number(r));

function labelOf(s,m){
 const person=id=>s.persons.find(p=>p.id===id)?.name||'Unbekannt',depot=id=>s.depots.find(d=>d.id===id)?.name||'Depot',security=id=>s.securities.find(x=>x.id===id)?.name||'Wertpapier';
 if(m.type==='opening')return 'Bestand übernommen';
 if(m.type==='transition')return 'Fiktive Veräußerung 31.12.2017';
 if(m.type==='buy')return 'Kauf';
 if(m.type==='accumulation')return 'Thesaurierung';
 if(m.type==='sell')return 'Verkauf';
 if(m.type==='transfer'){
  const kind=TRANSFER_KINDS[m.transferKind];
  if(m.transferKind==='own')return m.direction==='out'?`Übertrag nach ${depot(m.counterpartDepotId)}`:`Übertrag aus ${depot(m.counterpartDepotId)}`;
  return m.direction==='out'?`${kind} an ${person(m.counterpartPersonId)}`:`${kind} von ${person(m.counterpartPersonId)}`;
 }
 if(m.type==='vap')return `Vorabpauschale für ${m.year}`;
 if(m.type==='split')return `Split ${fmtRatio(m.ratio)} : 1`;
 if(m.type==='merger'&&m.exchange)return m.direction==='out'?`Getauscht in ${security(m.counterpartSecurityId)}`:`Aus Tausch von ${security(m.counterpartSecurityId)}`;
 if(m.type==='merger')return m.direction==='out'?`Verschmolzen in ${security(m.counterpartSecurityId)}`:`Aus Verschmelzung von ${security(m.counterpartSecurityId)}`;
 return m.type;
}
// Aus Kurs je Stück erfasste Käufe und Verkäufe zeigen Kurs und Gebühren.
function tradeNote(s,m){
 if(m.type!=='buy'&&m.type!=='sell')return '';
 const e=s.events.find(x=>x.id===m.eventId);if(e?.unitPrice==null)return '';
 // Deutsche Schreibweise mit mindestens zwei Nachkommastellen, ohne Rundung.
 const de=v=>{const [i,f='']=String(v).split('.');return `${i.replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${f.padEnd(2,'0')}`;};
 return `aus Kurs ${de(e.unitPrice)} je Stück${e.fees!=null?` · Gebühren ${de(e.fees)} €`:' · ohne Gebühren'}`;
}
function noteOf(m,basis){
 if(m.type==='transfer'&&m.transferKind!=='own')return 'Unentgeltlich zum Buchwert, kein Veräußerungsgewinn';
 if(m.type==='opening')return basis==='tax'?'Basis inklusive bis zum Stichtag angesetzter Vorabpauschalen':'Ursprünglicher Anschaffungswert';
 if(m.type==='merger'&&basis==='tax'&&m.direction==='out'&&m.frozenRate!=null)return 'Abgang zum bisherigen steuerlichen Wert; der Gewinn wird beim Verkauf versteuert (§ 22 InvStG)';
 if(m.type==='merger'&&basis==='tax'&&m.direction==='in'&&m.frozenPending)return 'Anderer Teilfreistellungssatz: Rücknahmepreis des Zielfonds fehlt (§ 22 InvStG)';
 if(m.type==='merger'&&basis==='tax'&&m.direction==='in'&&m.frozenRate!=null)return `Fiktive Veräußerung (§ 22 InvStG): neue Basis zum Rücknahmepreis; Gewinn ${m.frozen==null?'offen':new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(m.frozen))+' €'} wird beim Verkauf versteuert, Teilfreistellung ${Number(m.frozenRate)*100} %`;
 if(m.type==='merger')return m.exchange?'Steuerneutral getauscht (§ 20 Abs. 4a EStG)':'Steuerneutral fortgeführt';
 if(m.type==='accumulation')return `Ausschüttungsgleiche Erträge nach altem Recht, versteuert${m.income?.withheld!=null?` · Steuerabzug ${new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(m.income.withheld))} €`:''}`;
 const de=v=>new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v));
 // Vorabpauschale laut Bank: zur Kontrolle der Wert aus den Jahreskursen, sofern erfasst.
 if(m.type==='vap'){
  if(m.source!=='bank')return m.source==='computed'?'berechnet aus Jahreskursen':m.source==='unit'?'aus Vorabpauschale je Anteil laut Steuerinformation':'fehlt – Jahreskurse, Wert je Anteil oder Bankwert erfassen';
  if(m.computed==null)return 'laut Bank';
  const from=m.computedFrom==='unit'?'aus Steuerinformation':'aus Jahreskursen';
  return D(m.tax)===D(m.computed)?`laut Bank, ${from} ebenso`:`laut Bank; ${from} ${de(m.computed)} € (Abweichung ${de(S(D(m.tax)-D(m.computed)))} €${roundingOnly(m.tax,m.computed)?', Rundung':''})`;
 }
 // Verkauf: Gewinn vor Teilfreistellung laut Abrechnung gegen die eigene Rechnung.
 const check=m.type==='sell'&&basis==='tax'&&m.gainBank!=null?`Abrechnung ${de(m.gainBank)} € vor Teilfreistellung, ${m.sale?.gross==null?'eigene Rechnung offen':D(m.gainBank)===D(m.sale.gross)?'Depotklar ebenso':`Depotklar ${de(m.sale.gross)} € (Abweichung ${de(S(D(m.gainBank)-D(m.sale.gross)))} €${roundingOnly(m.gainBank,m.sale.gross)?', Rundung':afterExemption(m.gainBank,m.sale)?' – entspricht dem Gewinn nach Teilfreistellung; den Wert vor Teilfreistellung eintragen':substituteBase(m.gainBank,m.sale,m.proceeds,m.fees)?' – entspricht 30 % des Erlöses: Ersatzbemessungsgrundlage ohne Anschaffungsdaten, in der Steuererklärung korrigieren':''})`}`:'';
 // § 56 Abs. 2 InvStG: Basis ab 2018 = Stück × Kurs 31.12.2017; der fiktive Gewinn wird erst beim Verkauf versteuert.
 // Rechnerisch: Kurs × Stück − Anschaffungskosten − erfasste Thesaurierungen, zur Kontrolle des Bankwerts.
 if(m.type==='transition'){
  const computed=m.computedDeemed==null?'':m.deemed==null?` (rechnerisch ${de(m.computedDeemed)} €)`:round(D(m.deemed))===D(m.computedDeemed)?`, rechnerisch ebenso`:`, rechnerisch ${de(m.computedDeemed)} € (Abweichung ${de(S(round(D(m.deemed))-D(m.computedDeemed)))} €)`;
  return `Basis ab 2018: Kurs ${m.price==null?'offen':de(m.price)} × Stück · fiktiver Gewinn ${m.deemed!=null?`${de(m.deemed)} € laut Bank`:'offen'}${computed}, versteuert beim Verkauf`;
 }
 // Verschmelzung mit anderem Teilfreistellungssatz: Der aufgeschobene Gewinn kommt beim Verkauf hinzu.
 if(m.type==='sell'&&basis==='tax'&&m.sale?.frozenGain!=null&&D(m.sale.frozenGain)!==0n)return `Dazu aufgeschobener Gewinn aus der Verschmelzung ${de(m.sale.frozenGain)} € (§ 22 InvStG)${m.sale.deemedGain!=null&&D(m.sale.deemedGain)!==0n?` und fiktiver Gewinn 2017 ${de(m.sale.deemedGain)} € ohne Teilfreistellung`:''}${check?` · ${check}`:''}`;
 // Fonds 2009–2017: Die Spalte Gewinn zeigt nur den Teil ab 2018; der fiktive Gewinn 2017 kommt beim Verkauf hinzu.
 if(m.type==='sell'&&basis==='tax'&&m.sale?.deemedGain!=null&&D(m.sale.deemedGain)!==0n)return `Gewinn ab 2018 gegen die Basis; dazu fiktiver Gewinn 2017 ${de(m.sale.deemedGain)} € ohne Teilfreistellung${check?` · ${check}`:''}`;
 if(check)return check;
 if(m.type==='sell'&&m.sale?.status==='historic')return basis==='tax'?(m.taxGainSource==='bank'?'Altes Recht: Gewinn laut Bank':'Altes Recht: vereinfacht Erlös − Anschaffungskosten und erfasste Thesaurierungen, nicht nachgerechnet'):'';
 return '';
}

// Herkunft eines Loses im Depot: letzter Zugang (Übertrag, Schenkung, Erbschaft, Verschmelzung), sonst der Erwerb.
export function originOf(s,l,depotId){
 const h=[...(l.history||[])].reverse().find(x=>x.merger||x.to===depotId);
 if(h?.merger){const old=s.securities.find(x=>x.id===h.from);return old?.kind==='stock'?`Tausch aus ${old.name}`:`Verschmelzung aus ${old?.name||'Fonds'}`;}
 if(h){const from=s.depots.find(d=>d.id===h.from);return h.kind==='own'?`Übertrag aus ${from?.name||'Depot'}`:`${TRANSFER_KINDS[h.kind]||'Übertrag'} von ${s.persons.find(p=>p.id===from?.personId)?.name||'Unbekannt'}`;}
 return s.events.find(e=>e.id===l.rootId)?.type==='opening'?'Bestand übernommen':'Kauf';
}
// Wirtschaftlich geht ein Abgang zum Durchschnittswert des Bestands ab; die Zeile nennt ihn wie das Buchhaltungsblatt.
const de4=v=>new Intl.NumberFormat('de-DE',{minimumFractionDigits:4,maximumFractionDigits:4}).format(Number(v));
const averageNote=(m,basis)=>basis==='economic'&&(m.type==='sell'||m.type==='transfer'&&m.direction==='out')&&m.economic!=null&&D(m.quantity)!==0n?`Abgang zum Durchschnitt ${de4(S(div(D(m.economic),D(m.quantity))))} € je Stück`:'';
// Abgang aus Losen (steuerlich): Erwerb und Stück, wie FIFO (oder die Aufteilung einer Schenkung) sie verbraucht.
const fromLots=m=>m.type==='sell'||m.type==='transfer'&&m.direction==='out'?(m.consumed||[]).filter(c=>D(c.quantity)>0n).map(c=>({acquired:c.acquired||null,group:c.group,quantity:c.quantity})):null;

// Kirchensteuerfaktor k einer Person: bestätigte Jahresdaten, sonst der Satz des letzten bestätigten Jahres; ohne Angabe unbekannt.
function churchFactor(s,personId,year){
 const all=s.years?.[personId]||{},own=all[year];
 if(own?.churchRate!=null)return mul(D(String(own.churchRate)),D(String(churchMonths(own))))/12n;
 const prev=all[Object.keys(all).map(Number).filter(y=>y<year).sort((a,b)=>b-a)[0]];
 return prev?.churchRate==null?null:prev.churchUntil!=null?0n:D(String(prev.churchRate));
}
// Ein Verkauf für die Buchung: Erlös, Abgang zum Buchwert und woraus der wirtschaftliche Gewinn besteht. Alles auf Cent,
// der Rest bleibt als Differenz sichtbar (Durchschnitt gegen FIFO, versteuerte Thesaurierungen, Rundung).
// – steuerfrei bis 2017: Alt-Anteile vor 2009 mit dem Zuwachs bis zum Kurs 31.12.2017 (§ 56 Abs. 6 InvStG), Altaktien vor 2009 mit dem
//   ganzen Gewinn. Fonds 2009–2017 haben keinen: Ihr Zuwachs bis 2017 wird als fiktiver Gewinn versteuert (§ 56 Abs. 3 InvStG).
// – Vorabpauschalen: schon versteuert, deshalb mindern sie den Veräußerungsgewinn (§ 19 Abs. 1 InvStG).
// – Steuern: laut Abrechnung, sonst rechnerisch auf diesen Verkauf allein, vor Verlustverrechnung und Freistellungsauftrag.
export function saleLine(s,m){
 const x=s.securities.find(y=>y.id===m.securityId),sale=m.sale,cents=v=>v==null?null:S(round(D(v)));
 const banked=m.taxes?{...m.taxes,total:m.withheld??null,source:'Abrechnung'}:m.withheld!=null?{total:m.withheld,source:'Abrechnung'}:null;
 const common={eventId:m.eventId,date:m.date,securityId:m.securityId,name:x?.name||'Wertpapier',quantity:S(-D(m.quantity)),proceeds:m.proceeds,book:m.economic==null?null:S(-D(m.economic)),gain:m.gainEconomic};
 if(sale.status==='historic')return {...common,historic:true,free:null,vap:null,exempt:null,taxable:null,rest:null,model:null,taxes:banked};
 const commodity=x.kind==='commodity',total=list=>list.some(v=>v==null)?null:sum(list);
 const free=total(sale.details.map((d,i)=>{
  if(d.regime==='stockPre2009')return d.cost==null||d.proceeds==null?null:D(d.proceeds)-D(d.cost);
  if(d.regime!=='fundPre2009')return 0n;
  const first=d.frozen?.[0],basis=first?first.basis:d.basis,cost=first?first.cost:d.cost;
  return basis==null||cost==null?null:D(basis)-D(cost)-D(m.consumed?.[i]?.acc??'0');
 }));
 const vap=isFund(x.kind)?total(sale.details.map(d=>d.vap==null?null:D(d.vap))):0n;
 const taxable=commodity?sale.privateTaxable??null:sale.taxable,exempt=commodity?'0':sale.exempt;
 const parts=[taxable,exempt,free==null?null:S(free),vap==null?null:S(vap)].map(cents);
 let rest=m.gainEconomic==null||parts.some(v=>v==null)?null:S(round(D(m.gainEconomic))-sum(parts.map(D)));
 // Ein Rundungscent geht in die Teilfreistellung, damit die Teile auf den Cent aufgehen.
 if(rest!=null&&D(rest)!==0n&&D(parts[1])!==0n&&max(D(rest),-D(rest))<=D('0.01')){parts[1]=S(D(parts[1])+D(rest));rest='0';}
 const k=commodity||taxable==null?null:churchFactor(s,m.personId,Number(m.date.slice(0,4)));
 const t=k==null?null:taxOn(max(0n,D(taxable)),k),model=t?{capitalTax:S(t.capital),solidarity:S(t.sol),churchTax:S(t.church),total:S(t.total),source:'rechnerisch'}:null;
 return {...common,historic:false,commodity,free:parts[2],vap:parts[3],exempt:parts[1],taxable:parts[0],rest,model,taxes:banked||model};
}

// Last price of December for the year-end valuation; no other month substitutes it.
function yearEndPrice(s,securityId,year){
 return s.prices.filter(p=>p.securityId===securityId&&p.date>=`${year}-12-01`&&p.date<=`${year}-12-31`).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;
}

export function statement(s,depotId,year,basis,{replayResult=null}={}){
 const depot=s.depots.find(d=>d.id===depotId);if(!depot)throw Error('Depot fehlt.');
 if(!Object.hasOwn(BASES,basis))throw Error('Unbekannte Betrachtung.');
 const r=replayResult||replay(s,{until:`${year}-12-31`}),start=`${year}-01-01`,end=`${year}-12-31`;
 const valueKey=basis==='economic'?'economic':'tax',gainKey=basis==='economic'?'gainEconomic':'gainTax';
 const own=r.moves.filter(m=>m.depotId===depotId&&m.date<=end&&m.securityId);
 // Erträge des Depots: Zinsen, Ausschüttungen und Dividenden. Sie gehen als Geld zu und bewegen
 // keinen Bestand – weder den Anschaffungswert noch die steuerliche Basis. Eigene Liste je Depot.
 // Vorabpauschale und Thesaurierung stehen in den Blättern, weil sie Werte erhöhen.
 const income=r.moves.filter(m=>(m.type==='interest'||m.type==='distribution'||m.type==='otherIncome')&&m.depotId===depotId&&m.date>=start&&m.date<=end).map(m=>{
  const x=m.securityId?s.securities.find(y=>y.id===m.securityId):null;
  return {eventId:m.eventId,date:m.date,type:m.type,securityId:m.securityId||null,name:x?.name||(m.type==='otherIncome'?m.label:'Zinsen'),label:m.type==='interest'?'Zinsen':m.type==='otherIncome'?'Sonstiger Ertrag':m.cash?'Barausgleich':x?.kind==='stock'?'Dividende':x?.kind==='bond'?'Zinsen':'Ausschüttung',
   gross:m.income.gross,exempt:m.income.exempt,taxable:m.income.taxable,foreignTax:m.income.foreignTax??null,withheld:m.income.withheld??null,taxes:m.income.taxes??null};
 });
 const sales=r.moves.filter(m=>m.type==='sell'&&m.depotId===depotId&&m.date>=start&&m.date<=end).map(m=>saleLine(s,m));
 const shows=m=>m.type!=='distribution'&&(basis==='tax'||(m.type!=='vap'&&m.type!=='transition'));
 const ids=[...new Set([...own.map(m=>m.securityId),...[...r.positions.keys()].filter(k=>k.startsWith(depotId+'|')).map(k=>k.split('|')[1])])];
 // Lose zum Vorjahresende, nur bei Bedarf gerechnet (siehe Anfangswert).
 let earlier=null;const lotsAtStart=()=>(earlier??=replay(s,{until:`${year-1}-12-31`})).positions;
 const valuesOfLots=(lots,kind)=>lots.map(l=>({...l,cost:l.cost==null?null:D(l.cost),econ:l.econ==null?null:D(l.econ),basis:l.basis==null?null:D(l.basis),acc:l.acc==null?null:D(l.acc),vap:l.vap==null?null:D(l.vap)})).map(l=>basis==='economic'?economicValue(l):taxValue(l,kind));
 const rows=ids.map(securityId=>{
  const security=s.securities.find(x=>x.id===securityId),mine=own.filter(m=>m.securityId===securityId);
  const before=mine.filter(m=>m.date<start),during=mine.filter(m=>m.date>=start&&shows(m));
  // Ohne Stücke ist der Bestand null, auch wenn ein früherer Anschaffungswert unbekannt war.
  // Dieselbe Regel gilt für die Vorgeschichte: Eine aufgelöste und später neu aufgebaute Position beginnt bekannt.
  // Bleibt die Summe der früheren Vorgänge offen, obwohl die Lose mit unbekanntem Wert schon abgegangen sind (FIFO),
  // zählt der Wert der Lose zum Vorjahresende.
  let oq=0n,ov='0';for(const m of before){oq+=D(m.quantity);if(shows(m))ov=add(ov,m[valueKey]);if(oq===0n)ov='0';}
  if(ov==null&&oq>0n){const prior=lotsAtStart().get(`${depotId}|${securityId}`)||[],values=valuesOfLots(prior,security.kind);if(sum(prior.map(l=>D(l.quantity)))===oq&&values.every(x=>x!=null))ov=S(sum(values));}
  const opening={quantity:S(oq),value:ov};
  let q=opening.quantity,v=opening.value;
  const lines=during.map(m=>{q=add(q,m.quantity);v=add(v,m[valueKey]);if(D(q)===0n)v='0';return {eventId:m.eventId,type:m.type,date:m.date,label:labelOf(s,m),note:[noteOf(m,basis)||tradeNote(s,m),averageNote(m,basis)].filter(Boolean).join(' · '),
   quantity:m.quantity,value:m[valueKey],proceeds:m.proceeds,gain:m.type==='sell'?m[gainKey]:m.type==='transfer'&&m.direction==='out'?m[gainKey]:null,balanceQuantity:q,balanceValue:v,year:m.year??null,from:basis==='tax'?fromLots(m):null};});
  const closing={quantity:q,value:v};
  // Gegenprobe gegen den Losbestand am Jahresende: muss durch Konstruktion aufgehen.
  const lots=r.positions.get(`${depotId}|${securityId}`)||[],internal=lots.map(l=>({...l,cost:l.cost==null?null:D(l.cost),econ:l.econ==null?null:D(l.econ),basis:l.basis==null?null:D(l.basis),acc:l.acc==null?null:D(l.acc),vap:l.vap==null?null:D(l.vap)}));
  const lotQuantity=S(sum(lots.map(l=>D(l.quantity)))),lotValues=internal.map(l=>basis==='economic'?economicValue(l):taxValue(l,security.kind));
  const lotValue=lotValues.some(x=>x==null)?null:S(sum(lotValues));
  // Gegenprobe: Wo die Kette aus Anfangsbestand und Vorgängen einen Wert hat, muss sie den Losbestand treffen. Ist sie
  // offen, die Lose am Jahresende aber vollständig bekannt (die unbekannten sind abgegangen), gilt deren Wert als Endstand.
  const balanced=D(lotQuantity)===D(closing.quantity)&&(v==null||lotValue!=null&&D(lotValue)===D(v));
  if(closing.value==null&&lotValue!=null&&D(lotQuantity)===D(closing.quantity))closing.value=lotValue;
  const price=yearEndPrice(s,securityId,year),market=price&&D(closing.quantity)>0n?S(round(mul(D(closing.quantity),D(price.price)))):null;
  const regimes=[...new Set(lots.map(l=>regimeOf(security.kind,l.group)))].map(k=>REGIMES[k]);
  // Lose zum Jahresende in FIFO-Reihenfolge (nur steuerlich; wirtschaftlich zählt der Durchschnitt): Erwerb, Herkunft, Stück (von ursprünglich) und Wert.
  const lotList=basis==='economic'?[]:internal.map((l,i)=>({l,value:lotValues[i]})).filter(x=>D(x.l.quantity)>0n).sort((a,b)=>fifoKey(a.l).localeCompare(fifoKey(b.l)))
   .map(({l,value},i)=>({n:i+1,acquired:l.acquired||null,group:l.group,origin:originOf(s,l,depotId),quantity:l.quantity,bought:l.bought??null,value:value==null?null:S(value),unit:value==null?null:S(div(value,D(l.quantity)))}));
  return {securityId,security,opening,lines,closing,balanced,lotQuantity,lotValue,regimes,lots:lotList,
   unitValue:closing.value==null||D(closing.quantity)===0n?null:S(div(D(closing.value),D(closing.quantity))),
   price,market,
   additions:totalOf(lines.filter(l=>D(l.quantity??'0')>0n||l.type==='vap').map(l=>l.value)),
   disposals:totalOf(lines.filter(l=>D(l.quantity??'0')<0n).map(l=>l.value)),
   proceeds:totalOf(lines.filter(l=>l.proceeds!=null).map(l=>l.proceeds)),
   gains:totalOf(lines.filter(l=>l.type==='sell').map(l=>l.gain))};
 }).filter(x=>x.lines.length||D(x.opening.quantity)!==0n||D(x.closing.quantity)!==0n);
 const check=s.ledgerChecks.filter(c=>c.depotId===depotId&&c.date===end).at(-1)||null;
 const closingValue=totalOf(rows.map(x=>x.closing.value));
 return {depot,year,basis,label:BASES[basis],rows,income,sales,
  opening:totalOf(rows.map(x=>x.opening.value)),closing:closingValue,
  additions:totalOf(rows.map(x=>x.additions)),disposals:totalOf(rows.map(x=>x.disposals)),proceeds:totalOf(rows.map(x=>x.proceeds)),gains:totalOf(rows.map(x=>x.gains)),
  market:rows.every(x=>x.market!=null||D(x.closing.quantity)===0n)?totalOf(rows.map(x=>x.market??'0')):null,
  balanced:rows.every(x=>x.balanced),
  ledgerCheck:basis==='economic'&&check?{...check,difference:closingValue==null?null:S(D(check.balance)-D(closingValue))}:null};
}

// Fortschreibung über mehrere Jahre: die geprüften Jahresblätter aneinandergereiht,
// je Wertpapier mit dem Stand 31.12. jedes Jahres als Zwischenzeile. Der Endstand
// eines Jahres ist durch Konstruktion der Anfangsstand des nächsten; das wird hier
// zusätzlich geprüft. Optional nur ein Wertpapier.
export function periodStatement(s,depotId,fromYear,toYear,basis,{securityId=''}={}){
 if(!Number.isInteger(fromYear)||!Number.isInteger(toYear)||fromYear>toYear)throw Error('Zeitraum ungültig.');
 const years=[];for(let y=fromYear;y<=toYear;y++)years.push(statement(s,depotId,y,basis));
 const depot=years[0].depot,ids=[...new Set(years.flatMap(st=>st.rows.map(r=>r.securityId)))].filter(id=>!securityId||id===securityId);
 const rows=ids.map(id=>{
  const perYear=years.map(st=>({year:st.year,row:st.rows.find(r=>r.securityId===id)})).filter(x=>x.row);
  const first=perYear[0],last=perYear.at(-1);
  // Ein Jahr ohne Bestand und ohne Vorgang fehlt in der Reihe; der Anschluss gilt dann von null.
  let chained=true;for(let i=1;i<perYear.length;i++){const a=perYear[i-1],b=perYear[i],prev=b.year===a.year+1?a.row.closing:{quantity:'0',value:'0'};
   if(D(prev.quantity)!==D(b.row.opening.quantity)||(prev.value==null)!==(b.row.opening.value==null)||prev.value!=null&&D(prev.value)!==D(b.row.opening.value))chained=false;}
  const lines=perYear.flatMap(x=>x.row.lines);
  return {securityId:id,security:first.row.security,regimes:[...new Set(perYear.flatMap(x=>x.row.regimes))],
   firstYear:first.year,opening:first.row.opening,closing:last.year===toYear?last.row.closing:{quantity:'0',value:'0'},
   segments:perYear.map(({year,row})=>({year,lines:row.lines,closing:row.closing,unitValue:row.unitValue,price:row.price,market:row.market,lots:row.lots})),
   balanced:chained&&perYear.every(x=>x.row.balanced),
   proceeds:totalOf(lines.filter(l=>l.proceeds!=null).map(l=>l.proceeds)),gains:totalOf(lines.filter(l=>l.type==='sell').map(l=>l.gain)),sold:lines.some(l=>l.type==='sell')};
 });
 const openingOf=r=>r.firstYear===fromYear?r.opening.value:'0';
 const lastYear=years.at(-1),check=securityId?null:lastYear.ledgerCheck;
 return {depot,fromYear,toYear,basis,label:BASES[basis],securityId,rows,income:years.flatMap(st=>st.income).filter(i=>!securityId||i.securityId===securityId),sales:years.flatMap(st=>st.sales).filter(i=>!securityId||i.securityId===securityId),
  opening:totalOf(rows.map(openingOf)),closing:totalOf(rows.map(r=>r.closing.value)),
  proceeds:totalOf(rows.filter(r=>r.sold).map(r=>r.proceeds)),gains:totalOf(rows.filter(r=>r.sold).map(r=>r.gains)),sold:rows.some(r=>r.sold),
  market:rows.every(r=>D(r.closing.quantity)===0n||r.segments.at(-1).year===toYear&&r.segments.at(-1).market!=null)?totalOf(rows.map(r=>D(r.closing.quantity)===0n?'0':r.segments.at(-1).market)):null,
  balanced:rows.every(r=>r.balanced),ledgerCheck:check};
}

export {GROUPS};
