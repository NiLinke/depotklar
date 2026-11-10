import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate,withYearRules,today} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {giftAssessments} from '../dist/core/gifttax.mjs';
import {taxYearOf,baseRateOf,LAST_RULE_YEAR} from '../dist/core/rules.mjs';
import {pricesHTML} from '../dist/ui/prices.mjs';
import {taxPageHTML} from '../dist/ui/taxpage.mjs';
import {masterHTML} from '../dist/ui/master.mjs';
import {needsDocumentation} from '../scripts/docs-policy.mjs';
import {extendTable} from '../scripts/fxrates.mjs';
import {mergeVat,provisionalMonths} from '../scripts/vatrates.mjs';
import TABLE from '../dist/rates/vat.mjs';
import {publishedVatRate,vatRateOf,isProvisionalVatRate} from '../dist/core/vatrates.mjs';
import {fxReplay} from '../dist/core/fx.mjs';

const THIS_YEAR=Number(today().slice(0,4));
const PARAMS={churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0'};
function family(){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person Eins'},{id:'k',name:'Kind Eins'}];
 s.relations=[{donorId:'p',recipientId:'k',kind:'child'}];
 s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot'},{id:'dk',personId:'k',bank:'Bank A',name:'Kinderdepot'}];
 s.securities=[{id:'a',isin:'DE0000000011',name:'Fiktive Aktie',kind:'stock'}];
 s.events=[{id:'b',type:'buy',date:'2026-03-02',depotId:'d',securityId:'a',quantity:'100',amount:'10000'},
  {id:'v',type:'sell',date:'2031-04-01',depotId:'d',securityId:'a',quantity:'50',amount:'8000'}];
 s.years={p:{2031:PARAMS}};
 validate(s);return s;
}

test('Geltendes Recht läuft weiter: 2031 rechnet ohne jede Einstellung',()=>{
 const s=family(),rule=taxYearOf(s,2031);
 assert.equal(rule.allowance,'1000');assert.equal(rule.continued,true);assert.match(rule.source,/./);
 assert.equal(taxYearOf(s,2017),null,'vor 2018 bleibt außerhalb des Modells');
 // Verkauf 2031: 8.000 − 5.000 = 3.000 €, abzüglich 1.000 € Sparer-Pauschbetrag = 2.000 €, Abgeltungsteuer 500 €, Soli 27,50 €.
 const r=yearReport(s,'p',2031);
 assert.equal(r.status,'supported');assert.equal(r.total,'527.5');
 assert.ok(r.hints.some(h=>/1000 € nach geltendem Recht/.test(h)));
});

test('Ein geänderter Sparer-Pauschbetrag gilt ab seinem Jahr, auch für die Jahre danach',()=>{
 const s=withYearRules(family(),2029,{allowance:'1500'});
 assert.equal(taxYearOf(s,2028).allowance,'1000');
 assert.equal(taxYearOf(s,2029).allowance,'1500');assert.equal(taxYearOf(s,2029).confirmed,true);
 assert.equal(taxYearOf(s,2031).allowance,'1500');
 // 3.000 − 1.500 = 1.500 €, Abgeltungsteuer 375 €, Soli 20,62 € (abgerundet).
 const r=yearReport(s,'p',2031);assert.equal(r.total,'395.62');
 assert.ok(r.hints.some(h=>/selbst unter „Kurse“ eingetragen/.test(h)));
});

test('Der Basiszins wird nie geerbt und lässt sich ohne Sparer-Pauschbetrag eintragen',()=>{
 let s=family();
 assert.equal(baseRateOf(s,2027),null);
 s=withYearRules(s,2027,{baseRate:'0.0275'});
 assert.equal(baseRateOf(s,2027).rate,'0.0275');assert.equal(baseRateOf(s,2028),null,'das Folgejahr bleibt offen');
 assert.equal(taxYearOf(s,2027).continued,true,'der Basiszins allein ändert den Pauschbetrag nicht');
 validate(s);
 assert.equal(withYearRules(s,2027,{baseRate:'0.0275'}),s,'unverändert: kein neuer Protokolleintrag');
 const cleared=withYearRules(s,2027,{});
 assert.equal(cleared.yearRules,undefined,'leer löscht den Eintrag');
 assert.equal(cleared.audit.at(-1).action,'Jahreswerte geändert');
});

test('Schenkungen künftiger Jahre rechnen ohne Bestätigung',()=>{
 const s=family();
 s.events.push({id:'g',type:'transfer',kind:'gift',date:'2028-05-05',depotId:'d',toDepotId:'dk',securityId:'a',quantity:'10',price:'150'});
 const g=giftAssessments(s,replay(s,{until:'2028-12-31'}).moves,'p','k').acquisitions[0];
 assert.equal(g.status,'supported');assert.equal(g.tax,'0');
});

test('Jahreswerte stehen zentral unter „Kurse“, die Steuerseite fragt nichts mehr ab',()=>{
 const s=family(),html=pricesHTML(s);
 assert.match(html,/id="jahreswerte"/);
 const last=Math.max(THIS_YEAR+2,2031);
 assert.match(html,new RegExp(`data-year-rule="baseRate" data-year="${last}"`));
 assert.match(html,/data-year-rule="allowance" data-year="2027"/);
 assert.doesNotMatch(html,new RegExp(`data-year-rule="baseRate" data-year="${LAST_RULE_YEAR}"`),'hinterlegte Jahre sind fest');
 assert.match(html,/Amtlich hinterlegt/);assert.match(html,/03\.01\.2028/);
 assert.doesNotMatch(taxPageHTML(s,{personId:'p',year:2031,years:[2031]}),/data-form="rules"/);
 assert.match(pricesHTML(withYearRules(s,2027,{baseRate:'0.0275'})),/value="2,75"/);
 const shut={...withYearRules(s,2027,{baseRate:'0.0275'}),closing:{k:2027}};validate(shut);
 assert.match(pricesHTML(shut),/data-year-rule="baseRate" data-year="2027"[^>]*disabled/);
 assert.throws(()=>withYearRules(shut,2027,{baseRate:'0.03'}),/abgeschlossen/);
});

test('Am Konto wird der Kurs für die Buchhaltung gewählt',()=>{
 const s=family();s.accounts=[{id:'a1',depotId:'d',name:'USD-Konto',currency:'USD',kind:'payment',vatBook:true}];
 const html=masterHTML(s,{editing:{collection:'accounts',id:'a1'}});
 assert.match(html,/name="bookRate"/);assert.match(html,/<option value="vat" selected/);
});

test('Vorläufige USt-Kurse: nur abgeschlossene Monate, gekennzeichnet, jeder andere Wert geht vor',()=>{
 // Mittel aus 1,10 und 1,20 = 1,15, vier Stellen wie der letzte amtliche Wert; der laufende Monat fehlt.
 const made=provisionalMonths({to:'2026-10',rates:{USD:{2026:'1.1202,,,,,,,,,,,'}}},{USD:{'2026-10':['9'],'2026-11':['1.10','1.20'],'2026-12':['1.3']},XXX:{'2026-11':['1']}},'2026-12');
 assert.deepEqual(made,{USD:{'2026-11':'1.1500'}});
 const month='2099-03',was=TABLE.provisional;
 TABLE.provisional={USD:{[month]:'1.2500','2025-03':'9'}};
 try{
  assert.equal(publishedVatRate('USD',month),null,'die amtliche Tabelle bleibt unberührt');
  assert.equal(vatRateOf({},'USD',month),'1.2500');assert.equal(isProvisionalVatRate({},'USD',month),true);
  assert.equal(vatRateOf({vatRates:{USD:{[month]:'1.3'}}},'USD',month),'1.3','der eigene Eintrag geht vor');
  assert.equal(isProvisionalVatRate({vatRates:{USD:{[month]:'1.3'}}},'USD',month),false);
  assert.equal(vatRateOf({},'USD','2025-03'),'1.0807','der amtliche Wert geht immer vor');
  const s=family();s.accounts=[{id:'a1',depotId:'d',name:'USD-Konto',currency:'USD',kind:'payment',vatBook:true}];
  s.events.push({id:'x',type:'fx',kind:'exchangeIn',date:`${month}-10`,depotId:'d',accountId:'a1',amount:'125',eur:'100'});
  // 125 USD ÷ 1,25 = 100 €, im Kontoblatt der Buchhaltung als vorläufig ausgewiesen.
  const line=fxReplay(s,{until:`${month}-31`,basis:'book'}).moves.find(m=>m.eventId==='x');
  assert.equal(line.eur,'100');assert.equal(line.quote.provisional,true);
  s.accounts[0].vatBook=true;
  const html=pricesHTML(s,{vatYear:2099});assert.match(html,/placeholder="1,2500"/);assert.match(html,/Vorläufig: Monatsmittel/);
 }finally{if(was===undefined)delete TABLE.provisional;else TABLE.provisional=was;}
});

test('Die Kurstabellen wachsen nur: vorhandene Werte bleiben, neue Tage und Monate kommen dazu',()=>{
 const old={currency:'USD',from:'2026-10-29',to:'2026-10-30',source:'x',data:'1.10,1.11'};
 const next=extendTable(old,'USD',[['2026-10-29','9.99'],['2026-10-30','9.99'],['2026-11-02','1.12'],['2026-11-03','1.13']]);
 assert.equal(next.data,'1.10,1.11,3:1.12,1.13');assert.equal(next.to,'2026-11-03');assert.equal(next.from,'2026-10-29');
 assert.equal(extendTable(next,'USD',[['2026-11-03','1.13']]),next,'nichts Neues: unverändert');
 const merged=mergeVat({USD:{2026:'1.1,1.2,,,,,,,,,,'}},{USD:{2026:'9.9,9.9,1.3,,,,,,,,,',2027:'1.4,,,,,,,,,,,'},GBP:{2026:'0.8,,,,,,,,,,,'}});
 assert.equal(merged.USD[2026],'1.1,1.2,1.3,,,,,,,,,');assert.equal(merged.USD[2027],'1.4,,,,,,,,,,,');assert.equal(merged.GBP[2026],'0.8,,,,,,,,,,,');
 assert.equal(needsDocumentation(['dist/rates/USD.mjs','dist/rates/index.mjs']),false,'Kursdaten brauchen keinen Änderungseintrag');
 assert.equal(needsDocumentation(['dist/core/fx.mjs']),true);
});
