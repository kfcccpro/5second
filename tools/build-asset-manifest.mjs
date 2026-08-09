import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const proto=path.join(root,'prototype');
const version='maintenance-v1.0.0';
const outName='asset-integrity-manifest-maintenance-v1.json';
const critical=new Set([
  'index.html','maintenance-v1.css','rc-core.css','phase31-core.css','manifest.webmanifest',
  'firebase-pilot-config.js','workbook-meta.js','app-data.js','app.js','storage.js','auth-core.js',
  'analytics-core.js','question-quality-data.js','phase26-data.js','phase27-data.js','quality-approval-core.js',
  'personal-stability-core.js','quality-core.js','daily-core.js','cloud-sync.js','adaptive-core.js',
  'phase31-data.js','phase31-core.js','phase21-ui.js','phase31-ui.js','assets/workbook/cover.png'
]);
const excluded=/^asset-integrity-manifest-.*\.json$/;
function walk(dir,base=''){
  const rows=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const rel=base?`${base}/${entry.name}`:entry.name;
    const abs=path.join(dir,entry.name);
    if(entry.isDirectory()) rows.push(...walk(abs,rel));
    else if(!excluded.test(rel)) rows.push(rel);
  }
  return rows;
}
const assets=walk(proto).sort().map(rel=>{const b=fs.readFileSync(path.join(proto,rel));return{path:rel,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),critical:critical.has(rel)}});
for(const rel of critical) if(!assets.some(x=>x.path===rel)) throw new Error(`critical asset missing: ${rel}`);
const manifest={format:'JK_ENG_ASSET_INTEGRITY',version,generatedBy:'tools/build-asset-manifest.mjs',assetCount:assets.length,criticalCount:assets.filter(x=>x.critical).length,assets};
fs.writeFileSync(path.join(proto,outName),JSON.stringify(manifest,null,2)+'\n');
console.log(`built ${outName}: assets=${manifest.assetCount}, critical=${manifest.criticalCount}`);
