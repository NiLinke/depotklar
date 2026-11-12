import {esc,field,findText,searchField} from './format.mjs';
import {APP_VERSION} from '../core/model.mjs';

const fileInput=(label,cls)=>`<label class="${cls} file">${label}<input type="file" accept=".depotklar,.json,application/json" data-action="import-backup" hidden></label>`;
const backupNote=v=>(v.pending?'eingelesene Datei wird beim Öffnen geprüft · ':'')+(v.linked?`Datei: ${esc(v.fileName||'verbunden')}`:v.backupRevision?`Sicherung Revision ${v.backupRevision}${v.backupRevision<v.revision?', seither geändert':''}`:'keine Sicherung vermerkt');

// Ab so vielen Tresoren bekommt die Auswahl ein Suchfeld und eine begrenzte Höhe.
export const VAULT_SEARCH_FROM=6;
// Sperrbildschirm: Tresor wählen und öffnen, neuen Tresor anlegen oder eine Tresordatei öffnen.
// Ohne sicheren Kontext (HTTPS oder localhost) stellt der Browser keine Verschlüsselung (Web Crypto) bereit: dann lässt
// sich kein Tresor anlegen oder öffnen. Statt eines unverständlichen Fehlers ein klarer Hinweis; die Demo geht weiter.
export const INSECURE_NOTICE='<div class="notice" role="alert"><strong>Diese Verbindung ist nicht verschlüsselt.</strong> Tresore lassen sich nur über HTTPS oder direkt auf diesem Rechner (localhost) anlegen und öffnen, weil der Browser sonst keine Verschlüsselung bereitstellt. Bitte die Adresse mit https:// aufrufen. Die Demo funktioniert auch so.</div>';
export function lockHTML({vaults=[],selected=null,mode='open',error='',busy=false,fileAccess=false,secure=true}){
 if(!secure)return `<main class="lock"><a class="brand" href="/">depotklar<span>.</span></a><section class="lock-card"><h1>Sichere Verbindung nötig</h1>${INSECURE_NOTICE}<div class="lock-links"><button class="link" data-action="demo">Demo mit Beispieldaten ansehen</button></div></section>
  <p class="muted small">Depotklar ${esc(APP_VERSION)}</p></main>`;
 const err=error?`<p class="error">${esc(error)}</p>`:'';
 const current=vaults.find(v=>v.id===selected)||vaults[0]||null,creating=mode==='create'||!current;
 const create=`<form data-form="create">${field('name','Name des Tresors',current?'':'Familie','required maxlength="60"','Zum Beispiel „Familie“. Der Name steht unverschlüsselt in diesem Browser.')}${field('password','Neues Tresorpasswort','','type="password" autocomplete="new-password" minlength="12" required','Mindestens 12 Zeichen. Ohne Passwort gibt es keinen Zugang – auch nicht für den Betreiber.')}${field('repeat','Passwort wiederholen','','type="password" autocomplete="new-password" minlength="12" required')}${err}<button class="button primary wide" ${busy?'disabled':''}>${busy?'Lege an …':'Tresor anlegen'}</button>${current?'<button type="button" class="link" data-action="cancel-create">Abbrechen</button>':''}</form>`;
 const many=vaults.length>=VAULT_SEARCH_FROM;
 const open=current?`${vaults.length>1?`<div class="vault-pick" data-searchable>${many?searchField('Tresor suchen'):''}<div class="vault-list${many?' long':''}" role="radiogroup" aria-label="Tresor">${vaults.map(v=>`<button type="button" role="radio" aria-checked="${v.id===current.id}" class="vault-item${v.id===current.id?' on':''}" data-action="choose-vault" data-vault="${esc(v.id)}" data-find="${esc(findText(v.name,v.fileName))}"><strong>${esc(v.name)}</strong><small>${backupNote(v)}</small></button>`).join('')}</div>${many?'<p class="menu-none" data-find-none hidden>Kein Tresor mit diesem Namen.</p>':''}</div>`:''}
  <form data-form="unlock" data-vault="${esc(current.id)}">${field('password',vaults.length>1?`Passwort für „${current.name}“`:'Tresorpasswort','','type="password" autocomplete="current-password" required autofocus')}${err}<button class="button primary wide" ${busy?'disabled':''}>${busy?'Öffne …':'Tresor öffnen'}</button></form>
  <p class="muted small">${vaults.length>1?'':`${esc(current.name)} · ${backupNote(current)} · `}<button class="link" data-action="delete-vault" data-vault="${esc(current.id)}">Aus diesem Browser entfernen</button></p>`:'';
 const links=[current&&!creating?'<button class="link" data-action="new-vault">Neuen Tresor anlegen</button>':'',fileAccess?'<button class="link" data-action="open-file">Tresordatei öffnen</button>':fileInput('Tresordatei einlesen','link'),'<button class="link" data-action="demo">Demo mit Beispieldaten ansehen</button>'].filter(Boolean).join('');
 return `<main class="lock"><a class="brand" href="/">depotklar<span>.</span></a><section class="lock-card"><h1>${creating?(current?'Neuer Tresor':'Ihr Tresor auf diesem Gerät'):'Willkommen zurück'}</h1><p>Alle Daten bleiben verschlüsselt in diesem Browser, auf Wunsch zusätzlich in einer Datei, die nur mit dem Passwort aufgeht. Keine Registrierung, keine Übertragung.</p>${creating?create:open}
  <div class="lock-links">${links}</div></section>
  <p class="muted small">Depotklar ${esc(APP_VERSION)} · Tresore der Version 3 werden nicht gelesen und bleiben unverändert im Browser.</p></main>`;
}

