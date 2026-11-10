import test from 'node:test';
import assert from 'node:assert/strict';
import {demoState} from '../dist/core/sample.mjs';
import {statement,periodStatement} from '../dist/core/statement.mjs';
import {sheetHTML} from '../dist/ui/sheet.mjs';
import {sheetRows} from '../dist/ui/xlsx.mjs';

// Ausschüttungen und Dividenden stehen je Depot in der Jahresübersicht, ohne einen Bestand zu bewegen.
test('distributions and dividends are listed per depot next to interest, without moving any holding',()=>{
 const s=demoState();
 const st=statement(s,'d1',2025,'tax');
 assert.deepEqual(st.income.map(i=>[i.date,i.name,i.label,i.gross,i.exempt,i.taxable]),[['2025-05-15','Fiktiver Mischfonds Alt','Ausschüttung','4000','600','3400']]);
 // Der Bestand bleibt unberührt: Anfang + Vorgänge = Ende, ohne die Ausschüttung.
 assert.equal(st.balanced,true);assert.ok(st.rows.every(r=>r.lines.every(l=>l.type!=='distribution')));
 let html=sheetHTML(s,{year:2025,from:2025,personId:'p1',view:'both'});
 assert.match(html,/<h3>Erträge 2025<\/h3>/);assert.match(html,/Fiktiver Mischfonds Alt<small>Ausschüttung<\/small>/);assert.match(html,/3\.400,00/);
 html=sheetHTML(s,{year:2026,from:2026,personId:'p1',view:'both'});
 assert.match(html,/Fiktive Software Inc\.<small>Dividende<\/small>/);assert.match(html,/12,66/);
 // Mit Wertpapierfilter nur dessen Erträge; über mehrere Jahre alle Jahre.
 assert.deepEqual(periodStatement(s,'d1',2024,2025,'tax',{securityId:'mf'}).income.map(i=>i.date),['2024-05-15','2025-05-15']);
 assert.deepEqual(periodStatement(s,'d1',2024,2025,'tax',{securityId:'af'}).income,[]);
 const rows=sheetRows(s,'d1',{from:2025,to:2025});
 assert.ok(rows.some(r=>r[0]==='Erträge 2025'));assert.ok(rows.some(r=>r[0]==='Fiktiver Mischfonds Alt'&&r[2]==='Ausschüttung'&&r[5]===3400));assert.ok(rows.some(r=>r[0]==='Summe Erträge'&&r[3]===4000));
});
