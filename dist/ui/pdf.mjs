import {APP_VERSION,today,accountHolder,ACCOUNT_KINDS} from '../core/model.mjs';
import {KINDS} from '../core/rules.mjs';
import {money,pieces,unit,date} from './format.mjs';
import {securityPages,blocksFromRows,isTotalRow,isPieceColumn,isRateColumn,isoDate} from './report.mjs';
import {sheetRows,taxRows,auditRows,accountRows,standaloneAccounts,saleRows} from './xlsx.mjs';

// Alle Ausdrucke als PDF-Datei, erzeugt mit jsPDF: Zahlen bleiben kopierbarer Text,
// Hoch- oder Querformat hängt nicht vom Druckertreiber ab.
// - Wertpapierblätter: je Person, Depot und Wertpapier eine Querseite, oben die
//   wirtschaftliche, darunter die steuerliche Betrachtung – wie das frühere Excel-Blatt.
// - Übersicht je Depot, Steuerjahr je Person und Protokoll aus denselben Zeilen wie
//   die Excel-Mappe.
export {securityPages};
const COLORS={economic:[31,79,143],tax:[148,86,15],plain:[16,24,40]};
const FILLS={economic:[237,243,251],tax:[251,243,230],plain:[242,244,247]};
const HEAD=['Vorgang','Datum','Stück','Wert','Erlös','Gewinn','Bestand Stück','Bestand Wert'];
// Standardschrift Helvetica kennt nur WinAnsi (Latin-1 und wenige Zeichen wie € – „ “): Schon ein einzelnes anderes Zeichen
// entstellt in jsPDF den ganzen Text. Deshalb übliche Zeichen umschreiben, bei Buchstaben außerhalb von WinAnsi die Akzente
// weglassen (ź → z, Č → C) und alles Übrige durch ein Fragezeichen ersetzen.
const WINANSI_EXTRA='€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const TRANSLIT={'−':'-','‐':'-','‑':'-','‒':'-','―':'-','′':"'",'″':'"','≈':'~','≠':'!=','№':'Nr.','Ł':'L','ł':'l','Đ':'D','đ':'d','ı':'i','Ħ':'H','ħ':'h','Ŧ':'T','ŧ':'t','ĸ':'k','ŉ':"'n",'ẞ':'SS','∑':'Summe','✓':'ok','✔':'ok'};
const winAnsi=text=>text.replace(/[^\u0000-\u00ff]/gu,c=>{
 if(WINANSI_EXTRA.includes(c))return c;if(Object.hasOwn(TRANSLIT,c))return TRANSLIT[c];
 const bare=c.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 return bare&&!/[^\u0000-\u00ff]/u.test(bare)?bare:'?';
});
const plain=v=>winAnsi(basicText(v));
const basicText=v=>String(v??'').replace(/[→⇒]/g,'->').replace(/[≤]/g,'<=').replace(/[≥]/g,'>=').replace(/[  ]/g,' ');
const span=(from,to)=>from===to?String(to):`${from}–${to}`;
const toneOf=title=>/^Wirtschaftliche/.test(title||'')?'economic':/^Steuerliche/.test(title||'')?'tax':'plain';
// Matrix der Lose im Querformat: höchstens so viele Jahresspalten, ältere Abgänge in einer Spalte (Excel zeigt jedes Jahr).
const PDF_YEARS=5;
const TABLE={theme:'grid',styles:{font:'helvetica',fontSize:8,cellPadding:1.4,lineColor:[208,213,221],lineWidth:0.1,textColor:[16,24,40],valign:'top',overflow:'linebreak'}};

