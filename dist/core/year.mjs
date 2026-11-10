import {D,S,mul,div,min,max,round,sum} from './decimal.mjs';
import {taxYearOf,KINDS,EXEMPTION,PROTECTED_ALLOWANCE,RULESET,FOREIGN_TAX_CAP,FIRST_TAX_YEAR,privateSalesLimit,churchMonths,isFund,taxOn} from './rules.mjs';
import {replay} from './ledger.mjs';
import {TAX_PARTS,roundingOnly,afterExemption,substituteBase,foreignShare,kindWarning,jointPartner} from './model.mjs';
import {fxReplay} from './fx.mjs';

const byKind=()=>Object.fromEntries(Object.keys(KINDS).filter(isFund).map(k=>[k,0n]));
const strings=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,S(v)]));
const de=d=>d.split('-').reverse().join('.');
// Art des Fonds zum 31.12.2017: vor einer Verschmelzung mit Satzwechsel die des alten Fonds.
const originKind=(d,kind)=>d.frozen?.[0]?.kind??kind;
// Gewinne aus Alt-Anteilen je Verkauf und Fondsart, nur positive Salden (BMF vom 16.05.2025, Rn. 30).
const protectedByKind=sale=>{const by=new Map();for(const g of sale.segments||[])if(g.regime==='fundPre2009'){const v=by.get(g.kind)||{post:0n,part:0n};v.post+=D(g.post);v.part+=D(g.part);by.set(g.kind,v);}return [...by].map(([k,v])=>[k,max(0n,v.post),max(0n,v.part)]);};
const eur=v=>new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(S(round(D(v)))));
export const SUBSTITUTE_HINT='Entspricht 30 % des Erlöses – die Bank kannte die Anschaffungskosten nicht und hat die Ersatzbemessungsgrundlage angesetzt (§ 43a Abs. 2 S. 7 EStG), etwa nach einem Übertrag. Den tatsächlichen Gewinn über die Steuererklärung ansetzen lassen.';
const PARTS=Object.keys(TAX_PARTS);
const CARRY_FIELDS=['stockLossCarry','otherLossCarry','externalAllowance'];

// Verlustverrechnung einer Person in der Veranlagung (BMF vom 14.05.2025, Rn. 118): 1. Aktiengewinne und -verluste
// des Jahres, Aktienverluste nur gegen Aktiengewinne; 2. übrige Erträge und Verluste des Jahres, Verluste auch gegen
// Aktiengewinne; 3. Aktienverlustvortrag nur gegen die danach verbleibenden Aktiengewinne; 4. sonstiger
// Verlustvortrag gegen alles Übrige. Erst danach der Sparer-Pauschbetrag (§ 20 Abs. 9 S. 4 EStG).
export function lossOffset(stocks,other,stockCarry,otherCarry){
 let stockPos=max(0n,stocks);const stockLossNow=max(0n,-stocks);
 const againstStocks=other<0n?min(-other,stockPos):0n;stockPos-=againstStocks;
 const otherNet=other+againstStocks;let otherPos=max(0n,otherNet);const otherLossNow=max(0n,-otherNet);
 const stockCarryUsed=min(stockCarry,stockPos);stockPos-=stockCarryUsed;
 // Der sonstige Vortrag mindert zuerst die übrigen Erträge; für die Höhe der Einkünfte ist das gleich.
 const otherCarryUsed=min(otherCarry,stockPos+otherPos),fromOther=min(otherCarryUsed,otherPos);otherPos-=fromOther;stockPos-=otherCarryUsed-fromOther;
 return {stocks,other,againstStocks,otherNet,stockCarryUsed,otherCarryUsed,stockPos,otherPos,positive:stockPos+otherPos,
  stockLoss:stockLossNow+stockCarry-stockCarryUsed,otherLoss:otherLossNow+otherCarry-otherCarryUsed};
}
const potsOf=(o,half)=>({stockPos:S(o.stockPos),otherPos:S(o.otherPos),positive:S(o.positive),stockLoss:S(o.stockLoss),otherLoss:S(o.otherLoss),half:S(half)});

// Zusammenveranlagung (§ 20 Abs. 6 S. 4 und Abs. 9 S. 3 EStG; BMF vom 14.05.2025, Rn. 274, 275): Jeder rechnet
// erst für sich nach Rn. 118 und zieht seine Hälfte des Sparer-Pauschbetrags ab, ein ungenutzter Teil geht auf den
// anderen über – auch wenn beide zusammen einen Verlust haben. Danach gleichen die verbleibenden Verluste des einen
// die Erträge des anderen aus: zuerst der Aktienverlust gegen Aktiengewinne, dann der sonstige Verlust (Rn. 273).
// Der Pauschbetrag mindert zuerst die übrigen Erträge, damit Aktiengewinne für Aktienverluste bleiben.
export function jointShares(a,b){
 const side=(me,them)=>{
  const transfer=max(0n,them.half-them.positive),allowance=min(me.positive,me.half+transfer),fromOther=min(allowance,me.otherPos);
  const restStock=me.stockPos-(allowance-fromOther),restOther=me.otherPos-fromOther;
  const stockReceived=min(them.stockLoss,restStock),otherReceived=min(them.otherLoss,restStock-stockReceived+restOther);
  return {transfer,allowance,restStock,restOther,stockReceived,otherReceived,taxable:restStock+restOther-stockReceived-otherReceived};
 };
 const x=side(a,b),y=side(b,a);
 return [{...x,stockLoss:a.stockLoss-y.stockReceived,otherLoss:a.otherLoss-y.otherReceived},{...y,stockLoss:b.stockLoss-x.stockReceived,otherLoss:b.otherLoss-x.otherReceived}];
}

// Vorschlag für den Rest-Freibetrag bestandsgeschützter Alt-Anteile zum
// Jahresbeginn: Startwert (bestätigt oder 100.000 €) minus der in Depotklar
// berechneten Inanspruchnahme der Vorjahre. Nur ein Vorschlag – maßgeblich ist
// die gesonderte Feststellung des Finanzamts (§ 56 Abs. 6 InvStG).
export function protectedProposal(s,personId,year,{cache=new Map()}={}){
 let remaining=D(PROTECTED_ALLOWANCE);
 for(let y=2018;y<year;y++){
  const confirmed=s.years[personId]?.[y]?.protectedRemaining;if(confirmed!=null)remaining=D(confirmed);
  const eligible=yearReport(s,personId,y,{cache}).protectedEligible;
  // Unbekannter Verkaufsgewinn eines Vorjahres: kein Vorschlag statt einer falschen Zahl.
  if(eligible==null)return null;
  remaining-=min(remaining,D(eligible));
 }
 return S(remaining);
}

