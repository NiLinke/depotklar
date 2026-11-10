import {today,closedThrough} from '../core/model.mjs';
import {yearReport} from '../core/year.mjs';
import {replay} from '../core/ledger.mjs';
import {esc,field,statusLabel} from './format.mjs';

// Was vor dem Abschluss eines Jahres noch offen ist: Steuerjahre ohne Ergebnis und
// offene Angaben im Bestand, je Person ab ihrem ersten offenen Jahr. Ein Abschluss
// bleibt trotzdem möglich – er schützt den Stand, er bestätigt ihn nicht.
export function openPoints(s,personIds,toYear){
 const list=[];
 for(const p of s.persons.filter(x=>personIds.includes(x.id))){
  const from=(closedThrough(s,p.id)??2017)+1;
  for(let y=from;y<=toYear;y++){
   let r;try{r=yearReport(s,p.id,y);}catch(err){list.push(`${p.name} ${y}: ${err.message}`);continue;}
   if(r.status==='incomplete'||r.status==='unsupported')list.push(`${p.name} ${y}: ${statusLabel[r.status]}${r.reasons[0]?` – ${r.reasons[0].text}`:''}`);
  }
 }
 const first=new Map(s.depots.filter(d=>personIds.includes(d.personId)).map(d=>[d.id,(closedThrough(s,d.personId)??2017)+1]));
 try{for(const i of replay(s,{until:`${toYear}-12-31`}).issues)if(i.date&&first.has(i.depotId)&&Number(i.date.slice(0,4))>=first.get(i.depotId))list.push(i.reason);}catch(err){list.push(err.message);}
 return [...new Set(list)];
}

// Jahresabschluss je Person: Übersicht, Abschließen (eine oder alle Personen) und
// Wieder öffnen (eine Person, mit Grund).
export function closingHTML(s,{personId='',year=Number(today().slice(0,4))-1}={}){
 if(!s.persons.length)return '<p class="muted">Noch keine Personen angelegt.</p>';
 const current=Number(today().slice(0,4))-1,person=s.persons.find(p=>p.id===personId)||null;
 const selected=person?[person.id]:s.persons.map(p=>p.id);
 const first=Math.min(...selected.map(id=>(closedThrough(s,id)??2017)+1));
 const target=Math.min(Math.max(year,first),current);
 const options=[];for(let y=first;y<=current;y++)options.push(y);
 const status=`<div class="table-wrap"><table class="list"><thead><tr><th>Person</th><th>Abgeschlossen bis einschließlich</th></tr></thead><tbody>${s.persons.map(p=>{const c=closedThrough(s,p.id);return `<tr><td>${esc(p.name)}</td><td>${c==null?'<span class="muted">noch kein Jahr</span>':`<strong>${c}</strong>`}</td></tr>`;}).join('')}</tbody></table></div>`;
 const who=`<div class="grid"><label class="field"><span>Person</span><select data-closing-person><option value="">Alle Personen</option>${s.persons.map(p=>`<option value="${esc(p.id)}" ${p.id===personId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label></div>`;
 const pending=selected.filter(id=>(closedThrough(s,id)??2017)<target),open=options.length?openPoints(s,pending,target):[];
 const close=options.length?`<form data-form="closing"><h3>Abschließen</h3><input type="hidden" name="personId" value="${esc(person?.id||'')}"><p class="hint">Bis einschließlich des gewählten Jahres lassen sich für ${person?esc(person.name):'alle Personen'} Vorgänge, Kurse, Jahresdaten, Bankbescheinigungen und Buchhaltungssalden nicht mehr ändern – auch nicht versehentlich über ein Vorjahr. Eine Schenkung ist gesperrt, sobald Schenker oder Empfänger das Jahr abgeschlossen haben; ein Kurs, sobald eine Person mit diesem Wertpapier es abgeschlossen hat.</p>
  <div class="grid"><label class="field"><span>Abschließen bis einschließlich</span><select name="year" data-closing-year>${options.map(y=>`<option value="${y}" ${y===target?'selected':''}>${y}</option>`).join('')}</select></label></div>
  ${open.length?`<div class="notice"><strong>Noch offen bis ${target}</strong><ul>${open.slice(0,8).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>${open.length>8?`<p>${open.length-8} weitere.</p>`:''}<p>Der Abschluss ist trotzdem möglich; offene Werte bleiben dann offen.</p></div>`:`<p class="ok">Keine offenen Angaben bis ${target}.</p>`}
  <div class="actions"><span></span><button class="button primary">Abschließen</button></div></form>`:`<p class="muted">${person?esc(person.name)+' ist':'Alle Personen sind'} bis ${current} abgeschlossen. Das laufende Jahr lässt sich erst nach seinem Ende abschließen.</p>`;
 const closed=person?closedThrough(s,person.id):null,reopenYears=[];if(closed!=null)for(let y=2018;y<=closed;y++)reopenYears.push(y);
 const reopen=closed!=null?`<form data-form="reopen"><h3>Wieder öffnen</h3><input type="hidden" name="personId" value="${esc(person.id)}"><p class="hint">Öffnet für ${esc(person.name)} das gewählte Jahr und alle späteren. Der Grund steht im Protokoll.</p>
  <div class="grid"><label class="field"><span>Wieder öffnen ab</span><select name="year">${reopenYears.map(y=>`<option value="${y}" ${y===closed?'selected':''}>${y}</option>`).join('')}</select></label>${field('reason','Grund','','required maxlength="200" placeholder="z. B. Korrektur laut Steuerbescheid"')}</div>
  <div class="actions"><span></span><button class="button">Wieder öffnen</button></div></form>`:!person&&s.persons.some(p=>closedThrough(s,p.id)!=null)?'<p class="hint">Zum Wiederöffnen oben eine Person wählen.</p>':'';
 return `<div class="closing">${status}${who}${close}${reopen}</div>`;
}
