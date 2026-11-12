// Darstellung: Beträge auf Cent, genaue Zahl im Tooltip; Unbekanntes heißt „Offen“, nie 0.
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf2=new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
const nfExact=new Intl.NumberFormat('de-DE',{maximumFractionDigits:12});
const nf4=new Intl.NumberFormat('de-DE',{minimumFractionDigits:4,maximumFractionDigits:4});
export const money=(v,fallback='Offen')=>v==null?fallback:nf2.format(Number(v));
export const euro=(v,fallback='Offen')=>v==null?fallback:nf2.format(Number(v))+' €';
export const exact=v=>v==null?'':nfExact.format(Number(v));
export const pieces=v=>v==null?'—':nfExact.format(Number(v));
export const unit=v=>v==null?'—':nf4.format(Number(v));
// Maskiert: ein Datum aus einer fremden Tresordatei kann beliebiger Text sein.
export const date=d=>d?esc(String(d).split('-').reverse().join('.')):'—';
export const num=(v,cls='')=>`<td class="num${cls?' '+cls:''}${v!=null&&Number(v)<0?' neg':''}" title="${esc(exact(v))}">${money(v)}</td>`;
export const sign=v=>v==null?'':Number(v)<0?'neg':Number(v)>0?'pos':'';
export const statusLabel={supported:'Ermittelt',incomplete:'Angaben fehlen',unsupported:'Außerhalb des Modells',none:'Keine Erträge erfasst'};
export const statusBadge=status=>`<span class="badge ${esc(status)}">${esc(statusLabel[status]||status)}</span>`;
export const field=(name,label,value='',attrs='',hint='')=>`<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" value="${esc(value??'')}" ${attrs}>${hint?`<small>${hint}</small>`:''}</label>`;
export const select=(name,label,options,value,attrs='')=>`<label class="field"><span>${esc(label)}</span><select name="${esc(name)}" ${attrs}>${options.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(value??'')?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
// Suchfeld über einer Liste (Personenwahl, Tresorwahl): Jeder Eintrag trägt seinen Suchtext klein geschrieben in
// data-find; die Anwendung blendet beim Tippen aus, was nicht passt.
export const findText=(...parts)=>parts.filter(Boolean).join(' ').toLocaleLowerCase('de');
export const searchField=label=>`<input type="search" class="list-search" data-search placeholder="${esc(label)}" aria-label="${esc(label)}" autocomplete="off" spellcheck="false">`;
export const check=(name,label,checked)=>`<label class="check"><input type="checkbox" name="${esc(name)}" ${checked?'checked':''}><span>${esc(label)}</span></label>`;
// Dezimaleingabe, deutsch zuerst: Komma ist Dezimaltrenner, Punkte sind dann
// Tausenderpunkte. Ohne Komma gilt ein einzelner Punkt vor genau drei Ziffern als
// Tausenderpunkt („19.000“), sonst als Dezimalpunkt („78.20“, „0.025“). Leer bleibt
// leer (unbekannt). Formulare werden immer mit Komma vorbelegt, damit der Rückweg eindeutig ist.
// Devisenkurse prüft die Erfassung zusätzlich gegen den EZB-Referenzkurs: „1.085“ wäre sonst unbemerkt 1085.
export function decimalInput(value){
 const s=String(value??'').trim().replace(/\s|€/g,'');if(!s)return null;
 const dots=(s.match(/\./g)||[]).length;
 // Englische Schreibweise mit beiden Zeichen („1,234.56“): Steht der Punkt hinter dem letzten Komma, ist er der
 // Dezimaltrenner und die Kommas gliedern Tausender. Alles andere mit Komma vor dem Punkt ist mehrdeutig und wird abgelehnt.
 const english=s.includes(',')&&s.includes('.')&&s.lastIndexOf('.')>s.lastIndexOf(',');
 if(english&&!/^-?\d{1,3}(,\d{3})+\.\d+$/.test(s))throw Error(`„${value}“ ist kein gültiger Betrag.`);
 const normalized=english?s.replace(/,/g,''):s.includes(',')?s.replace(/\./g,'').replace(',','.'):dots>1||/^-?[1-9]\d{0,2}\.\d{3}$/.test(s)?s.replace(/\./g,''):s;
 if(!/^-?\d+(\.\d+)?$/.test(normalized))throw Error(`„${value}“ ist kein gültiger Betrag.`);
 const [whole,frac='']=normalized.replace('-','').split('.');
 if(frac.length>12)throw Error(`„${value}“ hat mehr als 12 Nachkommastellen.`);
 return (normalized.startsWith('-')?'-':'')+whole.replace(/^0+(?=\d)/,'')+(frac.replace(/0+$/,'')?'.'+frac.replace(/0+$/,''):'');
}
export const inputValue=v=>v==null?'':String(v).replace('.',',');
