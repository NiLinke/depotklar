// Gesetzliche Werte mit Quelle. Dauerrecht gilt über das letzte hinterlegte Jahr hinaus,
// bis der Gesetzgeber es ändert. Ein jährlich neu festgesetzter Wert (Basiszins) wird nie geerbt.
import {D,mul,div,round} from './decimal.mjs';
export const RULESET='DE-privat-2018-2026.15';
export const VERIFIED_AT='2026-11-09';

const evaluation='https://www.bundesfinanzministerium.de/Content/DE/Downloads/Steuern/Evaluierungsberichte/evaluation-investmentsteuerreform-abschlussbericht.pdf?__blob=publicationFile&v=2';
const bmf='https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/';

// Basiszins nach § 18 Abs. 4 InvStG und Zuflusstag der Vorabpauschale (erster
// Werktag des Folgejahres, § 18 Abs. 3 InvStG).
export const BASE_RATES=Object.freeze(Object.fromEntries([
 [2018,'0.0087','2019-01-02',evaluation],
 [2019,'0.0052','2020-01-02',evaluation],
 [2020,'0.0007','2021-01-04',evaluation],
 [2021,'-0.0045','2022-01-03',evaluation],
 [2022,'-0.0005','2023-01-02',evaluation],
 [2023,'0.0255','2024-01-02',evaluation],
 [2024,'0.0229','2025-01-02',bmf+'2024-01-05-basiszins-zur-berechnung-der-vorabpauschale-gemaess-paragraf-18-absatz-4-InvStG-basiszins-zum-2-Januar-2024.pdf?__blob=publicationFile&v=1'],
 [2025,'0.0253','2026-01-02',bmf+'2025-01-10-basiszins-vorabpauschale-zum-2-1-2025.pdf?__blob=publicationFile&v=2'],
 [2026,'0.032','2027-01-04',bmf+'2026-01-13-basiszins-berechnung-vorabpauschale.pdf?__blob=publicationFile&v=4']
].map(([year,rate,inflow,source])=>[year,Object.freeze({year,rate,inflow,source})])));
export const baseRate=year=>Object.hasOwn(BASE_RATES,year)?BASE_RATES[year]:null;

// Persönliche Jahresrechnung nach § 32d EStG: freigegebene Kalenderjahre und
// Sparer-Pauschbetrag (§ 20 Abs. 9 EStG) bei Einzelveranlagung.
export const TAX_YEARS=Object.freeze(Object.fromEntries(Array.from({length:9},(_,i)=>{
 const year=2018+i;
 return [year,Object.freeze({year,allowance:year<=2022?'801':'1000',
  source:year<=2022?'https://www.gesetze-im-internet.de/estg/__20.html':'https://esth.bundesfinanzministerium.de/esth/2024/tabellarische-Uebersicht/Sparer-Pauschbetrag.html'})];
})));
export const taxYear=year=>Object.hasOwn(TAX_YEARS,year)?TAX_YEARS[year]:null;
export const TARIFF_SOURCE='https://www.gesetze-im-internet.de/estg/__32d.html';
// Abgeltungsteuer nach § 32d Abs. 1 EStG: (e − 4q)/(4 + k); Solidaritätszuschlag 5,5 %, abgerundet; Kirchensteuer k × Kapitalertragsteuer.
export function taxOn(e,k,q=0n){const capital=round(div(e-mul(D('4'),q),D('4')+k)),sol=round(mul(capital,D('0.055')),2,'floor'),church=round(mul(capital,k));return {capital,sol,church,total:capital+sol+church};}
// Fremdwährung: Steuerlich gilt der Kurs im Zeitpunkt des Geschäfts (§ 20 Abs. 4 S. 1 EStG; Devisenbriefkurs am Tag des Zuflusses,
// BMF vom 14.05.2025, Rn. 247). Die monatlichen Umsatzsteuer-Umrechnungskurse sind für die Umsatzsteuer festgesetzt (§ 16 Abs. 6 UStG);
// R 34c Abs. 1 S. 2 EStR lässt sie als Vereinfachung nur für ausländische Steuern zu. Depotklar nutzt sie deshalb nur für die Buchhaltung.
// Anrechenbare ausländische Steuer höchstens 25 % des einzelnen steuerpflichtigen
// Kapitalertrags, wirksam über q in (e − 4q)/(4 + k) (§ 32d Abs. 1 S. 4, Abs. 5 S. 1 EStG).
// Bei Investmenterträgen zählt der Ertrag nach Teilfreistellung (BMF vom 14.05.2025, Rz. 148).
export const FOREIGN_TAX_CAP='0.25';
// Anrechenbar ist nur die Quellensteuer nach Abzug eines Ermäßigungsanspruchs (§ 32d Abs. 5 S. 1
// EStG). Nach den meisten DBA sind das auf Dividenden höchstens 15 %; ein höherer Abzug ist im
// Quellenstaat zu erstatten (BZSt, Anrechenbarkeit der Quellensteuer, Stand 01.01.2024: etwa
// Schweiz 35 % → 15 %, Dänemark 27 % → 15 %). Depotklar kennt den Staat nicht und weist nur darauf hin.
export const TREATY_RATE='0.15';
export const TREATY_SOURCE='https://www.bzst.de/SharedDocs/Downloads/DE/EU_OECD/anrechenbare_ausl_quellensteuer_2024.pdf?__blob=publicationFile&v=3';
// Anrechnung höchstens bis zur deutschen Steuer auf die ausländischen Erträge (§ 32d Abs. 5 S. 3
// EStG); Verluste werden zwingend vorher verrechnet, ohne Wahlrecht (BFH vom 23.11.2021, VIII R 22/18).
export const FOREIGN_LOSS_SOURCE='https://www.bundesfinanzhof.de/de/entscheidung/entscheidungen-online/detail/STRE202210050/';
// Ersatzbemessungsgrundlage: Fehlen der Bank die Anschaffungsdaten, setzt sie 30 % der Einnahmen
// aus der Veräußerung als Gewinn an (§ 43a Abs. 2 S. 7 EStG); korrigiert wird in der Veranlagung.
export const SUBSTITUTE_RATE='0.3';
export const SUBSTITUTE_SOURCE='https://www.gesetze-im-internet.de/estg/__43a.html';
export const ABGELTUNG_BMF='https://amtliche-handbuecher.bundesfinanzministerium.de/esth/2025/B-Anhaenge/Anhang-19/II/anhang-19-II.html';
// Kirchensteuerpflicht nur für einen Teil des Jahres: Satz gezwölftelt, auch für k in
// der Formel der Kapitalertragsteuer (BMF vom 14.05.2025, Rz. 133).
export const churchMonths=y=>y?.churchUntil!=null?y.churchUntil:y?.churchFrom!=null?13-y.churchFrom:12;

