// Lädt die Euro-Referenzkurse der Europäischen Zentralbank und legt je Währung ein
// Modul unter dist/rates ab. Läuft geplant über .github/workflows/rates.yml, von Hand mit
// npm run rates; die App selbst baut keine Verbindung auf.
// Quelle und Nutzung: https://data.ecb.europa.eu – Wiederverwendung mit Quellenangabe.
import {writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const CURRENCIES=['USD','GBP','CHF','JPY','CAD','AUD','NZD','SEK','NOK','DKK','PLN','CZK','HUF','HKD','SGD','CNY','ZAR'];
const url=c=>`https://data-api.ecb.europa.eu/service/data/EXR/D.${c}.EUR.SP00.A?format=csvdata&detail=dataonly`;
const day=d=>Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10)))/864e5;
const out=new URL('../dist/rates/',import.meta.url);

// Die Quellen antworten gelegentlich mit einem Zeitfehler: bis zu viermal versuchen.
const load=async u=>{let res=null;for(let i=0;i<4&&!res?.ok;i++){if(i)await new Promise(r=>setTimeout(r,5000*i));res=await fetch(u).catch(()=>null);}return res||{ok:false,status:'keine Verbindung'};};
async function series(c){
 const res=await load(url(c));if(!res.ok)throw Error(`${c}: EZB antwortet mit ${res.status}.`);
 const [head,...lines]=(await res.text()).trim().split(/\r?\n/),cols=head.split(','),di=cols.indexOf('TIME_PERIOD'),vi=cols.indexOf('OBS_VALUE');
 const rows=lines.map(l=>l.split(',')).map(r=>[r[di],r[vi]]).filter(([d,v])=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&/^\d+(\.\d+)?$/.test(v)).sort((a,b)=>a[0].localeCompare(b[0]));
 if(rows.length<1000)throw Error(`${c}: unerwartet wenige Kurse (${rows.length}).`);
 return rows;
}

// Kompakt: Abstand in Tagen zum vorigen Kurs und Kurs; Abstand 1 entfällt.
const encode=(rows,before=null)=>{let prev=before;return rows.map(([d,v])=>{const gap=prev==null?0:day(d)-day(prev),first=prev==null;prev=d;return gap===1||first?v:`${gap}:${v}`;}).join(',');};

// Die bisherige Reihe bleibt unverändert; angehängt werden nur Tage nach ihrem Ende.
export function extendTable(old,c,rows){
 if(!old)return {currency:c,from:rows[0][0],to:rows.at(-1)[0],source:url(c),data:encode(rows)};
 const fresh=rows.filter(([d])=>d>old.to);
 return fresh.length?{...old,to:fresh.at(-1)[0],data:`${old.data},${encode(fresh,old.to)}`}:old;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 // Erst alle Währungen holen, dann schreiben: Ein Abbruch lässt die Dateien unberührt.
 const tables={};
 for(const c of CURRENCIES){
  const {default:old}=await import(new URL(`${c}.mjs`,out).href).catch(()=>({default:null})),rows=await series(c);
  tables[c]=extendTable(old,c,rows);
  console.log(`${c}: ${tables[c].from} bis ${tables[c].to}`);
 }
 await mkdir(out,{recursive:true});
 const index={};
 for(const [c,table] of Object.entries(tables)){
  await writeFile(new URL(`${c}.mjs`,out),`// Euro-Referenzkurse der Europäischen Zentralbank: ${c} je 1 EUR, je Geschäftstag.\n// Quelle: Europäische Zentralbank. Erzeugt mit scripts/fxrates.mjs, nicht von Hand ändern.\nexport default ${JSON.stringify(table)};\n`);
  index[c]={from:table.from,to:table.to};
 }
 await writeFile(new URL('index.mjs',out),`// Hinterlegte Euro-Referenzkurse der EZB je Währung. Erzeugt mit scripts/fxrates.mjs.\nexport const RATES=${JSON.stringify({source:'Europäische Zentralbank, Euro-Referenzkurse',currencies:index})};\n`);
}
