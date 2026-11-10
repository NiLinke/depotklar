import {D,S,mul,sum,round,SCALE} from '../core/decimal.mjs';
import {KINDS,GROUPS,REGIMES,regimeOf,groupOf,isFund,EXEMPTION,vapYears,vapInflow} from '../core/rules.mjs';
import {EVENT_TYPES,TRANSFER_KINDS,ALLOCATIONS,FX_KINDS,ACCOUNT_KINDS,TAX_PARTS,roundingOnly,afterExemption,substituteBase,foreignShare,kindWarning,withEvent,withRecord,withBatch,isClosed,isEventClosed,eventPersons,accountHolder,withholdingOf,uid,today,lastSelectableYear} from '../core/model.mjs';
import {saleLine} from '../core/statement.mjs';
import {fxReplay,eurValue} from '../core/fx.mjs';
import {replay} from '../core/ledger.mjs';
import {giftAssessments} from '../core/gifttax.mjs';
import {esc,money,euro,pieces,unit,date,field,select,check,decimalInput,inputValue} from './format.mjs';
import {ecbRate,hasRates,ratesUntil} from './fxrates.mjs';

export const ENTRY_TYPES=[['buy','Kauf'],['sell','Verkauf'],['transfer','Schenkung / Übertrag'],['giftBatch','Schenkung an mehrere'],['distribution','Ausschüttung / Dividende'],['interest','Zinsen'],['otherIncome','Sonstiger Ertrag'],['merger','Fondsverschmelzung'],['exchange','Aktientausch'],['split','Split'],['vap','Vorabpauschale laut Bank'],['fx','Währungskonto'],['opening','Bestand übernehmen'],['transition','Übergang 2017/2018'],['accumulation','Thesaurierung (altes Recht)']];
export const ENTRY_TITLES=Object.fromEntries(ENTRY_TYPES);
const HELP={
 buy:'Betrag laut Abrechnung in EUR, einschließlich Gebühren. Fonds ab 2009 lassen sich einzeln erfassen, ältere als Bestand zum 01.01.2018.',
 sell:'Erlös laut Abrechnung in EUR nach Gebühren. Den Steuerabzug der Bank für die Buchung und den Abgleich; ohne Angabe zeigt die Vorschau den rechnerischen Wert. Rückzahlung einer Anleihe ebenso; wertlos ausgebuchte Wertpapiere mit Erlös 0. Fondsverkäufe vor 2018 nach altem Recht: Gewinn laut Bank.',
 transfer:'Lose wandern mit ursprünglichem Erwerbsdatum, Anschaffungswert, Basis und Vorabpauschalen. Bei Schenkung den Kurs am Stichtag für die Schenkungsteuer.',
 giftBatch:'Ein Wertpapier am selben Tag an mehrere Empfänger – nach Stückzahl oder Verhältnis, die Lose nacheinander oder anteilig.',
 distribution:'Bruttobetrag in EUR. Mindert bei Fonds die Vorabpauschale des Jahres. Auch Zinsen (Kupon) einer Anleihe; gezahlte Stückzinsen negativ.',
 interest:'Zinsen vom Verrechnungs- oder Tagesgeldkonto bei der Bank dieses Depots. Bruttobetrag in EUR, voll steuerpflichtig.',
 otherIncome:'Kapitalertrag laut Abrechnung, den kein anderer Vorgang abdeckt, etwa der Verkauf von Bezugsrechten oder Optionsgeschäfte. Ein Verlust negativ. Voll steuerpflichtig im allgemeinen Verlusttopf, Depotklar rechnet ihn nicht nach.',
 exchange:'Aktien gegen Aktien durch Übernahme oder Verschmelzung der Gesellschaft: Lose gehen mit Anschaffungskosten und Erwerbsdatum über, auch Altaktien von vor 2009 (§ 20 Abs. 4a EStG).',
 fx:'Umtausch (auch in eine andere Fremdwährung), Gutschrift, Zahlung, Übertrag oder Schenkung auf einem Währungskonto, z. B. USD. Käufe, Verkäufe und Dividenden über das Konto beim jeweiligen Vorgang erfassen.',
 opening:'Für Bestände, deren Historie nicht einzeln erfasst wird. Fonds vor 2009 zum 01.01.2018; Fonds 2009–2017 wahlweise hier oder einzeln als Kauf.',
 transition:'Nur für einzeln erfasste Fondskäufe 2009–2017: Kurs 31.12.2017, fiktiver Gewinn 2017 und akkumulierte ausschüttungsgleiche Erträge der Position laut Bank.',
 accumulation:'Einzeln erfasste Fonds bis 2017: ausschüttungsgleiche Erträge eines thesaurierenden Fonds laut Bank. Erhöhen Anschaffungswert und steuerliche Basis; damit rechnet Depotklar den fiktiven Gewinn 2017 nach.',
 vap:'Nur nötig, wenn keine Jahreskurse erfasst sind oder der Bankwert abweicht. Der Bankwert hat Vorrang vor der Berechnung.',
 split:'Neue Stückzahl je alter Stückzahl, zum Beispiel 2 für 2 : 1. Werte bleiben unverändert.',
 merger:'Ein Fonds geht in einem anderen auf: Lose gehen mit Werten, Erwerbsdatum und Alt-Anteile-Status in den Zielfonds über (§ 23 InvStG). Liegt der Fonds in mehreren Depots, in jedem Depot einmal buchen.'
};

export function chooserHTML(depotId){
 return `<div class="chooser">${ENTRY_TYPES.map(([type,label])=>`<button class="choice" data-action="entry-type" data-type="${type}" data-depot="${esc(depotId||'')}"><strong>${esc(label)}</strong><small>${esc(HELP[type])}</small></button>`).join('')}</div>`;
}

export function draftFromEvent(e,s=null){
 if(e.batchId&&s)return batchDraft(s,e.batchId);
 const d={...e,oldIncomeNone:e.oldIncome==='0',costMode:'total'};
 // Ein Tausch von Aktien ist derselbe Vorgang wie eine Fondsverschmelzung, nur mit eigenem Formular.
 if(e.type==='merger'&&s?.securities.find(x=>x.id===e.securityId)?.kind==='stock')d.type='exchange';
 for(const k of ['quantity','amount','withheld','capitalTax','solidarity','churchTax','foreignTax','cost','price2017','deemed2017','oldIncome','vapBefore','price','ratio','toQuantity','cash','eur','rate','unitPrice','fees','deemedSold','gainBank','toAmount'])if(e[k]!=null)d[k]=inputValue(e[k]);
 if(e.unitPrice!=null)d.amountMode='unit';
 if(e.fx){d.fxAccount=e.fx.accountId;d.fxAmount=inputValue(e.fx.amount);d.fxRate=e.fx.rateSource==='ecb'?'':inputValue(e.fx.rate);}
 // Ein übernommener EZB-Kurs ist keine Eingabe: beim Speichern gilt der Kurs zum dann gewählten Datum.
 if(e.rateSource==='ecb')d.rate='';delete d.rateSource;delete d.rateDate;
 if(d.oldIncomeNone)d.oldIncome='';
 return d;
}
export function newDraft(type,depotId,s){
 if(type==='fx'){const a=(s.accounts||[]).find(x=>x.depotId===depotId)||(s.accounts||[])[0];return {type,accountId:a?.id||'',depotId:a?.depotId||depotId||'',date:today(),kind:'exchangeIn'};}
 const d={type,depotId:depotId||s.depots[0]?.id||'',date:type==='opening'?'2018-01-01':type==='transition'||type==='accumulation'?'2017-12-31':today(),costMode:'total',kind:'gift',group:'pre2009',year:new Date().getFullYear()-1};
 return d;
}
export function readDraft(form){
 const f=new FormData(form),d={};
 for(const [k,v] of f.entries())d[k]=typeof v==='string'?v:'';
 // Der Haken zählt nur, wenn er im Formular stand; sonst gilt die Vorbelegung des Wertpapiers.
 for(const k of ['oldIncomeNone'])if(form.querySelector(`[name="${k}"]`))d[k]=f.has(k);
 if(d.year)d.year=Number(d.year);
 // Zeilen der Schenkung an mehrere: row_<feld>_<nr>.
 const rows=[];for(const [k,v] of Object.entries(d)){const m=/^row_(\w+)_(\d+)$/.exec(k);if(m){(rows[Number(m[2])]??={})[m[1]]=v;delete d[k];}}
 if(form.querySelector('[data-rows]'))d.rows=rows.filter(Boolean);
 return d;
}

const securityOf=(s,d)=>d.securityId==='__new'?{id:'__new',kind:d.newKind||'equityFund',name:d.newName||'Neues Wertpapier',isin:d.newIsin||''}:s.securities.find(x=>x.id===d.securityId)||null;
const coverageFrom=(group,acquired)=>group==='from2018'?acquired||'2018-01-01':'2018-01-01';
// Ein Folgejahr ohne Basiszins zählt mit: Seine Vorabpauschale ist bis zur Bestätigung offen.
export const requiredVapYears=(group,acquired,stichtag,s=null)=>vapYears(s,stichtag).filter(r=>(r.rate==null||D(r.rate)>0n)&&r.inflow>coverageFrom(group,acquired)).map(r=>r.year);

// Übergang 2017/2018: Kurs der Kursseite und rechnerischer fiktiver Gewinn der einzeln
// erfassten Lose, die Ende 2017 noch im Depot liegen (Kurs × Stück − Anschaffungskosten
// − erfasste Thesaurierungen, auch die vom 31.12.2017).
function transitionFacts(s,d){
 const listed=s.prices.filter(p=>p.securityId===d.securityId&&p.date>='2017-12-01'&&p.date<='2017-12-31').sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.price??null;
 let price=null;try{price=decimalInput(d.price2017)??listed;}catch{price=listed;}
 if(!d.depotId||!d.securityId||price==null)return {listed,computed:null};
 let lots=[];try{lots=(replay(s,{until:'2017-12-31'}).positions.get(`${d.depotId}|${d.securityId}`)||[]).filter(l=>l.fromHistory&&D(l.quantity)>0n);}catch{}
 return {listed,computed:lots.length?S(round(sum(lots.map(l=>mul(D(l.quantity),D(price))-D(l.cost)-D(l.acc??'0'))))):null,accumulated:lots.length?S(sum(lots.map(l=>D(l.acc??'0')))):null};
}
function available(s,d){
 if(!d.depotId||!d.securityId||d.securityId==='__new'||!d.date)return null;
 const own=d.id||d.batchId?{...s,events:s.events.filter(e=>e.id!==d.id&&!(d.batchId&&e.batchId===d.batchId))}:s;
 try{const lots=replay(own,{until:d.date}).positions.get(`${d.depotId}|${d.securityId}`)||[];return S(lots.reduce((a,l)=>a+D(l.quantity),0n));}catch{return null;}
}

