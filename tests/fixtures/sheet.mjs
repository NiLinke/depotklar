import {emptyState,validate} from '../../dist/core/model.mjs';

// Jahresblatt 2026 mit erfundenen Beträgen: Alt-Fonds vor 2009 auf
// eigenem Depot, Vorabpauschale 2025 laut Bank, drei Schenkungen an Kinder.
export function ledgerSheet(){
 const s=emptyState();
 s.persons=[{id:'p1',name:'Elternteil'},{id:'p2',name:'Kind A'},{id:'p3',name:'Kind B'},{id:'p4',name:'Kind C'}];
 s.depots=[{id:'d1',personId:'p1',bank:'Depotbank',name:'Wertpapiere',account:'530'},{id:'d2',personId:'p2',bank:'Depotbank',name:'Depot A'},{id:'d3',personId:'p3',bank:'Depotbank',name:'Depot B'},{id:'d4',personId:'p4',bank:'Depotbank',name:'Depot C'}];
 s.securities=[{id:'f',isin:'DE0001234567',name:'Alt-Fonds',kind:'equityFund'}];
 s.events=[
  {id:'open',type:'opening',date:'2025-12-31',depotId:'d1',securityId:'f',quantity:'24000',cost:'1812345.67',group:'pre2009',price2017:'125.8940325',oldIncome:'0',vapBefore:'0'},
  {id:'vap25',type:'vap',date:'2026-01-02',year:2025,depotId:'d1',securityId:'f',amount:'98765.43'},
  {id:'g1',type:'transfer',kind:'gift',date:'2026-01-13',depotId:'d1',toDepotId:'d2',securityId:'f',quantity:'1200'},
  {id:'g2',type:'transfer',kind:'gift',date:'2026-01-13',depotId:'d1',toDepotId:'d3',securityId:'f',quantity:'900'},
  {id:'g3',type:'transfer',kind:'gift',date:'2026-01-13',depotId:'d1',toDepotId:'d4',securityId:'f',quantity:'900'}];
 validate(s);return s;
}
