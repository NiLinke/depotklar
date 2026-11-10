// Lädt die Umsatzsteuer-Umrechnungskurse aus dem Datenportal des BMF und legt sie in
// dist/rates/vat.mjs ab. Nur bei der Pflege ausführen (npm run rates:vat) und das Ergebnis
// versionieren; die App selbst baut keine Verbindung auf.
// Rechtsgrundlage: § 16 Abs. 6 UStG. Der geplante Lauf in .github/workflows/rates.yml ergänzt vorläufige Monate aus den EZB-Kursen (--ecb);
// fehlt ein Monat noch, trägt der Anwender ihn unter „Kurse“ ein.
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const SITE='https://www.bundesfinanzministerium.de';
const PAGE=`${SITE}/Datenportal/Daten/offene-daten/steuern-zoelle/umsatzsteuer-umrechnungskurse/umsatzsteuer-umrechnungskurse.html`;
const out=new URL('../dist/rates/vat.mjs',import.meta.url);

// Semikolongetrennt, Anführungszeichen können Zeilenumbrüche enthalten (ältere Jahrgänge).
export function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
  else if(c==='"')quoted=true;
  else if(c===';'){row.push(cell);cell='';}
  else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(cell||row.length){row.push(cell);rows.push(row);}
 return rows;
}
// „1,5340 AUD“, „7,4455DKK“, „1.456,78 KRW“: Kurs als Punktzahl und Code; alles andere ist kein Kurs.
export function parseCell(v){
 const m=/^(\d[\d.]*(?:,\d+)?)\s*([A-Z]{3})$/.exec(String(v).replace(/\s+/g,' ').trim());
 return m?{rate:m[1].replace(/\./g,'').replace(',','.'),currency:m[2]}:null;
}
// Je Währung und Jahr zwölf Stellen, ein leerer Monat bleibt leer.
export function parseYear(text){
 const found={};
 for(const row of parseCsv(text)){
  if(row[1]?.trim()!=='1 Euro')continue;
  row.slice(2,14).forEach((cell,month)=>{const c=parseCell(cell);if(c)(found[c.currency]??=Array(12).fill(''))[month]=c.rate;});
 }
 return found;
}

// Exaktes arithmetisches Mittel, kaufmännisch gerundet auf die Stellen des BMF.
function meanOf(values,places){
 const sum=values.reduce((a,v)=>{const [i,f='']=v.split('.');return a+BigInt(i+f.padEnd(8,'0').slice(0,8));},0n),n=BigInt(values.length),unit=10n**BigInt(8-places);
 const q=(sum*2n/(n*unit)+1n)/2n,text=String(q).padStart(places+1,"0");
 return `${text.slice(0,-places)}.${text.slice(-places)}`;
}

// Die Quellen antworten gelegentlich mit einem Zeitfehler: bis zu viermal versuchen.
const load=async u=>{let res=null;for(let i=0;i<4&&!res?.ok;i++){if(i)await new Promise(r=>setTimeout(r,5000*i));res=await fetch(u).catch(()=>null);}return res||{ok:false,status:'keine Verbindung'};};
// Einmal hinterlegte Monate bleiben unverändert: Ein Lauf ergänzt nur, was noch fehlt.
export function mergeVat(old,fresh){
 const out=structuredClone(old||{});
 for(const [c,years] of Object.entries(fresh))for(const [y,line] of Object.entries(years)){
  const had=(out[c]?.[y]||'').split(','),now=line.split(',');
  (out[c]??={})[y]=Array.from({length:12},(_,i)=>had[i]||now[i]||'').join(',');
 }
 return out;
}