// Vorgänge in abgeschlossenen Jahren lassen sich ansehen, aber nicht ändern.
// Gesperrt ist ein Vorgang, sobald eine beteiligte Person sein Jahr abgeschlossen hat.
function lockedNotice(s,e){
 const year=e.date.slice(0,4),names=eventPersons(s,e).filter(p=>isClosed(s,e.date,[p])).map(p=>s.persons.find(x=>x.id===p)?.name).filter(Boolean);
 return `<div class="notice locked"><strong>${year} ist abgeschlossen${names.length?` für ${esc(names.join(', '))}`:''}.</strong> Der Vorgang lässt sich ansehen, aber nicht ändern. Zum Ändern das Jahr in der Übersicht unter „Jahresabschluss“ wieder öffnen.</div>`;
}
const formActions=(locked,del,label)=>locked?'<div class="actions"><span></span><button type="button" class="button" data-action="close">Schließen</button></div>':`<div class="actions">${del}<span></span><button type="button" class="button" data-action="close">Abbrechen</button><button class="button primary">${label}</button></div>`;

// Kauf und Verkauf: Betrag laut Abrechnung oder Kurs je Stück mit Gebühren. Gebühren
// erhöhen beim Kauf die Anschaffungskosten und mindern beim Verkauf den Erlös
// (§ 20 Abs. 4 S. 1 EStG); gerundet auf Cent.
const AMOUNT_MODES={buy:[['total','Betrag laut Abrechnung'],['unit','Kurs je Stück und Gebühren']],sell:[['total','Erlös laut Abrechnung'],['unit','Kurs je Stück und Gebühren']]};
export function tradeAmount(type,quantity,unitPrice,fees){
 const gross=mul(D(quantity),D(unitPrice)),f=fees==null?0n:D(fees),total=type==='sell'?gross-f:gross+f;
 if(total<0n)throw Error('Die Gebühren sind höher als der Kurswert.');
 return S(round(total));
}
// Steuerabzug laut Abrechnung je Steuerart. Ein älterer Eintrag mit nur der Summe bleibt,
// bis die drei Felder ausgefüllt werden.
function taxFields(d,hint){
 const legacy=d.withheld!=null&&d.withheld!==''&&!Object.keys(TAX_PARTS).some(k=>d[k]!=null&&d[k]!=='');
 return [field('capitalTax','Kapitalertragsteuer (optional)',d.capitalTax,'inputmode="decimal"',legacy?`Bisher nur als Summe erfasst: ${esc(d.withheld)} €. Einzeln eingetragen ersetzt das die Summe.`:`${hint}${d.type!=='accumulation'?' Nicht nötig, wenn die Jahressteuerbescheinigung der Bank erfasst wird – sie hat Vorrang.':''}`),
  field('solidarity','Solidaritätszuschlag',d.solidarity,'inputmode="decimal"'),
  field('churchTax','Kirchensteuer',d.churchTax,'inputmode="decimal"','Leer zählt als 0, sobald eines der drei Felder ausgefüllt ist.')];
}
// Akkumulierte ausschüttungsgleiche Erträge gibt es nur bei ausländischen thesaurierenden Fonds; bei
// deutschen Fonds (ISIN DE) hat die Fondsgesellschaft die Steuer jährlich einbehalten.
function oldIncomeField(d,sec){
 // Ein Haken aus einem anderen Wertpapier (Auswahl gewechselt) gilt nicht weiter.
 const german=/^DE/i.test(sec?.isin||''),own=d.oldIncomeFor==null||d.oldIncomeFor===sec?.id,none=(own?d.oldIncomeNone:undefined)??german;
 return `<div class="with-check"><input type="hidden" name="oldIncomeFor" value="${esc(sec?.id||'')}">${field('oldIncome','Akkumulierte ausschüttungsgleiche Erträge (gesamt)',none?'':d.oldIncome,`inputmode="decimal" ${none?'disabled':''}`,german?'Deutscher Fonds: keine – die Fondsgesellschaft hat die Steuer auf thesaurierte Erträge jährlich einbehalten.':'Nur bei ausländischen thesaurierenden Fonds: ausschüttungsgleiche Erträge bis 2017, auf die noch keine Kapitalertragsteuer einbehalten wurde – laut Bank. Sie sind keine Einkünfte des Verkaufsjahres: Die Bank holt beim Verkauf nur den Steuerabzug nach (§ 56 Abs. 3 S. 6 InvStG). Depotklar weist sie aus, rechnet sie aber nicht in die Steuer.')}${check('oldIncomeNone','keine – belegt',none)}</div>`;
}
function tradeFields(d,kind){
 // Anleihen notieren in Prozent vom Nennwert: nur mit dem Betrag laut Abrechnung, Stückzinsen nach BMF vom 14.05.2025, Rn. 50, 51.
 const bond=kind==='bond',mode=d.amountMode==='unit'&&!bond?'unit':'total',sell=d.type==='sell',how=bond?'':select('amountMode','Erfassen als',AMOUNT_MODES[d.type],mode,'data-rerender');
 if(mode==='total')return [`<div class="cost-row">${field('amount',sell?'Erlös EUR nach Gebühren':'Betrag EUR inkl. Gebühren',d.amount,'inputmode="decimal" required',bond?(sell?'Kurswert abzüglich Gebühren einschließlich erhaltener Stückzinsen, vor Steuern; auch die Rückzahlung bei Fälligkeit.':'Kurswert und Gebühren ohne Stückzinsen. Gezahlte Stückzinsen sind negative Einnahmen: unter „Ausschüttung / Dividende“ negativ erfassen.'):sell?'Kurswert abzüglich Provision und Gebühren laut Verkaufsabrechnung, vor Steuern.':'Endbetrag der Kaufabrechnung: Kurswert, Ausgabeaufschlag, Provision und Gebühren.')}${how}</div>`];
 return [`<div class="cost-row">${field('unitPrice','Kurs je Stück EUR',d.unitPrice,'inputmode="decimal" required',sell?'Ausführungskurs oder Rücknahmepreis.':'Ausführungskurs oder Ausgabepreis.')}${how}</div>`,
  field('fees','Gebühren EUR (optional)',d.fees,'inputmode="decimal"',sell?'Provision, Börsengebühren, Rücknahmeabschlag – sie mindern den Erlös. Ohne Gebühren fällt der Gewinn etwas zu hoch aus.':'Ausgabeaufschlag (falls nicht im Kurs enthalten), Provision, Börsengebühren – sie gehören zu den Anschaffungskosten.')];
}

