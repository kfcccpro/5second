(function(global){
'use strict';
const VERSION='33.0';
const text=value=>String(value==null?'':value).trim();
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const nowIso=()=>new Date().toISOString();
const uid=prefix=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
const basename=value=>text(value).split(/[\\/]/).pop()||'';
const policy=()=>global.JK_PHASE33_DATA?.policy||{};
const phase32Policy=()=>global.JK_PHASE32_DATA?.policy||{};
function phase32NameValid(name){
  if(global.JK_PHASE32?.validateEvidenceName)return global.JK_PHASE32.validateEvidenceName(name,phase32Policy());
  return /^JKENG_RC2_\d{8}_(PHONE|TABLET|DESKTOP)_([A-Z0-9-]+)_([A-Z0-9-]+)_\d{2}\.(png|jpg|jpeg|webp|mp4|mov|txt|json|log|pdf)$/i.test(basename(name));
}
function normalizeCatalogEntry(input={}){
  return {
    name:basename(input.name||input.path),
    path:text(input.path||input.name),
    size:Number(input.size||0),
    type:text(input.type),
    lastModified:Number(input.lastModified||0),
    sha256:text(input.sha256||input.hash).toLowerCase(),
    source:text(input.source||'selected-file')
  };
}
function normalizeCatalog(entries=[]){return (Array.isArray(entries)?entries:[]).map(normalizeCatalogEntry).filter(x=>x.name)}
function parseCatalogText(raw=''){
  const value=text(raw);if(!value)return [];
  try{
    const parsed=JSON.parse(value);const rows=Array.isArray(parsed)?parsed:(parsed.files||parsed.assets||parsed.catalog||[]);return normalizeCatalog(rows);
  }catch(_){
    return normalizeCatalog(value.split(/\r?\n/).map(line=>{
      const m=line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);return m?{sha256:m[1],name:m[2]}:null;
    }).filter(Boolean));
  }
}
function keyLooksEvidence(key){return /evidence|artifact|file/i.test(text(key))}
function collectEvidenceReferences(pkg={}){
  const occurrences=[];
  function visit(value,path,key){
    if(Array.isArray(value)){
      if(keyLooksEvidence(key))for(const item of value){
        if(typeof item==='string'&&item.trim())occurrences.push({name:basename(item),path,raw:item});
        else if(item&&typeof item==='object'&&(item.name||item.path))occurrences.push({name:basename(item.name||item.path),path,raw:item.name||item.path});
      }
      value.forEach((item,index)=>visit(item,`${path}[${index}]`,key));return;
    }
    if(value&&typeof value==='object'){
      for(const [childKey,child] of Object.entries(value))visit(child,path?`${path}.${childKey}`:childKey,childKey);
      return;
    }
    if(typeof value==='string'&&keyLooksEvidence(key)&&value.trim()){
      for(const line of value.split(/\r?\n/).map(text).filter(Boolean))occurrences.push({name:basename(line),path,raw:line});
    }
  }
  visit(pkg,'','');
  const byName=new Map();for(const row of occurrences){if(!byName.has(row.name))byName.set(row.name,[]);byName.get(row.name).push(row.path)}
  return {occurrences,unique:[...byName].map(([name,paths])=>({name,paths})),names:[...byName.keys()]};
}
function expectedCatalogFromPackage(pkg={}){
  const candidates=[pkg.evidenceCatalog,pkg.sha256Catalog,pkg.catalog,pkg.audit?.evidenceCatalog].filter(Boolean);
  for(const candidate of candidates){const rows=Array.isArray(candidate)?candidate:(candidate.files||candidate.entries||candidate.assets||candidate.catalog||[]);const normalized=normalizeCatalog(rows);if(normalized.length)return normalized}
  return [];
}
function duplicateGroups(rows,key){const map=new Map();for(const row of rows){const k=text(row[key]).toLowerCase();if(!k)continue;if(!map.has(k))map.set(k,[]);map.get(k).push(row)}return [...map.entries()].filter(([,items])=>items.length>1).map(([value,items])=>({value,items}))}
function verifyEvidencePackage(pkg={},catalogEntries=[],options={},p=policy()){
  const catalog=normalizeCatalog(catalogEntries),refs=collectEvidenceReferences(pkg),expected=normalizeCatalog(options.expectedCatalog||expectedCatalogFromPackage(pkg));
  const errors=[],warnings=[],checks=[];const add=(id,ok,detail='',severity='error')=>{checks.push({id,ok:Boolean(ok),detail:text(detail),severity});if(!ok)(severity==='warning'?warnings:errors).push({id,detail:text(detail)})};
  const accepted=p.acceptedPackage||{};
  add('PACKAGE_FORMAT',pkg?.format===accepted.format,`${pkg?.format||'missing'} / expected ${accepted.format||'-'}`);
  add('PACKAGE_VERSION',pkg?.version===accepted.version,`${pkg?.version||'missing'} / expected ${accepted.version||'-'}`);
  add('PACKAGE_CANDIDATE',pkg?.candidate===accepted.candidate,`${pkg?.candidate||'missing'} / expected ${accepted.candidate||'-'}`);
  add('ACTUAL_FILES_SELECTED',catalog.length>0,`${catalog.length} files`);
  add('REFERENCED_EVIDENCE_EXISTS',refs.names.length>0,`${refs.names.length} referenced files`);
  const invalidRefs=refs.names.filter(name=>!phase32NameValid(name));add('REFERENCE_NAME_RULE',invalidRefs.length===0,invalidRefs.join(', '));
  const invalidSelected=catalog.filter(row=>!phase32NameValid(row.name));add('SELECTED_NAME_RULE',invalidSelected.length===0,invalidSelected.map(x=>x.name).join(', '));
  const duplicateNames=duplicateGroups(catalog,'name');add('DUPLICATE_FILE_NAMES',duplicateNames.length===0,duplicateNames.map(x=>x.value).join(', '));
  const invalidHashes=catalog.filter(row=>!/^[a-f0-9]{64}$/.test(row.sha256));add('SHA256_COMPUTED',invalidHashes.length===0,invalidHashes.map(x=>x.name).join(', '));
  const catalogNames=new Set(catalog.map(x=>x.name.toLowerCase())),missing=refs.names.filter(name=>!catalogNames.has(name.toLowerCase()));add('REFERENCED_FILES_PRESENT',missing.length===0,missing.join(', '));
  const refNames=new Set(refs.names.map(x=>x.toLowerCase())),unreferenced=catalog.filter(x=>!refNames.has(x.name.toLowerCase()));add('UNREFERENCED_FILES',unreferenced.length===0,unreferenced.map(x=>x.name).join(', '),'warning');
  const duplicateContent=duplicateGroups(catalog.filter(x=>x.sha256),'sha256').filter(group=>new Set(group.items.map(x=>x.name.toLowerCase())).size>1);add('DUPLICATE_CONTENT',duplicateContent.length===0,duplicateContent.map(x=>x.items.map(i=>i.name).join(' = ')).join('; '),'warning');
  const actualByName=new Map(catalog.map(x=>[x.name.toLowerCase(),x]));const mismatches=[];for(const exp of expected){const actual=actualByName.get(exp.name.toLowerCase());if(actual&&exp.sha256&&actual.sha256!==exp.sha256)mismatches.push({name:exp.name,expected:exp.sha256,actual:actual.sha256})}
  add('EXPECTED_HASH_MATCH',mismatches.length===0,mismatches.map(x=>x.name).join(', '));
  const expectedMissing=expected.filter(x=>!actualByName.has(x.name.toLowerCase()));add('EXPECTED_CATALOG_FILES_PRESENT',expectedMissing.length===0,expectedMissing.map(x=>x.name).join(', '));
  return {format:'JK_ENG_PHASE33_EVIDENCE_VERIFICATION',version:VERSION,verificationId:text(options.verificationId)||uid('evidence-verification'),status:errors.length?'FAIL':'PASS',packageIdentityPass:checks.filter(x=>x.id.startsWith('PACKAGE_')).every(x=>x.ok),integrityPass:errors.length===0,catalogAlgorithm:'SHA-256',catalog,expectedCatalog:expected,references:refs,missingReferences:missing,invalidReferenceNames:invalidRefs,invalidSelectedNames:invalidSelected.map(x=>x.name),duplicateNames:duplicateNames.map(x=>x.value),duplicateContent:duplicateContent.map(x=>x.items.map(i=>i.name)),hashMismatches:mismatches,unreferencedFiles:unreferenced.map(x=>x.name),checks,errors,warnings,verifiedAt:nowIso(),automaticApproval:false};
}
function statusFrom(pkg,gate){
  const ext=pkg?.externalGateEvidence?.[gate]?.status;
  if(ext)return text(ext).toUpperCase();
  if(gate==='deployment')return text(pkg?.deployment?.status||pkg?.state?.gates?.deployment||'DEPLOYMENT_NOT_RUN').toUpperCase();
  if(gate==='deviceQa')return text(pkg?.deviceQa?.status||pkg?.state?.gates?.deviceQa||'DEVICE_QA_NOT_RUN').toUpperCase();
  if(gate==='recoveryDrill')return text(pkg?.recovery?.status||pkg?.state?.gates?.recoveryDrill||'RECOVERY_DRILL_NOT_RUN').toUpperCase();
  return text(pkg?.state?.gates?.[gate]||'NOT_RUN').toUpperCase();
}
function namesFrom(value){
  const out=[];if(!value)return out;if(Array.isArray(value)){for(const item of value)out.push(...namesFrom(item));return out}
  if(typeof value==='string')return value.split(/\r?\n/).map(basename).filter(Boolean);
  if(typeof value==='object'){if(value.name||value.path)out.push(basename(value.name||value.path));for(const [key,child] of Object.entries(value))if(keyLooksEvidence(key))out.push(...namesFrom(child));}
  return out;
}
function gateReferences(pkg={},gate,allRefs=[]){
  const names=[];const add=value=>names.push(...namesFrom(value));add(pkg?.externalGateEvidence?.[gate]?.evidence);
  if(gate==='deployment'){add(pkg?.deployment?.evidence);add(pkg?.deployment?.artifacts)}
  if(gate==='deviceQa'){add(pkg?.deviceQa?.cells);add(pkg?.deviceQa?.runs)}
  if(gate==='recoveryDrill'){add(pkg?.recovery?.evidence);add(pkg?.recovery?.artifacts)}
  const tokenRules={deployment:/_(DEPLOY|TLS|HEALTH|SECURITY)-?\d*/i,recoveryDrill:/_(BACKUP|RESTORE|RECOVERY)-?\d*/i,pwaExternalInstall:/_PWA-?\d*/i,assistiveTechnology:/_(A11Y|AT)-?\d*/i,performanceDevice:/_(PERF|PERFORMANCE)-?\d*/i};
  const rule=tokenRules[gate];if(rule)for(const name of allRefs)if(rule.test(name))names.push(name);
  return [...new Set(names.map(basename).filter(Boolean))];
}
function localBlockerSummary(defects=[]){
  const rows=(Array.isArray(defects)?defects:[]).map(x=>({...x,severity:text(x.severity).toUpperCase(),status:text(x.status||'OPEN').toUpperCase()}));
  const open=rows.filter(x=>x.status!=='CLOSED'),releaseBlocking=open.filter(x=>['P0','P1'].includes(x.severity)),unresolvedP2=open.filter(x=>x.severity==='P2'&&!x.acceptedRisk);
  return {status:releaseBlocking.length?'BLOCKED':unresolvedP2.length?'DISPOSITION_REQUIRED':'CLEAR',rows,total:rows.length,open:open.length,releaseBlocking:releaseBlocking.length,unresolvedP2:unresolvedP2.length};
}
function evaluateFinalApproval(pkg={},verification={},p=policy()){
  const allRefs=verification?.references?.names||collectEvidenceReferences(pkg).names,catalogNames=new Set((verification.catalog||[]).map(x=>x.name.toLowerCase()));
  const gateRows=(p.requiredExternalGates||[]).map(def=>{
    const sourceStatus=statusFrom(pkg,def.id),refs=gateReferences(pkg,def.id,allRefs),missing=refs.filter(name=>!catalogNames.has(name.toLowerCase()));
    let status=sourceStatus;if(sourceStatus==='PASS'&&(refs.length<Number(def.minimumEvidenceFiles||1)||missing.length||verification.status!=='PASS'))status='EVIDENCE_INCOMPLETE';
    return {id:def.id,label:def.label,sourceStatus,status,evidence:refs,evidenceCount:refs.length,minimumEvidenceFiles:Number(def.minimumEvidenceFiles||1),missingEvidence:missing,pass:status==='PASS'};
  });
  const blockers=global.JK_PHASE32?.summarizeBlockers?global.JK_PHASE32.summarizeBlockers(pkg?.blockers||[],phase32Policy()):localBlockerSummary(pkg?.blockers||[]);
  const packagePass=Boolean(verification.packageIdentityPass),integrityPass=verification.status==='PASS',allGatesPass=gateRows.length>0&&gateRows.every(x=>x.pass),defectsPass=blockers.releaseBlocking===0&&blockers.unresolvedP2===0;
  const readyForApproval=packagePass&&integrityPass&&allGatesPass&&defectsPass;
  const reasons=[];if(!packagePass)reasons.push('PACKAGE_IDENTITY_FAIL');if(!integrityPass)reasons.push('EVIDENCE_INTEGRITY_FAIL');if(!allGatesPass)reasons.push('EXTERNAL_GATES_INCOMPLETE');if(blockers.releaseBlocking)reasons.push('P0_P1_BLOCKERS_OPEN');if(blockers.unresolvedP2)reasons.push('P2_DISPOSITION_REQUIRED');
  return {format:'JK_ENG_PHASE33_FINAL_APPROVAL_EVALUATION',version:VERSION,status:readyForApproval?'READY_FOR_MANUAL_APPROVAL':'APPROVAL_BLOCKED',readyForApproval,packagePass,integrityPass,allGatesPass,defectsPass,gates:gateRows,blockers,reasons,automaticApproval:false,evaluatedAt:nowIso()};
}
function makeManualDecision(input={},evaluation={},p=policy()){
  const action=text(input.action).toUpperCase(),reviewer=text(input.reviewer),reason=text(input.reason);const errors=[];
  if(!(p.manualDecision?.actions||['APPROVE','HOLD','REJECT']).includes(action))errors.push('INVALID_ACTION');
  if(!reviewer)errors.push('REVIEWER_REQUIRED');if(!reason)errors.push('REASON_REQUIRED');if(action==='APPROVE'&&!evaluation.readyForApproval)errors.push('APPROVAL_GATE_BLOCKED');
  return {format:'JK_ENG_PHASE33_MANUAL_RELEASE_DECISION',version:VERSION,decisionId:text(input.decisionId)||uid('release-decision'),candidate:p.candidate||'JK English v1.0 RC2',action,reviewer,reason,accepted:errors.length===0,errors,evaluationStatus:evaluation.status||'NOT_EVALUATED',verificationId:input.verificationId||null,decidedAt:input.decidedAt||nowIso(),automaticApproval:false,immutable:true};
}
function buildAuditBundle(input={}){
  return {format:'JK_ENG_PHASE33_RC2_AUDIT_BUNDLE',version:VERSION,candidate:policy().candidate||'JK English v1.0 RC2',exportedAt:nowIso(),policy:clone(policy()),state:clone(global.JK_PHASE33_DATA?.state||{}),sourcePackage:clone(input.sourcePackage||null),sourcePackageMeta:clone(input.sourcePackageMeta||null),evidenceVerification:clone(input.evidenceVerification||null),finalEvaluation:clone(input.finalEvaluation||null),manualDecisions:clone(input.manualDecisions||[]),truthfulBoundary:{notRunIsNotPass:true,missingEvidenceIsNotPass:true,automaticApproval:false,actualEvidenceFilesNotEmbedded:true}};
}
const api={VERSION,basename,normalizeCatalogEntry,normalizeCatalog,parseCatalogText,collectEvidenceReferences,expectedCatalogFromPackage,verifyEvidencePackage,statusFrom,gateReferences,evaluateFinalApproval,makeManualDecision,buildAuditBundle};
if(typeof module!=='undefined'&&module.exports)module.exports=api;global.JK_PHASE33=api;
})(typeof globalThis!=='undefined'?globalThis:this);
