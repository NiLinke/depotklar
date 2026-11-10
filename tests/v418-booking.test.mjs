import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {emptyState,validate,withEvent,withVatRate,lastSelectableYear,lastBookedYear,today} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {saleLine,periodStatement} from '../dist/core/statement.mjs';
import {fxReplay,accountStatement} from '../dist/core/fx.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {publishedVatRate,isDerivedVatRate,vatRateOf,VAT_UNTIL} from '../dist/core/vatrates.mjs';
import {parseCsv,parseCell,parseYear} from '../scripts/vatrates.mjs';
import {sheetHTML,periodControls} from '../dist/ui/sheet.mjs';
import {accountsHTML} from '../dist/ui/accounts.mjs';
import {pricesHTML} from '../dist/ui/prices.mjs';
import {taxPageHTML} from '../dist/ui/taxpage.mjs';
import {giftsHTML} from '../dist/ui/gifts.mjs';
import {masterHTML} from '../dist/ui/master.mjs';
import {previewHTML} from '../dist/ui/entry.mjs';
import {securityPages} from '../dist/ui/report.mjs';
import {overviewPdf,securitiesPdf} from '../dist/ui/pdf.mjs';
import {sheetRows,accountRows,eventRows,workbook} from '../dist/ui/xlsx.mjs';

