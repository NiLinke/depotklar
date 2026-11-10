import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {APP_VERSION,VERSION} from '../dist/core/model.mjs';
import {RULESET,BASE_RATES,TAX_YEARS,EXEMPTION,KINDS,RELATIONS,GIFT_TAX_YEARS,LAST_RULE_YEAR} from '../dist/core/rules.mjs';

// Veröffentlicht nur die ausdrücklich gelisteten Kapitel und die ausgelieferten
// Programmmodule – nie beliebige Dateien aus dem Arbeitsverzeichnis.
const root=new URL('../',import.meta.url),base='https://depotklar.niklaslinke.de';
const read=async p=>(await readFile(new URL(p,root),'utf8')).replaceAll('\r\n','\n');
const hash=t=>createHash('sha256').update(t).digest('hex');
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const CHAPTERS=[
 ['anleitung','Erste Schritte','public-docs/ANLEITUNG.md'],
 ['logik','Rechenlogik und Grenzen','public-docs/LOGIK.md'],
 ['tresor','Tresor, Sicherung und Datenschutz','public-docs/TRESOR.md'],
 ['ki-start','Einstieg für andere KI-Assistenten','public-docs/KI_START.md'],
 ['aenderungen','Änderungen','public-docs/AENDERUNGEN.md']
];
const routes=new Map(CHAPTERS.map(([id,,p])=>[p,`/doku/${id}.html`]));
export function safeLink(url){
 if(routes.has(url))return routes.get(url);
 if(url.startsWith('#')||url.startsWith('/')&&!url.startsWith('//')||/^https?:\/\//.test(url))return url;
 if(/^dist\/[\w/-]+\.mjs$/.test(url))return '/'+url.slice(5);
 return null;
}
function inline(text){let out='',pos=0;const tokens=/\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;for(const m of text.matchAll(tokens)){
 out+=esc(text.slice(pos,m.index));pos=m.index+m[0].length;
 if(m[1]!==undefined){const href=safeLink(m[2]);out+=href?`<a href="${esc(href)}">${esc(m[1])}</a>`:`<span>${esc(m[1])}</span>`;}
 else if(m[3]!==undefined)out+=`<code>${esc(m[3])}</code>`;else out+=`<strong>${esc(m[4])}</strong>`;
 }return out+esc(text.slice(pos));}
export function markdown(text){
 const lines=text.split('\n');let out='',list='',fence=false,code=[];const close=()=>{if(list){out+=`</${list}>`;list='';}};
 for(let n=0;n<lines.length;n++){
  const line=lines[n];
  if(line.startsWith('```')){close();if(fence){out+=`<pre><code>${esc(code.join('\n'))}</code></pre>`;code=[];}fence=!fence;continue;}
  if(fence){code.push(line);continue;}
  if(!line.trim()){close();continue;}
  const heading=/^(#{1,6}) (.+)$/.exec(line);if(heading){close();const level=heading[1].length;out+=`<h${level}>${inline(heading[2])}</h${level}>`;continue;}
  if(line.startsWith('|')&&/^\|[\s:|-]+\|?$/.test(lines[n+1]||'')){close();const rows=[line];n++;while(lines[n+1]?.startsWith('|'))rows.push(lines[++n]);
   out+='<div class="table-wrap"><table>'+rows.map((r,i)=>'<tr>'+r.replace(/^\||\|$/g,'').split('|').map(c=>`<${i?'td':'th'}>${inline(c.trim())}</${i?'td':'th'}>`).join('')+'</tr>').join('')+'</table></div>';continue;}
  const item=/^(\s*)(?:([-*])|\d+\.) (.+)$/.exec(line);if(item){const kind=item[2]?'ul':'ol';if(list!==kind){close();list=kind;out+=`<${kind}>`;}out+=`<li>${inline(item[3])}</li>`;continue;}
  close();out+=`<p>${inline(line)}</p>`;
 }
 close();return out;
}
async function sources(){
 const list=['app.mjs'];for(const dir of ['core','ui'])for(const f of (await readdir(new URL(`dist/${dir}/`,root))).filter(f=>f.endsWith('.mjs')).sort())list.push(`${dir}/${f}`);
 return list;
}
const CSS=`*{box-sizing:border-box}body{margin:0;color:#1f2937;background:#fff;font:16px/1.7 Inter,"Segoe UI",system-ui,sans-serif}a{color:#2f5d8a;text-underline-offset:3px}
header{padding:18px 4%;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}.brand{font-weight:750;font-size:22px;text-decoration:none;color:#1f2937}.brand span{color:#2f5d8a}
header nav{display:flex;gap:18px;flex-wrap:wrap;font-size:14px}.layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:48px;padding:32px 4% 64px;max-width:1200px;margin:auto}
aside a{display:block;padding:6px 0;text-decoration:none;color:#4b5563;font-size:14px}aside a.on{color:#1f2937;font-weight:650}aside input{width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-bottom:12px}
h1{font-size:34px;line-height:1.2;letter-spacing:-.02em}h2{margin-top:2em}code{background:#f3f4f6;padding:1px 5px;border-radius:4px;font-size:.9em}pre{background:#f3f4f6;padding:12px;overflow:auto}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f9fafb}
.lead{font-size:19px;color:#4b5563}.downloads{font-size:13px}@media(max-width:800px){.layout{grid-template-columns:1fr}}`;

export async function generate({check=false}={}){
 const docs=[];for(const [id,title,path] of CHAPTERS)docs.push({id,title,path,text:await read(path)});
 const files=await sources(),inputs=[...CHAPTERS.map(c=>c[2]),...files.map(p=>'dist/'+p),'scripts/docs.mjs','server.mjs','package.json'];
 const hashes={};for(const p of inputs)hashes[p]=hash(await read(p));
 const fingerprint=hash(JSON.stringify(hashes)),date=docs.find(d=>d.id==='aenderungen').text.match(/## (\d{4}-\d{2}-\d{2})/)?.[1]||'unbekannt';
 let rules=`# Aktuelle Versionen und hinterlegte Regeln\n\nApp ${APP_VERSION} | Regelpaket ${RULESET} | Datenformat ${VERSION}\n\nDokumentationsstand ${date}. Aus dem ausgelieferten Programm erzeugt; ein Build ist keine neue rechtliche Prüfung.\n\n## Basiszins der Vorabpauschale\n\n| Berechnungsjahr | Basiszins | Zufluss | Quelle |\n| --- | --- | --- | --- |\n`;
 for(const r of Object.values(BASE_RATES))rules+=`| ${r.year} | ${r.rate} | ${r.inflow} | [BMF](${r.source}) |\n`;
 rules+='\n## Persönliche Jahresrechnung\n\n| Jahr | Sparer-Pauschbetrag EUR |\n| --- | --- |\n';for(const r of Object.values(TAX_YEARS))rules+=`| ${r.year} | ${r.allowance} |\n`;
 rules+=`\nFolgejahre ab ${LAST_RULE_YEAR+1}: Der Sparer-Pauschbetrag und die übrigen Regeln gelten als Dauerrecht weiter, bis der Gesetzgeber sie ändert. Den jährlich neuen Basiszins trägt der Anwender unter „Kurse“ ein. Hinterlegte Werte eines späteren Updates haben Vorrang.\n`;
 rules+='\n## Teilfreistellung\n\n| Art | Anteil |\n| --- | --- |\n';for(const [k,v] of Object.entries(EXEMPTION))rules+=`| ${KINDS[k]} | ${v} |\n`;
 rules+=`\n## Schenkungsteuer\n\nBerechnet für Schenkungen ab ${GIFT_TAX_YEARS[0]} nach geltendem Recht.\n\n| Verhältnis | Freibetrag EUR |\n| --- | --- |\n`;for(const r of Object.values(RELATIONS))rules+=`| ${r.label} | ${r.allowance} |\n`;
 const sourceText='# Implementierungsquellen\n\nDiese Module bilden die ausgelieferte Anwendung. Rechenkern unter core, Darstellung unter ui. sample.mjs enthält ausschließlich erfundene Beispieldaten.\n\n'+files.map(p=>`- [${p}](/${p})`).join('\n')+'\n';
 docs.unshift({id:'versionen',title:'Versionen und Jahresregeln',text:rules});docs.push({id:'quellen',title:'Implementierungsquellen',text:sourceText});
 const meta={app:APP_VERSION,ruleset:RULESET,schema:VERSION,date,fingerprint,inputHashes:hashes,chapters:docs.map(({id,title})=>({id,title,url:`${base}/doku/${id}.html`,text:`${base}/doku/${id}.md`}))};
 const nav=active=>docs.map(d=>`<a data-search="${esc(d.title.toLowerCase())}" href="/doku/${d.id}.html" class="${d.id===active?'on':''}">${esc(d.title)}</a>`).join('');
 const page=(title,body,active='')=>`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Depotklar Dokumentation</title><meta name="description" content="Handbuch zu Depotklar: Bestände, Vorabpauschale, Altanteile und Steuer."><link rel="stylesheet" href="/doku/docs.css"><link rel="icon" href="/favicon.svg" type="image/svg+xml"></head><body><header><a class="brand" href="/">depotklar<span>.</span></a><nav><a href="/doku/">Handbuch</a><a href="/app/">Anwendung öffnen</a><a href="/llms.txt">Für KI-Assistenten</a></nav></header><div class="layout"><aside><input id="docs-search" type="search" placeholder="Kapitel suchen" aria-label="Kapitel suchen">${nav(active)}</aside><main>${body}</main></div><script type="module" src="/doku/docs.mjs"></script></body></html>\n`;
 const outputs=new Map(),set=(p,t)=>outputs.set('dist/'+p,t);
 set('doku/index.html',page('Handbuch',`<h1>Bestände fortschreiben.<br>Steuer nachvollziehen.</h1><p class="lead">Handbuch zu Depotklar ${APP_VERSION}: zwei Betrachtungen je Depot und Jahr, Altbestände vor 2009, Vorabpauschale, Schenkungen und die Werte für die eigene Steuererklärung.</p><ul>${docs.map(d=>`<li><a href="/doku/${d.id}.html">${esc(d.title)}</a></li>`).join('')}</ul>`));
 for(const d of docs){set(`doku/${d.id}.html`,page(d.title,`<p class="downloads"><a href="/doku/${d.id}.md">Als reinen Text öffnen</a></p>`+markdown(d.text),d.id));set(`doku/${d.id}.md`,d.text);}
 set('doku/manifest.json',JSON.stringify(meta,null,2)+'\n');
 set('doku/docs.css',CSS+'\n');
 set('doku/docs.mjs',`const search=document.querySelector('#docs-search');search?.addEventListener('input',()=>{const q=search.value.toLocaleLowerCase('de').trim();for(const n of document.querySelectorAll('[data-search]'))n.hidden=!n.dataset.search.includes(q);});\n`);
 set('llms.txt',`# Depotklar - Handbuch\n\nVersion ${APP_VERSION}; Regelpaket ${RULESET}; Datenformat ${VERSION}; Stand ${date}.\n\nZuerst ${base}/doku/ki-start.md lesen. Keine persönlichen Finanzdaten verfügbar. Fehlend ist nicht Null. Das Modell ist enger als das deutsche Steuerrecht.\n\n${docs.map(d=>`- ${d.title}: ${base}/doku/${d.id}.md`).join('\n')}\n\nVollständig: ${base}/llms-full.txt\n`);
 set('llms-full.txt',`# Depotklar - vollständige Dokumentation\n\n${rules}\n`+docs.filter(d=>d.id!=='versionen').map(d=>`\n----- KAPITEL: ${d.title} | ${base}/doku/${d.id}.md -----\n\n${d.text}`).join('\n'));
 let code=`Depotklar ${APP_VERSION} - ausgelieferter Quellcode. Versionsnachweis: ${base}/doku/manifest.json\n`;for(const p of files)code+=`\n\n===== DATEI dist/${p} =====\n`+await read('dist/'+p);set('doku/quellcode.txt',code);
 for(const [p,t] of outputs){
  if(check){let actual;try{actual=await read(p);}catch{throw Error('Dokumentationsdatei fehlt: '+p);}if(actual!==t)throw Error('Dokumentation veraltet: '+p+'; npm run docs ausführen.');}
  else{await mkdir(new URL(p.slice(0,p.lastIndexOf('/'))+'/',root),{recursive:true});await writeFile(new URL(p,root),t);}
 }
 if(check){const present=(await readdir(new URL('dist/doku/',root))).map(f=>'dist/doku/'+f);const extra=present.filter(p=>!outputs.has(p));if(extra.length)throw Error('Nicht erzeugte Dateien in dist/doku: '+extra.join(', '));}
 return {count:outputs.size,meta};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await generate({check:process.argv.includes('--check')});console.log(`Dokumentation ${process.argv.includes('--check')?'geprüft':'erstellt'}: ${r.count} Dateien, App ${r.meta.app}, ${r.meta.fingerprint.slice(0,12)}.`);}
