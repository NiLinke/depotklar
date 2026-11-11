import {withEvent,withoutEvent,withEvents,withoutEvents,withBatch,withoutBatch,withRecord,withoutRecord,withRelation,withPrice,withVapUnit,withVatRate,withYearRules,withYear,withoutYear} from './model.mjs';

// Änderungen aus dem Protokoll zurücknehmen. Jeder Eintrag trägt den Stand vorher (before) und nachher (after);
// zurückgenommen wird über dieselben Funktionen wie jede Änderung: geprüft, in abgeschlossenen Jahren gesperrt
// und selbst wieder im Protokoll. Das Protokoll bleibt unverändert – auch die Rücknahme lässt sich zurücknehmen.
//
// undoPlan(s,index) sagt, was die Rücknahme täte, ohne etwas zu ändern: {ok,label,later,run} oder {ok:false,reason}.
// later zählt spätere Einträge zum selben Gegenstand; deren Änderungen gehen mit zurück.

const same=(x,y)=>JSON.stringify(x??null)===JSON.stringify(y??null);
const strip=({confirmedAt,...rest}={})=>rest;
const isEvent=a=>/^Vorgang /.test(a.action);

export function undoPlan(s,index){
 const a=s.audit[index];if(!a)return {ok:false,reason:'Protokolleintrag fehlt.'};
 const ref=String(a.ref??''),reason=`Zurückgenommen aus dem Protokoll (Eintrag vom ${String(a.at||'').slice(0,10).split('-').reverse().join('.')}: ${a.action})`;
 const later=s.audit.slice(index+1).filter(x=>String(x.ref??'')===ref&&(x.collection||null)===(a.collection||null)).length;
 const plan=(label,run)=>({ok:true,label,later,reason,run:t=>run(t,{reason})});
 if(ref==='closedThrough'||ref.startsWith('closing:'))return {ok:false,reason:'Abschluss und Wiederöffnen laufen über den Jahresabschluss, mit Grund.'};

 // Excel-Import: alle Vorgänge desselben Imports und Moments zusammen – Erfassung löschen, Löschung wiederherstellen.
 if(isEvent(a)&&a.importId){
  const group=s.audit.filter(x=>x.importId===a.importId&&x.at===a.at&&isEvent(x)),refs=new Set(group.map(x=>x.ref)),have=new Set(s.events.filter(e=>refs.has(e.id)).map(e=>e.id));
  const changedLater=s.audit.slice(index+1).filter(x=>refs.has(String(x.ref))&&x.at!==a.at).length;
  if(a.action==='Vorgang erfasst'){
   const ids=[...have];if(!ids.length)return {ok:false,reason:'Die Vorgänge dieses Imports sind schon gelöscht.'};
   return {...plan(`Import zurücknehmen: ${ids.length} ${ids.length===1?'Vorgang':'Vorgänge'} löschen`,(t,o)=>withoutEvents(t,ids,{...o,importId:a.importId})),later:changedLater};
  }
  if(a.action==='Vorgang gelöscht'){
   const back=group.map(x=>x.before).filter(e=>e&&!have.has(e.id));if(!back.length)return {ok:false,reason:'Die Vorgänge sind schon wieder da.'};
   return {...plan(`Gelöschten Import wiederherstellen: ${back.length} ${back.length===1?'Vorgang':'Vorgänge'}`,(t,o)=>withEvents(t,back,{...o,importId:a.importId})),later:changedLater};
  }
 }
 if(isEvent(a)){
  const record=a.before||a.after,batchId=record?.batchId;
  // Schenkung an mehrere: alle Empfänger desselben Moments zusammen, sonst passte die Aufteilung nicht mehr.
  if(batchId){
   const group=s.audit.filter(x=>x.at===a.at&&isEvent(x)&&(x.before||x.after)?.batchId===batchId),target=group.map(x=>x.before).filter(Boolean);
   const current=s.events.filter(e=>e.batchId===batchId);
   if(!target.length&&!current.length)return {ok:false,reason:'Die Schenkung ist schon gelöscht.'};
   if(same(target,current))return {ok:false,reason:'Die Schenkung hat schon diesen Stand.'};
   return plan(target.length?(current.length?'Schenkung an mehrere auf den Stand davor zurücksetzen':'Gelöschte Schenkung an mehrere wiederherstellen'):'Erfassung zurücknehmen: Schenkung an mehrere löschen',
    (t,o)=>target.length?withBatch(t,batchId,target,o):withoutBatch(t,batchId,o));
  }
  const now=s.events.find(e=>e.id===a.ref);
  if(!a.before){if(!now)return {ok:false,reason:'Der Vorgang ist schon gelöscht.'};return plan('Erfassung zurücknehmen: Vorgang löschen',(t,o)=>withoutEvent(t,a.ref,o));}
  if(same(now,a.before))return {ok:false,reason:'Der Vorgang hat schon diesen Stand.'};
  return plan(now?'Vorgang auf den Stand vor dieser Änderung zurücksetzen':'Gelöschten Vorgang wiederherstellen',(t,o)=>withEvent(t,a.before,o));
 }

 // Ältere Einträge nannten den Datenbereich nur im Text („securities geändert“).
 const collection=a.collection||(/^(persons|depots|accounts|securities|certificates|ledgerChecks|balanceChecks|priorGifts) (angelegt|geändert|gelöscht)$/.exec(a.action)?.[1]);
 if(collection){
  const list=s[collection]||[],now=list.find(x=>x.id===a.ref);
  if(!a.before){if(!now)return {ok:false,reason:'Der Eintrag ist schon gelöscht.'};return plan('Anlegen zurücknehmen: Eintrag löschen',t=>withoutRecord(t,collection,a.ref));}
  // Mit einer Person fallen ihre Jahresdaten, Abschlüsse und Verwandtschaften weg; das Protokoll hält sie nicht einzeln.
  if(collection==='persons'&&!now)return {ok:false,reason:'Eine gelöschte Person lässt sich nicht wiederherstellen: Ihre Jahresdaten wurden mit gelöscht. Bitte neu anlegen.'};
  if(same(now,a.before))return {ok:false,reason:'Der Eintrag hat schon diesen Stand.'};
  return plan(now?'Auf den Stand vor dieser Änderung zurücksetzen':'Gelöschten Eintrag wiederherstellen',(t,o)=>withRecord(t,collection,a.before,o));
 }

 // Verwandtschaftsverhältnis: auf die Art davor zurück oder wieder aufheben.
 if(ref.startsWith('relation:')){
  const rec=a.before||a.after;if(!rec?.donorId||!rec.recipientId)return {ok:false,reason:'Dieser Eintrag lässt sich nicht automatisch zurücknehmen.'};
  if(![rec.donorId,rec.recipientId].every(id=>s.persons.some(p=>p.id===id)))return {ok:false,reason:'Eine der beiden Personen gibt es nicht mehr.'};
  const now=s.relations.find(r=>r.donorId===rec.donorId&&r.recipientId===rec.recipientId)||null;
  if((now?.kind||null)===(a.before?.kind||null))return {ok:false,reason:'Das Verhältnis hat schon diesen Stand.'};
  return plan(a.before?'Verwandtschaft davor wiederherstellen':'Verwandtschaft aufheben',t=>withRelation(t,rec.donorId,rec.recipientId,a.before?.kind||null));
 }

 if(/^Kurs /.test(a.action)){
  const [id,date]=ref.split(':'),now=s.prices.find(p=>p.securityId===id&&p.date===date)?.price??null;
  if(same(now,a.before?.price??null))return {ok:false,reason:'Der Kurs hat schon diesen Stand.'};
  return plan(a.before?'Kurs davor wiederherstellen':'Kurs löschen',t=>withPrice(t,id,date,a.before?.price??null));
 }
 if(/^Vorabpauschale je Anteil /.test(a.action)){
  const [id,y]=ref.split(':'),year=Number(y),now=(s.vapUnits||[]).find(u=>u.securityId===id&&u.year===year)?.perUnit??null;
  if(same(now,a.before?.perUnit??null))return {ok:false,reason:'Der Wert hat schon diesen Stand.'};
  return plan(a.before?'Vorabpauschale je Anteil davor wiederherstellen':'Vorabpauschale je Anteil löschen',t=>withVapUnit(t,id,year,a.before?.perUnit??null));
 }
 if(/^USt-Umrechnungskurs /.test(a.action)){
  const [,currency,month]=ref.split(':'),now=s.vatRates?.[currency]?.[month]??null;
  if(same(now,a.before?.rate??null))return {ok:false,reason:'Der Kurs hat schon diesen Stand.'};
  return plan(a.before?'USt-Umrechnungskurs davor wiederherstellen':'USt-Umrechnungskurs löschen',t=>withVatRate(t,currency,month,a.before?.rate??null));
 }
 if(ref.startsWith('rules:')){
  const year=Number(ref.slice(6)),now=s.yearRules?.[year]||null,b=a.before||{};
  if(same(strip(now||{}),strip(b)))return {ok:false,reason:'Die Jahreswerte haben schon diesen Stand.'};
  return plan('Jahreswerte davor wiederherstellen',(t,o)=>withYearRules(t,year,{allowance:b.allowance??null,baseRate:b.baseRate??null},o));
 }
 if(a.action==='Jahresdaten bestätigt'||a.action==='Jahresdaten zurückgenommen'){
  const [personId,y]=ref.split(':'),year=Number(y),now=s.years[personId]?.[year]||null;
  if(!s.persons.some(p=>p.id===personId))return {ok:false,reason:'Die Person gibt es nicht mehr.'};
  if(same(now&&strip(now),a.before&&strip(a.before)))return {ok:false,reason:'Die Jahresdaten haben schon diesen Stand.'};
  return plan(a.before?'Jahresdaten davor wiederherstellen':'Bestätigung der Jahresdaten zurücknehmen',(t,o)=>a.before?withYear(t,personId,year,strip(a.before)):withoutYear(t,personId,year,o));
 }
 return {ok:false,reason:'Dieser Eintrag lässt sich nicht automatisch zurücknehmen.'};
}

export function undoAudit(s,index){
 const p=undoPlan(s,index);if(!p.ok)throw Error(p.reason);
 return p.run(s);
}
