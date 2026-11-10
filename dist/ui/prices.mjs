import {replay} from '../core/ledger.mjs';
import {KINDS,baseRateOf,taxYearOf,isFund,inflowDate,LAST_RULE_YEAR,LAST_RATE_YEAR} from '../core/rules.mjs';
import {D,S,mul} from '../core/decimal.mjs';
import {today,isClosed,securityPersons,accountHolder,lastBookedYear,lastSelectableYear} from '../core/model.mjs';
import {publishedVatRate,provisionalVatRate,isDerivedVatRate,VAT_UNTIL,VAT_SOURCE,VAT_FIRST_YEAR} from '../core/vatrates.mjs';
import {esc,date,inputValue} from './format.mjs';

// Letzter Dezemberkurs eines Jahres: Jahresendbewertung und letzter Kurs des
// Jahres für die Vorabpauschale. Erster Kurs bis 15. Januar: Kurs zu Beginn des
// Jahres für die Vorabpauschale (§ 18 Abs. 1 InvStG).
export const yearEndOf=(s,securityId,year)=>s.prices.filter(p=>p.securityId===securityId&&p.date>=`${year}-12-01`&&p.date<=`${year}-12-31`).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;
export const yearStartOf=(s,securityId,year)=>s.prices.filter(p=>p.securityId===securityId&&p.date>=`${year}-01-01`&&p.date<=`${year}-01-15`).sort((a,b)=>a.date.localeCompare(b.date))[0]||null;
const latestOf=(s,securityId)=>s.prices.filter(p=>p.securityId===securityId).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;

// Jahreswerte an einer Stelle für alle Personen. Der Basiszins kommt jedes Jahr neu; der Sparer-Pauschbetrag gilt weiter,
// bis der Gesetzgeber ihn ändert. Das letzte hinterlegte Jahr steht zum Vergleich mit darin.
// Ältere Jahre stehen zugeklappt darunter, damit die Liste mit den Jahren nicht immer länger wird.
const RECENT_YEARS=5;
function yearValuesSection(s){
 const persons=s.persons.map(p=>p.id),pct=v=>inputValue(S(mul(D(v),D('100')))),rows=[],older=[],recentFrom=Number(today().slice(0,4))-RECENT_YEARS+1;
 for(let y=lastSelectableYear(s);y>=Math.min(LAST_RULE_YEAR,LAST_RATE_YEAR);y--){
  const target=y>=recentFrom?rows:older;
  const own=s.yearRules?.[y]||null,rule=taxYearOf(s,y),rate=baseRateOf(s,y),locked=isClosed(s,String(y),persons)?' disabled':'';
  const box=(key,label,placeholder,value)=>`<td class="num"><input class="price" inputmode="decimal" aria-label="${label} ${y}" placeholder="${esc(placeholder)}" data-year-rule="${key}" data-year="${y}" value="${esc(value)}"${locked}></td>`;
  const allowance=y<=LAST_RULE_YEAR?`<td class="num">${esc(inputValue(rule.allowance))}</td>`:box('allowance','Sparer-Pauschbetrag, nur bei einer Gesetzesänderung',inputValue(rule.allowance),own?.allowance!=null?inputValue(own.allowance):'');
  const base=y<=LAST_RATE_YEAR?`<td class="num">${esc(pct(rate.rate))}</td>`:box('baseRate','Basiszins in Prozent','offen',own?.baseRate!=null?pct(own.baseRate):'');
  const state=y<=LAST_RATE_YEAR?'Amtlich hinterlegt':rate?`Basiszins eingetragen am ${date(String(own.confirmedAt||'').slice(0,10))}`:`Basiszins offen, das BMF veröffentlicht ihn Anfang Januar ${y}`;
  target.push(`<tr><th scope="row">${y}</th>${allowance}${base}<td class="num">${date(inflowDate(y))}</td><td>${esc(state)}</td></tr>`);
 }
 const head='<thead><tr><th>Jahr</th><th class="num">Sparer-Pauschbetrag</th><th class="num">Basiszins in %</th><th class="num">Vorabpauschale fließt zu</th><th>Stand</th></tr></thead>';
 const years=list=>list.map(r=>r.match(/<th scope="row">(\d{4})/)[1]);
 return `<section class="section" id="jahreswerte"><h2>Jahreswerte</h2>
  <div class="table-wrap"><table class="list narrow">${head}<tbody>${rows.join('')}</tbody></table></div>
  ${older.length?`<details class="older"><summary>Frühere Jahre ${years(older).at(-1)}–${years(older)[0]}</summary><div class="table-wrap"><table class="list narrow">${head}<tbody>${older.join('')}</tbody></table></div></details>`:''}
  <p class="hint">Einfach mit dem richtigen Datum buchen, neue Jahre erscheinen von selbst. Nur der Basiszins kommt jedes Jahr neu: Er gehört in die Zeile des Jahres, in dem das BMF ihn veröffentlicht, und gilt für die Vorabpauschale mit Zufluss im Januar darauf. Sparer-Pauschbetrag, Abgeltungsteuer, Solidaritätszuschlag, Teilfreistellungen, Freigrenze und Schenkungsteuer gelten weiter, bis der Gesetzgeber sie ändert. Einen geänderten Sparer-Pauschbetrag hier eintragen, er gilt ab diesem Jahr; jede andere Gesetzesänderung braucht ein Update von Depotklar.</p></section>`;
}

