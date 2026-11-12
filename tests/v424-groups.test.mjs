import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyState,validate,upgrade,withRecord,withoutRecord,withEvent,PERSON_COLORS,COLLECTIONS} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {undoPlan,undoAudit} from '../dist/core/undo.mjs';
import {demoState} from '../dist/core/sample.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {byGroup,groupOf,tone,nextColor,personMenuHTML,initials,COLOR_NAMES,SEARCH_FROM} from '../dist/ui/people.mjs';
import {findText,searchField} from '../dist/ui/format.mjs';
import {masterHTML} from '../dist/ui/master.mjs';
import {lockHTML,VAULT_SEARCH_FROM} from '../dist/ui/vaultui.mjs';
import {changes,subject,auditTarget} from '../dist/ui/audit.mjs';

const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8');
// Eine Familie mit zwei Gruppen: Anna und Ben bei „Nord“, Cem bei „Süd“, Dora ohne Gruppe.
function family(){
 let s=emptyState();
 for(const name of ['Anna Nord','Ben Nord','Cem Süd','Dora Frei'])s=withRecord(s,'persons',{name});
 s=withRecord(s,'personGroups',{name:'Nord',color:'blue'});s=withRecord(s,'personGroups',{name:'Süd',color:'green'});
 const [nord,sued]=s.personGroups,[a,b,c]=s.persons;
 for(const [p,g] of [[a,nord],[b,nord],[c,sued]])s=withRecord(s,'persons',{...p,groupId:g.id});
 return {s,nord,sued};
}

test('Gruppen: Name und Farbe, je Person höchstens eine, alles freiwillig',()=>{
 const {s,nord}=family();
 assert.equal(COLLECTIONS.personGroups,'Gruppe');assert.equal(PERSON_COLORS.length,8);assert.deepEqual(Object.keys(COLOR_NAMES),[...PERSON_COLORS]);
 assert.deepEqual(s.persons.map(p=>groupOf(s,p)?.name||null),['Nord','Nord','Süd',null]);
 // Name: nötig, höchstens 40 Zeichen, je Tresor einmal – Groß- und Kleinschreibung zählt nicht.
 assert.throws(()=>withRecord(s,'personGroups',{name:'  ',color:'red'}),/Gruppe: Name mit höchstens 40 Zeichen/);
 assert.throws(()=>withRecord(s,'personGroups',{name:'x'.repeat(41),color:'red'}),/höchstens 40 Zeichen/);
 assert.throws(()=>withRecord(s,'personGroups',{name:'NORD',color:'red'}),/Gruppe NORD: Den Namen gibt es schon/);
 assert.equal(withRecord(s,'personGroups',{...nord,name:'Norden',color:'violet'}).personGroups[0].name,'Norden','umbenennen und umfärben an einer Stelle');
 // Farbe: nur eine der hinterlegten Kennungen – auch aus einer Tresordatei fremder Herkunft.
 assert.throws(()=>withRecord(s,'personGroups',{name:'Ost',color:'pink'}),/Gruppe Ost: unbekannte Farbe/);
 assert.throws(()=>withRecord(s,'personGroups',{name:'Ost',color:'blue"><script>'}),/unbekannte Farbe/);
 assert.throws(()=>withRecord(s,'personGroups',{name:'Ost'}),/unbekannte Farbe/);
 // Eine Person verweist nur auf eine vorhandene Gruppe; ohne Angabe gehört sie zu keiner.
 assert.throws(()=>withRecord(s,'persons',{...s.persons[3],groupId:'gibt-es-nicht'}),/Dora Frei: Die Gruppe gibt es nicht/);
 const {groupId:_,...ohne}=s.persons[0];assert.equal(groupOf(withRecord(s,'persons',ohne),ohne),null);
 // Löschen: nur eine leere Gruppe, mit klarer Meldung.
 assert.throws(()=>withoutRecord(s,'personGroups',nord.id),/Gruppe hat noch Personen\. Zuerst bei diesen Personen eine andere oder keine Gruppe wählen\./);
 const leer=withRecord(s,'personGroups',{name:'Leer',color:'gray'}),gone=withoutRecord(leer,'personGroups',leer.personGroups.at(-1).id);
 assert.equal(gone.personGroups.length,2);assert.equal(gone.audit.at(-1).action,'Gruppe gelöscht');
});

