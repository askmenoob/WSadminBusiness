import{readdir,readFile}from'node:fs/promises';import path from'node:path';
const dir='apps/api/src',files=(await readdir(dir)).filter(x=>x.endsWith('-routes.ts'));let routes=0;const failures=[];
for(const file of files){const text=await readFile(path.join(dir,file),'utf8'),lines=text.split(/\r?\n/);for(let i=0;i<lines.length;i++){if(!lines[i].includes('/api/v1/tenants/:tenantId'))continue;routes++;const window=lines.slice(Math.max(0,i-1),Math.min(lines.length,i+5)).join('\n');if(!/(?:guard|g)\s*\(/.test(window))failures.push(`${file}:${i+1}`);}}
if(failures.length){console.error(JSON.stringify({status:'FAIL',routes,failures}));process.exit(1);}console.log(JSON.stringify({status:'PASS',tenantRoutes:routes,routeFiles:files.length,guarded:true}));
