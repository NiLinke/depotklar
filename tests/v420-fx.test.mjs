import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {emptyState,validate} from '../dist/core/model.mjs';
import {fxReplay,accountStatement,accountLots,accountInterest} from '../dist/core/fx.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {giftAssessments} from '../dist/core/gifttax.mjs';
import {accountsHTML} from '../dist/ui/accounts.mjs';
import {giftsHTML} from '../dist/ui/gifts.mjs';
import {accountRows,accountsWorkbook,giftRows} from '../dist/ui/xlsx.mjs';
import {draftToEvent,newDraft,fxFormHTML} from '../dist/ui/entry.mjs';

const A={id:'a',personId:'p',bank:'Bank A',name:'USD Zahlung',currency:'USD',kind:'payment'};
const B={id:'b',personId:'p',bank:'Bank B',name:'USD Zweitkonto',currency:'USD',kind:'payment'};
const I={id:'i',personId:'p',bank:'Bank C',name:'USD Tagesgeld',currency:'USD',kind:'interest'};
const K={id:'k',personId:'q',bank:'Bank A',name:'USD Kind',currency:'USD',kind:'payment'};
function base(events=[]){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person Eins'},{id:'q',name:'Kind Eins'}];s.relations=[{donorId:'p',recipientId:'q',kind:'child'}];
 s.accounts=[A,B,I,K].map(x=>({...x}));s.events=events;validate(s);return s;
}
const IN={id:'e1',type:'fx',kind:'exchangeIn',date:'2025-01-10',accountId:'a',amount:'1000',eur:'900'};
const ZINS={id:'z1',type:'interest',date:'2025-03-31',amount:'5.5',capitalTax:'1',solidarity:'0.05',churchTax:'0.09',fx:{accountId:'a',amount:'4.4',rate:'1.1'}};
const OUT={id:'o1',type:'fx',kind:'exchangeOut',date:'2026-02-01',accountId:'a',amount:'300',eur:'270'};

test('Matrix: jedes Los mit Zugang, Verbrauch je Jahr und Rest; die Summe trifft das Konto',()=>{
 const s=base([IN,ZINS,OUT]),m=accountLots(s,'a',2026,2026),[first,second]=m.rows;
 assert.equal(m.rows.length,2);assert.equal(m.openCount,2);assert.deepEqual(m.years,[2026]);
 // 1.000 USD für 900 €, 300 USD im Februar 2026 verbraucht: 300 × 900 ÷ 1.000 = 270 €; Rest 700 USD und 630 €.
 assert.equal(first.amount,'1000');assert.equal(first.cost,'900');assert.equal(first.perYear[2026],'300');assert.equal(first.rest,'700');assert.equal(first.restCost,'630');
 assert.equal(first.freeFrom,'2026-01-11','Tag nach dem Jahrestag');assert.equal(first.origin,'Umtausch aus EUR');assert.equal(first.rate,'1.1111');
 // Die Zinsgutschrift ist ein eigenes Los (BMF vom 14.05.2025, Rn. 131): 4,40 USD ÷ 1,10 = 4 €.
 assert.equal(second.origin,'Zinsen');assert.equal(second.cost,'4');assert.equal(second.rest,'4.4');assert.equal(second.income,true);
 const st=accountStatement(s,'a',2026,2026);
 assert.equal(m.totals.rest,st.closing.balance);assert.equal(m.totals.restCost,st.closing.bookValue);
 assert.equal(first.uses[0].label,'Umtausch in EUR');assert.equal(first.uses[0].gain,'0');assert.equal(first.uses[0].within,false,'mehr als ein Jahr nach der Anschaffung');
});

test('Matrix: Vor dem Zeitraum aufgebrauchte Lose werden nur gezählt, frühere Abgänge stehen in einer Spalte',()=>{
 const s=base([{...IN,amount:'100',eur:'90'},{...IN,id:'e2',date:'2025-02-10',amount:'200',eur:'180'},{...OUT,date:'2025-06-01',amount:'150',eur:'135'},{...OUT,id:'o2',date:'2026-06-01',amount:'50',eur:'45'}]);
 const m=accountLots(s,'a',2026,2026);
 assert.equal(m.hidden,1);assert.equal(m.rows.length,1);
 assert.equal(m.rows[0].earlier,'50');assert.equal(m.rows[0].perYear[2026],'50');assert.equal(m.rows[0].rest,'100');
 assert.equal(accountLots(s,'a',2025,2026).hidden,0,'über beide Jahre gezeigt');
});

test('Viele Lose: je Anschaffungsjahr eine Zeile, die Lose darunter auf Klick',()=>{
 const events=[];for(let i=0;i<30;i++){const y=2024+Math.floor(i/12),m=String(i%12+1).padStart(2,'0');events.push({id:`z${i}`,type:'interest',date:`${y}-${m}-15`,amount:'2',fx:{accountId:'a',amount:'2',rate:'1'}});}
 const s=base(events),html=accountsHTML(s,{year:2026,from:2024,personId:'p'});
 assert.match(html,/class="block lots"/);assert.doesNotMatch(html,/class="block lots"[^>]* open>/,'ab 13 Losen geschlossen');
 assert.match(html,/data-action="lots-year"/);assert.match(html,/<td>2024<\/td><td>12 Lose, 12 offen<\/td>/);assert.match(html,/<tbody data-parent="2024" hidden>/);assert.match(html,/30 offen von 30/);
 assert.match(accountsHTML(base([IN]),{year:2025,personId:'p'}),/class="block lots"[^>]* open>/);
});