function newDoc(jsPDF,orientation,title){
 const doc=new jsPDF({orientation,unit:'mm',format:'a4'});
 doc.setProperties({title:plain(title),creator:`Depotklar ${APP_VERSION}`});
 return doc;
}
// Kopf einer Seite: Titel und bis zu zwei Zeilen darunter; gibt die nächste freie Höhe zurück.
function heading(doc,M,title,lines=[]){
 doc.setFont('helvetica','bold');doc.setFontSize(14);doc.setTextColor(16,24,40);doc.text(plain(title),M,M+4);
 doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(71,84,103);
 lines.filter(Boolean).forEach((l,i)=>doc.text(plain(l),M,M+9.5+i*4.5));
 return M+10+lines.filter(Boolean).length*4.5;
}
// Fußzeile mit Stand und Seitenzahl auf jeder Seite.
function footer(doc,M){
 const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),n=doc.getNumberOfPages();
 for(let i=1;i<=n;i++){
  doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(102,112,133);
  doc.text(plain(`Depotklar ${APP_VERSION} · Modellrechnung, kein Steuerbescheid · Stand ${date(today())}`),M,H-7);
  doc.text(`Seite ${i} von ${n}`,W-M,H-7,{align:'right'});
 }
 return doc;
}
const empty=(doc,M,text)=>{doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(71,84,103);doc.text(plain(text),M,M+20);};

// Abschnitte aus Zeilen: Überschrift, Tabellenkopf, Zeilen. Zahlen deutsch formatiert,
// Daten als TT.MM.JJJJ, Bestände und Summen fett, Gruppenzeilen über die ganze Breite.
function renderBlocks(doc,autoTable,blocks,{y,M}){
 const H=doc.internal.pageSize.getHeight(),narrow=doc.internal.pageSize.getWidth()<250;
 for(const block of blocks){
  // Ohne Tabellenkopf fallen Spalten weg, die in keiner Zeile etwas enthalten (Zeilen „Bezeichnung … Betrag“).
  const filled=i=>block.rows.some(r=>r.length>1&&r[i]!=null&&r[i]!=='');
  const keep=block.head?null:Array.from({length:Math.max(...block.rows.map(r=>r.length),1)},(_,i)=>i).filter(i=>i===0||filled(i));
  const b=keep?{...block,rows:block.rows.map(r=>r.length===1?r:keep.map(i=>r[i]))}:block;
  const width=Math.max(b.head?.length||0,...b.rows.map(r=>r.length),1),tone=toneOf(b.title);
  // Breite Tabellen im Hochformat kleiner setzen; Daten und Beträge nicht mitten im Wert umbrechen.
  const small=narrow&&width>=7||width>=12,columnStyles={};
  for(let i=1;i<width;i++){if(b.rows.some(r=>isoDate(r[i])))columnStyles[i]={minCellWidth:small?16:18};else if(b.rows.some(r=>typeof r[i]==='number'))columnStyles[i]={minCellWidth:small?17:20};}
  if(b.title){
   if(y>H-35){doc.addPage();y=M;}
   doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...COLORS[tone]);doc.text(plain(b.title),M,y+3);y+=5;
  }
  if(!b.head&&!b.rows.length)continue;
  const kind=i=>isRateColumn(b.head?.[i])?'rate':isPieceColumn(b.head?.[i])?'piece':'money';
  const cell=(v,i)=>v==null?'':typeof v==='number'?({rate:unit,piece:pieces,money}[kind(i)])(v):isoDate(v)?date(v):plain(v);
  const body=b.rows.map(r=>r.length===1?[{content:plain(r[0]),colSpan:width,styles:{fontStyle:'bold',fillColor:[246,247,249]}}]:Array.from({length:width},(_,i)=>cell(r[i],i)));
  autoTable(doc,{...TABLE,startY:y,margin:{left:M,right:M,bottom:16},showHead:'everyPage',
   head:b.head?[b.head.map(plain)]:undefined,body,columnStyles,
   styles:{...TABLE.styles,...(small?{fontSize:7,cellPadding:1.1}:{})},
   headStyles:{fillColor:FILLS[tone],textColor:COLORS[tone],fontStyle:'bold'},
   didParseCell:d=>{
    if(d.section!=='body'){if(b.rows.some(r=>typeof r[d.column.index]==='number'))d.cell.styles.halign='right';return;}
    const raw=b.rows[d.row.index];if(raw.length===1)return;const v=raw[d.column.index];
    if(typeof v==='number'){d.cell.styles.halign='right';if(v<0)d.cell.styles.textColor=[180,35,24];}
    if(isTotalRow(raw)){d.cell.styles.fontStyle='bold';d.cell.styles.fillColor=[246,247,249];}
   }});
  y=doc.lastAutoTable.finalY+6;
 }
 return y;
}

