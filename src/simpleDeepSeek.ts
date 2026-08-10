import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium,type Locator,type Page} from 'playwright';
import {appDir} from './config.js';

export interface GeneratedFile{path:string;content:string}
export interface GeneratedResponse{files:GeneratedFile[];commands:string[]}
export interface CommandFailure extends Error{command:string;exitCode:number|string;output:string;repairAttempts?:number}
export type RepairResponse=(failure:CommandFailure,attempt:number)=>Promise<GeneratedResponse>;
export type CommandRunner=(projectRoot:string,command:string)=>Promise<void>;

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
  ],
  "commands": ["npm install", "npm run build"]
}

No markdown fences.
No explanation.
Use only relative paths.
The commands field is optional. For Node projects, create a normal package.json with dependencies/devDependencies, usually include npm install, and include npm run build when a build script exists.
Follow the requested project structure exactly. If the task requires npm packages, include package.json and commands. Do not simplify a requested multi-file/npm project into one HTML file.`}

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

function validResponse(value:unknown):GeneratedResponse|null{
 if(!value||typeof value!=='object'||!Array.isArray((value as any).files))return null;
 const files=(value as any).files;
 if(!files.length||!files.every((file:any)=>file&&typeof file.path==='string'&&typeof file.content==='string'))return null;
 if(files.length===1&&files[0].path==='relative/path'&&files[0].content==='<complete file content>')return null;
 const commands=(value as any).commands;
 if(commands!==undefined&&(!Array.isArray(commands)||!commands.every((command:unknown)=>typeof command==='string')))return null;
 return {files,commands:commands??[]};
}

export function generatedResponses(text:string){
 return jsonObjects(text).map(validResponse).filter((x):x is GeneratedResponse=>x!==null);
}

export function latestNewResponse(messageTexts:string[],baselineCount:number){if(messageTexts.length<=baselineCount)return null;return generatedResponses(messageTexts.at(-1)!).at(-1)??null}

async function waitForNewResponse(page:Page,baselineCount:number,baselineLastText:string,timeoutMs=300_000){
 const messages=page.locator('.ds-assistant-message-main-content');
 const end=Date.now()+timeoutMs;
 while(Date.now()<end){
  const count=await messages.count();
  if(count>0){
   const text=await messages.last().innerText();
   if(count>baselineCount||text!==baselineLastText){
    const response=latestNewResponse([text],0);
    if(response)return response;
   }
  }
  await page.waitForTimeout(750);
 }
 throw new Error('DeepSeek did not finish a new valid files JSON response in time.')
}

function resolveOutput(projectRoot:string,relative:string){
 if(!relative||path.win32.isAbsolute(relative)||path.posix.isAbsolute(relative)||relative.includes('\0'))throw new Error(`Unsafe file path from DeepSeek: ${relative}`);
 const root=path.resolve(projectRoot),target=path.resolve(root,relative);
 if(target===root||!target.startsWith(root+path.sep))throw new Error(`File path escapes project root: ${relative}`);
 return target;
}

export async function writeGeneratedFiles(projectRoot:string,files:GeneratedFile[]){for(const file of files){const target=resolveOutput(projectRoot,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.content,'utf8')}}

export function parseAllowedNpmCommand(command:string){const parts=command.trim().split(/\s+/);if(parts[0]!=='npm')throw new Error(`Unsafe command rejected: ${command}`);if(parts[1]==='install'&&parts.slice(2).every(part=>/^[A-Za-z0-9@][A-Za-z0-9@._/+~-]*$/.test(part)))return parts.slice(1);if(parts[1]==='run'&&parts.length===3&&/^[A-Za-z0-9_.:-]+$/.test(parts[2]))return parts.slice(1);throw new Error(`Unsafe command rejected: ${command}`)}

async function runNpm(projectRoot:string,command:string,timeoutMs=120_000){const args=parseAllowedNpmCommand(command),executable=process.platform==='win32'?'npm.cmd':'npm';return new Promise<void>((resolve,reject)=>{const child=spawn(executable,args,{cwd:projectRoot,shell:false,windowsHide:true});let output='';const collect=(chunk:Buffer)=>{output=(output+chunk.toString()).slice(-12_000)};child.stdout.on('data',collect);child.stderr.on('data',collect);const timer=setTimeout(()=>child.kill(),timeoutMs);child.on('error',error=>{clearTimeout(timer);reject(Object.assign(error,{command,exitCode:'spawn error',output}))});child.on('close',code=>{clearTimeout(timer);if(output.trim())console.log(output.trim());if(code===0)resolve();else reject(Object.assign(new Error(`Command failed: ${command}`),{command,exitCode:code??'unknown',output}))})})}

function commandFailure(error:unknown,command:string){const failure=(error instanceof Error?error:new Error(String(error))) as CommandFailure;failure.command||=command;failure.exitCode??='unknown';failure.output??='';return failure}

export async function applyGeneratedResponse(projectRoot:string,response:GeneratedResponse,repair?:RepairResponse,runCommand:CommandRunner=runNpm){response.commands.forEach(parseAllowedNpmCommand);await writeGeneratedFiles(projectRoot,response.files);let repairAttempts=0;for(const command of response.commands){while(true){try{await runCommand(projectRoot,command);break}catch(error){const failure=commandFailure(error,command);if(!repair||repairAttempts>=2){failure.repairAttempts=repairAttempts;throw failure}const replacement=await repair(failure,++repairAttempts);await writeGeneratedFiles(projectRoot,replacement.files)}}}return {filesCreated:response.files.length,commandsPassed:response.commands.length,repairAttempts}}

function repairPrompt(failure:CommandFailure,attempt:number){return `The generated project failed verification. Repair attempt ${attempt} of 2.
Failed command: ${failure.command}
Exit code: ${failure.exitCode}
Output:
${failure.output.slice(-12_000)}

Return ONLY valid JSON with complete replacement file contents in this shape:
{"files":[{"path":"relative/path","content":"<complete replacement file content>"}]}
No markdown fences, explanation, or commands. Use only relative paths.`}

export async function runSimpleDeepSeek(projectRoot:string,task:string){
 projectRoot=path.resolve(projectRoot);await fs.mkdir(projectRoot,{recursive:true});
 const profile=path.join(appDir(),'chromium-profile');
 await fs.mkdir(profile,{recursive:true});
 const context=await chromium.launchPersistentContext(profile,{headless:false});
 try{
  const page=context.pages()[0]||await context.newPage();
  await page.goto('https://chat.deepseek.com/',{waitUntil:'domcontentloaded',timeout:60_000});
  console.log('Waiting for DeepSeek chat input. Log in once in Chromium if needed...');
  const input=await findChatInput(page),assistantMessages=page.locator('.ds-assistant-message-main-content'),baseline=await assistantMessages.count(),baselineLastText=baseline?await assistantMessages.last().innerText():'';
  await input.click();await input.fill(promptFor(task));await input.press('Enter');
  console.log('Message sent. Waiting for DeepSeek JSON response...');
  const response=await waitForNewResponse(page,baseline,baselineLastText);
  return await applyGeneratedResponse(projectRoot,response,async(failure,attempt)=>{
   const repairBaseline=await assistantMessages.count(),repairBaselineLastText=repairBaseline?await assistantMessages.last().innerText():'',repairInput=await findChatInput(page);
   await repairInput.click();await repairInput.fill(repairPrompt(failure,attempt));await repairInput.press('Enter');
   return await waitForNewResponse(page,repairBaseline,repairBaselineLastText);
  });
 }finally{await context.close()}
}
