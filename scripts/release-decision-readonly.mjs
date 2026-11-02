#!/usr/bin/env node
/**
 * Zero-I/O readiness evidence renderer. Only reads bounded STDIN and prints
 * fixed gate names/states. It never touches Docker, proxy, files or network.
 * An exit code of 0 is NOT authority to merge, deploy or restart.
 */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {assessReleaseEvidence,formatRedactedDecision}=require('../utils/release-decision.cjs');
let evidence=null;
if(process.argv.length===2){
  try{
    let input='';
    for await(const chunk of process.stdin){
      input+=chunk;
      if(input.length>8192)throw new Error('TOO_LARGE');
    }
    evidence=JSON.parse(input);
  }catch{
    evidence=null; // Never echo input or parser errors; fail closed.
  }
}
const result=assessReleaseEvidence(evidence);
process.stdout.write(formatRedactedDecision(result)+'\n');
process.exitCode=result.recommendation==='READY_FOR_OWNER_DECISION'?0:2;
