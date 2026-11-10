import {KINDS,EXEMPTION,isFund} from '../core/rules.mjs';
import {D,S,mul,round} from '../core/decimal.mjs';

// Werte für die Steuererklärung, gemeinsam für Steuerseite, Excel und PDF. Zeilennummern
// stammen aus den Formularen 2025 und wechseln je Jahr – maßgeblich ist die Bezeichnung
// (ELSTER-Ausfüllhilfe Einkommensteuer 2025, Anlagen KAP, KAP-INV und Sonstiges).
const FUNDS=Object.keys(KINDS).filter(isFund);
const nonzero=v=>v!=null&&Number(v)!==0;

export function filingSections(r){
 const out=[];
 if(r.kap?.known){
  const kinds=FUNDS.filter(k=>nonzero(r.kap.protectedGain[k])||nonzero(r.kap.deemedGain[k])||nonzero(r.kap.accumulated?.[k]));
  if(kinds.length)out.push({title:'Deutsche Depots · Anlage KAP',
   note:'Die Bank versteuert alles selbst, wendet aber den Freibetrag für bestandsgeschützte Alt-Anteile nicht an. Dafür die Gewinne aus der Veräußerung bestandsgeschützter Alt-Anteile laut Steuerbescheinigung in die Anlage KAP übernehmen (Formular 2025: Zeile 10). Ausgewiesen wird die Summe der Gewinne je Verkauf, ohne Saldierung mit Verlusten aus Alt-Anteilen (BMF vom 16.05.2025, Rn. 30); Depotklar rechnet sie zum Abgleich vor. Fiktive Gewinne 2017 hat die Bank schon versteuert; sie erhalten weder Teilfreistellung noch Freibetrag. Akkumulierte ausschüttungsgleiche Erträge (altes Recht) sind in den bescheinigten Kapitalerträgen enthalten, aber keine Einkünfte des Verkaufsjahres: von den bescheinigten Kapitalerträgen abziehen, ein negativer Betrag gehört 2025 in Zeile 12 (BMF vom 16.05.2025, Rn. 28).',
   head:['Fondsart','Alt-Anteile vor Teilfreistellung','Alt-Anteile nach Teilfreistellung','Fiktiver Gewinn 2017','Akkumulierte Erträge abziehen'],
   rows:kinds.map(k=>[KINDS[k],r.kap.protectedGain[k],r.kap.protectedGainAfterExemption[k],r.kap.deemedGain[k],r.kap.accumulated?.[k]??'0'])});
 }
 if(r.status==='supported'&&r.protectedStart!=null&&(nonzero(r.protectedUsed)||nonzero(r.protectedEligible)))out.push({title:'Freibetrag bestandsgeschützte Alt-Anteile',
  note:'Wurde zum Ende des Vorjahres ein verbleibender Freibetrag festgestellt, das in der Anlage Sonstiges ankreuzen (Formular 2025: Zeile 20); das Finanzamt rechnet ihn an und stellt den neuen Rest fest.',
  head:['Angabe','Betrag'],rows:[['Rest-Freibetrag 01.01.',r.protectedStart],['Genutzt',r.protectedUsed],['Rest 31.12.',r.protectedRemaining]]});
 if(r.abroad&&!r.abroad.known)out.push({title:'Depots ohne deutschen Steuerabzug',note:'Die Werte für Anlage KAP und KAP-INV sind offen, solange ein Verkauf oder Währungsgewinn nicht ermittelt ist – siehe Hinweise oben.',head:[],rows:[]});
 let abroadDeclared=false;
 if(r.abroad?.known){
  const k=r.abroad.kap;
  if([k.income,k.stockGains,k.otherLosses,k.stockLosses,k.foreignTax].some(nonzero)){abroadDeclared=true;out.push({title:'Depots ohne deutschen Steuerabzug · Anlage KAP',
   note:'Kapitalerträge, die nicht dem inländischen Steuerabzug unterlegen haben, ohne Investmentfonds (Formular 2025: ausländische Kapitalerträge Zeile 19, darin Aktiengewinne Zeile 20, Verluste ohne Aktien Zeile 22, Aktienverluste Zeile 23; noch nicht angerechnete ausländische Steuer Zeile 41).',
   head:['Angabe','Betrag'],rows:[['Ausländische Kapitalerträge',k.income],['darin Gewinne aus Aktienveräußerungen',k.stockGains],['darin Verluste ohne Verluste aus Aktien',k.otherLosses],['darin Verluste aus Aktienveräußerungen',k.stockLosses],['Noch nicht angerechnete ausländische Steuer',k.foreignTax]]});}
  const inv=r.abroad.inv,used=FUNDS.filter(f=>['distributions','vaps','gains','protectedGains','deemed'].some(x=>nonzero(inv[x][f])));
  if(used.length){abroadDeclared=true;out.push({title:'Depots ohne deutschen Steuerabzug · Anlage KAP-INV',
   note:'Je Fondsart vor Teilfreistellung; die Teilfreistellung rechnet das Finanzamt (Formular 2025: Ausschüttungen einschließlich einbehaltener ausländischer Steuer Zeilen 4–8, Vorabpauschalen 9–13, Veräußerungsgewinne 14, 17, 20, 23, 26, darin bestandsgeschützte Alt-Anteile 15, 18, 21, 24, 27, fiktive Veräußerung 2017 16, 19, 22, 25, 28). Alt-Anteile: Summe der Gewinne je Verkauf, ohne Saldierung mit Verlusten.',
   head:['Fondsart','Ausschüttungen','Vorabpauschalen','Veräußerungsgewinne','darin Alt-Anteile vor 2009','Fiktiver Gewinn 2017'],
   rows:used.map(f=>[KINDS[f],inv.distributions[f],inv.vaps[f],inv.gains[f],inv.protectedGains[f],inv.deemed[f]])});}
  const old=FUNDS.filter(f=>nonzero(inv.oldIncome[f]));
  if(old.length)out.push({title:'Akkumulierte ausschüttungsgleiche Erträge (altes Recht)',note:'Nicht im Verkaufsjahr erklären: Sie gelten als in den Jahren bis 2017 zugeflossen und waren dort zu versteuern; beim Verkauf holt eine deutsche Bank nur den Steuerabzug nach (§ 56 Abs. 3 S. 6 InvStG; BMF vom 16.05.2025, Rn. 28). Wurden sie damals nicht erklärt, sind diese Jahre zu berichtigen.',head:['Fondsart','Betrag'],rows:old.map(f=>[KINDS[f],inv.oldIncome[f]])});
 }
 // Sparer-Pauschbetrag: in Anspruch genommen über Freistellungsaufträge, nicht der offene Rest (ELSTER-Anleitung 2025).
 if(abroadDeclared)out.push({title:'Sparer-Pauschbetrag · Anlage KAP',
  note:'In den Zeilen 16 und 17 den Sparer-Pauschbetrag eintragen, der über Freistellungsaufträge bereits in Anspruch genommen wurde – laut Steuerbescheinigungen, gegebenenfalls 0 –, nicht den noch offenen Rest. Bei Erträgen ohne deutschen Steuerabzug und bei der Anlage KAP-INV ist die Angabe in Zeile 17 immer nötig, außer bei beantragter Günstigerprüfung (ELSTER-Anleitung zur Anlage KAP 2025).',head:[],rows:[]});
 // Verlust ab 2018 ohne Teilfreistellung (BFH vom 25.11.2025, VIII R 22/23): Das Formular kennt ihn nicht.
 const lossRows=(values,label)=>FUNDS.filter(f=>nonzero(values?.[f])&&Number(EXEMPTION[f])>0).map(f=>[`${label} · ${KINDS[f]}`,values[f],S(round(mul(D(values[f]),D(EXEMPTION[f]))))]);
 const losses=[...lossRows(r.kap?.known?r.kap.lossWithoutExemption:null,'Deutsches Depot'),...lossRows(r.abroad?.known?r.abroad.inv.lossWithoutExemption:null,'Ohne deutschen Steuerabzug')];
 if(losses.length)out.push({title:'Verlust ohne Teilfreistellung (BFH vom 25.11.2025, VIII R 22/23)',
  note:'Für diesen Teil des Verlusts aus Fonds 2009 bis 2017 gilt keine Teilfreistellung, weil er nur aus dem Kurs 31.12.2017 über den ursprünglichen Anschaffungskosten folgt. Die Formulare kennen das nicht: Ohne deutschen Steuerabzug stellt das Finanzamt die Veräußerungsgewinne der Anlage KAP-INV insgesamt teilweise frei, Banken rechnen teils ebenso. In den ergänzenden Angaben zur Steuererklärung den Betrag mit dem Urteil erläutern, bei deutschen Depots dazu in der Anlage KAP die Überprüfung des Steuereinbehalts beantragen. Ohne Erläuterung sind die Einkünfte um die letzte Spalte zu hoch.',
  head:['Depot · Fondsart','Verlust ohne Teilfreistellung','Ohne Erläuterung zu hoch'],rows:losses});
 if(r.foreignTax&&nonzero(r.foreignTax.creditable))out.push({title:'Ausländische Quellensteuer',
  note:'Was die Bank schon angerechnet hat, steht in der Steuerbescheinigung (Anlage KAP, Formular 2025: Zeile 40); noch nicht angerechnete Steuer in Zeile 41, nicht in der Anlage AUS.',
  head:['Angabe','Betrag'],rows:[['Anrechenbar laut Modell',r.foreignTax.creditable],['Davon in der Jahresrechnung angerechnet',r.foreignTax.credited]]});
 return out;
}