// Vorabpauschale aus einem Depot ohne deutschen Steuerabzug: Sie mindert einen späteren
// Veräußerungsgewinn nur, wenn sie in der Erklärung des Zuflussjahres angegeben wurde oder
// die Kapitalerträge dieses Jahres den Sparer-Pauschbetrag nicht überschritten haben
// (§ 19 Abs. 1 InvStG; Anleitung zur Anlage KAP-INV, angesetzte Vorabpauschalen).
function vapDeclared(s,personId,year,cache){
 if(s.years[personId]?.[year]?.foreignDeclared===true)return true;
 const r=yearReport(s,personId,year,{cache});
 return r.status==='supported'&&D(r.taxable)===0n;
}

// Persönliche Jahresrechnung (Einzelveranlagung, Privatvermögen) für die in
// Depotklar erfassten Kapitalerträge. Ohne bestätigte Jahresdaten oder bei
// offenen Losangaben kein Steuerbetrag.
// solo: ohne Zusammenveranlagung – die eigenen Ergebnisse, die der Ehegatte für seine Rechnung braucht.
// bare: nur die Erträge – für die Verrechnung bei derselben Bank in der Vorstufe solo.
export function yearReport(s,personId,year,{replayResult=null,cache=null,solo=false,bare=false}={}){
 const key=`${personId}|${year}${solo?'|solo':''}${bare?'|bare':''}`;
 if(cache?.has(key))return cache.get(key);
 const result=computeYear(s,personId,year,replayResult,cache||new Map(),solo,bare);
 cache?.set(key,result);
 return result;
}

