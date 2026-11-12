import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile as read} from 'node:fs/promises';
import {emptyState} from '../dist/core/model.mjs';
import {newSession,seal,open,save,load,remove,listVaults,getMeta,setMeta,parseEnvelope,fileConflict,LEGACY_VAULT} from '../dist/core/vault.mjs';
import {createSaver} from '../dist/ui/saver.mjs';
import {lockHTML,vaultPageHTML} from '../dist/ui/vaultui.mjs';

// Bestehender Tresor aus 4.0 bis 4.7: Datenbank Version 1 mit nur einem Umschlag unter „haupt“.
test('F21: the single vault of 4.7 survives the database upgrade and is listed as "Tresor"',async()=>{
 await new Promise(r=>{const q=indexedDB.deleteDatabase('depotklar-4');q.onsuccess=q.onerror=q.onblocked=()=>r();});
 const session=await newSession('alter-tresor-passwort'),envelope=await seal(emptyState(),{...session,revision:41});
 await new Promise((resolve,reject)=>{const r=indexedDB.open('depotklar-4',1);r.onupgradeneeded=()=>r.result.createObjectStore('tresor');
  r.onsuccess=()=>{const db=r.result,tx=db.transaction('tresor','readwrite');tx.objectStore('tresor').put(envelope,'haupt');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);});
 const list=await listVaults();
 assert.deepEqual(list.map(v=>[v.id,v.name,v.revision,v.linked]),[[LEGACY_VAULT,'Tresor',42,false]]);
 assert.equal((await load()).revision,42);assert.ok((await open(await load(LEGACY_VAULT),'alter-tresor-passwort')).state);
 // Weiterspeichern unter derselben Kennung, Name lässt sich nachtragen.
 await save(await seal(emptyState(),{...session,revision:42}),42,LEGACY_VAULT);await setMeta(LEGACY_VAULT,{name:'Familie'});
 assert.deepEqual((await listVaults()).map(v=>[v.name,v.revision]),[['Familie',43]]);
 await remove(LEGACY_VAULT);assert.deepEqual(await listVaults(),[]);
});

// Speicher mit einstellbarer Verzögerung, ohne Browser.
function harness({delay=0,failSave=false,failFile=false,conflict=false}={}){
 let session={revision:1},release;const gate=delay?new Promise(r=>release=r):null,writes=[],files=[];
 const saver=createSaver({
  seal:async(state,s)=>{if(gate)await gate;return {revision:s.revision+1,state:structuredClone(state)};},
  save:async(envelope,expected,vault)=>{if(failSave)throw Error('Speicher voll');writes.push({envelope,expected,vault});},
  getSession:()=>session,setSession:s=>{session=s;},getVault:()=>'v1',
  checkFile:async()=>{if(conflict)throw Error('Datei anderswo geändert');},
  writeFile:async(vault,envelope)=>{if(failFile)throw Error('Datei gesperrt');files.push(envelope.revision);}
 });
 return {saver,writes,files,release:()=>release?.(),session:()=>session,lock:async()=>{await saver.flush();session=null;}};
}

test('F20: a change pending while locking is saved first, with the state at the time of the change',async()=>{
 const h=harness({delay:1});let state={booking:'A'};
 h.saver.persist(state);state={booking:'B'};
 const locking=h.lock();h.release();await locking;
 assert.equal(h.writes.length,1);assert.deepEqual(h.writes[0].envelope.state,{booking:'A'});assert.equal(h.writes[0].expected,1);
 assert.equal(h.saver.error,null);assert.equal(h.saver.pending,0);assert.equal(h.session(),null);
 // Ohne Sitzung (gesperrt) wird nichts gespeichert und der Fehler bleibt sichtbar.
 await h.saver.persist({booking:'C'});assert.match(h.saver.error,/gesperrt/);assert.equal(h.writes.length,1);
});

test('F20: saves run in order, each with the next revision; a backup after flush() sees the newest state',async()=>{
 const h=harness();h.saver.persist({n:1});h.saver.persist({n:2});await h.saver.flush();
 assert.deepEqual(h.writes.map(w=>[w.expected,w.envelope.revision,w.envelope.state.n]),[[1,2,1],[2,3,2]]);assert.equal(h.session().revision,3);
 assert.deepEqual(h.files,[2,3]);
});

test('F20/F21: errors stay visible; a file conflict saves nothing, a failed file write keeps the browser copy',async()=>{
 let h=harness({failSave:true});await h.saver.persist({});assert.equal(h.saver.error,'Speicher voll');assert.equal(h.session().revision,1);
 h=harness({conflict:true});await h.saver.persist({});assert.match(h.saver.error,/anderswo geändert/);assert.equal(h.writes.length,0);
 h=harness({failFile:true});await h.saver.persist({});assert.equal(h.saver.error,null);assert.equal(h.saver.fileError,'Datei gesperrt');assert.equal(h.writes.length,1);assert.equal(h.session().revision,2);
});

