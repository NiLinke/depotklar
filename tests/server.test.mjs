import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createDepotklarServer} from '../server.mjs';

test('public landing, local app, legal routes and health endpoint have distinct secure responses',async()=>{
 const server=createDepotklarServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const landing=await fetch(base+'/'),html=await landing.text();assert.equal(landing.status,200);assert.match(html,/Vermögen ordnen/);assert.doesNotMatch(html,/src="\/app.mjs"/);assert.match(landing.headers.get('content-security-policy'),/connect-src 'none'/);assert.equal(landing.headers.get('cache-control'),'no-store');assert.equal(landing.headers.get('x-frame-options'),'DENY');
  const app=await fetch(base+'/app/'),appHTML=await app.text();assert.equal(app.status,200);assert.match(appHTML,/src="\/app.mjs"/);assert.match(appHTML,/noindex,nofollow/);assert.doesNotMatch(appHTML,/landing.mjs/);
  const redirect=await fetch(base+'/app?demo=1',{redirect:'manual'});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/app/?demo=1');
  for(const route of ['/impressum','/datenschutz','/landing.css','/landing.mjs','/app.mjs','/app.css','/core/model.mjs','/ui/sheet.mjs','/favicon.svg','/robots.txt','/sitemap.xml'])assert.equal((await fetch(base+route)).status,200,route);
  assert.deepEqual(await(await fetch(base+'/healthz')).json(),{status:'ok',service:'depotklar'});
  const head=await fetch(base+'/app/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal((await fetch(base+'/upload',{method:'POST',body:'not financial data'})).status,405);
  assert.equal((await fetch(base+'/.git/config')).status,404);
  assert.equal((await fetch(base+'/missing-page')).status,404);
  // Use a raw path: fetch/URL would normalize traversal before sending it.
  const forbidden=await new Promise((resolve,reject)=>{const request=http.get(base+'/',{path:'/%2e%2e%5cpackage.json'},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);});assert.ok([403,404].includes(forbidden));
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('isolation headers and app-only mode for operation in an own network',async()=>{
 const full=createDepotklarServer({site:'full'}),app=createDepotklarServer({site:'app'});
 await Promise.all([full,app].map(s=>new Promise(resolve=>s.listen(0,'127.0.0.1',resolve))));
 const at=s=>`http://127.0.0.1:${s.address().port}`;
 try{
  const r=await fetch(at(full)+'/app/');
  assert.equal(r.headers.get('cross-origin-opener-policy'),'same-origin');assert.equal(r.headers.get('cross-origin-resource-policy'),'same-origin');
  assert.match(r.headers.get('permissions-policy'),/payment=\(\)/);
  const home=await fetch(at(app)+'/?demo=1',{redirect:'manual'});assert.equal(home.status,308);assert.equal(home.headers.get('location'),'/app/?demo=1');
  for(const route of ['/impressum','/datenschutz','/index.html','/landing.mjs','/sitemap.xml'])assert.equal((await fetch(at(app)+route)).status,404,route);
  assert.equal(await(await fetch(at(app)+'/robots.txt')).text(),'User-agent: *\nDisallow: /\n');
  for(const route of ['/app/','/app.mjs','/doku/','/healthz'])assert.equal((await fetch(at(app)+route)).status,200,route);
  assert.throws(()=>createDepotklarServer({site:'public'}),/full“ oder „app/);
 }finally{await Promise.all([full,app].map(s=>new Promise(resolve=>s.close(resolve))));}
});