// Datei und Browser haben verschiedene Stände: Depotklar überschreibt nichts von selbst. Erklärung und die Wege heraus.
// conflict 'both': beide wurden geändert; 'unreadable': die Datei ließ sich mit dem Passwort nicht öffnen.
export function fileConflictHTML(file,revision){
 const name=esc(file?.name||'Tresordatei'),rev=file?.fileRevision!=null?` (Revision ${esc(file.fileRevision)})`:'',unreadable=file?.conflict==='unreadable';
 return `<div class="notice" role="alert"><strong>Die Datei und dieser Browser haben verschiedene Stände.</strong> ${unreadable
   ?`Die Datei ${name}${rev} ließ sich mit Ihrem Passwort nicht öffnen: Sie ist beschädigt oder wurde mit einem anderen Passwort gespeichert.`
   :`Die Datei ${name}${rev} wurde anderswo geändert, und dieser Browser hat eigene Änderungen (Revision ${esc(revision)}).`} Geöffnet ist der Stand dieses Browsers. Depotklar überschreibt nichts von selbst: Bis Sie entscheiden, wird nur im Browser gespeichert, die Datei bleibt, wie sie ist.</div>
  <div class="actions"><span></span>${unreadable?'':'<button class="button" data-action="file-take">Stand der Datei übernehmen</button>'}<button class="button" data-action="save-as-file">Diesen Stand in eine neue Datei speichern</button><button class="button danger" data-action="file-overwrite">Datei mit diesem Stand überschreiben</button><button class="button" data-action="unlink-file">Verbindung lösen</button></div>`;
}

