import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {emptyState,validate} from '../dist/core/model.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {demoState} from '../dist/core/sample.mjs';
import {workbook} from '../dist/ui/xlsx.mjs';
import {evaluator} from './formula.mjs';

// Fiktive Person mit allem, was der Rechenweg zeigen muss: Altaktie vor 2009, zwei Käufe nach FIFO,
// Fonds aus 2009 bis 2017 mit Verlust ab 2018 (BFH), Kauf im Jahr mit gezwölftelter
// Vorabpauschale, bestandsgeschützter Alt-Anteil mit Freibetrag, Bankwert der Vorabpauschale,
// Dividende mit Quellensteuer und Kirchensteuer nur bis Juni.
function family(){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person Eins'}];
 s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot A'}];
 s.securities=[{id:'st',isin:'DE0000000011',name:'Fiktive Aktie',kind:'stock'},{id:'ef',isin:'DE0000000012',name:'Fiktiver Aktienfonds',kind:'equityFund'},{id:'mf',isin:'DE0000000013',name:'Fiktiver Mischfonds',kind:'mixedFund'}];
 const vap=(id,sec,year,amount)=>({id,type:'vap',date:{2018:'2019-01-02',2019:'2020-01-02',2020:'2021-01-04',2023:'2024-01-02',2024:'2025-01-02'}[year],year,depotId:'d',securityId:sec,amount});
 s.events=[
  {id:'o1',type:'opening',date:'2018-01-01',depotId:'d',securityId:'st',quantity:'50',cost:'1000',group:'pre2009',acquired:'2005-05-05'},
  {id:'o2',type:'opening',date:'2018-01-01',depotId:'d',securityId:'ef',quantity:'200',cost:'16000',group:'from2009',acquired:'2012-03-01',price2017:'90',deemed2017:'1500',oldIncome:'0',vapBefore:'0'},
  {id:'o3',type:'opening',date:'2018-01-01',depotId:'d',securityId:'mf',quantity:'100',cost:'3000',group:'pre2009',price2017:'50',oldIncome:'0',vapBefore:'0'},
  {id:'b1',type:'buy',date:'2019-03-01',depotId:'d',securityId:'st',quantity:'100',amount:'4000'},
  {id:'b2',type:'buy',date:'2020-06-15',depotId:'d',securityId:'st',quantity:'100',amount:'6000'},
  vap('v1','ef',2018,'40'),vap('v2','ef',2019,'30'),vap('v3','ef',2020,'5'),vap('v4','ef',2023,'120'),
  vap('w1','mf',2018,'12'),vap('w2','mf',2019,'9'),vap('w3','mf',2020,'1.5'),vap('w4','mf',2023,'36'),vap('w5','mf',2024,'33.33'),
  {id:'b3',type:'buy',date:'2024-05-20',depotId:'d',securityId:'ef',quantity:'100',amount:'10000'},
  {id:'s1',type:'sell',date:'2025-04-10',depotId:'d',securityId:'st',quantity:'220',amount:'13200',gainBank:'7400'},
  {id:'dv',type:'distribution',date:'2025-05-05',depotId:'d',securityId:'st',amount:'300',foreignTax:'45'},
  {id:'s2',type:'sell',date:'2025-08-01',depotId:'d',securityId:'ef',quantity:'250',amount:'22000'},
  {id:'s3',type:'sell',date:'2025-09-01',depotId:'d',securityId:'mf',quantity:'40',amount:'2800'}];
 s.prices=[{securityId:'ef',date:'2024-01-02',price:'95'},{securityId:'ef',date:'2024-12-30',price:'100'}];
 s.years={p:{2025:{churchRate:'0.09',churchUntil:6,externalAllowance:'200',stockLossCarry:'500',otherLossCarry:'0',protectedRemaining:'100000'}}};
 validate(s);return s;
}
const rows=ws=>{const out=[];ws.eachRow(r=>out.push({n:r.number,cells:r.values.slice(1)}));return out;};
// Zeile nach Beschriftung: zuerst genau, sonst nach dem Anfang.
const find=(ws,text)=>rows(ws).find(r=>r.cells[0]===text)||rows(ws).find(r=>typeof r.cells[0]==='string'&&r.cells[0].startsWith(text));
const val=c=>c&&typeof c==='object'&&'formula' in c?c.result??0:c;
const near=(a,b,eps=0.006)=>assert.ok(Math.abs(Number(a)-Number(b))<=eps,`${a} ≠ ${b}`);

