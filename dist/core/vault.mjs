import {validate,upgrade,FORMAT,VERSION} from './model.mjs';

// Verschlüsselter Tresor: AES-256-GCM, Schlüssel per PBKDF2-SHA256 aus dem
// Passwort. Kopfzeile als zusätzliche authentifizierte Daten – eine veränderte
// Rundenzahl oder Revision macht den Umschlag unlesbar. Ein Umschlag trägt seine
// eigene Rundenzahl, damit eine spätere Erhöhung alte Tresore nicht aussperrt.
const encoder=new TextEncoder(),decoder=new TextDecoder();
export const ITERATIONS=600000,MIN_ITERATIONS=600000,MAX_ITERATIONS=10000000;
const ENVELOPE='depotklar-tresor',ENVELOPE_VERSION=2;
const usable=n=>Number.isSafeInteger(n)&&n>=MIN_ITERATIONS&&n<=MAX_ITERATIONS;
function b64(a){let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s);}
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

async function derive(password,salt,iterations){
 const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export function checkPassword(password){if(typeof password!=='string'||password.length<12)throw Error('Mindestens 12 Zeichen für das Tresorpasswort verwenden.');}

// Umlaute und Akzente gibt es in zwei Unicode-Schreibweisen (zusammengesetzt und zerlegt), die gleich aussehen, aber
// verschiedene Schlüssel ergäben. Neue Tresore nehmen die zusammengesetzte Form (NFC); beim Öffnen werden die Eingabe,
// NFC und NFD versucht, damit ein Tresor auf jedem Gerät aufgeht und ältere Tresore unverändert lesbar bleiben.
const forms=password=>[...new Set([password,password.normalize('NFC'),password.normalize('NFD')])];
export async function newSession(password){
 checkPassword(password);const salt=crypto.getRandomValues(new Uint8Array(16));
 return {key:await derive(password.normalize('NFC'),salt,ITERATIONS),salt:b64(salt),iterations:ITERATIONS,revision:0};
}
export async function seal(state,session){
 validate(state);if(!usable(session.iterations))throw Error('Unzulässige Rundenzahl der Schlüsselableitung.');
 const revision=session.revision+1,iv=crypto.getRandomValues(new Uint8Array(12));
 const header={format:ENVELOPE,version:ENVELOPE_VERSION,dataFormat:FORMAT,dataVersion:VERSION,kdf:'PBKDF2-SHA256',iterations:session.iterations,cipher:'AES-256-GCM',salt:session.salt,revision};
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(JSON.stringify(header))},session.key,encoder.encode(JSON.stringify(state)));
 return {...header,iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};
}
function checkEnvelope(e){
 if(!e||e.format!==ENVELOPE||e.version!==ENVELOPE_VERSION)throw Error(e?.format==='depotklar-vault'?'Tresor der Version 3. Depotklar 4 verwendet ein neues Datenformat; der Tresor bleibt unverändert erhalten.':'Unbekanntes Tresorformat.');
 if(!usable(e.iterations)||e.kdf!=='PBKDF2-SHA256'||e.cipher!=='AES-256-GCM'||typeof e.ciphertext!=='string'||e.ciphertext.length>150000000||!Number.isSafeInteger(e.revision)||e.revision<1)throw Error('Unbekanntes oder zu großes Tresorformat.');
}
const UNREADABLE='Tresor konnte nicht geöffnet werden: Passwort falsch oder Datei beschädigt.';
async function decrypt(e,key){
 const {iv,ciphertext,...header}=e;if(bytes(e.salt).length!==16||bytes(iv).length!==12)throw Error();
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:encoder.encode(JSON.stringify(header))},key,bytes(ciphertext));
 return JSON.parse(decoder.decode(plain));
}
// keys: Zwischenspeicher der abgeleiteten Schlüssel, wenn mehrere Stände desselben Tresors nacheinander geprüft werden.
export async function open(envelope,password,{keys=null}={}){
 const e=envelope;checkEnvelope(e);
 if(typeof password!=='string')throw Error(UNREADABLE);
 let state=null,key=null;
 for(const form of forms(password)){
  try{
   const id=`${e.salt}|${e.iterations}|${form}`;let k=keys?.get(id);
   if(!k){k=await derive(form,bytes(e.salt),e.iterations);keys?.set(id,k);}
   state=await decrypt(e,k);key=k;break;
  }catch{state=null;}
 }
 if(!state)throw Error(UNREADABLE);
 upgrade(state);validate(state);
 return {state,session:{key,salt:e.salt,iterations:e.iterations,revision:e.revision}};
}
// Einen anderen Stand desselben Tresors mit dem Schlüssel der offenen Sitzung lesen, ohne das Passwort erneut zu fragen.
// Geht nur, wenn er mit demselben Passwort gespeichert wurde (gleiches Salz).
export async function openWithSession(envelope,session){
 const e=envelope;checkEnvelope(e);
 if(!session?.key||e.salt!==session.salt||e.iterations!==session.iterations)throw Error('Dieser Stand wurde mit einem anderen Passwort gespeichert: Tresor sperren und mit dem Passwort dieses Stands öffnen.');
 let state;try{state=await decrypt(e,session.key);}catch{throw Error('Der Stand lässt sich nicht lesen: Die Datei ist beschädigt.');}
 upgrade(state);validate(state);
 return {state,session:{...session,revision:e.revision}};
}