export function entryFormHTML(s,d,error=''){
 if(d.type==='giftBatch')return batchFormHTML(s,d,error);
 if(d.type==='fx')return fxFormHTML(s,d,error);
 const type=d.type,sec=securityOf(s,d),kind=sec?.kind,original=d.id?s.events.find(e=>e.id===d.id):null,locked=isEventClosed(s,original);
 const depots=s.depots.map(x=>[x.id,`${x.name} · ${s.persons.find(p=>p.id===x.personId)?.name||''}`]);
 const merging=type==='merger'||type==='exchange',exchange=type==='exchange';
 // Verschmolzen oder getauscht wird nur, was schon im Depot liegt: ohne „neu anlegen“ beim bisherigen Wertpapier.
 const securities=[['','Wertpapier wählen'],...s.securities.filter(x=>!merging||(exchange?x.kind==='stock':isFund(x.kind))).map(x=>[x.id,`${x.name}${x.isin?' · '+x.isin:''}`]),...(merging?[]:[['__new','+ Neues Wertpapier anlegen']])];
 const fields=[];
 if(type==='transition')fields.push(`<input type="hidden" name="date" value="2017-12-31"><p class="hint">Stichtag 31.12.2017 (fiktive Veräußerung nach § 56 Abs. 2 InvStG).</p>`);
 else if(type==='merger')fields.push(field('date','Übertragungsstichtag',d.date,'type="date" required data-rerender','Laut Abrechnung, meist das Ende des Geschäftsjahres. Die neuen Anteile gelten ab dem Folgetag als erworben.'));
 else fields.push(field('date',type==='opening'?'Stichtag':'Datum',d.date,`type="date" required${type==='sell'?' data-rerender':''}`));
 // Zinsen können auch ohne Depot direkt auf ein Währungskonto gehen.
 fields.push(select('depotId','Depot',type==='interest'&&(s.accounts||[]).length?[['','Ohne Depot – Zinsen auf ein Währungskonto'],...depots]:depots,d.depotId,'data-rerender'));
 if(type!=='interest'&&type!=='otherIncome')fields.push(select('securityId',type==='merger'?'Fonds (bisher)':exchange?'Aktie (bisher)':'Wertpapier',securities,d.securityId,'data-rerender required'));
 if(d.securityId==='__new')fields.push(`<div class="inline-new">${field('newName','Name',d.newName,'required')}${field('newIsin','ISIN',d.newIsin,'maxlength="12"')}${select('newKind','Art',Object.entries(KINDS),d.newKind||'equityFund','data-rerender')}</div>`);
 if(type==='opening'){
  const group=d.group||'pre2009',legacy=isFund(kind)&&group!=='from2018';
  fields.push(field('quantity','Stückzahl am Stichtag',d.quantity,'inputmode="decimal" required'));
  fields.push(`<div class="cost-row">${field('cost',d.costMode==='unit'?'Anschaffungswert je Stück':'Anschaffungswert gesamt',d.cost,'inputmode="decimal"',d.costMode==='unit'?'Durchschnittlicher Ursprungspreis laut Buchhaltung; Depotklar multipliziert mit der Stückzahl.':'Ursprünglicher Anschaffungswert der verbliebenen Stücke laut Buchhaltung. Leer lassen, wenn unbekannt.')}${select('costMode','Eingabe als',[['total','Gesamtbetrag'],['unit','Betrag je Stück']],d.costMode,'data-rerender')}</div>`);
  fields.push(select('group','Erworben',Object.entries(GROUPS).map(([k,l])=>[k,l]),group,'data-rerender'));
  fields.push(field('acquired','Erwerbsdatum (falls bekannt)',d.acquired,'type="date"',kind==='commodity'?'Nötig für die Jahresfrist nach § 23 EStG; ohne Datum bleibt ein Verkauf offen.':group==='from2018'&&isFund(kind)?'Für Käufe im Jahr mindert der Erwerbsmonat die Vorabpauschale.':'Bestimmt die Reihenfolge beim Verkauf (älteste zuerst) und muss zur Erwerbsgruppe passen.'));
  if(legacy){
   fields.push(field('price2017','Kurs 31.12.2017 je Stück',d.price2017,'inputmode="decimal"','Letzter Rücknahmepreis 2017 (fiktive Veräußerung, § 56 Abs. 2 InvStG). Ergibt die steuerliche Basis ab 2018.'));
   if(group==='from2009'){
    let hint='Gewinn der fiktiven Veräußerung nach altem Recht, wie von der Bank mitgeteilt. Beim Verkauf steuerpflichtig ohne Teilfreistellung.';
    try{const q=decimalInput(d.quantity),p=decimalInput(d.price2017),c=decimalInput(d.cost);if(q&&p&&c){const cost=d.costMode==='unit'?mul(D(q),D(c)):D(c);hint+=` Rechnerisch (Kurs × Stück − Anschaffungswert): ${money(S(mul(D(q),D(p))-cost))} € – versteuerte Thesaurierungen mindern den Gewinn der Bank; nur übernehmen, wenn die Bank nichts anderes bescheinigt.`;}}catch{}
    fields.push(field('deemed2017','Fiktiver Gewinn 2017 (gesamt)',d.deemed2017,'inputmode="decimal"',hint));
   }
   fields.push(oldIncomeField(d,sec));
  }
  if(isFund(kind)&&d.date){
   const years=requiredVapYears(group,d.acquired,d.date,s);
   if(years.length)fields.push(field('vapBefore',`Bis zum Stichtag angesetzte Vorabpauschalen (${years.join(', ')})`,d.vapBefore,'inputmode="decimal"','Summe laut Jahressteuerbescheinigungen; 0 nur, wenn belegt.'));
  }
 }
 if(type==='buy'){fields.push(field('quantity','Stückzahl',d.quantity,'inputmode="decimal" required',kind==='bond'?'Stück oder Nennwert, wie in der Abrechnung.':''));fields.push(...tradeFields(d,kind));}
 if(type==='sell'){
  const avail=available(s,d);
  fields.push(field('quantity','Stückzahl',d.quantity,'inputmode="decimal" required',avail!=null?`Bestand am ${date(d.date)}: ${pieces(avail)} Stück · <button type="button" class="link" data-action="all" data-value="${esc(inputValue(avail))}">alle</button>`:''));
  fields.push(...tradeFields(d,kind));
  if(kind!=='commodity')fields.push(...taxFields(d,'Laut Abrechnung, für die Buchung und den Abgleich; eine Erstattung (Verlustverrechnung) negativ.'));
  if(d.date&&d.date>='2018-01-01'&&kind!=='commodity')fields.push(field('gainBank','Veräußerungsgewinn laut Abrechnung (optional)',d.gainBank,'inputmode="decimal"','Gewinn vor Teilfreistellung, Verlustverrechnung und Freistellungsauftrag – bei Fonds aus 2009–2017 einschließlich fiktivem Gewinn 2017. Nur zur Kontrolle: Depotklar zeigt die Abweichung zur eigenen Rechnung.'));
  // Fonds aus 2009–2017: der fiktive Gewinn 2017 der verkauften Stücke laut Verkaufsabrechnung.
  const legacy=isFund(kind)&&d.date>='2018-01-01'&&s.events.some(x=>x.securityId===d.securityId&&(x.type==='transition'||x.type==='opening'&&x.group==='from2009'||x.type==='buy'&&x.date<'2018-01-01'));
  if(legacy)fields.push(field('deemedSold','Gewinn aus fiktiver Veräußerung 2017 laut Abrechnung (optional)',d.deemedSold,'inputmode="decimal"','Für die verkauften Stücke. Nötig, wenn von mehreren Käufen 2009–2017 nur ein Teil verkauft wird; sonst rechnet Depotklar ihn aus dem Wert der Bank.'));
  if(isFund(kind)&&d.date&&d.date<'2018-01-01')fields.push(field('taxGainBank','Steuerlicher Gewinn laut Bank (altes Recht)',d.taxGainBank,'inputmode="decimal"','Laut Verkaufsabrechnung. Depotklar rechnet Fondsverkäufe vor 2018 nicht nach; ohne Angabe steht vereinfacht Erlös minus Anschaffungskosten und erfasste Thesaurierungen.'));
 }
 if(type==='transition'){
  const p=transitionFacts(s,d);
  fields.push(field('price2017','Kurs 31.12.2017 je Stück',d.price2017,'inputmode="decimal"',p.listed?`Leer lassen, dann gilt der Kurs der Kursseite: ${unit(p.listed)}.`:'Letzter Rücknahmepreis 2017. Alternativ auf der Kursseite in der Spalte 31.12.2017.'));
  fields.push(field('deemed2017','Fiktiver Gewinn 2017 der Position laut Bank',d.deemed2017,'inputmode="decimal"',`Gesamt für die am 31.12.2017 vorhandenen Stücke dieses Depots${p.computed!=null?` – rechnerisch ${money(p.computed)} € (Kurs × Stück − Anschaffungskosten${p.accumulated&&Number(p.accumulated)?` − ${money(p.accumulated)} € erfasste Thesaurierungen`:''}). Weicht der Bankwert ab, fehlen oft Thesaurierungen nach altem Recht`:''}.`));
  fields.push(oldIncomeField(d,sec));
 }
 if(type==='transfer'){
  const from=s.depots.find(x=>x.id===d.depotId),targets=s.depots.filter(x=>x.id!==d.depotId).map(x=>[x.id,`${x.name} · ${s.persons.find(p=>p.id===x.personId)?.name||''}`]);
  const to=s.depots.find(x=>x.id===d.toDepotId),own=from&&to&&from.personId===to.personId;
  const avail=available(s,d);
  fields.push(field('quantity','Stückzahl',d.quantity,'inputmode="decimal" required',avail!=null?`Bestand am ${date(d.date)}: ${pieces(avail)} Stück · <button type="button" class="link" data-action="all" data-value="${esc(inputValue(avail))}">alle</button>`:''));
  fields.push(select('toDepotId','An Depot',[['','Zieldepot wählen'],...targets],d.toDepotId,'data-rerender required'));
  if(own)fields.push(`<input type="hidden" name="kind" value="own"><p class="hint">Gleiche Person: Depotübertrag ohne Eigentümerwechsel.</p>`);
  else{fields.push(select('kind','Art',[['gift','Schenkung'],['inheritance','Erbschaft']],d.kind==='own'?'gift':d.kind,'data-rerender'));fields.push(field('price','Kurs am Stichtag je Stück',d.price,'inputmode="decimal"','Für die Schenkungsteuer: Börsenkurs bzw. Rücknahmepreis am Tag der Schenkung.'));}
 }
 if(type==='distribution'){
  fields.push(field('amount','Bruttobetrag EUR',d.amount,'inputmode="decimal" required',`Vor Abzug von Quellensteuer und Steuern – nicht der ausgezahlte Betrag.${kind==='bond'?' Zinsen (Kupon) der Anleihe. Beim Kauf gezahlte Stückzinsen negativ: Sie mindern die Einnahmen im Jahr der Zahlung (BMF vom 14.05.2025, Rn. 51).':''}${kind==='stock'?' Nur steuerpflichtige Dividenden. Eine Einlagenrückgewähr (steuerfrei aus dem steuerlichen Einlagekonto) mindert die Anschaffungskosten und ist in Depotklar noch nicht abgebildet – nicht als Dividende buchen.':''}`));
  fields.push(...taxFields(d,'Laut Abrechnung, nur für den Abgleich.'));
  fields.push(field('foreignTax','Anrechenbare ausländische Quellensteuer (optional)',d.foreignTax,'inputmode="decimal"',`Laut Abrechnung, in EUR, nur der anrechenbare Teil: nach den meisten Doppelbesteuerungsabkommen höchstens 15 % des Bruttobetrags (Schweiz: 35 % einbehalten, 15 % anrechenbar, den Rest erstattet die Schweiz auf Antrag). Angerechnet wird höchstens 25 % des steuerpflichtigen Ertrags – bei Fonds nach Teilfreistellung.${kind&&isFund(kind)?' Bei Fonds nur Quellensteuer auf die Ausschüttung selbst; Steuern, die der Fonds gezahlt hat, sind nicht anrechenbar.':''}`));
 }
 if(type==='interest'){
  fields.push(d.fxAccount?field('amount','Bruttobetrag EUR (optional)',d.amount,'inputmode="decimal"','Leer lassen, wenn die Steuer von der Gutschrift abgezogen ist: Dann gilt Gutschrift ÷ Kurs plus Steuer.'):field('amount','Bruttobetrag EUR',d.amount,'inputmode="decimal" required'));
  fields.push(...taxFields(d,'Laut Abrechnung, nur für den Abgleich.'));
 }
 if(type==='otherIncome'){
  fields.push(field('label','Bezeichnung',d.label,'required maxlength="100"','Worum es geht, zum Beispiel „Verkauf Bezugsrechte Fiktive AG“.'));
  fields.push(field('amount','Gewinn EUR laut Abrechnung, ein Verlust negativ',d.amount,'inputmode="decimal" required','Vor Steuern und Freistellungsauftrag.'));
  fields.push(...taxFields(d,'Laut Abrechnung, nur für den Abgleich; eine Erstattung negativ.'));
 }
 if(type==='vap'){
  // Hinterlegte Jahre und Folgejahre bis zum nächsten Zufluss – ein Bankwert gilt auch ohne bestätigten Basiszins.
  fields.push(select('year','Berechnungsjahr',vapYears(s,`${lastSelectableYear(s)+1}-12-31`).map(r=>[String(r.year),`${r.year} (Zufluss ${date(r.inflow)})`]),d.year));
  fields.push(field('amount','Vorabpauschale der Position laut Bank (EUR)',d.amount,'inputmode="decimal" required','Vor Teilfreistellung, für alle Stücke dieses Depots.'));
  fields.push(...taxFields(d,'Laut Steuerabrechnung zur Vorabpauschale, für den Abgleich.'));
 }
 if(type==='accumulation'){
  fields.push(field('amount','Ausschüttungsgleiche Erträge der Position EUR',d.amount,'inputmode="decimal" required','Laut Jahressteuerbescheinigung oder Ertragsmitteilung, für alle Stücke dieses Depots am Ende des Fondsgeschäftsjahres. Eine spätere Korrektur der Fondsgesellschaft als eigener Vorgang, gegebenenfalls negativ.'));
  fields.push(...taxFields(d,'Nur zur Information; Steuerjahre vor 2018 rechnet Depotklar nicht.'));
 }
 if(type==='split')fields.push(field('ratio','Neue Stück je bisherigem Stück',d.ratio,'inputmode="decimal" required'));
 if(merging){
  const avail=available(s,d);
  fields.push(select('toSecurityId',exchange?'Neue Aktie':'Zielfonds',[['',`${exchange?'Neue Aktie':'Zielfonds'} wählen`],...s.securities.filter(x=>x.id!==d.securityId&&(exchange?x.kind==='stock':isFund(x.kind))).map(x=>[x.id,`${x.name}${x.isin?' · '+x.isin:''}`]),['__new','+ Neues Wertpapier anlegen']],d.toSecurityId,'data-rerender required'));
  if(d.toSecurityId==='__new')fields.push(`<div class="inline-new">${field('newName','Name',d.newName,'required')}${field('newIsin','ISIN',d.newIsin,'maxlength="12"')}${exchange?'':select('newKind','Art',Object.entries(KINDS).filter(([k])=>isFund(k)),d.newKind||'equityFund','data-rerender')}</div>`);
  fields.push(field('toQuantity',`Neue Stückzahl laut Abrechnung`,d.toQuantity,'inputmode="decimal"',`${avail!=null?`Bisher ${pieces(avail)} Stück in diesem Depot. `:''}Gesamt für dieses Depot; oder unten das Verhältnis.`));
  fields.push(field('ratio',`Oder: neue Stück je bisherigem Stück`,d.ratio,'inputmode="decimal"'));
  const target=d.toSecurityId==='__new'?{kind:d.newKind||'equityFund'}:s.securities.find(x=>x.id===d.toSecurityId);
  const changesRate=!exchange&&kind&&target&&d.date>='2018-01-01'&&EXEMPTION[target.kind]!==EXEMPTION[kind];
  if(changesRate)fields.push(field('price','Rücknahmepreis des Zielfonds je Anteil am Tag',d.price,'inputmode="decimal" required',`Teilfreistellung bisher ${Number(EXEMPTION[kind])*100} %, im Zielfonds ${Number(EXEMPTION[target.kind])*100} %: Die Anteile gelten zu diesem Preis als verkauft und neu angeschafft. Der Gewinn bis hierher wird erst beim Verkauf versteuert, mit dem bisherigen Satz (§ 22 InvStG).`));
  fields.push(field('cash','Barausgleich EUR (optional)',d.cash,'inputmode="decimal" data-rerender',exchange?'Gilt als Dividende, auf Altaktien von vor 2009 nicht steuerbar. Über 10 % des Börsenkurses der neuen Aktien ist der ganze Vorgang ein Tausch: dann Verkauf und Kauf buchen.':'Laut Abrechnung. Gilt als Ausschüttung, mit der Teilfreistellung des bisherigen Fonds (§ 23 Abs. 3 InvStG).'));
  if(d.cash){
   if(exchange)fields.push(field('price','Kurs der neuen Aktie am Tag',d.price,'inputmode="decimal" required','Für die Grenze von 10 %.'));
   fields.push(...taxFields(d,'Steuerabzug auf den Barausgleich laut Abrechnung, nur für den Abgleich.'));
  }
 }
 if(['buy','sell','distribution','interest'].includes(type))fields.push(...linkedFxFields(s,d));
 fields.push(field('note','Beleg / Notiz (optional)',d.note,'maxlength="200"'));
 return `<form class="entry" data-form="entry" data-type="${esc(type)}" ${d.id?`data-id="${esc(d.id)}"`:''}>
  ${locked?lockedNotice(s,original):''}<p class="hint">${esc(HELP[type])}</p><fieldset class="grid" ${locked?'disabled':''}>${fields.join('')}</fieldset>
  <div id="entry-preview" class="preview">${previewHTML(s,d)}</div>
  ${error?`<p class="error">${esc(error)}</p>`:''}
  ${formActions(locked,d.id?`<button type="button" class="button danger" data-action="delete-event" data-id="${esc(d.id)}">Löschen</button>`:'',d.id?'Änderung speichern':'Speichern')}</form>`;
}

