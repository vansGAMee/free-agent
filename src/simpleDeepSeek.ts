import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,type Locator,type Page} from 'playwright';
import {appDir} from './config.js';

interface GeneratedFile{path:string;content:string}

function promptFor(task:string){return `You are generating files for a local coding tool.

User task:
${task}

Return ONLY valid JSON in this shape:
{
  "files": [
    {
      "path": "relative/path",
      "content": "<complete file content>"
    }
  ]
}

No markdown fences.
No explanation.
Use only relative paths.`}

async function findChatInput(page:Page,timeoutMs=300_000):Promise<Locator>{
 const candidates=page.locator('main textarea, main [contenteditable="true"], main [role="textbox"], textarea, [contenteditable="true"], [role="textbox"]');
 const end=Date.now()+timeoutMs;
 while(Date.now()<end){
  const count=await candidates.count();
  let best:Locator|null=null,bestScore=-Infinity;
  for(let i=0;i<count;i++){
   const candidate=candidates.nth(i);
   if(!await candidate.isVisible().catch(()=>false)||!await candidate.isEditable().catch(()=>false))continue;
   const score=await candidate.evaluate(element=>{const e=element as HTMLElement,r=e.getBoundingClientRect(),label=`${e.getAttribute('aria-label')||''} ${e.getAttribute('placeholder')||''}`.toLowerCase();return (e.tagName==='TEXTAREA'?30:0)+(e.isContentEditable?20:0)+(e.getAttribute('role')==='textbox'?10:0)+(r.top/window.innerHeight)*20+(/message|chat|ask|deepseek/.test(label)?40:0)-(/search/.test(label)?100:0)});
   if(score>bestScore){best=candidate;bestScore=score}
  }
  if(best)return best;
  await page.waitForTimeout(500);
 }
 throw new Error('DeepSeek chat input did not appear. Finish login in the opened Chromium window.')
}

function jsonObjects(text:string){
 const values:unknown[]=[];
 for(let start=0;start<text.length;start++){
  if(text[start]!=='{')continue;
  let depth=0,inString=false,escaped=false;
  for(let i=start;i<text.length;i++){
   const ch=text[i];
   if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue}
   if(ch==='"'){inString=true;continue}if(ch==='{')depth++;else if(ch==='}'&&--depth===0){try{values.push(JSON.parse(text.slice(start,i+1)))}catch{}break}
  }
 }
 return values;
}

function validFiles(value:unknown):GeneratedFile[]|null{
 if(!value||typeof value!=='object'||!Array.isArray((value as any).files))return null;
 const files=(value as any).files;
 if(!files.length||!files.every((file:any)=>file&&typeof file.path==='string'&&typeof file.content==='string'))return null;
 if(files.length===1&&files[0].path==='relative/path'&&files[0].content==='<complete file content>')return null;
 return files;
}

function decodeLooseString(value:string){try{return JSON.parse(`"${value}"`) as string}catch{return JSON.parse(`"${value.replace(/(?<!\\)"/g,'\\"')}"`) as string}}

function fileResponses(text:string){
 const responses=jsonObjects(text).map(validFiles).filter((x):x is GeneratedFile[]=>x!==null);
 const loose:GeneratedFile[]=[];
 const blocks=/"path"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"([\s\S]*?)"\s*}\s*(?=,|\])/g;
 for(const match of text.matchAll(blocks)){
  const file={path:decodeLooseString(match[1]),content:decodeLooseString(match[2])};
  if(file.path!=='relative/path'||file.content!=='<complete file content>')loose.push(file);
 }
 if(loose.length)responses.push(loose);
 return responses;
}

async function waitForFiles(page:Page,baseline:number,timeoutMs=300_000){
 const end=Date.now()+timeoutMs;
 while(Date.now()<end){
  const text=await page.locator('body').innerText(),matches=fileResponses(text);
  if(matches.length>baseline)return matches.at(-1)!;
  await page.waitForTimeout(750);
 }
 throw new Error('DeepSeek did not return a valid files JSON response in time.')
}

function resolveOutput(projectRoot:string,relative:string){
 if(!relative||path.win32.isAbsolute(relative)||path.posix.isAbsolute(relative)||relative.includes('\0'))throw new Error(`Unsafe file path from DeepSeek: ${relative}`);
 const root=path.resolve(projectRoot),target=path.resolve(root,relative);
 if(target===root||!target.startsWith(root+path.sep))throw new Error(`File path escapes project root: ${relative}`);
 return target;
}

export async function runSimpleDeepSeek(projectRoot:string,task:string){
 projectRoot=path.resolve(projectRoot);await fs.mkdir(projectRoot,{recursive:true});
 const profile=path.join(appDir(),'chromium-profile');
 await fs.mkdir(profile,{recursive:true});
 const context=await chromium.launchPersistentContext(profile,{headless:false});
 try{
  const page=context.pages()[0]||await context.newPage();
  await page.goto('https://chat.deepseek.com/',{waitUntil:'domcontentloaded',timeout:60_000});
  console.log('Waiting for DeepSeek chat input. Log in once in Chromium if needed...');
  const input=await findChatInput(page),beforeText=await page.locator('body').innerText(),baseline=fileResponses(beforeText).length;
  await input.click();await input.fill(promptFor(task));await input.press('Enter');
  console.log('Message sent. Waiting for DeepSeek JSON response...');
  const files=await waitForFiles(page,baseline);
  for(const file of files){const target=resolveOutput(projectRoot,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.content,'utf8')}
  return files.length;
 }finally{await context.close()}
}
