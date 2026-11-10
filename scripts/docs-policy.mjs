import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function needsDocumentation(files){return files.some(p=>/^dist\/(?!doku\/|vendor\/|rates\/).+\.(mjs|html|css)$/.test(p)||/^scripts\//.test(p)||['server.mjs','Dockerfile','package.json','package-lock.json'].includes(p));}
export function checkDocumentationChange(files){if(needsDocumentation(files)&&!files.includes('public-docs/AENDERUNGEN.md'))throw Error('Produktänderung ohne Dokumentationsverlauf: public-docs/AENDERUNGEN.md aktualisieren.');}
if(process.env.GITHUB_ACTIONS==='true'&&process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 const base=event.pull_request?.base.sha||event.before;
 const revision=base&&!/^0+$/.test(base)?base:'HEAD^';
 const files=execFileSync('git',['diff','--name-only',revision,'HEAD'],{encoding:'utf8'}).trim().split(/\r?\n/);
 checkDocumentationChange(files);console.log('Dokumentationspflicht geprüft.');
}
