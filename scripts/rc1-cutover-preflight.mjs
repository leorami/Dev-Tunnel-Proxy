#!/usr/bin/env node
/** No effects: bounded STDIN only; never emits operator-provided values. */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {assessCutoverPreflight,formatCutoverPreflight}=require('../utils/rc1-cutover-preflight.cjs');
let input=null;
if(process.argv.length===2){
  try{
    let raw='';
    for await(const chunk of process.stdin){
      raw+=chunk;
      if(raw.length>16384)throw new Error('OVER_BUDGET');
    }
    input=JSON.parse(raw);
  }catch{input=null;}
}
const result=assessCutoverPreflight(input);
process.stdout.write(formatCutoverPreflight(result)+'\n');
process.exitCode=result.status==='READY_FOR_CONTROLLED_OPERATOR_CUTOVER'?0:2;