// Kennung eines gespeicherten Stands: Revision und Initialisierungsvektor. Derselbe Stand hat dieselbe Kennung; ein
// anderswo gespeicherter Stand hat eine andere, auch wenn die Revision zufällig gleich ist.
export const standOf=e=>e?{revision:e.revision,iv:e.iv}:null;
export const sameStand=(a,b)=>Boolean(a&&b)&&a.revision===b.revision&&a.iv===b.iv;
// Hat sich die verbundene Datei geändert, seit dieser Browser sie zuletzt gelesen oder geschrieben hat (seen)?
// Ohne Vermerk – Verbindungen aus der Zeit vor 4.23 – gilt wie bisher nur eine höhere Revision als Änderung.
export function fileChanged(fileEnvelope,seen,previousRevision=0){
 if(!fileEnvelope)return false;
 return seen?!sameStand(fileEnvelope,seen):fileEnvelope.revision>previousRevision;
}

// Verhältnis der verbundenen Datei (file) zum Stand dieses Browsers (local). seen ist die Kennung, mit der dieser Browser
// die Datei zuletzt gelesen oder geschrieben hat.
// - 'none': keine lesbare Datei. 'same': derselbe Stand.
// - 'fileBehind': Die Datei ist unverändert, der Browser ist weiter – die Datei darf fortgeschrieben werden.
// - 'fileAhead': Die Datei wurde anderswo geändert, der Browser hat seither nichts gespeichert – es gilt die Datei, gleich
//   welche Revision; openBest prüft vorher am Inhalt, ob dem Stand der Datei etwas vom Browser fehlt.
// - 'both': Beide haben sich geändert – nichts wird von selbst überschrieben, der Anwender entscheidet.
// Ohne Vermerk (Verbindung aus der Zeit vor 4.23) gilt die Datei mit höherer Revision; sonst ist unklar, wer weiter ist ('both').
export function fileRelation({local=null,file=null,seen=null}){
 if(!file)return 'none';
 if(!local)return 'fileAhead';
 if(sameStand(file,local))return 'same';
 if(seen){const fileMoved=!sameStand(file,seen),localMoved=!sameStand(local,seen);return !fileMoved?'fileBehind':localMoved?'both':'fileAhead';}
 return file.revision>local.revision?'fileAhead':'both';
}

// Enthält der Stand next alles, was previous enthält? Maßstab ist das Protokoll: Jede Änderung hängt dort einen Eintrag
// an, entfernt wird keiner. Fehlt next ein Eintrag von previous, trägt previous etwas, das next nicht kennt.
const continues=(next,previous)=>previous.audit.length<=next.audit.length&&previous.audit.every((a,i)=>JSON.stringify(a)===JSON.stringify(next.audit[i]));