test('Gruppen: ältere Tresore ohne Gruppen öffnen unverändert; die Rechnung kennt keine Gruppen',()=>{
 // Stand aus der Zeit vor 4.24: Der Datenbereich fehlt und wird beim Öffnen ergänzt.
 const old=emptyState();delete old.personGroups;validate(old);upgrade(old);assert.deepEqual(old.personGroups,[]);
 const added=withRecord((()=>{const o=emptyState();delete o.personGroups;return o;})(),'personGroups',{name:'Neu',color:'teal'});assert.equal(added.personGroups.length,1);
 const broken=emptyState();broken.personGroups='x';assert.throws(()=>validate(broken),/personGroups ungültig/);
 // Dieselben Bestände und Steuerwerte mit und ohne Gruppen: Gruppen ordnen nur die Anzeige.
 const plain=demoState();let grouped=withRecord(plain,'personGroups',{name:'Eltern',color:'blue'});
 for(const p of plain.persons)grouped=withRecord(grouped,'persons',{...p,groupId:grouped.personGroups[0].id});
 const totals=st=>JSON.stringify([...replay(st,{until:'2026-12-31'}).positions].map(([k,lots])=>[k,lots.map(l=>[l.quantity,l.cost])]));
 assert.equal(totals(grouped),totals(plain));
 // Der ganze Jahresbericht je Person ist derselbe – Steuer, Töpfe, Bescheinigungen, Hinweise.
 for(const p of plain.persons)assert.equal(JSON.stringify(yearReport(grouped,p.id,2026)),JSON.stringify(yearReport(plain,p.id,2026)),p.name);
 assert.match(String(yearReport(grouped,'p1',2026).total),/^\d+(\.\d+)?$/,'verglichen werden echte Werte');assert.ok(totals(plain).length>200);
});

test('Gruppen im Protokoll: lesbar, zum Öffnen und zum Zurücknehmen',()=>{
 const {s,nord,sued}=family(),anna=s.persons[0];
 const moved=withRecord(s,'persons',{...anna,groupId:sued.id}),entry=moved.audit.at(-1);
 assert.deepEqual(changes(moved,entry),['Gruppe: Nord → Süd']);assert.equal(subject(moved,entry),'Anna Nord');
 const recolored=withRecord(s,'personGroups',{...nord,color:'red'});
 assert.deepEqual(changes(recolored,recolored.audit.at(-1)),['Farbe: Blau → Rot']);assert.equal(subject(recolored,recolored.audit.at(-1)),'Nord');
 assert.deepEqual(auditTarget(recolored,recolored.audit.at(-1)),{kind:'record',collection:'personGroups',id:nord.id});
 // Zurücknehmen läuft über dieselben Prüfungen: die Person ist wieder bei Nord, die Gruppe wieder blau.
 const back=undoAudit(moved,moved.audit.length-1);assert.equal(groupOf(back,back.persons[0]).name,'Nord');
 assert.equal(undoAudit(recolored,recolored.audit.length-1).personGroups[0].color,'blue');
 // Eine eben angelegte Gruppe lässt sich zurücknehmen, solange niemand in ihr ist.
 const fresh=withRecord(s,'personGroups',{name:'Ost',color:'teal'});assert.equal(undoAudit(fresh,fresh.audit.length-1).personGroups.length,2);
 const used=withRecord(fresh,'persons',{...fresh.persons[3],groupId:fresh.personGroups[2].id}),plan=undoPlan(used,fresh.audit.length-1);
 assert.equal(plan.ok,true);assert.throws(()=>plan.run(used),/Gruppe hat noch Personen/);
});

