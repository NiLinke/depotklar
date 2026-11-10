import {D,S,min,max,mul,round,sum} from './decimal.mjs';
import {RELATIONS,CLASS_I,giftYearOf} from './rules.mjs';

// Steuerklasse I nach § 19 Abs. 1 ErbStG; steuerpflichtiger Erwerb auf volle
// 100 € abgerundet (§ 10 Abs. 1 S. 6 ErbStG); Härteausgleich nach § 19 Abs. 3
// ErbStG; Steuer auf volle Euro abgerundet.
export function classITax(value){
 const taxable=max(0n,D(value))/D('100')*D('100');
 const limits=[...CLASS_I.limits,null],rates=CLASS_I.rates;
 const index=limits.findIndex(l=>l===null||taxable<=D(l));let tax=mul(taxable,D(rates[index]));
 if(index>0){const previous=D(limits[index-1]),previousTax=mul(previous,D(rates[index-1]));tax=min(tax,previousTax+(taxable-previous)/2n);}
 return {taxable:S(taxable),tax:S(round(tax,0,'floor'))};
}

const tenYearsBefore=date=>`${Number(date.slice(0,4))-10}${date.slice(4)}`;

// Alle Erwerbe eines Empfängers von einem Schenker: erfasste Schenkungen aus der
// Fortschreibung und Vorerwerbe außerhalb von Depotklar. Erwerbe desselben Tages
// bilden einen Erwerb.
export function giftsBetween(s,moves,donorId,recipientId){
 const recorded=moves.filter(m=>(m.type==='transfer'||m.type==='fx')&&m.direction==='out'&&m.transferKind==='gift'&&m.personId===donorId&&m.counterpartPersonId===recipientId)
  .map(m=>m.type==='fx'?{source:'fx',date:m.date,value:m.marketValue,eventId:m.eventId,accountId:m.accountId,amount:S(-D(m.amount)),currency:m.currency}:{source:'depot',date:m.date,value:m.marketValue,eventId:m.eventId,securityId:m.securityId,quantity:S(-D(m.quantity)),price:m.price});
 const external=s.priorGifts.filter(g=>g.donorId===donorId&&g.recipientId===recipientId).map(g=>({source:'external',date:g.date,value:g.value,taxPaid:g.taxPaid??null,note:g.note||'',id:g.id}));
 const byDay=new Map();
 for(const g of [...recorded,...external].sort((a,b)=>a.date.localeCompare(b.date))){if(!byDay.has(g.date))byDay.set(g.date,[]);byDay.get(g.date).push(g);}
 return [...byDay].map(([date,parts])=>({date,parts,value:parts.every(p=>p.value!=null)?S(sum(parts.map(p=>D(p.value)))):null,taxPaid:parts.every(p=>p.source==='external'&&p.taxPaid!=null)?S(sum(parts.map(p=>D(p.taxPaid)))):null}));
}

// Zusammenrechnung nach § 14 ErbStG je Erwerb: Steuer auf den Gesamterwerb der
// letzten zehn Jahre abzüglich der höheren von fiktiver und tatsächlicher Steuer
// der Vorerwerbe; mindestens die Steuer auf den Erwerb allein; höchstens die
// Hälfte des Erwerbs (§ 14 Abs. 3 ErbStG).
export function giftAssessments(s,moves,donorId,recipientId){
 const relation=s.relations.find(r=>r.donorId===donorId&&r.recipientId===recipientId);
 const allowance=relation?D(RELATIONS[relation.kind].allowance):null,acquisitions=giftsBetween(s,moves,donorId,recipientId),done=[];
 for(const g of acquisitions){
  const reasons=[],add=(status,text)=>reasons.push({status,text});
  const year=Number(g.date.slice(0,4)),prior=done.filter(p=>p.date>tenYearsBefore(g.date));
  if(!relation)add('incomplete','Verwandtschaftsverhältnis zwischen Schenker und Empfänger angeben.');
  if(g.value==null)add('incomplete','Kurs am Tag der Schenkung fehlt – ohne Wert keine Schenkungsteuer.');
  if(prior.some(p=>p.value==null))add('incomplete','Ein Vorerwerb im Zehnjahreszeitraum hat keinen Wert.');
  if(!giftYearOf(year))add('unsupported',`Schenkungsteuer für ${year} nicht freigegeben; der Erwerb zählt als Vorerwerb.`);
  let r={...g,year,priorValue:null,allowance:allowance==null?null:S(allowance),taxable:null,tax:null,status:'supported',reasons};
  if(!reasons.length){
   const value=D(g.value),previous=sum(prior.map(p=>D(p.value)));
   const notional=D(classITax(max(0n,previous-allowance)).tax);
   const actualKnown=prior.every(p=>p.creditTax!=null),actual=actualKnown?sum(prior.map(p=>D(p.creditTax))):null;
   if(actual==null&&notional>0n)add('incomplete','Tatsächlich gezahlte Steuer eines Vorerwerbs fehlt.');
   if(!reasons.length){
    const combined=classITax(max(0n,value+previous-allowance)),credit=max(notional,actual??0n),alone=D(classITax(max(0n,value-allowance)).tax);
    const tax=min(max(max(0n,D(combined.tax)-credit),alone),value/2n);
    r={...r,priorValue:S(previous),combinedTaxable:combined.taxable,combinedTax:combined.tax,credit:S(credit),taxable:combined.taxable,tax:S(round(tax,0,'floor'))};
   }
  }
  r.status=reasons.some(x=>x.status==='unsupported')?'unsupported':reasons.length?'incomplete':'supported';r.reasons=reasons;
  // Für die Folgeerwerbe zählt die tatsächlich zu entrichtende Steuer (§ 14 Abs. 1 S. 3 ErbStG): ein
  // erfasster Bescheidwert vor der eigenen Rechnung; eine nicht ermittelte bleibt offen.
  done.push({...r,tax:r.status==='supported'?r.tax:g.taxPaid,creditTax:g.taxPaid!=null?g.taxPaid:r.status==='supported'?r.tax:null});
 }
 return {relation:relation?.kind??null,allowance:allowance==null?null:S(allowance),acquisitions:done};
}

// Wie viel bis zu einem Stichtag noch steuerfrei übertragen werden kann, und
// wann der älteste Erwerb aus dem Zehnjahreszeitraum fällt.
export function remainingAllowance(s,moves,donorId,recipientId,asOf){
 const r=giftAssessments(s,moves,donorId,recipientId);if(r.allowance==null)return {status:'incomplete',remaining:null,relation:null};
 const inWindow=r.acquisitions.filter(a=>a.date<=asOf&&a.date>tenYearsBefore(asOf));
 if(inWindow.some(a=>a.value==null))return {status:'incomplete',remaining:null,relation:r.relation,allowance:r.allowance};
 const used=sum(inWindow.map(a=>D(a.value))),oldest=inWindow[0]?.date??null;
 return {status:'supported',relation:r.relation,allowance:r.allowance,used:S(used),remaining:S(max(0n,D(r.allowance)-used)),
  frees:oldest?`${Number(oldest.slice(0,4))+10}${oldest.slice(4)}`:null,acquisitions:r.acquisitions};
}