// Welcher Stand beim Öffnen gilt: der dieses Browsers (local), der einer verbundenen Datei (file) oder einer eingelesenen,
// noch ungeprüften Datei (incoming). Ein Stand aus einer Datei gilt erst, wenn er sich mit dem Passwort öffnen lässt –
// eine beschädigte Datei ersetzt nie den Stand im Browser.
// conflict: 'both' (beide geändert, es gilt der Browser) oder 'unreadable' (die Datei wäre maßgeblich, lässt sich mit dem
// Passwort aber nicht öffnen); in beiden Fällen bleibt die Datei unberührt, bis der Anwender entscheidet.
// Bevor ein Stand aus einer Datei den des Browsers ersetzt, vergleicht Depotklar beide am Protokoll (continues). Fehlt
// der verbundenen Datei eine Änderung des Browsers und umgekehrt, wurden beide unabhängig weitergeführt – auch wenn der
// Browser seinen Stand schon in die Datei geschrieben hatte und sie danach anderswo ersetzt wurde: Das gilt als 'both'.
// keepLocal: Der Stand aus der Datei gilt, enthält den des Browsers aber nicht vollständig (eingelesene Datei, anderswo
// auf einen früheren Stand zurückgesetzte Datei) oder der Stand des Browsers ließ sich nicht prüfen – der Aufrufer
// bewahrt ihn auf. failed: Kandidaten, die sich nicht öffnen ließen.
export async function openBest({local=null,file=null,incoming=null,seen=null,password}){
 const relation=fileRelation({local,file,seen});
 let order=relation==='fileAhead'?['file','local']:relation==='both'?['local','file']:['local'];
 if(incoming&&!sameStand(incoming,local)&&(!local||incoming.revision>local.revision))order.unshift('incoming');
 const of={local,file,incoming},keys=new Map(),failed=[];let last=Error('Für diesen Tresor ist nichts gespeichert.');
 for(const source of order){
  const envelope=of[source];if(!envelope)continue;
  let opened;try{opened=await open(envelope,password,{keys});}catch(err){last=err;failed.push(source);continue;}
  if(source==='local')return {...opened,envelope,source,relation,conflict:relation==='both'?'both':relation==='fileAhead'&&failed.includes('file')?'unreadable':null,failed,keepLocal:false};
  let keepLocal=false;
  if(local){
   const mine=failed.includes('local')?null:await open(local,password,{keys}).catch(()=>null);
   // Nicht prüfbar (beschädigt, anderes Passwort): aufbewahren, außer die verbundene Datei ist erkennbar weiter.
   if(!mine)keepLocal=source==='incoming'||relation==='both'||envelope.revision<=local.revision;
   else if(!continues(opened.state,mine.state)){
    if(source==='file'&&!continues(mine.state,opened.state))return {...mine,envelope:local,source:'local',relation:'both',conflict:'both',failed,keepLocal:false};
    keepLocal=true;
   }
  }
  return {...opened,envelope,source,relation,conflict:null,failed,keepLocal};
 }
 throw last;
}
// Neues Passwort: das bisherige wird über das Öffnen geprüft; frisches Salt und
// aktuelle Rundenzahl. Der Aufrufer speichert, bevor er die Sitzung umstellt.
export async function rekey(envelope,current,next){
 checkPassword(next);if(next===current)throw Error('Das neue Passwort entspricht dem bisherigen.');
 const opened=await open(envelope,current),fresh=await newSession(next);
 const session={...fresh,revision:opened.session.revision};
 return {envelope:await seal(opened.state,session),session:{...session,revision:session.revision+1},state:opened.state};
}

