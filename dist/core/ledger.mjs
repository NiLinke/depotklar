import {D,S,mul,div,round,sum} from './decimal.mjs';
import {EXEMPTION,GROUPS,groupOf,regimeOf,isFund,vapYears,vapInflow,baseRateOf} from './rules.mjs';
import {vapPerUnit} from './vap.mjs';
import {saleParts} from './sale.mjs';
import {EVENT_TYPES,TRANSFER_KINDS,today,accountHolder,withholdingOf} from './model.mjs';

const keyOf=(depotId,securityId)=>`${depotId}|${securityId}`;
const nS=v=>v==null?null:S(v);
const add=(a,b)=>a==null||b==null?null:a+b;
const part=(v,p,w)=>v==null?null:p===w?v:v*p/w;
const total=values=>values.some(v=>v==null)?null:sum(values);
// Steuerabzug eines Vorgangs: Summe für den Abgleich, dazu je Steuerart, soweit einzeln erfasst.
const taxOf=e=>{const w=withholdingOf(e);return {withheld:w.total,taxes:w.parts};};

// Wirtschaftlich zählt der fortgeführte Anschaffungswert – wie in der Buchhaltung mit den
// Thesaurierungen nach altem Recht und im gleitenden Durchschnitt je Depot und Wertpapier:
// Ein Abgang geht mit Stück × Wert je Stück des Bestands ab (econ, siehe average in replay).
// Steuerlich der Wert, den ein Verkauf vom Erlös abzieht, nach FIFO (§ 20 Abs. 4 S. 7 EStG):
// Basis 31.12.2017 bzw. Anschaffungskosten, jeweils zuzüglich angesetzter Vorabpauschalen.
export function economicValue(lot){return lot.econ!==undefined?lot.econ:add(lot.cost,lot.acc??0n);}
export function taxValue(lot,kind){
 const regime=regimeOf(kind,lot.group);
 if(regime==='stockPre2009')return lot.cost;
 const base=regime==='regular'?lot.cost:lot.basis;
 return add(base,lot.vap);
}

export const fifoKey=l=>(l.acquired||{pre2009:'0000-00-00',from2009:'2009-01-01',from2018:'2018-01-01'}[l.group])+String(l.order).padStart(8,'0');
const stringifyFrozen=list=>list.map(f=>({...f,gain:nS(f.gain),basis:nS(f.basis),cost:nS(f.cost)}));
const frozenPiece=(list,p,w)=>list.map(f=>({...f,gain:part(f.gain,p,w),basis:part(f.basis,p,w),cost:part(f.cost,p,w)}));
const stringify=l=>({...l,...(l.frozen?{frozen:stringifyFrozen(l.frozen)}:{}),quantity:S(l.quantity),bought:nS(l.bought),cost:nS(l.cost),econ:nS(l.econ),basis:nS(l.basis),deemed:nS(l.deemed),oldIncome:nS(l.oldIncome),acc:nS(l.acc),vap:nS(l.vap),vapYears:[...l.vapYears],missingVap:[...l.missingVap],history:structuredClone(l.history),vapLog:(l.vapLog||[]).map(v=>({...v,amount:S(v.amount)}))});
const dayDiff=(a,b)=>Math.abs(Date.parse(a)-Date.parse(b))/864e5;

// Erste Vorabpauschale, die nach dem Erwerb zufließen kann. Erwerb vor 2018 zählt
// ab 2018; ohne bekanntes Erwerbsdatum ab dem frühestmöglichen Jahr der Gruppe.
const coverageFrom=(group,acquired)=>group==='from2018'?acquired||'2018-01-01':'2018-01-01';
// Ein Folgejahr ohne Basiszins zählt mit: Seine Vorabpauschale ist offen, bis er bestätigt ist.
const requiredYears=(s,from,until)=>vapYears(s,until).filter(r=>(r.rate==null||D(r.rate)>0n)&&r.inflow>from).map(r=>r.year);