// Umsatzsteuer-Umrechnungskurse an einer Stelle für alle Konten: hinterlegte Monate als Text, offene zum Eintragen.
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
function vatSection(s,year){
 const accounts=s.accounts||[],currencies=[...new Set(accounts.map(a=>a.currency))].sort();if(!currencies.length)return '';
 const years=[];for(let y=lastSelectableYear(s);y>=VAT_FIRST_YEAR;y--)years.push(y);
 const holders=c=>[...new Set(accounts.filter(a=>a.currency===c&&a.vatBook).map(a=>accountHolder(s,a)?.personId).filter(Boolean))];
 const cell=(c,month)=>{
  const official=publishedVatRate(c,month);
  if(official)return `<td class="num" title="${isDerivedVatRate(c,month)?'Monatsmittel der EZB-Referenzkurse; im BMF-Datensatz fehlt diese Währung für 2010 bis 2014':'Amtlich veröffentlicht (BMF)'}">${esc(inputValue(official))}</td>`;
  const own=s.vatRates?.[c]?.[month]??null,locked=isClosed(s,`${month}-28`,holders(c)),soon=provisionalVatRate(c,month);
  return `<td class="num"><input class="price" inputmode="decimal" aria-label="USt-Umrechnungskurs ${esc(c)} ${esc(month)}" placeholder="${esc(soon?inputValue(soon):'offen')}"${soon?' title="Vorläufig: Monatsmittel der EZB-Referenzkurse. Ein hier eingetragener oder amtlicher Wert ersetzt ihn."':''} data-vat-rate data-currency="${esc(c)}" data-month="${esc(month)}" value="${esc(own?inputValue(own):'')}"${locked?' disabled':''}></td>`;
 };
 const rows=MONTHS.map((name,i)=>{const month=`${year}-${String(i+1).padStart(2,'0')}`;return `<tr><th scope="row">${name}</th>${currencies.map(c=>cell(c,month)).join('')}</tr>`;}).join('');
 return `<section class="section" id="ust-kurse"><h2>Umsatzsteuer-Umrechnungskurse</h2>
  <div class="toolbar"><label class="inline-field"><span>Jahr</span><select id="vat-year">${years.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select></label></div>
  <div class="table-wrap"><table class="list narrow"><thead><tr><th>1 EUR =</th>${currencies.map(c=>`<th class="num">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
  <p class="hint">Monatsdurchschnitte des BMF (§ 16 Abs. 6 UStG), amtlich hinterlegt bis ${esc(VAT_UNTIL.slice(5))}/${esc(VAT_UNTIL.slice(0,4))}. Für spätere abgeschlossene Monate steht grau ein vorläufiger Wert darin, das Monatsmittel der EZB-Referenzkurse; damit rechnet die Buchhaltung, bis jemand den amtlichen Wert einträgt. Ein eingetragener Wert gilt für alle Konten dieser Währung. <a href="${esc(VAT_SOURCE)}" target="_blank" rel="noopener">Kurse beim BMF</a></p>
  <p class="hint">Genutzt werden sie für Konten, bei denen in den Stammdaten „Umsatzsteuer-Umrechnungskurs“ gewählt ist, und nur für die Buchhaltung: Steuerlich gilt der Kurs am Tag des Geschäfts (§ 20 Abs. 4 S. 1 EStG).</p></section>`;
}

// Kurstabelle: je Jahr eine Spalte. Standardmäßig die letzten PRICE_YEARS Jahre, sonst würde sie mit jedem Jahr breiter;
// „Jahre ab“ zeigt auch frühere bis 2017 (Übergang).
export const PRICE_YEARS=10;
export function pricesHTML(s,{vatYear=Number(today().slice(0,4)),from=null}={}){
 if(!s.securities.length&&!(s.accounts||[]).length)return `<section class="empty"><h2>Noch keine Wertpapiere</h2><button class="button primary" data-route="stammdaten">Wertpapier anlegen</button></section>`;
 if(!s.securities.length)return `<div class="page-head"><div><h1>Kurse</h1></div></div>${yearValuesSection(s)}${vatSection(s,vatYear)}`;
 const current=Number(today().slice(0,4)),last=lastBookedYear(s),first=from==null?Math.max(2017,last-PRICE_YEARS+1):Math.min(Math.max(2017,from),last);
 const years=Array.from({length:last-first+1},(_,i)=>first+i),all=Array.from({length:last-2016},(_,i)=>2017+i);
 const issues=[...new Set(replay(s).issues.filter(i=>/Vorabpauschale|Kurs/.test(i.reason)).map(i=>i.reason))];
 const input=(x,y,kind,p,locked,label,placeholder)=>`<input class="price${kind==='start'?' start':''}" inputmode="decimal" aria-label="${esc(x.name)} ${label} ${y}" placeholder="${placeholder}" data-${kind==='start'?'start':'price'} data-security="${esc(x.id)}" data-year="${y}" value="${esc(p?inputValue(p.price):'')}" title="${p?'Kurs vom '+date(p.date):label+' fehlt'}${locked?' · abgeschlossen':''}"${locked?' disabled':''}>`;
 const rows=s.securities.map(x=>{
  // Kurse abgeschlossener Jahre bleiben sichtbar, lassen sich aber nicht ändern.
  const latest=latestOf(s,x.id),holders=securityPersons(s,x.id),fund=isFund(x.kind);
  const cell=y=>{
   const locked=isClosed(s,`${y}-12-31`,holders),end=input(x,y,'end',yearEndOf(s,x.id,y),locked,'letzter Kurs',y===current?'Dezember':'Ende');
   // Fonds brauchen ab 2018 je Jahr den ersten und den letzten Kurs; 2017 nur den Schlusskurs.
   // Darunter optional die Vorabpauschale je Anteil laut Steuerinformation (ersetzt die Rechnung aus Kursen).
   const rate=baseRateOf(s,y),u=(s.vapUnits||[]).find(v=>v.securityId===x.id&&v.year===y),vapLocked=rate&&isClosed(s,rate.inflow,holders);
   const vap=fund&&rate&&D(rate.rate)>0n&&y<current?`<input class="price vap" inputmode="decimal" aria-label="${esc(x.name)} Vorabpauschale ${y} je Anteil, optional" placeholder="VAP/Anteil" data-vap data-security="${esc(x.id)}" data-year="${y}" value="${esc(u?inputValue(u.perUnit):'')}" title="Vorabpauschale ${y} je Anteil laut Steuerinformation, vor Teilfreistellung – optional, ersetzt die Rechnung aus Kursen${vapLocked?' · abgeschlossen':''}"${vapLocked?' disabled':''}>`:'';
   return `<td>${fund&&y>=2018?`<div class="pair">${input(x,y,'start',yearStartOf(s,x.id,y),locked,'erster Kurs','Anfang')}${end}${vap}</div>`:end}</td>`;
  };
  return `<tr><th scope="row">${esc(x.name)}<small>${esc(x.isin||'')} · ${esc(KINDS[x.kind])}</small></th>${years.map(cell).join('')}
   <td><input class="price" inputmode="decimal" aria-label="${esc(x.name)} aktueller Kurs, optional" placeholder="optional" data-current data-security="${esc(x.id)}" value="${esc(latest&&latest.date>`${current-1}-12-31`?inputValue(latest.price):'')}"><small>${latest&&latest.date>`${current-1}-12-31`?date(latest.date):'heute'}</small></td></tr>`;
 }).join('');
 return `<div class="page-head"><div><h1>Kurse</h1><p>Je Wertpapier und Jahr die Kurse in EUR. Bei Fonds oben der erste Kurs des Jahres (erster Handelstag im Januar), unten der letzte (letzter Handelstag im Dezember) – daraus rechnet Depotklar die Vorabpauschale. Darunter lässt sich stattdessen die Vorabpauschale je Anteil aus der Steuerinformation des Fonds eintragen (vor Teilfreistellung, „VAP/Anteil“) – dann ist der erste Kurs nicht nötig. Der letzte Kurs ergibt außerdem den Marktwert zum Jahresende. Ein Bankwert der Vorabpauschale hat Vorrang.</p></div></div>
  ${issues.length?`<div class="notice"><strong>Für die Vorabpauschale fehlen Kurse</strong><ul>${issues.slice(0,10).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`:''}
  <div class="toolbar"><label class="inline-field"><span>Jahre ab</span><select id="prices-from">${all.map(y=>`<option value="${y}" ${y===first?'selected':''}>${y}</option>`).reverse().join('')}</select></label>${first>2017?`<span class="muted">${first-2017} frühere ${first-2017===1?'Jahr':'Jahre'} ausgeblendet</span>`:''}</div>
  <div class="table-wrap"><table class="prices"><thead><tr><th>Wertpapier</th>${years.map(y=>y===2017?'<th>31.12.2017<small>Übergang</small></th>':`<th>${y}<small>Anfang · Ende</small></th>`).join('')}<th class="optional">Aktuell <small>optional</small></th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="hint">Speichern beim Verlassen eines Feldes. Ein leeres Feld löscht den Kurs. Die Vorabpauschale braucht nach § 18 InvStG den ersten und den letzten im Jahr festgesetzten Rücknahmepreis; der Dezemberkurs des Vorjahres ersetzt den ersten Kurs nicht. Ohne Rücknahmepreis gilt der Börsenkurs.${s.securities.some(x=>!isFund(x.kind))?' Bei Aktien dient der Kurs nur der Bewertung.':''}</p>
  <p class="hint">„Aktuell“ muss nicht gepflegt werden: Er zählt nur, wenn er im Dezember erfasst wird (dann als letzter Kurs des Jahres) oder bis 15. Januar (dann als erster Kurs des Jahres).</p>${yearValuesSection(s)}${vatSection(s,vatYear)}`;
}