test('the workings sheet rebuilds every sale lot by lot in FIFO order and the year in formulas',async()=>{
 const s=family(),r=yearReport(s,'p',2025);
 assert.equal(r.status,'supported',JSON.stringify(r.reasons));
 const book=await workbook(s,2025,ExcelJS,{personId:'p'}),names=book.worksheets.map(w=>w.name);
 assert.ok(names.indexOf('Rechenweg 2025 Person Eins')===names.indexOf('Steuer 2025 Person Eins')+1,'Rechenweg direkt nach dem Steuerblatt');
 assert.equal(book.calcProperties.fullCalcOnLoad,true,'Excel rechnet beim Öffnen neu');
 const ws=book.getWorksheet('Rechenweg 2025 Person Eins');
 // Jede Formel ergibt nachgerechnet das Ergebnis von Depotklar – auf den Cent.
 const all=evaluator(ws).formulas();
 assert.ok(all.length>60,`${all.length} Formeln`);
 for(const f of all)near(f.own,f.result??0);

 // Aktie: 50 Alt-Stücke vor 2009 zuerst (steuerfrei), dann 100 aus 2019, dann 70 von 100 aus 2020.
 const list=rows(ws),start=list.findIndex(x=>x.cells[0]==='Los in FIFO-Reihenfolge'),lots=list.slice(start+1,start+4);
 assert.deepEqual(lots.map(x=>x.cells[0]),['1 · Bestand übernommen · Erwerb 05.05.2005','2 · Kauf · Erwerb 01.03.2019','3 · Kauf · Erwerb 15.06.2020']);
 assert.deepEqual(lots.map(x=>[val(x.cells[1]),val(x.cells[2])]),[[50,50],[100,100],[100,70]]);
 // Erlös 60 € je Stück: 3.000, 6.000, 4.200. Gewinn: Altaktie 0, dann 6.000 − 4.000, 4.200 − 4.200.
 assert.deepEqual(lots.map(x=>Math.round(val(x.cells[3])*100)/100),[3000,6000,4200]);
 assert.deepEqual(lots.map(x=>Math.round(val(x.cells[7])*100)/100),[0,2000,0]);
 assert.match(lots[0].cells[12],/Aktie vor 2009/);
 assert.equal(lots[1].cells[3].formula,`$B$${find(ws,'Erlös laut Abrechnung').n}*C${lots[1].n}/$B$${find(ws,'Verkaufte Stück').n}`);
 // Abgleich mit der Bank: 7.400 laut Abrechnung gegen 2.000 laut Depotklar.
 near(val(find(ws,'Abweichung Bank').cells[1]),5400);

 // Fonds 2009 bis 2017: Verlust ab 2018 gegen die Basis 31.12.2017; der Teil aus Kurs 2017 über den
 // Anschaffungskosten (18.000 − 16.000) bleibt ohne Teilfreistellung (BFH vom 25.11.2025).
 const fund=list.filter(x=>typeof x.cells[0]==='string'&&/Erwerb 01.03.2012/.test(x.cells[0]))[0];
 assert.equal(val(fund.cells[5]),18000);assert.ok(val(fund.cells[7])<0);near(val(fund.cells[9]),Math.min(-val(fund.cells[7]),2000));
 assert.equal(fund.cells[9].formula,`IF(H${fund.n}<0,MIN(-H${fund.n},MAX(0,F${fund.n}-E${fund.n})),0)`);
 assert.equal(val(fund.cells[8]),1500,'fiktiver Gewinn 2017 laut Bank');

 // Vorabpauschale 2024: erster Kurs 95, letzter 100, Basiszins 2,29 %; Kauf im Mai zählt 8 von 12 Monaten.
 const may=list.find(x=>x.cells[0]==='Kauf · Erwerb 20.05.2024');assert.equal(val(may.cells[2]),8);
 near(val(find(ws,'Basisertrag je Anteil').cells[1]),95*0.7*0.0229,1e-9);
 // Bankwert 33,33 € des Mischfonds: einziges Los, Anteil = Bankwert.
 near(val(find(ws,'Vorabpauschale laut Bank').cells[1]),33.33);

 // Jahresrechnung: dieselben Werte wie die Steuerseite.
 for(const [label,key] of [['Bemessungsgrundlage','taxable'],['Kapitalertragsteuer','capitalTax'],['Solidaritätszuschlag','solidarity'],['Kirchensteuer','churchTax'],['Steuer laut Modell','total'],['Sparer-Pauschbetrag','allowanceUsed']])near(val(find(ws,label).cells[1]),r[key]);
 assert.equal(find(ws,'Kirchensteuersatz für das Jahr').cells[1].formula,`B${find(ws,'Kirchensteuersatz').n}*B${find(ws,'Monate mit Kirchensteuerpflicht').n}/12`);
 near(val(find(ws,'Kirchensteuersatz für das Jahr').cells[1]),0.045,1e-12);
 near(val(find(ws,'Angerechnet').cells[1]),r.foreignTax.credited);
 near(val(find(ws,'Rest-Freibetrag Alt-Anteile').cells[1]),r.carry.protectedRemaining);
 assert.ok(Number(r.protectedUsed)>0,'Alt-Anteil nutzt den Freibetrag');

 // Nach dem Speichern als Datei bleiben Formeln und Ergebnisse (auch 0) erhalten.
 const again=new ExcelJS.Workbook();await again.xlsx.load(await book.xlsx.writeBuffer());
 const loaded=evaluator(again.getWorksheet('Rechenweg 2025 Person Eins')).formulas();
 assert.equal(loaded.length,all.length);for(const f of loaded)near(f.own,f.result??0);
});

test('the workings sheet matches Depotklar for every person and year of the demo',async()=>{
 const s=demoState();let sheets=0;
 for(let year=2018;year<=2026;year++){
  const book=await workbook(s,year,ExcelJS,{});
  for(const ws of book.worksheets.filter(w=>w.name.startsWith('Rechenweg'))){
   sheets++;const person=s.persons.find(p=>ws.name.endsWith(p.name)),r=yearReport(s,person.id,year);
   for(const f of evaluator(ws).formulas())near(f.own,f.result??0);
   if(r.status==='supported')near(val(find(ws,'Steuer laut Modell').cells[1]),r.total);
  }
 }
 assert.ok(sheets>=5,`${sheets} Blätter`);
});

test('a person without income in the year gets no workings sheet',async()=>{
 // 2022: negativer Basiszins für 2021, keine Verkäufe, keine Ausschüttungen.
 const book=await workbook(family(),2022,ExcelJS,{personId:'p'});
 assert.ok(!book.worksheets.some(w=>w.name.startsWith('Rechenweg')));
});