function computeYear(s,personId,year,replayResult,cache,solo=false,bare=false){
 const person=s.persons.find(p=>p.id===personId);if(!person)throw Error('Person fehlt.');
 const rule=taxYearOf(s,year),params=s.years[personId]?.[year]||null,reasons=[];
 const reason=(status,text,ref=null)=>{if(!reasons.some(r=>r.text===text))reasons.push({status,text,ref});};
 // Vor 2018 außerhalb des Modells; Folgejahre rechnen nach geltendem Recht weiter.
 if(!rule)reason('unsupported',`Steuerjahr ${year} liegt außerhalb des Modells (ab ${FIRST_TAX_YEAR}).`);
 const linked=jointPartner(s,personId,year),partnerId=solo||bare?null:linked;
 if(params?.joint&&!linked)reason('incomplete','Zusammenveranlagung: Ehegatten in den Jahresdaten wählen.');
 if(params?.nonResident)reason('unsupported','Nur unbeschränkt Steuerpflichtige im Privatvermögen.');
 const r=replayResult||replay(s,{until:`${year}-12-31`});
 const mine=r.moves.filter(m=>m.personId===personId&&m.date.startsWith(String(year)));
 const partnerSolo=partnerId?yearReport(s,partnerId,year,{replayResult:r,cache,solo:true}):null,partnerName=partnerId?s.persons.find(p=>p.id===partnerId)?.name||'Ehegatte':null;
 const sales=mine.filter(m=>m.type==='sell'),distributions=mine.filter(m=>m.type==='distribution'),vaps=mine.filter(m=>m.type==='vap'),interests=mine.filter(m=>m.type==='interest'),others=mine.filter(m=>m.type==='otherIncome');
 const security=id=>s.securities.find(x=>x.id===id),name=id=>s.persons.find(p=>p.id===id)?.name||'Person';
 // ETCs mit Rohstoffanspruch sind kein Kapitalertrag: Sie stehen bei den privaten Veräußerungsgeschäften.
 const capitalSales=sales.filter(m=>security(m.securityId).kind!=='commodity'),etcSales=sales.filter(m=>security(m.securityId).kind==='commodity');
 // lasting: Hinweise, die auch ohne Erträge des Jahres auf der Steuerseite stehen (Verschmelzung).
 const hints=[],hint=text=>{if(!hints.includes(text))hints.push(text);},lasting=[];
 if(rule?.confirmed)hint(`Sparer-Pauschbetrag ${year}: ${rule.allowance} €, selbst unter „Kurse“ eingetragen.`);
 if(rule?.continued)hint(`Sparer-Pauschbetrag ${year}: ${rule.allowance} € nach geltendem Recht (§ 20 Abs. 9 EStG). Eine Gesetzesänderung lässt sich unter „Kurse“ eintragen.`);
 // Bank und Auslandskennzeichen: vom Depot, bei eigenständigen Währungskonten vom Konto.
 const depotOf=id=>s.depots.find(d=>d.id===id),abroad=m=>m.depotId?Boolean(depotOf(m.depotId)?.abroad):Boolean(m.abroad);
 // Währungskonten: verzinst als Kapitalertrag in den allgemeinen Topf, unverzinst als
 // privates Veräußerungsgeschäft (Anlage SO) mit eigener Freigrenze und Verrechnung.
 const fxMoves=fxReplay(s,{until:`${year}-12-31`}).moves.filter(m=>m.personId===personId&&m.realized&&m.date.startsWith(String(year)));
 const fxCapital=fxMoves.filter(m=>m.regime==='capital'),fxPrivate=fxMoves.filter(m=>m.regime==='private');
 for(const m of fxCapital)if(m.gain==null)reason('incomplete',`${m.label} vom ${de(m.date)}: Währungsgewinn nicht ermittelt – EUR-Werte von Zu- und Abgang erfassen.`,m.eventId);
 if(fxPrivate.some(m=>m.parts.some(p=>p.within&&p.income)))hint('Ein innerhalb eines Jahres veräußerter Währungsbetrag stammt aus einer Zins- oder Dividendengutschrift. Depotklar behandelt sie als Anschaffung zum Wert am Zufluss; ob das bei § 23 EStG zutrifft, mit dem Berater klären.');
 const etcPrivate=etcSales.map(m=>({date:m.date,securityId:m.securityId,name:security(m.securityId).name,label:'Verkauf',amount:m.quantity,currency:'Stück',proceeds:m.proceeds,cost:m.tax==null?null:S(-D(m.tax)),gain:m.sale.privateGain??null,taxable:m.sale.privateTaxable??null,
  parts:m.sale.details.map(d=>({amount:d.quantity,acquired:d.acquired,income:false,proceeds:d.proceeds,cost:d.cost,gain:d.privateGain??null,within:d.within??null}))}));
 const privateMoves=[...fxPrivate,...etcPrivate].sort((a,b)=>a.date.localeCompare(b.date));
 const privateKnown=privateMoves.every(m=>m.taxable!=null),privateTotal=privateKnown?sum(privateMoves.map(m=>D(m.taxable))):null,limit=privateSalesLimit(year);
 const privateSales=privateMoves.length?{moves:privateMoves,total:privateTotal==null?null:S(privateTotal),limit,status:privateKnown?'supported':'incomplete',
  // Freigrenze: unter der Grenze steuerfrei, ab der Grenze voll steuerpflichtig. Verluste nur mit Gewinnen aus § 23.
  taxable:privateTotal==null?null:privateTotal<=0n?S(privateTotal):privateTotal<D(limit)?'0':S(privateTotal),
  exempt:privateTotal!=null&&privateTotal>0n&&privateTotal<D(limit)}:null;
 if(privateSales)hint(`Private Veräußerungsgeschäfte: Die Freigrenze von ${limit} € gilt für alle privaten Veräußerungsgeschäfte des Jahres zusammen; Depotklar kennt nur Währungskonten und ETCs mit Rohstoffanspruch. Besteuert wird nach dem persönlichen Steuersatz, nicht mit der Abgeltungsteuer.`);
 for(const m of sales)for(const x of m.sale.reasons)reason(x.status,`${security(m.securityId).name}, Verkauf ${m.date}: ${x.reason}`,m.eventId);
 // Vorabpauschalen aus Depots ohne deutschen Steuerabzug mindern den Gewinn nur, wenn sie erklärt wurden.
 for(const m of sales)for(const d of m.sale.details||[])for(const v of d.vapLog||[]){
  if(!v.abroad||v.year==null||D(v.amount)===0n||v.year+1>=year)continue;
  if(!vapDeclared(s,v.personId,v.year+1,cache))reason('incomplete',`${security(m.securityId).name}, Verkauf vom ${de(m.date)}: Die Vorabpauschale ${v.year} aus einem Depot ohne deutschen Steuerabzug mindert den Gewinn nur, wenn sie in der Steuererklärung ${v.year+1} angegeben wurde. In den Jahresdaten ${v.year+1}${v.personId!==personId?` von ${name(v.personId)}`:''} bestätigen.`,m.eventId);
 }
 for(const x of r.issues.filter(x=>(x.kind==='mergerOpen'||x.kind==='mergerAbroad')&&depotOf(x.depotId)?.personId===personId&&(x.kind==='mergerOpen'||String(x.date).startsWith(String(year))))){hint(x.reason);lasting.push(x.reason);}
 // Bankwerte der Vorabpauschale ohne Bestand oder doppelt: der Ertrag des Jahres wäre unvollständig.
 for(const x of r.issues.filter(x=>(x.kind==='vapUnused'||x.kind==='vapDuplicate')&&String(x.date).startsWith(String(year))&&depotOf(x.depotId)?.personId===personId))reason('incomplete',x.reason,x.eventId);
 // Nur wo es einen Unterschied macht: bei Fonds ohne Teilfreistellung (sonstige Fonds) ändert das Urteil nichts.
 for(const m of sales.filter(m=>(m.sale.segments||[]).some(g=>D(g.unexempted)>0n&&D(EXEMPTION[g.kind])>0n)))hint(`${security(m.securityId).name}, Verkauf vom ${de(m.date)}: ${S(round(D(m.sale.lossWithoutExemption)))} € Verlust ohne Teilfreistellung angesetzt, weil der Kurs 31.12.2017 über den ursprünglichen Anschaffungskosten lag (BFH vom 25.11.2025, VIII R 22/23). Banken rechnen hier teils noch mit Teilfreistellung; die Differenz wird über die Veranlagung erstattet, bei bestandskräftigen Bescheiden nicht mehr.`);
 for(const m of sales)for(const d of m.sale.details||[])if(d.bfhOpen!==undefined)hint(`${security(m.securityId).name}, Verkauf vom ${de(m.date)}: Verlust über eine Verschmelzung mit anderem Teilfreistellungssatz hinweg. Depotklar rechnet ihn nach der Verschmelzung mit Teilfreistellung. Ob das BFH-Urteil vom 25.11.2025 (VIII R 22/23) die Teilfreistellung auch hier begrenzt, ist nicht entschieden${d.bfhOpen==null?' – ohne ursprünglichen Anschaffungswert nicht abschätzbar':`; betroffen wären bis zu ${eur(d.bfhOpen)} € des Verlusts`}. Mit dem Berater klären.`);
 for(const m of vaps)if(m.income==null)reason('incomplete',m.noRate?`${security(m.securityId).name}: Vorabpauschale ${m.year} offen – Basiszins ${m.year} unter „Kurse“ eintragen oder den Bankwert erfassen.`:`${security(m.securityId).name}: Vorabpauschale ${m.year} fehlt (Jahreskurse oder Bankwert).`,m.eventId);
 // Ausländische Quellensteuer: je Ertrag höchstens 25 % des steuerpflichtigen Ertrags
 // (§ 32d Abs. 5 S. 1 EStG), bei Fondsausschüttungen nach Teilfreistellung (BMF vom
 // 14.05.2025, Rz. 148). Erfasst wird die anrechenbare Steuer laut Abrechnung.
 const foreign=distributions.filter(m=>m.income.foreignTax!=null&&D(m.income.foreignTax)>0n);
 const capOf=m=>mul(D(m.income.taxable),D(FOREIGN_TAX_CAP)),creditOf=m=>min(D(m.income.foreignTax),capOf(m));
 const creditable=sum(foreign.map(creditOf));
 for(const m of foreign.filter(m=>D(m.income.foreignTax)>capOf(m)))hint(`${security(m.securityId).name}: Quellensteuer vom ${de(m.date)} über 25 % des steuerpflichtigen Ertrags${security(m.securityId).kind==='stock'?'':' nach Teilfreistellung'}; angerechnet wird höchstens dieser Anteil. Den Rest erstattet nur der Quellenstaat.`);
 // Häufiger Fehler: der volle Abzug statt des anrechenbaren Teils (BZSt-Übersicht: meist höchstens 15 %).
 for(const m of foreign){const f=foreignShare(m.income.foreignTax,m.income.gross);if(f?.aboveTreaty)hint(`${security(m.securityId).name}: Quellensteuer vom ${de(m.date)} beträgt ${f.percent.replace('.',',')} % des Bruttobetrags. Nach den meisten Doppelbesteuerungsabkommen sind höchstens 15 % anrechenbar (Schweiz: 35 % einbehalten, 15 % anrechenbar); den Rest erstattet nur der Quellenstaat auf Antrag. Einzutragen ist nur der anrechenbare Teil laut Abrechnung.`);}

 // Kontrolle je Abrechnung: Gewinn vor Teilfreistellung laut Verkaufsabrechnung und Vorabpauschale
 // laut Bank gegen die eigene Rechnung. Verglichen werden Bemessungsgrundlagen, nicht der Steuerabzug –
 // den verrechnet die Bank über das Jahr mit Freistellungsauftrag und Verlusttöpfen.
 const checks=[
  ...capitalSales.filter(m=>m.gainBank!=null).map(m=>({kind:'sale',eventId:m.eventId,date:m.date,depotId:m.depotId,securityId:m.securityId,bank:m.gainBank,model:m.sale.gross,swapped:afterExemption(m.gainBank,m.sale),substitute:substituteBase(m.gainBank,m.sale,m.proceeds,m.fees)})),
  ...vaps.filter(m=>m.source==='bank'&&m.computed!=null).map(m=>({kind:'vap',eventId:m.eventId,date:m.date,year:m.year,depotId:m.depotId,securityId:m.securityId,bank:m.tax,model:m.computed,from:m.computedFrom}))]
  .map(c=>{const difference=c.model==null?null:S(D(c.bank)-D(c.model)),rounding=difference!=null&&D(difference)!==0n&&roundingOnly(c.bank,c.model);
   return {...c,difference,rounding,hint:rounding?'Rundung':c.swapped?'Entspricht dem Gewinn nach Teilfreistellung – den Wert vor Teilfreistellung eintragen.':c.substitute?SUBSTITUTE_HINT:null};})
  .sort((a,b)=>a.date.localeCompare(b.date));
 // Zuordnung: Aktienveräußerungen in den Aktientopf, alles andere in den allgemeinen Topf.
 const items=[
  ...capitalSales.map(m=>({kind:'sale',ref:m,stock:security(m.securityId).kind==='stock',taxable:m.sale.taxable,gross:m.sale.gross,exempt:m.sale.exempt,eligible:m.sale.protectedEligible})),
  ...distributions.map(m=>({kind:'distribution',ref:m,stock:false,taxable:m.income.taxable,gross:m.income.gross,exempt:m.income.exempt,eligible:'0'})),
  ...vaps.filter(m=>m.income).map(m=>({kind:'vap',ref:m,stock:false,taxable:m.income.taxable,gross:m.income.gross,exempt:m.income.exempt,eligible:'0'})),
  ...interests.map(m=>({kind:'interest',ref:m,stock:false,taxable:m.income.taxable,gross:m.income.gross,exempt:'0',eligible:'0'})),
  ...others.map(m=>({kind:'other',ref:m,stock:false,taxable:m.income.taxable,gross:m.income.gross,exempt:'0',eligible:'0'})),
  ...fxCapital.map(m=>({kind:'fx',ref:m,stock:false,taxable:m.gain,gross:m.gain,exempt:'0',eligible:'0'}))];
 if(bare)return {items};
 const eligibleTotal=items.every(i=>i.eligible!=null)?sum(items.map(i=>D(i.eligible))):null;
 // Art passt nicht zum Namen (ETF als Aktie, Anleihe, Zertifikat, ETC): bei Erträgen des Jahres und im Bestand.
 const held=[...r.positions.entries()].filter(([k,lots])=>depotOf(k.split('|')[0])?.personId===personId&&lots.some(l=>D(l.quantity)>0n)).map(([k])=>k.split('|')[1]);
 for(const id of new Set([...items.map(i=>i.ref.securityId),...held].filter(Boolean))){const x=security(id),w=x&&kindWarning(x);if(w)hint(`${x.name}: ${w}`);}

 // Banken: deutsche je Name; Depots bei ausländischen Banken haben keinen deutschen Steuerabzug.
 const bankOf=m=>{const d=m.depotId?depotOf(m.depotId):null,bank=d?d.bank:m.bank;return `${abroad(m)?'abroad:':''}${bank?.trim()||'Ohne Bank'}`;};
 const bankName=k=>k.replace(/^abroad:/,'');
 // Verluste, die eine deutsche Bank im Jahr nicht selbst verrechnen konnte, führt sie fort.
 // In die persönliche Veranlagung gelangen sie nur mit Verlustbescheinigung
 // (§ 43a Abs. 3 S. 4 EStG). Verluste ausländischer Depots stehen direkt in der Erklärung.
 // Zusammen veranlagt: Mit gemeinsamem Freistellungsauftrag verrechnet dieselbe Bank am Jahresende die verbleibenden
 // Verluste über beide Ehegatten, erst nach dem Freistellungsauftrag (BMF vom 14.05.2025, Rn. 266, 273, 275). Wie viel
 // übrig bleibt, hängt vom Freistellungsauftrag bei dieser Bank ab – Depotklar prüft die Bescheinigung gegen die Spanne.
 const partnerItems=!linked||bare?[]:partnerSolo?partnerSolo.items:yearReport(s,linked,year,{replayResult:r,cache,bare:true}).items;
 const endState=list=>{const st=sum(list.filter(i=>i.stock).map(i=>D(i.taxable))),g=sum(list.filter(i=>!i.stock).map(i=>D(i.taxable)));
  return {stockLoss:max(0n,-st),stockGain:max(0n,max(0n,st)-max(0n,-g)),otherLoss:max(0n,-g-max(0n,st)),otherGain:max(0n,g)};};
 const banks=bare?[]:[...new Set(items.map(i=>bankOf(i.ref)))].map(key=>{
  const own=items.filter(i=>bankOf(i.ref)===key),known=own.every(i=>i.taxable!=null),isAbroad=key.startsWith('abroad:');
  if(!known)return {bank:bankName(key),abroad:isAbroad,stockLoss:null,otherLoss:null};
  const e=endState(own),theirs=isAbroad?[]:partnerItems.filter(i=>i.taxable!=null&&bankOf(i.ref)===key);
  if(!theirs.length||(e.stockLoss===0n&&e.otherLoss===0n))return {bank:bankName(key),abroad:isAbroad,stockLoss:S(e.stockLoss),otherLoss:S(e.otherLoss)};
  // Spanne: ohne Freistellungsauftrag bei der Bank bleibt am wenigsten übrig, mit dem gemeinsamen Höchstbetrag am meisten.
  const t=endState(theirs),most=mul(D(rule?.allowance??'0'),D('2')),left=max(0n,t.stockGain+t.otherGain-most);
  const stockMin=max(0n,e.stockLoss-t.stockGain),otherMin=max(0n,e.otherLoss-(t.stockGain-min(e.stockLoss,t.stockGain)+t.otherGain));
  const stockMax=max(0n,e.stockLoss-max(0n,t.stockGain-most)),otherMax=max(0n,e.otherLoss-max(0n,left-min(e.stockLoss,min(t.stockGain,left))));
  hint(`${bankName(key)}: Depotklar verrechnet die Verluste bei dieser Bank über beide Ehegatten. Das setzt einen gemeinsamen Freistellungsauftrag voraus (BMF vom 14.05.2025, Rn. 266); sonst bleibt der Verlust bei der Bank und braucht eine Verlustbescheinigung.`);
  return {bank:bankName(key),abroad:isAbroad,stockLoss:S(stockMax),otherLoss:S(otherMax),range:{stockLoss:[S(stockMin),S(stockMax)],otherLoss:[S(otherMin),S(otherMax)]}};
 });
 const span=([a,z])=>a===z?`${a} €`:`${a} € bis ${z} €`;
 for(const b of banks){
  if(b.abroad||b.stockLoss==null||(D(b.stockLoss)===0n&&D(b.otherLoss)===0n))continue;
  const c=s.certificates.find(c=>c.personId===personId&&c.year===year&&c.bank?.trim()===b.bank);
  if(b.range){
   if(!c?.lossCertificate)reason('incomplete',`${b.bank}: Nach der Verrechnung über beide Ehegatten bleiben je nach gemeinsamem Freistellungsauftrag ${span(b.range.stockLoss)} (Aktien) und ${span(b.range.otherLoss)} (sonstige) Verlust. Die Verlustbescheinigung erfassen; bleibt laut Bank nichts übrig, 0 € eintragen.`);
   else for(const [k,label,range] of [['certifiedStockLoss','Aktien',b.range.stockLoss],['certifiedOtherLoss','sonstige',b.range.otherLoss]])
    if(c[k]==null||D(c[k])<D(range[0])||D(c[k])>D(range[1]))reason('incomplete',`${b.bank}: Verlustbescheinigung (${label}) ${c[k]??'ohne Betrag'} € liegt außerhalb der möglichen ${span(range)}.`);
   continue;
  }
  if(!c?.lossCertificate)reason('incomplete',`${b.bank}: Verluste von ${b.stockLoss} € (Aktien) und ${b.otherLoss} € (sonstige) bleiben bei der Bank. Für die Verrechnung in der Veranlagung die Verlustbescheinigung erfassen.`);
  else for(const [k,label,model] of [['certifiedStockLoss','Aktien',b.stockLoss],['certifiedOtherLoss','sonstige',b.otherLoss]])
   if(c[k]==null||D(c[k])!==D(model))reason('incomplete',`${b.bank}: Verlustbescheinigung (${label}) ${c[k]??'ohne Betrag'} € weicht vom berechneten Rest ${model} € ab.`);
 }

 // Abgleich je Bank: Jahressteuerbescheinigung vor Einzelabrechnungen. Ausländische Banken
 // behalten keine deutsche Steuer ein. Fehlt bei einer Bank ein Wert, bleibt der Abgleich offen.
 const certificates=s.certificates.filter(c=>c.personId===personId&&c.year===year);
 const withholding=[...new Set([...items.map(i=>bankOf(i.ref)),...certificates.map(c=>c.bank.trim())])].map(key=>{
  if(key.startsWith('abroad:'))return {bank:bankName(key),abroad:true,source:'abroad',amount:'0',parts:Object.fromEntries(PARTS.map(k=>[k,'0'])),missing:null};
  const c=certificates.find(c=>c.bank.trim()===key);
  if(c){const complete=PARTS.every(k=>c[k]!=null);return {bank:key,abroad:false,source:'certificate',amount:complete?S(sum(PARTS.map(k=>D(c[k])))):null,parts:complete?Object.fromEntries(PARTS.map(k=>[k,S(D(c[k]))])):null,missing:complete?null:'In der Bescheinigung fehlen Kapitalertragsteuer, Solidaritätszuschlag oder Kirchensteuer.'};}
  const own=items.filter(i=>bankOf(i.ref)===key);
  const listed=own.filter(i=>i.kind==='sale'||i.kind==='distribution'||i.kind==='interest'||i.kind==='other'||i.kind==='vap'&&i.ref.withheld!=null),direct=i=>i.kind==='sale'||i.kind==='vap';
  const values=listed.map(i=>direct(i)?i.ref.withheld:i.ref.income.withheld),taxes=listed.map(i=>direct(i)?i.ref.taxes:i.ref.income.taxes);
  // Steuer auf berechnete Vorabpauschalen und auf Währungsgewinne steht in keiner erfassten Abrechnung.
  const hidden=own.some(i=>(i.kind==='fx'||i.kind==='vap'&&i.ref.withheld==null)&&i.taxable!=null&&D(i.taxable)!==0n),known=!hidden&&values.every(v=>v!=null);
  // Je Steuerart nur, wenn jede Abrechnung der Bank einzeln erfasst ist.
  const split=known&&taxes.every(t=>t&&PARTS.every(k=>t[k]!=null));
  return {bank:key,abroad:false,source:'events',amount:known?S(sum(values.map(D))):null,parts:split?Object.fromEntries(PARTS.map(k=>[k,S(sum(taxes.map(t=>D(t[k]))))])):null,
   missing:known?null:hidden?'Die Steuer auf Vorabpauschalen oder Währungsgewinne fehlt: Jahressteuerbescheinigung erfassen oder bei „Vorabpauschale laut Bank“ den Steuerabzug eintragen.':'Nicht bei jeder Abrechnung ist der Steuereinbehalt erfasst.'};
 });
 const bankWithheld=withholding.length&&withholding.every(w=>w.amount!=null)?S(sum(withholding.map(w=>D(w.amount)))):null;
 const bankTaxes=withholding.length&&withholding.every(w=>w.parts)?Object.fromEntries(PARTS.map(k=>[k,S(sum(withholding.map(w=>D(w.parts[k]))))])):null;

 // Werte für die Erklärung. Deutsche Depots: nur, was die Bank nicht berücksichtigt (Gewinne
 // bestandsgeschützter Alt-Anteile für den Freibetrag). Depots ohne deutschen Steuerabzug:
 // Anlage KAP (ausländische Kapitalerträge) und Anlage KAP-INV je Fondsart, vor Teilfreistellung.
 // Gewinne aus Alt-Anteilen je Verkauf, nur positive, ohne Saldierung mit Verlusten anderer Verkäufe
 // (BMF vom 16.05.2025, Rn. 30). Akkumulierte ausschüttungsgleiche Erträge: nachgeholter Steuerabzug,
 // in der Erklärung abzuziehen (Rn. 28). Verlust ohne Teilfreistellung nach BFH vom 25.11.2025.
 const kap={protectedGain:byKind(),protectedGainAfterExemption:byKind(),deemedGain:byKind(),accumulated:byKind(),lossWithoutExemption:byKind()};
 const inv={distributions:byKind(),vaps:byKind(),gains:byKind(),protectedGains:byKind(),deemed:byKind(),oldIncome:byKind(),lossWithoutExemption:byKind()};
 const accumulatedHint=(m,abroadDepot)=>{const a=D(m.sale.accumulatedIncome??'0');if(a<=0n)return;hint(`${security(m.securityId).name}, Verkauf vom ${de(m.date)}: ${eur(a)} € akkumulierte ausschüttungsgleiche Erträge (altes Recht) gehören nicht zu den Einkünften des Verkaufsjahres und sind in der Steuer laut Modell nicht enthalten.${abroadDepot?' Sie waren in den Jahren ihres Zuflusses bis 2017 zu erklären; wurde das versäumt, sind diese Jahre zu berichtigen.':' Die Bank holt auf sie den Steuerabzug nach (§ 56 Abs. 3 S. 6 InvStG); in der Erklärung werden sie von den bescheinigten Kapitalerträgen abgezogen (BMF vom 16.05.2025, Rn. 28). Erstattet wird dieser Abzug nur unter den Voraussetzungen des BMF-Schreibens vom 17.12.2012 – dafür kann ein Nachweis verlangt werden, dass die Erträge in den Jahren bis 2017 versteuert wurden.'}`);};
 const kapAbroad={income:0n,stockGains:0n,otherLosses:0n,stockLosses:0n,foreignTax:0n};
 let kapKnown=true,abroadKnown=true;const hasAbroad=items.some(i=>abroad(i.ref));
 for(const i of items){
  const m=i.ref,x=m.securityId?security(m.securityId):null,fund=Boolean(x&&isFund(x.kind));
  if(!abroad(m)){
   if(i.kind!=='sale'||!fund)continue;
   if(m.sale.status!=='supported'&&m.sale.status!=='unsupported'){kapKnown=false;continue;}
   if(m.sale.status!=='supported')continue;
   for(const [k,gain,after] of protectedByKind(m.sale)){kap.protectedGain[k]+=gain;kap.protectedGainAfterExemption[k]+=after;}
   for(const d of m.sale.details){if(d.regime==='fund2009')kap.deemedGain[originKind(d,x.kind)]+=D(d.deemed);if(d.regime==='fund2009'||d.regime==='fundPre2009')kap.accumulated[originKind(d,x.kind)]+=D(d.oldIncome??'0');}
   for(const g of m.sale.segments)kap.lossWithoutExemption[g.kind]+=D(g.unexempted);accumulatedHint(m,false);
   continue;
  }
  if(i.kind==='distribution'){if(fund)inv.distributions[x.kind]+=D(m.income.gross);else{kapAbroad.income+=D(m.income.gross);if(D(m.income.gross)<0n)kapAbroad.otherLosses+=-D(m.income.gross);}if(m.income.foreignTax!=null&&D(m.income.foreignTax)>0n)kapAbroad.foreignTax+=creditOf(m);}
  else if(i.kind==='vap')inv.vaps[x.kind]+=D(m.income.gross);
  else if(i.kind==='interest'||i.kind==='other'){const g=D(m.income.gross);kapAbroad.income+=g;if(g<0n)kapAbroad.otherLosses+=-g;}
  else if(i.kind==='fx'){if(i.taxable==null){abroadKnown=false;continue;}const g=D(i.taxable);kapAbroad.income+=g;if(g<0n)kapAbroad.otherLosses+=-g;}
  else if(i.kind==='sale'){
   if(m.sale.status!=='supported'){abroadKnown=false;continue;}
   if(fund){
    // Der aufgeschobene Gewinn aus einer Verschmelzung gehört zur Fondsart des alten Fonds.
    for(const g of m.sale.segments){inv.gains[g.kind]+=D(g.post);inv.lossWithoutExemption[g.kind]+=D(g.unexempted);}
    for(const d of m.sale.details){
     if(d.regime==='fund2009')inv.deemed[originKind(d,x.kind)]+=D(d.deemed);
     if(d.regime==='fund2009'||d.regime==='fundPre2009')inv.oldIncome[originKind(d,x.kind)]+=D(d.oldIncome);
    }
    for(const [k,gain] of protectedByKind(m.sale))inv.protectedGains[k]+=gain;accumulatedHint(m,true);
   }else{const g=D(m.sale.taxable);kapAbroad.income+=g;if(x.kind!=='stock'){if(g<0n)kapAbroad.otherLosses+=-g;}else if(g>0n)kapAbroad.stockGains+=g;else kapAbroad.stockLosses+=-g;}
  }
 }

 const base={personId,year,ruleset:RULESET,rule,params,jointWith:linked,jointName:linked?s.persons.find(p=>p.id===linked)?.name||'Ehegatte':null,items,sales,distributions,vaps,interests,banks,hints,privateSales,
  kap:{known:kapKnown,...Object.fromEntries(Object.entries(kap).map(([k,v])=>[k,kapKnown?strings(v):null]))},
  abroad:hasAbroad?{known:abroadKnown,kap:abroadKnown?strings(kapAbroad):null,inv:abroadKnown?Object.fromEntries(Object.entries(inv).map(([k,v])=>[k,strings(v)])):null}:null,
  checks,bankWithheld,bankTaxes,withholding,bankSource:certificates.length&&withholding.every(w=>w.source!=='events')?'certificate':withholding.some(w=>w.source==='events')?'events':null,certificates,
  churchMonths:churchMonths(params),
  protectedEligible:eligibleTotal==null?null:S(eligibleTotal)};

 const empty={status:null,reasons,gross:null,exempt:null,stockResult:null,otherResult:null,afterLoss:null,allowanceUsed:null,taxable:null,
  capitalTax:null,solidarity:null,churchTax:null,total:null,foreignTax:null,protectedStart:null,protectedUsed:null,protectedRemaining:null,
  carry:{stockLoss:null,otherLoss:null,protectedRemaining:null},difference:null,taxDifference:null};

 // Ohne erfasste Erträge gibt es nichts zu berechnen: kein Steuerbetrag (auch keine Null) und keine Aufforderung,
 // Jahresdaten zu bestätigen. Zusammen veranlagt zählen Vorträge und Pauschbetrag aber im gemeinsamen Ausgleich.
 if(partnerSolo&&(partnerSolo.status==='incomplete'||partnerSolo.status==='unsupported'))reason('incomplete',`Zusammenveranlagung: Die Jahresrechnung von ${partnerName} ist noch offen – ${partnerSolo.reasons[0]?.text||'Angaben fehlen'}`);
 if(partnerSolo?.status==='none'&&!partnerSolo.pots)reason('incomplete',`Zusammenveranlagung: Jahresdaten ${year} von ${partnerName} bestätigen – Verlustvorträge und anderweitig genutzter Sparer-Pauschbetrag zählen im gemeinsamen Ausgleich, auch ohne eigene Erträge in Depotklar.`);
 if(!items.length&&!reasons.length&&!partnerId){
  // Für den Ehegatten: Vorträge und eigene Hälfte des Pauschbetrags, wenn die Jahresdaten bestätigt sind.
  const pots=rule&&params&&CARRY_FIELDS.every(k=>params[k]!=null)?potsOf(lossOffset(0n,0n,D(params.stockLossCarry),D(params.otherLossCarry)),max(0n,D(rule.allowance)-D(params.externalAllowance))):null;
  return {...base,...empty,status:'none',reasons:[],hints:privateSales?hints:hints.filter(h=>lasting.includes(h)),pots,creditable:'0'};
 }
 if(!params)reason('incomplete',`Jahresdaten ${year} bestätigen: Kirchensteuer, Verlustvorträge zum 01.01. und anderweitig genutzter Sparer-Pauschbetrag.`);
 else{
  if(params.churchRate==null)reason('incomplete','Kirchensteuersatz fehlt.');
  for(const [k,label] of [['stockLossCarry','Aktienverlustvortrag zum 01.01.'],['otherLossCarry','Sonstiger Verlustvortrag zum 01.01.'],['externalAllowance','Anderweitig genutzter Sparer-Pauschbetrag']])if(params[k]==null)reason('incomplete',`${label} fehlt.`);
  if(eligibleTotal!=null&&eligibleTotal>0n&&params.protectedRemaining==null)reason('incomplete','Rest-Freibetrag für bestandsgeschützte Alt-Anteile zum 01.01. bestätigen.');
  if(rule&&params.externalAllowance!=null&&D(params.externalAllowance)>D(rule.allowance))reason('incomplete',`Anderweitig genutzter Sparer-Pauschbetrag übersteigt ${rule.allowance} €.`);
 }
 if(items.some(i=>i.taxable==null))reason('incomplete','Mindestens ein Ertrag ist nicht ermittelt.');
 const status=reasons.some(r=>r.status==='unsupported')?'unsupported':reasons.length?'incomplete':'supported';
 if(status!=='supported')return {...base,...empty,status};

 // Freibetrag nach Teilfreistellung, vor Verlustverrechnung; Verluste stellen ihn nicht wieder her.
 let remaining=params.protectedRemaining!=null?D(params.protectedRemaining):null,used=0n;
 const taxed=items.map(i=>{
  const eligible=D(i.eligible||'0'),offset=remaining==null?0n:min(remaining,eligible);
  if(remaining!=null)remaining-=offset;used+=offset;return {...i,allowance:S(offset),taxableAfter:S(D(i.taxable)-offset)};
 });
 const stocksNow=sum(taxed.filter(i=>i.stock).map(i=>D(i.taxableAfter))),otherNow=sum(taxed.filter(i=>!i.stock).map(i=>D(i.taxableAfter)));
 const own=lossOffset(stocksNow,otherNow,D(params.stockLossCarry),D(params.otherLossCarry));
 // Sparer-Pauschbetrag der eigenen Hälfte; einzeln veranlagt ist das der ganze Betrag.
 const half=max(0n,D(rule.allowance)-D(params.externalAllowance)),after=own.positive;
 let allowance=min(after,half),taxable=after-allowance,carryStock=own.stockLoss,carryOther=own.otherLoss,joint=null;
 if(partnerId){
  const theirs=partnerSolo.pots,[me,them]=jointShares({...own,half},Object.fromEntries(Object.entries(theirs).map(([k,v])=>[k,D(v)])));
  ({allowance,taxable,stockLoss:carryStock,otherLoss:carryOther}=me);
  joint={partnerId,partnerName,half:S(half),theirHalf:theirs.half,transfer:S(me.transfer),restStock:S(me.restStock),restOther:S(me.restOther),stockReceived:S(me.stockReceived),otherReceived:S(me.otherReceived),
   theirPositive:theirs.positive,theirStockLoss:theirs.stockLoss,theirOtherLoss:theirs.otherLoss,theirRestStock:S(them.restStock),theirRestOther:S(them.restOther),stockGiven:S(them.stockReceived),otherGiven:S(them.otherReceived),theirTaxable:S(them.taxable)};
 }
 // § 32d Abs. 1 S. 4 EStG: e/(4+k); Solidaritätszuschlag 5,5 % ohne Centbruchteile.
 // Angerechnet wird höchstens, was die deutsche Steuer auf null bringt; der Rest verfällt. Zusammen veranlagt
 // rechnet der eine an, was der andere nicht anrechnen kann (§ 26b EStG; BMF vom 14.05.2025, Rn. 276).
 const ownCredited=min(creditable,div(taxable,D('4')));let credited=ownCredited,lost=creditable-ownCredited;
 if(joint){
  const theirCap=div(D(joint.theirTaxable),D('4')),theirCreditable=D(partnerSolo.creditable||'0'),theirOwn=min(theirCreditable,theirCap);
  const fromThem=min(theirCreditable-theirOwn,div(taxable,D('4'))-ownCredited),toThem=min(lost,theirCap-theirOwn);
  credited+=fromThem;lost-=toThem;Object.assign(joint,{theirUnusedForeign:S(theirCreditable-theirOwn),foreignFromPartner:S(fromThem),foreignToPartner:S(toThem)});
 }
 if(lost>0n)hint(`Anrechenbare Quellensteuer ${S(round(creditable))} € übersteigt die deutsche Steuer; angerechnet werden ${S(round(creditable-lost))} €${joint&&D(joint.foreignToPartner)>0n?`, davon ${S(round(D(joint.foreignToPartner)))} € bei ${partnerName}`:''}, der Rest verfällt in der Veranlagung.`);
 // Kirchensteuerpflicht nur für einen Teil des Jahres: k gezwölftelt (BMF vom 14.05.2025, Rz. 133).
 const months=churchMonths(params),k=mul(D(String(params.churchRate)),D(String(months)))/12n;
 const taxWith=q=>taxOn(taxable,k,q);
 const {capital,sol,church,total:totalTax}=taxWith(credited);
 // § 32d Abs. 5 S. 3 EStG: angerechnet wird höchstens die deutsche Steuer auf die ausländischen Erträge,
 // nach zwingender Verlustverrechnung (BFH vom 23.11.2021, VIII R 22/18). Depotklar rechnet Verluste und
 // Sparer-Pauschbetrag zuerst den übrigen Erträgen zu; anteilig verteilt bliebe weniger anrechenbar.
 if(credited>0n&&!joint){
  const positive=max(0n,stocksNow-D(params.stockLossCarry))+sum(taxed.filter(i=>!i.stock).map(i=>max(0n,D(i.taxableAfter)))),share=positive>0n?div(taxable,positive):0n;
  const prorata=sum(foreign.map(m=>min(creditOf(m),mul(mul(D(m.income.taxable),share),D(FOREIGN_TAX_CAP)))));
  const more=round(prorata)<round(credited)?taxWith(prorata).total-totalTax:0n;
  if(more>0n)hint(`Depotklar rechnet Verluste und den Sparer-Pauschbetrag zuerst den übrigen Erträgen zu und rechnet ${eur(credited)} € Quellensteuer an. Verteilt das Finanzamt sie anteilig auch auf die ausländischen Erträge, sind nur ${eur(prorata)} € anrechenbar und die Steuer ist ${eur(more)} € höher. Verluste werden ohne Wahlrecht vor der Anrechnung verrechnet (§ 32d Abs. 5 S. 3 EStG; BFH vom 23.11.2021, VIII R 22/18).`);
 }
 return {...base,status,reasons,joint,items:taxed,
  gross:S(sum(items.map(i=>D(i.gross)))),exempt:S(sum(items.map(i=>D(i.exempt)))),
  stockResult:S(stocksNow),otherResult:S(otherNow),offset:Object.fromEntries(Object.entries(own).map(([k,v])=>[k,S(v)])),afterLoss:S(after),allowanceUsed:S(allowance),taxable:S(taxable),
  pots:potsOf(own,half),creditable:S(creditable),
  capitalTax:S(capital),solidarity:S(sol),churchTax:S(church),total:S(totalTax),churchRate:S(k),
  foreignTax:foreign.length||credited>0n?{creditable:S(round(creditable)),credited:S(round(credited)),...(joint?{fromPartner:S(round(D(joint.foreignFromPartner))),toPartner:S(round(D(joint.foreignToPartner)))}:{})}:null,
  protectedStart:params.protectedRemaining??null,protectedUsed:S(used),protectedRemaining:remaining==null?null:S(remaining),
  carry:{stockLoss:S(carryStock),otherLoss:S(carryOther),protectedRemaining:remaining==null?null:S(remaining)},
  difference:bankWithheld==null?null:S(D(bankWithheld)-totalTax),
  // Je Steuerart: einbehalten minus Modell, positiv = zu viel einbehalten (etwa Kirchensteuer nach einem Austritt).
  taxDifference:bankTaxes==null?null:{capitalTax:S(D(bankTaxes.capitalTax)-capital),solidarity:S(D(bankTaxes.solidarity)-sol),churchTax:S(D(bankTaxes.churchTax)-church)}};
}

