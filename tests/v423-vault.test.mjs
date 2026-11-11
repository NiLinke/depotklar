import test from 'node:test';
import assert from 'node:assert/strict';
import {newSession,seal,open,openBest,openWithSession,fileRelation,fileChanged,standOf,sameStand} from '../dist/core/vault.mjs';
import {emptyState,withRecord} from '../dist/core/model.mjs';
import {vaultPageHTML,fileConflictHTML,lockHTML} from '../dist/ui/vaultui.mjs';

// Prüfpasswort nur für diese Tests.
const PW='nur-ein-test-passwort';
const names=o=>o.state.persons.map(p=>p.name).join(',');
// Ein Tresor und Stände, die von einem gemeinsamen Stand aus unabhängig weitergeführt werden (zwei Geräte).
async function vault(){
 let session=await newSession(PW),state=emptyState();state.persons=[{id:'p',name:'Start'}];
 const base=await seal(state,session);
 const advance=async(from,fromState,name,times=1)=>{let s={...session,revision:from.revision},st=fromState,e=from;for(let i=0;i<times;i++){st=withRecord(st,'persons',{name:`${name}${i+1}`});e=await seal(st,s);s={...s,revision:e.revision};}return {envelope:e,state:st};};
 return {base,state,advance,session:{...session,revision:base.revision}};
}
const damaged=e=>({...e,ciphertext:e.ciphertext.slice(0,40)+(e.ciphertext.slice(40,44)==='AAAA'?'BBBB':'AAAA')+e.ciphertext.slice(44)});

test('Verhältnis von Datei und Browser: erkannt an der Kennung des Stands, nicht an der Revisionsnummer',()=>{
 const a={revision:5,iv:'a'},b={revision:5,iv:'b'},c={revision:3,iv:'c'},d={revision:9,iv:'d'};
 assert.equal(sameStand(a,{revision:5,iv:'a'}),true);assert.equal(sameStand(a,b),false);assert.equal(sameStand(a,null),false);
 assert.equal(fileRelation({local:a,file:null,seen:a}),'none');
 assert.equal(fileRelation({local:a,file:{revision:5,iv:'a'},seen:null}),'same');
 // Datei unverändert seit dem letzten Abgleich, Browser weiter: fortschreiben.
 assert.equal(fileRelation({local:d,file:a,seen:a}),'fileBehind');
 // Datei anderswo geändert, Browser unverändert: Es gilt die Datei – auch mit niedrigerer oder gleicher Revision.
 assert.equal(fileRelation({local:a,file:c,seen:a}),'fileAhead');assert.equal(fileRelation({local:a,file:b,seen:a}),'fileAhead');
 // Beide geändert: Konflikt, gleich welche Revision höher ist.
 assert.equal(fileRelation({local:d,file:b,seen:a}),'both');assert.equal(fileRelation({local:b,file:d,seen:a}),'both');
 // Verbindung aus der Zeit vor 4.23 (kein Vermerk): höhere Revision gilt, sonst ist es unklar.
 assert.equal(fileRelation({local:a,file:d,seen:null}),'fileAhead');assert.equal(fileRelation({local:a,file:c,seen:null}),'both');assert.equal(fileRelation({local:a,file:b,seen:null}),'both');
 assert.equal(fileRelation({local:null,file:a,seen:null}),'fileAhead');
 // Vor dem Speichern: mit Vermerk zählt jede Abweichung, ohne Vermerk wie bisher nur die höhere Revision.
 assert.equal(fileChanged(b,a,5),true);assert.equal(fileChanged(c,a,5),true);assert.equal(fileChanged({revision:5,iv:'a'},a,5),false);assert.equal(fileChanged(null,a,5),false);
 assert.equal(fileChanged(c,null,5),false);assert.equal(fileChanged(d,null,5),true);
 assert.deepEqual(standOf({revision:2,iv:'x',ciphertext:'…'}),{revision:2,iv:'x'});assert.equal(standOf(null),null);
});

