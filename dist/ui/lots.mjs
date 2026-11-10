import {D,S,sum} from '../core/decimal.mjs';
import {today} from '../core/model.mjs';
import {esc,money,pieces,date,num} from './format.mjs';

// Matrix der Lose eines Währungskontos: Jede Zeile ist ein Zugang, die Spalten zeigen, wie viel davon in welchem Jahr
// verbraucht wurde und was übrig ist. Ab GROUP_FROM Losen fasst je Anschaffungsjahr eine Zeile zusammen, ein Klick öffnet
// sie; hat ein Jahr mehr als MONTH_FROM Lose, öffnet es zuerst Monatszeilen. Geöffnetes merkt sich die Seite (open, key).
const GROUP_FROM=12,MONTH_FROM=24,USES_LISTED=6;
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const amount=v=>D(v)===0n?'':pieces(v);
const span=(a,b)=>a===b?String(b):`${a}–${b}`;

// Hinweis über einer Zeile: wenige Abgänge einzeln, viele zusammengefasst; vollständig stehen sie im Kontoblatt und in Excel.
export function usesTitle(r){
 const n=r.uses.length,one=u=>`${date(u.date)} ${pieces(u.amount)} (${u.label})`;
 if(!n)return 'Noch nichts verbraucht';
 if(n<=USES_LISTED)return `Verbraucht: ${r.uses.map(one).join('; ')}`;
 return `Verbraucht durch ${n} Abgänge vom ${date(r.uses[0].date)} bis ${date(r.uses.at(-1).date)}, zuletzt: ${r.uses.slice(-3).map(one).join('; ')}. Alle Abgänge einzeln im Kontoblatt und in Excel.`;
}

export function lotsBlock(m,book=null,{open=null,key=''}={}){
 if(!m.rows.length)return '';
 const cur=esc(m.account.currency),earlier=m.rows.some(r=>D(r.earlier)!==0n),vat=Boolean(book),free=m.account.kind==='payment',now=today();
 const isOpen=(k,fallback)=>open?.has(k)?open.get(k):fallback;
 const spent=o=>`${earlier?`<td class="num">${amount(o.earlier)}</td>`:''}${m.years.map(y=>`<td class="num">${amount(o.perYear[y])}</td>`).join('')}`;
 const restOf=(o,cost)=>D(o.rest)===0n?'<td></td>':num(cost);
 const line=(r,i)=>`<tr class="line click" data-action="edit" data-id="${esc(r.eventId)}" tabindex="0" title="${esc(usesTitle(r))}"><td>${r.acquired?date(r.acquired):`Bestand ${date(r.opened)}`}</td><td>${esc(r.origin)}${r.via?`<small>${esc(r.via)}</small>`:''}</td><td class="num">${pieces(r.amount)}</td><td class="num">${r.rate?esc(r.rate.replace('.',',')):''}</td>${num(r.cost)}${vat?num(book.rows[i]?.cost??null):''}${spent(r)}<td class="num">${amount(r.rest)}</td>${restOf(r,r.restCost)}${vat?restOf(r,book.rows[i]?.restCost??null):''}${free?`<td class="num${r.freeFrom<=now?' muted':''}">${D(r.rest)>0n?`${r.freeKnown?'':'spätestens '}${date(r.freeFrom)}`:''}</td>`:''}</tr>`;
 const indexed=m.rows.map((r,i)=>({r,i}));
 const addUp=(list,pick)=>list.some(x=>pick(x)==null)?null:S(sum(list.map(x=>D(pick(x)))));
 // Zeile für ein Jahr oder einen Monat: Summen der enthaltenen Lose; „Steuerfrei ab“ nennt den Tag, ab dem alle offenen frei sind.
 const groupRow=(label,list,cls,id,expanded)=>{
  const rows=list.map(x=>x.r),sumOf=k=>addUp(rows,x=>x[k]),per=Object.fromEntries(m.years.map(y=>[y,addUp(rows,x=>x.perYear[y])])),openLots=rows.filter(x=>D(x.rest)>0n);
  const bookCost=vat?addUp(list,x=>book.rows[x.i]?.cost??null):null,bookRest=vat?addUp(list,x=>book.rows[x.i]?.restCost??null):null,totalRest=sumOf('rest');
  const last=openLots.map(x=>x.freeFrom).sort().at(-1),freeCell=!free?'':!last?'<td></td>':last<=now?'<td class="num muted">frei</td>':`<td class="num">alle ab ${date(last)}</td>`;
  return `<tr class="${cls} lots-group click" data-action="lots-year" data-key="${esc(`${key}:${id}`)}" tabindex="0" aria-expanded="${expanded}"><td>${esc(label)}</td><td>${rows.length} ${rows.length===1?'Los':'Lose'}, ${openLots.length} offen</td><td class="num">${pieces(sumOf('amount'))}</td><td></td>${num(sumOf('cost'))}${vat?num(bookCost):''}${spent({earlier:sumOf('earlier'),perYear:per})}<td class="num">${amount(totalRest)}</td>${restOf({rest:totalRest},sumOf('restCost'))}${vat?restOf({rest:totalRest},bookRest):''}${freeCell}</tr>`;
 };
 const lines=list=>list.map(x=>line(x.r,x.i)).join('');
 let body=`<tbody>${lines(indexed)}</tbody>`;
 if(m.rows.length>GROUP_FROM){
  const by=(list,cut)=>{const out=new Map();for(const x of list){const k=(x.r.acquired||x.r.opened).slice(0,cut);if(!out.has(k))out.set(k,[]);out.get(k).push(x);}return out;};
  body=[...by(indexed,4)].map(([y,list])=>{
   const yOpen=isOpen(`${key}:${y}`,false),head=`<tbody data-group="${y}">${groupRow(y,list,'stand year',y,yOpen)}</tbody>`;
   if(list.length<=MONTH_FROM)return `${head}<tbody data-parent="${y}"${yOpen?'':' hidden'}>${lines(list)}</tbody>`;
   return head+[...by(list,7)].map(([mo,part])=>{const mOpen=isOpen(`${key}:${mo}`,false);
    return `<tbody data-parent="${y}" data-group="${mo}"${yOpen?'':' hidden'}>${groupRow(`${MONTHS[Number(mo.slice(5))-1]} ${y}`,part,'month',mo,mOpen)}</tbody><tbody data-parent="${mo}"${yOpen&&mOpen?'':' hidden'}>${lines(part)}</tbody>`;}).join('');
  }).join('');
 }
 const head=`<tr><th>Angeschafft</th><th>Herkunft</th><th class="num">Zugang ${cur}</th><th class="num">Kurs</th><th class="num">EUR-Wert</th>${vat?'<th class="num">EUR zum USt-Kurs</th>':''}${earlier?`<th class="num">Abgang bis ${m.earlierUntil??m.fromYear-1}</th>`:''}${m.years.map(y=>`<th class="num">Abgang ${y}</th>`).join('')}<th class="num">Rest ${cur}</th><th class="num">Rest EUR</th>${vat?'<th class="num">Rest zum USt-Kurs</th>':''}${free?'<th class="num">Steuerfrei ab</th>':''}</tr>`;
 const t=m.totals,foot=`<tfoot><tr class="stand total"><td>Summe</td><td></td><td class="num">${pieces(t.amount)}</td><td></td>${num(t.cost)}${vat?num(book.totals.cost):''}${spent(t)}<td class="num">${amount(t.rest)}</td>${num(t.restCost)}${vat?num(book.totals.restCost):''}${free?'<td></td>':''}</tr></tfoot>`;
 const note=[m.hidden?`${m.hidden} Lose waren schon vor ${m.fromYear} aufgebraucht und fehlen hier.`:'',m.rows.length>GROUP_FROM?'Eine Jahreszeile anklicken öffnet ihre Lose, bei vielen Losen zuerst die Monate.':'',m.earlierUntil!=null&&m.earlierUntil>=m.fromYear?`Abgänge bis ${m.earlierUntil} stehen zusammen in einer Spalte; jedes Jahr einzeln steht in Excel.`:'',`Die ältesten Beträge gelten als zuerst verbraucht. Jede Gutschrift und jede Zinszahlung ist ein eigenes Los. Über einer Zeile steht, welche Abgänge das Los verbraucht haben; ein Klick öffnet den Vorgang.`].filter(Boolean).join(' ');
 return `<details class="block lots" data-keep="${esc(`${key}:lots`)}"${isOpen(`${key}:lots`,m.rows.length<=GROUP_FROM)?' open':''}><summary>Lose ${span(m.fromYear,m.toYear)}<small>${m.openCount} offen von ${m.rows.length}${vat?' · Tageskurs und USt-Kurs':''}</small></summary><div class="table-wrap"><table class="sheet lots"><thead>${head}</thead>${body}${foot}</table></div><p class="hint pad">${esc(note)}</p></details>`;
}