test('Schenkung: Lose gehen mit Anschaffungstag und EUR-Wert über, ohne Veräußerung',()=>{
 const gift={id:'g',type:'fx',kind:'gift',date:'2026-06-01',accountId:'a',toAccountId:'k',amount:'500',eur:'450'};
 const sell={id:'v',type:'fx',kind:'exchangeOut',date:'2026-08-01',accountId:'k',amount:'500',eur:'480'};
 const s=base([IN,gift,sell]),r=fxReplay(s,{until:'2026-12-31'}),out=r.moves.find(m=>m.eventId==='g'&&m.direction==='out');
 assert.equal(out.realized,false);assert.equal(out.gain,null);assert.equal(out.label,'Schenkung an Kind Eins');assert.equal(out.eur,'450');
 assert.equal(r.moves.find(m=>m.eventId==='g'&&m.direction==='in').label,'Schenkung von Person Eins');
 // Beim Kind: 500 USD, angeschafft 10.01.2025 für 450 €, verkauft 01.08.2026 für 480 €. Außerhalb der Jahresfrist.
 const sale=r.moves.find(m=>m.eventId==='v');assert.equal(sale.gain,'30');assert.equal(sale.taxable,'0');assert.equal(sale.parts[0].acquired,'2025-01-10');assert.equal(sale.parts[0].within,false);
 const lot=accountLots(s,'k',2026,2026).rows[0];assert.equal(lot.acquired,'2025-01-10');assert.equal(lot.origin,'Umtausch aus EUR');assert.equal(lot.via,'Schenkung von Person Eins');assert.equal(lot.rest,'0');
 const left=accountLots(s,'a',2026,2026).rows[0];assert.equal(left.perYear[2026],'500');assert.equal(left.rest,'500');assert.equal(left.restCost,'450');
 // Schenkungsteuer: Wert 450 €, innerhalb des Freibetrags.
 const moves=[...replay(s,{until:'2026-12-31'}).moves,...r.moves],a=giftAssessments(s,moves,'p','q').acquisitions[0];
 assert.equal(a.value,'450');assert.equal(a.status,'supported');assert.equal(a.tax,'0');assert.equal(a.parts[0].source,'fx');
 assert.match(giftsHTML(s),/USD Zahlung · 500 USD/);assert.ok(giftRows(s).some(row=>String(row[4]).includes('USD Zahlung · 500 USD')));
 const inherit=base([IN,{...gift,kind:'inheritance',eur:undefined}]);delete inherit.events[1].eur;validate(inherit);
 const via=fxReplay(inherit,{until:'2026-12-31'});assert.equal(via.moves.find(m=>m.direction==='out'&&m.eventId==='g').realized,false);assert.equal(via.issues.length,0,'eine Erbschaft braucht keinen Wert');
});

test('Überträge: eigene Konten behalten die Lose, Personen werden geprüft, verzinste Konten realisieren',()=>{
 const own={id:'t',type:'fx',kind:'transfer',date:'2026-05-01',accountId:'a',toAccountId:'b',amount:'400'};
 const s=base([IN,own]),lot=accountLots(s,'b',2026,2026).rows[0];
 assert.equal(lot.acquired,'2025-01-10');assert.equal(lot.cost,'360');assert.equal(lot.via,'Übertrag aus USD Zahlung');
 assert.throws(()=>base([IN,{...own,toAccountId:'k'}]),/Übertrag nur auf ein eigenes Konto/);
 assert.throws(()=>base([IN,{...own,kind:'gift',toAccountId:'b'}]),/nur an eine andere Person/);
 // Umbuchung auf ein verzinstes Konto ist Veräußerung und neue Anschaffung (BMF vom 14.05.2025, Rn. 131): neues Los am Tag der Umbuchung.
 const real=base([IN,{...own,toAccountId:'i',eur:'380'}]),fresh=accountLots(real,'i',2026,2026).rows[0];
 assert.equal(fresh.acquired,'2026-05-01');assert.equal(fresh.cost,'380');assert.equal(fresh.origin,'Übertrag aus USD Zahlung');
 const out=fxReplay(real,{until:'2026-12-31'}).moves.find(m=>m.eventId==='t'&&m.direction==='out');assert.equal(out.realized,true);assert.equal(out.gain,'20');
 // Eine Schenkung von einem verzinsten Konto ist trotzdem keine Veräußerung.
 const fromI=base([{...IN,accountId:'i'},{id:'g',type:'fx',kind:'gift',date:'2026-06-01',accountId:'i',toAccountId:'k',amount:'100',eur:'95'}]);
 assert.equal(fxReplay(fromI,{until:'2026-12-31'}).moves.find(m=>m.eventId==='g'&&m.direction==='out').realized,false);
});

