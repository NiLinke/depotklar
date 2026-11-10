import TABLE from '../rates/vat.mjs';

// Umsatzsteuer-Umrechnungskurse des BMF nach § 16 Abs. 6 UStG: Monatsdurchschnitte, Fremdwährung je 1 EUR.
// Hinterlegt sind die veröffentlichten Monate. Für spätere gilt, was der Anwender unter „Kurse“ einträgt (vatRates im Tresor),
// sonst vorläufig das Monatsmittel der EZB-Referenzkurse. Ein amtlicher Wert hat immer Vorrang.
// Steuerlich gilt weiter der Kurs am Tag des Geschäfts, siehe rules.mjs.
export const VAT_SOURCE=TABLE.source,VAT_LEGAL=TABLE.legal,VAT_FROM=TABLE.from,VAT_UNTIL=TABLE.to,VAT_FIRST_YEAR=Number(TABLE.from.slice(0,4));
export function publishedVatRate(currency,month){
 const year=TABLE.rates[currency]?.[month.slice(0,4)];
 return year?year.split(',')[Number(month.slice(5,7))-1]||null:null;
}
// USD und HUF fehlen im BMF-Datensatz für 2010 bis 2014; dort steht das Monatsmittel der EZB-Referenzkurse.
export const isDerivedVatRate=(currency,month)=>Boolean(TABLE.derived?.[currency]?.includes(Number(month.slice(0,4))));
export const provisionalVatRate=(currency,month)=>TABLE.provisional?.[currency]?.[month]??null;
export const vatRateOf=(s,currency,month)=>publishedVatRate(currency,month)??s?.vatRates?.[currency]?.[month]??provisionalVatRate(currency,month);
export const isProvisionalVatRate=(s,currency,month)=>publishedVatRate(currency,month)==null&&s?.vatRates?.[currency]?.[month]==null&&provisionalVatRate(currency,month)!=null;