// Ohne Stichtag bis heute: künftige Zuflüsse der Vorabpauschale gehören nicht in den Bestand.
export function replay(s,{until=today()}={}){
 const security=id=>s.securities.find(x=>x.id===id),depot=id=>s.depots.find(d=>d.id===id);
 const positions=new Map(),moves=[],issues=[],fundDistributions=new Map(),bankVap=new Map(),bankVapDuplicates=new Set(),bankVapUsed=new Set();
 const pools=new Map();
 const lotsAt=(d,x)=>{const k=keyOf(d,x);if(!positions.has(k))positions.set(k,[]);return positions.get(k);};
 const held=k=>(positions.get(k)||[]).filter(l=>l.quantity>0n);
 let order=0;
 const issue=(status,reason,e)=>issues.push({status,reason,eventId:e?.id??null,depotId:e?.depotId??null,securityId:e?.securityId??null,date:e?.date??null});

 // Wirtschaftlich gleitender Durchschnitt: Vor jedem Abgang tragen alle Lose des Depots
 // denselben Wert je Stück (Bestandswert ÷ Stück); das letzte Los nimmt den Rundungsrest.
 // Ist ein Anschaffungswert unbekannt, ist es der Durchschnitt und damit jeder Abgang auch.
 function average(lots){
  const Q=sum(lots.map(l=>l.quantity)),E=total(lots.map(l=>l.econ));let acc=0n;
  lots.forEach((l,i)=>{if(E==null){l.econ=null;return;}const p=i===lots.length-1?E-acc:E*l.quantity/Q;acc+=p;l.econ=p;});
 }
 function take(e,quantity){
  const lots=lotsAt(e.depotId,e.securityId).filter(l=>l.quantity>0n).sort((a,b)=>fifoKey(a).localeCompare(fifoKey(b)));
  const have=sum(lots.map(l=>l.quantity));
  if(have<quantity)throw Error(`${e.date}: ${EVENT_TYPES[e.type]} von ${S(quantity)} Stück, im Depot sind nur ${S(have)} Stück vorhanden.`);
  average(lots);
  const E=total(lots.map(l=>l.econ));
  let left=quantity;const out=[];
  for(const l of lots){
   if(!left)break;const q=l.quantity<left?l.quantity:left;
   const log=(l.vapLog||[]).map(v=>({...v,amount:part(v.amount,q,l.quantity)}));
   out.push({...l,quantity:q,cost:part(l.cost,q,l.quantity),econ:part(l.econ,q,l.quantity),basis:part(l.basis,q,l.quantity),deemed:part(l.deemed,q,l.quantity),oldIncome:part(l.oldIncome,q,l.quantity),acc:part(l.acc,q,l.quantity),vap:part(l.vap,q,l.quantity),vapYears:[...l.vapYears],missingVap:[...l.missingVap],history:structuredClone(l.history),vapLog:log,...(l.frozen?{frozen:frozenPiece(l.frozen,q,l.quantity)}:{})});
   if(l.frozen)l.frozen=l.frozen.map(f=>({...f,gain:f.gain==null?null:f.gain-part(f.gain,q,l.quantity),basis:f.basis==null?null:f.basis-part(f.basis,q,l.quantity),cost:f.cost==null?null:f.cost-part(f.cost,q,l.quantity)}));
   for(const k of ['cost','econ','basis','deemed','oldIncome','acc','vap'])if(l[k]!=null)l[k]-=part(l[k],q,l.quantity);
   l.vapLog=(l.vapLog||[]).map((v,i)=>({...v,amount:v.amount-log[i].amount}));
   l.quantity-=q;left-=q;
  }
  // Wie im Sachkonto: Ein Teilabgang geht mit Stück × Durchschnitt auf den Cent gerundet ab, der Rest bleibt im Bestand.
  if(E!=null&&quantity<have&&out.length){const diff=round(E*quantity/have,2)-sum(out.map(p=>p.econ));if(diff!==0n){out.at(-1).econ+=diff;lots.find(l=>l.quantity>0n).econ-=diff;}}
  return out;
 }
 // Schenkung an mehrere mit gleichem Erwerbsmix: der Gesamtabgang wird nach FIFO
 // bestimmt und jedes Los im Verhältnis der Stückzahlen aufgeteilt. Den kleinsten
 // Rundungsrest trägt das letzte Los eines Empfängers bzw. der letzte Empfänger.
 function prorata(e){
  if(!pools.has(e.batchId)){
   const members=events.filter(x=>x.batchId===e.batchId),quantities=members.map(x=>D(x.quantity)),T=sum(quantities);
   const pool=take(e,T),n=members.length,k=pool.length,a=members.map(()=>pool.map(()=>0n));
   for(let i=0;i<n-1;i++){let used=0n;for(let j=0;j<k-1;j++){a[i][j]=pool[j].quantity*quantities[i]/T;used+=a[i][j];}a[i][k-1]=quantities[i]-used;}
   for(let j=0;j<k;j++)a[n-1][j]=pool[j].quantity-sum(a.slice(0,n-1).map(r=>r[j]));
   if(a.some(r=>r.some(v=>v<0n)))throw Error(`${e.date}: Anteilige Aufteilung der Lose ist nicht möglich.`);
   const out=new Map(members.map(m=>[m.id,[]])),fields=['cost','econ','basis','deemed','oldIncome','acc','vap'];
   pool.forEach((l,j)=>{
    const rest=Object.fromEntries(fields.map(f=>[f,l[f]])),last=a.map(r=>r[j]>0n).lastIndexOf(true);
    members.forEach((m,i)=>{
     const q=a[i][j];if(q===0n)return;
     const piece={...l,quantity:q,vapYears:[...l.vapYears],missingVap:[...l.missingVap],history:structuredClone(l.history),vapLog:(l.vapLog||[]).map(v=>({...v,amount:part(v.amount,q,l.quantity)})),...(l.frozen?{frozen:frozenPiece(l.frozen,q,l.quantity)}:{})};
     for(const f of fields){if(l[f]==null){piece[f]=null;continue;}piece[f]=i===last?rest[f]:part(l[f],q,l.quantity);rest[f]-=piece[f];}
     out.get(m.id).push(piece);
    });
   });
   // Je Empfänger auf den Cent wie im Sachkonto; den Rundungsrest trägt der letzte Empfänger.
   const lastList=out.get(members.at(-1).id);
   if(pool.every(l=>l.econ!=null))for(const m of members.slice(0,-1)){const list=out.get(m.id);if(!list.length||!lastList.length)continue;const t=sum(list.map(p=>p.econ)),diff=round(t,2)-t;if(diff!==0n){list.at(-1).econ+=diff;lastList.at(-1).econ-=diff;}}
   pools.set(e.batchId,out);
  }
  return pools.get(e.batchId).get(e.id);
 }
 const values=(lots,kind)=>({quantity:sum(lots.map(l=>l.quantity)),economic:total(lots.map(economicValue)),tax:total(lots.map(l=>taxValue(l,kind)))});
 const move=m=>moves.push({eventId:null,proceeds:null,gainEconomic:null,gainTax:null,...m,quantity:S(m.quantity),economic:nS(m.economic),tax:nS(m.tax),personId:m.personId??depot(m.depotId)?.personId});

 // Zeitachse: Zuflüsse der Vorabpauschale vor allen Vorgängen desselben Tages,
 // danach Übernahmen, dann die übrigen Vorgänge in Erfassungsreihenfolge.
 const rank={opening:1};
 // Kopien: die Rechnung ergänzt eine Reihenfolgenummer und darf den Zustand nie verändern.
 const events=s.events.map((e,index)=>({e,index})).filter(x=>x.e.date<=until).sort((a,b)=>a.e.date.localeCompare(b.e.date)||(rank[a.e.type]||2)-(rank[b.e.type]||2)||a.index-b.index).map(x=>({...x.e}));
 for(const e of events)if(e.type==='vap'){const k=`${keyOf(e.depotId,e.securityId)}|${e.year}`;if(bankVap.has(k))bankVapDuplicates.add(k);bankVap.set(k,e);}
 // Splits je Wertpapier, gleicher Tag in mehreren Depots einmal. Für die Vorabpauschale
 // werden Kurse und Ausschüttungen eines Jahres auf die Stücke nach dem Split umgerechnet.
 const splits=new Map();
 for(const e of events)if(e.type==='split'){const list=splits.get(e.securityId)||[];if(!list.some(x=>x.date===e.date))list.push({date:e.date,ratio:D(e.ratio)});splits.set(e.securityId,list);}
 const factorAfter=(securityId,date,year)=>(splits.get(securityId)||[]).filter(x=>x.date>date&&x.date<=`${year}-12-31`).reduce((f,x)=>mul(f,x.ratio),D('1'));
 // Ausschüttungen je Anteil des Fonds im Kalenderjahr, gleich in welchem Depot (§ 18 Abs. 1 InvStG).
 const distributionsOf=(securityId,year)=>sum((fundDistributions.get(securityId)||[]).filter(x=>x.date.startsWith(String(year))).map(x=>div(div(x.amount,x.quantity),factorAfter(securityId,x.date,year))));
 const transitions=new Map(events.filter(e=>e.type==='transition').map(e=>[keyOf(e.depotId,e.securityId),e]));
 const inflows=vapYears(s,until).map(r=>({inflow:true,date:r.inflow,year:r.year}));
 // Fiktive Veräußerung zum Ablauf des 31.12.2017 nach allen Vorgängen dieses Tages.
 const step2017=until>='2017-12-31'?[{transition:true,date:'2017-12-31'}]:[];
 const stage=x=>x.inflow?0:x.transition?2:1;
 const timeline=[...inflows,...events,...step2017].sort((a,b)=>a.date.localeCompare(b.date)||stage(a)-stage(b));
 for(const step of timeline)if(!step.inflow&&!step.transition)step._seq=order++;

 for(const step of timeline){
  if(step.inflow){applyVap(step.year,step.date);continue;}
  if(step.transition){applyTransition();continue;}
  const e=step;
  // Bewegungen der Währungskonten rechnet fx.mjs; die Werte des Übergangs 2017/2018 liest applyTransition.
  if(e.type==='fx'||e.type==='transition')continue;
  // Sonstiger Ertrag laut Abrechnung: voll steuerpflichtig im allgemeinen Topf, ohne Wirkung auf den Bestand.
  if(e.type==='otherIncome'){
   const gross=D(e.amount);
   move({eventId:e.id,type:'otherIncome',date:e.date,depotId:e.depotId,securityId:null,label:e.label,quantity:0n,economic:0n,tax:0n,income:{gross:S(gross),taxable:S(gross),exempt:'0',foreignTax:null,...taxOf(e),stock:false}});
   continue;
  }
  if(e.type==='interest'){
   // Zinsen auf ein Währungskonto ohne Depot: Inhaber und Bank kommen vom Konto.
   const gross=D(e.amount),own=e.depotId?null:accountHolder(s,(s.accounts||[]).find(a=>a.id===e.fx?.accountId));
   move({eventId:e.id,type:'interest',date:e.date,depotId:e.depotId||null,securityId:null,...(own?{personId:own.personId,bank:own.bank,abroad:own.abroad,accountId:e.fx.accountId}:{}),quantity:0n,economic:0n,tax:0n,income:{gross:S(gross),taxable:S(gross),exempt:'0',foreignTax:null,...taxOf(e),stock:false}});
   continue;
  }
  const x=security(e.securityId),kind=x.kind;
  if(e.type==='opening'){
   const regime=regimeOf(kind,e.group),q=D(e.quantity),cost=e.cost==null?null:D(e.cost);
   const legacyFund=regime==='fundPre2009'||regime==='fund2009';
   const from=coverageFrom(e.group,e.acquired),before=isFund(kind)?requiredYears(s,from,e.date):[];
   const vap=!isFund(kind)?0n:e.vapBefore!=null?D(e.vapBefore):before.length?null:0n;
   const lot={id:e.id,rootId:e.id,depotId:e.depotId,securityId:e.securityId,acquired:e.acquired||null,group:e.group,quantity:q,bought:q,cost,econ:cost,
    basis:legacyFund?(e.price2017==null?null:mul(q,D(e.price2017))):cost,
    deemed:regime==='fund2009'?(e.deemed2017==null?null:D(e.deemed2017)):0n,
    oldIncome:legacyFund?(e.oldIncome==null?null:D(e.oldIncome)):0n,
    vap,vapYears:before,missingVap:[],openedAt:e.date,history:[],order:e._seq,
    // Bis zum Stichtag angesetzte Vorabpauschalen: Angabe des Anwenders, gilt als erklärt.
    vapLog:vap?[{year:null,amount:vap,personId:depot(e.depotId)?.personId,abroad:false,before:true}]:[]};
   lotsAt(e.depotId,e.securityId).push(lot);
   if(e.acquired&&groupOf(e.acquired)!==e.group){lot.problem={status:'incomplete',reason:`Erwerbsdatum ${e.acquired.split('-').reverse().join('.')} passt nicht zur Erwerbsgruppe „${GROUPS[e.group]}“ – „Bestand übernehmen“ prüfen.`};issue('incomplete',`${x.name}: ${lot.problem.reason}`,e);}
   if(vap==null)issue('incomplete',`${x.name}: angesetzte Vorabpauschalen ${before.join(', ')} bis zum Stichtag fehlen.`,e);
   const v=values([lot],kind);move({eventId:e.id,type:'opening',date:e.date,depotId:e.depotId,securityId:e.securityId,...v});
  }else if(e.type==='buy'){
   if(isFund(kind)&&e.date<'2009-01-01')throw Error(`${x.name}: Fondskäufe vor 2009 als Bestand zum 01.01.2018 übernehmen.`);
   // Fondskauf 2009–2017: bis zum Übergang steuerlich mit den Anschaffungskosten; fiktiver
   // Gewinn und Alt-Erträge entstehen erst mit der fiktiven Veräußerung zum 31.12.2017.
   const history=isFund(kind)&&e.date<'2018-01-01',cost=D(e.amount),lot={id:e.id,rootId:e.id,depotId:e.depotId,securityId:e.securityId,acquired:e.date,group:e.date<'2009-01-01'?'pre2009':e.date<'2018-01-01'?'from2009':'from2018',
    quantity:D(e.quantity),bought:D(e.quantity),cost,econ:cost,basis:cost,deemed:history?null:0n,oldIncome:history?null:0n,vap:0n,vapYears:[],missingVap:[],history:[],order:e._seq,fromHistory:history,vapLog:[]};
   lotsAt(e.depotId,e.securityId).push(lot);
   move({eventId:e.id,type:'buy',date:e.date,depotId:e.depotId,securityId:e.securityId,...values([lot],kind)});
  }else if(e.type==='sell'){
   // Fiktiver Gewinn 2017 bei mehreren Käufen 2009–2017: belegt ist nur die Summe der Bank.
   // Wird nur ein Teil dieser Stücke verkauft, gilt der Wert laut Verkaufsabrechnung.
   const groupQuantity=g=>sum([...positions.values()].flatMap(list=>list.filter(l=>l.deemedEstimated&&l.deemedGroup===g&&l.quantity>0n).map(l=>l.quantity)));
   const groups=new Map(lotsAt(e.depotId,e.securityId).filter(l=>l.deemedEstimated&&l.quantity>0n).map(l=>[l.deemedGroup,groupQuantity(l.deemedGroup)]));
   // FIFO-Reihenfolge vor dem Abgang: zeigt im Rechenweg, dass die ältesten Lose zuerst gehen.
   const fifo=lotsAt(e.depotId,e.securityId).filter(l=>l.quantity>0n).sort((a,b)=>fifoKey(a).localeCompare(fifoKey(b))).map(l=>({id:l.id,acquired:l.acquired||null,group:l.group,quantity:S(l.quantity)}));
   const used=take(e,D(e.quantity)),v=values(used,kind),proceeds=D(e.amount),legacy=used.filter(l=>regimeOf(kind,l.group)==='fund2009');
   if(e.deemedSold!=null&&legacy.length)settleDeemed(legacy,D(e.deemedSold));
   else for(const [g,remaining] of groups){
    const own=used.filter(l=>l.deemedEstimated&&l.deemedGroup===g),sold=sum(own.map(l=>l.quantity));
    if(sold>0n&&sold<remaining){const estimate=own.every(l=>l.deemed!=null)?S(round(sum(own.map(l=>l.deemed)))):null;for(const l of own)l.problem={status:'incomplete',reason:`Gewinn aus der fiktiven Veräußerung 2017 der verkauften Stücke laut Verkaufsabrechnung erfassen${estimate!=null?` (geschätzt ${estimate} €)`:''} – bei mehreren Käufen 2009–2017 lässt er sich nicht eindeutig aufteilen.`};}
   }
   const sale=saleParts(used.map(stringify),e.amount,x,e.date);
   for(const r of sale.reasons)issue(r.status,`${x.name}, Verkauf ${e.date}: ${r.reason}`,e);
   move({eventId:e.id,type:'sell',date:e.date,depotId:e.depotId,securityId:e.securityId,quantity:-v.quantity,economic:v.economic==null?null:-v.economic,tax:v.tax==null?null:-v.tax,
    proceeds:S(proceeds),gainEconomic:v.economic==null?null:S(proceeds-v.economic),
    // Fondsverkauf vor 2018 nach altem Recht: Gewinn laut Bank, sonst vereinfacht Erlös − Anschaffungskosten.
    gainTax:sale.status==='historic'&&e.taxGainBank!=null?S(D(e.taxGainBank)):v.tax==null?null:S(proceeds-v.tax),taxGainSource:sale.status==='historic'?(e.taxGainBank!=null?'bank':'simplified'):null,
    ...taxOf(e),gainBank:e.gainBank??null,fees:e.fees??null,sale,consumed:used.map(stringify),fifo});
  }else if(e.type==='transfer'){
   const used=e.allocation==='prorata'?prorata(e):take(e,D(e.quantity)),v=values(used,kind),from=depot(e.depotId),to=depot(e.toDepotId);
   for(const l of used){l.history.push({eventId:e.id,date:e.date,from:e.depotId,to:e.toDepotId,kind:e.kind});lotsAt(e.toDepotId,e.securityId).push({...l,id:`${e.id}:${l.id}`,depotId:e.toDepotId,bought:l.quantity,order:e._seq});}
   const common={eventId:e.id,type:'transfer',date:e.date,securityId:e.securityId,transferKind:e.kind,price:e.price??null,batchId:e.batchId??null,
    marketValue:e.price==null?null:S(round(mul(v.quantity,D(e.price)))),consumed:used.map(stringify)};
   move({...common,depotId:e.depotId,counterpartDepotId:e.toDepotId,counterpartPersonId:to.personId,direction:'out',quantity:-v.quantity,economic:v.economic==null?null:-v.economic,tax:v.tax==null?null:-v.tax,gainEconomic:v.economic==null?null:'0',gainTax:v.tax==null?null:'0'});
   move({...common,depotId:e.toDepotId,counterpartDepotId:e.depotId,counterpartPersonId:from.personId,direction:'in',...v});
  }else if(e.type==='distribution'){
   const k=keyOf(e.depotId,e.securityId),q=sum(held(k).map(l=>l.quantity));
   // Dieselbe Ausschüttung in mehreren Depots (höchstens sieben Tage auseinander) zählt einmal je Anteil.
   // Zwei Ausschüttungen im selben Depot sind zwei Ereignisse und werden nie zusammengelegt.
   if(q>0n&&isFund(kind)){
    const list=fundDistributions.get(e.securityId)||[],near=list.filter(d=>dayDiff(d.date,e.date)<=7&&!d.depots.has(e.depotId)).sort((a,b)=>dayDiff(a.date,e.date)-dayDiff(b.date,e.date))[0];
    if(near){near.amount+=D(e.amount);near.quantity+=q;near.depots.add(e.depotId);}else list.push({date:e.date,amount:D(e.amount),quantity:q,depots:new Set([e.depotId])});
    fundDistributions.set(e.securityId,list);
   }
   if(q<=0n)issue('incomplete',`${x.name}: Ausschüttung am ${e.date} ohne Bestand im Depot.`,e);
   const share=D('1')-D(EXEMPTION[kind]),gross=D(e.amount);
   move({eventId:e.id,type:'distribution',date:e.date,depotId:e.depotId,securityId:e.securityId,quantity:0n,economic:0n,tax:0n,
    income:{gross:S(gross),taxable:S(mul(gross,share)),exempt:S(gross-mul(gross,share)),foreignTax:e.foreignTax??null,...taxOf(e),stock:kind==='stock'}});
  }else if(e.type==='accumulation'){
   // Thesaurierung nach altem Recht (bis 2017): Die ausschüttungsgleichen Erträge gelten als
   // zugeflossen und sind versteuert. Sie mindern den Gewinn der fiktiven Veräußerung 2017
   // (§ 8 Abs. 5 InvStG 2004) und erhöhen deshalb die steuerliche Basis bis zum 31.12.2017,
   // wie in der Buchhaltung auch den Anschaffungswert. Verteilt nach Stück auf die Lose im Depot.
   const lots=held(keyOf(e.depotId,e.securityId));if(!lots.length)throw Error(`${e.date}: Thesaurierung ohne Bestand im Depot.`);
   const amount=D(e.amount),Q=sum(lots.map(l=>l.quantity));let acc=0n;
   lots.forEach((l,i)=>{const p=i===lots.length-1?amount-acc:amount*l.quantity/Q;acc+=p;l.acc=(l.acc??0n)+p;if(l.econ!=null)l.econ+=p;if(l.basis!=null)l.basis+=p;});
   move({eventId:e.id,type:'accumulation',date:e.date,depotId:e.depotId,securityId:e.securityId,quantity:0n,economic:amount,tax:amount,
    income:{gross:S(amount),taxable:S(amount),exempt:'0',foreignTax:null,...taxOf(e),stock:false}});
  }else if(e.type==='split'){
   const lots=held(keyOf(e.depotId,e.securityId));if(!lots.length)throw Error(`${e.date}: Split ohne Bestand.`);
   const before=sum(lots.map(l=>l.quantity));for(const l of lots){l.quantity=mul(l.quantity,D(e.ratio));if(l.bought!=null)l.bought=mul(l.bought,D(e.ratio));}
   move({eventId:e.id,type:'split',date:e.date,depotId:e.depotId,securityId:e.securityId,quantity:sum(lots.map(l=>l.quantity))-before,economic:0n,tax:0n,ratio:e.ratio});
  }else if(e.type==='merger'){
   // Fondsverschmelzung (§ 23 InvStG) oder Aktientausch (§ 20 Abs. 4a S. 1 EStG): Die neuen Anteile treten an die Stelle der
   // alten; Anschaffungswert, Erwerbsdatum und Bestandsschutz gehen über (BMF vom 21.05.2019, Rz. 23.17, 23.18; BMF vom 14.05.2025, Rn. 100).
   const exchange=kind==='stock',lots=held(keyOf(e.depotId,e.securityId));if(!lots.length)throw Error(`${e.date}: ${exchange?'Aktientausch':'Verschmelzung'} ohne Bestand.`);
   const v=values(lots,kind),target=security(e.toSecurityId),Q=sum(lots.map(l=>l.quantity)),taxedQ=exchange?sum(lots.filter(l=>l.group!=='pre2009').map(l=>l.quantity)):Q;
   // Neue Stückzahl laut Abrechnung (das letzte Los nimmt den Rundungsrest) oder aus dem Verhältnis.
   const newTotal=e.toQuantity!=null?D(e.toQuantity):round(mul(Q,D(e.ratio)),6),ratio=e.toQuantity!=null?div(newTotal,Q):D(e.ratio);let placed=0n;
   const moved=lots.map((l,i)=>{const q=i===lots.length-1?newTotal-placed:newTotal*l.quantity/Q;placed+=q;
    return {...l,id:`${e.id}:${l.id}`,securityId:e.toSecurityId,quantity:q,bought:q,history:[...l.history,{eventId:e.id,date:e.date,merger:true,from:e.securityId}],order:e._seq,...(exchange?{}:{vapMerger:{date:e.date,from:e.securityId,ratio:S(ratio)}})};});
   // Anderer Teilfreistellungssatz (ab 2018): fiktive Veräußerung zum Rücknahmepreis des Zielfonds. Der Gewinn wird erst beim Verkauf
   // versteuert, mit dem Satz des alten Fonds; die Basis steigt oder fällt auf den Rücknahmepreis (§ 22 InvStG).
   const changesRate=!exchange&&e.date>='2018-01-01'&&EXEMPTION[target.kind]!==EXEMPTION[kind];let frozen=null;
   if(changesRate&&e.price==null){const reason=`Verschmelzung vom ${e.date.split('-').reverse().join('.')} auf einen Fonds mit anderer Teilfreistellung: Rücknahmepreis des Zielfonds am Tag der Verschmelzung eintragen (§ 22 Abs. 2 InvStG).`;for(const l of moved)l.problem={status:'incomplete',reason};issue('incomplete',`${x.name}: ${reason}`,e);}
   else if(changesRate){
    frozen=0n;const price=D(e.price);
    for(const l of moved){
     const regime=regimeOf(target.kind,l.group),base=regime==='regular'?l.cost:l.basis,value=mul(l.quantity,price),gain=base==null||l.vap==null?null:value-base-l.vap;
     l.frozen=[...(l.frozen||[]),{date:e.date,kind,rate:EXEMPTION[kind],gain,basis:l.basis,cost:l.cost,bfh:!(l.frozen||[]).length}];
     l.vapLog=(l.vapLog||[]).map(y=>({...y,settled:true}));
     l.basis=value;if(regime==='regular')l.cost=value;l.vap=0n;
     frozen=gain==null||frozen==null?null:frozen+gain;
    }
   }
   for(const l of lots)l.quantity=0n;lotsAt(e.depotId,e.toSecurityId).push(...moved);
   const w=values(moved,target.kind);
   move({eventId:e.id,type:'merger',direction:'out',date:e.date,depotId:e.depotId,securityId:e.securityId,counterpartSecurityId:e.toSecurityId,exchange,...(changesRate?{frozenRate:EXEMPTION[kind]}:{}),quantity:-v.quantity,economic:v.economic==null?null:-v.economic,tax:v.tax==null?null:-v.tax});
   move({eventId:e.id,type:'merger',direction:'in',date:e.date,depotId:e.depotId,securityId:e.toSecurityId,counterpartSecurityId:e.securityId,exchange,...w,...(changesRate?{frozen:nS(frozen),frozenRate:EXEMPTION[kind],frozenPending:e.price==null}:{})});
   // Barausgleich: Ertrag mit der Teilfreistellung des alten Fonds; beim Aktientausch wie eine Dividende, auf Altaktien von vor 2009
   // nicht steuerbar. Über 10 % des Börsenkurses der neuen Aktien ist der ganze Vorgang ein Tausch (BMF vom 14.05.2025, Rn. 100a).
   if(e.cash!=null&&D(e.cash)>0n){
    const cash=D(e.cash);
    if(exchange&&cash*10n>mul(placed,D(e.price)))throw Error(`${e.date}: Barausgleich über 10 % des Börsenkurses der neuen Aktien: Der ganze Vorgang gilt als Tausch (BFH vom 14.02.2022, VIII R 44/18). Bitte als Verkauf und Kauf buchen.`);
    const gross=cash*taxedQ/Q,share=D('1')-D(EXEMPTION[kind]);
    if(gross>0n)move({eventId:e.id,type:'distribution',cash:true,date:e.date,depotId:e.depotId,securityId:e.securityId,quantity:0n,economic:0n,tax:0n,
     income:{gross:S(gross),taxable:S(mul(gross,share)),exempt:S(gross-mul(gross,share)),foreignTax:null,...taxOf(e),stock:false}});
   }
  }
 }

 // Fiktive Veräußerung zum 31.12.2017 (§ 56 Abs. 2 InvStG) für einzeln erfasste Fondskäufe
 // 2009–2017: Basis = Stück × Kurs 31.12.2017 (Übergangsvorgang oder Kursseite). Den
 // fiktiven Gewinn und die Alt-Erträge der Position nennt die Bank; Depotklar verteilt den
 // Unterschied zum rechnerischen Gewinn (Kurs × Stück − bisherige Basis, also Anschaffungskosten
 // und erfasste Thesaurierungen) nach Stück auf die Lose, die Alt-Erträge ebenfalls nach Stück.
 // Ohne Bankwert bleiben sie offen.
 function applyTransition(){
  for(const [k,all] of positions){
   const lots=all.filter(l=>l.fromHistory&&l.quantity>0n);if(!lots.length)continue;
   const [depotId,securityId]=k.split('|'),x=security(securityId),ev=transitions.get(k)||null;
   const listed=s.prices.filter(p=>p.securityId===securityId&&p.date>='2017-12-01'&&p.date<='2017-12-31').sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
   const price=ev?.price2017!=null?D(ev.price2017):listed?D(listed.price):null;
   const Q=sum(lots.map(l=>l.quantity)),before=sum(lots.map(l=>l.basis));
   const computed=price==null?null:lots.map(l=>mul(l.quantity,price)-l.basis),computedTotal=computed==null?null:sum(computed);
   // Anteil nach Stück; das letzte Los trägt den Rundungsrest.
   const parts=total=>{let acc=0n;return lots.map((l,i)=>{const p=i===lots.length-1?total-acc:total*l.quantity/Q;acc+=p;return p;});};
   const delta=ev?.deemed2017!=null&&computed?parts(D(ev.deemed2017)-computedTotal):null,income=ev?.oldIncome!=null?parts(D(ev.oldIncome)):null;
   // Weicht der Bankwert bei mehreren Losen von der Rechnung ab, ist die Verteilung nur geschätzt.
   const estimated=lots.length>1&&delta!=null&&D(ev.deemed2017)!==computedTotal;
   lots.forEach((l,i)=>{
    l.basis=price==null?null:mul(l.quantity,price);
    l.deemed=delta?computed[i]+delta[i]:null;
    l.oldIncome=income?income[i]:null;
    l.deemedEstimated=estimated;l.deemedGroup=k;
   });
   if(price==null)issue('incomplete',`${x.name}: Kurs 31.12.2017 fehlt (Kursseite, Spalte 31.12.2017, oder „Übergang 2017/2018“).`,{depotId,securityId,date:'2017-12-31'});
   if(ev?.deemed2017==null)issue('incomplete',`${x.name}: fiktiver Gewinn 2017 laut Bank fehlt – unter „Übergang 2017/2018“ erfassen${computedTotal!=null?` (rechnerisch ${S(round(computedTotal))} €)`:''}.`,{depotId,securityId,date:'2017-12-31'});
   if(ev?.oldIncome==null)issue('incomplete',`${x.name}: Angabe zu akkumulierten ausschüttungsgleichen Erträgen zum 31.12.2017 fehlt – unter „Übergang 2017/2018“ erfassen, auch wenn es keine gibt.`,{depotId,securityId,date:'2017-12-31'});
   const after=price==null?null:sum(lots.map(l=>l.basis));
   move({eventId:ev?.id??null,type:'transition',date:'2017-12-31',depotId,securityId,quantity:0n,economic:0n,tax:after==null?null:after-before,
    deemed:lots.every(l=>l.deemed!=null)?S(sum(lots.map(l=>l.deemed))):null,computedDeemed:computedTotal==null?null:S(round(computedTotal)),accumulated:S(sum(lots.map(l=>l.acc??0n))),price:price==null?null:S(price)});
  }
 }

 // Vorabpauschale eines Jahres für alle zum Zufluss gehaltenen Fondslose. Der
 // Bankwert der Position hat Vorrang und wird nach Stück und Haltedauer verteilt.
 function applyVap(year,date){
  for(const [k,all] of positions){
   const lots=all.filter(l=>l.quantity>0n);if(!lots.length)continue;
   const [depotId,securityId]=k.split('|'),x=security(securityId);if(!isFund(x.kind))continue;
   // Anteile aus der Zeit vor 2018 gelten zum 01.01.2018 als angeschafft (§ 56
   // Abs. 2 InvStG): ab 2018 volles Jahr. Sonst zählt das ursprüngliche
   // Erwerbsdatum, auch nach Schenkung; ohne Datum nur, wenn der Stichtag vor dem Jahr liegt.
   // Verschmelzung im Jahr: Die Anteile am übernehmenden Fonds gelten für die Vorabpauschale im
   // Verschmelzungsmonat als erworben; bei einer Verschmelzung zum 31.12. gelten die Werte des
   // untergegangenen Fonds mit dem ursprünglichen Erwerb (BMF-Anwendungsschreiben zum InvStG vom 21.05.2019, Abschnitt zu § 23).
   const mergedIn=l=>l.vapMerger&&l.vapMerger.date.startsWith(String(year))?l.vapMerger:null;
   const yearEnd=l=>mergedIn(l)?.date.endsWith('-12-31')?mergedIn(l):null;
   const monthAfter=d=>new Date(Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10))+1)).getUTCMonth()+1;
   const factorOf=l=>{
    const merged=mergedIn(l);if(merged&&!merged.date.endsWith('-12-31'))return D(String(13-monthAfter(merged.date)));
    if(l.group!=='from2018')return D('12');
    const acquired=l.acquired,y=acquired?Number(acquired.slice(0,4)):null;
    if(y!=null)return y<year?D('12'):y===year?D(String(13-Number(acquired.slice(5,7)))):0n;
    return (l.openedAt||'')<`${year}-01-01`?D('12'):null;
   };
   const bankKey=`${k}|${year}`,duplicate=bankVapDuplicates.has(bankKey),bank=duplicate?null:bankVap.get(bankKey)||null;if(bankVap.has(bankKey))bankVapUsed.add(bankKey);
   // Vorabpauschale je Anteil laut Steuerinformation des Fonds vor der Rechnung aus Kursen: Sie gilt für
   // ganzjährig gehaltene Anteile und enthält die Ausschüttungen; Käufe im Jahr zwölftelt factorOf.
   const puFor=id=>{const unit=(s.vapUnits||[]).find(u=>u.securityId===id&&u.year===year);return unit?{status:'computed',perUnit:unit.perUnit,from:'unit'}:{...vapPerUnit(s.prices,id,year,S(distributionsOf(id,year)),{factorAfter:date=>factorAfter(id,date,year),rule:baseRateOf(s,year)}),from:'prices'};};
   const factors=lots.map(factorOf),pu=puFor(securityId);
   // Je Los der Wert je Anteil: nach einer Verschmelzung zum 31.12. der des untergegangenen Fonds, umgerechnet auf die neuen Stücke.
   const lotPu=lots.map(l=>{const m=yearEnd(l);if(!m)return pu;const p=puFor(m.from);return p.status==='computed'?{...p,perUnit:S(div(D(p.perUnit),D(m.ratio)))}:p;});
   const weights=factors.map((f,i)=>f==null?null:mul(lots[i].quantity,f));
   const open=lotPu.find(p=>p.status!=='computed'&&p.status!=='zero');
   const computedTotal=!open&&weights.every(w=>w!=null)?round(div(sum(weights.map((w,i)=>mul(D(lotPu[i].perUnit),w))),D('12'))):null;
   if(!duplicate&&pu.status==='zero'&&!bank){for(const l of lots)if(!l.vapYears.includes(year))l.vapYears.push(year);continue;}
   // Ohne Basiszins (Folgejahr, noch nicht eingetragen) bleibt die Vorabpauschale offen, außer die Bank nennt sie.
   let amount=null,source=bank?'bank':pu.from==='unit'?'unit':'computed',reason=null;
   if(duplicate)reason=`Vorabpauschale ${year} laut Bank doppelt erfasst – einen der beiden Vorgänge löschen.`;
   else if(bank)amount=D(bank.amount);
   else if(computedTotal!=null)amount=computedTotal;
   else reason=open?.reason||`Vorabpauschale ${year}: Erwerbsmonat eines Loses unbekannt.`;
   const weightSum=weights.every(w=>w!=null)?sum(weights):null;
   if(amount!=null&&(weightSum==null||(weightSum===0n&&amount!==0n))){amount=null;reason=`Vorabpauschale ${year}: Aufteilung auf die Lose nicht möglich.`;}
   let allocated=0n;const shares=[];
   // Je Los, was der Rechenweg braucht: Stück, Anteil des Jahres und Wert je Anteil.
   const info=(l,i)=>({lotId:l.id,rootId:l.rootId,acquired:l.acquired||null,group:l.group,history:structuredClone(l.history),quantity:S(l.quantity),factor:factors[i]==null?null:S(div(factors[i],D('12'))),months:factors[i]==null?null:S(factors[i]),perUnit:lotPu[i].perUnit??null});
   lots.forEach((l,i)=>{
    if(weights[i]===0n){shares.push({...info(l,i),amount:'0'});return;}
    if(!l.vapYears.includes(year))l.vapYears.push(year);
    // Fehlt eine Vorabpauschale, ist die steuerliche Basis des Loses ab hier unbekannt.
    if(amount==null){l.missingVap.push(year);l.vap=null;shares.push({...info(l,i),amount:null});return;}
    const last=lots.slice(i+1).every((m,j)=>weights[i+1+j]===0n),a=last?amount-allocated:weightSum?amount*weights[i]/weightSum:0n;
    allocated+=a;l.vap=add(l.vap,a);shares.push({...info(l,i),amount:S(a)});
    // Herkunft je Jahr: bei Depots ohne deutschen Steuerabzug mindert sie den Gewinn nur, wenn sie erklärt wurde.
    if(a>0n)l.vapLog=[...(l.vapLog||[]),{year,amount:a,personId:depot(depotId)?.personId,abroad:Boolean(depot(depotId)?.abroad)}];
   });
   const kind=x.kind,share=D('1')-D(EXEMPTION[kind]);
   if(reason)issues.push({status:'incomplete',reason:`${x.name}: ${reason}`,eventId:null,depotId,securityId,date});
   if(amount!=null&&amount===0n&&!bank)continue;
   move({eventId:bank?.id??null,type:'vap',date,year,depotId,securityId,quantity:0n,economic:0n,tax:amount,source:amount==null?'missing':source,computedFrom:pu.from,...taxOf(bank),
    computed:computedTotal==null?null:S(computedTotal),prices:pu.prices||null,split:Boolean(pu.split),
    perUnit:pu.perUnit??null,rate:pu.rule?.rate??null,noRate:amount==null&&pu.status==='unsupported',start:pu.start??null,end:pu.end??null,distributionPerUnit:pu.distributions??null,
    lots:shares,income:amount==null?null:{gross:S(amount),taxable:S(mul(amount,share)),exempt:S(amount-mul(amount,share)),stock:false}});
  }
 }

 // Bankwerte der Vorabpauschale, die keinem Bestand zugeordnet werden konnten oder doppelt sind.
 for(const [key,e] of bankVap){
  const inflow=vapInflow(e.year);if(!inflow||inflow>until)continue;
  if(bankVapDuplicates.has(key))issues.push({status:'incomplete',kind:'vapDuplicate',reason:`${security(e.securityId)?.name}: Vorabpauschale ${e.year} laut Bank doppelt erfasst – einen der beiden Vorgänge löschen.`,eventId:e.id,depotId:e.depotId,securityId:e.securityId,date:inflow});
  else if(!bankVapUsed.has(key))issues.push({status:'incomplete',kind:'vapUnused',reason:`${security(e.securityId)?.name}: Vorabpauschale ${e.year} laut Bank, aber zum Zufluss am ${inflow.split('-').reverse().join('.')} kein Bestand im Depot – Depot, Wertpapier und Jahr prüfen.`,eventId:e.id,depotId:e.depotId,securityId:e.securityId,date:inflow});
 }
 // Der alte Fonds besteht nach einer Verschmelzung nicht mehr: Bestand in einem anderen Depot heißt, dort fehlt die Buchung.
 for(const e of events.filter(x=>x.type==='merger'&&isFund(security(x.securityId).kind)))for(const [k,lots] of positions){
  const [depotId,securityId]=k.split('|');
  if(securityId===e.securityId&&depotId!==e.depotId&&lots.some(l=>l.quantity>0n))issues.push({status:'incomplete',kind:'mergerOpen',reason:`${security(securityId).name} wurde am ${e.date.split('-').reverse().join('.')} verschmolzen, in ${depot(depotId)?.name||'einem Depot'} liegt aber noch Bestand: Die Verschmelzung auch dort buchen.`,eventId:e.id,depotId,securityId,date:e.date});
 }
 for(const e of events.filter(x=>x.type==='merger'&&isFund(security(x.securityId).kind))){
  const a=security(e.securityId).isin,b=security(e.toSecurityId)?.isin;
  if(a&&b&&a.slice(0,2).toUpperCase()!==b.slice(0,2).toUpperCase())issues.push({status:'incomplete',kind:'mergerAbroad',reason:`${security(e.securityId).name} → ${security(e.toSecurityId).name}, Verschmelzung vom ${e.date.split('-').reverse().join('.')}: Die ISINs nennen verschiedene Staaten. Grenzüberschreitend gilt § 23 InvStG nicht – dann ist es ein Verkauf zum Tageswert und ein Neukauf (BMF vom 21.05.2019, Rz. 23.6, 23.27). Mit der Abrechnung vergleichen und gegebenenfalls Verkauf und Kauf buchen.`,eventId:e.id,depotId:e.depotId,securityId:e.securityId,date:e.date});
 }
 const out=new Map();
 for(const [k,lots] of positions){const rest=lots.filter(l=>l.quantity>0n).map(stringify);if(rest.length)out.set(k,rest);}
 return {positions:out,moves,issues};

 // Fiktiven Gewinn laut Verkaufsabrechnung auf die verkauften Lose legen; den Unterschied
 // zur bisherigen Schätzung tragen die übrigen geschätzten Lose derselben Gruppe nach Stück.
 function settleDeemed(sold,target){
  const previous=sold.every(l=>l.deemed!=null)?sum(sold.map(l=>l.deemed)):null,Q=sum(sold.map(l=>l.quantity));let acc=0n;
  // Andere Sperren der Lose (etwa eine Verschmelzung mit Wechsel der Teilfreistellung) bleiben bestehen.
  sold.forEach((l,i)=>{const p=i===sold.length-1?target-acc:target*l.quantity/Q;acc+=p;l.deemed=p;});
  const groups=new Set(sold.filter(l=>l.deemedEstimated).map(l=>l.deemedGroup));
  if(previous==null||!groups.size)return;
  const rest=[...positions.values()].flatMap(list=>list.filter(l=>l.deemedEstimated&&groups.has(l.deemedGroup)&&l.quantity>0n&&l.deemed!=null)),R=sum(rest.map(l=>l.quantity));
  if(!R)return;let moved=0n;const diff=previous-target;
  rest.forEach((l,i)=>{const p=i===rest.length-1?diff-moved:diff*l.quantity/R;moved+=p;l.deemed+=p;});
 }
}

export function holdings(s,{until=today(),personId='',depotId=''}={}){
 const r=replay(s,{until});const list=[];
 for(const [k,lots] of r.positions){
  const [d,x]=k.split('|'),dep=s.depots.find(z=>z.id===d),sec=s.securities.find(z=>z.id===x);
  if(personId&&dep.personId!==personId||depotId&&d!==depotId)continue;
  const internal=lots.map(l=>({...l,cost:l.cost==null?null:D(l.cost),econ:l.econ==null?null:D(l.econ),basis:l.basis==null?null:D(l.basis),acc:l.acc==null?null:D(l.acc),vap:l.vap==null?null:D(l.vap)}));
  list.push({depotId:d,securityId:x,personId:dep.personId,security:sec,lots,quantity:S(sum(lots.map(l=>D(l.quantity)))),
   economic:nS(total(internal.map(economicValue))),tax:nS(total(internal.map(l=>taxValue(l,sec.kind))))});
 }
 return {holdings:list,replay:r};
}
export {TRANSFER_KINDS};
