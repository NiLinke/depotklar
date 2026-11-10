import {generate} from './docs.mjs';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir(new URL('../dist/vendor/',import.meta.url),{recursive:true});
const copy=(from,to)=>copyFile(new URL(`../node_modules/${from}`,import.meta.url),new URL(`../dist/vendor/${to}`,import.meta.url));
await copy('exceljs/dist/exceljs.min.js','exceljs.min.js');
await copy('exceljs/LICENSE','EXCELJS-LICENSE.txt');
// PDF-Ausgabe der Wertpapierblätter: jsPDF mit Tabellen-Plugin, beide MIT.
await copy('jspdf/dist/jspdf.umd.min.js','jspdf.umd.min.js');
await copy('jspdf/LICENSE','JSPDF-LICENSE.txt');
await copy('jspdf-autotable/dist/jspdf.plugin.autotable.min.js','jspdf.plugin.autotable.min.js');
await copy('jspdf-autotable/LICENSE.txt','JSPDF-AUTOTABLE-LICENSE.txt');
console.log('Depotklar erstellt. Excel- und PDF-Module lokal in dist/vendor eingebunden.');

await generate();
