import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate,firstWorkday} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {statement} from '../dist/core/statement.mjs';
import {sheetHTML} from '../dist/ui/sheet.mjs';
import {entryFormHTML,draftToEvent,newDraft} from '../dist/ui/entry.mjs';

// Fiktiver thesaurierender Aktienfonds, gekauft 2013, Geschäftsjahr bis 31.05., Rumpfgeschäftsjahr 2017.
const THESAURIERUNGEN=[['a13','2013-05-31','12630.41'],['a14','2014-05-31','13119.32'],['a15','2015-05-29','15460.10'],['a16','2016-05-31','16505.67'],['a17','2017-05-31','15296.76'],['a18','2017-12-31','12780.76'],['a19','2017-12-31','2784.95']];
function fund({accumulations=true,deemed='263209.03'}={}){
 const s=emptyState();
 s.persons=[{id:'p1',name:'Person Eins'},{id:'p2',name:'Person Zwei'}];
 s.depots=[{id:'d1',personId:'p1',bank:'Hausbank',name:'Fondsdepot'},{id:'d2',personId:'p2',bank:'Hausbank',name:'Zweitdepot'}];
 s.securities=[{id:'f',isin:'DE000TEST0001',name:'Fiktiver Thesaurierer',kind:'equityFund'},{id:'st',isin:'DE000TEST0002',name:'Fiktive AG',kind:'stock'}];
 // Gleichbleibender Kurs ab 2018: keine Vorabpauschale, der Vergleich bleibt übersichtlich.
 for(let y=2017;y<=2024;y++)s.prices.push({securityId:'f',date:`${y}-12-29`,price:'145.47'},{securityId:'f',date:firstWorkday(y+1),price:'145.47'});
 s.events.push({id:'b1',type:'buy',date:'2013-01-31',depotId:'d1',securityId:'f',quantity:'7900',amount:'797426'});
 if(accumulations)for(const [id,date,amount] of THESAURIERUNGEN)s.events.push({id,type:'accumulation',date,depotId:'d1',securityId:'f',amount});
 s.events.push({id:'t1',type:'transition',date:'2017-12-31',depotId:'d1',securityId:'f',price2017:'145.47',deemed2017:deemed,oldIncome:'0'});
 return s;
}

test('old-law accumulations raise book value and tax basis until 2017 and let the bank deemed gain be checked',()=>{
 const s=fund();validate(s);
 const eco=statement(s,'d1',2017,'economic'),tax=statement(s,'d1',2017,'tax');
 // Wie die Buchhaltung: Anfang 2017 Kaufpreis plus Thesaurierungen 2013–2016, Ende 2017 alle.
 assert.equal(eco.opening,'855141.5');assert.equal(eco.closing,'886003.97');
 assert.equal(tax.opening,'855141.5');assert.equal(tax.closing,'1149213');
 const lines=tax.rows.flatMap(r=>r.lines);
 assert.deepEqual(lines.filter(l=>l.type==='accumulation').map(l=>l.value),['15296.76','12780.76','2784.95']);
 // Die fiktive Veräußerung hebt die Basis genau um den fiktiven Gewinn; Bank und Rechnung stimmen überein.
 const t=lines.find(l=>l.type==='transition');assert.equal(t.value,'263209.03');assert.match(t.note,/263\.209,03 € laut Bank, rechnerisch ebenso/);
 // Wie die Vorabpauschale nur in den Blättern, nicht noch einmal unter den Erträgen.
 assert.deepEqual(tax.income,[]);
 const html=sheetHTML(s,{year:2017,from:2017,personId:'p1',view:'both'});
 assert.match(html,/Ausschüttungsgleiche Erträge nach altem Recht, versteuert/);assert.doesNotMatch(html,/<h3>Erträge 2017<\/h3>/);
 // Verkauf 2024: wirtschaftlich gegen den Buchwert mit Thesaurierungen; steuerlich unverändert.
 s.events.push({id:'s1',type:'sell',date:'2024-06-28',depotId:'d1',securityId:'f',quantity:'7900',amount:'1264000'});
 const sale=replay(s).moves.find(m=>m.type==='sell');
 assert.equal(sale.gainEconomic,'377996.03');assert.equal(sale.sale.details[0].economicGain,'377996.03');
 assert.equal(sale.sale.deemedGain,'263209.03');assert.equal(sale.sale.taxable,'343559.93');
});