test('Zinsen: Steuern optional; ohne Bruttobetrag gilt Gutschrift ÷ Kurs plus Steuer',()=>{
 const s=base([IN]),d={...newDraft('interest','',s),date:'2026-03-12',fxAccount:'a',fxAmount:'75,90',fxRate:'1,10',capitalTax:'8,25',solidarity:'0,45',churchTax:'0,74'};
 // 75,90 USD ÷ 1,10 = 69,00 €; 69,00 + 8,25 + 0,45 + 0,74 = 78,44 € brutto.
 assert.equal(draftToEvent(s,d).event.amount,'78.44');
 assert.equal(draftToEvent(s,{...d,amount:'80'}).event.amount,'80','ein eingetragener Betrag geht vor');
 assert.equal(draftToEvent(s,{...d,capitalTax:'',solidarity:'',churchTax:''}).event.amount,'69','ohne Steuer');
 assert.throws(()=>draftToEvent(s,{...d,fxAccount:'',amount:''}),/Bruttobetrag fehlt/);
 const r=accountInterest(base([IN,ZINS]),'a',2025,2025);
 assert.equal(r.lines[0].capitalTax,'1');assert.equal(r.lines[0].eur,'4');assert.equal(r.totals.gross,'5.5');assert.equal(r.totals.churchTax,'0.09');
 const html=accountsHTML(base([IN,ZINS]),{year:2025,personId:'p'});assert.match(html,/Zinsen 2025/);assert.match(html,/KapESt/);
 assert.equal(accountInterest(base([{...ZINS,capitalTax:undefined,solidarity:undefined,churchTax:undefined}].map(e=>{const x={...e};delete x.capitalTax;delete x.solidarity;delete x.churchTax;return x;}).concat([])),'a',2025,2025).totals.capitalTax,null,'nichts erfasst bleibt leer');
});

test('Formular: Schenkung nennt nur Konten anderer Personen derselben Währung',()=>{
 const s=base([IN]),html=fxFormHTML(s,{...newDraft('fx','',s),accountId:'a',kind:'gift',date:'2026-06-01'});
 const target=h=>h.slice(h.indexOf('name="toAccountId"'),h.indexOf('</select>',h.indexOf('name="toAccountId"')));
 assert.match(target(html),/value="k"/);assert.doesNotMatch(target(html),/value="b"/);assert.match(html,/§ 23 Abs\. 1 S\. 3/);assert.match(html,/Wert am Tag der Schenkung/);
 const own=fxFormHTML(s,{...newDraft('fx','',s),accountId:'a',kind:'transfer',date:'2026-06-01'});assert.match(target(own),/value="b"/);assert.doesNotMatch(target(own),/value="k"/);
 const e=draftToEvent(s,{...newDraft('fx','',s),accountId:'a',kind:'gift',date:'2026-06-01',amount:'100',eur:'90',toAccountId:'k'}).event;assert.equal(e.toAccountId,'k');
 assert.throws(()=>draftToEvent(s,{...newDraft('fx','',s),accountId:'a',kind:'gift',date:'2026-06-01',amount:'100',eur:'90'}),/Zielkonto/);
});

test('Export: Zeilen für PDF und Depotblatt, eigene Mappe mit Formeln',async()=>{
 const s=base([IN,ZINS,OUT]);
 const rows=accountRows(s,[s.accounts[0]],2026,2026,{details:true}),text=rows.map(r=>String(r[0]));
 assert.ok(text.some(t=>/USD Zahlung · Lose 2026/.test(t)));assert.ok(text.includes('Summe Lose'));assert.ok(text.some(t=>/Verbrauch je Abgang 2026/.test(t)));
 assert.ok(accountRows(s,[s.accounts[0]],2025,2025).some(r=>/Zinsen 2025/.test(String(r[0]))));
 assert.ok(!accountRows(s,[s.accounts[0]],2026,2026).some(r=>/Verbrauch je Abgang/.test(String(r[0]))),'nur auf Wunsch');
 const book=await accountsWorkbook(s,2026,ExcelJS,{personId:'p'}),names=book.worksheets.map(w=>w.name);
 assert.ok(names.includes('USD Zahlung'));assert.ok(names.includes('Lose USD Zahlung'));
 const ws=book.getWorksheet('Lose USD Zahlung');let formula=null,total=null;
 ws.eachRow(r=>{if(r.getCell(2).value instanceof Date&&!formula)formula=r.getCell(7).value;if(r.getCell(1).value==='Summe Lose')total=r.getCell(7).value;});
 assert.equal(formula.formula.replace(/\d+/g,'#'),'C#-SUM(F#:F#)');assert.equal(formula.result,700);
 assert.match(total.formula,/^SUM\(G\d+:G\d+\)$/);assert.equal(total.result,704.4);
 assert.ok(ws.autoFilter);assert.equal(ws.views[0].state,'frozen');
});
