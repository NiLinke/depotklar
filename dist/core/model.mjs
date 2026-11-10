import {D,S,mul,div,round,sum} from './decimal.mjs';
import {KINDS,GROUPS,RELATIONS,EXEMPTION,TREATY_RATE,SUBSTITUTE_RATE,groupOf,baseRateOf,LAST_RULE_YEAR,LAST_RATE_YEAR,FIRST_TAX_YEAR,isFund} from './rules.mjs';
import {publishedVatRate} from './vatrates.mjs';

export const FORMAT='depotklar',VERSION=4,APP_VERSION='4.22.3';

export const EVENT_TYPES=Object.freeze({
 opening:'Bestand übernommen',
 transition:'Übergang 2017/2018',
 buy:'Kauf',
 sell:'Verkauf',
 transfer:'Übertrag',
 distribution:'Ausschüttung / Dividende',
 accumulation:'Thesaurierung (altes Recht)',
 interest:'Zinsen',
 otherIncome:'Sonstiger Ertrag',
 fx:'Währungskonto',
 vap:'Vorabpauschale laut Bank',
 split:'Split',
 merger:'Fondsverschmelzung'
});
export const TRANSFER_KINDS=Object.freeze({gift:'Schenkung',inheritance:'Erbschaft',own:'Eigenes Depot'});
// Schenkung an mehrere: wie die abgehenden Lose auf die Empfänger verteilt werden.
export const ALLOCATIONS=Object.freeze({sequence:'Nacheinander (Reihenfolge der Zeilen)',prorata:'Anteilig (gleicher Erwerbsmix)'});
// Währungskonten: verzinst nach § 20 EStG, unverzinst bzw. Zahlungsverkehr nach § 23 EStG.
export const ACCOUNT_KINDS=Object.freeze({payment:'Unverzinst / Zahlungsverkehr (§ 23 EStG)',interest:'Verzinst, Tages- oder Festgeld (§ 20 EStG)'});
export const FX_KINDS=Object.freeze({exchangeIn:'Umtausch aus EUR',exchangeOut:'Umtausch in EUR',exchange:'Umtausch in andere Währung',credit:'Gutschrift',debit:'Zahlung / Gebühr / Überweisung',transfer:'Übertrag auf eigenes Konto',gift:'Schenkung an andere Person',inheritance:'Erbschaft an andere Person',opening:'Bestand übernommen'});
export const COLLECTIONS=Object.freeze({persons:'Person',depots:'Depot',securities:'Wertpapier',accounts:'Währungskonto',certificates:'Bankbescheinigung',ledgerChecks:'Buchhaltungsabgleich',balanceChecks:'Kontostand laut Bank',priorGifts:'Vorerwerb'});
export const CHURCH_RATES=Object.freeze({'0':'keine','0.08':'8 %','0.09':'9 %'});
// Steuerabzug laut Abrechnung je Steuerart, wie in der Jahressteuerbescheinigung. Ältere
// Einträge tragen nur die Summe (withheld); sie bleiben gültig.
// Kontrolle gegen Bankwerte: Unterschiede bis 0,05 € oder bis 1 € bei höchstens 0,1 % des Betrags
// gelten als Rundung – Banken rechnen etwa die Vorabpauschale je Anteil mit gerundeten Werten.
export function roundingOnly(bank,model){const d=D(bank)-D(model),a=d<0n?-d:d,m=D(model)<0n?-D(model):D(model);return a<=D('0.05')||(a<=D('1')&&a*1000n<=m);}
// Gewinn laut Abrechnung, der zum Gewinn nach statt vor Teilfreistellung passt: vermutlich verwechselt.
export function afterExemption(bank,sale){return sale?.exempt!=null&&D(sale.exempt)!==0n&&sale.taxable!=null&&sale.gross!=null&&roundingOnly(bank,sale.taxable)&&!roundingOnly(bank,sale.gross);}
// Gewinn laut Abrechnung von 30 % des Erlöses, der nicht zur eigenen Rechnung passt: Der Bank fehlten die
// Anschaffungsdaten, etwa nach einem Übertrag aus dem Ausland (Ersatzbemessungsgrundlage, § 43a Abs. 2 S. 7 EStG).
// Verglichen wird mit dem Erlös nach und – falls erfasst – vor Gebühren.
export function substituteBase(bank,sale,proceeds,fees=null){
 if(bank==null||proceeds==null||sale?.gross==null||roundingOnly(bank,sale.gross))return false;
 return [D(proceeds),...(fees!=null?[D(proceeds)+D(fees)]:[])].some(p=>p>0n&&roundingOnly(bank,S(mul(p,D(SUBSTITUTE_RATE)))));
}
// Quellensteuer im Verhältnis zum Bruttobetrag. Über dem üblichen DBA-Satz von 15 % (mit einem halben
// Prozentpunkt Spielraum für Rundung und Umrechnung) ist meist ein Teil im Quellenstaat zu erstatten.
export function foreignShare(foreignTax,gross){
 if(foreignTax==null||gross==null||D(gross)<=0n||D(foreignTax)<=0n)return null;
 const share=div(D(foreignTax),D(gross));
 return {percent:S(round(share*100n,1)),aboveTreaty:share>D(TREATY_RATE)+D('0.005')};
}
// Name passt nicht zur Art: ein ETF als Aktie erfasst oder ein Wertpapier, das Depotklar nicht rechnet.
// ETCs zuerst (auch „iShares … ETC“), dann Fondsnamen (auch Anleihen-ETFs), dann übrige Nicht-Fonds.
const COMMODITY=/\b(ETCs?|ETNs?|Xetra-Gold|EUWAX Gold)\b/i;
const FUND_NAME=/\b(ETFs?|UCITS|Fonds|Funds?|SICAV|OGAW|iShares|Xtrackers|Vanguard|Amundi|Lyxor|SPDR|Invesco|WisdomTree|VanEck|Acc|Dist|Bond)\b/i;
const OTHER=/\b(Zertifikate?|Optionsscheine?|Turbos?|Knock-?outs?)\b|anleihen?\b/i;
const UNSUPPORTED='Der Name klingt nach einer Anleihe, einem Zertifikat, einem ETC oder einem Derivat: weder als Aktie noch als Fonds erfassen. Dafür gibt es die Arten „Anleihe / Zertifikat“ und „ETC mit Rohstoffanspruch“; Derivate über den Vorgang „Sonstiger Ertrag“.';
// Art eines Ertrags auf Steuerseite, im Excel und im Rechenweg.
export function incomeType(i,x){
 const m=i.ref;
 return {sale:'Verkauf',distribution:m.cash?'Barausgleich':x?.kind==='stock'?'Dividende':x?.kind==='bond'?'Zinsen':'Ausschüttung',vap:`Vorabpauschale ${m.year}`,interest:'Zinsen',other:'Sonstiger Ertrag',fx:'Währungsgewinn § 20 EStG'}[i.kind];
}
export function kindWarning(x){
 if(!x?.name||x.kind==='bond'||x.kind==='commodity')return null;
 if(COMMODITY.test(x.name))return UNSUPPORTED;
 if(FUND_NAME.test(x.name))return x.kind==='stock'?'Der Name klingt nach einem Fonds. ETFs und Fonds sind keine Aktien: Teilfreistellung, Vorabpauschale und Verlustverrechnung unterscheiden sich – die Art prüfen.':null;
 return OTHER.test(x.name)?UNSUPPORTED:null;
}
export const TAX_PARTS=Object.freeze({capitalTax:'Kapitalertragsteuer',solidarity:'Solidaritätszuschlag',churchTax:'Kirchensteuer'});
export function withholdingOf(e){
 const keys=Object.keys(TAX_PARTS);
 if(e&&keys.some(k=>e[k]!=null))return {total:keys.every(k=>e[k]!=null)?S(sum(keys.map(k=>D(e[k])))):null,parts:Object.fromEntries(keys.map(k=>[k,e[k]??null]))};
 return {total:e?.withheld??null,parts:null};
}