test('Öffnen: Ein Stand aus einer Datei gilt erst nach der Prüfung mit dem Passwort; paralleles Arbeiten wird nicht überschrieben',async()=>{
 const v=await vault(),seen=standOf(v.base);
 const a=await v.advance(v.base,v.state,'A',3),b=await v.advance(v.base,v.state,'B',2);
 assert.ok(b.envelope.revision<a.envelope.revision,'B hat die niedrigere Revision');
 // Nur die Datei wurde anderswo geändert: Es gilt die Datei.
 let r=await openBest({local:v.base,file:b.envelope,seen,password:PW});
 assert.deepEqual([r.source,r.conflict,r.keepLocal,names(r)],['file',null,false,'Start,B1,B2']);
 // Der Browser hatte seinen Stand schon in die Datei geschrieben (seen = sein Stand), danach hat ein anderes Gerät sie mit
 // einem unabhängig weitergeführten Stand ersetzt: Dem Stand der Datei fehlen Änderungen des Browsers – Konflikt, gleich
 // ob die Datei die niedrigere, die gleiche oder die höhere Revision trägt. Erkannt wird das am Protokoll.
 const mine=standOf(a.envelope),equal=await v.advance(v.base,v.state,'C',3),higher=await v.advance(v.base,v.state,'D',5);
 assert.equal(equal.envelope.revision,a.envelope.revision);assert.ok(higher.envelope.revision>a.envelope.revision);
 for(const other of [b,equal,higher]){
  assert.equal(fileRelation({local:a.envelope,file:other.envelope,seen:mine}),'fileAhead','an den Kennungen allein nicht zu erkennen');
  r=await openBest({local:a.envelope,file:other.envelope,seen:mine,password:PW});
  assert.deepEqual([r.source,r.relation,r.conflict,r.keepLocal,names(r)],['local','both','both',false,'Start,A1,A2,A3']);assert.equal(sameStand(r.envelope,a.envelope),true);
 }
 // Verbindung aus der Zeit vor 4.23 (kein Vermerk): Die höhere Revision allein genügt nicht mehr.
 r=await openBest({local:a.envelope,file:higher.envelope,seen:null,password:PW});assert.deepEqual([r.source,r.conflict],['local','both']);
 // Baut die Datei auf dem Stand des Browsers auf, gilt sie, und nichts ist aufzubewahren.
 const next=await v.advance(a.envelope,a.state,'N',1);
 r=await openBest({local:a.envelope,file:next.envelope,seen:mine,password:PW});assert.deepEqual([r.source,r.conflict,r.keepLocal,names(r)],['file',null,false,'Start,A1,A2,A3,N1']);
 r=await openBest({local:a.envelope,file:next.envelope,seen:null,password:PW});assert.deepEqual([r.source,r.keepLocal],['file',false]);
 // Die Datei wurde anderswo auf einen früheren Stand derselben Folge zurückgesetzt: Sie gilt, der Stand des Browsers wird aufbewahrt.
 r=await openBest({local:a.envelope,file:v.base,seen:mine,password:PW});assert.deepEqual([r.source,r.conflict,r.keepLocal,names(r)],['file',null,true,'Start']);
 // Lässt sich der Stand des Browsers nicht prüfen (beschädigt), gilt die Datei; aufbewahrt wird er nur, wenn sie nicht erkennbar weiter ist.
 r=await openBest({local:damaged(a.envelope),file:next.envelope,seen:mine,password:PW});assert.deepEqual([r.source,r.keepLocal],['file',false]);
 r=await openBest({local:damaged(a.envelope),file:b.envelope,seen:mine,password:PW});assert.deepEqual([r.source,r.keepLocal],['file',true]);
 // Nur der Browser ist weiter (Datei unverändert): Es gilt der Browser, kein Konflikt.
 r=await openBest({local:a.envelope,file:v.base,seen,password:PW});
 assert.deepEqual([r.source,r.conflict,r.relation],['local',null,'fileBehind']);
 // Beide geändert: Der Browser bleibt geöffnet, nichts wird überschrieben – früher hätte die höhere Revision still gewonnen.
 r=await openBest({local:a.envelope,file:b.envelope,seen,password:PW});
 assert.deepEqual([r.source,r.conflict,names(r)],['local','both','Start,A1,A2,A3']);
 r=await openBest({local:b.envelope,file:a.envelope,seen,password:PW});
 assert.deepEqual([r.source,r.conflict,names(r)],['local','both','Start,B1,B2']);
 // Falsches Passwort: nichts geht auf.
 await assert.rejects(openBest({local:a.envelope,file:b.envelope,seen,password:PW+'x'}),/Passwort falsch oder Datei beschädigt/);
});