// kept: ein Stand dieses Browsers, den ein Stand aus einer Datei ersetzt hat – aufbewahrt, bis der Anwender ihn verwirft.
export function vaultPageHTML({demo,vault={name:'Tresor'},revision=0,savedAt=null,backupRevision=null,fileAccess=false,file=null,error=null,fileError=null,kept=null}){
 if(demo)return `<div class="page-head"><div><h1>Tresor</h1><p>Sie sehen die Demo mit fiktiven Daten. Änderungen werden nicht gespeichert.</p></div></div><section class="card"><div class="actions"><button class="button" data-action="demo-reset">Demo zurücksetzen</button><button class="button primary" data-action="leave-demo">Eigenen Tresor verwenden</button></div></section>`;
 const status=error?`<div class="notice"><strong>Nicht gespeichert.</strong> ${esc(error)}${fileAccess?' <button class="link" data-action="save-as-file">Aktuellen Stand in eine neue Datei speichern</button>':''}</div>`
  :fileError&&!file?.conflict?`<div class="notice"><strong>Im Browser gespeichert, die Datei ist nicht aktuell.</strong> ${esc(fileError)}</div>`:'';
 const keptNote=kept?`<div class="notice info"><strong>Aufbewahrter Stand.</strong> ${esc(kept.reason||'Früherer Stand dieses Browsers')} – Revision ${esc(kept.revision)}${kept.when?`, aufbewahrt am ${esc(kept.when)}`:''}. Depotklar hat ihn nicht gelöscht, als ein anderer Stand an seine Stelle trat. „Wiederherstellen“ tauscht ihn mit dem jetzigen Stand; der jetzige wird dafür aufbewahrt.<div class="actions"><span></span><button class="button" data-action="kept-drop">Verwerfen</button><button class="button" data-action="kept-download">Herunterladen</button><button class="button" data-action="kept-restore">Wiederherstellen</button></div></div>`:'';
 const fileCard=file?.handle&&file.conflict?fileConflictHTML(file,revision)
  :file?.handle?`<p>Verbunden mit <strong>${esc(file.name||'Tresordatei')}</strong>. Jede Änderung wird dort ebenfalls verschlüsselt gespeichert; wurde die Datei anderswo geändert, speichert Depotklar nicht darüber, sondern fragt.</p>${file.granted?'':'<p class="notice">Der Browser hat den Zugriff auf die Datei in dieser Sitzung noch nicht erlaubt.</p>'}<div class="actions"><span></span>${file.granted?'':'<button class="button primary" data-action="grant-file">Zugriff erlauben</button>'}<button class="button" data-action="unlink-file">Verbindung lösen</button></div>`
  :fileAccess?'<p>Jede Änderung zusätzlich verschlüsselt in einer Datei speichern, zum Beispiel auf OneDrive oder einem Netzlaufwerk. Dieselbe Datei lässt sich auf einem anderen Gerät öffnen; geändert wird sie aber besser nur an einem Ort zur selben Zeit.</p><div class="actions"><span></span><button class="button primary" data-action="link-file">Mit Datei verbinden …</button></div>'
  :'<p class="muted">Speichern in eine Datei geht nur in Chrome und Edge. In diesem Browser bleibt die Sicherungsdatei.</p>';
 return `<div class="page-head"><div><h1>Tresor · ${esc(vault.name)}</h1><p>AES-256-GCM, Schlüssel per PBKDF2 aus Ihrem Passwort. Gespeichert wird nach jeder Änderung; nach zehn Minuten ohne Eingabe sperrt sich der Tresor.</p></div></div>${status}${keptNote}
  <div class="columns">
   <section class="card"><h2>Sicherung</h2><p>Stand: Revision ${revision}${savedAt?` · zuletzt gespeichert ${esc(savedAt)}`:''}. Letzte heruntergeladene Sicherung: ${backupRevision?`Revision ${backupRevision}`:'keine vermerkt (vermerkt wird erst seit 4.8)'}.</p><p class="hint">Die Sicherungsdatei ist verschlüsselt und lässt sich nur mit dem Passwort öffnen, das beim Speichern galt.</p>
    <div class="actions"><span></span><button class="button primary" data-action="download-backup">Sicherung herunterladen</button></div></section>
   <section class="card"><h2>Datei</h2>${fileCard}</section>
   <section class="card"><h2>Tresore</h2><form data-form="vault-name">${field('name','Name dieses Tresors',vault.name,'required maxlength="60"')}<div class="actions"><span></span><button class="button">Umbenennen</button></div></form>
    <p class="hint">Eine Tresordatei wird als eigener Tresor geöffnet und ersetzt keinen vorhandenen. Gehört sie zu einem Tresor, den es hier schon gibt, und ist sie neuer, prüft Depotklar sie beim nächsten Öffnen mit dem Passwort und übernimmt sie erst dann. Neue Tresore entstehen nach dem Sperren auf der Startseite des Tresors.</p>
    <div class="actions"><span></span>${fileAccess?'<button class="button" data-action="open-file">Tresordatei öffnen …</button>':fileInput('Tresordatei einlesen','button')}<button class="button" data-action="switch-vault">Tresor wechseln</button></div></section>
   <section class="card"><h2>Passwort ändern</h2><form data-form="rekey">${field('current','Bisheriges Passwort','','type="password" autocomplete="current-password" required')}${field('next','Neues Passwort','','type="password" autocomplete="new-password" minlength="12" required')}${field('repeat','Neues Passwort wiederholen','','type="password" autocomplete="new-password" minlength="12" required')}<div class="actions"><span class="hint">Ältere Sicherungsdateien behalten das bisherige Passwort.</span><button class="button">Passwort ändern</button></div></form></section>
   <section class="card"><h2>Sperren</h2><p>Entfernt den Schlüssel aus dem Arbeitsspeicher. Ohne verbundene Datei erinnert Depotklar vorher an die Sicherung.</p><div class="actions"><span></span><button class="button" data-action="lock">Jetzt sperren</button></div></section>
  </div>`;
}