export function draftToEvent(s,d){
 const dec=k=>decimalInput(d[k]),need=(k,label)=>{const v=dec(k);if(v==null)throw Error(`${label} fehlt.`);return v;};
 // Steuerabzug: einzeln, leere Felder dann 0; sonst eine bisher erfasste Summe.
 const taxes=e=>{const v=Object.keys(TAX_PARTS).map(k=>[k,dec(k)]);if(v.some(([,x])=>x!=null))for(const [k,x] of v)e[k]=x??'0';else if(dec('withheld')!=null)e.withheld=dec('withheld');};
 if(d.type==='interest'){
  const e={id:d.id||uid(),type:'interest',date:d.date,...(d.depotId?{depotId:d.depotId}:{}),amount:'0'};
  taxes(e);if(d.note?.trim())e.note=d.note.trim();
  linkFx(s,e,d);
  // Ohne Bruttobetrag: netto auf das Währungskonto gutgeschrieben, Brutto ist der EUR-Wert der Gutschrift plus Steuerabzug.
  const entered=dec('amount'),net=e.fx?eurValue(e.fx.amount,{rate:e.fx.rate}):null,tax=withholdingOf(e).total;
  if(entered==null&&!e.fx)need('amount','Bruttobetrag');
  if(entered==null&&net==null)throw Error('Bruttobetrag fehlt: Ohne Devisenkurs lässt er sich nicht berechnen.');
  e.amount=entered??S(net+(tax==null?0n:D(tax)));
  return {event:e,newSecurity:null};
 }
 if(d.type==='fx')return {event:fxEvent(s,d),newSecurity:null};
 if(d.type==='otherIncome'){
  const e={id:d.id||uid(),type:'otherIncome',date:d.date,depotId:d.depotId,label:(d.label||'').trim(),amount:need('amount','Betrag')};
  taxes(e);if(d.note?.trim())e.note=d.note.trim();
  return {event:e,newSecurity:null};
 }
 let newSecurity=null,securityId=d.securityId;
 if(d.securityId==='__new'){
  if(!d.newName?.trim())throw Error('Name des neuen Wertpapiers fehlt.');
  const isin=(d.newIsin||'').trim().toUpperCase();
  if(isin&&s.securities.some(x=>x.isin===isin))throw Error(`ISIN ${isin} ist schon angelegt.`);
  newSecurity={id:uid(),isin,name:d.newName.trim(),kind:d.newKind||'equityFund'};securityId=newSecurity.id;
 }
 if(!securityId)throw Error('Wertpapier wählen.');
 const kind=newSecurity?.kind??s.securities.find(x=>x.id===securityId)?.kind;
 const merging=d.type==='merger'||d.type==='exchange';
 // Zielwertpapier neu anlegen: bei der Verschmelzung ein Fonds, beim Tausch eine Aktie.
 if(merging&&d.toSecurityId==='__new'){
  if(!d.newName?.trim())throw Error('Name des neuen Wertpapiers fehlt.');
  const isin=(d.newIsin||'').trim().toUpperCase();
  if(isin&&s.securities.some(x=>x.isin===isin))throw Error(`ISIN ${isin} ist schon angelegt.`);
  newSecurity={id:uid(),isin,name:d.newName.trim(),kind:d.type==='exchange'?'stock':d.newKind||'equityFund'};
 }
 const e={id:d.id||uid(),type:merging?'merger':d.type,date:d.date,depotId:d.depotId,securityId,...(d.note?.trim()?{note:d.note.trim()}:{})};
 if(d.type==='opening'){
  const q=need('quantity','Stückzahl'),c=dec('cost');
  Object.assign(e,{quantity:q,group:d.group||'pre2009',cost:c==null?null:d.costMode==='unit'?S(mul(D(q),D(c))):c});
  if(d.acquired)e.acquired=d.acquired;
  if(isFund(kind)&&e.group!=='from2018'){e.price2017=dec('price2017');e.oldIncome=d.oldIncomeNone?'0':dec('oldIncome');if(e.group==='from2009')e.deemed2017=dec('deemed2017');}
  if(isFund(kind)&&requiredVapYears(e.group,e.acquired,e.date,s).length)e.vapBefore=dec('vapBefore');
  for(const k of Object.keys(e))if(e[k]==null)delete e[k];
 }
 if(d.type==='transition'){
  e.date='2017-12-31';for(const k of ['price2017','deemed2017'])if(dec(k)!=null)e[k]=dec(k);
  const o=d.oldIncomeNone?'0':dec('oldIncome');if(o!=null)e.oldIncome=o;
 }
 if(d.type==='buy'||d.type==='sell'){
  e.quantity=need('quantity','Stückzahl');
  if(d.amountMode==='unit'){const p=need('unitPrice','Kurs je Stück'),f=dec('fees');e.unitPrice=p;if(f!=null)e.fees=f;e.amount=tradeAmount(d.type,e.quantity,p,f);}
  else e.amount=need('amount',d.type==='buy'?'Betrag':'Erlös');
  if(d.type==='sell')taxes(e);
  if(d.type==='sell'&&e.date<'2018-01-01'&&dec('taxGainBank')!=null)e.taxGainBank=dec('taxGainBank');
  if(d.type==='sell'&&e.date>='2018-01-01'&&dec('deemedSold')!=null)e.deemedSold=dec('deemedSold');
  if(d.type==='sell'&&e.date>='2018-01-01'&&dec('gainBank')!=null)e.gainBank=dec('gainBank');
 }
 if(d.type==='transfer'){e.quantity=need('quantity','Stückzahl');if(!d.toDepotId)throw Error('Zieldepot wählen.');e.toDepotId=d.toDepotId;e.kind=d.kind||'gift';if(e.kind!=='own'&&dec('price')!=null)e.price=dec('price');}
 if(d.type==='distribution'){e.amount=need('amount','Bruttobetrag');taxes(e);if(dec('foreignTax')!=null)e.foreignTax=dec('foreignTax');}
 if(d.type==='vap'){e.year=Number(d.year);e.amount=need('amount','Vorabpauschale');e.date=vapInflow(e.year)||e.date;taxes(e);}
 if(d.type==='accumulation'){e.amount=need('amount','Betrag');taxes(e);}
 if(d.type==='split')e.ratio=need('ratio','Verhältnis');
 if(merging){
  const to=newSecurity?.id??d.toSecurityId;if(!to)throw Error(d.type==='exchange'?'Neue Aktie wählen.':'Zielfonds wählen.');e.toSecurityId=to;
  const count=dec('toQuantity'),ratio=dec('ratio');if(count==null&&ratio==null)throw Error('Neue Stückzahl oder Verhältnis eintragen.');
  if(count!=null)e.toQuantity=count;else e.ratio=ratio;
  if(dec('price')!=null)e.price=dec('price');
  if(dec('cash')!=null&&D(dec('cash'))!==0n){e.cash=dec('cash');taxes(e);}
 }
 if(['buy','sell','distribution'].includes(d.type))linkFx(s,e,d);
 return {event:e,newSecurity};
}