test('F21: several vaults in one browser, each with its own envelope and name; the 4.7 vault stays readable',async()=>{
 const a=await newSession('erstes-passwort-1'),b=await newSession('zweites-passwort-2');
 await save(await seal(emptyState(),a),0);await save(await seal(emptyState(),b),0,'v2');await setMeta('v2',{name:'Kinder',fileName:'kinder.depotklar',handle:{kind:'file'}});
 const list=await listVaults();
 assert.deepEqual(list.map(v=>[v.id,v.name,v.revision,v.linked,v.fileName]),[[LEGACY_VAULT,'Tresor',1,false,null],['v2','Kinder',1,true,'kinder.depotklar']].sort((x,y)=>x[1].localeCompare(y[1],'de')));
 // Jeder Tresor öffnet nur mit seinem Passwort und ändert die anderen nicht.
 await assert.rejects(open(await load('v2'),'erstes-passwort-1'),/Passwort falsch/);assert.ok((await open(await load('v2'),'zweites-passwort-2')).state);
 await setMeta('v2',{backupRevision:1});assert.equal((await getMeta('v2')).backupRevision,1);assert.equal((await getMeta('v2')).name,'Kinder');
 await remove('v2');assert.deepEqual((await listVaults()).map(v=>v.id),[LEGACY_VAULT]);assert.equal(await getMeta('v2'),null);
});

test('F21: vault files are recognised, and a newer file elsewhere is never overwritten',async()=>{
 const envelope=await seal(emptyState(),await newSession('datei-passwort-123'));
 assert.equal(parseEnvelope(JSON.stringify(envelope)).revision,1);
 assert.throws(()=>parseEnvelope('{"format":"depotklar-vault"}'),/Version 3/);assert.throws(()=>parseEnvelope('kein json'),/Keine Depotklar-Tresordatei/);
 assert.equal(fileConflict({revision:6},5),true);assert.equal(fileConflict({revision:5},5),false);assert.equal(fileConflict({revision:3},5),false);assert.equal(fileConflict(null,5),false);
});

test('F21: lock screen lists the vaults, offers a new one and opening a file; the vault page shows file and save state',async()=>{
 const vaults=[{id:'a',name:'Familie',revision:12,linked:true,fileName:'familie.depotklar',backupRevision:null},{id:'b',name:'Test',revision:3,linked:false,backupRevision:2}];
 let html=lockHTML({vaults,selected:'b',fileAccess:true});
 assert.match(html,/data-action="choose-vault" data-vault="a" data-find="familie familie\.depotklar"><strong>Familie<\/strong><small>Datei: familie\.depotklar/);assert.match(html,/Sicherung Revision 2, seither geändert/);
 assert.match(html,/data-form="unlock" data-vault="b"/);assert.match(html,/Passwort für „Test“/);assert.match(html,/data-action="new-vault"/);assert.match(html,/data-action="open-file"/);
 html=lockHTML({vaults,selected:'a',mode:'create',fileAccess:false});assert.match(html,/data-form="create"/);assert.match(html,/name="name"/);assert.match(html,/data-action="import-backup"/);
 html=vaultPageHTML({vault:{name:'Familie'},revision:12,backupRevision:10,fileAccess:true,file:{handle:{},name:'familie.depotklar',granted:false},fileError:'Datei gesperrt'});
 assert.match(html,/Tresor · Familie/);assert.match(html,/Verbunden mit <strong>familie\.depotklar/);assert.match(html,/data-action="grant-file"/);assert.match(html,/Datei ist nicht aktuell/);
 assert.match(vaultPageHTML({vault:{name:'X'},fileAccess:true}),/data-action="link-file"/);assert.match(vaultPageHTML({vault:{name:'X'},fileAccess:false}),/nur in Chrome und Edge/);
 const app=await read(new URL('../dist/app.mjs',import.meta.url),'utf8');
 // Sperren und Sicherung warten auf offene Speicherungen; eine Datei ersetzt keinen Tresor.
 assert.match(app,/async function lock\(\{ask=false\}=\{\}\)\{\r?\n await saver\.flush\(\);/);assert.match(app,/async function downloadBackup\(\)\{\r?\n await saver\.flush\(\);/);
 assert.match(app,/addVault\(parseEnvelope\(text\),\{name:file\.name\}\)/);assert.doesNotMatch(app,/pendingBackup/);
 assert.match(app,/addEventListener\('beforeunload',ev=>\{if\(saver\.pending\|\|saver\.error\|\|rescue\)/);
});