// Abgeschlossene Monate nach dem letzten amtlichen Wert: vorläufig das Monatsmittel der EZB-Tageskurse,
// gerundet auf die Stellen des letzten amtlichen Werts der Währung. Der amtliche Wert ersetzt den vorläufigen.
export function provisionalMonths(table,ecb,current){
 const out={};
 for(const [c,months] of Object.entries(ecb)){
  const latest=Object.keys(table.rates[c]||{}).sort().reverse().flatMap(y=>table.rates[c][y].split(',').reverse()).find(Boolean),places=(latest||'').split('.')[1]?.length||0;
  if(!places)continue;
  for(const [m,list] of Object.entries(months))if(m>table.to&&m<current)(out[c]??={})[m]=meanOf(list,places);
 }
 return out;
}
// Die hinterlegten EZB-Tageskurse einer Währung je Monat.
async function ecbMonths(c){
 const {default:t}=await import(new URL(`../dist/rates/${c}.mjs`,import.meta.url).href),by={};let d=Date.parse(t.from)/864e5;
 t.data.split(',').forEach((x,i)=>{const [g,v]=x.includes(':')?x.split(':'):[i?'1':'0',x];d+=Number(g);(by[new Date(d*864e5).toISOString().slice(0,7)]??=[]).push(v);});
 return by;
}
const save=data=>writeFile(out,`// Umsatzsteuer-Umrechnungskurse des BMF nach § 16 Abs. 6 UStG: Fremdwährung je 1 EUR, Monatsdurchschnitte.\n// Quelle: Datenportal des Bundesministeriums der Finanzen. Erzeugt mit scripts/vatrates.mjs, nicht von Hand ändern.\nexport default ${JSON.stringify(data)};\n`);

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {default:old}=await import(out.href).catch(()=>({default:null}));
 if(process.argv.includes('--ecb')){
  // Der geplante Lauf: Das BMF sperrt automatische Abrufe aus Rechenzentren, die EZB-Kurse sind frei abrufbar.
  const ecb={};for(const c of Object.keys(old.rates)){const by=await ecbMonths(c).catch(()=>null);if(by)ecb[c]=by;}
  const {provisional:_,...table}=old,provisional=provisionalMonths(old,ecb,new Date().toISOString().slice(0,7));
  await save(Object.keys(provisional).length?{...table,provisional}:table);
  console.log(`Vorläufig nach ${old.to}: ${Object.keys(provisional).length} Währungen`);
 }else{
  const page=await (await load(PAGE)).text();
  const links=[...new Set(page.match(/\/Datenportal\/[^"]*uu-kurse-\d{4}-csv\.csv[^"]*/g)||[])].map(u=>u.replace(/&amp;/g,'&')).sort();
  if(links.length<17)throw Error(`Nur ${links.length} Jahrgänge gefunden.`);
  const rates={};let last='';
  for(const link of links){
   const year=/uu-kurse-(\d{4})/.exec(link)[1],res=await load(SITE+link);
   if(!res.ok)throw Error(`${year}: BMF antwortet mit ${res.status}.`);
   const table=parseYear(Buffer.from(await res.arrayBuffer()).toString('latin1'));
   if(!table.GBP)throw Error(`${year}: GBP fehlt.`);
   for(const [c,months] of Object.entries(table))(rates[c]??={})[year]=months.join(',');
   console.log(`${year}: ${Object.keys(table).length} Währungen`);
  }
  // Im BMF-Datensatz fehlen für 2010 bis 2014 die letzten Zeilen (Ungarn, USA). Die Kurse sind Monatsdurchschnitte der
  // EZB-Referenzkurse; diese Lücke füllt das Monatsmittel der hinterlegten EZB-Tageskurse, als abgeleitet gekennzeichnet.
  const derived={};
  for(const [c,places] of [['USD',4],['HUF',2]]){
   const by=await ecbMonths(c);
   for(let y=2010;y<2015;y++){
    if(rates[c]?.[y])continue;
    (rates[c]??={})[y]=Array.from({length:12},(_,m)=>{const list=by[`${y}-${String(m+1).padStart(2,'0')}`];return list?meanOf(list,places):'';}).join(',');
    (derived[c]??=[]).push(y);
   }
  }
  const merged=mergeVat(old?.rates,rates);
  for(const [y,line] of Object.entries(merged.GBP))line.split(',').forEach((v,i)=>{const m=`${y}-${String(i+1).padStart(2,'0')}`;if(v&&m>last)last=m;});
  if(old&&last<old.to)throw Error(`BMF-Tabelle endet bei ${last}, hinterlegt ist schon ${old.to}.`);
  await save({source:PAGE,legal:'https://www.gesetze-im-internet.de/ustg_1980/__16.html',from:'2010-01',to:last,derived,rates:merged});
  console.log(`bis ${last}, ${Object.keys(merged).length} Währungen`);
 }
}
