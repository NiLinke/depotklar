import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8', '.json':'application/json; charset=utf-8', '.md':'text/plain; charset=utf-8', '.xml':'application/xml; charset=utf-8', '.png':'image/png' };
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data: blob:; font-src 'self'; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
// Betriebsart: 'full' (Standard) liefert Startseite, Impressum und Datenschutz mit; 'app' nur Anwendung und Handbuch –
// für den Betrieb im eigenen Netz, wo die Seiten des Projekts nicht als eigene erscheinen sollen. „/“ führt dann zur
// Anwendung, robots.txt sperrt Suchmaschinen.
const SITE_ONLY=new Set(['/index.html','/impressum','/impressum.html','/datenschutz','/datenschutz.html','/landing.css','/landing.mjs','/sitemap.xml']);
export function createDepotklarServer({site=process.env.DEPOTKLAR_SITE||'full'}={}){
 if(!['full','app'].includes(site))throw Error(`DEPOTKLAR_SITE muss „full“ oder „app“ sein, nicht „${site}“.`);
 const appOnly=site==='app';
 return http.createServer(async (req, res) => {
  for(const [key,value] of Object.entries(headers))res.setHeader(key,value);
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, {Allow:'GET, HEAD'}); res.end(); return; }
    const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
    if(pathname==='/doku'){res.writeHead(308,{Location:'/doku/'});res.end();return;}
    if(pathname==='/app'){res.writeHead(308,{Location:'/app/'+url.search});res.end();return;}
    if(appOnly&&pathname==='/'){res.writeHead(308,{Location:'/app/'+url.search});res.end();return;}
    if(appOnly&&pathname==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});res.end(req.method==='HEAD'?undefined:'User-agent: *\nDisallow: /\n');return;}
    if(appOnly&&SITE_ONLY.has(pathname)){res.writeHead(404);res.end('Nicht gefunden');return;}
    if(pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok',service:'depotklar'}));return;}
    const routes={'/doku/':'/doku/index.html','/':'/index.html','/app/':'/app.html','/app/index.html':'/app.html','/impressum':'/impressum.html','/datenschutz':'/datenschutz.html'};
    const file = path.resolve(root, '.' + (routes[pathname]||pathname));
    if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Content-Length':data.length});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Nicht gefunden'); }
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=createDepotklarServer();
 server.listen(Number(process.env.PORT || 4173), process.env.HOST || '127.0.0.1', () => console.log(`Depotklar: http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`));
}