test('Personenwahl: nach Gruppen geordnet mit Farbe, Suchfeld erst bei vielen Personen',()=>{
 const {s}=family();
 assert.deepEqual(byGroup(s).map(x=>[x.group?.name||null,x.persons.map(p=>p.name)]),[['Nord',['Anna Nord','Ben Nord']],['Süd',['Cem Süd']],[null,['Dora Frei']]]);
 let menu=personMenuHTML(s,{current:s.persons[1].id});
 // Überschrift je Gruppe mit Farbpunkt, danach „Ohne Gruppe“; der Kreis mit den Initialen trägt die Farbe der Gruppe.
 assert.deepEqual([...menu.matchAll(/<div class="menu-head"><span class="dot([^"]*)"><\/span>([^<]*)<\/div>/g)].map(m=>[m[1].trim(),m[2]]),[['c-blue','Nord'],['c-green','Süd'],['','Ohne Gruppe']]);
 assert.match(menu,/aria-checked="true" data-action="person" data-person="[^"]+" data-find="ben nord nord" aria-label="Ben Nord" class="on"><span class="avatar c-blue">BN<\/span>/);
 assert.match(menu,/data-find="dora frei" aria-label="Dora Frei" class=""><span class="avatar">DF<\/span>/,'ohne Gruppe die bisherige Farbe');
 assert.match(menu,/<hr><button type="button" role="menuitemradio" aria-checked="false" data-action="person" data-person="" aria-label="Alle Personen"/);
 assert.doesNotMatch(personMenuHTML(s,{all:false}),/Alle Personen/,'auf der Steuerseite gibt es keine Summe');
 assert.match(personMenuHTML(s,{allOn:true}),/data-person="" aria-label="Alle Personen" class="on"/);
 // Wenige Personen: kein Suchfeld. Ab acht: Suchfeld und die Zeile für „keine Treffer“.
 assert.equal(SEARCH_FROM,8);assert.doesNotMatch(menu,/list-search/);
 let many=s;for(let i=0;i<4;i++)many=withRecord(many,'persons',{name:`Weitere ${i}`});
 menu=personMenuHTML(many);assert.equal(many.persons.length,8);
 assert.match(menu,/^<div class="menu" role="menu" data-searchable><input type="search" class="list-search" data-search placeholder="Person oder Gruppe suchen"/);
 assert.match(menu,/<p class="menu-none" data-find-none hidden>Keine Treffer\.<\/p>/);
 // Ohne Gruppen bleibt die Auswahl, wie sie war: keine Überschriften, keine Farbklassen.
 const demo=personMenuHTML(demoState(),{current:'p1'});
 assert.doesNotMatch(demo,/menu-head|list-search| c-/);assert.equal((demo.match(/data-action="person"/g)||[]).length,5);
 assert.match(demo,/<span class="avatar">AW<\/span><span>Alexander Weber<\/span>/);
});

test('Gruppen und Suche: Texte aus dem Tresor erscheinen nur maskiert',()=>{
 let s=emptyState();s=withRecord(s,'personGroups',{name:'<img src=x onerror=alert(1)>',color:'red'});
 s=withRecord(s,'persons',{name:'"><script>alert(2)</script>',groupId:s.personGroups[0].id});
 for(const html of [personMenuHTML(s),masterHTML(s),masterHTML(s,{editing:{collection:'personGroups',id:s.personGroups[0].id}})]){
  assert.doesNotMatch(html,/<img|<script/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 }
 assert.match(personMenuHTML(s),/data-find="&quot;&gt;&lt;script&gt;alert\(2\)&lt;\/script&gt; &lt;img src=x onerror=alert\(1\)&gt;"/);
 assert.match(lockHTML({vaults:Array.from({length:6},(_,i)=>({id:`v${i}`,name:`<b>T${i}</b>`,revision:1,fileName:'"x".depotklar',linked:true})),selected:'v0'}),/data-find="&lt;b&gt;t0&lt;\/b&gt; &quot;x&quot;\.depotklar"/);
 assert.equal(findText('Ärger','GROSS',null,''),'ärger gross');assert.match(searchField('A "B"'),/placeholder="A &quot;B&quot;" aria-label="A &quot;B&quot;"/);
 // Die Farbe wird nie als Text übernommen: Unbekanntes bekommt keine Klasse.
 assert.equal(tone({color:'blue'}),' c-blue');assert.equal(tone({color:'x" onclick="y'}),'');assert.equal(tone(null),'');
 assert.equal(initials('  anna  maria von nord '),'AM');assert.equal(initials(''),'');
});

test('Stammdaten: Gruppen anlegen, Personen zuordnen; ohne Gruppen die Liste wie bisher',()=>{
 // Ohne Gruppen: einfache Liste, kein Auswahlfeld für die Gruppe; der Block „Gruppen“ ist zugeklappt.
 let html=masterHTML(demoState());
 assert.doesNotMatch(html,/group-row|name="groupId"|class="dot/);assert.match(html,/<tr><td>Alexander Weber<\/td><td class="num">\d+ Depots<\/td>/);
 assert.match(html,/<details class="fold" data-keep="gruppen"><summary><h3>Gruppen<\/h3><small>freiwillig – ordnet viele Personen, zum Beispiel nach Haushalt<\/small><\/summary><form data-form="personGroups" >/);
 assert.match(html,/<select name="color" >(<option value="[a-z]+" (selected)?>[^<]+<\/option>){8}<\/select>/);assert.match(html,/<option value="blue" selected>Blau<\/option>/,'Vorschlag: die erste freie Farbe');
 assert.match(masterHTML(demoState(),{open:new Map([['gruppen',true]])}),/data-keep="gruppen" open>/,'bleibt nach dem Speichern aufgeklappt');
 // Mit Gruppen: je Gruppe eine Zeile mit Farbpunkt, Anzahl und „ändern / löschen“, darunter ihre Personen; leere Gruppen stehen auch da.
 const {s,nord}=family(),leer=withRecord(s,'personGroups',{name:'Leer',color:nextColor(s)});
 assert.equal(leer.personGroups[2].color,'teal','die nächste freie Farbe nach Blau und Grün');
 html=masterHTML(leer);
 assert.deepEqual([...html.matchAll(/<tr class="group-row"><th colspan="\d"><span class="dot([^"]*)"><\/span>([^<]+)(?:<span class="count">([^<]+)<\/span>)?/g)].map(m=>[m[1].trim(),m[2],m[3]||'']),
  [['c-blue','Nord','2 Personen'],['c-green','Süd','1 Person'],['c-teal','Leer','0 Personen'],['','Ohne Gruppe','']]);
 assert.match(html,new RegExp(`data-action="edit-record" data-collection="personGroups" data-id="${nord.id}"`));assert.match(html,/data-action="delete-record" data-collection="personGroups"/);
 assert.match(html,/<tr><td><span class="dot c-blue"><\/span>Anna Nord<\/td>/);assert.match(html,/<tr><td><span class="dot"><\/span>Dora Frei<\/td>/);
 assert.match(html,/<select name="groupId" ><option value="" selected>– keine –<\/option><option value="[^"]+" >Nord<\/option>/);
 // Bearbeiten: Person mit ihrer Gruppe vorbelegt; Gruppe mit Name und Farbe, der Block ist aufgeklappt.
 html=masterHTML(s,{editing:{collection:'persons',id:s.persons[0].id}});assert.match(html,new RegExp(`<option value="${nord.id}" selected>Nord</option>`));
 html=masterHTML(s,{editing:{collection:'personGroups',id:nord.id}});
 assert.match(html,new RegExp(`data-keep="gruppen" open>.*<form data-form="personGroups" data-id="${nord.id}">.*name="name" value="Nord"`,'s'));assert.match(html,/<option value="blue" selected>Blau<\/option>/);
 // Sind alle acht Farben vergeben, beginnt der Vorschlag von vorn.
 let full=emptyState();for(const c of PERSON_COLORS)full=withRecord(full,'personGroups',{name:`G ${c}`,color:c});assert.equal(nextColor(full),PERSON_COLORS[0]);
});

test('Tresorwahl: Suchfeld und begrenzte Höhe ab sechs Tresoren; die Seitenleiste nennt den Tresor, wenn es mehrere gibt',()=>{
 const vaults=n=>Array.from({length:n},(_,i)=>({id:`v${i}`,name:`Familie ${i}`,revision:i+1,linked:i===2,fileName:i===2?'haus-zwei.depotklar':null}));
 assert.equal(VAULT_SEARCH_FROM,6);
 let html=lockHTML({vaults:vaults(5),selected:'v1'});
 assert.doesNotMatch(html,/list-search|vault-list long/);assert.match(html,/<div class="vault-pick" data-searchable><div class="vault-list" role="radiogroup"/);
 html=lockHTML({vaults:vaults(6),selected:'v1'});
 assert.match(html,/<div class="vault-pick" data-searchable><input type="search" class="list-search" data-search placeholder="Tresor suchen" aria-label="Tresor suchen"[^>]*><div class="vault-list long" role="radiogroup" aria-label="Tresor">/);
 assert.match(html,/<p class="menu-none" data-find-none hidden>Kein Tresor mit diesem Namen\.<\/p>/);
 // Gesucht wird im Namen und im Namen der verbundenen Datei.
 assert.match(html,/data-vault="v2" data-find="familie 2 haus-zwei\.depotklar"><strong>Familie 2<\/strong>/);assert.match(html,/data-vault="v0" data-find="familie 0">/);
 assert.equal((html.match(/data-action="choose-vault"/g)||[]).length,6);
 // Das Suchfeld steht außerhalb des Formulars: Die Eingabetaste wählt einen Tresor und schickt kein Passwort ab.
 assert.ok(html.indexOf('data-search')<html.indexOf('<form data-form="unlock"'));assert.doesNotMatch(html.slice(html.indexOf('<form data-form="unlock"'),html.indexOf('</form>')),/data-search/);
 assert.doesNotMatch(lockHTML({vaults:vaults(1),selected:'v0'}),/vault-pick/,'ein einzelner Tresor braucht keine Auswahl');
 // Verdrahtung in der Anwendung: Tippen filtert, die Eingabetaste wählt den ersten Treffer, der Tresorname steht bei mehreren Tresoren unten.
 const app=read('dist/app.mjs'),css=read('dist/app.css');
 assert.match(app,/if\(ev\.target\.matches\?\.\('\[data-search\]'\)\)\{filterList\(ev\.target\);return;\}/);
 assert.match(app,/el\.hidden=!hit/);assert.match(app,/group\.hidden=!group\.querySelector\('\[data-find\]:not\(\[hidden\]\)'\)/);
 assert.match(app,/ev\.key==='Enter'&&ev\.target\.matches\?\.\('\[data-search\]'\)/);
 assert.match(app,/!demo&&vaults\.length>1\?`<span class="vault-name">Tresor: \$\{esc\(vaultMeta\?\.name\|\|'Tresor'\)\}<\/span>`:''/);
 assert.match(app,/personGroups:form=>/);assert.match(app,/masterHTML\(state,\{editing,open:openState\}\)/);
 // Farben stehen als Klassen im Stylesheet – die Sicherheitsrichtlinie der Seite erlaubt keine Angaben im Markup.
 for(const c of PERSON_COLORS)assert.match(css,new RegExp(`\\.c-${c}\\{--tone:#[0-9a-f]{6}\\}`),c);
 assert.match(css,/\[data-searchable\] \[hidden\]\{display:none!important\}/);
 for(const html of [personMenuHTML(family().s),masterHTML(family().s),lockHTML({vaults:vaults(7),selected:'v0'})])assert.doesNotMatch(html,/style="/);
});
