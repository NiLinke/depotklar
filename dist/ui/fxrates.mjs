import {RATES} from '../rates/index.mjs';

// Euro-Referenzkurse der EZB für Währungskonten. Sie werden je Währung erst bei
// Bedarf geladen und beim Erfassen vorgeschlagen, wenn kein EUR-Betrag und kein
// Kurs laut Abrechnung vorliegt. Gespeichert wird der übernommene Kurs mit Quelle
// am Vorgang; die Rechnung selbst braucht die Tabellen nicht.
const tables=new Map();
const day=d=>Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10)))/864e5;
const iso=n=>new Date(n*864e5).toISOString().slice(0,10);

export const hasRates=currency=>Object.hasOwn(RATES.currencies,currency);
export const ratesUntil=currency=>RATES.currencies[currency]?.to??null;

// Lädt die noch fehlenden Währungen; gibt zurück, wie viele neu geladen wurden.
export async function loadRates(currencies){
 const todo=[...new Set(currencies)].filter(c=>hasRates(c)&&!tables.has(c));
 await Promise.all(todo.map(async c=>{
  const {default:t}=await import(new URL(`../rates/${c}.mjs`,import.meta.url).href);
  const days=[],values=[];let d=day(t.from);
  t.data.split(',').forEach((x,i)=>{const [gap,v]=x.includes(':')?x.split(':'):[i?'1':'0',x];d+=Number(gap);days.push(d);values.push(v);});
  tables.set(c,{days,values,last:day(t.to)});
 }));
 return todo.length;
}

// Kurs des Tages oder – an Wochenenden und Feiertagen – der letzte davor, höchstens
// zehn Tage zurück. Nach dem Ende der hinterlegten Reihe gibt es keinen Vorschlag.
export function ecbRate(currency,date){
 const t=tables.get(currency);if(!t||!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const target=day(date);if(target>t.last)return null;
 let lo=0,hi=t.days.length-1,hit=-1;
 while(lo<=hi){const mid=(lo+hi)>>1;if(t.days[mid]<=target){hit=mid;lo=mid+1;}else hi=mid-1;}
 if(hit<0||target-t.days[hit]>10)return null;
 return {rate:t.values[hit],date:iso(t.days[hit])};
}
