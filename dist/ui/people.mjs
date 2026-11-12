import {PERSON_COLORS} from '../core/model.mjs';
import {esc,findText,searchField} from './format.mjs';

// Viele Personen ordnen: Gruppen mit Farbe und eine Auswahl mit Suchfeld. Gruppen sind freiwillig – ohne Gruppen und
// mit wenigen Personen sieht die Auswahl aus wie bisher. Auf die Rechnung haben Gruppen keinen Einfluss.
export const COLOR_NAMES={blue:'Blau',green:'Grün',teal:'Türkis',violet:'Violett',red:'Rot',orange:'Orange',gold:'Gold',gray:'Grau'};
export const COLOR_OPTIONS=PERSON_COLORS.map(c=>[c,COLOR_NAMES[c]]);
// Ab so vielen Einträgen bekommt eine Auswahl ein Suchfeld.
export const SEARCH_FROM=8;

export const initials=name=>String(name||'').split(/\s+/).filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase();
export const groupOf=(s,person)=>(s.personGroups||[]).find(g=>g.id===person?.groupId)||null;
// Farbklasse für den Kreis mit den Initialen und den Farbpunkt: die der Gruppe, ohne Gruppe die bisherige Farbe.
export const tone=group=>group&&PERSON_COLORS.includes(group.color)?` c-${group.color}`:'';
// Vorschlag für eine neue Gruppe: die erste Farbe, die noch keine Gruppe trägt.
export const nextColor=s=>{const used=new Set((s.personGroups||[]).map(g=>g.color));return PERSON_COLORS.find(c=>!used.has(c))||PERSON_COLORS[(s.personGroups||[]).length%PERSON_COLORS.length];};

// Personen je Gruppe, in der Reihenfolge der Gruppen; danach die ohne Gruppe (group: null).
// empty: auch Gruppen ohne Personen nennen – für die Stammdaten, wo sie angelegt und gelöscht werden.
export function byGroup(s,{empty=false}={}){
 const groups=s.personGroups||[],known=new Set(groups.map(g=>g.id));
 const out=groups.map(group=>({group,persons:s.persons.filter(p=>p.groupId===group.id)})).filter(x=>empty||x.persons.length);
 const rest=s.persons.filter(p=>!known.has(p.groupId));
 if(rest.length)out.push({group:null,persons:rest});
 return out;
}

// Einträge der Personenwahl: nach Gruppen mit Überschrift, sobald es Gruppen gibt; ab SEARCH_FROM Personen mit Suchfeld.
// Gesucht wird in Name und Gruppe. current: gewählte Person; all: „Alle Personen“ anbieten; allOn: „Alle Personen“ ist gewählt.
export function personMenuHTML(s,{current='',all=true,allOn=false}={}){
 const sections=byGroup(s),grouped=(s.personGroups||[]).length>0,search=s.persons.length>=SEARCH_FROM;
 const item=(p,group)=>`<button type="button" role="menuitemradio" aria-checked="${p.id===current}" data-action="person" data-person="${esc(p.id)}" data-find="${esc(findText(p.name,group?.name))}" aria-label="${esc(p.name)}" class="${p.id===current?'on':''}"><span class="avatar${tone(group)}">${esc(initials(p.name))}</span><span>${esc(p.name)}</span></button>`;
 const section=x=>`<div class="menu-group" role="group" data-find-group${grouped?` aria-label="${esc(x.group?.name||'Ohne Gruppe')}"`:''}>${grouped?`<div class="menu-head"><span class="dot${tone(x.group)}"></span>${esc(x.group?.name||'Ohne Gruppe')}</div>`:''}${x.persons.map(p=>item(p,x.group)).join('')}</div>`;
 return `<div class="menu" role="menu" data-searchable>${search?searchField('Person oder Gruppe suchen'):''}${sections.map(section).join('')}${search?'<p class="menu-none" data-find-none hidden>Keine Treffer.</p>':''}${all?`<hr><button type="button" role="menuitemradio" aria-checked="${allOn}" data-action="person" data-person="" aria-label="Alle Personen" class="${allOn?'on':''}"><span class="avatar all">∑</span><span>Alle Personen</span></button>`:''}</div>`;
}
