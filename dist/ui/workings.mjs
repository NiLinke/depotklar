import {D,S,sum,min} from '../core/decimal.mjs';
import {yearReport} from '../core/year.mjs';
import {KINDS,EXEMPTION,GROUPS,taxYearOf,FOREIGN_TAX_CAP,isFund} from '../core/rules.mjs';
import {incomeType} from '../core/model.mjs';
import {originOf} from '../core/statement.mjs';

// Rechenweg eines Steuerjahrs für Excel: dieselben Zahlen wie die Steuerseite, aber als
// Formeln, damit sich jeder Schritt nachvollziehen lässt – etwa bei einer Rückfrage des
// Finanzamts. Blau sind Eingaben (Abrechnungen, Kurse, Jahresdaten, Werte aus Vorjahren),
// schwarz rechnet Excel. Jede Formel trägt das Ergebnis von Depotklar als gespeicherten Wert;
// Excel rechnet beim Öffnen neu. Fester Wert bleibt, was Daten außerhalb des Blatts braucht:
// die Vorabpauschalen früherer Jahre je Los, der fiktive Gewinn 2017 laut Bank und Währungsgewinne.
const n=v=>v==null?null:Number(v);
const de=d=>d?d.split('-').reverse().join('.'):'';
const pct=v=>`${String(Number(v)*100).replace('.',',')} %`;
const euro=v=>new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v));
const FMT={eur:'#,##0.00',qty:'#,##0.####',unit:'#,##0.0000',pct:'0.00%',pct0:'0%',int:'0'};
const INK={input:'FF1D4ED8',head:'FF94560F',muted:'FF475467'},FILL={head:'FFFBF3E6',total:'FFF6F7F9'};
// Eine Zelle: Text, Eingabe (in) oder Formel (f mit Ergebnis v). f darf die eigene Zeilennummer nutzen.
const inp=(v,t='eur')=>v==null?'offen':{in:n(v),t};
const fx=(f,v,t='eur')=>({f,v:n(v),t});
const total=xs=>S(sum(xs.map(x=>D(x??'0'))));

