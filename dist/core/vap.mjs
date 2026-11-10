import {D,S,mul,div,min,max,round} from './decimal.mjs';
import {baseRate} from './rules.mjs';

// Vorabpauschale nach § 18 InvStG für eine Position mit den Werten zu Beginn
// und Ende des Kalenderjahres. Basisertrag = Wert zu Beginn × 70 % × Basiszins,
// begrenzt auf Wertsteigerung plus Ausschüttungen, abzüglich Ausschüttungen; im
// Erwerbsjahr um ein Zwölftel je vollem Monat vor dem Erwerbsmonat gemindert.
export function vapAmount({startValue,endValue,distributions='0',rate,acquisitionMonth=1}){
 if(!Number.isInteger(acquisitionMonth)||acquisitionMonth<1||acquisitionMonth>12)throw Error('Erwerbsmonat 1 bis 12.');
 const start=D(startValue),end=D(endValue),dist=D(distributions),r=D(rate);
 const base=mul(mul(start,D('0.7')),r);
 const capped=max(0n,min(base,max(0n,end-start+dist)));
 const gross=max(0n,capped-dist)*BigInt(13-acquisitionMonth)/12n;
 return {base:S(round(base)),capped:S(round(capped)),amount:S(round(gross))};
}

// Erster und letzter im Kalenderjahr festgesetzter Rücknahmepreis (§ 18 Abs. 1
// S. 2 und 3 InvStG). Beginn: erster Kurs bis 15. Januar, Ende: letzter Kurs im
// Dezember. Der Dezemberkurs des Vorjahres ersetzt den Jahresanfang nicht – er
// weicht vom ersten Kurs des neuen Jahres ab.
export function yearPrices(prices,securityId,year){
 const own=prices.filter(p=>p.securityId===securityId).sort((a,b)=>a.date.localeCompare(b.date));
 const inRange=(from,to)=>own.filter(p=>p.date>=from&&p.date<=to);
 const end=inRange(`${year}-12-01`,`${year}-12-31`).at(-1)||null,start=inRange(`${year}-01-01`,`${year}-01-15`)[0]||null;
 return {start:start?{date:start.date,price:start.price}:null,end:end?{date:end.date,price:end.price}:null};
}

// Je Anteil und Jahr, ungerundet. Ausschüttungen je Anteil kommen aus der
// Fortschreibung. Ohne beide Kurse kein Ergebnis. factorAfter(Datum) rechnet einen Kurs
// auf die Stücke nach einem späteren Split im selben Jahr um.
// rule: Basiszins des Jahres, hinterlegt oder unter „Kurse“ eingetragen (baseRateOf).
export function vapPerUnit(prices,securityId,year,distributionPerUnit='0',{factorAfter=null,rule=baseRate(year)}={}){
 if(!rule)return {status:'unsupported',reason:`Basiszins ${year} fehlt – unter „Kurse“ eintragen (das BMF veröffentlicht ihn Anfang Januar) oder die Vorabpauschale laut Bank erfassen.`};
 if(D(rule.rate)<=0n)return {status:'zero',perUnit:'0',rule};
 const p=yearPrices(prices,securityId,year);
 if(!p.start||!p.end)return {status:'missing',rule,prices:p,reason:`Vorabpauschale ${year}: ${!p.start&&!p.end?'erster und letzter Kurs des Jahres fehlen':!p.start?'erster Kurs des Jahres (Anfang Januar) fehlt':'letzter Kurs des Jahres (Dezember) fehlt'}.`};
 const fs=factorAfter?factorAfter(p.start.date):D('1'),fe=factorAfter?factorAfter(p.end.date):D('1');
 const start=div(D(p.start.price),fs),end=div(D(p.end.price),fe),dist=D(distributionPerUnit),r=D(rule.rate);
 const base=mul(mul(start,D('0.7')),r),capped=max(0n,min(base,max(0n,end-start+dist)));
 return {status:'computed',perUnit:S(max(0n,capped-dist)),rule,prices:p,split:fs!==D('1')||fe!==D('1'),start:S(start),end:S(end),distributions:S(dist)};
}
