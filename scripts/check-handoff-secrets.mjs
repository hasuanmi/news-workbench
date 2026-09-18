// Scan delivery files without printing credentials. Local configuration is never staged.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import dotenv from 'dotenv';
const root=process.cwd();const values=new Set();
for(const folder of [root,path.resolve(root,'../media-scraper')])for(const name of ['.env','.env.local']){
  const file=path.join(folder,name);if(!fs.existsSync(file))continue;
  const parsed=dotenv.parse(fs.readFileSync(file));
  for(const [key,value]of Object.entries(parsed))if(/KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|DB_URL/.test(key)&&value.length>=8)values.add(value);
  for(const [key,value]of Object.entries(parsed))if(/DATABASE_URL|DB_URL/.test(key)){try{const password=decodeURIComponent(new URL(value).password);if(password.length>=8)values.add(password);}catch{}}
}
const staged=process.argv.includes('--staged');
const files=execFileSync('git',staged?['diff','--cached','--name-only','--diff-filter=ACMR','-z']:['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const findings=[];
for(const file of [...new Set(files)]){
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())continue;
  if(/(?:^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith('.env.example'))findings.push({file,rule:'environment file'});
  if(/\.(crt|cer|pem|key|pfx|p12)$/i.test(file)||/(?:^|\/)logs\//.test(file))findings.push({file,rule:'certificate or log'});
  const text=fs.readFileSync(file).toString('utf8');
  for(const value of values)if(text.includes(value))findings.push({file,rule:'matches local credential'});
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{24,}|\bsb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text))findings.push({file,rule:'credential pattern'});
  if(/postgres(?:ql)?:\/\/[^\s"']+:[^\s"'@]+@/i.test(text)&&!file.endsWith('.env.example'))findings.push({file,rule:'database credential URL; inspect placeholder'});
}
const result={checkedAt:new Date().toISOString(),staged,files:files.length,status:findings.length?'FAIL':'PASS',findings};
fs.mkdirSync('logs/handoff',{recursive:true});fs.writeFileSync(`logs/handoff/secret-scan${staged?'-staged':''}.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));if(findings.length)process.exitCode=1;
