import {periodStatement} from '../core/statement.mjs';

// Gemeinsame Grundlage für PDF und Excel: dieselben Zeilen, dieselbe Gliederung.

// Wertpapierblätter: je Person, Depot und Wertpapier beide Betrachtungen im Zeitraum.
export function securityPages(s,{year,from=year,personId='',securityId='',depotId=''}){
 const pages=[];
 for(const person of s.persons.filter(p=>!personId||p.id===personId))
  for(const depot of s.depots.filter(d=>d.personId===person.id&&(!depotId||d.id===depotId))){
   const eco=periodStatement(s,depot.id,from,year,'economic',{securityId}),tax=periodStatement(s,depot.id,from,year,'tax',{securityId});
   for(const r of eco.rows)pages.push({person,depot,security:r.security,regimes:r.regimes,economic:r,tax:tax.rows.find(x=>x.securityId===r.securityId)||null,sales:eco.sales.filter(x=>x.securityId===r.securityId),from,to:year});
  }
 return pages;
}

// Gliederung einer Zeilenliste: Leerzeilen trennen Abschnitte; eine einzelne Zelle am
// Anfang ist die Überschrift, eine Zeile aus mindestens drei Texten danach der
// Tabellenkopf. Einzelne Zellen mitten im Abschnitt sind Gruppenzeilen (das Wertpapier).
export function blocksFromRows(rows){
 const blocks=[];let cur=null;
 const flush=()=>{if(cur&&(cur.title||cur.head||cur.rows.length))blocks.push(cur);cur=null;};
 for(const row of rows){
  if(!row.length){flush();continue;}
  if(!cur)cur={title:null,head:null,rows:[]};
  if(!cur.title&&!cur.head&&!cur.rows.length&&row.length===1){cur.title=String(row[0]);continue;}
  if(!cur.head&&!cur.rows.length&&row.length>=3&&row.every(c=>c==null||typeof c==='string')){cur.head=row.map(c=>c??'');continue;}
  cur.rows.push(row);
 }
 flush();return blocks;
}

// Hervorgehobene Zeilen: Bestände und Summen.
export const isTotalRow=row=>typeof row[0]==='string'&&/^(Stand |Summe |Bemessungsgrundlage|Steuer laut Modell|Steuerpflichtig|Erwartete )/.test(row[0]);
// Spalten mit Stückzahlen oder Fremdwährungsbeträgen statt Euro, Devisenkurse mit vier Stellen.
export const isPieceColumn=h=>/Stück|^[A-Z]{3}$|(Bestand|Zugang|Rest) (?!EUR)[A-Z]{3}|^Abgang /.test(h||'');
export const isRateColumn=h=>/Devisenkurs/.test(h||'');
export const isoDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
