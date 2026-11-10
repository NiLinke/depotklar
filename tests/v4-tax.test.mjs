import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,validate} from '../dist/core/model.mjs';
import {yearReport,yearDefaults,protectedProposal} from '../dist/core/year.mjs';
import {saleParts} from '../dist/core/sale.mjs';
import {vapAmount} from '../dist/core/vap.mjs';
import {demoState} from '../dist/core/sample.mjs';

// Vier Lose in den vier Regimen, alle 2026 verkauft. Sollwerte aus der geprüften Version 3.
function fourRegimes({church='0',stockLoss='0',otherLoss='0',external='0',protectedRemaining='100000',vapA='0',sales=null,certificates=[]}={}){
 const s=emptyState();
 s.persons=[{id:'p',name:'Person'}];s.depots=[{id:'d',personId:'p',bank:'Bank',name:'Depot'}];
 s.securities=[{id:'A',isin:'A',name:'Fonds vor 2009',kind:'equityFund'},{id:'B',isin:'B',name:'Fonds 2012',kind:'equityFund'},{id:'C',isin:'C',name:'Aktie 2007',kind:'stock'},{id:'D',isin:'D',name:'Fonds 2020',kind:'equityFund'},{id:'E',isin:'E',name:'Aktie 2021',kind:'stock'}];
 s.events=[
  {id:'oA',type:'opening',date:'2025-12-31',depotId:'d',securityId:'A',quantity:'1000',cost:'42500',group:'pre2009',price2017:'78.2',oldIncome:'0',vapBefore:'0'},
  {id:'oB',type:'opening',date:'2025-12-31',depotId:'d',securityId:'B',quantity:'1000',cost:'50000',group:'from2009',acquired:'2012-05-10',price2017:'71',deemed2017:'21000',oldIncome:'0',vapBefore:'0'},
  {id:'oC',type:'opening',date:'2025-12-31',depotId:'d',securityId:'C',quantity:'500',cost:'15000',group:'pre2009',acquired:'2007-09-01'},
  {id:'oD',type:'opening',date:'2025-12-31',depotId:'d',securityId:'D',quantity:'300',cost:'30000',group:'from2018',acquired:'2020-07-01',vapBefore:'0'},
  {id:'oE',type:'opening',date:'2025-12-31',depotId:'d',securityId:'E',quantity:'100',cost:'20000',group:'from2018',acquired:'2021-01-01'}];
 for(const x of ['A','B','D'])s.events.push({id:'v'+x,type:'vap',date:'2026-01-02',year:2025,depotId:'d',securityId:x,amount:x==='A'?vapA:'0'});
 for(const [id,q,amount] of sales||[['A','1000','112300'],['B','1000','96400'],['C','500','44000'],['D','300','42300']])s.events.push({id:'s'+id,type:'sell',date:'2026-06-15',depotId:'d',securityId:id,quantity:q,amount});
 s.years={p:{2026:{churchRate:church,externalAllowance:external,stockLossCarry:stockLoss,otherLossCarry:otherLoss,protectedRemaining}}};
 s.certificates=certificates;validate(s);return s;
}

test('all three legacy regimes and the regular case are taxed as in the verified version 3',()=>{
 const r=yearReport(fourRegimes(),'p',2026);
 assert.equal(r.status,'supported');
 assert.equal(r.taxable,'46390');assert.equal(r.capitalTax,'11597.5');assert.equal(r.solidarity,'637.86');assert.equal(r.total,'12235.36');
 assert.equal(r.protectedUsed,'23870');assert.equal(r.protectedRemaining,'76130');
 const sale=id=>r.sales.find(m=>m.securityId===id).sale;
 assert.equal(sale('A').taxable,'23870');assert.equal(sale('A').protectedEligible,'23870');
 assert.equal(sale('B').taxable,'38780','fiktiver Gewinn 2017 ohne Teilfreistellung plus Zuwachs ab 2018 mit');
 assert.equal(sale('C').taxable,'0','Aktie vor 2009 steuerfrei');assert.equal(sale('C').economicGain,'29000');
 assert.equal(sale('D').taxable,'8610');
 assert.equal(r.kap.protectedGain.equityFund,'34100');assert.equal(r.kap.protectedGainAfterExemption.equityFund,'23870');assert.equal(r.kap.deemedGain.equityFund,'21000');
});

test('church tax, loss carries, a small remaining allowance and recognised advance lumps match version 3',()=>{
 for(const [options,total,taxable,used] of [
  [{church:'0.09'},'12986.93','46390','23870'],
  [{church:'0.08',external:'400'},'13016.33','46790','23870'],
  [{stockLoss:'5000',otherLoss:'3000'},'11444.11','43390','23870'],
  [{protectedRemaining:'10000'},'15893.57','60260','10000'],
  [{vapA:'5000'},'13158.48','49890','20370']]){
  const r=yearReport(fourRegimes(options),'p',2026);
  assert.deepEqual([r.status,r.total,r.taxable,r.protectedUsed],['supported',total,taxable,used],JSON.stringify(options));
 }
});

