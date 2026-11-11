import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8', '.json':'application/json; charset=utf-8', '.md':'text/plain; charset=utf-8', '.xml':'application/xml; charset=utf-8', '.png':'image/png' };
// Strict-Transport-Security: Der Browser merkt sich für ein Jahr, diese Adresse nur noch über HTTPS aufzurufen. Über
// unverschlüsseltes HTTP (etwa localhost) beachten Browser die Angabe nicht.
const headers={'Cache-Control':'no-store','Strict-Transport-Security':'max-age=31536000','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data: blob:; font-src 'self'; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
// Betriebsart: 'full' (Standard) liefert Startseite, Impressum und Datenschutz mit; 'app' nur Anwendung und Handbuch –
// für den Betrieb im eigenen Netz, wo die Seiten des Projekts nicht als eigene erscheinen sollen. „/“ führt dann zur
// Anwendung, robots.txt sperrt Suchmaschinen.
// Geprüft wird die Datei, auf die der Pfad am Ende zeigt – nicht seine Schreibweise.
const SITE_ONLY=new Set(['index.html','impressum.html','datenschutz.html','landing.css','landing.mjs','sitemap.xml']);
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
    if(pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok',service:'depotklar'}));return;}
    const routes={'/doku/':'/doku/index.html','/':'/index.html','/app/':'/app.html','/app/index.html':'/app.html','/impressum':'/impressum.html','/datenschutz':'/datenschutz.html'};
    // Dateien haben keinen Schrägstrich am Ende und keinen Doppelpunkt oder Rückstrich im Pfad: Solche Schreibweisen
    // derselben Datei gibt es hier nicht (sie umgingen sonst die Auswahl der Betriebsart).
    if(!routes[pathname]&&(pathname.endsWith('/')||/[\\:]/.test(pathname))){res.writeHead(404);res.end('Nicht gefunden');return;}
    const file = path.resolve(root, '.' + (routes[pathname]||pathname));
    if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) { res.writeHead(403); res.end(); return; }
    if(appOnly&&SITE_ONLY.has(path.relative(root,file).split(path.sep).join('/').toLowerCase())){res.writeHead(404);res.end('Nicht gefunden');return;}
    const data = await readFile(file);
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Content-Length':data.length});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Nicht gefunden'); }
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=createDepotklarServer();
 server.listen(Number(process.env.PORT || 4173), process.env.HOST || '127.0.0.1', () => console.log(`Depotklar: http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`));
}