test('without recorded accumulations the deviation from the bank value is shown',()=>{
 const s=fund({accumulations:false});
 const t=statement(s,'d1',2017,'tax').rows.flatMap(r=>r.lines).find(l=>l.type==='transition');
 assert.equal(t.value,'351787');assert.match(t.note,/rechnerisch 351\.787,00 € \(Abweichung -88\.577,97 €\)/);
 assert.equal(statement(s,'d1',2017,'economic').closing,'797426');
});

test('accumulations follow lots through a gift and a partial sale before 2018',()=>{
 const s=fund({accumulations:false});
 s.events.splice(1,0,
  {id:'a1',type:'accumulation',date:'2014-05-31',depotId:'d1',securityId:'f',amount:'7900'},
  {id:'g1',type:'transfer',kind:'gift',date:'2015-03-02',depotId:'d1',toDepotId:'d2',securityId:'f',quantity:'1975'},
  {id:'a2',type:'accumulation',date:'2015-05-29',depotId:'d1',securityId:'f',amount:'-592.5'},
  {id:'s0',type:'sell',date:'2016-03-01',depotId:'d1',securityId:'f',quantity:'925',amount:'111000'});
 validate(s);
 const r=replay(s,{until:'2015-12-31'});
 // Ein Viertel der Stücke geht mit einem Viertel von Kaufpreis und Thesaurierung an Person Zwei.
 const gift=r.moves.find(m=>m.type==='transfer'&&m.direction==='in');assert.equal(gift.economic,'201331.5');assert.equal(gift.tax,'201331.5');
 // Die negative Korrektur trifft nur die verbliebenen Stücke.
 assert.equal(statement(s,'d1',2015,'economic').closing,'603402');
 assert.equal(statement(s,'d2',2015,'tax').closing,'201331.5');
 // Teilverkauf 2016 (altes Recht): 101,84 € je Stück einschließlich Thesaurierungen gehen ab.
 const sold=replay(s,{until:'2016-12-31'}).moves.find(m=>m.eventId==='s0');
 assert.deepEqual([sold.economic,sold.gainEconomic,sold.gainTax,sold.taxGainSource],['-94202','16798','16798','simplified']);
 assert.equal(statement(s,'d1',2016,'economic').closing,'509200');
});

test('accumulation is only for funds, only until 2017 and needs a holding',()=>{
 const s=fund();
 const bad=(e,msg)=>assert.throws(()=>validate({...s,events:[...s.events,{id:'x',depotId:'d1',securityId:'f',type:'accumulation',...e}]}),msg);
 bad({date:'2018-05-31',amount:'100'},/nur bis 31\.12\.2017/);
 bad({date:'2016-05-31',amount:'0'},/Betrag fehlt/);
 bad({date:'2016-05-31',amount:'100',securityId:'st'},/nur für Fonds/);
 assert.throws(()=>replay({...s,events:[...s.events,{id:'x',type:'accumulation',date:'2012-05-31',depotId:'d1',securityId:'f',amount:'100'}]}),/ohne Bestand/);
});

test('the entry form offers accumulation with amount and optional tax',()=>{
 const s=fund({accumulations:false}),d={...newDraft('accumulation','d1',s),securityId:'f',amount:'12.630,41',capitalTax:'3.157,60',solidarity:'173,66'};
 assert.equal(d.date,'2017-12-31');
 const html=entryFormHTML(s,d);assert.match(html,/Ausschüttungsgleiche Erträge der Position EUR/);assert.match(html,/Anschaffungswert und steuerliche Basis steigen um/);
 const {event}=draftToEvent(s,d);assert.deepEqual([event.type,event.amount,event.capitalTax,event.solidarity,event.churchTax],['accumulation','12630.41','3157.6','173.66','0']);
 // Der Steuerabzug steht als Hinweis an der Zeile im Blatt.
 const shown={...s,events:[...s.events.slice(0,1),{...event,id:'a1',date:'2013-05-31'},...s.events.slice(1)]};
 assert.match(sheetHTML(shown,{year:2013,from:2013,personId:'p1',view:'both'}),/versteuert · Steuerabzug 3\.331,26 €/);
 // Der Übergang nennt die abgezogenen Thesaurierungen.
 const t=entryFormHTML(fund(),{...newDraft('transition','d1',fund()),securityId:'f',price2017:'145,47'});
 assert.match(t,/263\.209,03 € \(Kurs × Stück − Anschaffungskosten − 88\.577,97 € erfasste Thesaurierungen\)/);
});