// Zeilen einer Betrachtung für ein Wertpapier: Stand 01.01., Vorgänge, Stand 31.12. je Jahr.
function rowsOf(r){
 const out=[{stand:true,cells:[`Stand 01.01.${r.firstYear}`,'','','','','',pieces(r.opening.quantity),money(r.opening.value)]}];
 for(const seg of r.segments){
  for(const l of seg.lines)out.push({cells:[l.note?`${l.label}\n${l.note}`:l.label,date(l.date),l.quantity&&Number(l.quantity)!==0?pieces(l.quantity):'',l.value==null&&l.type!=='vap'?'':money(l.value),l.proceeds==null?'':money(l.proceeds),l.gain==null?'':money(l.gain),pieces(l.balanceQuantity),money(l.balanceValue)],neg:[l.quantity,l.value,l.gain].map(v=>v!=null&&Number(v)<0)});
  const note=`${seg.unitValue==null?'Wert je Stück offen':`${unit(seg.unitValue)} je Stück`}${seg.market!=null?` · Marktwert ${money(seg.market)} (Kurs ${date(seg.price.date)})`:''}`;
  out.push({stand:true,cells:[`Stand 31.12.${seg.year}\n${note}`,'','','','','',pieces(seg.closing.quantity),money(seg.closing.value)]});
 }
 return out;
}

export function securitiesPdf(s,options,{jsPDF,autoTable}){
 const pages=securityPages(s,options),doc=newDoc(jsPDF,'landscape','Depotklar · Wertpapierblätter'),M=12;
 if(!pages.length){empty(doc,M,'Im gewählten Zeitraum keine Wertpapiere.');return footer(doc,M);}
 pages.forEach((p,i)=>{
  if(i)doc.addPage();
  let y=heading(doc,M,p.security.name,[[p.security.isin||'ohne ISIN',KINDS[p.security.kind],...p.regimes].join(' · '),`${p.person.name} · ${p.depot.name} · ${p.depot.bank||'Bank offen'}${p.depot.account?` · Buchhaltung Konto ${p.depot.account}`:''} · Zeitraum ${span(p.from,p.to)}`]);
  for(const [basis,label,r] of [['economic','Wirtschaftliche Betrachtung',p.economic],['tax','Steuerliche Betrachtung',p.tax]]){
   if(!r)continue;
   const rows=rowsOf(r),color=COLORS[basis];
   doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...color);doc.text(`${label} ${span(p.from,p.to)}`,M,y+3);
   autoTable(doc,{...TABLE,startY:y+5,margin:{left:M,right:M,bottom:16},showHead:'everyPage',
    head:[HEAD],body:rows.map(x=>x.cells.map(plain)),
    headStyles:{fillColor:FILLS[basis],textColor:color,fontStyle:'bold'},
    columnStyles:{0:{cellWidth:'auto'},1:{cellWidth:20},2:{cellWidth:22},3:{cellWidth:27},4:{cellWidth:27},5:{cellWidth:27},6:{cellWidth:24},7:{cellWidth:29}},
    didParseCell:d=>{
     if(d.column.index>=2)d.cell.styles.halign='right';
     if(d.section!=='body')return;const row=rows[d.row.index];
     if(row.stand){d.cell.styles.fontStyle='bold';d.cell.styles.fillColor=[246,247,249];}
     if(row.neg&&[2,3,5].includes(d.column.index)&&row.neg[[2,3,5].indexOf(d.column.index)])d.cell.styles.textColor=[180,35,24];
    }});
   y=doc.lastAutoTable.finalY+7;
  }
  if(p.sales.length)renderBlocks(doc,autoTable,blocksFromRows(saleRows(p.sales,p.from,p.to)),{y,M});
 });
 return footer(doc,M);
}