test('Öffnen: Eine beschädigte Datei ersetzt nie den Stand im Browser',async()=>{
 const v=await vault(),seen=standOf(v.base),b=await v.advance(v.base,v.state,'B',2);
 // Verbundene Datei wäre maßgeblich, ist aber beschädigt: Der Browser gilt, die Datei bleibt unberührt.
 let r=await openBest({local:v.base,file:damaged(b.envelope),seen,password:PW});
 assert.deepEqual([r.source,r.conflict,r.failed,names(r)],['local','unreadable',['file'],'Start']);
 // Eingelesene Sicherung mit höherer Revision: erst prüfen, dann übernehmen. Enthält sie den Stand des Browsers
 // vollständig, ist nichts aufzubewahren; trug der Browser eigene Änderungen, bleibt sein Stand aufbewahrt.
 r=await openBest({local:v.base,incoming:b.envelope,password:PW});
 assert.deepEqual([r.source,r.keepLocal,names(r)],['incoming',false,'Start,B1,B2']);
 const own=await v.advance(v.base,v.state,'A',1);assert.ok(b.envelope.revision>own.envelope.revision);
 r=await openBest({local:own.envelope,incoming:b.envelope,password:PW});
 assert.deepEqual([r.source,r.conflict,r.keepLocal,names(r)],['incoming',null,true,'Start,B1,B2']);
 r=await openBest({local:v.base,incoming:damaged(b.envelope),password:PW});
 assert.deepEqual([r.source,r.conflict,r.failed,names(r)],['local',null,['incoming'],'Start']);
 // Eine vorgemerkte Datei, die nicht mehr neuer ist, bleibt unbeachtet.
 r=await openBest({local:b.envelope,incoming:v.base,password:PW});assert.equal(r.source,'local');
 // Ohne Stand im Browser gilt die Datei; ohne alles gibt es nichts zu öffnen.
 r=await openBest({file:b.envelope,password:PW});assert.equal(r.source,'file');
 await assert.rejects(openBest({password:PW}),/nichts gespeichert/);
});

test('Passwort mit Umlaut öffnet in beiden Unicode-Schreibweisen; ein anderer Stand lässt sich mit der offenen Sitzung lesen',async()=>{
 const nfc='Pässwörter-für-Tests'.normalize('NFC'),nfd=nfc.normalize('NFD');assert.notEqual(nfc,nfd);
 const state=emptyState(),one=await newSession(nfd),sealed=await seal(state,one);
 assert.ok((await open(sealed,nfc)).state,'in zerlegter Form angelegt, zusammengesetzt geöffnet');assert.ok((await open(sealed,nfd)).state);
 await assert.rejects(open(sealed,nfc+'x'),/Passwort falsch/);
 // Derselbe Tresor, zweiter Stand: ohne Passwort mit dem Schlüssel der Sitzung; ein Stand mit anderem Passwort nicht.
 const session={...one,revision:sealed.revision},next=await seal(withRecord(state,'persons',{name:'Neu'}),session);
 const read=await openWithSession(next,session);assert.equal(read.state.persons[0].name,'Neu');assert.equal(read.session.revision,next.revision);
 const other=await newSession(PW);await assert.rejects(openWithSession(await seal(state,other),session),/anderen Passwort/);
 await assert.rejects(openWithSession(damaged(next),session),/beschädigt/);
});

test('Tresorseite: Konflikt mit ausdrücklicher Entscheidung, aufbewahrter Stand, Hinweis am Sperrbildschirm',()=>{
 const both=vaultPageHTML({demo:false,vault:{name:'Familie'},revision:7,fileAccess:true,file:{handle:{},name:'familie.depotklar',granted:true,conflict:'both',fileRevision:5},fileError:'x'});
 assert.match(both,/verschiedene Stände/);assert.match(both,/Revision 5/);assert.match(both,/eigene Änderungen \(Revision 7\)/);
 for(const a of ['file-take','file-overwrite','save-as-file','unlink-file'])assert.match(both,new RegExp(`data-action="${a}"`),a);
 assert.doesNotMatch(both,/die Datei ist nicht aktuell/,'der Konflikt erklärt es schon');
 const unreadable=fileConflictHTML({name:'f.depotklar',conflict:'unreadable',fileRevision:9},7);
 assert.match(unreadable,/ließ sich mit Ihrem Passwort nicht öffnen/);assert.doesNotMatch(unreadable,/data-action="file-take"/);
 const kept=vaultPageHTML({demo:false,vault:{name:'Familie'},revision:7,kept:{revision:4,reason:'Stand dieses Browsers, bevor die eingelesene Datei übernommen wurde',when:'11.11.2026, 10:00'}});
 assert.match(kept,/Aufbewahrter Stand/);assert.match(kept,/Revision 4/);for(const a of ['kept-restore','kept-download','kept-drop'])assert.match(kept,new RegExp(`data-action="${a}"`));
 assert.doesNotMatch(vaultPageHTML({demo:false,vault:{name:'Familie'},revision:7}),/Aufbewahrter Stand|verschiedene Stände/);
 assert.match(lockHTML({vaults:[{id:'a',name:'A',revision:3,pending:true},{id:'b',name:'B',revision:1}],selected:'a'}),/eingelesene Datei wird beim Öffnen geprüft/);
});
