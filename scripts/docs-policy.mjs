import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function needsDocumentation(files){return files.some(p=>/^dist\/(?!doku\/|vendor\/|rates\/).+\.(mjs|html|css)$/.test(p)||/^scripts\//.test(p)||['server.mjs','Dockerfile','package.json','package-lock.json'].includes(p));}
export function checkDocumentationChange(files){if(needsDocumentation(files)&&!files.includes('public-docs/AENDERUNGEN.md'))throw Error('Produktänderung ohne Dokumentationsverlauf: public-docs/AENDERUNGEN.md aktualisieren.');}
// Vergleichsstand: Basis des Pull Requests oder Stand vor dem Push. Fehlt er im Klon (neuer Zweig, überschriebener
// Zweig), gilt der Vorgänger; ohne Vorgänger (erster Eintrag eines Repositorys) der leere Stand, alle Dateien gelten als neu.
export function diffBase(event,{known,emptyTree}){
 const base=event.pull_request?.base.sha||event.before;
 if(base&&!/^0+$/.test(base)&&known(base))return base;
 return known('HEAD^')?'HEAD^':emptyTree();
}
if(process.env.GITHUB_ACTIONS==='true'&&process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 const known=rev=>{try{execFileSync('git',['rev-parse','--verify','--quiet',`${rev}^{commit}`],{stdio:'ignore'});return true;}catch{return false;}};
 const emptyTree=()=>execFileSync('git',['hash-object','-t','tree','--stdin'],{input:'',encoding:'utf8'}).trim();
 const files=execFileSync('git',['diff','--name-only',diffBase(event,{known,emptyTree}),'HEAD'],{encoding:'utf8'}).trim().split(/\r?\n/);
 checkDocumentationChange(files);console.log('Dokumentationspflicht geprüft.');
}
