import {D,S,mul,min,max,sum} from './decimal.mjs';
import {EXEMPTION,regimeOf,isFund} from './rules.mjs';

const nullableSum=values=>values.some(v=>v==null)?null:S(sum(values.map(D)));
// Wirtschaftlicher Gewinn gegen den Wert im gleitenden Durchschnitt (econ), ältere Lose ohne ihn gegen Anschaffung und Thesaurierung.
const economicGain=(net,lot)=>{const v=lot.econ!==undefined?lot.econ:lot.cost==null?null:S(D(lot.cost)+D(lot.acc??'0'));return net==null||v==null?null:S(net-D(v));};

// Steuerliche Teile eines Abgangs je verbrauchtem Los. Regeln:
// - Aktie vor 2009: Gewinn nicht steuerbar.
// - Regulär: Erlös − Anschaffungskosten − angesetzte Vorabpauschalen, Teilfreistellung
//   nach Fondsart (§ 19 Abs. 1 S. 4, § 20 InvStG).
// - Fonds 2009–2017: Zuwachs ab 2018 wie regulär gegen die Basis 31.12.2017; dazu
//   der fiktive Gewinn 2017 ohne Teilfreistellung (§ 56 Abs. 2, 3 InvStG).
// - Akkumulierte ausschüttungsgleiche Erträge ausländischer thesaurierender Fonds
//   (oldIncome) sind keine Einkünfte des Verkaufsjahres: Die Bank holt beim Verkauf
//   nur den Steuerabzug nach (§ 56 Abs. 3 S. 6 InvStG); in der Erklärung werden sie
//   abgezogen (BMF vom 16.05.2025, Rn. 28). Sie stehen nur zur Information im Ergebnis.
// - Fonds vor 2009: wie 2009–2017, der Zuwachs bis 2017 bleibt steuerfrei; der
//   Zuwachs ab 2018 nach Teilfreistellung ist auf den persönlichen Freibetrag
//   anrechenbar (§ 56 Abs. 6 InvStG).
// - Anleihe, Zertifikat: wie regulär, ohne Teilfreistellung; vor 2009 angeschafft gesperrt
//   (§ 52 Abs. 28 S. 15 bis 17 EStG).
// - ETC mit Rohstoffanspruch: kein Kapitalertrag. Ein Gewinn zählt als privates
//   Veräußerungsgeschäft, wenn er höchstens ein Jahr nach der Anschaffung entsteht
//   (§ 23 EStG; BMF vom 14.05.2025, Rn. 57).
// - Verschmelzung mit anderem Teilfreistellungssatz: Der Gewinn aus der fiktiven Veräußerung
//   (frozen) kommt beim Verkauf hinzu, mit der Teilfreistellung des alten Fonds (§ 22 InvStG;
//   BMF vom 21.05.2019, Rz. 22.11, 23.24).
// - Verlust ab 2018 bei Fonds 2009–2017: Soweit er nur darauf beruht, dass der
//   Kurs 31.12.2017 über den historischen Anschaffungskosten lag, gilt keine
//   Teilfreistellung (BFH vom 25.11.2025, VIII R 22/23, VIII R 31/23); dafür
//   werden die historischen Anschaffungskosten gebraucht. Bestandsgeschützte
//   Alt-Anteile vor 2009 sind ausgenommen.
export function saleParts(consumed,proceeds,security,date){
 const share=D('1')-D(EXEMPTION[security.kind]),reasons=[],details=[];
 const add=(status,reason,lotId)=>reasons.push({status,reason,lotId});
 const total=sum(consumed.map(l=>D(l.quantity)));let allocated=0n;
 // Fondsverkauf vor 2018: altes Investmentsteuerrecht, die Bank hat den Gewinn damals
 // ermittelt und versteuert. Depotklar rechnet ihn nicht nach (Status „historisch“),
 // führt aber die Lose richtig fort. Aktien ab 2009 unterliegen schon der Abgeltungsteuer.
 const historic=date<'2018-01-01'&&isFund(security.kind);
 if(date<'2009-01-01')add('unsupported','Verkäufe vor 2009 liegen vor der Abgeltungsteuer und außerhalb des Modells.');
 consumed.forEach((lot,index)=>{
  const q=D(lot.quantity),net=proceeds==null?null:index===consumed.length-1?D(proceeds)-allocated:D(proceeds)*q/total;if(net!=null)allocated+=net;
  const regime=regimeOf(security.kind,lot.group),known=k=>lot[k]!=null;
  if(!historic&&lot.problem)add(lot.problem.status,lot.problem.reason,lot.id);
  if(historic){details.push({lotId:lot.id,rootId:lot.rootId,regime,group:lot.group,acquired:lot.acquired,quantity:S(q),proceeds:net==null?null:S(net),cost:lot.cost,economicGain:economicGain(net,lot),taxable:null});return;}
  // Altaktie (vor 2009) vor 2018 verkauft: steuerfrei nur nach mehr als einem Jahr (§ 23 EStG a. F.).
  if(regime==='stockPre2009'&&date<'2018-01-01'&&(!lot.acquired||date<=`${Number(lot.acquired.slice(0,4))+1}${lot.acquired.slice(4)}`))add('unsupported','Altaktie innerhalb eines Jahres nach dem Kauf verkauft (§ 23 EStG alter Fassung) oder Kaufdatum unbekannt.',lot.id);
  let pre=null,post=null,taxable=null,exempt=null,eligible=0n,unexempted=0n,own=null,bfhOpen;
  const need=[],frozen=lot.frozen||[],frozenDetails=[];
  if(frozen.some(f=>f.gain==null))need.push('Gewinn der fiktiven Veräußerung bei der Verschmelzung (§ 22 InvStG)');
  if(regime==='fund2009'&&frozen.some(f=>f.bfh!==false&&f.gain!=null&&D(f.gain)<0n&&f.cost==null))need.push('ursprünglicher Anschaffungswert (für den Verlust nach BFH vom 25.11.2025)');
  if(regime==='bondPre2009')add('unsupported','Anleihe oder Zertifikat vor 2009 angeschafft: Die Übergangsregel nach § 52 Abs. 28 S. 15 bis 17 EStG ist nicht abgebildet.',lot.id);
  if(regime==='commodity'&&lot.group==='pre2009')add('unsupported','ETC vor 2009 angeschafft: Die Übergangsregel nach § 52 Abs. 28 S. 17 EStG ist nicht abgebildet.',lot.id);
  if(regime==='commodity'){if(!known('cost'))need.push('Anschaffungskosten');if(!lot.acquired)need.push('Kaufdatum (für die Jahresfrist nach § 23 EStG)');}
  // Eine fehlende Jahres-Vorabpauschale wird unten konkret benannt; dann nicht zusätzlich allgemein.
  const vapKnown=known('vap')||(lot.missingVap||[]).length>0;
  if(regime==='regular'||regime==='bondPre2009'){if(!known('cost'))need.push('Anschaffungskosten');if(!vapKnown)need.push('bisherige Vorabpauschalen');}
  if(regime==='fund2009'||regime==='fundPre2009'){if(!known('basis'))need.push('Kurs 31.12.2017');if(!vapKnown)need.push('bisherige Vorabpauschalen');if(!known('oldIncome'))need.push('Angabe zu akkumulierten ausschüttungsgleichen Erträgen');}
  if(regime==='fund2009'&&!known('deemed'))need.push('fiktiver Gewinn 2017');
  // Für die Begrenzung der Teilfreistellung beim Verlust: historische Anschaffungskosten.
  if(regime==='fund2009'&&!frozen.length&&!need.length&&net!=null&&!known('cost')&&net<D(lot.basis)+D(lot.vap??'0'))need.push('ursprünglicher Anschaffungswert (für den Verlust ab 2018 nach BFH vom 25.11.2025)');
  for(const n of need)add('incomplete',`${n} für das verkaufte Los fehlt.`,lot.id);
  for(const year of lot.missingVap||[])add('incomplete',`Vorabpauschale ${year} für das verkaufte Los fehlt: Jahreskurse oder Bankwert erfassen.`,lot.id);
  if(!need.length&&!(lot.missingVap||[]).length&&net!=null&&date>='2009-01-01'){
   if(regime==='stockPre2009'||regime==='commodity'||regime==='bondPre2009'){pre=0n;post=0n;taxable=0n;exempt=0n;}
   else if(regime==='regular'){post=net-D(lot.cost)-D(lot.vap);pre=0n;taxable=mul(post,share);exempt=post-taxable;}
   else{
    post=net-D(lot.basis)-D(lot.vap);pre=regime==='fund2009'?D(lot.deemed):0n;
    // Verlustteil aus dem Kurs 31.12.2017 über den historischen Kosten voll, der Rest mit Teilfreistellung.
    unexempted=regime==='fund2009'&&!frozen.length&&post<0n?min(-post,max(0n,D(lot.basis)-D(lot.cost))):0n;
    const part=-unexempted+mul(post+unexempted,share);
    taxable=pre+part;exempt=post-part;eligible=regime==='fundPre2009'?part:0n;
   }
   own={post:S(post),unexempted:S(unexempted),exempt:S(exempt),taxable:S(taxable)};
   for(const f of frozen){
    // Nur der Abschnitt ab dem Kurs 31.12.2017 (erste Verschmelzung); danach ist die Basis ein Rücknahmepreis.
    const g=D(f.gain),u=regime==='fund2009'&&f.bfh!==false&&g<0n?min(-g,max(0n,D(f.basis)-D(f.cost))):0n,part=-u+mul(g+u,D('1')-D(f.rate));
    frozenDetails.push({...f,unexempted:S(u),part:S(part),exempt:S(g-part)});
    post+=g;taxable+=part;exempt+=g-part;unexempted+=u;if(regime==='fundPre2009')eligible+=part;
   }
   // Verlust über eine Verschmelzung mit Satzwechsel hinweg: Ob das BFH-Urteil die Teilfreistellung auch für den Verlust
   // nach der Verschmelzung begrenzt, ist nicht entschieden. Depotklar rechnet mit Teilfreistellung und nennt den Betrag.
   if(regime==='fund2009'&&frozen.length&&post<0n&&D(EXEMPTION[security.kind]??'0')>0n){const f0=frozen[0];bfhOpen=f0.cost==null||lot.cost==null?null:max(0n,min(-post,max(0n,D(f0.basis)-D(f0.cost)))-unexempted);if(bfhOpen===0n)bfhOpen=undefined;}
  }
  const s=v=>v==null?null:S(v);
  details.push({lotId:lot.id,rootId:lot.rootId,regime,group:lot.group,acquired:lot.acquired,quantity:S(q),proceeds:s(net),
   cost:lot.cost,basis:lot.basis,vap:lot.vap,deemed:regime==='fund2009'?lot.deemed:'0',oldIncome:regime==='regular'||regime==='stockPre2009'?'0':lot.oldIncome,
   economicGain:economicGain(net,lot),
   ...(regime==='commodity'?{privateGain:net==null||!known('cost')?null:S(net-D(lot.cost)),within:lot.acquired?date<=`${Number(lot.acquired.slice(0,4))+1}${lot.acquired.slice(4)}`:null}:{}),
   pre2018:s(pre),post2018:s(post),taxable:s(taxable),exempt:s(exempt),protectedPart:regime==='fundPre2009'&&taxable!=null?S(eligible):'0',vapLog:lot.vapLog||[],
   lossWithoutExemption:taxable==null?null:S(unexempted),...(frozen.length?{frozen:frozenDetails,own}:{}),...(bfhOpen!==undefined&&taxable!=null?{bfhOpen:bfhOpen==null?null:S(bfhOpen)}:{})});
 });
 const complete=!reasons.length&&details.every(d=>d.taxable!=null);
 // Je Abschnitt und Fondsart: der eigene Teil mit der Art dieses Fonds, ein aufgeschobener Gewinn mit der des alten
 // Fonds (§ 22 Abs. 3 InvStG). part: steuerpflichtig ohne fiktiven Gewinn 2017.
 const segments=complete?details.flatMap(d=>d.frozen?[{kind:security.kind,regime:d.regime,post:d.own.post,part:S(D(d.own.taxable)-D(d.pre2018)),unexempted:d.own.unexempted},...d.frozen.map(f=>({kind:f.kind,regime:d.regime,post:f.gain,part:f.part,unexempted:f.unexempted}))]
  :[{kind:security.kind,regime:d.regime,post:d.post2018,part:S(D(d.taxable)-D(d.pre2018)),unexempted:d.lossWithoutExemption??'0'}]):null;
 const pick=(k,filter=()=>true)=>complete?S(sum(details.filter(filter).map(d=>D(d[k])))):null;
 if(historic)return {details,reasons:[],status:'historic',economicGain:nullableSum(details.map(d=>d.economicGain)),taxable:null,exempt:null,gross:null,
  protectedEligible:'0',protectedGain:null,protectedGainAfterExemption:null,deemedGain:null,lossWithoutExemption:null};
 return {details,reasons,status:reasons.some(r=>r.status==='unsupported')?'unsupported':reasons.length?'incomplete':'supported',
  economicGain:nullableSum(details.map(d=>d.economicGain)),
  taxable:pick('taxable'),exempt:pick('exempt'),gross:complete?S(sum(details.map(d=>D(d.pre2018)+D(d.post2018)))):null,
  // Anrechenbar auf den Freibetrag ist der positive Saldo dieses Abgangs.
  protectedEligible:complete?S(max(0n,sum(details.map(d=>D(d.protectedPart))))):null,
  // Gewinn dieses Abgangs aus Alt-Anteilen; für den Ausweis zählen nur positive Abgänge, ohne
  // Saldierung mit Verlusten anderer Abgänge (BMF vom 16.05.2025, Rn. 30).
  protectedGain:pick('post2018',d=>d.regime==='fundPre2009'),
  protectedGainAfterExemption:pick('protectedPart',d=>d.regime==='fundPre2009'),
  deemedGain:pick('deemed',d=>d.regime==='fund2009'),
  accumulatedIncome:pick('oldIncome',d=>d.regime==='fund2009'||d.regime==='fundPre2009'),
  frozenGain:complete?S(sum(details.flatMap(d=>d.frozen||[]).map(f=>D(f.gain)))):null,
  // ETC mit Rohstoffanspruch: Gewinn insgesamt und der Teil innerhalb der Jahresfrist (§ 23 EStG).
  ...(security.kind==='commodity'?{privateGain:nullableSum(details.map(d=>d.privateGain??null)),privateTaxable:complete&&details.every(d=>d.privateGain!=null&&d.within!=null)?S(sum(details.filter(d=>d.within).map(d=>D(d.privateGain)))):null}:{}),
  lossWithoutExemption:pick('lossWithoutExemption'),segments};
}
