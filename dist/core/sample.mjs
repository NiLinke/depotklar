import {emptyState,validate,firstWorkday} from './model.mjs';

// Fiktive Familie. Alle Namen, Bestände und Kurse sind erfunden.
export function demoState(){
 const s=emptyState();
 s.demo=true;
 s.persons=[{id:'p1',name:'Alexander Weber'},{id:'p2',name:'Sophie Weber'},{id:'p3',name:'Laura Weber'},{id:'p4',name:'Jonas Weber'}];
 s.relations=[{donorId:'p1',recipientId:'p3',kind:'child'},{donorId:'p1',recipientId:'p4',kind:'child'},{donorId:'p2',recipientId:'p3',kind:'child'},{donorId:'p2',recipientId:'p4',kind:'child'}];
 s.depots=[
  {id:'d1',personId:'p1',bank:'Hausbank',name:'Altfonds',account:'530'},
  {id:'d2',personId:'p1',bank:'Direktbank',name:'Wertpapiere',account:'531'},
  {id:'d3',personId:'p3',bank:'Hausbank',name:'Kinderdepot Laura',account:'540'},
  {id:'d4',personId:'p4',bank:'Hausbank',name:'Kinderdepot Jonas',account:'541'}];
 // Unverzinstes USD-Konto beim Depot der Direktbank: Währungsgewinne nach § 23 EStG.
 s.accounts=[{id:'a1',depotId:'d2',name:'USD-Konto Direktbank',currency:'USD',kind:'payment'}];
 s.securities=[
  {id:'af',isin:'DE000DEMO0001',name:'Fiktiver Aktienfonds Alt',kind:'equityFund'},
  {id:'mf',isin:'DE000DEMO0002',name:'Fiktiver Mischfonds Alt',kind:'mixedFund'},
  {id:'f12',isin:'DE000DEMO0003',name:'Fiktiver Rentenfonds 2012',kind:'otherFund'},
  {id:'etf',isin:'IE00DEMO00004',name:'Fiktiver Welt-ETF',kind:'equityFund'},
  {id:'st',isin:'DE000DEMO0005',name:'Fiktive Industrie AG',kind:'stock'},
  {id:'us',isin:'US00DEMO0006',name:'Fiktive Software Inc.',kind:'stock'}];
 const yearEnd={
  af: ['78.20','71.40','86.90','91.30','108.70','94.10','103.60','118.20','124.90'],
  mf: ['95.40','92.10','99.80','101.20','108.40','97.60','101.90','109.30','113.80'],
  f12:['51.20','50.10','52.80','53.90','53.10','47.20','48.90','50.40','51.70'],
  etf:[null,'61.80','72.30','78.10','96.40','83.20','95.70','116.80','124.10']};
 // Jahresende und – vereinfacht gleich hoch – erster Kurs des Folgejahres.
 for(const [id,list] of Object.entries(yearEnd))list.forEach((price,i)=>{if(price)s.prices.push({securityId:id,date:`${2017+i}-12-29`,price},{securityId:id,date:firstWorkday(2018+i),price});});
 s.prices.push({securityId:'us',date:'2023-12-29',price:'338.10'},{securityId:'us',date:'2024-12-30',price:'371.80'},{securityId:'us',date:'2025-12-30',price:'412.50'},{securityId:'us',date:'2026-10-30',price:'436.90'},{securityId:'af',date:'2026-10-30',price:'131.40'},{securityId:'mf',date:'2026-10-30',price:'116.20'},{securityId:'etf',date:'2026-10-30',price:'129.60'},{securityId:'st',date:'2026-10-30',price:'187.20'});
 const e=(x)=>s.events.push(x);
 // Altbestand zum 01.01.2018: Ursprungspreis aus der Buchhaltung, Kurs 31.12.2017.
 e({id:'o1',type:'opening',date:'2018-01-01',depotId:'d1',securityId:'af',quantity:'6800',cost:'289000',group:'pre2009',price2017:'78.20',oldIncome:'0',vapBefore:'0',note:'Depotauszug 31.12.2017, Buchhaltung Konto 530'});
 e({id:'o2',type:'opening',date:'2018-01-01',depotId:'d1',securityId:'mf',quantity:'2500',cost:'152500',group:'pre2009',price2017:'95.40',oldIncome:'0',vapBefore:'0'});
 e({id:'o3',type:'opening',date:'2018-01-01',depotId:'d1',securityId:'f12',quantity:'1200',cost:'58800',group:'from2009',acquired:'2012-04-16',price2017:'51.20',deemed2017:'2640',oldIncome:'0',vapBefore:'0'});
 e({id:'o4',type:'opening',date:'2018-01-01',depotId:'d2',securityId:'st',quantity:'300',cost:'14100',group:'pre2009',acquired:'2006-09-12'});
 e({id:'b1',type:'buy',date:'2019-03-11',depotId:'d2',securityId:'etf',quantity:'400',amount:'26520.40',note:'Abrechnung 4711'});
 e({id:'b2',type:'buy',date:'2021-06-07',depotId:'d2',securityId:'etf',quantity:'150',amount:'13188.75'});
 e({id:'u1',type:'fx',kind:'exchangeIn',date:'2023-10-20',depotId:'d2',accountId:'a1',amount:'15000',eur:'14150',note:'Devisenkauf'});
 e({id:'b3',type:'buy',date:'2023-11-06',depotId:'d2',securityId:'us',quantity:'40',amount:'13240.80',fx:{accountId:'a1',amount:'14000'}});
 e({id:'x1',type:'distribution',date:'2024-05-15',depotId:'d1',securityId:'mf',amount:'3750',capitalTax:'619.82',solidarity:'34.09',churchTax:'55.78'});
 e({id:'x2',type:'distribution',date:'2025-05-15',depotId:'d1',securityId:'mf',amount:'4000',capitalTax:'691.06',solidarity:'38.00',churchTax:'62.19'});
 e({id:'s1',type:'sell',date:'2025-09-18',depotId:'d1',securityId:'f12',quantity:'1200',amount:'61320',capitalTax:'1170.49',solidarity:'64.37',churchTax:'105.34'});
 // Eine Schenkung an beide Kinder am selben Tag, Lose nacheinander zugeteilt.
 e({id:'g1',type:'transfer',kind:'gift',date:'2026-01-13',depotId:'d1',toDepotId:'d3',securityId:'af',quantity:'1700',price:'125.10',batchId:'gb1',allocation:'sequence'});
 e({id:'g2',type:'transfer',kind:'gift',date:'2026-01-13',depotId:'d1',toDepotId:'d4',securityId:'af',quantity:'1350',price:'125.10',batchId:'gb1',allocation:'sequence'});
 e({id:'u2',type:'fx',kind:'exchangeIn',date:'2026-02-02',depotId:'d2',accountId:'a1',amount:'2000',eur:'1660'});
 e({id:'x3',type:'distribution',date:'2026-03-12',depotId:'d2',securityId:'us',amount:'84.40',foreignTax:'12.66',capitalTax:'8.25',solidarity:'0.45',churchTax:'0.74',fx:{accountId:'a1',amount:'75.90',rate:'1.058'},note:'US-Dividende, 15 % Quellensteuer'});
 e({id:'u3',type:'fx',kind:'exchangeOut',date:'2026-09-10',depotId:'d2',accountId:'a1',amount:'2500',eur:'2205',note:'Rücktausch'});
 e({id:'z1',type:'interest',date:'2026-06-30',depotId:'d2',amount:'186.25',note:'Zinsen Verrechnungskonto'});
 e({id:'s2',type:'sell',date:'2026-09-21',depotId:'d3',securityId:'af',quantity:'400',amount:'51720'});
 s.years={
  p1:{2025:{churchRate:'0.09',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'},
      2026:{churchRate:'0.09',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'}},
  p3:{2026:{churchRate:'0',externalAllowance:'0',stockLossCarry:'0',otherLossCarry:'0',protectedRemaining:'100000'}}};
 s.certificates=[{id:'c1',personId:'p1',bank:'Hausbank',year:2025,capitalTax:'3141.23',solidarity:'172.76',churchTax:'282.71',note:'Jahressteuerbescheinigung 2025, ohne Freistellungsauftrag'},{id:'c2',personId:'p1',bank:'Direktbank',year:2025,capitalTax:'0',solidarity:'0',churchTax:'0',note:'Jahressteuerbescheinigung 2025, Freistellungsauftrag'}];
 s.ledgerChecks=[{id:'l1',depotId:'d1',date:'2025-12-31',balance:'441500',note:'Sachkonto 530, Saldo zum 31.12.2025'}];
 validate(s);return s;
}