export const KINDS=Object.freeze({
 stock:'Aktie',
 equityFund:'Aktienfonds',
 mixedFund:'Mischfonds',
 realEstate:'Immobilienfonds',
 foreignRealEstate:'Auslands-Immobilienfonds',
 otherFund:'Sonstiger Fonds',
 bond:'Anleihe / Zertifikat',
 commodity:'ETC mit Rohstoffanspruch'
});
// Teilfreistellung für Privatanleger nach § 20 Abs. 1 bis 3 InvStG.
export const EXEMPTION=Object.freeze({stock:'0',equityFund:'0.3',mixedFund:'0.15',realEstate:'0.6',foreignRealEstate:'0.8',otherFund:'0',bond:'0',commodity:'0'});
export const EXEMPTION_SOURCE='https://www.gesetze-im-internet.de/invstg_2018/__20.html';
// Keine Investmentfonds: Aktien, Anleihen und Zertifikate (§ 20 Abs. 2 S. 1 Nr. 7 EStG, auch ETCs ohne
// hinterlegten Rohstoff) und ETCs mit Anspruch auf den hinterlegten Rohstoff (BMF vom 14.05.2025, Rn. 57).
const NOT_FUNDS=Object.freeze(['stock','bond','commodity']);
export const isFund=kind=>!NOT_FUNDS.includes(kind);

