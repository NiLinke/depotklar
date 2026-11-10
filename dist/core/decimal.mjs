// Fixed point, 12 decimal places. JSON stores decimal strings, never BigInt.
export const SCALE=1000000000000n;
export function D(value){
  if(typeof value==='bigint') return value;
  if(value===null||value===undefined||value==='') throw Error('Dezimalwert fehlt.');
  const s=String(value), m=s.match(/^(-?)(\d{1,18})(?:\.(\d{1,12}))?$/);
  if(!m)throw Error(`Ungültiger Dezimalwert: ${s}. Maximal 12 Nachkommastellen.`);
  return (m[1]?-1n:1n)*(BigInt(m[2])*SCALE+BigInt((m[3]||'').padEnd(12,'0')));
}
export function S(n){const sign=n<0n?'-':'';n=n<0n?-n:n;const f=String(n%SCALE).padStart(12,'0').replace(/0+$/,'');return sign+String(n/SCALE)+(f?'.'+f:'');}
export const mul=(a,b)=>a*b/SCALE;
export function div(a,b){if(!b)throw Error('Division durch null.');return a*SCALE/b;}
export const min=(a,b)=>a<b?a:b;
export const max=(a,b)=>a>b?a:b;
export const sum=xs=>xs.reduce((a,b)=>a+b,0n);
export function round(n,places=2,mode='half'){const step=10n**BigInt(12-places),abs=n<0n?-n:n;return (n<0n?-1n:1n)*((abs+(mode==='half'?step/2n:0n))/step)*step;}
export const euro=n=>S(round(n));
