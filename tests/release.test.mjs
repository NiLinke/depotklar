import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_VERSION} from '../dist/core/model.mjs';
import {lockHTML} from '../dist/ui/vaultui.mjs';

const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8');

test('Versionsangaben stimmen überein: Anwendung, package.json, Lockfile, README',()=>{
 const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
 assert.equal(pkg.version,APP_VERSION);assert.equal(lock.version,APP_VERSION);assert.equal(lock.packages[''].version,APP_VERSION);
 assert.match(read('README.md'),new RegExp(`Version ${APP_VERSION.replaceAll('.','\.')}\.`));
});

test('Nutzungsrechte stehen in README und Betriebsanleitung; keine freie Lizenz',()=>{
 const readme=read('README.md');
 assert.match(readme,/^## Nutzungsrechte$/m);assert.match(readme,/Alle Rechte vorbehalten\./);assert.match(readme,/schriftlicher Erlaubnis des Rechteinhabers/);
 assert.match(read('BETRIEB.md'),/alle Rechte vorbehalten/);
 assert.throws(()=>read('LICENSE'),/ENOENT/,'eine Lizenzdatei wäre eine bewusste Entscheidung des Rechteinhabers');
});

test('Lieferkette fest: Grundimage mit Prüfsumme, GitHub-Aktionen auf Commits',()=>{
 const docker=read('Dockerfile');
 assert.match(docker,/^ARG NODE_IMAGE=node:\d+\.\d+\.\d+-alpine\d+\.\d+@sha256:[0-9a-f]{64}$/m);
 assert.equal((docker.match(/^FROM \$\{NODE_IMAGE\}/gm)||[]).length,2,'beide Stufen nutzen das feste Image');
 assert.match(docker,/^USER node$/m);
 for(const f of ['.github/workflows/ci.yml','.github/workflows/rates.yml']){
  const uses=[...read(f).matchAll(/uses:\s*(\S+)/g)].map(m=>m[1]);
  assert.ok(uses.length);for(const u of uses)assert.match(u,/@[0-9a-f]{40}$/,`${f}: ${u}`);
 }
});

test('Compose-Vorlage mit sicheren Einstellungen und Betriebsart nur Anwendung',()=>{
 const c=read('compose.yaml');
 for(const x of [/read_only: true/,/- ALL/,/no-new-privileges:true/,/DEPOTKLAR_SITE: app/,/"127\.0\.0\.1:3000:3000"/])assert.match(c,x);
});

test('Ohne sicheren Kontext: klarer Hinweis statt Tresorformular, Demo bleibt',()=>{
 const html=lockHTML({vaults:[],secure:false});
 assert.match(html,/Sichere Verbindung nötig/);assert.match(html,/HTTPS/);assert.match(html,/data-action="demo"/);
 assert.doesNotMatch(html,/data-form="create"|data-form="unlock"/);
 assert.match(lockHTML({vaults:[]}),/data-form="create"/,'mit sicherem Kontext wie bisher');
});