test('losses left at a bank are only used with the loss certificate',()=>{
 const sales=[['E','100','5000'],['D','300','42300']];
 const blocked=yearReport(fourRegimes({sales}),'p',2026);
 assert.equal(blocked.status,'incomplete');assert.equal(blocked.total,null);assert.match(blocked.reasons[0].text,/15000 € \(Aktien\).*Verlustbescheinigung/);
 const ok=yearReport(fourRegimes({sales,certificates:[{id:'c',personId:'p',bank:'Bank',year:2026,lossCertificate:true,certifiedStockLoss:'15000',certifiedOtherLoss:'0'}]}),'p',2026);
 assert.equal(ok.status,'supported');assert.equal(ok.total,'2007.13');assert.equal(ok.carry.stockLoss,'15000');
 const wrong=yearReport(fourRegimes({sales,certificates:[{id:'c',personId:'p',bank:'Bank',year:2026,lossCertificate:true,certifiedStockLoss:'14000',certifiedOtherLoss:'0'}]}),'p',2026);
 assert.equal(wrong.status,'incomplete');assert.match(wrong.reasons[0].text,/weicht/);
});

test('nothing recorded means nothing computed, and out-of-model cases are refused rather than guessed',()=>{
 const s=fourRegimes();
 assert.equal(yearReport(s,'p',2024).status,'none');assert.equal(yearReport(s,'p',2024).total,null);
 // Folgejahr ohne Erträge: nichts zu rechnen; mit Erträgen nach geltendem Recht (v419-future).
 assert.equal(yearReport(s,'p',2027).status,'none');assert.equal(yearReport(s,'p',2017).status,'unsupported');
 // Ein alter Haken ohne gewählten Ehegatten: offen, bis jemand gewählt ist (v417-cases).
 s.years.p[2026].joint=true;assert.equal(yearReport(s,'p',2026).status,'incomplete');assert.match(yearReport(s,'p',2026).reasons[0].text,/Ehegatten in den Jahresdaten wählen/);
 const t=fourRegimes();delete t.years.p;const r=yearReport(t,'p',2026);
 assert.equal(r.status,'incomplete');assert.equal(r.total,null);assert.match(r.reasons[0].text,/Jahresdaten 2026 bestätigen/);
});

test('carry proposals come from the computed year and the allowance chain stops at an unknown year',()=>{
 const s=fourRegimes({protectedRemaining:'100000'});
 const next=yearDefaults(s,'p',2027);
 assert.equal(next.protectedRemaining,'76130');assert.equal(next.stockLossCarry,'0');assert.equal(next.proposal,true);assert.equal(next.basedOn,2026);
 assert.equal(protectedProposal(s,'p',2027),'76130');
 const demo=demoState();assert.equal(protectedProposal(demo,'p3',2027),'87298.133529411765');
});

test('fund sales before 2018 and lots with missing transition values never produce a tax figure',()=>{
 const security={kind:'equityFund'};
 // Altes Investmentsteuerrecht: Fondsverkauf vor 2018 wird nicht nachgerechnet, der wirtschaftliche Gewinn steht.
 const before=saleParts([{id:'l',group:'from2009',quantity:'1',cost:'1',vap:'0'}],'10',security,'2017-06-01');
 assert.equal(before.status,'historic');assert.equal(before.taxable,null);assert.equal(before.economicGain,'9');
 // Aktie 2009–2017: schon Abgeltungsteuer, gerechnet wie heute; vor 2009 außerhalb.
 assert.equal(saleParts([{id:'l',group:'from2009',quantity:'1',cost:'1',vap:'0'}],'10',{kind:'stock'},'2015-06-01').taxable,'9');
 assert.equal(saleParts([{id:'l',group:'pre2009',quantity:'1',cost:'1',vap:'0'}],'10',{kind:'stock'},'2008-06-01').status,'unsupported');
 assert.equal(saleParts([{id:'l',group:'pre2009',acquired:'2006-01-02',quantity:'1',cost:'1',vap:'0'}],'10',{kind:'stock'},'2012-06-01').taxable,'0','Altaktie nach mehr als einem Jahr steuerfrei');
 const missing=saleParts([{id:'l',group:'pre2009',quantity:'1',cost:'1',basis:null,vap:'0',oldIncome:'0'}],'10',security,'2026-06-01');
 assert.equal(missing.status,'incomplete');assert.match(missing.reasons[0].reason,/Kurs 31.12.2017/);
});

test('the advance lump formula keeps the verified rounding, cap, distributions and acquisition month',()=>{
 assert.deepEqual(vapAmount({startValue:'100000',endValue:'110000',rate:'0.0255'}),{base:'1785',capped:'1785',amount:'1785'});
 assert.equal(vapAmount({startValue:'100000',endValue:'100500',rate:'0.0255'}).amount,'500','gedeckelt auf die Wertsteigerung');
 assert.equal(vapAmount({startValue:'100000',endValue:'110000',distributions:'1000',rate:'0.0255'}).amount,'785','Ausschüttung abgezogen');
 assert.equal(vapAmount({startValue:'100000',endValue:'110000',rate:'0.0255',acquisitionMonth:7}).amount,'892.5','sechs Zwölftel');
 assert.equal(vapAmount({startValue:'100000',endValue:'90000',rate:'0.0255'}).amount,'0','Wertverlust');
 assert.equal(vapAmount({startValue:'100000',endValue:'110000',rate:'-0.0045'}).amount,'0','negativer Basiszins');
});
