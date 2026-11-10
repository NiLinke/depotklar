// Kleiner Formelrechner für die Prüffälle: rechnet die Formeln einer Excel-Mappe so nach, wie
// Excel sie liest – Zellbezüge, Bereiche, + − × ÷, Vergleiche und die im Rechenweg genutzten
// Funktionen. Leere Zellen zählen als 0. Gibt je Formelzelle das eigene Ergebnis zurück.
const FUNCTIONS={
 SUM:(...a)=>a.flat().reduce((x,y)=>x+(typeof y==='number'?y:0),0),
 MIN:(...a)=>Math.min(...a.flat().filter(v=>typeof v==='number')),
 MAX:(...a)=>Math.max(...a.flat().filter(v=>typeof v==='number')),
 ABS:x=>Math.abs(x),
 IF:(c,a,b)=>c?a:b,
 // Excel rundet kaufmännisch (halb von null weg); die kleine Zugabe gleicht die Binärdarstellung aus.
 ROUND:(x,d)=>Math.sign(x)*Math.round(Math.abs(x)*10**d+1e-9)/10**d,
 ROUNDDOWN:(x,d)=>Math.sign(x)*Math.floor(Math.abs(x)*10**d+1e-9)/10**d,
 SUMIF:(range,crit,sums)=>range.reduce((t,v,i)=>t+(v===crit&&typeof sums[i]==='number'?sums[i]:0),0)
};
const colNum=c=>[...c].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
const colName=n=>{let s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};

export function evaluator(ws){
 const memo=new Map();
 const raw=addr=>ws.getCell(addr).value;
 function valueAt(addr){
  if(memo.has(addr))return memo.get(addr);
  memo.set(addr,NaN);
  const v=raw(addr);let out;
  if(v&&typeof v==='object'&&'formula' in v)out=evaluate(v.formula);
  else if(v==null||v==='')out=0;
  else out=v;
  memo.set(addr,out);return out;
 }
 function range(t){
  const [a,b]=t.replace(/\$/g,'').split(':'),[,ca,ra]=a.match(/([A-Z]+)(\d+)/),[,cb,rb]=b.match(/([A-Z]+)(\d+)/),out=[];
  for(let r=Number(ra);r<=Number(rb);r++)for(let c=colNum(ca);c<=colNum(cb);c++){const v=raw(`${colName(c)}${r}`);out.push(v&&typeof v==='object'&&'formula' in v?valueAt(`${colName(c)}${r}`):v==null?null:v);}
  return out;
 }
 function evaluate(src){
  const tokens=src.match(/\$?[A-Z]{1,2}\$?\d+(?::\$?[A-Z]{1,2}\$?\d+)?|\d+(?:\.\d+)?|"[^"]*"|[A-Z]+(?=\()|<=|>=|<>|[-+*/(),<>=]/g);
  if(tokens.join('')!==src.replace(/\s/g,''))throw Error(`Formel nicht lesbar: ${src}`);
  let i=0;const peek=()=>tokens[i],next=()=>tokens[i++];
  const expr=()=>{let a=additive();while(['<','>','<=','>=','=','<>'].includes(peek())){const op=next(),b=additive();a={'<':a<b,'>':a>b,'<=':a<=b,'>=':a>=b,'=':a===b,'<>':a!==b}[op];}return a;};
  function additive(){let a=term();while(peek()==='+'||peek()==='-'){const op=next(),b=term();a=op==='+'?a+b:a-b;}return a;}
  function term(){let a=unary();while(peek()==='*'||peek()==='/'){const op=next(),b=unary();a=op==='*'?a*b:a/b;}return a;}
  function unary(){if(peek()==='-'){next();return -unary();}if(peek()==='+'){next();return unary();}return primary();}
  function primary(){
   const t=next();
   if(t==='('){const v=expr();if(next()!==')')throw Error(`Klammer fehlt: ${src}`);return v;}
   if(/^\d/.test(t))return Number(t);
   if(t[0]==='"')return t.slice(1,-1);
   if(FUNCTIONS[t]&&peek()==='('){next();const args=[];if(peek()!==')')for(;;){args.push(/:/.test(peek())?range(next()):expr());if(peek()===',')next();else break;}next();return FUNCTIONS[t](...args);}
   if(/^\$?[A-Z]{1,2}\$?\d+$/.test(t))return valueAt(t.replace(/\$/g,''));
   throw Error(`Unbekannt: ${t} in ${src}`);
  }
  const v=expr();if(i!==tokens.length)throw Error(`Rest in ${src}`);return v;
 }
 // Alle Formelzellen: Adresse, Formel, gespeichertes Ergebnis und eigenes Ergebnis.
 const formulas=()=>{const out=[];ws.eachRow(r=>r.eachCell(c=>{const v=c.value;if(v&&typeof v==='object'&&'formula' in v)out.push({address:c.address,formula:v.formula,result:c.result,own:valueAt(c.address)});}));return out;};
 return {valueAt,formulas};
}
