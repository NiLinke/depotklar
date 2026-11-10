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

export async function newSession(password){
 checkPassword(password);const salt=crypto.getRandomValues(new Uint8Array(16));
 return {key:await derive(password,salt,ITERATIONS),salt:b64(salt),iterations:ITERATIONS,revision:0};
}
export async function seal(state,session){
 validate(state);if(!usable(session.iterations))throw Error('Unzulässige Rundenzahl der Schlüsselableitung.');
 const revision=session.revision+1,iv=crypto.getRandomValues(new Uint8Array(12));
 const header={format:ENVELOPE,version:ENVELOPE_VERSION,dataFormat:FORMAT,dataVersion:VERSION,kdf:'PBKDF2-SHA256',iterations:session.iterations,cipher:'AES-256-GCM',salt:session.salt,revision};
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(JSON.stringify(header))},session.key,encoder.encode(JSON.stringify(state)));
 return {...header,iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};
}
export async function open(envelope,password){
 const e=envelope;
 if(!e||e.format!==ENVELOPE||e.version!==ENVELOPE_VERSION)throw Error(e?.format==='depotklar-vault'?'Tresor der Version 3. Depotklar 4 verwendet ein neues Datenformat; der Tresor bleibt unverändert erhalten.':'Unbekanntes Tresorformat.');
 if(!usable(e.iterations)||e.kdf!=='PBKDF2-SHA256'||e.cipher!=='AES-256-GCM'||typeof e.ciphertext!=='string'||e.ciphertext.length>150000000||!Number.isSafeInteger(e.revision)||e.revision<1)throw Error('Unbekanntes oder zu großes Tresorformat.');
 let state,key;
 try{
  const {iv,ciphertext,...header}=e;if(bytes(e.salt).length!==16||bytes(iv).length!==12)throw Error();
  key=await derive(password,bytes(e.salt),e.iterations);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:encoder.encode(JSON.stringify(header))},key,bytes(ciphertext));
  state=JSON.parse(decoder.decode(plain));
 }catch{throw Error('Tresor konnte nicht geöffnet werden: Passwort falsch oder Datei beschädigt.');}
 upgrade(state);validate(state);
 return {state,session:{key,salt:e.salt,iterations:e.iterations,revision:e.revision}};
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
    savedAt:m.savedAt||null,fileName:m.fileName||null,linked:Boolean(m.handle),backupRevision:m.backupRevision??null};}).sort((a,b)=>a.name.localeCompare(b.name,'de')));
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