// Wirkung vor dem Speichern: der Vorgang wird probehalber eingebucht und gerechnet.
export function apply(s,d){
 if(d.type==='giftBatch')return applyBatch(s,d);
 const {event,newSecurity}=draftToEvent(s,d);
 const base=newSecurity?withRecord(s,'securities',newSecurity):s,next=withEvent(base,event);
 // Ein Abgang über den Kontostand hinaus wird hier abgelehnt, auch wenn er erst später fehlt.
 if(event.type==='fx'||event.fx||s.events.find(e=>e.id===event.id)?.fx)fxReplay(next,{until:'9999-12-31'});
 const r=replay(next,{until:`${event.date.slice(0,4)}-12-31`});
 return {next,event,newSecurity,moves:r.moves.filter(m=>m.eventId===event.id),replayResult:r};
}

// Ein gesperrter Vorgang zeigt seine Wirkung trotzdem; gespeichert wird nur bei offenem Jahr.
const viewable=(s,events)=>events.some(e=>isEventClosed(s,e))?(({closing,...rest})=>rest)(s):s;

export function previewHTML(s,d){
 if(d.type==='giftBatch')return batchPreviewHTML(s,d);
 s=viewable(s,s.events.filter(e=>e.id===d.id));
 if(d.type==='fx')return fxPreviewHTML(s,d);
 if(d.type==='interest'){
  let r;try{r=apply(s,d);}catch(err){return `<p class="muted">${esc(err.message)}</p>`;}
  return `<dl class="figures"><div><dt>Steuerpflichtig</dt><dd>${euro(r.event.amount)}</dd></div><div><dt>Einordnung</dt><dd>Sonstige Kapitalerträge, keine Teilfreistellung</dd></div></dl>${fxEffect(r)}`;
 }
 if(d.type==='otherIncome'){
  let r;try{r=apply(s,d);}catch(err){return `<p class="muted">${esc(err.message)}</p>`;}
  return `<dl class="figures"><div><dt>${Number(r.event.amount)<0?'Verlust':'Steuerpflichtig'}</dt><dd>${euro(r.event.amount)}</dd></div><div><dt>Einordnung</dt><dd>Allgemeiner Verlusttopf, keine Teilfreistellung; Betrag laut Abrechnung, nicht nachgerechnet</dd></div></dl>`;
 }
 if(!d.date||!d.depotId||!d.securityId)return '<p class="muted">Vorschau erscheint, sobald Datum, Depot und Wertpapier gewählt sind.</p>';
 let result;try{result=apply(s,d);}catch(err){return `<p class="muted">${esc(err.message)}</p>`;}
 const {event,moves,next,replayResult}=result,m=moves[0],sec=next.securities.find(x=>x.id===event.securityId);
 if(!m)return '<p class="muted">Keine Wirkung auf den Bestand.</p>';
 const row=(label,value,extra='')=>`<div><dt>${esc(label)}</dt><dd>${value}${extra}</dd></div>`;
 const items=[];
 if(event.type==='opening'){
  const lot=replayResult.positions.get(`${event.depotId}|${event.securityId}`)?.find(l=>l.id===event.id);
  items.push(row('Wirtschaftlich',euro(m.economic)),row('Steuerlich',euro(m.tax)),row('Einordnung',esc(REGIMES[regimeOf(sec.kind,event.group)])));
  if(lot?.vapYears?.length)items.push(row('Vorabpauschalen enthalten',esc(lot.vapYears.join(', '))));
 }
 if(event.type==='accumulation')items.push(row('Anschaffungswert und steuerliche Basis steigen um',euro(m.economic)),row('Einordnung','Ausschüttungsgleicher Ertrag nach altem Recht – versteuert im Jahr des Zuflusses; Steuerjahre vor 2018 rechnet Depotklar nicht'));
 if(event.type==='buy')items.push(row('Anschaffungswert',euro(m.economic)),row('je Stück',euro(S(D(m.economic)*D('1')/D(event.quantity)))));
 if(event.type==='transition'){
  items.push(row('Kurs 31.12.2017',m.price==null?'Offen':`${unit(m.price)} je Stück`),row('Steuerliche Basis steigt um',euro(m.tax)),row('Fiktiver Gewinn laut Bank',euro(m.deemed)),row('Rechnerisch',euro(m.computedDeemed)));
  if(m.accumulated&&Number(m.accumulated))items.push(row('Darin abgezogene Thesaurierungen',euro(m.accumulated)));
  if(m.deemed!=null&&m.computedDeemed!=null)items.push(row('Abweichung Bank − Rechnung',euro(S(round(D(m.deemed))-D(m.computedDeemed)))));
 }
 if(event.type==='sell'&&m.sale.status==='historic'){
  items.push(row('Wirtschaftlicher Gewinn',euro(m.gainEconomic)),row(m.taxGainSource==='bank'?'Steuerlicher Gewinn laut Bank':'Steuerlich vereinfacht (Erlös − Anschaffungskosten und Thesaurierungen)',euro(m.gainTax)),row('Einordnung','Altes Recht vor 2018 – nicht nachgerechnet'));
 }
 else if(event.type==='sell'&&sec.kind==='commodity'){
  const sale=m.sale;
  if(event.unitPrice!=null)items.push(row('Erlös nach Gebühren',euro(event.amount)));
  items.push(row('Wirtschaftlicher Gewinn',euro(m.gainEconomic)),row('Gewinn nach § 23 EStG',euro(sale.privateGain)),row('Davon innerhalb eines Jahres, steuerbar',euro(sale.privateTaxable)),row('Einordnung','Privates Veräußerungsgeschäft, keine Abgeltungsteuer; Anlage SO, Freigrenze für alle privaten Veräußerungsgeschäfte des Jahres'));
  if(sale.reasons.length)items.push(`<div class="wide"><dt>Offen</dt><dd>${sale.reasons.map(r=>esc(r.reason)).join('<br>')}</dd></div>`);
 }
 else if(event.type==='sell'){
  const sale=m.sale;
  if(event.unitPrice!=null)items.push(row('Erlös nach Gebühren',euro(event.amount)));
  // Für die Buchung: woraus der wirtschaftliche Gewinn besteht und welche Steuern darauf entfallen.
  const b=saleLine(next,m),some=v=>v==null||D(v)!==0n;
  items.push(row('Abgang zum Buchwert',euro(b.book)),row('Wirtschaftlicher Gewinn',euro(m.gainEconomic)));
  if(some(b.free))items.push(row('darin steuerfreie Wertsteigerung bis 2017',euro(b.free),b.free==null?'<small>Anschaffungswert des Altbestands fehlt</small>':''));
  if(some(b.vap))items.push(row('darin schon versteuerte Vorabpauschalen',euro(b.vap),'<small>Erhöhen die Anschaffungskosten und mindern den Gewinn</small>'));
  items.push(row('Steuerlicher Gewinn vor Teilfreistellung',euro(sale.gross)));
  if(some(b.exempt))items.push(row('darin Teilfreistellung',euro(b.exempt)));
  items.push(row('Steuerpflichtig nach Teilfreistellung',euro(sale.taxable)));
  if(b.rest!=null&&D(b.rest)!==0n)items.push(row('Übrige Differenz zum wirtschaftlichen Gewinn',euro(b.rest),'<small>Durchschnitt gegen FIFO oder versteuerte Thesaurierungen</small>'));
  if(b.model)items.push(row('Kapitalertragsteuer rechnerisch',euro(b.model.capitalTax)),row('Solidaritätszuschlag rechnerisch',euro(b.model.solidarity)),row('Kirchensteuer rechnerisch',euro(b.model.churchTax),'<small>Auf diesen Verkauf allein, vor Verlustverrechnung und Freistellungsauftrag</small>'));
  else if(sale.taxable!=null)items.push(row('Steuer rechnerisch','Offen','<small>Kirchensteuersatz in den Jahresdaten bestätigen</small>'));
  if(event.gainBank!=null)items.push(row('Gewinn laut Abrechnung',euro(event.gainBank)),row('Abweichung Abrechnung − Depotklar',sale.gross==null?'offen':`${euro(S(D(event.gainBank)-D(sale.gross)))}${roundingOnly(event.gainBank,sale.gross)&&D(event.gainBank)!==D(sale.gross)?' · Rundung':afterExemption(event.gainBank,sale)?' · entspricht dem Gewinn nach Teilfreistellung – den Wert vor Teilfreistellung eintragen':substituteBase(event.gainBank,sale,event.amount,event.fees)?' · entspricht 30 % des Erlöses: Ersatzbemessungsgrundlage, weil der Bank die Anschaffungskosten fehlten – in der Steuererklärung korrigieren':''}`));
  if(sale.frozenGain&&Number(sale.frozenGain))items.push(row('darin aufgeschobener Gewinn aus der Verschmelzung',euro(sale.frozenGain),'<small>Mit der Teilfreistellung des alten Fonds (§ 22 InvStG)</small>'));
  if(sale.protectedEligible&&Number(sale.protectedEligible)>0)items.push(row('davon auf den Alt-Anteile-Freibetrag anrechenbar',euro(sale.protectedEligible)));
  if(sale.reasons.length)items.push(`<div class="wide"><dt>Offen</dt><dd>${sale.reasons.map(r=>esc(r.reason)).join('<br>')}</dd></div>`);
 }
 if(event.type==='transfer'){
  items.push(row('Wirtschaftlicher Abgang',euro(m.economic)),row('Steuerlicher Abgang',euro(m.tax)));
  if(m.marketValue)items.push(row('Wert am Stichtag',euro(m.marketValue)));
  if(event.kind==='gift'){
   const a=giftAssessments(next,replayResult.moves,m.personId,m.counterpartPersonId).acquisitions.find(x=>x.date===event.date);
   if(a)items.push(row('Schenkungsteuer',a.status==='supported'?euro(a.tax):'nicht ermittelt',a.status!=='supported'?`<small>${esc(a.reasons[0]?.text||'')}</small>`:a.priorValue!=null?`<small>Vorerwerbe 10 Jahre: ${euro(a.priorValue)} · Freibetrag ${euro(a.allowance)}</small>`:''));
  }
 }
 if(event.type==='distribution'){
  items.push(row('Steuerpflichtig nach Teilfreistellung',euro(m.income.taxable)),row('Teilfreistellung',`${Number(EXEMPTION[sec.kind])*100} %`));
  const f=foreignShare(event.foreignTax,event.amount);
  if(f)items.push(row('Quellensteuer',`${esc(f.percent.replace('.',','))} % des Bruttobetrags`,f.aboveTreaty?'<small>Meist sind höchstens 15 % anrechenbar; den Rest erstattet nur der Quellenstaat auf Antrag. Nur den anrechenbaren Teil laut Abrechnung eintragen.</small>':''));
 }
 if(event.type==='vap'){const v=replayResult.moves.find(x=>x.type==='vap'&&x.year===event.year&&x.depotId===event.depotId&&x.securityId===event.securityId);items.push(row('Laut Bank',euro(event.amount)),row(v?.computedFrom==='unit'?'Aus Steuerinformation je Anteil':'Aus Jahreskursen berechnet',v?.computed!=null?euro(v.computed):'keine Kurse und kein Wert je Anteil'));}
 if(event.type==='split'){
  const lots=replay(next,{until:event.date}).positions.get(`${event.depotId}|${event.securityId}`)||[];
  items.push(row('Stückzahl danach',pieces(S(lots.reduce((a,l)=>a+D(l.quantity),0n)))));
 }
 const merged=event.type==='merger'?mergerPreview(next,event,moves,replayResult,row):null;
 if(merged)items.push(...merged.items);
 const warning=kindWarning(sec);
 return `${warning?`<p class="notice">${esc(warning)}</p>`:''}${merged?.notes||''}<dl class="figures">${items.join('')}</dl>${fxEffect(result)}`;
}
// Verschmelzung und Tausch vor dem Speichern: was übergeht, was aufgeschoben wird und was noch zu tun ist.
function mergerPreview(s,e,moves,r,row){
 const out=moves.find(m=>m.direction==='out'),into=moves.find(m=>m.direction==='in'),cash=moves.find(m=>m.cash),source=s.securities.find(x=>x.id===e.securityId),target=s.securities.find(x=>x.id===e.toSecurityId),exchange=source.kind==='stock';
 const items=[row('Bisher',`${pieces(S(-D(out.quantity)))} Stück`),row(exchange?'Neue Aktien':'Neue Anteile',`${pieces(into.quantity)} Stück`),row('Wirtschaftlich unverändert',euro(into.economic))];
 if(into.frozenRate==null)items.push(row('Steuerlich unverändert',euro(into.tax)));
 else{items.push(row('Neue steuerliche Basis',euro(into.tax)));items.push(row('Aufgeschobener Gewinn',into.frozen==null?'Offen':euro(into.frozen),`<small>Wird erst beim Verkauf versteuert, Teilfreistellung ${Number(into.frozenRate)*100} % (§ 22 InvStG)</small>`));}
 if(cash)items.push(row('Barausgleich steuerpflichtig',euro(cash.income.taxable)));
 const lots=(r.positions.get(`${e.depotId}|${e.toSecurityId}`)||[]).filter(l=>l.history?.some(h=>h.eventId===e.id));
 if(lots.length)items.push(`<div class="wide"><dt>Lose im neuen Wertpapier</dt><dd>${lots.map(l=>esc(`${l.acquired?`Erwerb ${date(l.acquired)}`:`Erwerb ${GROUPS[l.group]}`} · ${pieces(l.quantity)} Stück`)).join('<br>')}</dd></div>`);
 const notes=[];
 if(!exchange){
  const y=e.date.slice(0,4),next=new Date(Date.UTC(Number(y),Number(e.date.slice(5,7))-1,Number(e.date.slice(8,10))+1)),month=next.getUTCMonth()+1;
  notes.push(e.date.endsWith('-12-31')?`Vorabpauschale ${y}: aus den Werten des bisherigen Fonds.`:`Vorabpauschale ${y}: nur auf den Zielfonds und zu ${13-month}/12 (BMF vom 21.05.2019, Rz. 23.19). Dafür erster und letzter Kurs ${y} des Zielfonds.`);
  // Grenzüberschreitend gilt § 23 InvStG nicht; die ISIN nennt den Staat des Fonds (Rz. 23.4 bis 23.6, 23.27).
  if(source.isin&&target.isin&&source.isin.slice(0,2)!==target.isin.slice(0,2))notes.push('Die ISINs nennen verschiedene Staaten. Grenzüberschreitend gilt § 23 InvStG nicht: Dann ist es ein Verkauf zum Tageswert und ein Neukauf (BMF vom 21.05.2019, Rz. 23.6, 23.27). Mit der Abrechnung vergleichen und gegebenenfalls stattdessen Verkauf und Kauf buchen.');
  const others=[...r.positions.entries()].filter(([k,list])=>{const [d,x]=k.split('|');return x===e.securityId&&d!==e.depotId&&list.some(l=>D(l.quantity)>0n);}).map(([k])=>s.depots.find(d=>d.id===k.split('|')[0])?.name).filter(Boolean);
  if(others.length)notes.push(`Der Fonds liegt auch in ${others.join(', ')}: Die Verschmelzung dort ebenfalls buchen.`);
 }
 return {items,notes:notes.map(n=>`<p class="notice info">${esc(n)}</p>`).join('')};
}
// ---------- Währungskonten ----------