// Zeilen der Jahresrechnung für Steuerseite, Excel und PDF: [Bezeichnung, Betrag, hervorgehoben].
export function calcLines(r){
 if(r.status!=='supported')return [];
 const j=r.joint,o=r.offset,nz=v=>v!=null&&D(v)!==0n,received=j?S(D(j.stockReceived)+D(j.otherReceived)):null;
 return [
  ['Aktienveräußerungen des Jahres',o.stocks],['Übrige Erträge des Jahres',o.other],
  ...(nz(o.stockCarryUsed)?[['Abzüglich Aktienverlustvortrag',o.stockCarryUsed]]:[]),
  ...(nz(o.otherCarryUsed)?[['Abzüglich sonstiger Verlustvortrag',o.otherCarryUsed]]:[]),
  ['Nach Verlustverrechnung',r.afterLoss],
  [j&&nz(j.transfer)?`Sparer-Pauschbetrag, darin ${eur(j.transfer)} € ungenutzt von ${j.partnerName}`:'Sparer-Pauschbetrag',r.allowanceUsed],
  ...(j&&nz(received)?[[`Abzüglich Verlust von ${j.partnerName}`,received]]:[]),
  ['Bemessungsgrundlage',r.taxable,true],
  ...(r.foreignTax?[[r.foreignTax.fromPartner&&nz(r.foreignTax.fromPartner)?`Angerechnete ausländische Quellensteuer, darin ${eur(r.foreignTax.fromPartner)} € von ${j.partnerName}`:'Angerechnete ausländische Quellensteuer',r.foreignTax.credited]]:[]),
  ['Kapitalertragsteuer',r.capitalTax],['Solidaritätszuschlag',r.solidarity],
  [r.churchMonths<12&&Number(r.churchTax)?`Kirchensteuer (${r.churchMonths}/12 des Satzes)`:'Kirchensteuer',r.churchTax],
  ['Steuer laut Modell',r.total,true]];
}

// Vorschläge für die Jahresdaten aus dem Vorjahr. Vorträge aus der Vorjahresrechnung; ohne
// Erträge im Vorjahr bleiben sie unverändert, sonst unbekannt (leer) statt null Euro.
export function yearDefaults(s,personId,year){
 const prev=s.years[personId]?.[year-1],own=s.years[personId]?.[year];
 if(own)return {...own,proposal:false};
 const cache=new Map(),last=prev?yearReport(s,personId,year-1,{cache}):null;
 const carry=(k,field)=>last?.status==='supported'?last.carry[k]:last?.status==='none'?(prev[field]??null):null;
 return {churchRate:prev?.churchUntil!=null?'0':prev?.churchRate??'0',externalAllowance:'0',
  stockLossCarry:carry('stockLoss','stockLossCarry'),otherLossCarry:carry('otherLoss','otherLossCarry'),
  // Ohne bekannte Historie kein Vorschlag: maßgeblich ist der Feststellungsbescheid.
  protectedRemaining:protectedProposal(s,personId,year,{cache}),joint:false,nonResident:false,proposal:true,
  basedOn:last?.status==='supported'||last?.status==='none'?year-1:null};
}
