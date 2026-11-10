import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {emptyState,validate,withYearRules} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {yearReport} from '../dist/core/year.mjs';
import {giftAssessments} from '../dist/core/gifttax.mjs';
import {BASE_RATES,inflowDate,taxYearOf,baseRateOf,vapYears} from '../dist/core/rules.mjs';
import {auditHTML} from '../dist/ui/audit.mjs';
import {workbook} from '../dist/ui/xlsx.mjs';
import {D,S,round} from '../dist/core/decimal.mjs';

const cents=v=>v==null?null:S(round(D(v)));
const PARAMS={churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0'};

// Fiktive Familie über 2026 hinaus: Fondskauf 2026, Ausschüttung 2027, Schenkung 2027, Verkauf 2028.
function family(){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person Eins'},{id:'k',name:'Kind Eins'}];
 s.relations=[{donorId:'p',recipientId:'k',kind:'child'}];
 s.depots=[{id:'d',personId:'p',bank:'Bank A',name:'Depot'},{id:'dk',personId:'k',bank:'Bank A',name:'Kinderdepot'}];
 s.securities=[{id:'f',isin:'DE0000000021',name:'Fiktiver Aktienfonds',kind:'equityFund'}];
 s.events=[{id:'b',type:'buy',date:'2026-03-02',depotId:'d',securityId:'f',quantity:'250',amount:'25000'},
  {id:'a',type:'distribution',date:'2027-06-01',depotId:'d',securityId:'f',amount:'50'},
  {id:'g',type:'transfer',kind:'gift',date:'2027-05-05',depotId:'d',toDepotId:'dk',securityId:'f',quantity:'50',price:'105'},
  {id:'s',type:'sell',date:'2028-03-01',depotId:'d',securityId:'f',quantity:'200',amount:'24000'}];
 s.prices=[{securityId:'f',date:'2026-01-02',price:'98'},{securityId:'f',date:'2026-12-30',price:'100'},
  {securityId:'f',date:'2027-01-04',price:'100'},{securityId:'f',date:'2027-12-30',price:'110'}];
 s.years={p:{2026:PARAMS,2027:PARAMS,2028:PARAMS}};
 validate(s);return s;
}

test('the inflow of the Vorabpauschale is the first weekday after New Year, as in every BMF table',()=>{
 for(const r of Object.values(BASE_RATES))assert.equal(inflowDate(r.year),r.inflow,String(r.year));
 assert.equal(inflowDate(2027),'2028-01-03');assert.equal(inflowDate(2028),'2029-01-02');
});

test('a following year calculates under continuing law, only the Basiszins stays open until entered',()=>{
 const s=family();
 // 2027: Ertrag vorhanden, der Sparer-Pauschbetrag gilt nach geltendem Recht weiter.
 const r27=yearReport(s,'p',2027);
 assert.equal(r27.status,'supported');assert.ok(r27.hints.some(h=>/1000 € nach geltendem Recht/.test(h)));
 // Vorabpauschale 2027 ohne Basiszins: offen, nicht null; der Verkauf 2028 bleibt deshalb offen.
 const moves=replay(s,{until:'2028-12-31'}).moves,v27=moves.find(m=>m.type==='vap'&&m.year===2027);
 assert.equal(v27.noRate,true);assert.equal(v27.income,null);assert.equal(v27.date,'2028-01-03');
 assert.equal(moves.find(m=>m.eventId==='s').sale.status,'incomplete');
 const r28=yearReport(s,'p',2028);assert.ok(r28.reasons.some(x=>/Basiszins 2027 unter „Kurse“ eintragen/.test(x.text)));
 // Schenkung 2027: Steuer nach geltendem Recht.
 const gift=()=>giftAssessments(s2,replay(s2,{until:'2027-12-31'}).moves,'p','k').acquisitions[0];let s2=s;
 assert.equal(gift().status,'supported');
 // Ein Jahr vor 2018 bleibt außerhalb des Modells.
 assert.equal(yearReport(s,'p',2017).status,'unsupported');
 // Bestätigen: 2027 mit 1.000 € und 3,00 % Basiszins, 2028 vorerst ohne Basiszins.
 s2=withYearRules(s,2027,{allowance:'1000',baseRate:'0.03'});s2=withYearRules(s2,2028,{allowance:'1000'});
 assert.equal(gift().status,'supported');assert.equal(gift().tax,'0');
 const c27=yearReport(s2,'p',2027);assert.equal(c27.status,'supported');assert.ok(c27.hints.some(h=>/selbst unter „Kurse“ eingetragen/.test(h)));
 // Vorabpauschale 2027: 100 × 70 % × 3 % = 2,10 € je Anteil (kleiner als Zuwachs plus Ausschüttung), abzüglich
 // der Ausschüttung von 50 € auf 200 Anteile = 0,25 € → 1,85 € je Anteil × 200 Anteile nach der Schenkung.
 const m28=replay(s2,{until:'2028-12-31'}).moves,vap=m28.find(m=>m.type==='vap'&&m.year===2027);
 assert.equal(cents(vap.perUnit),'1.85');assert.equal(cents(vap.income.gross),'370');assert.equal(vap.date,'2028-01-03');
 // Vorabpauschale 2026 (hinterlegt): min(98 × 0,7 × 3,2 % = 2,1952; Zuwachs 2) = 2 € je Anteil × 250 × 10/12.
 const v26=m28.find(m=>m.type==='vap'&&m.year===2026);assert.equal(cents(v26.income.gross),'416.67');
 // Verkauf 2028: 200 Anteile, Anschaffung 20.000 € + Vorabpauschalen 2026 (416,67 × 200 ÷ 250 = 333,336) und 2027 (370):
 // 24.000 − 20.000 − 333,336 − 370 = 3.296,664; nach 30 % Teilfreistellung 2.307,66.
 const sale=m28.find(m=>m.eventId==='s').sale;assert.equal(sale.status,'supported');assert.equal(cents(sale.gross),'3296.66');assert.equal(cents(sale.taxable),'2307.66');
 assert.equal(yearReport(s2,'p',2028).status,'supported');
});

test('confirmed rules never override stored ones, are locked by a closing and land in the protocol',()=>{
 const s=family();
 assert.throws(()=>withYearRules(s,2026,{allowance:'2000'}),/hinterlegt/);
 // Ein Eintrag für ein hinterlegtes Jahr (etwa nach einem Update) bleibt lesbar, zählt aber nicht.
 const t={...s,yearRules:{2026:{allowance:'5000',baseRate:'0.05'}}};validate(t);
 assert.equal(taxYearOf(t,2026).allowance,'1000');assert.equal(baseRateOf(t,2026).rate,'0.032');
 assert.throws(()=>withYearRules(s,2027,{allowance:'1000',baseRate:'2.53'}),/als Anteil/);
 let u=withYearRules(s,2027,{allowance:'1000'});
 assert.equal(baseRateOf(u,2027),null);assert.equal(vapYears(u,'2028-12-31').find(r=>r.year===2027).missing,true);
 u=withYearRules(u,2027,{allowance:'1000',baseRate:'0.0275'},{reason:'BMF-Schreiben Januar 2027'});
 assert.equal(baseRateOf(u,2027).rate,'0.0275');assert.equal(baseRateOf(u,2027).inflow,'2028-01-03');
 const html=auditHTML(u);assert.match(html,/Jahreswerte 2027 · alle Personen/);assert.match(html,/Basiszins: – → 0\.0275/);assert.match(html,/Grund: BMF-Schreiben Januar 2027/);
 // Hat eine der Personen 2027 abgeschlossen, sind die Jahresregeln 2027 für alle gesperrt.
 const closed={...u,closing:{k:2027}};validate(closed);
 assert.throws(()=>withYearRules(closed,2027,{allowance:'1001'}),/abgeschlossen/);
});

test('Excel names the origin of an entered allowance',async()=>{
 const s=family();
 const done=withYearRules(s,2027,{allowance:'1000',baseRate:'0.03'});
 const book=await workbook(done,2027,ExcelJS,{personId:'p'}),ws=book.getWorksheet('Rechenweg 2027 Person Eins');
 let label=null;ws.eachRow(r=>{const v=r.getCell(1).value;if(typeof v==='string'&&v.startsWith('Sparer-Pauschbetrag 2027'))label=v;});
 assert.match(label,/selbst eingetragen/);
});
