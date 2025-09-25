#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function rmSafe(p){ try{ if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }catch(e){ console.error('Failed to remove', p, e.message); } }

function pruneBackups(dir){
  try{
    const list = fs.readdirSync(dir).filter(f=>/\.conf\.backup\./.test(f)).sort((a,b)=>{
      const ta = Number(a.split('.backup.')[1]||0);
      const tb = Number(b.split('.backup.')[1]||0);
      return tb - ta;
    });
    const keep = Math.max(0, Number(process.env.CONFIG_BACKUP_RETENTION)||3);
    list.slice(keep).forEach(f=> rmSafe(path.join(dir, f)));
  }catch{}
}

function main(){
  // Remove legacy .bak files
  rmSafe(path.join(ROOT, 'overrides', 'encast.bak'));
  rmSafe(path.join(ROOT, 'overrides', 'encast_20250923.bak'));
  // Prune backups in apps/ and overrides/
  pruneBackups(path.join(ROOT, 'apps'));
  pruneBackups(path.join(ROOT, 'overrides'));

  // Artifacts pruning (reports)
  const retentionDays = Math.max(0, Number(process.env.ARTIFACTS_RETENTION_DAYS)||14);
  if (retentionDays > 0){
    const reports = path.join(ROOT, '.artifacts', 'reports');
    const cutoff = Date.now() - retentionDays*24*60*60*1000;
    try{
      fs.readdirSync(reports).forEach(f=>{
        try{ const p = path.join(reports, f); if (fs.statSync(p).mtimeMs < cutoff) rmSafe(p); }catch{}
      });
    }catch{}
  }

  console.log('Cleanup complete.');
}

if (require.main === module) main();