export const uid=()=>globalThis.crypto?.randomUUID?.()??`id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
// Erster Werktag eines Jahres (2. Januar oder der folgende Montag); Feiertage außer Neujahr bleiben unberücksichtigt.
export const firstWorkday=year=>{const d=new Date(Date.UTC(year,0,2));while(d.getUTCDay()===0||d.getUTCDay()===6)d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
// Jahresauswahl ohne feste Obergrenze: das laufende und die zwei folgenden Jahre, dazu jedes Jahr mit Buchungen.
const yearsOf=list=>(list||[]).map(x=>Number(String(x.date).slice(0,4)));
export const lastSelectableYear=s=>Math.max(Number(today().slice(0,4))+2,...yearsOf(s?.events));
// Für Tabellen mit einer Spalte je Jahr: bis zum laufenden Jahr oder dem letzten Jahr mit Buchungen oder Kursen.
export const lastBookedYear=s=>Math.max(Number(today().slice(0,4)),...yearsOf(s?.events),...yearsOf(s?.prices));
export function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}

// Inhaber, Bank und Auslandskennzeichen eines Währungskontos: bei einem Depot die des Depots,
// bei einem eigenständigen Konto die eigenen Angaben.
export function accountHolder(s,a){
 if(!a)return null;const d=a.depotId?s.depots.find(x=>x.id===a.depotId):null;
 return {personId:d?d.personId:a.personId,bank:d?d.bank:a.bank,abroad:Boolean(d?d.abroad:a.abroad),depot:d||null};
}

export function emptyState(){
 return {format:FORMAT,version:VERSION,persons:[],years:{},relations:[],depots:[],accounts:[],securities:[],prices:[],events:[],certificates:[],ledgerChecks:[],balanceChecks:[],priorGifts:[],vapUnits:[],audit:[]};
}
// Daten aus Depotklar 4.0 kennen noch keine Währungskonten; bis 4.1.1 galt ein
// Jahresabschluss für alle Personen gemeinsam und wird je Person übernommen.
export function upgrade(s){
 if(!s||s.format!==FORMAT||s.version!==VERSION)return s;
 if(s.accounts==null)s.accounts=[];
 if(s.vapUnits==null)s.vapUnits=[];
 if(s.balanceChecks==null)s.balanceChecks=[];
 if(s.closedThrough!=null){s.closing=Object.fromEntries((s.persons||[]).map(p=>[p.id,s.closedThrough]));delete s.closedThrough;}
 return s;
}

const fail=message=>{throw Error(message);};
const decimal=(value,label,{optional=false,positive=false,signed=false}={})=>{
 if(value==null||value===''){if(optional)return;fail(`${label} fehlt.`);}
 let n;try{n=D(value);}catch{fail(`${label}: ungültiger Betrag.`);}
 if(positive&&n<=0n)fail(`${label} muss größer als null sein.`);
 if(!signed&&!positive&&n<0n)fail(`${label} darf nicht negativ sein.`);
};
const unique=(list,label)=>{const ids=new Set();for(const x of list){if(!x?.id||ids.has(x.id))fail(`${label}: fehlende oder doppelte Kennung.`);ids.add(x.id);}return ids;};

// Strukturprüfung. Fachliche Lücken (fehlender Kurs, fehlende Basis) sind
// erlaubt und werden in der Rechnung als „nicht ermittelt“ ausgewiesen.
export function validate(s){
 if(!s||s.format!==FORMAT||s.version!==VERSION)fail('Unbekanntes Datenformat. Depotklar 4 liest nur Daten im Format 4.');
 for(const key of ['persons','relations','depots','accounts','securities','prices','events','certificates','ledgerChecks','priorGifts','audit'])if(!Array.isArray(s[key]))fail(`Datenbereich ${key} fehlt.`);
 if(!s.years||typeof s.years!=='object')fail('Jahresdaten fehlen.');
 const persons=unique(s.persons,'Person'),depots=unique(s.depots,'Depot'),securities=unique(s.securities,'Wertpapier');
 unique(s.events,'Vorgang');unique(s.certificates,'Bankbescheinigung');unique(s.ledgerChecks,'Buchhaltungsabgleich');unique(s.priorGifts,'Vorerwerb');
 for(const p of s.persons)if(!p.name?.trim())fail('Person ohne Namen.');
 for(const d of s.depots){if(!persons.has(d.personId))fail(`Depot ${d.name||d.id}: Person fehlt.`);if(!d.name?.trim())fail('Depot ohne Bezeichnung.');if(d.abroad!=null&&typeof d.abroad!=='boolean')fail(`Depot ${d.name}: Angabe zur ausländischen Bank ungültig.`);}
 unique(s.accounts,'Währungskonto');
 for(const a of s.accounts){
  // Bei einem Depot gelten dessen Inhaber und Bank; ein eigenständiges Konto trägt beides selbst.
  if(a.depotId){if(!depots.has(a.depotId))fail(`Währungskonto ${a.name||a.id}: Depot fehlt.`);}
  else{if(!persons.has(a.personId))fail(`Währungskonto ${a.name||a.id}: Inhaber fehlt.`);if(!String(a.bank||'').trim())fail(`Währungskonto ${a.name||a.id}: Bank fehlt.`);if(a.abroad!=null&&typeof a.abroad!=='boolean')fail(`Währungskonto ${a.name}: Angabe zur ausländischen Bank ungültig.`);}
  if(!a.name?.trim())fail('Währungskonto ohne Bezeichnung.');
  if(!/^[A-Z]{3}$/.test(a.currency||'')||a.currency==='EUR')fail(`${a.name}: Währung als dreistelliger Code angeben, z. B. USD.`);
  if(!Object.hasOwn(ACCOUNT_KINDS,a.kind))fail(`${a.name}: Kontoart fehlt.`);
  if(a.vatBook!=null&&typeof a.vatBook!=='boolean')fail(`${a.name}: Angabe zur Buchhaltung ungültig.`);
 }
 const isins=new Set();
 for(const x of s.securities){
  if(!x.name?.trim())fail('Wertpapier ohne Namen.');
  if(!Object.hasOwn(KINDS,x.kind))fail(`${x.name}: Wertpapierart fehlt.`);
  if(x.isin){if(isins.has(x.isin))fail(`ISIN ${x.isin} doppelt.`);isins.add(x.isin);}
 }
 for(const r of s.relations){if(!persons.has(r.donorId)||!persons.has(r.recipientId)||r.donorId===r.recipientId)fail('Beziehung verweist auf unbekannte Personen.');if(!Object.hasOwn(RELATIONS,r.kind))fail('Unbekannte Beziehungsart.');}
 for(const [personId,years] of Object.entries(s.years)){
  if(!persons.has(personId))fail('Jahresdaten einer unbekannten Person.');
  for(const [year,y] of Object.entries(years)){
   if(!/^\d{4}$/.test(year))fail('Ungültiges Steuerjahr.');
   if(y.churchRate!=null&&!Object.hasOwn(CHURCH_RATES,String(y.churchRate)))fail(`${year}: Kirchensteuersatz ungültig.`);
   for(const k of ['externalAllowance','stockLossCarry','otherLossCarry','protectedRemaining'])decimal(y[k],`${year}: ${k}`,{optional:true});
   // Kirchensteuerpflicht nur bis zu einem Monat (Austritt) oder ab einem Monat (Eintritt).
   if(y.churchUntil!=null&&(!Number.isInteger(y.churchUntil)||y.churchUntil<1||y.churchUntil>11))fail(`${year}: Letzter Monat der Kirchensteuerpflicht ungültig.`);
   if(y.churchFrom!=null&&(!Number.isInteger(y.churchFrom)||y.churchFrom<2||y.churchFrom>12))fail(`${year}: Erster Monat der Kirchensteuerpflicht ungültig.`);
   if(y.churchUntil!=null&&y.churchFrom!=null)fail(`${year}: Austritt und Eintritt im selben Jahr sind nicht abgebildet.`);
   if((y.churchUntil!=null||y.churchFrom!=null)&&(y.churchRate==null||String(y.churchRate)==='0'))fail(`${year}: Für Ein- oder Austritt den Kirchensteuersatz angeben.`);
   if(y.foreignDeclared!=null&&typeof y.foreignDeclared!=='boolean')fail(`${year}: Angabe zu den erklärten Auslandserträgen ungültig.`);
   if(y.jointWith!=null){
    if(!persons.has(y.jointWith)||y.jointWith===personId)fail(`${year}: Ehegatte für die Zusammenveranlagung ungültig.`);
    const theirs=s.years[y.jointWith]?.[year]?.jointWith;
    if(theirs&&theirs!==personId)fail(`${year}: Die gewählte Person ist schon mit einer anderen zusammen veranlagt.`);
    for(const [p,other] of Object.entries(s.years))if(p!==personId&&(other?.[year]?.jointWith===y.jointWith||other?.[year]?.jointWith===personId&&p!==y.jointWith))fail(`${year}: Zusammenveranlagung nur mit einer Person.`);
   }
  }
 }
 if(s.closedThrough!=null)fail('Jahresabschluss im alten Format.');
 if(s.closing!=null){
  if(typeof s.closing!=='object'||Array.isArray(s.closing))fail('Jahresabschluss ungültig.');
  for(const [p,y] of Object.entries(s.closing)){if(!persons.has(p))fail('Jahresabschluss einer unbekannten Person.');if(!Number.isInteger(y)||y<2018)fail('Jahresabschluss ungültig.');}
 }
 for(const p of s.prices){if(!securities.has(p.securityId))fail('Kurs zu unbekanntem Wertpapier.');if(!validDate(p.date))fail('Kursdatum ungültig.');decimal(p.price,'Kurs',{positive:true});}
 for(const e of s.events)validateEvent(s,e,{depots,securities});
 const transitions=new Set();
 for(const e of s.events.filter(e=>e.type==='transition')){const k=`${e.depotId}|${e.securityId}`;if(transitions.has(k))fail('Übergang 2017/2018: je Depot und Fonds nur einmal.');transitions.add(k);}
 const batches=new Map();for(const e of s.events)if(e.batchId){if(!batches.has(e.batchId))batches.set(e.batchId,[]);batches.get(e.batchId).push(e);}
 for(const list of batches.values()){const a=list[0];if(list.some(e=>e.date!==a.date||e.depotId!==a.depotId||e.securityId!==a.securityId||e.allocation!==a.allocation||e.kind!==a.kind))fail('Schenkung an mehrere: alle Empfänger brauchen dasselbe Datum, dasselbe Depot, dasselbe Wertpapier und dieselbe Aufteilung.');}
 for(const c of s.certificates){
  if(!persons.has(c.personId))fail('Bankbescheinigung ohne Person.');if(!c.bank?.trim()||!Number.isInteger(c.year))fail('Bankbescheinigung: Bank und Jahr angeben.');
  for(const k of ['capitalTax','solidarity','churchTax','certifiedStockLoss','certifiedOtherLoss'])decimal(c[k],`Bankbescheinigung ${k}`,{optional:true});
  if(s.certificates.some(x=>x!==c&&x.personId===c.personId&&x.year===c.year&&x.bank.trim()===c.bank.trim()))fail(`Bankbescheinigung ${c.bank} ${c.year} doppelt.`);
 }
 // Vorabpauschale je Anteil laut Steuerinformation des Fonds: vor Teilfreistellung, für ganzjährig gehaltene Anteile.
 if(s.vapUnits!=null&&!Array.isArray(s.vapUnits))fail('Datenbereich vapUnits ungültig.');
 const unitKeys=new Set();
 for(const u of s.vapUnits||[]){
  const x=s.securities.find(y=>y.id===u.securityId);if(!x)fail('Vorabpauschale je Anteil ohne Wertpapier.');if(!isFund(x.kind))fail(`${x.name}: Vorabpauschale nur bei Fonds.`);
  const rate=Number.isInteger(u.year)?baseRateOf(s,u.year):null;
  if(!rate||D(rate.rate)<=0n)fail(`${x.name}: Für ${u.year} gibt es keine Vorabpauschale.`);
  decimal(u.perUnit,`${x.name}: Vorabpauschale ${u.year} je Anteil`);
  const k=`${u.securityId}|${u.year}`;if(unitKeys.has(k))fail(`${x.name}: Vorabpauschale ${u.year} je Anteil doppelt.`);unitKeys.add(k);
 }
 // Jahreswerte für Folgejahre: vom Anwender eingetragen; hinterlegte Werte haben Vorrang.
 if(s.vatRates!=null){
  if(typeof s.vatRates!=='object'||Array.isArray(s.vatRates))fail('USt-Umrechnungskurse ungültig.');
  for(const [c,months] of Object.entries(s.vatRates)){
   if(!/^[A-Z]{3}$/.test(c)||!months||typeof months!=='object')fail(`USt-Umrechnungskurse ${c} ungültig.`);
   for(const [m,r] of Object.entries(months)){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))fail(`USt-Umrechnungskurs ${c}: Monat ${m} ungültig.`);decimal(r,`USt-Umrechnungskurs ${c} ${m}`,{positive:true});}
  }
 }
 if(s.yearRules!=null){
  if(typeof s.yearRules!=='object'||Array.isArray(s.yearRules))fail('Jahresregeln ungültig.');
  for(const [y,r] of Object.entries(s.yearRules)){
   if(!/^\d{4}$/.test(y)||Number(y)<FIRST_TAX_YEAR||!r||typeof r!=='object')fail(`Jahresregeln ${y} ungültig.`);
   decimal(r.allowance,`Jahresregeln ${y}: Sparer-Pauschbetrag`,{optional:true});
   decimal(r.baseRate,`Jahresregeln ${y}: Basiszins`,{optional:true,signed:true});
   if(r.baseRate!=null&&(D(r.baseRate)>D('0.2')||D(r.baseRate)<D('-0.2')))fail(`Jahresregeln ${y}: Basiszins als Anteil, etwa 0.0253 für 2,53 %.`);
  }
 }
 for(const c of s.ledgerChecks){if(!depots.has(c.depotId))fail('Buchhaltungsabgleich ohne Depot.');if(!validDate(c.date))fail('Datum des Abgleichs ungültig.');decimal(c.balance,'Saldo laut Buchhaltung',{signed:true});}
 // Kontostand eines Währungskontos laut Kontoauszug, je Konto und Tag einmal; Depotklar vergleicht ihn mit dem gebuchten Bestand.
 if(s.balanceChecks!=null&&!Array.isArray(s.balanceChecks))fail('Datenbereich balanceChecks ungültig.');
 unique(s.balanceChecks||[],'Kontostand laut Bank');
 const checkKeys=new Set();
 for(const c of s.balanceChecks||[]){
  const a=s.accounts.find(x=>x.id===c.accountId);if(!a)fail('Kontostand laut Bank ohne Währungskonto.');if(!validDate(c.date))fail('Datum des Kontostands ungültig.');
  decimal(c.balance,`${a.name}: Kontostand laut Bank`);
  const k=`${c.accountId}|${c.date}`;if(checkKeys.has(k))fail(`${a.name}: Kontostand zum ${c.date.split('-').reverse().join('.')} doppelt.`);checkKeys.add(k);
 }
 for(const g of s.priorGifts){if(!persons.has(g.donorId)||!persons.has(g.recipientId))fail('Vorerwerb verweist auf unbekannte Person.');if(!validDate(g.date))fail('Datum des Vorerwerbs ungültig.');decimal(g.value,'Wert des Vorerwerbs',{positive:true});decimal(g.taxPaid,'Gezahlte Steuer des Vorerwerbs',{optional:true});}
 return true;
}

// fresh: zusätzliche Prüfungen für neu erfasste oder geänderte Vorgänge. Bestehende Daten
// mit diesen Mängeln bleiben lesbar; die Fortschreibung meldet sie als offene Angabe.
export function validateEvent(s,e,refs,{fresh=false}={}){
 const depots=refs?.depots||new Set(s.depots.map(d=>d.id)),securities=refs?.securities||new Set(s.securities.map(x=>x.id));
 if(!Object.hasOwn(EVENT_TYPES,e.type))fail('Unbekannte Vorgangsart.');
 const label=EVENT_TYPES[e.type];
 if(!validDate(e.date))fail(`${label}: Datum ungültig.`);
 const account=id=>(s.accounts||[]).find(a=>a.id===id),owner=id=>s.depots.find(d=>d.id===id)?.personId,holder=a=>accountHolder(s,a);
 // Ohne Depot: Bewegungen eines eigenständigen Währungskontos und Zinsen, die auf ein Währungskonto gehen.
 const standalone=(e.type==='fx'&&!account(e.accountId)?.depotId)||(e.type==='interest'&&!e.depotId);
 if(standalone){if(e.depotId)fail(`${label}: Das Währungskonto gehört zu keinem Depot.`);if(e.type==='interest'&&!account(e.fx?.accountId))fail('Zinsen: Depot oder Währungskonto angeben.');}
 else if(!depots.has(e.depotId))fail(`${label}: Depot fehlt.`);
 if(e.type==='interest'||e.type==='fx'||e.type==='otherIncome'){if(e.securityId)fail(`${label} wird ohne Wertpapier erfasst.`);}
 else if(!securities.has(e.securityId))fail(`${label}: Wertpapier fehlt.`);
 // Ein Devisenkurs kann aus den EZB-Referenzkursen übernommen sein; dann mit Kurstag.
 const quote=(q,what)=>{if(q.rateSource==null)return;if(q.rateSource!=='ecb'||q.rate==null||!validDate(q.rateDate))fail(`${what}: Herkunft des Devisenkurses ungültig.`);};
 if(e.fx!=null){
  if(!['buy','sell','distribution','interest'].includes(e.type))fail(`${label}: Währungskonto nicht vorgesehen.`);
  const a=account(e.fx.accountId);if(!a)fail(`${label}: Währungskonto fehlt.`);
  if(e.depotId&&holder(a).personId!==owner(e.depotId))fail(`${label}: Das Währungskonto gehört einer anderen Person.`);
  decimal(e.fx.amount,`${label}: Betrag in ${a.currency}`,{positive:true});decimal(e.fx.rate,`${label}: Devisenkurs`,{optional:true,positive:true});quote(e.fx,label);
 }
 if(e.type==='fx'){
  const a=account(e.accountId);if(!a)fail('Währungskonto fehlt.');
  if((a.depotId||null)!==(e.depotId||null))fail('Währungskonto und Depot passen nicht zusammen.');
  if(!Object.hasOwn(FX_KINDS,e.kind))fail('Währungskonto: Art der Bewegung fehlt.');
  decimal(e.amount,`Betrag in ${a.currency}`,{positive:true});decimal(e.eur,'Gegenwert in EUR',{optional:true,positive:true});decimal(e.rate,'Devisenkurs',{optional:true,positive:true});quote(e,'Währungskonto');
  // Umtausch in eine andere Fremdwährung: eigenes Konto der anderen Währung, mit dem Betrag, der dort ankommt.
  if(e.kind==='exchange'){
   const t=account(e.toAccountId);if(!t||t.id===a.id)fail('Umtausch: Zielkonto fehlt.');if(t.currency===a.currency)fail('Umtausch: Das Zielkonto braucht eine andere Währung, sonst „Übertrag auf eigenes Konto“ wählen.');
   if(holder(t).personId!==holder(a).personId)fail('Umtausch nur auf ein eigenes Konto.');
   decimal(e.toAmount,`Umtausch: Betrag in ${t.currency}`,{positive:true});
  }else if(e.toAmount!=null)fail('Währungskonto: Zielbetrag nur beim Umtausch in eine andere Währung.');
  if(['transfer','gift','inheritance'].includes(e.kind)){
   const t=account(e.toAccountId);if(!t||t.id===a.id)fail('Übertrag: Zielkonto fehlt.');if(t.currency!==a.currency)fail('Übertrag nur zwischen Konten derselben Währung.');
   const same=holder(t).personId===holder(a).personId;
   if(e.kind==='transfer'&&!same)fail('Übertrag nur auf ein eigenes Konto. Für eine andere Person „Schenkung“ oder „Erbschaft“ wählen.');
   if(e.kind!=='transfer'&&same)fail('Schenkung oder Erbschaft nur an eine andere Person.');
  }
  if(e.kind==='opening'&&e.acquired!=null&&(!validDate(e.acquired)||e.acquired>e.date))fail('Bestand übernehmen: Anschaffungstag ungültig.');
 }
 const kind=s.securities.find(x=>x.id===e.securityId)?.kind;
 if(['opening','buy','sell','transfer'].includes(e.type))decimal(e.quantity,`${label}: Stückzahl`,{positive:true});
 if(e.type==='opening'){
  if(!Object.hasOwn(GROUPS,e.group))fail('Bestand übernehmen: Erwerbsgruppe fehlt.');
  if(e.acquired!=null&&!validDate(e.acquired))fail('Bestand übernehmen: Erwerbsdatum ungültig.');
  if(e.acquired&&e.acquired>e.date)fail('Bestand übernehmen: Erwerb liegt nach dem Stichtag.');
  decimal(e.cost,'Bestand übernehmen: Anschaffungswert',{optional:true});
  decimal(e.price2017,'Bestand übernehmen: Kurs 31.12.2017',{optional:true,positive:true});
  decimal(e.deemed2017,'Bestand übernehmen: fiktiver Gewinn 2017',{optional:true,signed:true});
  decimal(e.oldIncome,'Bestand übernehmen: akkumulierte Erträge',{optional:true});
  decimal(e.vapBefore,'Bestand übernehmen: bisherige Vorabpauschalen',{optional:true});
  if(e.group==='from2018'&&e.date<'2018-01-01')fail('Erwerb ab 2018 kann nicht vor 2018 übernommen werden.');
  if(e.group!=='from2018'&&isFund(kind)&&e.date<'2018-01-01')fail('Fondsbestände aus der Zeit vor 2018 werden frühestens zum 01.01.2018 übernommen.');
  if(fresh&&e.acquired&&groupOf(e.acquired)!==e.group)fail(`Bestand übernehmen: Erwerbsdatum ${e.acquired.split('-').reverse().join('.')} gehört zur Erwerbsgruppe „${GROUPS[groupOf(e.acquired)]}“, nicht „${GROUPS[e.group]}“.`);
 }
 // Gezahlte Stückzinsen sind negative Einnahmen (BMF vom 14.05.2025, Rn. 51); ein sonstiger Ertrag kann ein Verlust sein.
 if(['buy','sell','distribution','vap','interest','otherIncome'].includes(e.type))decimal(e.amount,`${label}: Betrag`,{optional:false,signed:e.type==='otherIncome'||e.type==='distribution'&&kind==='bond'});
 if(e.type==='otherIncome'&&!String(e.label||'').trim())fail('Sonstiger Ertrag: Bezeichnung fehlt.');
 // Aus Kurs je Stück erfasst: Betrag = Stück × Kurs zuzüglich (Kauf) bzw. abzüglich (Verkauf) Gebühren, auf Cent.
 if(e.type==='buy'||e.type==='sell'){
  decimal(e.unitPrice,`${label}: Kurs je Stück`,{optional:true,positive:true});decimal(e.fees,`${label}: Gebühren`,{optional:true});
  if(e.fees!=null&&e.unitPrice==null)fail(`${label}: Gebühren nur zusammen mit dem Kurs je Stück.`);
  if(e.unitPrice!=null){const g=mul(D(e.quantity),D(e.unitPrice)),f=e.fees==null?0n:D(e.fees);if(D(e.amount)!==round(e.type==='sell'?g-f:g+f))fail(`${label}: Betrag passt nicht zu Kurs je Stück und Gebühren.`);}
 }
 // Fonds ab 2009 lassen sich einzeln kaufen; bestandsgeschützte Alt-Anteile vor 2009 kommen als Bestand zum 01.01.2018.
 if(e.type==='buy'&&isFund(kind)&&e.date<'2009-01-01')fail('Fondskäufe vor 2009 als Bestand zum 01.01.2018 übernehmen (bestandsgeschützte Alt-Anteile, § 56 Abs. 6 InvStG).');
 if(e.type==='sell'){
  decimal(e.taxGainBank,'Verkauf: steuerlicher Gewinn laut Bank',{optional:true,signed:true});if(e.taxGainBank!=null&&e.date>='2018-01-01')fail('Verkauf: Gewinn laut Bank nur für Verkäufe vor 2018 (altes Recht).');
  // Zur Kontrolle: Veräußerungsgewinn vor Teilfreistellung laut Abrechnung (ab 2018).
  decimal(e.gainBank,'Verkauf: Veräußerungsgewinn laut Abrechnung',{optional:true,signed:true});if(e.gainBank!=null&&e.date<'2018-01-01')fail('Verkauf: Veräußerungsgewinn laut Abrechnung für Verkäufe ab 2018 – davor den steuerlichen Gewinn laut Bank (altes Recht).');
  // Fiktiver Gewinn 2017 der verkauften Stücke laut Verkaufsabrechnung (Fonds 2009–2017).
  decimal(e.deemedSold,'Verkauf: fiktiver Gewinn 2017 laut Abrechnung',{optional:true,signed:true});if(e.deemedSold!=null&&(!isFund(kind)||e.date<'2018-01-01'))fail('Verkauf: fiktiver Gewinn 2017 nur bei Fondsverkäufen ab 2018.');
 }
 // Übergang 2017/2018 für einzeln erfasste Fondskäufe 2009–2017: Werte der fiktiven Veräußerung laut Bank.
 if(e.type==='transition'){
  if(!isFund(kind))fail('Übergang 2017/2018 nur für Fonds.');
  if(e.date!=='2017-12-31')fail('Übergang 2017/2018: Stichtag ist der 31.12.2017.');
  decimal(e.price2017,'Übergang: Kurs 31.12.2017',{optional:true,positive:true});
  decimal(e.deemed2017,'Übergang: fiktiver Gewinn 2017',{optional:true,signed:true});
  decimal(e.oldIncome,'Übergang: akkumulierte Erträge',{optional:true});
 }
 // Thesaurierung nach altem Recht: ausschüttungsgleiche Erträge eines Fonds bis 2017; ab 2018 gilt die Vorabpauschale.
 // Eine spätere Korrektur der Fondsgesellschaft kann negativ sein.
 if(e.type==='accumulation'){
  if(!isFund(kind))fail('Thesaurierung nur für Fonds.');
  if(e.date>'2017-12-31')fail('Thesaurierung (altes Recht): nur bis 31.12.2017 – ab 2018 gilt die Vorabpauschale.');
  decimal(e.amount,'Thesaurierung: Betrag',{signed:true});if(D(e.amount)===0n)fail('Thesaurierung: Betrag fehlt.');
 }
 // Beim Verkauf kann die Bank Steuer erstatten (Verlustverrechnung): dann negativ.
 if(['sell','distribution','interest','vap','accumulation','otherIncome','merger'].includes(e.type)){
  const refund=e.type==='sell'||e.type==='otherIncome';
  decimal(e.withheld,`${label}: Steuereinbehalt`,{optional:true,signed:refund});
  const given=Object.keys(TAX_PARTS).filter(k=>e[k]!=null);
  for(const k of given)decimal(e[k],`${label}: ${TAX_PARTS[k]}`,{signed:refund});
  if(given.length&&given.length<3)fail(`${label}: Kapitalertragsteuer, Solidaritätszuschlag und Kirchensteuer zusammen angeben.`);
  if(given.length&&e.withheld!=null)fail(`${label}: Steuerabzug entweder einzeln oder als Summe.`);
 }else if(Object.keys(TAX_PARTS).some(k=>e[k]!=null))fail(`${label}: kein Steuerabzug vorgesehen.`);
 if(e.type==='distribution')decimal(e.foreignTax,'Quellensteuer',{optional:true});
 if(e.type==='distribution'&&e.foreignTax!=null&&D(e.foreignTax)!==0n&&D(e.amount)<=0n)fail('Quellensteuer gibt es nur auf einen positiven Ertrag – auf gezahlte Stückzinsen ist keine anrechenbar.');
 if(e.type==='transfer'){
  if(!depots.has(e.toDepotId)||e.toDepotId===e.depotId)fail('Übertrag: Zieldepot fehlt.');
  if(!Object.hasOwn(TRANSFER_KINDS,e.kind))fail('Übertrag: Art fehlt.');
  const from=s.depots.find(d=>d.id===e.depotId)?.personId,to=s.depots.find(d=>d.id===e.toDepotId)?.personId;
  if(e.kind==='own'&&from!==to)fail('Übertrag ins eigene Depot: Zieldepot gehört einer anderen Person.');
  if(e.kind!=='own'&&from===to)fail('Schenkung oder Erbschaft: Zieldepot gehört derselben Person.');
  decimal(e.price,'Übertrag: Kurs am Stichtag',{optional:true,positive:true});
  if(e.batchId!=null){
   if(typeof e.batchId!=='string'||!e.batchId)fail('Schenkung an mehrere: Kennung fehlt.');
   if(e.kind==='own')fail('Schenkung an mehrere: nur Schenkung oder Erbschaft.');
   if(!Object.hasOwn(ALLOCATIONS,e.allocation))fail('Schenkung an mehrere: Aufteilung der Lose fehlt.');
   decimal(e.share,'Schenkung an mehrere: Anteil',{optional:true,positive:true});
  }
 }
 if(e.type==='vap'){
  if(!Number.isInteger(e.year))fail('Vorabpauschale: Berechnungsjahr fehlt.');if(!isFund(kind))fail('Vorabpauschale nur bei Fonds.');
  if(fresh&&s.events.some(x=>x.id!==e.id&&x.type==='vap'&&x.depotId===e.depotId&&x.securityId===e.securityId&&x.year===e.year))fail(`Vorabpauschale ${e.year} laut Bank ist für dieses Depot und Wertpapier schon erfasst – den vorhandenen Vorgang ändern.`);
 }
 if(e.type==='split')decimal(e.ratio,'Split: Verhältnis',{positive:true});
 if(e.type==='merger'){
  const what=kind==='stock'?'Aktientausch':'Verschmelzung',target=s.securities.find(x=>x.id===e.toSecurityId)?.kind;
  if(kind==='bond'||kind==='commodity')fail('Verschmelzung nur für Fonds, Tausch nur für Aktien.');
  if(!securities.has(e.toSecurityId)||e.toSecurityId===e.securityId)fail(`${what}: Ziel fehlt.`);
  if(kind==='stock'?target!=='stock':!isFund(target))fail(kind==='stock'?'Aktientausch: Das Ziel muss eine Aktie sein.':'Verschmelzung: Das Ziel muss ein Fonds sein.');
  decimal(e.toQuantity,`${what}: neue Stückzahl`,{optional:e.ratio!=null,positive:true});
  decimal(e.ratio,`${what}: Verhältnis`,{optional:true,positive:true});
  decimal(e.price,`${what}: Kurs des Ziels`,{optional:true,positive:true});
  decimal(e.cash,`${what}: Barausgleich`,{optional:true});
  if(e.cash!=null&&D(e.cash)<0n)fail(`${what}: Der Barausgleich ist eine Zahlung an den Anleger und nicht negativ.`);
  if(kind==='stock'&&e.cash!=null&&D(e.cash)>0n&&e.price==null)fail('Aktientausch mit Barausgleich: Kurs der neuen Aktie eintragen; über 10 % des Börsenkurses gilt der Vorgang als Tausch.');
 }
 return true;
}

// Jahresabschluss je Person: Vorgänge, Kurse, Jahresdaten, Bescheinigungen und
// Abgleiche bis zum 31.12. des abgeschlossenen Jahres bleiben unverändert – sie
// tragen alle Folgejahre. Ein Vorgang ist gesperrt, sobald eine beteiligte Person
// das Jahr abgeschlossen hat (bei einer Schenkung Schenker oder Empfänger), ein
// Kurs, sobald eine Person mit diesem Wertpapier es abgeschlossen hat. Ein Jahr
// wird nur mit Begründung wieder geöffnet.
export const closedThrough=(s,personId)=>s.closing?.[personId]??null;
// Zusammenveranlagung gilt je Jahr und ist die Ausnahme: Eine der beiden Personen wählt sie in ihren Jahresdaten.
export function jointPartner(s,personId,year){
 const own=s.years?.[personId]?.[year]?.jointWith;if(own)return own;
 for(const [p,years] of Object.entries(s.years||{}))if(years?.[year]?.jointWith===personId)return p;
 return null;
}
const ownerOf=(s,depotId)=>s.depots.find(d=>d.id===depotId)?.personId;
export function eventPersons(s,e){
 const ids=new Set([ownerOf(s,e.depotId)]);
 if(e.toDepotId)ids.add(ownerOf(s,e.toDepotId));
 for(const id of [e.accountId,e.toAccountId,e.fx?.accountId])if(id)ids.add(accountHolder(s,(s.accounts||[]).find(a=>a.id===id))?.personId);
 ids.delete(undefined);return [...ids];
}
export function securityPersons(s,securityId){
 const ids=new Set();
 for(const e of s.events)if(e.securityId===securityId||e.toSecurityId===securityId)for(const p of eventPersons(s,e))ids.add(p);
 return [...ids];
}
const closedFor=(s,when,personIds)=>when==null?[]:[].concat(personIds??[]).filter(p=>{const y=closedThrough(s,p);return y!=null&&String(when)<=`${y}-12-31`;});
export const isClosed=(s,when,personIds)=>closedFor(s,when,personIds).length>0;
export const isEventClosed=(s,e)=>Boolean(e)&&isClosed(s,e.date,eventPersons(s,e));
function assertOpen(s,when,personIds,what){
 const hit=closedFor(s,when,personIds);
 if(hit.length)fail(`${what}: ${String(when).slice(0,4)} ist abgeschlossen (${hit.map(p=>s.persons.find(x=>x.id===p)?.name||'Person').join(', ')}). Zum Ändern das Jahr zuerst wieder öffnen.`);
}
const assertEventOpen=(s,e)=>{if(e)assertOpen(s,e.date,eventPersons(s,e),'Vorgang');};
function assertRecordOpen(s,collection,before,after){
 const when=r=>collection==='certificates'?String(r.year):collection==='ledgerChecks'||collection==='balanceChecks'?r.date:null;
 const who=r=>collection==='certificates'?[r.personId]:collection==='ledgerChecks'?[ownerOf(s,r.depotId)]:collection==='balanceChecks'?[accountHolder(s,(s.accounts||[]).find(a=>a.id===r.accountId))?.personId]:[];
 for(const r of [before,after])if(r)assertOpen(s,when(r),who(r),COLLECTIONS[collection]);
 // Währung, Kontoart und Depot tragen die Lose eines Kontos und bleiben mit Buchungen fest.
 if(collection==='accounts'&&before&&after&&(before.currency!==after.currency||before.kind!==after.kind||(before.depotId||null)!==(after.depotId||null)||(before.personId||null)!==(after.personId||null))&&s.events.some(e=>e.accountId===before.id||e.toAccountId===before.id||e.fx?.accountId===before.id))fail(`${before.name}: Währung, Kontoart, Depot und Inhaber bleiben fest, sobald Buchungen bestehen.`);
 if(!Object.keys(s.closing||{}).length||!before||!after)return;
 if(collection==='securities'&&before.kind!==after.kind&&s.events.some(e=>(e.securityId===before.id||e.toSecurityId===before.id)&&isEventClosed(s,e)))fail(`${before.name}: Die Wertpapierart trägt abgeschlossene Jahre. Zum Ändern das Jahr zuerst wieder öffnen.`);
 if(collection==='depots'&&before.personId!==after.personId&&s.events.some(e=>(e.depotId===before.id||e.toDepotId===before.id)&&isClosed(s,e.date,[...eventPersons(s,e),after.personId])))fail(`${before.name}: Der Inhaber trägt abgeschlossene Jahre. Zum Ändern das Jahr zuerst wieder öffnen.`);
 // Bank und Auslandskennzeichen ordnen Verlustbescheinigungen und den Steuerabzug zu – bei Depots wie bei eigenständigen Konten.
 if(collection==='accounts'&&(String(before.bank||'').trim()!==String(after.bank||'').trim()||Boolean(before.abroad)!==Boolean(after.abroad))&&s.events.some(e=>(e.accountId===before.id||e.toAccountId===before.id||e.fx?.accountId===before.id)&&isEventClosed(s,e)))fail(`${before.name}: Bank und ausländische Bank tragen abgeschlossene Jahre. Zum Ändern das Jahr zuerst wieder öffnen.`);
 if(collection==='depots'&&(String(before.bank||'').trim()!==String(after.bank||'').trim()||Boolean(before.abroad)!==Boolean(after.abroad))&&s.events.some(e=>(e.depotId===before.id||e.toDepotId===before.id)&&isEventClosed(s,e)))fail(`${before.name}: Bank und ausländische Bank tragen abgeschlossene Jahre. Zum Ändern das Jahr zuerst wieder öffnen.`);
}

// Änderungen laufen über diese Funktionen; jede hinterlässt einen Eintrag im
// Änderungsprotokoll mit vorherigem und neuem Stand.
export function withEvent(s,event,{reason=''}={}){
 const next=structuredClone(s),before=next.events.find(e=>e.id===event.id)||null,e={...structuredClone(event),id:event.id||uid()};
 validateEvent(next,e,null,{fresh:true});assertEventOpen(s,before);assertEventOpen(s,e);
 next.events=before?next.events.map(x=>x.id===e.id?e:x):[...next.events,e];
 next.audit.push({at:new Date().toISOString(),action:before?'Vorgang geändert':'Vorgang erfasst',ref:e.id,before,after:e,reason});
 validate(next);return next;
}
export function withoutEvent(s,id,{reason=''}={}){
 const next=structuredClone(s),before=next.events.find(e=>e.id===id);if(!before)fail('Vorgang nicht gefunden.');assertEventOpen(s,before);
 next.events=next.events.filter(e=>e.id!==id);next.audit.push({at:new Date().toISOString(),action:'Vorgang gelöscht',ref:id,before,after:null,reason});
 validate(next);return next;
}
// Viele Vorgänge auf einmal, etwa aus dem Excel-Import: einmal kopieren, jeden Vorgang wie im Formular prüfen, einmal
// validieren. Jeder bekommt seinen eigenen Protokolleintrag; importId verbindet sie, damit sich der Import als Ganzes
// zurücknehmen lässt. Alle oder keiner.
export function withEvents(s,events,{reason='',importId=null}={}){
 if(!events.length)fail('Keine Vorgänge zum Übernehmen.');
 const next=structuredClone(s),at=new Date().toISOString(),ids=new Set(next.events.map(e=>e.id));
 for(const x of events){
  const e={...structuredClone(x),id:x.id||uid()};
  if(ids.has(e.id))fail('Ein Vorgang mit dieser Kennung ist schon erfasst.');ids.add(e.id);
  validateEvent(next,e,null,{fresh:true});assertEventOpen(s,e);
  next.events.push(e);next.audit.push({at,action:'Vorgang erfasst',ref:e.id,before:null,after:e,reason,...(importId?{importId}:{})});
 }
 validate(next);return next;
}
export function withoutEvents(s,ids,{reason='',importId=null}={}){
 const set=new Set(ids),gone=s.events.filter(e=>set.has(e.id));if(!gone.length)fail('Vorgänge nicht gefunden.');
 for(const e of gone)assertEventOpen(s,e);
 const next=structuredClone(s),at=new Date().toISOString();next.events=next.events.filter(e=>!set.has(e.id));
 for(const e of gone)next.audit.push({at,action:'Vorgang gelöscht',ref:e.id,before:e,after:null,reason,...(importId?{importId}:{})});
 validate(next);return next;
}
export function withRecord(s,collection,record,{reason=''}={}){
 const next=structuredClone(s);if(collection==='balanceChecks')next.balanceChecks??=[];
 const list=next[collection];if(!Array.isArray(list))fail('Unbekannter Datenbereich.');
 const r={...structuredClone(record),id:record.id||uid()},before=list.find(x=>x.id===r.id)||null;
 assertRecordOpen(s,collection,before,r);
 next[collection]=before?list.map(x=>x.id===r.id?r:x):[...list,r];
 next.audit.push({at:new Date().toISOString(),action:`${COLLECTIONS[collection]||collection} ${before?'geändert':'angelegt'}`,collection,ref:r.id,before,after:r,reason});
 // Umbenannte Bank – bei Depots wie bei eigenständigen Währungskonten: Bescheinigungen offener Jahre ziehen mit,
 // solange kein anderes Depot und kein anderes eigenständiges Konto der Person den alten Namen trägt. Sonst
 // stünde der Steuerabzug in der alten Bescheinigung und zugleich unter dem neuen Namen.
 const bankName=x=>String(x?.bank||'').trim();
 if((collection==='depots'||collection==='accounts'&&!r.depotId&&!before?.depotId)&&before){
  const old=bankName(before),renamed=bankName(r),other=(list,c)=>(list||[]).some(x=>(c!==collection||x.id!==r.id)&&(c!=='accounts'||!x.depotId)&&x.personId===r.personId&&bankName(x)===old);
  if(old&&renamed&&old!==renamed&&!other(next.depots,'depots')&&!other(next.accounts,'accounts'))
   next.certificates=next.certificates.map(c=>{
    if(c.personId!==r.personId||c.bank?.trim()!==old||isClosed(s,String(c.year),[c.personId]))return c;
    const moved={...c,bank:renamed};next.audit.push({at:new Date().toISOString(),action:'Bankbescheinigung umbenannt',collection:'certificates',ref:c.id,before:c,after:moved,reason:`Bank ${old} heißt jetzt ${renamed}.`});return moved;
   });
 }
 validate(next);return next;
}
export function withoutRecord(s,collection,id){
 const next=structuredClone(s);
 if(collection==='persons'&&(next.depots.some(d=>d.personId===id)))fail('Person hat noch Depots.');
 if(collection==='persons'&&next.accounts.some(a=>!a.depotId&&a.personId===id))fail('Person hat noch Währungskonten.');
 if(collection==='persons'){
  const link=Object.entries(next.years||{}).flatMap(([p,ys])=>Object.entries(ys||{}).filter(([,v])=>v?.jointWith&&(p===id||v.jointWith===id)).map(([y,v])=>[y,p===id?v.jointWith:p]))[0];
  if(link)fail(`Person ist für die Zusammenveranlagung ${link[0]} mit ${next.persons.find(x=>x.id===link[1])?.name||'einer anderen Person'} gewählt. Erst die Wahl in den Jahresdaten ${link[0]} aufheben – ist das Jahr abgeschlossen, vorher wieder öffnen.`);
 }
 if(collection==='depots'&&next.events.some(e=>e.depotId===id||e.toDepotId===id))fail('Depot hat noch Vorgänge.');
 if(collection==='depots'&&next.accounts.some(a=>a.depotId===id))fail('Depot hat noch Währungskonten.');
 if(collection==='accounts'&&next.events.some(e=>e.accountId===id||e.toAccountId===id||e.fx?.accountId===id))fail('Währungskonto hat noch Buchungen.');
 if(collection==='accounts'&&(next.balanceChecks||[]).some(c=>c.accountId===id))fail('Währungskonto hat noch Kontostände laut Bank.');
 if(collection==='securities'&&(next.events.some(e=>e.securityId===id||e.toSecurityId===id)||next.prices.some(p=>p.securityId===id)))fail('Wertpapier wird noch verwendet.');
 const before=next[collection].find(x=>x.id===id);if(!before)fail('Eintrag nicht gefunden.');assertRecordOpen(s,collection,before,null);
 next[collection]=next[collection].filter(x=>x.id!==id);
 if(collection==='persons'){delete next.years[id];if(next.closing)delete next.closing[id];next.relations=next.relations.filter(r=>r.donorId!==id&&r.recipientId!==id);}
 next.audit.push({at:new Date().toISOString(),action:`${COLLECTIONS[collection]||collection} gelöscht`,collection,ref:id,before,after:null});
 validate(next);return next;
}
export function withYear(s,personId,year,values){
 assertOpen(s,String(year),[personId],'Jahresdaten');
 const before=jointPartner(s,personId,year),chosen=values.jointWith||null;
 for(const p of [before,chosen])if(p)assertOpen(s,String(year),[p],'Zusammenveranlagung');
 const next=structuredClone(s);next.years[personId]={...(next.years[personId]||{}),[year]:{...values,confirmedAt:new Date().toISOString()}};
 next.audit.push({at:new Date().toISOString(),action:'Jahresdaten bestätigt',ref:`${personId}:${year}`,before:s.years[personId]?.[year]||null,after:next.years[personId][year]});
 // Aufgehoben oder anders gewählt: Ein Eintrag beim bisherigen Ehegatten fällt mit weg.
 if(before&&before!==chosen&&next.years[before]?.[year]?.jointWith===personId){
  const was=next.years[before][year],{jointWith,...rest}=was;next.years[before][year]=rest;
  next.audit.push({at:new Date().toISOString(),action:'Jahresdaten bestätigt',ref:`${before}:${year}`,before:was,after:rest});
 }
 validate(next);return next;
}
// Bestätigte Jahresdaten zurücknehmen (etwa aus dem Protokoll): Das Jahr gilt danach wieder als unbestätigt.
export function withoutYear(s,personId,year,{reason=''}={}){
 assertOpen(s,String(year),[personId],'Jahresdaten');
 const before=s.years[personId]?.[year];if(!before)fail('Für dieses Jahr sind keine Jahresdaten bestätigt.');
 const next=structuredClone(s);delete next.years[personId][year];if(!Object.keys(next.years[personId]).length)delete next.years[personId];
 next.audit.push({at:new Date().toISOString(),action:'Jahresdaten zurückgenommen',ref:`${personId}:${year}`,before,after:null,reason});
 validate(next);return next;
}
// Jahreswerte eines Folgejahres für alle Personen: der Basiszins (als Anteil, 0.0253 für 2,53 %), sobald das BMF ihn
// veröffentlicht hat, und ein Sparer-Pauschbetrag nur, wenn der Gesetzgeber ihn ändert. Leer heißt: kein eigener Wert.
// Gesperrt, sobald eine Person das Jahr abgeschlossen hat.
export function withYearRules(s,year,{allowance=null,baseRate=null},{reason=''}={}){
 if(!Number.isInteger(year)||year<=Math.min(LAST_RULE_YEAR,LAST_RATE_YEAR))fail(`Für ${year} sind die Regeln in Depotklar hinterlegt.`);
 assertOpen(s,String(year),s.persons.map(p=>p.id),'Jahreswerte');
 const given=v=>v!=null&&v!=='',before=s.yearRules?.[year]||null,own=given(allowance)?String(allowance):null,rate=given(baseRate)?String(baseRate):null;
 if((before?.allowance??null)===own&&(before?.baseRate??null)===rate)return s;
 const next=structuredClone(s),rules={...(next.yearRules||{})},after=own==null&&rate==null?null:{...(own==null?{}:{allowance:own}),...(rate==null?{}:{baseRate:rate}),confirmedAt:new Date().toISOString()};
 if(after)rules[year]=after;else delete rules[year];
 if(Object.keys(rules).length)next.yearRules=rules;else delete next.yearRules;
 next.audit.push({at:new Date().toISOString(),action:'Jahreswerte geändert',ref:`rules:${year}`,before,after,reason});
 validate(next);return next;
}
// Umsatzsteuer-Umrechnungskurs eines Monats zentral pflegen, für alle Konten dieser Währung. Hinterlegte Monate sind fest.
export function withVatRate(s,currency,month,rate){
 if(!/^[A-Z]{3}$/.test(currency||'')||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))fail('USt-Umrechnungskurs: Währung oder Monat ungültig.');
 if(publishedVatRate(currency,month)!=null)fail(`${currency} ${month.slice(5)}/${month.slice(0,4)}: Der Kurs ist amtlich hinterlegt und lässt sich nicht ändern.`);
 const holders=[...new Set((s.accounts||[]).filter(a=>a.currency===currency&&a.vatBook).map(a=>accountHolder(s,a)?.personId).filter(Boolean))];
 assertOpen(s,`${month}-28`,holders,'USt-Umrechnungskurs');
 const next=structuredClone(s),old=next.vatRates?.[currency]?.[month]??null,remove=rate==null||rate==='';
 if(remove&&old==null)return s;
 const months={...(next.vatRates?.[currency]||{})};
 if(remove)delete months[month];else months[month]=String(rate);
 next.vatRates={...(next.vatRates||{}),[currency]:months};
 if(!Object.keys(months).length)delete next.vatRates[currency];
 if(!Object.keys(next.vatRates).length)delete next.vatRates;
 if(old===(remove?null:String(rate)))return s;
 next.audit.push({at:new Date().toISOString(),action:remove?'USt-Umrechnungskurs gelöscht':old?'USt-Umrechnungskurs geändert':'USt-Umrechnungskurs erfasst',ref:`vat:${currency}:${month}`,before:old?{rate:old}:null,after:remove?null:{rate:String(rate)}});
 validate(next);return next;
}
export function withPrice(s,securityId,date,price){
 assertOpen(s,date,securityPersons(s,securityId),'Kurs');
 const next=structuredClone(s),before=next.prices.find(p=>p.securityId===securityId&&p.date===date)||null,remove=price===''||price==null;
 next.prices=next.prices.filter(p=>!(p.securityId===securityId&&p.date===date));
 const after=remove?null:{securityId,date,price:String(price)};if(after)next.prices.push(after);
 if(before||after)next.audit.push({at:new Date().toISOString(),action:remove?'Kurs gelöscht':before?'Kurs geändert':'Kurs erfasst',ref:`${securityId}:${date}`,before,after});
 validate(next);return next;
}

// Vorabpauschale je Anteil laut Steuerinformation; gesperrt wie ein Kurs, sobald das Jahr des
// Zuflusses für eine Person mit diesem Wertpapier abgeschlossen ist.
export function withVapUnit(s,securityId,year,perUnit){
 const inflow=baseRateOf(s,year)?.inflow;if(!inflow)fail(`Für ${year} gibt es keine Vorabpauschale.`);
 assertOpen(s,inflow,securityPersons(s,securityId),'Vorabpauschale je Anteil');
 const next=structuredClone(s);next.vapUnits??=[];
 const before=next.vapUnits.find(u=>u.securityId===securityId&&u.year===year)||null,remove=perUnit===''||perUnit==null;
 next.vapUnits=next.vapUnits.filter(u=>!(u.securityId===securityId&&u.year===year));
 const after=remove?null:{securityId,year,perUnit:String(perUnit)};if(after)next.vapUnits.push(after);
 if(before||after)next.audit.push({at:new Date().toISOString(),action:remove?'Vorabpauschale je Anteil gelöscht':before?'Vorabpauschale je Anteil geändert':'Vorabpauschale je Anteil erfasst',ref:`${securityId}:${year}`,before,after});
 validate(next);return next;
}

// Schenkung an mehrere: alle Empfänger werden gemeinsam gespeichert oder gar nicht,
// in der Reihenfolge der Zeilen und zusammenhängend im Journal.
export function withBatch(s,batchId,events,{reason=''}={}){
 if(!batchId)fail('Schenkung an mehrere: Kennung fehlt.');
 if(!events.length)fail('Schenkung an mehrere: mindestens einen Empfänger angeben.');
 const next=structuredClone(s),before=next.events.filter(e=>e.batchId===batchId),at=new Date().toISOString();
 const list=events.map(x=>({...structuredClone(x),id:x.id||uid(),batchId})),keep=new Set(list.map(e=>e.id));
 for(const e of before)assertEventOpen(s,e);
 for(const e of list){validateEvent(next,e,null,{fresh:true});assertEventOpen(s,e);}
 for(const e of before.filter(e=>!keep.has(e.id)))next.audit.push({at,action:'Vorgang gelöscht',ref:e.id,before:e,after:null,reason});
 for(const e of list){const old=before.find(b=>b.id===e.id)||null;next.audit.push({at,action:old?'Vorgang geändert':'Vorgang erfasst',ref:e.id,before:old,after:e,reason});}
 const first=next.events.findIndex(e=>e.batchId===batchId),rest=next.events.filter(e=>e.batchId!==batchId);
 const pos=first<0?rest.length:next.events.slice(0,first).filter(e=>e.batchId!==batchId).length;
 next.events=[...rest.slice(0,pos),...list,...rest.slice(pos)];
 validate(next);return next;
}
export function withoutBatch(s,batchId,{reason=''}={}){
 const before=s.events.filter(e=>e.batchId===batchId);if(!before.length)fail('Vorgang nicht gefunden.');
 for(const e of before)assertEventOpen(s,e);
 const next=structuredClone(s),at=new Date().toISOString();next.events=next.events.filter(e=>e.batchId!==batchId);
 for(const e of before)next.audit.push({at,action:'Vorgang gelöscht',ref:e.id,before:e,after:null,reason});
 validate(next);return next;
}

// Eine Person bis einschließlich eines Jahres abschließen oder ab einem Jahr wieder öffnen.
// Wer durch einen Abschluss (oder ein Wiederöffnen) bis year mitgeht: der Ehegatte der betroffenen Jahre.
export function closingPartners(s,personId,year){
 const current=closedThrough(s,personId),back=current!=null&&(year==null||year<current),out=new Map();
 for(let y=back?(year??2017)+1:(current??2017)+1;y<=(back?current:year??2017);y++){
  const p=jointPartner(s,personId,y);if(!p)continue;
  const theirs=closedThrough(s,p);
  if(back){if(theirs!=null&&theirs>=y&&!out.has(p))out.set(p,y-1>=2018?y-1:null);}
  else if(theirs==null||theirs<y)out.set(p,y);
 }
 return out;
}
export function withClosing(s,personId,year,{reason=''}={}){
 if(!s.persons.some(p=>p.id===personId))fail('Person für den Jahresabschluss fehlt.');
 const current=closedThrough(s,personId);
 if(year!=null&&(!Number.isInteger(year)||year<2018))fail('Abschlussjahr ungültig.');
 if(year!=null&&year>=Number(today().slice(0,4)))fail('Ein Jahr lässt sich erst nach seinem Ende abschließen.');
 if(year===current)return s;
 const reopening=current!=null&&(year==null||year<current);
 if(reopening&&!String(reason).trim())fail('Zum Wiederöffnen einen Grund angeben.');
 const next=structuredClone(s);next.closing={...(next.closing||{})};
 const set=(id,to)=>{const was=next.closing[id]??null;if(to==null)delete next.closing[id];else next.closing[id]=to;const back=was!=null&&(to==null||to<was);next.audit.push({at:new Date().toISOString(),action:back?`Wieder geöffnet ab ${to==null?2018:to+1}`:`Abgeschlossen bis ${to}`,ref:`closing:${id}`,before:was,after:to,reason});};
 set(personId,year);
 // Zusammen veranlagte Ehegatten: Die Rechnung des einen hängt vom anderen ab, deshalb schließen und öffnen sie gemeinsam.
 for(const [p,to] of closingPartners(s,personId,year))set(p,to);
 validate(next);return next;
}