// Konten der Person des Depots; ohne Depot (Zinsen direkt aufs Konto) alle Konten.
const accountsOf=(s,depotId)=>{const owner=s.depots.find(x=>x.id===depotId)?.personId;return (s.accounts||[]).filter(a=>!depotId||accountHolder(s,a)?.personId===owner);};
const accountLabel=(s,a)=>`${a.name} · ${a.currency}`;
const fxLabels=a=>({amount:`Betrag in ${a?.currency||'Währung'}`,rate:`Devisenkurs (${a?.currency||'Währung'} je 1 EUR)`});

// Käufe, Verkäufe, Dividenden und Zinsen, die über ein Währungskonto laufen.
function linkedFxFields(s,d){
 const list=accountsOf(s,d.depotId);if(!list.length)return [];
 // Ohne Depot gibt es nur den Weg über ein Konto.
 const chosen=d.fxAccount||(!d.depotId?list[0].id:''),a=list.find(x=>x.id===chosen),l=fxLabels(a);
 const out=[select('fxAccount',d.depotId?'Über Währungskonto':'Währungskonto',[...(d.depotId?[['','Nein, in EUR abgerechnet']]:[]),...list.map(x=>[x.id,d.depotId?accountLabel(s,x):`${accountLabel(s,x)} · ${s.persons.find(p=>p.id===accountHolder(s,x)?.personId)?.name||''}`])],chosen,'data-rerender')];
 if(a){
  const hint=d.type==='buy'?`Vom Konto abgegangen. Der EUR-Betrag oben gilt als Wert der ${a.currency} am Tag des Kaufs.`:d.type==='sell'?`Dem Konto gutgeschrieben. Der EUR-Erlös oben gilt als Wert der ${a.currency} am Tag des Verkaufs.`:`Netto gutgeschrieben, nach Steuern.`;
  out.push(field('fxAmount',l.amount,d.fxAmount,'inputmode="decimal" required',hint));
  if(d.type==='distribution'||d.type==='interest')out.push(field('fxRate',l.rate,d.fxRate,'inputmode="decimal"',`Laut Abrechnung, z. B. 1,0850. Ergibt den EUR-Wert der Gutschrift. ${ecbHint(a)}`));
  else out.push(field('fxRate',d.type==='sell'?`${l.rate} (nötig bei Steuerabzug)`:`${l.rate} (optional)`,d.fxRate,'inputmode="decimal"',d.type==='sell'?'Laut Abrechnung. Nötig, wenn beim Verkauf Steuer abgezogen oder erstattet wurde: Dann gilt Betrag ÷ Kurs als EUR-Wert der Gutschrift statt des EUR-Erlöses oben, gleich in welcher Währung die Steuer abging. Ohne Steuerabzug genügt der EUR-Erlös.':'Nur angeben, wenn die Bank Steuern oder andere Beträge in der Fremdwährung verrechnet hat. Dann gilt Betrag ÷ Kurs als EUR-Wert der Kontobewegung statt des EUR-Betrags oben.'));
 }
 return out;
}
// Ohne Kurs laut Abrechnung gilt der EZB-Referenzkurs; er wird mit Quelle und Kurstag gespeichert.
const ecbHint=a=>!a?'':hasRates(a.currency)?`Leer lassen, dann gilt der EZB-Referenzkurs des Tages (hinterlegt bis ${date(ratesUntil(a.currency))}).`:`Für ${esc(a.currency)} sind keine EZB-Kurse hinterlegt.`;
function ecbFields(currency,on){const r=on?ecbRate(currency,on):null;return r?{rate:r.rate,rateSource:'ecb',rateDate:r.date}:{};}
function linkFx(s,e,d){
 if(!d.fxAccount)return;
 const amount=decimalInput(d.fxAmount),rate=decimalInput(d.fxRate),a=(s.accounts||[]).find(x=>x.id===d.fxAccount);
 if(amount==null)throw Error('Betrag auf dem Währungskonto fehlt.');
 e.fx={accountId:d.fxAccount,amount};
 if(d.type==='distribution'||d.type==='interest'){if(rate!=null)e.fx.rate=rate;else if(a)Object.assign(e.fx,ecbFields(a.currency,e.date));}
 else if(rate!=null)e.fx.rate=rate;
}

function fxEvent(s,d){
 const a=(s.accounts||[]).find(x=>x.id===d.accountId);if(!a)throw Error('Währungskonto wählen.');
 const amount=decimalInput(d.amount);if(amount==null)throw Error(`Betrag in ${a.currency} fehlt.`);
 const e={id:d.id||uid(),type:'fx',kind:d.kind||'exchangeIn',date:d.date,...(a.depotId?{depotId:a.depotId}:{}),accountId:a.id,amount};
 if(['transfer','gift','inheritance','exchange'].includes(e.kind)){if(!d.toAccountId)throw Error('Zielkonto wählen.');e.toAccountId=d.toAccountId;}
 if(e.kind==='exchange'){const t=(s.accounts||[]).find(x=>x.id===d.toAccountId),to=decimalInput(d.toAmount);if(to==null)throw Error(`Betrag in ${t?.currency||'der Zielwährung'} fehlt.`);e.toAmount=to;}
 if(e.kind==='opening'&&d.acquired)e.acquired=d.acquired;
 // EUR-Wert laut Abrechnung, sonst Kurs laut Abrechnung, sonst EZB-Referenzkurs des Tages
 // (beim übernommenen Bestand des Anschaffungstags). Ein Übertrag zwischen unverzinsten
 // Konten braucht keinen EUR-Wert.
 const eur=decimalInput(d.eur),rate=decimalInput(d.rate),target=(s.accounts||[]).find(x=>x.id===e.toAccountId);
 const needed=e.kind!=='inheritance'&&(e.kind!=='transfer'||a.kind==='interest'||target?.kind==='interest');
 if(eur!=null)e.eur=eur;else if(rate!=null)e.rate=rate;else if(needed)Object.assign(e,ecbFields(a.currency,e.kind==='opening'?e.acquired:e.date));
 if(d.note?.trim())e.note=d.note.trim();
 return e;
}

