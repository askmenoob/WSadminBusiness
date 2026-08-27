import { execFileSync } from 'node:child_process';
const trackedEnv = execFileSync('git',['ls-files','.env'],{encoding:'utf8'}).trim();
if (trackedEnv) { console.error('Refusing tracked .env file'); process.exit(1); }
const pattern = '-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----|sk-(proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}';
try {
  const hit = execFileSync('git',['grep','-nE','-e',pattern,'--','.',':(exclude)package-lock.json'],{encoding:'utf8'});
  if (hit.trim()) { console.error(hit); process.exit(1); }
} catch (error) {
  if (error?.status !== 1) throw error;
}
console.log('secret gate: PASS');
