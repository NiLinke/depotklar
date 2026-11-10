import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generate,CHAPTERS,markdown,safeLink} from '../scripts/docs.mjs';
import {needsDocumentation,checkDocumentationChange} from '../scripts/docs-policy.mjs';
import {APP_VERSION} from '../dist/core/model.mjs';

test('published documentation matches the shipped code and lists only the chosen chapters',async()=>{
 const r=await generate({check:true});
 assert.equal(r.meta.app,APP_VERSION);
 for(const p of Object.keys(r.meta.inputHashes))assert.ok(p.startsWith('public-docs/')||p.startsWith('dist/')||['scripts/docs.mjs','server.mjs','package.json'].includes(p),p);
 assert.ok(Object.keys(r.meta.inputHashes).includes('dist/core/ledger.mjs'));assert.ok(Object.keys(r.meta.inputHashes).includes('dist/ui/sheet.mjs'));
 const llms=await readFile(new URL('../dist/llms.txt',import.meta.url),'utf8');
 assert.match(llms,new RegExp(`Version ${APP_VERSION.replaceAll('.','\\.')}`));for(const [id] of CHAPTERS)assert.match(llms,new RegExp(`/doku/${id}\\.md`));
 const full=await readFile(new URL('../dist/llms-full.txt',import.meta.url),'utf8');
 assert.match(full,/Basiszins der Vorabpauschale/);assert.match(full,/\| 2025 \| 0\.0253 \| 2026-01-02/);assert.match(full,/Rechenlogik und Grenzen/);
 // Fonds 2009 bis 2017 mit Rechenbeispiel; der KI-Einstieg kennt Übergang und Währungskonten.
 assert.match(full,/Steuerpflichtig 2022 sind 6\.695 €/);assert.match(full,/Übergang 2017\/2018, Kauf, Verkauf/);
 const ki=await readFile(new URL('../dist/doku/ki-start.md',import.meta.url),'utf8');
 assert.doesNotMatch(ki,/keine Fremdwährungsguthaben/);assert.match(ki,/Währungskonten in Fremdwährung schon/);
});

test('the documented example of a fund bought 2012 and sold 2022 is what Depotklar computes',async()=>{
 const {emptyState,validate}=await import('../dist/core/model.mjs'),{replay}=await import('../dist/core/ledger.mjs');
 const s=emptyState();s.persons=[{id:'p',name:'P'}];s.depots=[{id:'d',personId:'p',bank:'B',name:'D'}];s.securities=[{id:'F',name:'Aktienfonds',kind:'equityFund'}];
 s.events=[{id:'b',type:'buy',date:'2012-05-02',depotId:'d',securityId:'F',quantity:'100',amount:'10000'},
  {id:'t',type:'transition',date:'2017-12-31',depotId:'d',securityId:'F',price2017:'140',deemed2017:'4000',oldIncome:'0'},
  ...[[2018,'2019-01-02','80'],[2019,'2020-01-02','60'],[2020,'2021-01-04','10'],[2021,'2022-01-03','0']].map(([year,date,amount])=>({id:`v${year}`,type:'vap',date,depotId:'d',securityId:'F',year,amount})),
  {id:'s',type:'sell',date:'2022-06-01',depotId:'d',securityId:'F',quantity:'100',amount:'18000'}];
 s.prices=[{securityId:'F',date:'2017-12-29',price:'140'}];validate(s);
 const r=replay(s,{until:'2022-12-31'}),sale=r.moves.find(m=>m.eventId==='s').sale;
 assert.deepEqual([sale.status,sale.deemedGain,sale.details[0].post2018,sale.exempt,sale.taxable],['supported','4000','3850','1155','6695']);assert.equal(r.issues.length,0);
});

test('the markdown renderer escapes text and only links to safe targets',()=>{
 assert.doesNotMatch(markdown('<script>x</script>'),/<script>/);
 assert.match(markdown('[Logik](public-docs/LOGIK.md)'),/href="\/doku\/logik.html"/);
 assert.equal(safeLink('javascript:alert(1)'),null);assert.equal(safeLink('dist/core/ledger.mjs'),'/core/ledger.mjs');
 assert.match(markdown('| a | b |\n| --- | --- |\n| 1 | 2 |'),/<th>a<\/th>/);
});

test('product changes in subfolders still require a changelog entry',()=>{
 assert.equal(needsDocumentation(['dist/core/ledger.mjs']),true);assert.equal(needsDocumentation(['dist/ui/sheet.mjs']),true);
 assert.equal(needsDocumentation(['dist/doku/logik.html']),false);assert.equal(needsDocumentation(['README.md']),false);
 assert.throws(()=>checkDocumentationChange(['dist/app.mjs']),/AENDERUNGEN/);
 assert.doesNotThrow(()=>checkDocumentationChange(['dist/app.mjs','public-docs/AENDERUNGEN.md']));
});