export function fxFormHTML(s,d,error=''){
 const accounts=s.accounts||[],a=accounts.find(x=>x.id===d.accountId),original=d.id?s.events.find(e=>e.id===d.id):null,locked=isEventClosed(s,original);
 if(!accounts.length)return `<p class="hint">${esc(HELP.fx)}</p><div class="notice">Noch kein Währungskonto angelegt. In den Stammdaten unter „Währungskonten“ ein Konto anlegen – bei einem Depot oder als eigenes Konto mit Bank.</div><div class="actions"><span></span><button type="button" class="button" data-action="close">Schließen</button><button type="button" class="button primary" data-route="stammdaten">Zu den Stammdaten</button></div>`;
 const kind=d.kind||'exchangeIn',l=fxLabels(a),gratis=kind==='gift'||kind==='inheritance';
 const eurLabel={exchangeIn:'Bezahlt in EUR',exchangeOut:'Erhalten in EUR',exchange:'Wert des Tauschs in EUR',opening:'Anschaffungswert in EUR',gift:'Wert am Tag der Schenkung in EUR',inheritance:'Wert am Todestag in EUR (optional)'}[kind]||'Gegenwert in EUR';
 const fields=[field('date',kind==='opening'?'Stichtag':'Datum',d.date,'type="date" required'),
  select('accountId','Konto',accounts.map(x=>[x.id,`${accountLabel(s,x)} · ${s.persons.find(p=>p.id===accountHolder(s,x)?.personId)?.name||''}`]),d.accountId,'data-rerender'),
  select('kind','Bewegung',Object.entries(FX_KINDS),kind,'data-rerender'),
  field('amount',l.amount,d.amount,'inputmode="decimal" required'),
  field('eur',eurLabel,d.eur,'inputmode="decimal"',kind==='opening'?`Ursprünglicher EUR-Wert der übernommenen Beträge. Leer lassen, wenn unbekannt${a&&hasRates(a.currency)?' – mit Anschaffungstag gilt dann der EZB-Referenzkurs dieses Tages':''}.`:'Laut Abrechnung. Alternativ den Devisenkurs angeben.')];
 if(kind!=='opening')fields.push(field('rate',l.rate,d.rate,'inputmode="decimal"',`Nur nötig, wenn kein EUR-Betrag vorliegt. ${ecbHint(a)}`));
 if(kind==='opening')fields.push(field('acquired','Angeschafft am (falls bekannt)',d.acquired,'type="date"',a?.kind==='payment'?'Für die Jahresfrist nach § 23 EStG. Ohne Datum gilt der Bestand ein Jahr nach dem Stichtag sicher als außerhalb der Frist.':'Nur zur Dokumentation.'));
 // Umtausch in eine andere Fremdwährung: eigenes Konto der anderen Währung und der Betrag, der dort ankommt.
 if(kind==='exchange'){const who=x=>accountHolder(s,x)?.personId,t=accounts.find(x=>x.id===d.toAccountId);
  fields.push(select('toAccountId','In Konto',[['','Zielkonto wählen'],...accounts.filter(x=>a&&x.currency!==a.currency&&who(x)===who(a)).map(x=>[x.id,accountLabel(s,x)])],d.toAccountId||'','data-rerender'),
   field('toAmount',`Betrag in ${t?.currency||'der Zielwährung'}`,d.toAmount,'inputmode="decimal" required','Was auf dem Zielkonto ankommt, laut Abrechnung.'));}
 if(kind==='transfer'||gratis){const who=x=>accountHolder(s,x)?.personId,own=kind==='transfer';fields.push(select('toAccountId',own?'An Konto':'An Konto von',[['','Zielkonto wählen'],...accounts.filter(x=>x.id!==d.accountId&&x.currency===a?.currency&&a&&(who(x)===who(a))===own).map(x=>[x.id,own?accountLabel(s,x):`${accountLabel(s,x)} · ${s.persons.find(p=>p.id===who(x))?.name||''}`])],d.toAccountId||''));}
 fields.push(field('note','Beleg / Notiz (optional)',d.note,'maxlength="200"'));
 const rule=a&&kind==='exchange'?`<p class="hint wide">Ein Tausch: Die abgehende Währung gilt zum EUR-Wert des Tauschs als veräußert${a.kind==='payment'?' (steuerbar nur innerhalb eines Jahres nach der Anschaffung)':''}, das Zielkonto beginnt mit einem neuen Los zu diesem Wert und Tag. Leer gilt der EZB-Referenzkurs der abgehenden Währung.</p>`:a&&gratis?`<p class="hint wide">Das Zielkonto übernimmt Anschaffungstag und EUR-Wert der Beträge, die ältesten zuerst (§ 23 Abs. 1 S. 3 und § 20 Abs. 4 S. 6 EStG). Das ist keine Veräußerung.${kind==='gift'?' Der Wert am Tag der Schenkung zählt für die Schenkungsteuer; leer gilt der EZB-Referenzkurs des Tages.':''}</p>`:a?`<p class="hint wide">${esc(ACCOUNT_KINDS[a.kind])}. ${a.kind==='interest'?'Jeder Abgang ist eine Veräußerung; der Währungsgewinn ist Kapitalertrag.':`Steuerbar ist nur ein Abgang innerhalb eines Jahres nach der Anschaffung; verbraucht werden die ältesten Beträge zuerst.${kind==='transfer'?' Ein Übertrag auf ein verzinstes Konto gilt als Veräußerung und braucht den EUR-Wert.':''}`}</p>`:'';
 return `<form class="entry" data-form="entry" data-type="fx" ${d.id?`data-id="${esc(d.id)}"`:''}>${locked?lockedNotice(s,original):''}<p class="hint">${esc(HELP.fx)}</p>
  <fieldset class="grid" ${locked?'disabled':''}>${fields.join('')}${rule}</fieldset>
  <div id="entry-preview" class="preview">${fxPreviewHTML(s,d)}</div>${error?`<p class="error">${esc(error)}</p>`:''}
  ${formActions(locked,d.id?`<button type="button" class="button danger" data-action="delete-event" data-id="${esc(d.id)}">Löschen</button>`:'',d.id?'Änderung speichern':'Speichern')}</form>`;
}

// Fehlende EUR-Werte eines Währungskontos mit EZB-Referenzkursen ergänzen: nur Vorgänge
// ohne EUR-Betrag und ohne Kurs laut Abrechnung, nur in offenen Jahren. Jede Ergänzung
// läuft über withEvent und steht damit im Protokoll.
export function fillEcbRates(s,accountId){
 const a=(s.accounts||[]).find(x=>x.id===accountId);if(!a)throw Error('Währungskonto fehlt.');
 const ids=[...new Set(fxReplay(s,{until:'9999-12-31'}).issues.filter(i=>/EUR-Wert/.test(i.reason)&&(i.accountId===accountId||s.events.find(e=>e.id===i.eventId)?.toAccountId===accountId)).map(i=>i.eventId))];
 let next=s,filled=0,left=0;
 for(const id of ids){
  const e=next.events.find(x=>x.id===id),empty=v=>v==null||v==='';let changed=null;
  if(e&&!isEventClosed(next,e)){
   if(e.type==='fx'&&empty(e.eur)&&empty(e.rate)){const q=ecbFields(a.currency,e.kind==='opening'?e.acquired:e.date);if(q.rate)changed={...e,...q};}
   else if(e.fx&&(e.type==='distribution'||e.type==='interest')&&empty(e.fx.rate)){const q=ecbFields(a.currency,e.date);if(q.rate)changed={...e,fx:{...e.fx,...q}};}
  }
  if(changed){next=withEvent(next,changed,{reason:'EUR-Wert zum EZB-Referenzkurs ergänzt'});filled++;}else left++;
 }
 return {next,filled,left};
}