// Zinsen eines Kontos mit dem Steuerabzug laut Abrechnung, soweit er erfasst ist. Bei vielen Zahlungen zugeklappt.
export function interestBlock(r,currency,period,{open=null,key=''}={}){
 if(!r.lines.length)return '';
 const cur=esc(currency),t=r.totals,cell=v=>v==null?'<td></td>':num(v),rate=v=>v==null?'':esc(String(v).replace('.',','));
 const rows=r.lines.map(l=>`<tr class="line click" data-action="edit" data-id="${esc(l.eventId)}" tabindex="0"><td>${date(l.date)}</td>${num(l.gross)}${cell(l.capitalTax)}${cell(l.solidarity)}${cell(l.churchTax)}<td class="num">${pieces(l.credit)}</td><td class="num">${rate(l.rate)}</td>${num(l.eur)}</tr>`).join('');
 const k=`${key}:interest`,isOpen=open?.has(k)?open.get(k):r.lines.length<=24;
 return `<details class="block income fold" data-keep="${esc(k)}"${isOpen?' open':''}><summary><h3>Zinsen ${esc(period)}</h3><small>${r.lines.length} ${r.lines.length===1?'Zahlung':'Zahlungen'} · ${money(t.eur)} € EUR-Wert</small></summary><div class="table-wrap"><table class="sheet"><thead><tr><th>Datum</th><th class="num">Brutto EUR</th><th class="num">KapESt</th><th class="num">Soli</th><th class="num">KiSt</th><th class="num">Gutschrift ${cur}</th><th class="num">Kurs</th><th class="num">EUR-Wert</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="stand total"><td>Summe</td>${num(t.gross)}${cell(t.capitalTax)}${cell(t.solidarity)}${cell(t.churchTax)}<td class="num">${pieces(t.credit)}</td><td></td>${num(t.eur)}</tr></tfoot></table></div></details>`;
}
