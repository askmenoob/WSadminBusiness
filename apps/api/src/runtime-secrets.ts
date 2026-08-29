import { readFileSync } from 'node:fs';

export function readRuntimeSecret(valueName:string,fileName:string){
  const direct=process.env[valueName]?.trim();if(direct)return direct;
  const path=process.env[fileName]?.trim();if(!path)return'';
  try{return readFileSync(path,'utf8').trim();}catch{return'';}
}