// Wirkung auf das Währungskonto: Bestand danach und bei Abgängen der Währungsgewinn.
function fxEffect(result){
 const e=result?.event;if(!e||(!e.fx&&e.type!=='fx'))return '';
 let r;try{r=fxReplay(result.next,{until:e.date});}catch(err){return `<p class="error">${esc(err.message)}</p>`;}
 const moves=r.moves.filter(m=>m.eventId===e.id),out=moves.find(m=>m.direction==='out'),own=out||moves[0];if(!own)return '';
 const row=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`,cur=own.currency;
 const quote=e.type==='fx'?e:e.fx,ecb=quote?.rateSource==='ecb'?row('Devisenkurs',`EZB ${esc(String(quote.rate).replace('.',','))} vom ${date(quote.rateDate)}`):'';
 const items=[ecb,row(`Bestand danach (${cur})`,pieces(own.balance)),row('Buchwert danach',euro(own.bookValue))].filter(Boolean);
 if(out?.realized){
  items.push(row('EUR-Wert des Abgangs',euro(out.proceeds)),row('Anschaffung (FIFO)',euro(out.cost)),row('Währungsgewinn',euro(out.gain)));
  items.push(row(out.regime==='capital'?'Kapitalertrag (§ 20 EStG)':'Davon innerhalb eines Jahres (§ 23 EStG)',out.regime==='capital'?euro(out.gain):euro(out.taxable)));
  const target=moves.find(m=>m.direction==='in'&&m.accountId!==out.accountId&&m.currency!==out.currency);
  if(target)items.push(row(`Zugang ${target.currency}`,`${pieces(target.amount)} · Bestand danach ${pieces(target.balance)}`));
 }else if(out){
  items.push(row(out.transferKind==='gift'?'Schenkung':out.transferKind==='inheritance'?'Erbschaft':'Übertrag','ohne Veräußerung, Beträge behalten Anschaffungstag und EUR-Wert'));
  if(out.transferKind==='gift')items.push(row('Wert für die Schenkungsteuer',euro(out.marketValue)));
 }
 return `<h4 class="sub">${esc(own.currency)}-Konto</h4><dl class="figures">${items.join('')}</dl>`;
}
function fxPreviewHTML(s,d){
 if(!d.date||!d.accountId)return '<p class="muted">Vorschau erscheint, sobald Datum und Konto gewählt sind.</p>';
 let r;try{r=apply(viewable(s,s.events.filter(e=>e.id===d.id)),d);}catch(err){return `<p class="muted">${esc(err.message)}</p>`;}
 return fxEffect(r)||'<p class="muted">Keine Wirkung.</p>';
}

// ---------- Schenkung an mehrere ----------

// Verteilung nach Verhältnis auf die Genauigkeit der Gesamtstückzahl (ganze Stück
// bei „3000“, drei Stellen bei „1234,567“). Reste nach dem größten Bruchteil,
// bei Gleichstand in der Reihenfolge der Zeilen; die Summe stimmt immer genau.
export function splitByRatio(total,weights){
 const T=D(total),W=sum(weights.map(D)),places=(String(total).split('.')[1]||'').length,step=SCALE/10n**BigInt(places);
 if(T<=0n||W<=0n)throw Error('Stückzahl und Anteile müssen größer als null sein.');
 const exact=weights.map(w=>T*D(w)/W),floor=exact.map(x=>x/step*step);
 let left=(T-sum(floor))/step;const order=exact.map((x,i)=>[x-floor[i],i]).sort((a,b)=>a[0]===b[0]?a[1]-b[1]:a[0]>b[0]?-1:1);
 for(const [,i] of order){if(left<=0n)break;floor[i]+=step;left--;}
 return floor.map(S);
}

export function batchDraft(s,batchId){
 const members=s.events.filter(e=>e.batchId===batchId),a=members[0];if(!a)throw Error('Vorgang nicht gefunden.');
 const ratio=members.every(m=>m.share!=null);
 return {type:'giftBatch',batchId,existing:true,date:a.date,depotId:a.depotId,securityId:a.securityId,kind:a.kind,price:inputValue(a.price),note:a.note||'',
  allocation:a.allocation,mode:ratio?'ratio':'quantity',total:inputValue(S(sum(members.map(m=>D(m.quantity))))),
  rows:members.map(m=>({id:m.id,toDepotId:m.toDepotId,value:inputValue(ratio?m.share:m.quantity)}))};
}

export function batchEvents(s,d){
 if(!d.depotId)throw Error('Depot wählen.');if(!d.securityId)throw Error('Wertpapier wählen.');
 const rows=(d.rows||[]).filter(r=>r.toDepotId||String(r.value||'').trim());
 if(!rows.length)throw Error('Mindestens einen Empfänger angeben.');
 if(rows.some(r=>!r.toDepotId))throw Error('Für jede Zeile ein Zieldepot wählen.');
 const values=rows.map(r=>{const v=decimalInput(r.value);if(v==null||D(v)<=0n)throw Error(d.mode==='ratio'?'Jeder Empfänger braucht einen Anteil größer null.':'Jeder Empfänger braucht eine Stückzahl größer null.');return v;});
 let quantities=values;
 if(d.mode==='ratio'){const total=decimalInput(d.total);if(total==null)throw Error('Stückzahl insgesamt fehlt.');quantities=splitByRatio(total,values);}
 if(quantities.some(q=>D(q)<=0n))throw Error('Ein Anteil ist so klein, dass auf den Empfänger kein Stück entfällt.');
 const batchId=d.batchId||uid(),price=decimalInput(d.price);
 const events=rows.map((r,i)=>{
  const e={id:r.id||uid(),type:'transfer',date:d.date,depotId:d.depotId,securityId:d.securityId,toDepotId:r.toDepotId,quantity:quantities[i],kind:d.kind||'gift',batchId,allocation:d.allocation||'sequence'};
  if(d.mode==='ratio')e.share=values[i];if(price!=null)e.price=price;if(d.note?.trim())e.note=d.note.trim();return e;
 });
 return {batchId,events};
}

export function applyBatch(s,d){
 const {batchId,events}=batchEvents(s,d),next=withBatch(s,batchId,events);
 const r=replay(next,{until:`${d.date.slice(0,4)}-12-31`});
 return {next,events,batchId,replayResult:r,moves:r.moves.filter(m=>events.some(e=>e.id===m.eventId))};
}

const mixOf=lots=>{
 const by=new Map();for(const l of lots){const k=l.group==='from2018'?(l.acquired?l.acquired.slice(0,4):'ab 2018'):GROUPS[l.group];by.set(k,(by.get(k)||0n)+D(l.quantity));}
 return [...by].map(([k,q])=>`${pieces(S(q))} · ${k}`).join('<br>');
};

export function batchPreviewHTML(s,d){
 s=viewable(s,s.events.filter(e=>d.batchId&&e.batchId===d.batchId));
 if(!d.date||!d.depotId||!d.securityId)return '<p class="muted">Vorschau erscheint, sobald Datum, Depot und Wertpapier gewählt sind.</p>';
 let r;try{r=applyBatch(s,d);}catch(err){return `<p class="muted">${esc(err.message)}</p>`;}
 const person=id=>s.persons.find(p=>p.id===id)?.name||'',depot=id=>s.depots.find(x=>x.id===id);
 const rows=r.events.map(e=>{
  const m=r.moves.find(x=>x.eventId===e.id&&x.direction==='out');if(!m)return '';
  const a=e.kind==='gift'?giftAssessments(r.next,r.replayResult.moves,m.personId,m.counterpartPersonId).acquisitions.find(x=>x.date===e.date):null;
  return `<tr><td>${esc(depot(e.toDepotId)?.name)}<small>${esc(person(depot(e.toDepotId)?.personId))}</small></td><td class="num">${pieces(e.quantity)}</td><td>${mixOf(m.consumed)}</td><td class="num">${money(m.economic==null?null:S(-D(m.economic)))}</td><td class="num">${money(m.tax==null?null:S(-D(m.tax)))}</td><td class="num">${money(m.marketValue,'—')}</td><td class="num">${a?a.status==='supported'?money(a.tax):`<span title="${esc(a.reasons[0]?.text||'')}">offen</span>`:'—'}</td></tr>`;
 }).join('');
 const total=S(sum(r.events.map(e=>D(e.quantity))));
 return `<div class="table-wrap"><table class="list compact"><thead><tr><th>Empfänger</th><th class="num">Stück</th><th>Erwerb der Lose</th><th class="num">Wirtschaftlich</th><th class="num">Steuerlich</th><th class="num">Wert am Stichtag</th><th class="num">Schenkungsteuer</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Zusammen</td><td class="num">${pieces(total)}</td><td colspan="5"></td></tr></tfoot></table></div>`;
}

export function batchFormHTML(s,d,error=''){
 const members=d.batchId?s.events.filter(e=>e.batchId===d.batchId):[],locked=members.some(e=>isEventClosed(s,e));
 const from=s.depots.find(x=>x.id===d.depotId),owner=from?.personId;
 const depots=s.depots.map(x=>[x.id,`${x.name} · ${s.persons.find(p=>p.id===x.personId)?.name||''}`]);
 const targets=[['','Zieldepot wählen'],...s.depots.filter(x=>x.personId!==owner).map(x=>[x.id,`${x.name} · ${s.persons.find(p=>p.id===x.personId)?.name||''}`])];
 const securities=[['','Wertpapier wählen'],...s.securities.map(x=>[x.id,`${x.name}${x.isin?' · '+x.isin:''}`])];
 const mode=d.mode||'quantity',rows=d.rows?.length?d.rows:[{},{}],avail=available(s,d);
 const fields=[
  field('date','Datum',d.date,'type="date" required'),
  select('depotId','Von Depot',depots,d.depotId,'data-rerender'),
  select('securityId','Wertpapier',securities,d.securityId,'data-rerender required'),
  select('kind','Art',[['gift','Schenkung'],['inheritance','Erbschaft']],d.kind==='inheritance'?'inheritance':'gift'),
  field('price','Kurs am Stichtag je Stück',d.price,'inputmode="decimal"','Für die Schenkungsteuer: Börsenkurs bzw. Rücknahmepreis am Tag der Schenkung.'),
  select('mode','Aufteilen nach',[['quantity','Stückzahl je Empfänger'],['ratio','Verhältnis']],mode,'data-rerender')];
 if(mode==='ratio')fields.push(field('total','Stück insgesamt',d.total,'inputmode="decimal" required',avail!=null?`Bestand am ${date(d.date)}: ${pieces(avail)} Stück · <button type="button" class="link" data-action="all" data-target="total" data-value="${esc(inputValue(avail))}">alle</button>`:''));
 fields.push(select('allocation','Lose zuteilen',Object.entries(ALLOCATIONS),d.allocation||'sequence','data-rerender'));
 const allocationHint=(d.allocation||'sequence')==='prorata'?'Jeder Empfänger erhält denselben Mix aus allen abgehenden Losen. Nur wählen, wenn die Bank so umgebucht hat.':'Die erste Zeile erhält die ältesten Lose, die nächste die folgenden – wie bei einzelnen Bankaufträgen in dieser Reihenfolge.';
 const table=`<div class="batch" data-rows><table class="rows"><thead><tr><th>#</th><th>An Depot</th><th class="num">${mode==='ratio'?'Anteil':'Stück'}</th><th></th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}${r.id?`<input type="hidden" name="row_id_${i}" value="${esc(r.id)}">`:''}</td><td><select name="row_toDepotId_${i}" aria-label="Zieldepot ${i+1}">${targets.map(([v,l])=>`<option value="${esc(v)}" ${v===(r.toDepotId||'')?'selected':''}>${esc(l)}</option>`).join('')}</select></td><td><input name="row_value_${i}" value="${esc(r.value||'')}" inputmode="decimal" aria-label="${mode==='ratio'?'Anteil':'Stück'} ${i+1}" placeholder="${mode==='ratio'?'z. B. 1':'Stück'}"></td><td class="row-tools"><button type="button" class="icon" data-action="batch-row-up" data-index="${i}" aria-label="Nach oben" ${i?'':'disabled'}>↑</button><button type="button" class="icon" data-action="batch-row-remove" data-index="${i}" aria-label="Zeile entfernen">×</button></td></tr>`).join('')}</tbody></table><button type="button" class="link" data-action="batch-row-add">+ Empfänger</button>${mode==='ratio'?'<small>Verhältnis frei wählbar: 1 : 1 : 2, Prozent oder Bruchteile. Depotklar rundet auf die Genauigkeit der Gesamtstückzahl, die Summe stimmt immer.</small>':''}</div>`;
 return `<form class="entry" data-form="entry" data-type="giftBatch">${locked?lockedNotice(s,members.find(e=>isEventClosed(s,e))):''}<p class="hint">${esc(HELP.giftBatch)}</p>
  <fieldset class="grid" ${locked?'disabled':''}>${fields.join('')}<p class="hint wide">${esc(allocationHint)}</p>${table}${field('note','Beleg / Notiz (optional)',d.note,'maxlength="200"')}</fieldset>
  <div id="entry-preview" class="preview">${batchPreviewHTML(s,d)}</div>
  ${error?`<p class="error">${esc(error)}</p>`:''}
  ${formActions(locked,d.existing?`<button type="button" class="button danger" data-action="delete-event" data-batch="${esc(d.batchId)}">Alle löschen</button>`:'',d.existing?'Änderung speichern':'Speichern')}</form>`;
}
export {EVENT_TYPES,TRANSFER_KINDS,groupOf};
