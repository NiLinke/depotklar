import {yearReport,yearDefaults,calcLines} from '../core/year.mjs';
import {KINDS,REGIMES,taxYearOf,TARIFF_SOURCE,PROTECTED_SOURCE,FIRST_TAX_YEAR,COMMODITY_SOURCE,JOINT_SOURCE} from '../core/rules.mjs';
import {CHURCH_RATES,isClosed,accountHolder,incomeType,jointPartner,lastSelectableYear} from '../core/model.mjs';
import {esc,money,euro,date,num,statusBadge,field,select,check,inputValue,pieces} from './format.mjs';
import {FX_SOURCES,ABGELTUNG_BMF} from '../core/rules.mjs';
import {filingSections} from './filing.mjs';

const kindLabel=k=>KINDS[k];
// Deutsche Banken der Person (mit Bescheinigung); Depots bei ausländischen Banken haben keinen deutschen Steuerabzug.
const banksOf=(s,personId,year)=>[...new Set([...s.depots.filter(d=>d.personId===personId&&!d.abroad).map(d=>d.bank?.trim()).filter(Boolean),...(s.accounts||[]).filter(a=>!a.depotId&&a.personId===personId&&!a.abroad).map(a=>a.bank?.trim()).filter(Boolean),...s.certificates.filter(c=>c.personId===personId&&c.year===year).map(c=>c.bank.trim())])];
// Hat die Person Depots oder eigenständige Währungskonten bei ausländischen Banken?
const hasAbroad=(s,personId)=>s.depots.some(x=>x.personId===personId&&x.abroad)||(s.accounts||[]).some(a=>{const h=accountHolder(s,a);return h.personId===personId&&h.abroad;});
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function yearForm(s,personId,year,r,locked=false){
 const d=yearDefaults(s,personId,year),rule=taxYearOf(s,year),others=s.persons.filter(p=>p.id!==personId),joined=jointPartner(s,personId,year),lastYear=jointPartner(s,personId,year-1);
 const note=d.proposal?`<p class="hint">Vorschlag${d.basedOn?` aus der berechneten Jahresrechnung ${d.basedOn}`:''}. Mit dem letzten Steuerbescheid vergleichen und bestätigen – erst dann rechnet Depotklar mit diesen Werten.</p>`:`<p class="hint">Bestätigt am ${date(String(d.confirmedAt||'').slice(0,10))}.</p>`;
 return `<form class="card" data-form="year" data-person="${esc(personId)}" data-year="${year}"><h3>Jahresdaten ${year}</h3>${note}<fieldset class="grid" ${locked?'disabled':''}>
  ${select('churchRate','Kirchensteuer',Object.entries(CHURCH_RATES),d.churchRate)}
  ${select('churchChange','Kirchensteuerpflicht im Jahr',[['','das ganze Jahr'],['exit','Austritt: pflichtig bis einschließlich …'],['entry','Eintritt: pflichtig ab …']],d.churchUntil!=null?'exit':d.churchFrom!=null?'entry':'')}
  ${select('churchMonth','Monat bei Ein- oder Austritt',MONTHS.map((m,i)=>[String(i+1),m]),String(d.churchUntil??d.churchFrom??''))}
  ${field('stockLossCarry','Aktienverlustvortrag zum 01.01.',inputValue(d.stockLossCarry),'inputmode="decimal"')}
  ${field('otherLossCarry','Sonstiger Verlustvortrag zum 01.01.',inputValue(d.otherLossCarry),'inputmode="decimal"')}
  ${field('externalAllowance','Sparer-Pauschbetrag anderweitig genutzt',inputValue(d.externalAllowance),'inputmode="decimal"',rule?`Jahresbetrag ${rule.allowance} € bei Einzelveranlagung.`:'')}
  ${field('protectedRemaining','Rest-Freibetrag Alt-Anteile zum 01.01.',inputValue(d.protectedRemaining),'inputmode="decimal"','Gesondert festgestellt nach § 56 Abs. 6 InvStG; anfangs 100.000 €.')}
  ${others.length?select('jointWith',`Zusammenveranlagung ${year}`,[['','Nein, Einzelveranlagung'],...others.map(p=>[p.id,`Ja, mit ${p.name}`])],joined||''):''}
  ${hasAbroad(s,personId)?check('foreignDeclared',`Erträge der Depots ohne deutschen Steuerabzug in der Steuererklärung ${year} angegeben (Anlage KAP / KAP-INV)`,d.foreignDeclared):''}
 </fieldset><p class="hint">${others.length?`Zusammenveranlagung ist die Ausnahme und gilt nur für dieses Jahr: jedes Jahr neu prüfen und wählen, bei einer der beiden Personen.${lastYear?` ${year-1} zusammen mit ${esc(s.persons.find(p=>p.id===lastYear)?.name||'')}.`:''} `:''}Bei Ein- oder Austritt wird die Kirchensteuer gezwölftelt, auch in der Formel der Kapitalertragsteuer (<a href="${ABGELTUNG_BMF}" target="_blank" rel="noopener">BMF vom 14.05.2025, Rz. 133</a>). Der letzte Monat der Pflicht steht in der Austrittsbescheinigung. ${hasAbroad(s,personId)?'Vorabpauschalen aus Depots ohne deutschen Steuerabzug mindern einen späteren Verkaufsgewinn nur, wenn sie erklärt wurden oder die Kapitalerträge des Jahres im Sparer-Pauschbetrag blieben.':''}</p>${locked?'':`<div class="actions"><span></span><button class="button primary">${d.proposal?'Bestätigen':'Speichern'}</button></div>`}</form>`;
}

