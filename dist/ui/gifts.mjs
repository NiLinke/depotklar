import {replay} from '../core/ledger.mjs';
import {fxReplay} from '../core/fx.mjs';
import {giftAssessments,remainingAllowance} from '../core/gifttax.mjs';
import {RELATIONS,GIFT_TAX_YEARS,GIFT_SOURCES} from '../core/rules.mjs';
import {today,lastSelectableYear} from '../core/model.mjs';
import {esc,euro,date,field,select,statusBadge} from './format.mjs';

export function giftsHTML(s){
 const asOf=today(),until=`${lastSelectableYear(s)}-12-31`,moves=[...replay(s,{until}).moves,...fxReplay(s,{until}).moves],name=id=>s.persons.find(p=>p.id===id)?.name||'Unbekannt';
 const pairs=new Map();
 const add=(d,r)=>{if(d&&r&&d!==r)pairs.set(`${d}|${r}`,[d,r]);};
 for(const r of s.relations)add(r.donorId,r.recipientId);
 for(const m of moves)if((m.type==='transfer'||m.type==='fx')&&m.direction==='out'&&m.transferKind==='gift')add(m.personId,m.counterpartPersonId);
 for(const g of s.priorGifts)add(g.donorId,g.recipientId);
 const cards=[...pairs.values()].map(([donor,recipient])=>{
  const a=giftAssessments(s,moves,donor,recipient),rest=remainingAllowance(s,moves,donor,recipient,asOf);
  const relation=s.relations.find(r=>r.donorId===donor&&r.recipientId===recipient);
  const rows=a.acquisitions.map(g=>`<tr><td>${date(g.date)}</td><td>${g.parts.map(p=>p.source==='depot'?esc(`${s.securities.find(x=>x.id===p.securityId)?.name} · ${p.quantity} Stück`):p.source==='fx'?esc(`${(s.accounts||[]).find(x=>x.id===p.accountId)?.name||'Währungskonto'} · ${p.amount} ${p.currency}`):esc(`Außerhalb Depotklar${p.note?' · '+p.note:''}`)).join('<br>')}</td><td class="num">${euro(g.value)}</td><td class="num">${g.priorValue==null?'':euro(g.priorValue)}</td><td class="num">${g.status==='supported'?euro(g.tax):'—'}</td><td>${statusBadge(g.status)}${g.reasons.length?`<small>${esc(g.reasons.map(r=>r.text).join(' '))}</small>`:''}</td></tr>`).join('');
  return `<section class="card gift"><header><h3>${esc(name(donor))} → ${esc(name(recipient))}</h3>
   <form data-form="relation" data-donor="${esc(donor)}" data-recipient="${esc(recipient)}" class="inline">${select('kind','Verhältnis',[['','bitte wählen'],...Object.entries(RELATIONS).map(([k,v])=>[k,`${v.label} · Freibetrag ${euro(v.allowance)}`])],relation?.kind||'','data-autosubmit')}</form></header>
   ${rest.status==='supported'?`<dl class="figures"><div><dt>Freibetrag</dt><dd>${euro(rest.allowance)}</dd></div><div><dt>In 10 Jahren genutzt</dt><dd>${euro(rest.used)}</dd></div><div><dt>Noch steuerfrei übertragbar</dt><dd class="pos">${euro(rest.remaining)}</dd></div>${rest.frees?`<div><dt>Ältester Erwerb fällt heraus</dt><dd>${date(rest.frees)}</dd></div>`:''}</dl>`:`<p class="muted">${relation?'Ein Erwerb im Zehnjahreszeitraum hat keinen Wert – Kurs am Stichtag erfassen.':'Verhältnis wählen, dann rechnet Depotklar Freibetrag und Steuer.'}</p>`}
   ${rows?`<div class="table-wrap"><table class="list"><thead><tr><th>Datum</th><th>Erwerb</th><th class="num">Wert</th><th class="num">Vorerwerbe 10 J.</th><th class="num">Steuer</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`:''}
   <details><summary>Vorerwerb außerhalb von Depotklar erfassen</summary><form data-form="prior-gift" data-donor="${esc(donor)}" data-recipient="${esc(recipient)}"><div class="grid">${field('date','Datum','', 'type="date" required')}${field('value','Wert EUR','','inputmode="decimal" required')}${field('taxPaid','Gezahlte Schenkungsteuer (falls bekannt)','','inputmode="decimal"')}${field('note','Beschreibung','','maxlength="120"')}</div><div class="actions"><span></span><button class="button">Vorerwerb speichern</button></div></form>
   ${s.priorGifts.filter(g=>g.donorId===donor&&g.recipientId===recipient).map(g=>`<p class="row-line">${date(g.date)} · ${euro(g.value)}${g.note?' · '+esc(g.note):''} <button class="link" data-action="delete-record" data-collection="priorGifts" data-id="${esc(g.id)}">entfernen</button></p>`).join('')}</details></section>`;
 }).join('');
 const options=s.persons.map(p=>[p.id,p.name]);
 return `<div class="page-head"><div><h1>Schenkungen</h1><p>Zusammenrechnung nach § 14 ErbStG aus den erfassten Schenkungen und Vorerwerben der letzten zehn Jahre. Steuer berechnet ab ${GIFT_TAX_YEARS[0]} nach geltendem Recht; frühere Erwerbe zählen als Vorerwerb. <a href="${GIFT_SOURCES.aggregation}" target="_blank" rel="noopener">§ 14 ErbStG</a></p></div></div>
  ${cards||'<p class="muted">Noch keine Schenkungen erfasst. Eine Schenkung entsteht als Übertrag in das Depot oder auf das Währungskonto einer anderen Person.</p>'}
  ${s.persons.length>1?`<details class="card"><summary>Weiteres Verhältnis anlegen</summary><form data-form="relation-new"><div class="grid">${select('donorId','Schenker',options,'')}${select('recipientId','Empfänger',options,s.persons[1]?.id)}${select('kind','Verhältnis',Object.entries(RELATIONS).map(([k,v])=>[k,v.label]),'child')}</div><div class="actions"><span></span><button class="button">Anlegen</button></div></form></details>`:''}
  <p class="hint">Schenkung von Alt-Anteilen vor 2009: Depotklar führt Erwerbsdatum und Bestandsschutz beim Empfänger fort, der einen eigenen Freibetrag von 100.000 € nutzt (BMF-Schreiben vom 21.05.2019, Rz. 56.98, nach Fachliteratur). Vor einer Gestaltung mit dem Berater bestätigen.</p>`;
}