// Erwerbsgruppen bestimmen das Regime eines Loses.
export const GROUPS=Object.freeze({pre2009:'vor 2009',from2009:'2009 bis 2017',from2018:'ab 2018'});
export const groupOf=date=>date<'2009-01-01'?'pre2009':date<'2018-01-01'?'from2009':'from2018';
// Erstes Steuerjahr des Modells: Das InvStG 2018 gilt ab 01.01.2018; Jahre davor rechnet
// Depotklar nicht nach (Verkäufe vor 2018 mit dem Gewinn laut Bank, § 56 InvStG).
export const FIRST_TAX_YEAR=2018;
export const REGIMES=Object.freeze({
 stockPre2009:'Aktie vor 2009 · Gewinn steuerfrei',
 fundPre2009:'Fonds vor 2009 · bestandsgeschützter Alt-Anteil',
 fund2009:'Fonds 2009 bis 2017 · fiktive Veräußerung 2017',
 regular:'Regulär',
 bondPre2009:'Anleihe oder Zertifikat vor 2009 · Übergangsregel nicht abgebildet',
 commodity:'ETC mit Rohstoffanspruch · privates Veräußerungsgeschäft'
});
export function regimeOf(kind,group){
 if(kind==='commodity')return 'commodity';
 if(kind==='bond')return group==='pre2009'?'bondPre2009':'regular';
 if(kind==='stock')return group==='pre2009'?'stockPre2009':'regular';
 return group==='pre2009'?'fundPre2009':group==='from2009'?'fund2009':'regular';
}
// Private Veräußerungsgeschäfte: Freigrenze für den Gesamtgewinn eines Jahres
// (§ 23 Abs. 3 S. 5 EStG), 600 € bis 2023, 1.000 € ab 2024 (Wachstumschancengesetz).
export function privateSalesLimit(year){return year>=2024?'1000':'600';}
export const FX_SOURCES=Object.freeze({
 privateSales:'https://www.gesetze-im-internet.de/estg/__23.html',
 capital:'https://www.gesetze-im-internet.de/estg/__20.html',
 bmf:'https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Abgeltungsteuer/2022-05-19-einzelfragen-zur-abgeltungsteuer.html'
});
// Steuerbescheinigung (BMF vom 16.05.2025): Gewinne aus bestandsgeschützten Alt-Anteilen ohne Saldierung
// mit Verlusten ausweisen (Rn. 30); akkumulierte ausschüttungsgleiche Erträge ausländischer thesaurierender
// Fonds sind keine Kapitalerträge im Veräußerungszeitpunkt, sondern ein nachholender Steuerabzug, und in der
// Erklärung abzuziehen (Rn. 28, § 56 Abs. 3 S. 6 InvStG).
export const CERTIFICATE_SOURCE='https://www.bzst.de/SharedDocs/Downloads/DE/MiKaDiv/ausstellung_steuerbescheinigung.pdf?__blob=publicationFile&v=7';
// Verschmelzung (§ 23 InvStG): Vorabpauschale im Verschmelzungsjahr nur auf die Anteile am übernehmenden Fonds,
// deren Erwerb als Erwerb im Sinne des § 18 Abs. 2 InvStG gilt; zum 31.12. mit den Werten des untergegangenen
// Fonds (BMF-Anwendungsschreiben zum InvStG vom 21.05.2019, Abschnitt zu § 23).
// ETC mit Anspruch nur auf den hinterlegten Rohstoff oder den Erlös aus seinem Verkauf: keine Kapitalforderung,
// sondern Sachleistungsanspruch; ggf. privates Veräußerungsgeschäft nach § 23 Abs. 1 S. 1 Nr. 2 EStG. Ohne
// physische Deckung: Einkünfte nach § 20 Abs. 2 S. 1 Nr. 7 EStG (BMF vom 14.05.2025, Rn. 57; BFH vom 12.05.2015,
// VIII R 35/14, und vom 16.06.2020, VIII R 7/17). Vor 2009 angeschafft: § 52 Abs. 28 S. 15 bis 17 EStG, nicht abgebildet.
export const COMMODITY_SOURCE=ABGELTUNG_BMF;
// Verschmelzung mit anderem Teilfreistellungssatz: fiktive Veräußerung zum Rücknahmepreis des Zielfonds, der Gewinn gilt
// erst beim tatsächlichen Verkauf als zugeflossen und trägt die Teilfreistellung des alten Fonds (§ 22 InvStG; BMF vom
// 21.05.2019, Rz. 22.11, 23.23, 23.24). Grenzüberschreitend gilt § 23 InvStG nicht: Verkauf und Neukauf (Rz. 23.6, 23.27).
// Barzahlung: Ertrag mit der Teilfreistellung des alten Fonds (§ 23 Abs. 3 S. 3 InvStG; Rz. 23.22). Aktientausch: § 20 Abs. 4a
// S. 1, 2 EStG; Altaktien bleiben bestandsgeschützt, Barzahlung über 10 % des Börsenkurses: Tausch (BMF vom 14.05.2025, Rn. 100, 100a).
// Zusammenveranlagung: gemeinsamer Verlustausgleich (§ 20 Abs. 6 S. 3 EStG), gemeinsamer Sparer-Pauschbetrag, je Ehegatte
// zur Hälfte, ein ungenutzter Teil beim anderen (§ 20 Abs. 9 S. 2, 3 EStG). Bei derselben Bank verrechnet sie nur mit
// gemeinsamem Freistellungsauftrag über beide Ehegatten (BMF vom 14.05.2025, Rn. 219, 266).
export const JOINT_SOURCE='https://www.gesetze-im-internet.de/estg/__20.html';
export const MERGER_SOURCE='https://www.gesetze-im-internet.de/invstg_2018/__22.html';
export const MERGER_VAP_SOURCE='https://www.bzst.de/SharedDocs/BMF/DE/Downloads/bmf_schreiben_20190521_InvStG_18_anwendungsfragen.pdf?__blob=publicationFile&v=1';
export const PROTECTED_ALLOWANCE='100000';
export const PROTECTED_SOURCE='https://www.gesetze-im-internet.de/invstg_2018/__56.html';
// Verlust ab 2018 bei Fonds 2009–2017: keine Teilfreistellung, soweit er aus dem Kurs
// 31.12.2017 über den historischen Anschaffungskosten folgt (angewendet in sale.mjs).
export const STEP_UP_LOSS_SOURCE='https://www.bundesfinanzhof.de/de/entscheidung/entscheidungen-online/detail/STRE202610013/';