function itemsTable(s,r){
 if(!r.items.length)return '<p class="muted">Keine Verkäufe, Ausschüttungen, Zinsen oder Vorabpauschalen in diesem Jahr.</p>';
 const sec=id=>s.securities.find(x=>x.id===id),depot=id=>s.depots.find(d=>d.id===id);
 const rows=r.items.map(i=>{
  const m=i.ref,x=sec(m.securityId),type=incomeType(i,x);
  const foreign=i.kind==='distribution'&&m.income.foreignTax!=null&&Number(m.income.foreignTax)?` · Quellensteuer ${money(m.income.foreignTax)} €`:'';
  const name=i.kind==='other'?`${m.label} · ${depot(m.depotId)?.name||'Depot'}`:i.kind==='fx'?`${(s.accounts||[]).find(a=>a.id===m.accountId)?.name||'Währungskonto'} · ${m.label}`:!m.depotId&&m.accountId?`${(s.accounts||[]).find(a=>a.id===m.accountId)?.name||'Währungskonto'} · ${m.bank||''}`:x?x.name:`${depot(m.depotId)?.name||'Depot'} · ${depot(m.depotId)?.bank||''}`;
  const details=i.kind==='sale'?`<tr class="details"><td colspan="7"><details><summary>Rechenweg je Los</summary><table class="mini"><thead><tr><th>Los</th><th>Einordnung</th><th class="num">Stück</th><th class="num">Erlös</th><th class="num">Basis</th><th class="num">Vorabpauschalen</th><th class="num">Zuwachs ab 2018</th><th class="num">Fiktiver Gewinn 2017</th><th class="num">Steuerpflichtig</th></tr></thead><tbody>${m.sale.details.map(l=>`<tr><td>${esc(l.acquired?date(l.acquired):'Pool')}</td><td>${esc(REGIMES[l.regime])}${l.frozen?.length?` · darin aufgeschobener Gewinn ${money(String(l.frozen.reduce((a,f)=>a+Number(f.gain),0)))} € (§ 22 InvStG)`:''}</td><td class="num">${esc(l.quantity)}</td>${num(l.proceeds)}${num(l.regime==='regular'||l.regime==='stockPre2009'?l.cost:l.basis)}${num(l.vap)}${num(l.post2018)}${num(l.pre2018)}${num(l.taxable)}</tr>`).join('')}</tbody></table></details></td></tr>`:'';
  return `<tr><td>${date(m.date)}</td><td>${esc(name)}<small>${esc(type)} · ${esc(x?kindLabel(x.kind):'keine Teilfreistellung')}${esc(foreign)}</small></td>${num(i.gross)}${num(i.exempt)}${num(i.taxable)}<td class="num">${i.allowance&&Number(i.allowance)?money(i.allowance):''}</td>${num(i.taxableAfter??null)}</tr>${details}`;
 }).join('');
 return `<div class="table-wrap"><table class="list"><thead><tr><th>Datum</th><th>Ertrag</th><th class="num">Vor Teilfreistellung</th><th class="num">Teilfreistellung</th><th class="num">Steuerpflichtig</th><th class="num">Alt-Anteile-Freibetrag</th><th class="num">Verbleibt</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function calculation(r,partner=null){
 if(r.status!=='supported')return '';
 const j=r.joint;
 const line=(label,value,strong=false)=>`<tr${strong?' class="strong"':''}><td>${esc(label)}</td>${num(value)}</tr>`;
 return `<div class="card"><h3>Jahresrechnung</h3><table class="calc">${calcLines(r).map(([label,value,strong])=>line(label,value,strong)).join('')}</table>
  <p class="hint">Verlustverrechnung in der Reihenfolge nach <a href="${ABGELTUNG_BMF}" target="_blank" rel="noopener">BMF vom 14.05.2025, Rn. 118</a>: Aktienverluste nur gegen Aktiengewinne, laufende Verluste vor den Vorträgen, danach der Sparer-Pauschbetrag. ${j?`Zusammenveranlagung mit ${esc(j.partnerName)}: Jeder rechnet erst für sich und zieht seine Hälfte des gemeinsamen Sparer-Pauschbetrags von ${money(String(Number(j.half)+Number(j.theirHalf)))} € ab, ein ungenutzter Teil geht zum anderen; danach gleichen die verbleibenden Verluste des einen die Erträge des anderen aus, Aktienverluste nur gegen Aktiengewinne (<a href="${JOINT_SOURCE}" target="_blank" rel="noopener">§ 20 Abs. 6 und 9 EStG</a>; Rn. 273 bis 275). Quellensteuer, die einer nicht anrechnen kann, rechnet der andere an (Rn. 276). Jeder Ehegatte rechnet auf seinen Anteil mit der eigenen Kirchensteuer.${partner?.total!=null?` Steuer ${esc(j.partnerName)}: ${money(partner.total)} €, zusammen ${money(String(Number(r.total)+Number(partner.total)))} €.`:''} `:'Einzelveranlagung, '}Privatvermögen, ohne Günstigerprüfung – bei geringem Gesamteinkommen, etwa bei Kindern, kann sie die Steuer bis auf null senken (§ 32d Abs. 6 EStG); die Steuer laut Modell ist dann eine Obergrenze; § 32d Abs. 1 EStG nach (e − 4q)/(4 + k) mit Kirchensteuersatz k und anrechenbarer ausländischer Steuer q (je Ertrag höchstens 25 %, § 32d Abs. 5 EStG). <a href="${TARIFF_SOURCE}" target="_blank" rel="noopener">Gesetz</a></p></div>`;
}

function bankSection(s,personId,year,r,locked=false){
 const banks=banksOf(s,personId,year);
 const cards=banks.map(bank=>{
  const c=s.certificates.find(x=>x.personId===personId&&x.year===year&&x.bank.trim()===bank)||{},model=r.banks.find(b=>b.bank===bank);
  const losses=model&&model.stockLoss!=null&&(Number(model.stockLoss)||Number(model.otherLoss));
  return `<form class="card" data-form="certificate" data-person="${esc(personId)}" data-year="${year}" data-bank="${esc(bank)}" ${c.id?`data-id="${esc(c.id)}"`:''}><h4>${esc(bank)}</h4><fieldset class="grid" ${locked?'disabled':''}>
   ${field('capitalTax','Kapitalertragsteuer',inputValue(c.capitalTax),'inputmode="decimal"')}${field('solidarity','Solidaritätszuschlag',inputValue(c.solidarity),'inputmode="decimal"')}${field('churchTax','Kirchensteuer',inputValue(c.churchTax),'inputmode="decimal"')}
   ${losses||c.lossCertificate?`${check('lossCertificate','Verlustbescheinigung erteilt',c.lossCertificate)}${field('certifiedStockLoss','Bescheinigter Aktienverlust',inputValue(c.certifiedStockLoss??model?.stockLoss),'inputmode="decimal"')}${field('certifiedOtherLoss','Bescheinigter sonstiger Verlust',inputValue(c.certifiedOtherLoss??model?.otherLoss),'inputmode="decimal"')}`:''}
  </fieldset><div class="actions"><span class="hint">Werte der Jahressteuerbescheinigung ${year}.</span>${locked?'':'<button class="button">Speichern</button>'}</div></form>`;
 }).join('');
 const diff=r.difference;
 // Je Bank: woher der Steuerabzug stammt und was gegebenenfalls fehlt.
 const parts=[['capitalTax','KapESt'],['solidarity','Soli'],['churchTax','KiSt']];
 const perBank=r.withholding?.length?`<table class="list compact"><thead><tr><th>Bank</th><th>Grundlage</th>${parts.map(([,l])=>`<th class="num">${l}</th>`).join('')}<th class="num">Einbehalten</th></tr></thead><tbody>${r.withholding.map(w=>`<tr><td>${esc(w.bank)}</td><td>${w.abroad?'Ausländische Bank, kein deutscher Steuerabzug':w.source==='certificate'?'Jahressteuerbescheinigung':'Einzelabrechnungen'}${w.missing?`<small>${esc(w.missing)}</small>`:!w.parts&&w.amount!=null?'<small>Nur als Summe erfasst.</small>':''}</td>${parts.map(([k])=>w.parts?num(w.parts[k]):'<td class="num muted">–</td>').join('')}${num(w.amount)}</tr>`).join('')}</tbody></table>`:'';
 // Je Steuerart: einbehalten gegen Modell – zeigt etwa Kirchensteuer, die nach einem Austritt weiter einbehalten wurde.
 const byType=r.taxDifference?`<table class="list compact"><thead><tr><th>Steuerart</th><th class="num">Einbehalten</th><th class="num">Laut Modell</th><th class="num">Differenz</th></tr></thead><tbody>${[['capitalTax','Kapitalertragsteuer'],['solidarity','Solidaritätszuschlag'],['churchTax','Kirchensteuer']].map(([k,l])=>`<tr><td>${l}</td>${num(r.bankTaxes[k])}${num(r[k])}${num(r.taxDifference[k])}</tr>`).join('')}</tbody></table><p class="hint">Differenz positiv: zu viel einbehalten, negativ: zu wenig.</p>`:'';
 const result=r.bankWithheld==null?`<p class="muted">Abgleich offen – für jede deutsche Bank die Jahressteuerbescheinigung erfassen oder den Steuerabzug an jeder Abrechnung, auch bei „Vorabpauschale laut Bank“.</p>${perBank}`
  :`<dl class="figures"><div><dt>Einbehalten</dt><dd>${euro(r.bankWithheld)}</dd></div><div><dt>Steuer laut Modell</dt><dd>${euro(r.total)}</dd></div><div><dt>${diff==null?'Abgleich':Number(diff)>=0?'Erwartete Erstattung':'Erwartete Nachzahlung'}</dt><dd class="${diff!=null&&Number(diff)>=0?'pos':'neg'}">${diff==null?'offen':euro(String(Math.abs(Number(diff))))}</dd></div></dl>${diff!=null&&Number(diff)<0?'<p class="hint">Ohne Günstigerprüfung gerechnet: Bei geringem Gesamteinkommen – etwa mit NV-Bescheinigung – kann die tatsächliche Steuer niedriger sein.</p>':''}${byType}${perBank}`;
 // Kontrolle je Abrechnung: Bemessungsgrundlagen der Bank gegen die eigene Rechnung.
 const sec=id=>s.securities.find(x=>x.id===id);
 const checks=r.checks?.length?`<h3>Kontrolle je Abrechnung</h3><table class="list compact"><thead><tr><th>Datum</th><th>Vorgang</th><th class="num">Laut Bank</th><th class="num">Laut Depotklar</th><th class="num">Abweichung</th></tr></thead><tbody>${r.checks.map(c=>`<tr><td>${date(c.date)}</td><td>${esc(sec(c.securityId)?.name||'')}<small>${c.kind==='sale'?'Verkauf · Gewinn vor Teilfreistellung':`Vorabpauschale ${c.year} · ${c.from==='unit'?'aus Steuerinformation':'aus Jahreskursen'}`}${c.hint?` · ${esc(c.hint)}`:''}</small></td>${num(c.bank)}${num(c.model)}${num(c.difference)}</tr>`).join('')}</tbody></table><p class="hint">Verglichen werden Bemessungsgrundlagen, nicht der Steuerabzug: Den verrechnet die Bank über das Jahr mit Freistellungsauftrag und Verlusttöpfen; er steht oben je Steuerart.</p>`
  :r.sales?.length?'<p class="muted">Für die Kontrolle je Verkauf beim Verkauf den Veräußerungsgewinn laut Abrechnung eintragen.</p>':'';
 return `<section class="section"><h2>Bank und Abgleich</h2>${result}${checks}<div class="cards">${cards||(r.withholding?.every(w=>w.abroad)?'':'<p class="muted">Keine Bank zugeordnet.</p>')}</div></section>`;
}

// Währungsgewinne unverzinster Konten: private Veräußerungsgeschäfte für die Anlage SO.
function privateSales(s,r){
 const p=r.privateSales;if(!p)return '';
 const account=id=>(s.accounts||[]).find(a=>a.id===id);
 const rows=p.moves.map(m=>`<tr><td>${date(m.date)}</td><td>${esc(m.name||account(m.accountId)?.name||'')}<small>${esc(m.label)} · ${pieces(String(-Number(m.amount)))} ${esc(m.currency)}</small></td>${num(m.proceeds)}${num(m.cost)}${num(m.gain)}<td class="num">${m.taxable==null?'Offen':money(m.taxable)}</td></tr>${m.parts.length?`<tr class="details"><td colspan="6"><table class="mini"><thead><tr><th>Betrag</th><th>Angeschafft</th><th class="num">EUR-Wert</th><th class="num">Anschaffung</th><th class="num">Gewinn</th><th>Frist</th></tr></thead><tbody>${m.parts.map(x=>`<tr><td>${pieces(x.amount)} ${esc(m.currency)}</td><td>${x.acquired?date(x.acquired):'unbekannt'}${x.income?' · Gutschrift':''}</td>${num(x.proceeds)}${num(x.cost)}${num(x.gain)}<td>${x.within?'innerhalb eines Jahres':x.within===false?'außerhalb, nicht steuerbar':'offen'}</td></tr>`).join('')}</tbody></table></td></tr>`:''}`).join('');
 const result=p.total==null?'<p class="muted">Ergebnis offen – siehe Hinweise.</p>':`<dl class="figures"><div><dt>Gewinn innerhalb der Frist</dt><dd>${euro(p.total)}</dd></div><div><dt>Freigrenze ${r.year}</dt><dd>${euro(p.limit)}</dd></div><div><dt>${Number(p.taxable)<0?'Verlust (nur mit § 23-Gewinnen verrechenbar)':'Steuerpflichtig (Anlage SO)'}</dt><dd>${euro(p.taxable)}</dd></div></dl>${p.exempt?`<p class="hint">Unter der Freigrenze von ${money(p.limit)} € steuerfrei – sofern keine weiteren privaten Veräußerungsgeschäfte hinzukommen.</p>`:''}`;
 const hasFx=p.moves.some(m=>m.accountId),hasEtc=p.moves.some(m=>m.securityId),where=[hasFx?'Währungskonten':'',hasEtc?'ETCs':''].filter(Boolean).join(' und ');
 return `<section class="section"><h2>Private Veräußerungsgeschäfte ${r.year} · ${where}</h2>${result}<div class="table-wrap"><table class="list"><thead><tr><th>Datum</th><th>Abgang</th><th class="num">EUR-Wert</th><th class="num">Anschaffung</th><th class="num">Gewinn</th><th class="num">Innerhalb der Frist</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="hint">${hasEtc?`ETCs mit Anspruch nur auf den hinterlegten Rohstoff oder seinen Verkaufserlös sind kein Kapitalertrag, sondern fallen unter § 23 EStG: steuerbar nur bis ein Jahr nach der Anschaffung (<a href="${COMMODITY_SOURCE}" target="_blank" rel="noopener">BMF vom 14.05.2025, Rn. 57</a>). `:''}Unverzinste Fremdwährungsguthaben: steuerbar ist ein Abgang nicht mehr als ein Jahr nach der Anschaffung, die ältesten Beträge gelten als zuerst verbraucht (§ 23 Abs. 1 S. 1 Nr. 2 EStG). Besteuerung mit dem persönlichen Steuersatz, Freigrenze für den Gesamtgewinn (§ 23 Abs. 3 S. 5 EStG). <a href="${FX_SOURCES.privateSales}" target="_blank" rel="noopener">§ 23 EStG</a></p></section>`;
}

// Werte für die Erklärung, nach Formular gegliedert (gemeinsam mit Excel und PDF).
function filing(r){
 const sections=filingSections(r);if(!sections.length)return '';
 return `<section class="section"><h2>Für die Steuererklärung</h2>${sections.map(x=>`<div class="filing"><h3>${esc(x.title)}</h3><p class="hint">${esc(x.note)}</p>${x.rows.length?`<div class="table-wrap"><table class="list"><thead><tr>${x.head.map((h,i)=>`<th${i?' class="num"':''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${x.rows.map(row=>`<tr><td>${esc(row[0])}</td>${row.slice(1).map(v=>num(v)).join('')}</tr>`).join('')}</tbody></table></div>`:''}</div>`).join('')}
  <p class="hint">Zeilennummern wechseln je Formularjahr – die Werte nach Bezeichnung übertragen und die Ausfüllanleitung des Jahres beachten. <a href="${PROTECTED_SOURCE}" target="_blank" rel="noopener">§ 56 InvStG</a></p></section>`;
}

// Auswahl der Steuerjahre: von den kommenden Jahren bis 2018, neueste zuerst.
const taxYears=s=>{const list=[];for(let y=lastSelectableYear(s);y>=FIRST_TAX_YEAR;y--)list.push(y);return list;};
export function taxPageHTML(s,{personId,year,years=taxYears(s)}){
 if(!s.persons.length)return `<section class="empty"><h2>Noch keine Personen</h2><button class="button primary" data-route="stammdaten">Stammdaten anlegen</button></section>`;
 const person=s.persons.find(p=>p.id===personId)||s.persons[0],r=yearReport(s,person.id,year),locked=isClosed(s,String(year),[person.id]);
 const reasons=(r.reasons.length?`<div class="notice"><ul>${r.reasons.map(x=>`<li>${esc(x.text)}</li>`).join('')}</ul></div>`:'')+(r.hints?.length?`<div class="notice info"><ul>${r.hints.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'');
 const carry=r.status==='supported'?`<section class="section"><h2>Vorträge zum 01.01.${year+1}</h2><dl class="figures"><div><dt>Aktienverlust</dt><dd>${euro(r.carry.stockLoss)}</dd></div><div><dt>Sonstiger Verlust</dt><dd>${euro(r.carry.otherLoss)}</dd></div><div><dt>Rest-Freibetrag Alt-Anteile</dt><dd>${euro(r.carry.protectedRemaining)}</dd></div></dl><p class="hint">Werden für ${year+1} vorgeschlagen und gelten erst nach Bestätigung.</p></section>`:'';
 return `<div class="page-head"><div><h1>Steuer ${year} · ${esc(person.name)} ${statusBadge(r.status)}</h1><p>Kapitalerträge aus den in Depotklar erfassten Depots. Modellrechnung für die eigene Erklärung, kein Steuerbescheid.</p></div><div class="head-actions"><label class="inline-field"><span>Jahr</span><select id="year">${years.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select></label><button class="button" data-action="export-pdf-tax" title="Öffnet die Vorschau"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg>PDF</button></div></div>
  ${locked?`<div class="notice locked"><strong>${year} ist für ${esc(person.name)} abgeschlossen.</strong> Jahresdaten und Bankbescheinigungen lassen sich ansehen, aber nicht ändern. Zum Ändern das Jahr in der Übersicht unter „Jahresabschluss“ wieder öffnen.</div>`:''}${reasons}
  ${r.jointWith?`<div class="notice info">Zusammenveranlagung ${year} mit ${esc(r.jointName)}.${!r.items.length?` ${esc(person.name)} hat keine Erträge in Depotklar. Die bestätigten Verlustvorträge zählen im gemeinsamen Ausgleich, der ungenutzte Sparer-Pauschbetrag geht auf ${esc(r.jointName)} über.`:''}</div>`:''}
  ${r.status!=='none'&&!s.years[person.id]?.[year]?yearForm(s,person.id,year,r,locked):''}
  <section class="section"><h2>Erträge ${year}</h2>${itemsTable(s,r)}</section>
  ${calculation(r,r.joint?yearReport(s,r.joint.partnerId,year):null)}
  ${filing(r)}
  ${privateSales(s,r)}
  ${r.status==='none'?'':bankSection(s,person.id,year,r,locked)}
  ${carry}
  ${r.status!=='none'&&s.years[person.id]?.[year]?yearForm(s,person.id,year,r,locked):''}`;
}
