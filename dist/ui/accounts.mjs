import {fxReplay,accountStatement,accountLots,accountInterest,balanceCheckResults} from '../core/fx.mjs';
import {ACCOUNT_KINDS,closedThrough,accountHolder} from '../core/model.mjs';
import {D} from '../core/decimal.mjs';
import {accountBlock,lockCheck,periodControls} from './sheet.mjs';
import {esc,money,pieces} from './format.mjs';
import {lotsBlock,interestBlock} from './lots.mjs';

// Höchstens so viele Jahresspalten in der Matrix der Lose; ältere Abgänge stehen zusammen (vollständig in Excel).
export const SCREEN_YEARS=5;

// Reiter „Konten“: Währungskonten je Person wie Kontoblätter der Buchhaltung – Bestand in
// Fremdwährung, EUR-Buchwert nach der Reihenfolge der Anschaffung und Währungsgewinne
// mit Einordnung nach § 20 oder § 23 EStG. Getrennt von den Wertpapierblättern, weil
// Konten eigene Bewegungen, eigene Kurse und eine eigene Steuerlogik haben.
const span=(from,to)=>from===to?String(to):`${from}–${to}`;

export function accountsHTML(s,{year,from=year,personId='',open=null}){
 const fromYear=Math.min(from,year),toYear=year,person=s.persons.find(p=>p.id===personId);
 // Konten mit Depot oder eigenständig; Inhaber und Bank kommen vom Depot oder vom Konto.
 const holder=a=>accountHolder(s,a),accounts=(s.accounts||[]).filter(a=>{const h=holder(a);return s.persons.some(p=>p.id===h.personId)&&(!personId||h.personId===personId);});
 const head=`<div class="page-head"><div><h1>${person?`${esc(person.name)} · `:''}Währungskonten ${span(fromYear,toYear)}</h1><p>Je Konto Bestand in Fremdwährung, EUR-Buchwert nach der Reihenfolge der Anschaffung und bei jedem Abgang der Währungsgewinn – verzinste Konten nach § 20 EStG, unverzinste nach § 23 EStG. Eine Zeile anklicken, um die Bewegung zu ändern.</p></div></div>`;
 if(!accounts.length)return `${head}<section class="empty"><h2>Keine Währungskonten${person?` für ${esc(person.name)}`:''}</h2><p>Ein Konto in Fremdwährung, etwa USD, wird in den Stammdaten angelegt – bei einem Depot oder als eigenes Konto mit Bank, auch ganz ohne Depot.</p><button class="button primary" data-route="stammdaten">Zu den Stammdaten</button></section>`;
 const fx=fxReplay(s,{until:`${toYear}-12-31`}),bookFx=accounts.some(a=>a.vatBook)?fxReplay(s,{until:`${toYear}-12-31`,basis:'book'}):null,events=new Map(s.events.map(e=>[e.id,e]));
 const cards=accounts.map(a=>{
  const h=holder(a),owner=s.persons.find(p=>p.id===h.personId)?.name||'',st=accountStatement(s,a.id,fromYear,toYear,{replayResult:fx});
  const closed=closedThrough(s,h.personId),book=a.vatBook?accountStatement(s,a.id,fromYear,toYear,{replayResult:bookFx,basis:'book'}):null,lock=lockCheck(s,events,h.personId);
  const lots=accountLots(s,a.id,fromYear,toYear,{replayResult:fx,maxYears:SCREEN_YEARS}),bookLots=a.vatBook?accountLots(s,a.id,fromYear,toYear,{replayResult:bookFx,basis:'book',maxYears:SCREEN_YEARS}):null;
  // Kontostand laut Bank zum Jahresende gegen den gebuchten Bestand.
  const check=balanceCheckResults(s,{replayResult:fx,until:`${toYear}-12-31`,accountId:a.id}).find(c=>c.date===`${toYear}-12-31`);
  const checkFigure=check?`<div><dt>Laut Bank 31.12.${toYear}</dt><dd><button class="link" data-action="balance-check" data-account="${esc(a.id)}" title="Kontostand laut Kontoauszug ändern">${pieces(check.balance)} ${esc(a.currency)}</button><small class="${D(check.difference)===0n?'ok':'warn'}">${D(check.difference)===0n?'stimmt':`Differenz ${pieces(check.difference)} ${esc(a.currency)}`}</small></dd></div>`:'';
  const figures=`<dl class="figures"><div><dt>Bestand 31.12.${toYear}</dt><dd>${pieces(st.closing.balance)} ${esc(a.currency)}</dd></div>${checkFigure}<div><dt>Buchwert 31.12.${toYear}</dt><dd>${money(st.closing.bookValue)}</dd></div>${book?`<div><dt>Buchwert zum USt-Kurs</dt><dd>${money(book.closing.bookValue)}</dd></div>`:''}${st.realized?`<div><dt>Währungsgewinn ${span(fromYear,toYear)}</dt><dd>${money(st.gains)}</dd></div>`:''}${lots.openCount?`<div><dt>Offene Lose</dt><dd>${lots.openCount}</dd></div>`:''}</dl>`;
  const key=`konto:${a.id}`,folds={open,key};
  return `<section class="depot account-card"><header class="depot-head"><div><h2>${esc(a.name)} <span class="badge currency">${esc(a.currency)}</span>${closed!=null?` <span class="badge locked">Abgeschlossen bis ${closed}</span>`:''}</h2><p>${esc(owner)} · ${h.depot?esc(h.depot.name):'eigenes Konto'} · ${esc(h.bank||'Bank offen')}${h.abroad?' · ausländische Bank':''} · ${esc(ACCOUNT_KINDS[a.kind])}</p></div>${figures}<div class="toolbar-group"><button class="button" data-action="entry-fx" data-account="${esc(a.id)}">+ Bewegung</button><button class="button" data-action="entry-interest" data-account="${esc(a.id)}">+ Zinsen</button>${check?'':`<button class="button" data-action="balance-check" data-account="${esc(a.id)}" title="Kontostand laut Kontoauszug zum 31.12.${toYear} eintragen und mit dem gebuchten Bestand vergleichen">Kontostand laut Bank</button>`}</div></header>
   ${st.empty?`<p class="muted pad">${fromYear===toYear?`Im Jahr ${toYear}`:`Von ${fromYear} bis ${toYear}`} keine Bewegungen.</p>`:`${book?accountBlock(book,lock,folds):''}${accountBlock(st,lock,folds)}${lotsBlock(lots,bookLots,folds)}${interestBlock(accountInterest(s,a.id,fromYear,toYear),a.currency,span(fromYear,toYear),folds)}`}</section>`;
 }).join('');
 // Abweichende Kontostände laut Bank im Zeitraum gehören zu den offenen Angaben.
 const deviations=balanceCheckResults(s,{replayResult:fx,until:`${toYear}-12-31`}).filter(c=>c.date>=`${fromYear}-01-01`&&accounts.some(a=>a.id===c.accountId)&&D(c.difference)!==0n).map(c=>`${c.account.name}: Kontostand laut Bank zum ${c.date.split('-').reverse().join('.')} ${pieces(c.balance)} ${c.account.currency}, gebucht ${pieces(c.booked)} – Differenz ${pieces(c.difference)} ${c.account.currency}. Fehlt eine Bewegung?`);
 const issues=[...new Set([...fx.issues,...(bookFx?.issues||[])].filter(i=>accounts.some(a=>a.id===i.accountId)).filter(i=>!i.date||i.date.slice(0,4)<=String(toYear)).map(i=>i.reason).concat(deviations))];
 return `${head}<div class="toolbar head-actions"><div class="toolbar-group">${periodControls(s,fromYear,toYear)}</div><div class="toolbar-group"><button class="button" data-action="export-pdf-accounts" title="Öffnet die Vorschau">PDF</button><button class="button" data-action="export-xlsx-accounts">Excel</button><button class="button" data-route="steuer">Anlage SO auf der Steuerseite</button></div></div>
  <div class="toolbar import-bar"><span class="muted">Viele Bewegungen auf einmal:</span><button class="button" data-action="import-template" title="Excel-Datei mit Spalten und Auswahllisten zum Ausfüllen">Excel-Vorlage</button><label class="button file" title="Ausgefüllte Vorlage einlesen; vor dem Übernehmen kommt eine Vorschau">Excel importieren<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-action="import-xlsx" hidden></label></div>
  ${issues.length?`<div class="notice"><strong>Offene Angaben</strong><ul>${issues.slice(0,8).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`:''}${cards}`;
}