// Übersicht: je Depot eine Querseite (oder mehr) mit beiden Betrachtungen aller
// Wertpapiere, Erträge und Währungskonten – wie die Jahresübersicht am Bildschirm.
export function overviewPdf(s,{year,from=year,personId='',securityId='',depotId=''},{jsPDF,autoTable}){
 const only=securityId?s.securities.find(x=>x.id===securityId)?.name||'':'';
 const doc=newDoc(jsPDF,'landscape',`Depotklar · Übersicht ${span(from,year)}${only?` · ${only}`:''}`),M=12;let first=true;
 for(const d of s.depots.filter(x=>(!personId||x.personId===personId)&&(!depotId||x.id===depotId))){
  const rows=sheetRows(s,d.id,{from,to:year,securityId,maxYears:PDF_YEARS});
  if(securityId&&!rows.some(r=>typeof r[0]==='string'&&r[0].startsWith('Stand 31.12.')))continue;
  if(!first)doc.addPage();first=false;
  const person=s.persons.find(p=>p.id===d.personId)?.name||'';
  const y=heading(doc,M,`${d.name} · Übersicht ${span(from,year)}`,[`${person} · ${d.bank||'Bank offen'}${d.account?` · Buchhaltung Konto ${d.account}`:''}${only?` · nur ${only}`:''}`]);
  renderBlocks(doc,autoTable,blocksFromRows(rows),{y,M});
 }
 // Währungskonten ohne Depot je Person auf eigener Seite.
 if(!securityId&&!depotId)for(const p of s.persons.filter(x=>!personId||x.id===personId)){
  const rows=accountRows(s,standaloneAccounts(s,p.id),from,year,{maxYears:PDF_YEARS});if(!rows.length)continue;
  if(!first)doc.addPage();first=false;
  const y=heading(doc,M,`Währungskonten · ${p.name} · ${span(from,year)}`,['Konten ohne Depot']);
  renderBlocks(doc,autoTable,blocksFromRows(rows),{y,M});
 }
 if(first)empty(doc,M,'Für diese Auswahl gibt es keine Depots oder Konten.');
 return footer(doc,M);
}

// Währungskonten: je Konto Kontoblatt, Zinsen, Matrix der Lose und Verbrauch je Abgang.
export function accountsPdf(s,{year,from=year,personId=''},{jsPDF,autoTable}){
 const doc=newDoc(jsPDF,'landscape',`Depotklar · Währungskonten ${span(from,year)}`),M=12;let first=true;
 for(const a of (s.accounts||[]).filter(x=>!personId||accountHolder(s,x)?.personId===personId)){
  const rows=accountRows(s,[a],from,year,{details:true,maxYears:PDF_YEARS});if(!rows.length)continue;
  if(!first)doc.addPage();first=false;
  const h=accountHolder(s,a),owner=s.persons.find(p=>p.id===h.personId)?.name||'';
  const y=heading(doc,M,`${a.name} · ${a.currency} · ${span(from,year)}`,[`${owner} · ${h.depot?h.depot.name:'eigenes Konto'} · ${h.bank||'Bank offen'}${h.abroad?' · ausländische Bank':''} · ${ACCOUNT_KINDS[a.kind]}`]);
  renderBlocks(doc,autoTable,blocksFromRows(rows),{y,M});
 }
 if(first)empty(doc,M,'Für diese Auswahl gibt es keine Währungskonten.');
 return footer(doc,M);
}

// Steuerjahr einer Person im Hochformat: Erträge, Jahresrechnung, Bankabgleich, Formularwerte.
export function taxPdf(s,personId,year,{jsPDF,autoTable}){
 const person=s.persons.find(p=>p.id===personId)||s.persons[0],doc=newDoc(jsPDF,'portrait',`Depotklar · Steuer ${year} · ${person?.name||''}`),M=12;
 if(!person){empty(doc,M,'Keine Person angelegt.');return footer(doc,M);}
 const rows=taxRows(s,person.id,year).slice(1);
 const y=heading(doc,M,`Steuer ${year} · ${person.name}`,['Kapitalerträge aus den in Depotklar erfassten Depots. Modellrechnung, kein Steuerbescheid.']);
 renderBlocks(doc,autoTable,blocksFromRows(rows),{y,M});
 return footer(doc,M);
}

// Protokoll: jede Änderung mit Zeitpunkt, Gegenstand und Änderung, neueste zuerst.
export function auditPdf(s,{filter=''}={},{jsPDF,autoTable}){
 const doc=newDoc(jsPDF,'landscape','Depotklar · Protokoll'),M=12;
 const y=heading(doc,M,'Protokoll',[filter?'Auswahl wie am Bildschirm':'Alle Änderungen, neueste zuerst']);
 renderBlocks(doc,autoTable,blocksFromRows(auditRows(s,{filter})),{y,M});
 return footer(doc,M);
}
