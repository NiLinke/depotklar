// Speichern nacheinander. Jeder Auftrag nimmt den Stand zum Zeitpunkt der Änderung mit;
// Sperren, Sicherung, Passwortwechsel und Tresorwechsel warten mit flush() auf alle offenen
// Aufträge. Ein Fehler bleibt stehen, bis ein späterer Auftrag gelingt.
//
// checkFile: läuft vor dem Speichern; wirft es, wird nichts gespeichert. Die Anwendung prüft dort,
// ob eine verbundene Datei anderswo geändert wurde, und merkt dann einen Konflikt vor – gespeichert
// wird in dem Fall nur im Browser. writeFile: schreibt danach in die Datei; scheitert das,
// ist der Stand im Browser gesichert, die Datei aber nicht aktuell (fileError).
export function createSaver({seal,save,getSession,setSession,getVault,checkFile=null,writeFile=null}){
 let chain=Promise.resolve(),pending=0,error=null,fileError=null;
 return {
  get pending(){return pending;},
  get error(){return error;},
  get fileError(){return fileError;},
  persist(state){
   const snapshot=state;pending++;
   chain=chain.then(async()=>{
    const session=getSession(),vault=getVault();
    if(!session)throw Error('Der Tresor ist gesperrt – die Änderung wurde nicht gespeichert.');
    const previous=session.revision,envelope=await seal(snapshot,session);
    if(checkFile)await checkFile(vault,previous);
    await save(envelope,previous,vault);
    // Wurde der Tresor inzwischen gewechselt, gehört die neue Revision nicht mehr zur Sitzung.
    if(getSession()===session)setSession({...session,revision:envelope.revision});
    error=null;
    if(writeFile){try{await writeFile(vault,envelope);fileError=null;}catch(err){fileError=err.message;}}
   }).catch(err=>{error=err.message;}).finally(()=>{pending--;});
   return chain;
  },
  flush(){return chain;},
  reset(){error=null;fileError=null;}
 };
}