// Browser-Speicher. Eigener Datenbankname: ein Tresor der Version 3 bleibt unberührt im
// Browser liegen. Seit 4.8 mehrere Tresore: je Tresor ein verschlüsselter Umschlag und
// unverschlüsselte Verwaltungsangaben (Name, verbundene Datei, Stand der letzten Sicherung).
// Der Tresor aus 4.0 bis 4.7 liegt weiter unter „haupt“.
const DB='depotklar-4',STORE='tresor',META='tresore';
export const LEGACY_VAULT='haupt';
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,2);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);if(!db.objectStoreNames.contains(META))db.createObjectStore(META);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function transaction(stores,mode,work){
 return database().then(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction(stores,mode);let result;
  work(tx,v=>{result=v;});
  tx.oncomplete=()=>{db.close();resolve(result);};
  tx.onerror=()=>{db.close();reject(tx.error);};
  tx.onabort=()=>{db.close();reject(tx.error||Error('abgebrochen'));};
 }));
}
export function load(id=LEGACY_VAULT){return transaction(STORE,'readonly',(tx,done)=>{const r=tx.objectStore(STORE).get(id);r.onsuccess=()=>done(r.result||null);});}
// Optimistische Sperre: gespeichert wird nur, wenn niemand zwischenzeitlich (anderer Tab) gespeichert hat.
export async function save(envelope,expectedRevision,id=LEGACY_VAULT){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(id);let conflict=false;
  r.onsuccess=()=>{if((r.result?.revision||0)!==expectedRevision){conflict=true;tx.abort();return;}store.put(envelope,id);};
  tx.oncomplete=()=>{db.close();resolve();};
  tx.onabort=()=>{db.close();reject(Error(conflict?'Der Tresor wurde in einem anderen Fenster geändert. Neu öffnen, um Datenverlust zu vermeiden.':'Tresor konnte nicht gespeichert werden.'));};
 });
}
export function remove(id=LEGACY_VAULT){return transaction([STORE,META],'readwrite',tx=>{tx.objectStore(STORE).delete(id);tx.objectStore(META).delete(id);});}
export function getMeta(id){return transaction(META,'readonly',(tx,done)=>{const r=tx.objectStore(META).get(id);r.onsuccess=()=>done(r.result||null);});}
export function setMeta(id,patch){return transaction(META,'readwrite',tx=>{const store=tx.objectStore(META),r=store.get(id);r.onsuccess=()=>store.put({...(r.result||{}),...patch,id},id);});}
// Alle Tresore dieses Browsers mit Name, Revision und verbundener Datei, nach Namen sortiert.
export function listVaults(){
 return transaction([STORE,META],'readonly',(tx,done)=>{
  const envs=tx.objectStore(STORE).getAll(),keys=tx.objectStore(STORE).getAllKeys(),metas=tx.objectStore(META).getAll();
  metas.onsuccess=()=>{
   const byId=new Map((metas.result||[]).map(m=>[m.id,m]));
   done((keys.result||[]).map((id,i)=>{const m=byId.get(id)||{};return {id,name:m.name||(id===LEGACY_VAULT?'Tresor':'Tresor ohne Namen'),revision:envs.result?.[i]?.revision||0,salt:envs.result?.[i]?.salt||null,
    savedAt:m.savedAt||null,fileName:m.fileName||null,linked:Boolean(m.handle),backupRevision:m.backupRevision??null,pending:Boolean(m.incoming)};}).sort((a,b)=>a.name.localeCompare(b.name,'de')));
  };
 });
}

// Tresordatei: dieselbe verschlüsselte Form wie die Sicherung. Gelesen wird nur die Hülle;
// das Passwort prüft erst open().
export function parseEnvelope(text){
 let e;try{e=JSON.parse(text);}catch{throw Error('Keine Depotklar-Tresordatei.');}
 if(e?.format==='depotklar-vault')throw Error('Tresor der Version 3 – Depotklar 4 liest ihn nicht.');
 if(e?.format!==ENVELOPE||e.version!==ENVELOPE_VERSION||!Number.isSafeInteger(e.revision))throw Error('Keine Depotklar-Tresordatei.');
 return e;
}
// Eine verbundene Datei mit höherer Revision als der zuletzt gespeicherte Stand wurde
// anderswo geändert (anderes Gerät oder Fenster): dann nicht überschreiben.
export const fileConflict=(fileEnvelope,previousRevision)=>Boolean(fileEnvelope)&&fileEnvelope.revision>previousRevision;
// Dateizugriff des Browsers (Chrome, Edge): Datei wählen, Berechtigung, lesen, schreiben.
export const fileAccess=()=>typeof globalThis.showSaveFilePicker==='function';
export async function filePermission(handle,ask=false){const mode={mode:'readwrite'};let p=await handle.queryPermission(mode);if(p!=='granted'&&ask)p=await handle.requestPermission(mode);return p==='granted';}
export async function readFile(handle){const text=await (await handle.getFile()).text();return text.trim()?parseEnvelope(text):null;}
export async function writeFile(handle,envelope){const w=await handle.createWritable();await w.write(JSON.stringify(envelope));await w.close();}