const lib={jsPDF:function(o){return new jsPDF({...o,compress:false});},autoTable};
const THIS_YEAR=Number(today().slice(0,4));
const PARAMS={churchRate:'0.09',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0'};
function base(securities=[],events=[],extra={}){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person Eins'}];
 s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot A',account:'530'},{id:'e',personId:'p',bank:'Bank B',name:'Depot B'}];
 s.securities=securities;s.years={p:{2025:PARAMS}};s.events=events;Object.assign(s,extra);validate(s);
 return s;
}
const FUND=id=>({id,name:`Fonds ${id}`,isin:`LU00000000${id.length}${id.charCodeAt(0)%10}`,kind:'equityFund'});
const opening=(id,securityId,extra)=>({id,type:'opening',date:'2025-01-03',depotId:'d',securityId,quantity:'100',...extra});
const sell=(id,securityId,amount,extra={})=>({id,type:'sell',date:'2025-06-16',depotId:'d',securityId,quantity:'100',amount,...extra});
const line=(s,id)=>saleLine(s,replay(s,{until:'2025-12-31'}).moves.find(m=>m.eventId===id));
const parts=b=>[b.gain,b.free,b.vap,b.exempt,b.taxable,b.rest];

test('Alt-Anteil vor 2009: Der Gewinn zerfällt in Zuwachs bis 2017, Vorabpauschalen, Teilfreistellung und Steuerpflichtiges',()=>{
 // Kosten 5.000, Kurs 31.12.2017: 8.000, Vorabpauschalen 300, Erlös 12.000. Nach 2017: 12.000 − 8.000 − 300 = 3.700;
 // 70 % = 2.590 steuerpflichtig, 1.110 Teilfreistellung; bis 2017 steuerfrei 3.000. Summe 7.000 = 12.000 − 5.000.
 const s=base([FUND('a')],[opening('o','a',{group:'pre2009',cost:'5000',price2017:'80',oldIncome:'0',vapBefore:'300'}),sell('v','a','12000')]);
 const b=line(s,'v');
 assert.deepEqual(parts(b),['7000','3000','300','1110','2590','0']);assert.equal(b.book,'5000');
 // KapESt 2.590 ÷ 4,09 = 633,25; Soli 5,5 % = 34,82 (abgerundet); KiSt 9 % = 56,99.
 assert.deepEqual([b.model.capitalTax,b.model.solidarity,b.model.churchTax,b.taxes.source],['633.25','34.82','56.99','rechnerisch']);
});

test('Fonds 2009 bis 2017: Der Zuwachs bis 2017 ist nicht steuerfrei, er steckt als fiktiver Gewinn im Steuerpflichtigen',()=>{
 // Kosten 4.000, Basis 6.000, fiktiver Gewinn 2.000, Vorabpauschalen 100, Erlös 9.000.
 // Ab 2018: 9.000 − 6.000 − 100 = 2.900, davon 70 % = 2.030. Steuerpflichtig 2.000 + 2.030 = 4.030; Teilfreistellung 870.
 const s=base([FUND('b')],[opening('o','b',{group:'from2009',cost:'4000',price2017:'60',deemed2017:'2000',oldIncome:'0',vapBefore:'100'}),sell('v','b','9000')]);
 assert.deepEqual(parts(line(s,'v')),['5000','0','100','870','4030','0']);
});

test('Altaktie: der ganze Gewinn steuerfrei; Aktie nach 2009: der Unterschied von Durchschnitt und FIFO bleibt sichtbar',()=>{
 const old={id:'s',name:'Altaktie',isin:'DE0000000001',kind:'stock'},neu={id:'n',name:'Neue Aktie',isin:'DE0000000002',kind:'stock'};
 const a=base([old],[opening('o','s',{group:'pre2009',cost:'1000'}),sell('v','s','3000')]);
 assert.deepEqual(parts(line(a,'v')),['2000','2000','0','0','0','0']);
 // Zwei Käufe zu 1.000 und 2.000, Verkauf der Hälfte für 3.000: Buchwert 1.500 im Durchschnitt, FIFO-Kosten 1.000.
 const buy=(id,date,amount)=>({id,type:'buy',date,depotId:'d',securityId:'n',quantity:'10',amount});
 const b=base([neu],[buy('k1','2025-01-10','1000'),buy('k2','2025-02-10','2000'),{...sell('v','n','3000'),quantity:'10'}]);
 assert.deepEqual(parts(line(b,'v')),['1500','0','0','0','2000','-500']);
});

test('Steuern laut Abrechnung haben Vorrang; ohne Kirchensteuersatz bleibt die Rechnung offen; altes Recht ohne Aufteilung',()=>{
 const ev=[opening('o','a',{group:'from2018',cost:'5000',vapBefore:'0'}),sell('v','a','6000',{capitalTax:'100',solidarity:'5.5',churchTax:'9'})];
 const s=base([FUND('a')],ev),b=line(s,'v');
 assert.deepEqual([b.taxes.source,b.taxes.capitalTax,b.taxes.total],['Abrechnung','100','114.5']);assert.ok(b.model,'die Rechnung bleibt zum Vergleich');
 const none=base([FUND('a')],[ev[0],sell('v','a','6000')]);none.years={};
 const c=line(none,'v');assert.deepEqual([c.model,c.taxes],[null,null]);assert.equal(c.taxable,'700');
 // Ein Vorjahr ohne Austritt trägt den Satz weiter; nach einem Austritt gilt 0.
 const prior=base([FUND('a')],[ev[0],sell('v','a','6000')]);prior.years={p:{2024:{...PARAMS}}};assert.equal(line(prior,'v').model.churchTax,'15.4');
 prior.years={p:{2024:{...PARAMS,churchUntil:6}}};assert.equal(line(prior,'v').model.churchTax,'0');
 // Verlust: keine Steuer, Teilfreistellung mit Vorzeichen.
 const loss=base([FUND('a')],[ev[0],sell('v','a','4000')]),d=line(loss,'v');assert.deepEqual([d.taxable,d.exempt,d.model.total],['-700','-300','0']);
 const old=base([FUND('a')],[{id:'k',type:'buy',date:'2015-03-02',depotId:'d',securityId:'a',quantity:'100',amount:'1000'},{...sell('v','a','1500',{}),date:'2016-03-01',quantity:'100'}]);
 const h=saleLine(old,replay(old,{until:'2016-12-31'}).moves.find(m=>m.eventId==='v'));assert.deepEqual([h.historic,h.taxable,h.gain],[true,null,'500']);
});

test('Verkäufe stehen in Vorschau, Blatt, Excel und PDF, auch beim einzelnen Wertpapier',async()=>{
 const s=base([FUND('a')],[opening('o','a',{group:'pre2009',cost:'5000',price2017:'80',oldIncome:'0',vapBefore:'300'}),sell('v','a','12000')]);
 const preview=previewHTML(s,{...s.events[1],id:'v'});
 for(const t of ['Abgang zum Buchwert','darin steuerfreie Wertsteigerung bis 2017','3.000,00 €','darin schon versteuerte Vorabpauschalen','darin Teilfreistellung','1.110,00 €','Kapitalertragsteuer rechnerisch','633,25 €','Solidaritätszuschlag rechnerisch','Kirchensteuer rechnerisch'])assert.ok(preview.includes(t),t);
 const html=sheetHTML(s,{year:2025,personId:'p'});
 assert.match(html,/<h3>Verkäufe 2025<\/h3>/);assert.match(html,/Steuerfrei bis 2017/);assert.match(html,/class="num calc">633,25/);assert.doesNotMatch(html,/Übrige Differenz/);
 const rows=sheetRows(s,'d',{from:2025,to:2025});
 const row=rows.find(r=>r[0]==='Fonds a'&&r[1]==='2025-06-16');assert.deepEqual(row.slice(2,13),[12000,5000,7000,3000,300,1110,2590,633.25,34.82,56.99,'rechnerisch']);
 assert.ok(rows.some(r=>r[0]==='Summe Verkäufe'&&r[8]===2590));
 const book=await workbook(s,2025,ExcelJS,{personId:'p'});const text=[];book.getWorksheet('Depot A').eachRow(r=>text.push(r.getCell(1).text));assert.ok(text.includes('Verkäufe 2025'));
 const pdf=overviewPdf(s,{year:2025,personId:'p'},lib).output();assert.match(pdf,/Verk.ufe 2025/);assert.match(pdf,/633,25/);
 const pages=securitiesPdf(s,{year:2025,personId:'p'},lib).output();assert.match(pages,/Steuerfrei bis 2017/);
});

const ACCOUNT={id:'a1',depotId:'d',name:'USD-Konto',currency:'USD',kind:'payment',vatBook:true};
const fx=(id,kind,date,amount,eur)=>({id,type:'fx',kind,date,depotId:'d',accountId:'a1',amount,...(eur?{eur}:{})});

test('USt-Kurs: Die Buchhaltung rechnet zum Monatskurs, die Steuer weiter zum Tageskurs',()=>{
 // 03/2025: 1,0807 → 1.081 USD = 1.000,28 €. 09/2025: 1,1732 → 1.081 USD = 921,41 €; Verlust 78,87 €.
 // Steuerlich aus den erfassten EUR-Werten: 950 − 1.000 = −50 €.
 const s=base([],[fx('in','exchangeIn','2025-03-10','1081','1000'),fx('out','exchangeOut','2025-09-15','1081','950')],{accounts:[ACCOUNT]});
 const tax=fxReplay(s,{until:'2025-12-31'}).moves.find(m=>m.eventId==='out'),book=fxReplay(s,{until:'2025-12-31',basis:'book'}).moves.find(m=>m.eventId==='out');
 assert.deepEqual([tax.proceeds,tax.gain],['950','-50']);
 assert.deepEqual([book.proceeds,book.cost,book.gain,book.quote.source,book.quote.rate],['921.41','1000.28','-78.87','vat','1.1732']);
 assert.equal(yearReport(s,'p',2025).privateSales.total,'-50');
 const st=accountStatement(s,'a1',2025,2025,{basis:'book'});assert.equal(st.gains,'-78.87');
 const page=accountsHTML(s,{year:2025,personId:'p'});
 assert.match(page,/Buchhaltung zum USt-Umrechnungskurs 2025/);assert.match(page,/Steuerlich zum Tageskurs 2025/);assert.match(page,/USt-Kurs 1,1732 für 09\/2025/);
 const rows=accountRows(s,[ACCOUNT],2025,2025);assert.ok(rows.some(r=>/Buchhaltung zum USt-Umrechnungskurs$/.test(r[0]||'')));assert.ok(rows.some(r=>r[8]===1.1732));
 // Ohne Haken bleibt alles wie bisher: ein Blatt, kein zweiter Lauf.
 const plain=base([],s.events,{accounts:[{...ACCOUNT,vatBook:undefined}]});assert.match(accountsHTML(plain,{year:2025,personId:'p'}),/Kontoblatt USD 2025/);assert.doesNotMatch(accountsHTML(plain,{year:2025,personId:'p'}),/Buchhaltung zum USt/);
 assert.equal(fxReplay(plain,{until:'2025-12-31',basis:'book'}).moves.find(m=>m.eventId==='out').proceeds,'950');
});

test('USt-Kurs: Fehlender Monat bleibt offen und wird zentral nachgetragen; amtliche Monate sind fest',()=>{
 const month=VAT_UNTIL<'2099-01'?'2099-03':'2099-04';
 const s=base([],[fx('in','exchangeIn',`${month}-10`,'1200','1000')],{accounts:[ACCOUNT]});
 const open=fxReplay(s,{until:'2099-12-31',basis:'book'});
 assert.equal(open.moves[0].eur,null);assert.match(open.issues[0].reason,/USt-Umrechnungskurs USD für 03\/2099 fehlt/);
 assert.equal(fxReplay(s,{until:'2099-12-31'}).issues.length,0,'die Steuer braucht den Monatskurs nicht');
 const next=withVatRate(s,'USD',month,'1.2');
 assert.equal(fxReplay(next,{until:'2099-12-31',basis:'book'}).moves[0].eur,'1000');assert.equal(vatRateOf(next,'USD',month),'1.2');
 assert.deepEqual([next.audit.at(-1).action,next.audit.at(-1).ref],['USt-Umrechnungskurs erfasst',`vat:USD:${month}`]);
 assert.equal(s.vatRates,undefined,'der alte Stand bleibt unverändert');
 const gone=withVatRate(next,'USD',month,null);assert.equal(gone.vatRates,undefined);assert.equal(gone.audit.at(-1).action,'USt-Umrechnungskurs gelöscht');
 assert.throws(()=>withVatRate(s,'USD','2026-10','1.3'),/amtlich hinterlegt/);
 assert.throws(()=>withVatRate(s,'USD',month,'0'),/USt-Umrechnungskurs/);assert.throws(()=>withVatRate(s,'usd',month,'1'),/ungültig/);
 const closed=base([],[fx('in','exchangeIn','2099-03-10','1200','1000')],{accounts:[ACCOUNT],closing:{p:2099}});
 assert.throws(()=>withVatRate(closed,'USD','2099-03','1.2'),/abgeschlossen/);
 // Veröffentlichte Monate kommen aus der Tabelle, ein eigener Wert ist kein Ersatz dafür.
 assert.equal(vatRateOf({vatRates:{USD:{'2026-10':'9'}}},'USD','2026-10'),'1.1202');
 const bad=base([],[],{accounts:[ACCOUNT]});bad.vatRates={USD:{'2099-13':'1'}};assert.throws(()=>validate(bad),/Monat/);
 const flag=base([],[],{accounts:[{...ACCOUNT}]});flag.accounts[0].vatBook='ja';assert.throws(()=>validate(flag),/Buchhaltung/);
});

test('USt-Kurs: Übernommene Bestände behalten ihren EUR-Wert; ohne ihn gilt der Monat der Anschaffung',()=>{
 const with_=base([],[fx('o','opening','2025-01-02','1000','900')],{accounts:[ACCOUNT]});
 assert.equal(fxReplay(with_,{until:'2025-12-31',basis:'book'}).moves[0].eur,'900');
 const without={...fx('o','opening','2025-01-02','1036'),acquired:'2024-02-15'};
 const s=base([],[without],{accounts:[ACCOUNT]}),m=fxReplay(s,{until:'2025-12-31',basis:'book'}).moves[0];
 assert.equal(m.quote.date,'2024-02');assert.equal(m.quote.rate,publishedVatRate('USD','2024-02'));
});

test('USt-Kurse: die amtliche Tabelle und ihre Pflege unter „Kurse“',()=>{
 // Stichproben aus dem BMF-Datensatz.
 assert.equal(publishedVatRate('USD','2025-03'),'1.0807');assert.equal(publishedVatRate('USD','2026-10'),'1.1202');assert.equal(publishedVatRate('GBP','2026-10'),'0.84282');assert.equal(publishedVatRate('CHF','2010-01')!=null,true);
 assert.equal(publishedVatRate('USD','2099-01'),null);assert.equal(publishedVatRate('XXX','2025-01'),null);
 assert.deepEqual([isDerivedVatRate('USD','2013-05'),isDerivedVatRate('USD','2015-05'),isDerivedVatRate('GBP','2013-05')],[true,false,false]);
 assert.deepEqual(parseCell('1,5340 AUD'),{rate:'1.5340',currency:'AUD'});assert.deepEqual(parseCell('7,4455DKK'),{rate:'7.4455',currency:'DKK'});assert.deepEqual(parseCell('1.456,78 KRW'),{rate:'1456.78',currency:'KRW'});assert.deepEqual(parseCell('1,5624\nAUD'),{rate:'1.5624',currency:'AUD'});assert.equal(parseCell('*'),null);
 assert.deepEqual(parseCsv('a;"b\nc";d\r\ne'),[['a','b\nc','d'],['e']]);
 assert.deepEqual(parseYear('Land;Währung;J\nUSA;1 Euro;1,1000 USD;;1,2000 USD\nFußnote;;').USD.slice(0,3),['1.1000','','1.2000']);
 const s=base([FUND('a')],[],{accounts:[ACCOUNT]});
 const past=pricesHTML(s,{vatYear:2025});assert.match(past,/Umsatzsteuer-Umrechnungskurse/);assert.match(past,/1,0807/);assert.doesNotMatch(past,/data-vat-rate/);
 const later=pricesHTML(s,{vatYear:2099});assert.equal((later.match(/data-vat-rate /g)||[]).length,12);
 assert.equal(pricesHTML(base([FUND('a')]),{}).includes('Umsatzsteuer-Umrechnungskurse'),false,'ohne Währungskonto keine Tabelle');
 assert.match(pricesHTML(base([],[],{accounts:[ACCOUNT]}),{vatYear:2025}),/1,0807/);
 assert.match(masterHTML(s),/name="bookRate"/);
});

test('Künftige Jahre: buchen, auswählen und ansehen, ohne etwas umzustellen',()=>{
 const y=THIS_YEAR+1,far=THIS_YEAR+6,X={id:'s',name:'Aktie',isin:'DE0000000003',kind:'stock'};
 const s=base([X,FUND('a')],[]);
 assert.equal(lastSelectableYear(s),THIS_YEAR+2);assert.equal(lastBookedYear(s),THIS_YEAR);
 assert.match(periodControls(s,THIS_YEAR,THIS_YEAR),new RegExp(`<option value="${THIS_YEAR+2}"`));
 assert.match(taxPageHTML(s,{personId:'p',year:THIS_YEAR}),new RegExp(`<option value="${THIS_YEAR+2}"`));
 let next=withEvent(s,{id:'k',type:'buy',date:`${y}-02-10`,depotId:'d',securityId:'s',quantity:'10',amount:'1000'});
 next=withEvent(next,{id:'v',type:'sell',date:`${far}-03-10`,depotId:'d',securityId:'s',quantity:'10',amount:'1500',capitalTax:'100',solidarity:'5.5',churchTax:'0'});
 assert.equal(lastSelectableYear(next),far,'ein Jahr mit Buchung ist immer wählbar');
 assert.match(periodControls(next,far,far),new RegExp(`<option value="${far}" selected`));
 const html=sheetHTML(next,{year:far,from:far,personId:'p'});assert.match(html,new RegExp(`Verkäufe ${far}`));assert.match(html,/500,00/);
 assert.match(sheetHTML(next,{year:y,from:y,personId:'p'}),new RegExp(`Stand 31\\.12\\.${y}`));
 assert.match(pricesHTML(next),new RegExp(`<th>${far}<small>`),'Kurse auch für Jahre mit Buchungen');
 assert.doesNotMatch(pricesHTML(s),new RegExp(`<th>${THIS_YEAR+1}<small>`),'keine leeren Jahre auf Vorrat');
 assert.equal(yearReport(next,'p',y).status,'none');
 const report=yearReport(next,'p',far);assert.equal(report.status,'incomplete','die Jahresdaten der Person sind noch zu bestätigen');
 assert.ok(report.reasons.some(x=>/Jahresdaten/.test(x.text)));
});

test('Künftige Schenkungen erscheinen auf der Schenkungsseite',()=>{
 const y=THIS_YEAR+1,X={id:'s',name:'Aktie',isin:'DE0000000003',kind:'stock'};
 const s=base([X],[{id:'k',type:'buy',date:'2025-02-10',depotId:'d',securityId:'s',quantity:'10',amount:'1000'}]);
 s.persons.push({id:'q',name:'Person Zwei'});s.depots.push({id:'z',personId:'q',bank:'Bank C',name:'Depot Z'});s.relations=[{donorId:'p',recipientId:'q',kind:'child'}];
 const next=withEvent(s,{id:'g',type:'transfer',kind:'gift',date:`${y}-05-05`,depotId:'d',toDepotId:'z',securityId:'s',quantity:'5',price:'120'});
 assert.match(giftsHTML(next),new RegExp(`05\\.05\\.${y}`));
});

test('Filter je Depot: Seite, beide PDFs, Excel und Vorgänge',async()=>{
 const X={id:'s',name:'Aktie',isin:'DE0000000003',kind:'stock'};
 const buy=(id,depotId)=>({id,type:'buy',date:'2025-02-10',depotId,securityId:'s',quantity:'10',amount:'1000'});
 const s=base([X],[buy('k1','d'),buy('k2','e')]);
 const all=sheetHTML(s,{year:2025,personId:'p'}),one=sheetHTML(s,{year:2025,personId:'p',depotId:'e'});
 assert.match(all,/id="depot-filter"/);assert.match(all,/<h2>Depot A/);assert.match(all,/<h2>Depot B/);
 assert.doesNotMatch(one,/<h2>Depot A/);assert.match(one,/<h2>Depot B/);assert.match(one,/Person Eins · Depot B · Jahresübersicht 2025/);assert.match(one,/<option value="e" selected>/);
 assert.deepEqual(securityPages(s,{year:2025,personId:'p',depotId:'e'}).map(p=>p.depot.id),['e']);
 assert.deepEqual([overviewPdf(s,{year:2025,personId:'p',depotId:'e'},lib).getNumberOfPages(),overviewPdf(s,{year:2025,personId:'p'},lib).getNumberOfPages()],[1,2]);
 const pdf=overviewPdf(s,{year:2025,personId:'p',depotId:'e'},lib).output();assert.match(pdf,/Depot B/);assert.doesNotMatch(pdf,/Depot A/);
 assert.deepEqual(eventRows(s,{from:2025,to:2025,depotId:'e'}).slice(1).map(r=>r[2]),['Depot B']);
 const book=await workbook(s,2025,ExcelJS,{personId:'p',depotId:'e'});const names=book.worksheets.map(w=>w.name);assert.ok(names.includes('Depot B'));assert.ok(!names.includes('Depot A'));
 // Bei nur einem Depot gibt es nichts zu filtern.
 const single=base([X],[buy('k1','d')]);single.depots=[single.depots[0]];assert.doesNotMatch(sheetHTML(single,{year:2025,personId:'p'}),/id="depot-filter"/);
 // Rechenweg: je Depot dieselben Verkäufe wie im Gesamtbild.
 assert.equal(periodStatement(s,'e',2025,2025,'economic').sales.length,0);
});