function line(ws,cells,{bold=false,fill=null,ink=null,size=null}={}){
 const r=ws.addRow([]),row=r.number;
 cells.forEach((c,i)=>{
  if(c==null||c==='')return;
  const cell=r.getCell(i+1);
  if(typeof c==='string'){
   if(/^\d{4}-\d{2}-\d{2}$/.test(c)){cell.value=new Date(`${c}T00:00:00Z`);cell.numFmt='dd.mm.yyyy';}else cell.value=c;
  }else if(typeof c==='number'){cell.value=c;cell.numFmt=FMT.eur;}
  else if(c.f!=null){cell.value=c.v==null?{formula:typeof c.f==='function'?c.f(row):c.f}:{formula:typeof c.f==='function'?c.f(row):c.f,result:c.v};cell.numFmt=FMT[c.t];}
  else{cell.value=c.in;cell.numFmt=FMT[c.t];cell.font={color:{argb:INK.input}};}
  if(bold||ink||size)cell.font={...(cell.font||{}),...(bold?{bold:true}:{}),...(ink?{color:{argb:ink}}:{}),...(size?{size}:{})};
  if(fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
 });
 if(fill)for(let i=cells.length+1;i<=13;i++)r.getCell(i).fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
 return row;
}
const title=(ws,text)=>line(ws,[text],{bold:true,size:12,ink:INK.head});
const head=(ws,cells)=>line(ws,cells,{bold:true,fill:FILL.head,ink:INK.head});
const note=(ws,text)=>line(ws,[text],{ink:INK.muted});
const gap=ws=>ws.addRow([]);

// Rechenregel je Los, für den Prüfer ausgeschrieben.
const RULE={
 stockPre2009:'Aktie vor 2009: Gewinn nicht steuerbar (vor der Abgeltungsteuer erworben)',
 fundPre2009:'Alt-Anteil vor 2009: Gewinn ab 2018 gegen Kurs 31.12.2017; nach Teilfreistellung auf den Freibetrag von 100.000 € anrechenbar (§ 56 Abs. 6 InvStG)',
 fund2009:'Erwerb 2009 bis 2017: Gewinn ab 2018 gegen Kurs 31.12.2017 (§ 56 Abs. 2 InvStG), dazu der fiktive Gewinn 2017 ohne Teilfreistellung (§ 56 Abs. 3 S. 1 InvStG)',
 stock:'Erlös − Anschaffungskosten (§ 20 Abs. 4 S. 1 EStG)',
 bond:'Erlös − Anschaffungskosten (§ 20 Abs. 2 S. 1 Nr. 7, Abs. 4 S. 1 EStG), keine Teilfreistellung',
 commodity:'ETC mit Rohstoffanspruch: privates Veräußerungsgeschäft, steuerbar nur bis ein Jahr nach der Anschaffung (§ 23 EStG; BMF vom 14.05.2025, Rn. 57)',
 fund:'Erlös − Anschaffungskosten − Vorabpauschalen (§ 19 Abs. 1 S. 4 InvStG)'
};
const ruleOf=(regime,kind)=>regime==='regular'?RULE[kind==='stock'?'stock':kind==='bond'?'bond':'fund']:RULE[regime]||'';
const vapNote=log=>{
 const parts=(log||[]).filter(v=>!v.settled&&D(v.amount)!==0n).map(v=>v.year==null?`bis Stichtag ${euro(v.amount)}`:`${v.year}: ${euro(v.amount)}`);
 return parts.length?`Vorabpauschalen ${parts.join(' · ')}`:'';
};

// Ein Verkauf: Lose in FIFO-Reihenfolge, je Los Erlösanteil, Abzüge, Gewinn, Teilfreistellung.
// Gibt die Zeilen zurück, auf die das Ertragsblatt verweist.
function saleBlock(ws,s,m){
 const x=s.securities.find(y=>y.id===m.securityId),depot=s.depots.find(d=>d.id===m.depotId),sale=m.sale,rate=EXEMPTION[x.kind];
 title(ws,`Verkauf am ${de(m.date)} · ${x.name}${x.isin?` · ${x.isin}`:''} · ${depot?.name||''}`);
 const proceeds=line(ws,['Erlös laut Abrechnung (Kurswert abzüglich Gebühren, vor Steuern)',inp(m.proceeds)]);
 const quantity=line(ws,['Verkaufte Stück',inp(S(-D(m.quantity)),'qty')]);
 const fund=isFund(x.kind),etc=x.kind==='commodity',share=fund?line(ws,[`Teilfreistellung ${KINDS[x.kind]} (§ 20 InvStG)`,inp(rate,'pct0')]):null;
 note(ws,'Verbraucht nach FIFO: die zuerst angeschafften Stücke zuerst (§ 20 Abs. 4 S. 7 EStG). Nach einer Schenkung zählt die Anschaffung des Schenkers.');
 if(sale.status!=='supported'){
  for(const r of sale.reasons)note(ws,`Offen: ${r.reason}`);
  if(!sale.reasons.length)note(ws,'Offen: Der Gewinn ist nicht vollständig ermittelt.');
 }
 head(ws,['Los in FIFO-Reihenfolge','Stück im Los vor dem Verkauf','Davon verkauft','Erlös anteilig','Anschaffungskosten','Basis 31.12.2017','Vorabpauschalen','Gewinn','Fiktiver Gewinn 2017','Verlust ohne Teilfreistellung','Teilfreistellung','Steuerpflichtig','Regel und Herkunft der Werte']);
 const fifo=m.fifo||[],rows=[],ok=sale.status==='supported';
 m.consumed.forEach((piece,i)=>{
  const d=sale.details[i],own=d.own||{post:d.post2018,unexempted:d.lossWithoutExemption,exempt:d.exempt,taxable:d.taxable},pos=fifo.findIndex(f=>f.id===piece.id),before=pos<0?null:fifo[pos].quantity,regime=d.regime,legacy=regime==='fund2009'||regime==='fundPre2009';
  const label=`${pos<0?'':pos+1+' · '}${originOf(s,piece,m.depotId)} · ${piece.acquired?`Erwerb ${de(piece.acquired)}`:`Erwerb ${GROUPS[piece.group]}`}`;
  const hint=[ruleOf(regime,x.kind),vapNote(d.vapLog),d.frozen?.length&&regime==='fund2009'?'Nach der Verschmelzung ist die Basis der Rücknahmepreis; Verlust ab dann mit Teilfreistellung':'',regime==='fund2009'?'Fiktiver Gewinn 2017 laut Bank, nach Stück verteilt':'',D(d.lossWithoutExemption??'0')>0n?'Verlust ohne Teilfreistellung, soweit der Kurs 31.12.2017 über den Anschaffungskosten lag (BFH vom 25.11.2025, VIII R 22/23)':'',D(d.oldIncome??'0')>0n?`Akkumulierte Erträge ${euro(d.oldIncome)} € nur zur Information`:''].filter(Boolean).join(' · ');
  const row=line(ws,[label,inp(before,'qty'),inp(d.quantity,'qty'),
   ok?fx(r=>`$B$${proceeds}*C${r}/$B$${quantity}`,d.proceeds):inp(d.proceeds),
   piece.cost==null?(regime==='regular'?'offen':''):inp(piece.cost),
   legacy?inp(piece.basis):'',
   !fund?'':inp(piece.vap),
   !ok?'offen':regime==='stockPre2009'?fx('0','0'):etc?fx(r=>`D${r}-E${r}`,d.privateGain):fx(r=>legacy?`D${r}-F${r}-G${r}`:`D${r}-E${r}-G${r}`,own.post),
   regime==='fund2009'?inp(d.deemed):'',
   ok&&regime==='fund2009'?(d.frozen?.length?fx('0','0'):fx(r=>`IF(H${r}<0,MIN(-H${r},MAX(0,F${r}-E${r})),0)`,own.unexempted)):'',
   !ok||!fund?'':fx(r=>`(H${r}+J${r})*$B$${share}`,own.exempt),
   !ok?'':etc?(d.within?fx(r=>`H${r}`,d.privateGain):fx('0','0')):fx(r=>`I${r}+H${r}-K${r}`,own.taxable),
   hint]);
  rows.push({row,regime});
  // Aufgeschobener Gewinn aus einer Verschmelzung mit anderem Teilfreistellungssatz, mit dem alten Satz (§ 22 InvStG).
  for(const f of d.frozen||[]){
   const sub=line(ws,[`· Gewinn bis zur Verschmelzung am ${de(f.date)}`,null,null,null,regime==='fund2009'?inp(f.cost):'',regime==='regular'?'':inp(f.basis),null,inp(f.gain),null,regime==='fund2009'?(f.bfh===false?fx('0','0'):fx(r=>`IF(H${r}<0,MIN(-H${r},MAX(0,F${r}-E${r})),0)`,f.unexempted)):'',fx(r=>`(H${r}+J${r})*${f.rate}`,f.exempt),fx(r=>`H${r}-K${r}`,f.part),
    `Fiktive Veräußerung, beim Verkauf versteuert (§ 22 InvStG), Teilfreistellung des alten Fonds ${pct(f.rate)}${regime==='regular'?`, Anschaffungskosten davor ${euro(f.cost)}`:''}`]);
   rows.push({row:sub,regime});
  }
 });
 const untouched=fifo.filter(f=>!m.consumed.some(c=>c.id===f.id));
 if(untouched.length)note(ws,`Nicht berührt: ${untouched.length} ${untouched.length===1?'jüngeres Los':'jüngere Lose'} mit ${untouched.reduce((a,f)=>a+Number(f.quantity),0).toLocaleString('de-DE')} Stück.`);
 const a=rows[0].row,b=rows.at(-1).row,sumOf=c=>`SUM(${c}${a}:${c}${b})`,dt=sale.details;
 const sumRow=line(ws,['Summe Verkauf',null,fx(sumOf('C'),S(-D(m.quantity)),'qty'),ok?fx(sumOf('D'),m.proceeds):'',null,null,null,
  ok?fx(sumOf('H'),etc?sale.privateGain:total(dt.map(d=>d.post2018))):'',ok?fx(sumOf('I'),total(dt.map(d=>d.regime==='fund2009'?d.deemed:'0'))):'',ok?fx(sumOf('J'),total(dt.map(d=>d.lossWithoutExemption))):'',
  ok?fx(sumOf('K'),sale.exempt):'',ok?fx(sumOf('L'),etc?sale.privateTaxable:sale.taxable):''],{bold:true,fill:FILL.total});
 const out={sum:sumRow,gross:null,eligible:null,ok};
 if(!ok){gap(ws);return out;}
 if(etc){line(ws,['Innerhalb der Jahresfrist steuerbar (Anlage SO, Freigrenze für alle privaten Veräußerungsgeschäfte des Jahres)',fx(`L${sumRow}`,sale.privateTaxable)],{bold:true});gap(ws);return out;}
 out.gross=line(ws,['Gewinn vor Teilfreistellung (Gewinn + fiktiver Gewinn 2017)',fx(`H${sumRow}+I${sumRow}`,sale.gross)],{bold:true});
 if(m.gainBank!=null){const bank=line(ws,['Laut Verkaufsabrechnung (vor Teilfreistellung)',inp(m.gainBank)]);line(ws,['Abweichung Bank − Depotklar',fx(`B${bank}-B${out.gross}`,S(D(m.gainBank)-D(sale.gross)))]);}
 const old=rows.filter(r=>r.regime==='fundPre2009');
 if(old.length)out.eligible=line(ws,['Auf den Freibetrag für Alt-Anteile anrechenbar (§ 56 Abs. 6 InvStG)',fx(`MAX(0,${old.map(r=>`L${r.row}`).join('+')})`,sale.protectedEligible)]);
 if(D(sale.accumulatedIncome??'0')>0n)note(ws,`Akkumulierte ausschüttungsgleiche Erträge ${euro(sale.accumulatedIncome)} €: keine Einkünfte des Verkaufsjahres; die Bank holt nur den Steuerabzug nach (§ 56 Abs. 3 S. 6 InvStG).`);
 gap(ws);
 return out;
}

// Vorabpauschale eines Fonds: je Anteil aus erstem und letztem Kurs (oder laut Steuerinformation),
// dann je Los mit Stück und Monaten. Ein Bankwert hat Vorrang und wird nach Stück und Monaten verteilt.
function vapBlock(ws,s,m){
 const x=s.securities.find(y=>y.id===m.securityId),depot=s.depots.find(d=>d.id===m.depotId),lots=m.lots||[];
 title(ws,`Vorabpauschale ${m.year} · Zufluss ${de(m.date)} · ${x.name}${x.isin?` · ${x.isin}`:''} · ${depot?.name||''}`);
 const label=l=>`${originOf(s,l,m.depotId)} · ${l.acquired?`Erwerb ${de(l.acquired)}`:`Erwerb ${GROUPS[l.group]}`}`;
 const months=l=>l.factor==null?null:String(Math.round(Number(l.factor)*12));
 if(m.source==='bank'){
  const bank=line(ws,['Vorabpauschale laut Bank (§ 18 InvStG)',inp(m.tax)]);
  note(ws,'Depotklar verteilt den Bankwert nach Stück und Monaten auf die Lose (Erwerb im Jahr: ein Zwölftel weniger je vollem Monat vor dem Erwerbsmonat).');
  head(ws,['Los','Stück zum Jahresende','Monate','Gewicht','Anteil am Bankwert','','','','','','','','Hinweis']);
  const first=ws.rowCount+1,last=first+lots.length-1;
  for(const l of lots)line(ws,[label(l),inp(l.quantity,'qty'),inp(months(l),'int'),fx(r=>`B${r}*C${r}/12`,l.factor==null?null:S(D(l.quantity)*D(l.factor)/D('1')),'qty'),fx(r=>`$B$${bank}*D${r}/SUM($D$${first}:$D$${last})`,l.amount)]);
  const sumRow=line(ws,['Summe',null,null,null,fx(`SUM(E${first}:E${last})`,m.tax)],{bold:true,fill:FILL.total});
  if(m.computed!=null){const c=line(ws,['Zum Vergleich: rechnerisch aus Kursen',inp(m.computed)]);line(ws,['Abweichung Bank − Rechnung',fx(`B${bank}-B${c}`,S(D(m.tax)-D(m.computed)))]);}
  gap(ws);return {total:bank,col:'B'};
 }
 let pu;
 if(m.computedFrom==='unit')pu=line(ws,['Vorabpauschale je Anteil laut Steuerinformation des Fonds',inp(m.perUnit,'unit')]);
 else{
  const rate=line(ws,[`Basiszins ${m.year} (§ 18 Abs. 4 InvStG)`,inp(m.rate,'pct')]);
  const start=line(ws,[`Erster Kurs des Jahres ${de(m.prices?.start?.date)} (Rücknahmepreis, sonst Börsenkurs)${m.split?', auf die Stücke nach dem Split umgerechnet':''}`,inp(m.start,'unit')]);
  const end=line(ws,[`Letzter Kurs des Jahres ${de(m.prices?.end?.date)}${m.split?', umgerechnet':''}`,inp(m.end,'unit')]);
  const dist=line(ws,['Ausschüttungen je Anteil im Jahr',inp(m.distributionPerUnit,'unit')]);
  const base=line(ws,['Basisertrag je Anteil = erster Kurs × 70 % × Basiszins',fx(`B${start}*0.7*B${rate}`,S(D(m.start)*D('0.7')*D(m.rate)/D('1')/D('1')),'unit')]);
  const gain=line(ws,['Wertsteigerung zuzüglich Ausschüttungen je Anteil',fx(`MAX(0,B${end}-B${start}+B${dist})`,S(D(m.end)-D(m.start)+D(m.distributionPerUnit)>0n?D(m.end)-D(m.start)+D(m.distributionPerUnit):0n),'unit')]);
  pu=line(ws,['Vorabpauschale je Anteil = kleinerer Wert abzüglich Ausschüttungen',fx(`MAX(0,MIN(B${base},B${gain})-B${dist})`,m.perUnit,'unit')],{bold:true});
 }
 note(ws,'Je Los: Anteile × Wert je Anteil, im Erwerbsjahr um ein Zwölftel je vollem Monat vor dem Erwerbsmonat gemindert (§ 18 Abs. 2 InvStG).');
 head(ws,['Los','Stück zum Jahresende','Monate','Wert je Anteil','Vorabpauschale','','','','','','','','Hinweis']);
 const first=ws.rowCount+1,last=first+lots.length-1;
 for(const l of lots){
  const own=l.perUnit!=null&&m.perUnit!=null&&D(l.perUnit)!==D(m.perUnit);
  const value=l.factor==null||l.perUnit==null?null:S(D(l.quantity)*D(l.factor)/D('1')*D(l.perUnit)/D('1'));
  line(ws,[label(l),inp(l.quantity,'qty'),inp(months(l),'int'),own?inp(l.perUnit,'unit'):fx(`$B$${pu}`,m.perUnit,'unit'),fx(r=>`B${r}*C${r}/12*D${r}`,value),null,null,null,null,null,null,null,own?'Wert des untergegangenen Fonds nach Verschmelzung zum 31.12.':'']);
 }
 const sumRow=line(ws,['Vorabpauschale, auf Cent gerundet',null,null,null,fx(`ROUND(SUM(E${first}:E${last}),2)`,m.income?.gross)],{bold:true,fill:FILL.total});
 gap(ws);return {total:sumRow,col:'E'};
}

// Blatt „Rechenweg“: Jahresdaten, Verkäufe, Vorabpauschalen, Erträge und die Jahresrechnung.
// Ohne Erträge im Jahr kein Blatt; make(Spaltenbreiten) legt es erst dann an.
export function workingsSheet(make,s,personId,year){
 const rule=taxYearOf(s,year);if(!rule)return false;
 const r=yearReport(s,personId,year),person=s.persons.find(p=>p.id===personId);
 if(!r.items.length&&!r.sales.length)return false;
 const ws=make([52,16,14,14,15,15,15,15,15,15,15,15,48]);
 ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.2,footer:0.2}};
 line(ws,[`Rechenweg Steuer ${year} · ${person.name}`],{bold:true,size:14});
 note(ws,'Blau: Werte aus Abrechnungen, Kursen und Jahresdaten. Schwarz: Formeln – Excel rechnet sie beim Öffnen neu und zeigt so jeden Schritt.');
 note(ws,`Modellrechnung für Privatvermögen bei ${r.jointWith?`Zusammenveranlagung mit ${r.jointName}`:'Einzelveranlagung'}, kein Steuerbescheid. Steuern auf Cent gerundet, Solidaritätszuschlag abgerundet.`);
 if(r.status!=='supported')for(const x of r.reasons)note(ws,`Offen: ${x.text}`);
 gap(ws);

 // Jahresdaten: die Eingaben der Jahresrechnung.
 const p=r.params,inputs={};
 if(p){
  title(ws,`Jahresdaten ${year}`);
  inputs.allowance=line(ws,[`Sparer-Pauschbetrag ${year} (${rule.confirmed?'selbst eingetragen':'§ 20 Abs. 9 EStG'})`,inp(rule.allowance)]);
  inputs.external=line(ws,['Anderweitig genutzter Sparer-Pauschbetrag',inp(p.externalAllowance)]);
  inputs.stockCarry=line(ws,[`Aktienverlustvortrag zum 01.01.${year}`,inp(p.stockLossCarry)]);
  inputs.otherCarry=line(ws,[`Sonstiger Verlustvortrag zum 01.01.${year}`,inp(p.otherLossCarry)]);
  if(p.protectedRemaining!=null)inputs.protected=line(ws,[`Rest-Freibetrag Alt-Anteile zum 01.01.${year} (§ 56 Abs. 6 InvStG)`,inp(p.protectedRemaining)]);
  inputs.church=line(ws,['Kirchensteuersatz',inp(p.churchRate,'pct')]);
  inputs.months=line(ws,['Monate mit Kirchensteuerpflicht',inp(String(r.churchMonths),'int')]);
  gap(ws);
 }

 const saleRefs=new Map(),vapRefs=new Map();
 if(r.sales.length){title(ws,`Verkäufe ${year}`);gap(ws);for(const m of r.sales)saleRefs.set(m,saleBlock(ws,s,m));}
 const vaps=r.vaps.filter(m=>m.income);
 if(vaps.length){title(ws,`Vorabpauschalen mit Zufluss ${year}`);gap(ws);for(const m of vaps)vapRefs.set(m,vapBlock(ws,s,m));}

 // Erträge des Jahres: Topf, Teilfreistellung, Freibetrag für Alt-Anteile, Quellensteuer.
 title(ws,`Erträge ${year}`);
 const protectedStart=inputs.protected,anyEligible=r.items.some(i=>i.kind==='sale'&&D(i.eligible??'0')>0n);
 head(ws,['Ertrag','Datum','Art','Topf','Vor Teilfreistellung','Teilfreistellung (Satz)','Teilfreistellung','Steuerpflichtig','Freibetrag Alt-Anteile','Verbleibt','Quellensteuer','Anrechenbar (höchstens 25 %)','Herkunft']);
 const first=ws.rowCount+1,last=first+r.items.length-1,cap=FOREIGN_TAX_CAP;
 const kindLabel=i=>incomeType(i,s.securities.find(x=>x.id===i.ref.securityId));
 const nameOf=i=>{const m=i.ref,x=s.securities.find(y=>y.id===m.securityId);if(i.kind==='other')return m.label;if(x)return x.name;if(m.accountId)return (s.accounts||[]).find(a=>a.id===m.accountId)?.name||'Währungskonto';return s.depots.find(d=>d.id===m.depotId)?.name||'';};
 r.items.forEach(i=>{
  const m=i.ref,x=s.securities.find(y=>y.id===m.securityId),known=i.taxable!=null;
  const sale=i.kind==='sale'?saleRefs.get(m):null,vap=i.kind==='vap'?vapRefs.get(m):null,rated=(i.kind==='distribution'||i.kind==='vap')&&isFund(x?.kind);
  const foreign=i.kind==='distribution'&&m.income.foreignTax!=null&&D(m.income.foreignTax)>0n;
  const credit=foreign?S(min(D(m.income.foreignTax),D(m.income.taxable)*D(cap)/D('1'))):null;
  line(ws,[nameOf(i),m.date,kindLabel(i),i.stock?'Aktien':'Allgemein',
   sale?(sale.ok?fx(`B${sale.gross}`,i.gross):'offen'):vap?fx(`${vap.col}${vap.total}`,i.gross):inp(i.gross),
   rated?inp(EXEMPTION[x.kind],'pct0'):'',
   sale?(sale.ok?fx(`K${sale.sum}`,i.exempt):''):rated?fx(r=>`E${r}*F${r}`,i.exempt):'',
   !known?'offen':sale?fx(`L${sale.sum}`,i.taxable):fx(r=>`E${r}-G${r}`,i.taxable),
   !anyEligible||!known||!(sale&&sale.eligible&&protectedStart)?'':fx(r=>r===first?`MIN($B$${protectedStart},B${sale.eligible})`:`MIN($B$${protectedStart}-SUM(I$${first}:I${r-1}),B${sale.eligible})`,i.allowance),
   !known?'':anyEligible?fx(r=>`H${r}-I${r}`,i.taxableAfter??i.taxable):fx(r=>`H${r}`,i.taxableAfter??i.taxable),
   foreign?inp(m.income.foreignTax):'',foreign?fx(r=>`MIN(K${r},H${r}*${cap})`,credit):'',
   sale?'Rechenweg oben (Verkauf)':vap?'Rechenweg oben (Vorabpauschale)':i.kind==='fx'?'Währungskonto, Gewinn nach FIFO laut Kontenblatt':i.kind==='other'?'Abrechnung, nicht nachgerechnet':m.cash?'Barausgleich bei Verschmelzung oder Tausch':'Abrechnung']);
 });
 gap(ws);

 if(r.status==='none')return true;
 if(r.status!=='supported'){note(ws,'Jahresrechnung offen, solange oben Angaben fehlen.');return true;}
 // Jahresrechnung nach § 20 Abs. 6 und § 32d EStG: Verlustverrechnung in der Reihenfolge nach BMF vom 14.05.2025,
 // Rn. 118, dann Sparer-Pauschbetrag, dann Kapitalertragsteuer (e − 4q) ÷ (4 + k) mit Solidaritätszuschlag und Kirchensteuer.
 title(ws,`Jahresrechnung ${year}`);
 const rng=c=>`${c}${first}:${c}${last}`,row={},o=r.offset,j=r.joint;
 const L=(key,label,f,v,opts)=>{row[key]=line(ws,[label,fx(f,v)],opts);return row[key];};
 note(ws,'Reihenfolge nach BMF vom 14.05.2025, Rn. 118: Aktienverluste nur gegen Aktiengewinne; laufende übrige Verluste auch gegen Aktiengewinne; dann der Aktienverlustvortrag gegen verbleibende Aktiengewinne, dann der sonstige Vortrag.');
 L('stocks','Aktienveräußerungen des Jahres',`SUMIF(${rng('D')},"Aktien",${rng('J')})`,o.stocks);
 L('other','Übrige Erträge des Jahres',`SUMIF(${rng('D')},"Allgemein",${rng('J')})`,o.other);
 L('against','Laufende übrige Verluste gegen Aktiengewinne',`IF(B${row.other}<0,MIN(-B${row.other},MAX(0,B${row.stocks})),0)`,o.againstStocks);
 L('otherNet','Übrige Erträge danach',`B${row.other}+B${row.against}`,o.otherNet);
 L('stockCarryUsed','Aktienverlustvortrag, gegen verbleibende Aktiengewinne',`MIN(B${inputs.stockCarry},MAX(0,B${row.stocks})-B${row.against})`,o.stockCarryUsed);
 L('otherCarryUsed','Sonstiger Verlustvortrag',`MIN(B${inputs.otherCarry},MAX(0,B${row.stocks})-B${row.against}-B${row.stockCarryUsed}+MAX(0,B${row.otherNet}))`,o.otherCarryUsed);
 L('after','Nach Verlustverrechnung',`MAX(0,B${row.stocks})-B${row.against}-B${row.stockCarryUsed}+MAX(0,B${row.otherNet})-B${row.otherCarryUsed}`,r.afterLoss);
 if(j){
  // Zusammenveranlagung: Blau die Werte aus dem Rechenweg des Ehegatten (§ 20 Abs. 6 S. 4, Abs. 9 S. 3 EStG; BMF Rn. 273 bis 276).
  note(ws,`Zusammenveranlagung mit ${j.partnerName}: Jeder rechnet erst für sich und zieht seine Hälfte des Sparer-Pauschbetrags ab, ein ungenutzter Teil geht zum anderen. Danach gleichen die verbleibenden Verluste des einen die Erträge des anderen aus – zuerst der Aktienverlust gegen Aktiengewinne, dann der sonstige Verlust. Der Pauschbetrag mindert zuerst die übrigen Erträge. Blau: Werte aus dem Rechenweg von ${j.partnerName}.`);
  row.pPositive=line(ws,[`${j.partnerName}: nach eigener Verlustverrechnung`,inp(j.theirPositive)]);
  row.pHalf=line(ws,[`${j.partnerName}: eigene Hälfte des Sparer-Pauschbetrags`,inp(j.theirHalf)]);
  row.pStockLoss=line(ws,[`${j.partnerName}: verbleibender Aktienverlust`,inp(j.theirStockLoss)]);
  row.pOtherLoss=line(ws,[`${j.partnerName}: verbleibender sonstiger Verlust`,inp(j.theirOtherLoss)]);
  row.pRestStock=line(ws,[`${j.partnerName}: Aktiengewinne nach Sparer-Pauschbetrag`,inp(j.theirRestStock)]);
  row.pRestOther=line(ws,[`${j.partnerName}: übrige Erträge nach Sparer-Pauschbetrag`,inp(j.theirRestOther)]);
  L('transfer',`Ungenutzter Sparer-Pauschbetrag von ${j.partnerName}`,`MAX(0,B${row.pHalf}-B${row.pPositive})`,j.transfer);
  L('allowance','Sparer-Pauschbetrag, eigene Hälfte und ungenutzter Teil des anderen',`MIN(B${row.after},MAX(0,B${inputs.allowance}-B${inputs.external})+B${row.transfer})`,r.allowanceUsed);
  L('otherPart','Davon übrige Erträge',`MAX(0,MAX(0,B${row.otherNet})-B${row.otherCarryUsed})`,r.pots.otherPos);
  L('restOther','Übrige Erträge nach Sparer-Pauschbetrag',`MAX(0,B${row.otherPart}-B${row.allowance})`,j.restOther);
  L('restStock','Aktiengewinne nach Sparer-Pauschbetrag',`B${row.after}-B${row.otherPart}-MAX(0,B${row.allowance}-B${row.otherPart})`,j.restStock);
  L('stockReceived',`Aktienverlust von ${j.partnerName}, nur gegen Aktiengewinne`,`MIN(B${row.pStockLoss},B${row.restStock})`,j.stockReceived);
  L('otherReceived',`Sonstiger Verlust von ${j.partnerName}`,`MIN(B${row.pOtherLoss},B${row.restStock}-B${row.stockReceived}+B${row.restOther})`,j.otherReceived);
  L('taxable','Bemessungsgrundlage',`B${row.restStock}+B${row.restOther}-B${row.stockReceived}-B${row.otherReceived}`,r.taxable,{bold:true});
 }else{
  L('allowance','Sparer-Pauschbetrag',`MIN(B${row.after},MAX(0,B${inputs.allowance}-B${inputs.external}))`,r.allowanceUsed);
  L('taxable','Bemessungsgrundlage',`B${row.after}-B${row.allowance}`,r.taxable,{bold:true});
 }
 let q='0';
 if(r.foreignTax){
  L('creditable','Anrechenbare ausländische Quellensteuer',`SUM(${rng('L')})`,r.foreignTax.creditable);
  if(j){
   row.pUnused=line(ws,[`${j.partnerName}: nicht anrechenbare Quellensteuer (§ 26b EStG; BMF Rn. 276)`,inp(j.theirUnusedForeign)]);
   L('credited','Angerechnet, höchstens ein Viertel der Bemessungsgrundlage, auch vom anderen',`MIN(B${row.creditable},B${row.taxable}/4)+MIN(B${row.pUnused},B${row.taxable}/4-MIN(B${row.creditable},B${row.taxable}/4))`,r.foreignTax.credited);
  }else L('credited','Angerechnet, höchstens ein Viertel der Bemessungsgrundlage',`MIN(B${row.creditable},B${row.taxable}/4)`,r.foreignTax.credited);
  q=`B${row.credited}`;
 }
 L('k','Kirchensteuersatz für das Jahr (Satz × Monate ÷ 12)',`B${inputs.church}*B${inputs.months}/12`,r.churchRate,{});ws.getCell(`B${row.k}`).numFmt='0.0000%';
 L('capital','Kapitalertragsteuer = (e − 4q) ÷ (4 + k), § 32d Abs. 1 S. 4 EStG',`ROUND((B${row.taxable}-4*${q})/(4+B${row.k}),2)`,r.capitalTax);
 L('sol','Solidaritätszuschlag 5,5 %, abgerundet auf Cent',`ROUNDDOWN(B${row.capital}*0.055,2)`,r.solidarity);
 L('church','Kirchensteuer',`ROUND(B${row.capital}*B${row.k},2)`,r.churchTax);
 L('total','Steuer laut Modell',`B${row.capital}+B${row.sol}+B${row.church}`,r.total,{bold:true,fill:FILL.total});
 if(r.bankWithheld!=null){
  const bank=line(ws,['Einbehalten laut Bank',inp(r.bankWithheld)]);
  line(ws,['Erwartete Erstattung (negativ: Nachzahlung)',fx(`B${bank}-B${row.total}`,r.difference)],{bold:true});
 }
 gap(ws);
 title(ws,`Vorträge zum 01.01.${year+1}`);
 const ownStock=`MAX(0,-B${row.stocks})+B${inputs.stockCarry}-B${row.stockCarryUsed}`,ownOther=`MAX(0,-B${row.otherNet})+B${inputs.otherCarry}-B${row.otherCarryUsed}`;
 if(j){
  L('ownStock','Eigener Aktienverlust nach eigener Verrechnung',ownStock,r.pots.stockLoss);
  L('stockGiven',`Davon bei ${j.partnerName} verrechnet`,`MIN(B${row.ownStock},B${row.pRestStock})`,j.stockGiven);
  L('carryStock','Aktienverlust',`B${row.ownStock}-B${row.stockGiven}`,r.carry.stockLoss);
  L('ownOther','Eigener sonstiger Verlust nach eigener Verrechnung',ownOther,r.pots.otherLoss);
  L('otherGiven',`Davon bei ${j.partnerName} verrechnet`,`MIN(B${row.ownOther},B${row.pRestStock}-MIN(B${row.ownStock},B${row.pRestStock})+B${row.pRestOther})`,j.otherGiven);
  L('carryOther','Sonstiger Verlust',`B${row.ownOther}-B${row.otherGiven}`,r.carry.otherLoss);
 }else{
  L('carryStock','Aktienverlust',ownStock,r.carry.stockLoss);
  L('carryOther','Sonstiger Verlust',ownOther,r.carry.otherLoss);
 }
 if(protectedStart&&r.carry.protectedRemaining!=null)L('carryProtected','Rest-Freibetrag Alt-Anteile',anyEligible?`B${protectedStart}-SUM(${rng('I')})`:`B${protectedStart}`,r.carry.protectedRemaining);
 return true;
}
