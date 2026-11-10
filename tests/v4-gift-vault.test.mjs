import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {emptyState,validate} from '../dist/core/model.mjs';
import {replay} from '../dist/core/ledger.mjs';
import {classITax,giftAssessments,remainingAllowance} from '../dist/core/gifttax.mjs';
import {newSession,seal,open,rekey,save,load,remove,ITERATIONS} from '../dist/core/vault.mjs';
import {demoState} from '../dist/core/sample.mjs';

test('the class I tariff keeps rounding to full hundreds, bands and hardship relief as in version 3',()=>{
 for(const [value,taxable,tax] of [['74950','74900','5243'],['75000','75000','5250'],['75099','75000','5250'],['75100','75100','5300'],['82000','82000','8750'],
  ['300050','300000','33000'],['600000','600000','90000'],['700000','700000','133000'],['6000100','6000100','1140050'],['13000000','13000000','2990000'],['30000000','30000000','9000000']])
  assert.deepEqual(classITax(value),{taxable,tax},value);
});

function family({value='500000',prior=null,relation='child',price=true}={}){
 const s=emptyState();
 s.persons=[{id:'v',name:'Vater'},{id:'k',name:'Kind'}];if(relation)s.relations=[{donorId:'v',recipientId:'k',kind:relation}];
 s.depots=[{id:'dv',personId:'v',bank:'B',name:'Vater'},{id:'dk',personId:'k',bank:'B',name:'Kind'}];s.securities=[{id:'a',isin:'A',name:'Aktie',kind:'stock'}];
 s.events=[{id:'b',type:'buy',date:'2020-01-02',depotId:'dv',securityId:'a',quantity:'100',amount:'1000'},
  {id:'g',type:'transfer',kind:'gift',date:'2026-05-04',depotId:'dv',toDepotId:'dk',securityId:'a',quantity:'100',...(price?{price:String(Number(value)/100)}:{})}];
 if(prior)s.priorGifts=[{id:'pg',donorId:'v',recipientId:'k',date:'2019-06-01',value:prior.value,taxPaid:prior.tax}];
 validate(s);return s;
}
const assess=s=>giftAssessments(s,replay(s,{until:'2026-12-31'}).moves,'v','k');

test('gifts within ten years are combined and the higher of notional and actual prior tax is credited',()=>{
 assert.equal(assess(family({value:'390000'})).acquisitions[0].tax,'0');
 assert.equal(assess(family({value:'500000'})).acquisitions.at(-1).tax,'11000');
 // Vorerwerb 2019 über dem Freibetrag: 650.000 € zu 19 % = 123.500 €, Härteausgleich
 // 90.000 + 25.000 = 115.000 €; abzüglich der höheren tatsächlichen Vorsteuer 60.000 €.
 const r=assess(family({value:'450000',prior:{value:'600000',tax:'60000'}})).acquisitions.at(-1);
 assert.equal(r.status,'supported');assert.equal(r.priorValue,'600000');assert.equal(r.credit,'60000');assert.equal(r.tax,'55000');
 // Hier ist die fiktive Vorsteuer (304.000 €) höher als die tatsächliche: 313.500 − 304.000.
 const big=assess(family({value:'50000',prior:{value:'2000000',tax:'300000'}})).acquisitions.at(-1);
 assert.equal(big.credit,'304000');assert.equal(big.tax,'9500');
});

test('a gift without a price, relation or verified year yields no tax figure but stays a prior acquisition',()=>{
 assert.equal(assess(family({price:false})).acquisitions[0].status,'incomplete');
 assert.equal(assess(family({relation:null})).acquisitions[0].status,'incomplete');
 const s=family();s.events[1].date='2025-05-05';const r=assess(s).acquisitions[0];
 assert.equal(r.status,'unsupported');assert.equal(r.tax,null);assert.equal(r.value,'500000');
});

test('the remaining tax-free amount and the date the oldest gift drops out are shown',()=>{
 const s=demoState(),moves=replay(s,{until:'2026-10-31'}).moves,r=remainingAllowance(s,moves,'p1','p3','2026-10-31');
 assert.equal(r.status,'supported');assert.equal(r.used,'212670');assert.equal(r.remaining,'187330');assert.equal(r.frees,'2036-01-13');
});

test('the vault opens with the right password only and keeps its own iteration count',async()=>{
 const s=demoState(),session=await newSession('richtiges-passwort-1'),envelope=await seal(s,session);
 assert.equal(envelope.iterations,ITERATIONS);assert.equal(envelope.revision,1);assert.equal(envelope.ciphertext.includes('Weber'),false);
 const opened=await open(envelope,'richtiges-passwort-1');assert.deepEqual(opened.state,s);assert.equal(opened.session.revision,1);
 await assert.rejects(open(envelope,'falsches-passwort-1'),/Passwort falsch/);
 await assert.rejects(open({...envelope,iterations:600001},'richtiges-passwort-1'),/Passwort falsch|beschädigt/);
 await assert.rejects(open({format:'depotklar-vault',version:1},'x'),/Version 3/);
 await assert.rejects(newSession('kurz'),/12 Zeichen/);
});

test('changing the password re-encrypts the same data and leaves the old password useless',async()=>{
 const s=demoState(),envelope=await seal(s,await newSession('altes-passwort-123')),changed=await rekey(envelope,'altes-passwort-123','neues-passwort-456');
 assert.deepEqual((await open(changed.envelope,'neues-passwort-456')).state,s);assert.equal(changed.envelope.revision,2);
 await assert.rejects(open(changed.envelope,'altes-passwort-123'),/Passwort falsch/);
 await assert.rejects(rekey(envelope,'falsch-falsch-falsch','neues-passwort-456'),/Passwort falsch/);
 await assert.rejects(rekey(envelope,'altes-passwort-123','altes-passwort-123'),/entspricht/);
});

test('saving refuses a stale revision so a second window cannot overwrite newer data',async()=>{
 await remove();const session=await newSession('speicher-passwort-1'),first=await seal(emptyState(),session);
 await save(first,0);assert.equal((await load()).revision,1);
 await assert.rejects(save(await seal(emptyState(),session),0),/anderen Fenster/);
 await save(await seal(emptyState(),{...session,revision:1}),1);assert.equal((await load()).revision,2);
});