// Schenkungsteuer: persönliche Freibeträge nach § 16 Abs. 1 ErbStG, alle
// Steuerklasse I (§ 15 Abs. 1 ErbStG), Tarif § 19 ErbStG mit Härteausgleich.
export const RELATIONS=Object.freeze({
 child:{label:'Kind',allowance:'400000'},
 grandchild:{label:'Enkel',allowance:'200000'},
 // Kinder verstorbener Kinder erhalten den Freibetrag eines Kindes (§ 16 Abs. 1 Nr. 2 ErbStG).
 grandchildOfDeceased:{label:'Enkel, Elternteil verstorben',allowance:'400000'},
 spouse:{label:'Ehegatte',allowance:'500000'}
});
export const GIFT_TAX_YEARS=Object.freeze([2026]);
export const GIFT_SOURCES=Object.freeze({
 allowance:'https://www.gesetze-im-internet.de/erbstg_1974/__16.html',
 tariff:'https://www.gesetze-im-internet.de/erbstg_1974/__19.html',
 aggregation:'https://www.gesetze-im-internet.de/erbstg_1974/__14.html'
});
export const CLASS_I=Object.freeze({limits:['75000','300000','600000','6000000','13000000','26000000'],rates:['0.07','0.11','0.15','0.19','0.23','0.27','0.30']});

// Folgejahre: Sparer-Pauschbetrag (§ 20 Abs. 9 EStG), Abgeltungsteuer, Solidaritätszuschlag, Teilfreistellungen, Freigrenze und
// Schenkungsteuer sind Dauerrecht ohne Befristung und gelten weiter, bis der Gesetzgeber sie ändert. Nur der Basiszins wird jedes
// Jahr neu festgesetzt (§ 18 Abs. 4 InvStG): Er bleibt offen, bis er unter „Kurse“ eingetragen ist (yearRules im Tresor).
// Dort lässt sich auch ein geänderter Sparer-Pauschbetrag eintragen; er gilt ab seinem Jahr. Hinterlegte Werte mit Quelle haben Vorrang.
export const LAST_RULE_YEAR=Math.max(...Object.keys(TAX_YEARS).map(Number));
export const LAST_RATE_YEAR=Math.max(...Object.keys(BASE_RATES).map(Number));
// Zufluss der Vorabpauschale am ersten Werktag des Folgejahres (§ 18 Abs. 3 InvStG): wie in den
// BMF-Tabellen der erste Tag von Montag bis Freitag nach Neujahr.
export function inflowDate(year){const d=new Date(Date.UTC(year+1,0,2));while(d.getUTCDay()===0||d.getUTCDay()===6)d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
const confirmedRules=(s,year)=>s?.yearRules?.[year]??null;
export function taxYearOf(s,year){
 if(Object.hasOwn(TAX_YEARS,year))return TAX_YEARS[year];
 if(!(year>LAST_RULE_YEAR))return null;
 for(let y=year;y>LAST_RULE_YEAR;y--){const r=confirmedRules(s,y);if(r?.allowance!=null)return {year,allowance:String(r.allowance),source:null,confirmed:true};}
 const {allowance,source}=TAX_YEARS[LAST_RULE_YEAR];
 return {year,allowance,source,continued:true};
}
export function baseRateOf(s,year){
 if(Object.hasOwn(BASE_RATES,year))return BASE_RATES[year];
 const r=year>LAST_RATE_YEAR?confirmedRules(s,year):null;
 return r?.baseRate!=null?{year,rate:String(r.baseRate),inflow:inflowDate(year),source:null,confirmed:true}:null;
}
export const vapInflow=year=>Object.hasOwn(BASE_RATES,year)?BASE_RATES[year].inflow:Number.isInteger(year)&&year>LAST_RATE_YEAR?inflowDate(year):null;
// Jahre der Vorabpauschale mit Zufluss bis until, aufsteigend. Ein Folgejahr ohne Basiszins
// steht mit rate null darin: Seine Vorabpauschale ist offen, nicht null.
export function vapYears(s,until){
 const out=Object.values(BASE_RATES).filter(r=>r.inflow<=until);
 for(let y=LAST_RATE_YEAR+1;y<=2100&&inflowDate(y)<=until;y++)out.push(baseRateOf(s,y)||{year:y,rate:null,inflow:inflowDate(y),source:null,missing:true});
 return out;
}
export const giftYearOf=year=>GIFT_TAX_YEARS.includes(year)||year>LAST_RULE_YEAR;
