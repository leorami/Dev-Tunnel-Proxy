'use strict';
/**
 * SOURCE-ONLY compiler for ONE already identified on-host Config API preimage.
 * Binds a 29-line read-only Calliope feature overlay to immutable reviewed Git
 * blobs, preserving 100% of the actual installed API's unrelated source.
 *
 * This function does NOT read/write source files, talk to Docker, use GitHub,
 * load any runtime code, authorize the owner or attest live state. Its result is
 * a proposal to be independently reviewed, not a deployable instruction.
 */
const crypto=require('node:crypto');

const PINS=Object.freeze({
  installedApi:'7a22ec61531ac7b39c01370e41196775904c274f',
  mainApi:'bafc60dc0224439e3d726f07e900afdbfce7cf60',
  reviewedApi:'79c87fdc83ae5da2bdc22d1670f9d03709aee80d'
});
const EXPECTED_LINES=Object.freeze([36,43,689,750,767]);
const EXPECTED_COUNTS=Object.freeze([1,5,1,16,6]);
const INPUT_KEYS=Object.freeze(['installedSource','mainSource','reviewedSource']);
const NO_ACTION=Object.freeze({
  productionChangeAuthorized:false,hostAttested:false,apiRestartAuthorized:false,
  protectedMergeAuthorized:false,ownerUatAccepted:false,liveAttested:false,
  deployed:false
});
function reject(code){return Object.freeze({ok:false,code,...NO_ACTION});}
function exactPlain(x,keys){
  try{
    return x&&typeof x==='object'&&!Array.isArray(x)&&
      Object.getPrototypeOf(x)===Object.prototype&&
      Reflect.ownKeys(x).length===keys.length&&
      keys.every(k=>Object.hasOwn(x,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(x,k),'value'));
  }catch{return false;}
}
function blobSha(source){
  const b=Buffer.from(source,'utf8');
  return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
}
/**
 * The accepted V182 API change is ADDITIONS ONLY. Derive insertions from the
 * exact reviewed main->candidate blobs and reject any mismatch or ambiguity.
 */
function reviewedInsertions(main,reviewed){
  const a=main.split('\n'),b=reviewed.split('\n');
  let i=0,j=0,hunks=[];
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    const start=i,insert=[];
    while(j<b.length&&b[j]!==a[i]){
      insert.push(b[j++]);
      if(insert.length>32)return null;
    }
    if(j>=b.length)return null;
    hunks.push({start,insert});
    if(hunks.length>5)return null;
  }
  if(i!==a.length||j!==b.length||hunks.length!==5)return null;
  if(hunks.some((h,n)=>h.start+1!==EXPECTED_LINES[n]||h.insert.length!==EXPECTED_COUNTS[n]))return null;
  return {baseline:a,hunks};
}
function buildCalliopeInstalledApiOverlay(input){
  if(!exactPlain(input,INPUT_KEYS))return reject('INVALID_OVERLAY_INPUT');
  const {installedSource,mainSource,reviewedSource}=input;
  if([installedSource,mainSource,reviewedSource].some(s=>typeof s!=='string'||!s.endsWith('\n')||
     s.length>300000||s.includes('\r')))
    return reject('INVALID_OVERLAY_SOURCE');
  // Historical reviewed APIs contain literal NUL bytes in old display-copy strings.\n  // Pinned Git blob SHA covers them exactly; do not corrupt that on-host preimage.\n  if(blobSha(installedSource)!==PINS.installedApi||
     blobSha(mainSource)!==PINS.mainApi||
     blobSha(reviewedSource)!==PINS.reviewedApi)
    return reject('UNRECONCILED_API_PREIMAGE');
  const derived=reviewedInsertions(mainSource,reviewedSource);
  if(!derived)return reject('UNREVIEWED_API_DIFF');
  let output=installedSource;
  for(const h of derived.hunks){
    // Four neighboring reviewed MAIN lines on both sides are part of the
    // semantic anchor. Require the EXACT entire anchor once in old live source.
    const before=derived.baseline.slice(h.start-4,h.start).join('\n');
    const after=derived.baseline.slice(h.start,h.start+4).join('\n');
    if(!before||!after)return reject('UNSAFE_API_INSERTION_ANCHOR');
    const needle=before+'\n'+after;
    const first=output.indexOf(needle);
    if(first<0||output.indexOf(needle,first+1)>=0)
      return reject('AMBIGUOUS_INSTALLED_API_ANCHOR');
    output=output.slice(0,first)+before+'\n'+h.insert.join('\n')+'\n'+
      after+output.slice(first+needle.length);
  }
  if(output===installedSource||!output.endsWith('\n'))return reject('OVERLAY_NOT_APPLIED');
  return Object.freeze({
    ok:true,code:'SOURCE_ONLY_INSTALLED_API_OVERLAY',
    source:output,sourceGitBlobSha1:blobSha(output),
    insertedLineCounts:Object.freeze([...EXPECTED_COUNTS]),totalInsertions:29,
    installedPreimageSha:PINS.installedApi,
    reviewedSourceSha:PINS.reviewedApi,
    ...NO_ACTION
  });
}
module.exports=Object.freeze({buildCalliopeInstalledApiOverlay,PINS});
