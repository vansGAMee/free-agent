import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium,type Locator,type Page} from 'playwright';
import {appDir} from './config.js';

export const COMPLETION_SENTINEL='FREEAGENT_END';
export interface ProjectManifest{files:string[];commands:string[]}
export interface GeneratedFile{path:string;content:string}
export interface AssistantResponse{text:string;codeBlocks:string[]}
export interface CommandFailure extends Error{command:string;exitCode:number|string;output:string;repairAttempts?:number}
export type CommandRunner=(projectRoot:string,command:string)=>Promise<void>;
export type FileGenerator=(relativePath:string,repairAttempt:number)=>Promise<string>;
export type RepairPlanner=(failure:CommandFailure,attempt:number)=>Promise<string[]>;
export type AssistantRequester=(prompt:string)=>Promise<AssistantResponse>;
export type WorkflowEvent=
 |{type:'idle'}
 |{type:'planning'}
 |{type:'plan';files:number;commands:number}
 |{type:'writing';path:string;index:number;total:number;repairAttempt?:number}
 |{type:'command';command:string}
 |{type:'repairing';attempt:number};
export type ProgressReporter=(event:WorkflowEvent)=>void;
type ResponseBaseline={count:number;lastText:string};

const defaultProgressReporter:ProgressReporter=event=>{if(event.type==='idle')console.log('Waiting for DeepSeek chat input. Log in once in Chromium if needed...');else if(event.type==='plan')console.log(`Plan: ${event.files} files, ${event.commands} commands`);else if(event.type==='writing')console.log(`${event.repairAttempt?'Repairing':'Generating'} ${event.index}/${event.total}: ${event.path}`);else if(event.type==='command')console.log(`Running: ${event.command}`)};

function manifestPrompt(task:string){return `Plan a complete local project for this user task:
${task}

Return exactly ONE fenced JSON code block in this shape:
\`\`\`json
{"files":["package.json","src/example.js"],"commands":["npm install","npm run build"]}
\`\`\`
${COMPLETION_SENTINEL}

The files array must contain only relative file paths. Do not include file contents. Do not add explanation.`}

function manifestCorrectionPrompt(){return `Protocol correction: return exactly one fenced JSON code block containing only a project manifest with string arrays "files" and "commands". Do not include file contents or explanation. After the code block output exactly ${COMPLETION_SENTINEL}.`}

function filePrompt(relativePath:string,task:string,knownFiles:string[],repairAttempt:number){return `Generate the complete content for exactly this file:
${relativePath}

It must satisfy the original user task:
${task}

It must remain compatible with these project files:
${knownFiles.join('\n')}
${repairAttempt?`This is repair attempt ${repairAttempt}; replace the complete file.`:''}

Return exactly ONE fenced code block containing the COMPLETE file content.
After the code block output exactly:
${COMPLETION_SENTINEL}

No explanation. Do not omit unchanged sections. Do not return JSON. Do not return another file.`}

function fileCorrectionPrompt(relativePath:string){return `Protocol correction for ${relativePath}: return exactly one fenced code block containing only that file's complete content, then output exactly ${COMPLETION_SENTINEL}. No explanation, JSON, or other files.`}

function repairManifestPrompt(failure:CommandFailure,attempt:number,task:string,knownFiles:string[]){return `Repair attempt ${attempt} of 2 for this project.
Original task:
${task}

Known project files:
${knownFiles.join('\n')}

Failed command: ${failure.command}
Exit code: ${failure.exitCode}
Output tail:
${failure.output.slice(-12_000)}

Return exactly ONE fenced JSON code block naming only the files that must be regenerated:
\`\`\`json
{"files":["src/example.js"]}
\`\`\`
${COMPLETION_SENTINEL}

No commands, file contents, or explanation.`}

function repairCorrectionPrompt(){return `Protocol correction: return exactly one fenced JSON code block with a non-empty "files" string array naming only existing planned files, then output exactly ${COMPLETION_SENTINEL}. No commands, contents, or explanation.`}

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

function hasCompletionSentinel(text:string){return text.trimEnd().endsWith(COMPLETION_SENTINEL)}

async function baseline(messages:Locator):Promise<ResponseBaseline>{const count=await messages.count();return {count,lastText:count?(await messages.last().textContent().catch(()=>null))??'':''}}

async function codeBlockTexts(message:Locator){
 let blocks=message.locator('pre code');
 if(await blocks.count()===0)blocks=message.locator('pre');
 const values:string[]=[];
 for(let i=0;i<await blocks.count();i++)values.push((await blocks.nth(i).textContent().catch(()=>null))??'');
 return values;
}

async function waitForCompletedResponse(page:Page,start:{count:number;lastText:string},timeoutMs=300_000):Promise<AssistantResponse>{
 const messages=page.locator('.ds-assistant-message-main-content');
 const end=Date.now()+timeoutMs;
 let previousText='';
 let lastChangeAt=Date.now();
 let sawNewResponse=false;

 while(Date.now()<end){
  const count=await messages.count();

  if(count>0){
   const message=messages.last();
   const text=(await message.textContent().catch(()=>null))??'';
   const isNew=text!==start.lastText;

   if(isNew){
    sawNewResponse=true;

    if(text!==previousText){
     previousText=text;
     lastChangeAt=Date.now();
    }

    if(hasCompletionSentinel(text)){
     return {text,codeBlocks:await codeBlockTexts(message)};
    }

    // DeepSeek sometimes finishes a response but omits FREEAGENT_END.
    // Return a stable completed-looking response so the protocol parser
    // can reject it and request one correction instead of hanging.
    if(text.trim()&&Date.now()-lastChangeAt>=8_000){
     return {text,codeBlocks:await codeBlockTexts(message)};
    }
   }
  }

  await page.waitForTimeout(500);
 }

 if(sawNewResponse)throw new Error(`DeepSeek response became stable but did not satisfy the protocol.`);
 throw new Error(`DeepSeek response timed out before ${COMPLETION_SENTINEL}.`);
}

function fencedBlocks(text:string){return [...text.matchAll(/```(?:json)?[^\S\r\n]*(?:\r?\n)?([\s\S]*?)```/gi)].map(match=>match[1])}

function jsonFromResponse(response:AssistantResponse){
 if(!hasCompletionSentinel(response.text))throw new Error(`Response is missing ${COMPLETION_SENTINEL}.`);
 const blocks=response.codeBlocks.length?response.codeBlocks:fencedBlocks(response.text);
 if(blocks.length!==1)throw new Error('Expected exactly one fenced JSON code block.');
 try{return JSON.parse(blocks[0]) as unknown}catch{throw new Error('Invalid JSON manifest.')}
}

function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Manifest must be a JSON object.');return value as Record<string,unknown>}

function resolveOutput(projectRoot:string,relative:string){
 if(!relative||path.win32.isAbsolute(relative)||path.posix.isAbsolute(relative)||relative.includes('\0'))throw new Error(`Unsafe file path from DeepSeek: ${relative}`);
 const root=path.resolve(projectRoot),target=path.resolve(root,relative);
 if(target===root||!target.startsWith(root+path.sep))throw new Error(`File path escapes project root: ${relative}`);
 return target;
}

function validateFilePaths(projectRoot:string,value:unknown,knownFiles?:string[]){
 if(!Array.isArray(value)||!value.length||!value.every(item=>typeof item==='string'))throw new Error('Manifest files must be a non-empty string array.');
 const files=value as string[],seen=new Set<string>(),known=knownFiles?new Set(knownFiles.map(file=>resolveOutput(projectRoot,file).toLowerCase())):null;
 for(const file of files){const target=resolveOutput(projectRoot,file),key=target.toLowerCase();if(seen.has(key))throw new Error(`Duplicate file path: ${file}`);if(known&&!known.has(key))throw new Error(`Repair path was not in the project manifest: ${file}`);seen.add(key)}
 return [...files];
}

export function parseAllowedNpmCommand(command:string){const parts=command.trim().split(/\s+/);if(parts[0]!=='npm')throw new Error(`Unsafe command rejected: ${command}`);if(parts[1]==='install'&&parts.slice(2).every(part=>/^[A-Za-z0-9@][A-Za-z0-9@._/+~-]*$/.test(part)))return parts.slice(1);if(parts[1]==='run'&&parts.length===3&&/^[A-Za-z0-9_.:-]+$/.test(parts[2]))return parts.slice(1);throw new Error(`Unsafe command rejected: ${command}`)}

export function validateProjectManifest(projectRoot:string,value:unknown):ProjectManifest{
 const manifest=record(value),files=validateFilePaths(projectRoot,manifest.files);
 if(!Array.isArray(manifest.commands)||!manifest.commands.every(command=>typeof command==='string'))throw new Error('Manifest commands must be a string array.');
 const commands=manifest.commands as string[];commands.forEach(parseAllowedNpmCommand);
 return {files,commands:[...commands]};
}

export function parseProjectManifest(response:AssistantResponse,projectRoot:string){return validateProjectManifest(projectRoot,jsonFromResponse(response))}

export function parseRepairManifest(response:AssistantResponse,projectRoot:string,knownFiles:string[]){const value=record(jsonFromResponse(response));if('commands' in value)throw new Error('Repair manifest must not contain commands.');return validateFilePaths(projectRoot,value.files,knownFiles)}

export function extractFileContent(response:AssistantResponse){if(!hasCompletionSentinel(response.text))throw new Error(`Response is missing ${COMPLETION_SENTINEL}.`);if(response.codeBlocks.length!==1)throw new Error('Expected exactly one fenced source code block.');return response.codeBlocks[0]}

export async function requestWithProtocolRetry<T>(initialPrompt:string,correctionPrompt:string,request:(prompt:string)=>Promise<AssistantResponse>,parse:(response:AssistantResponse)=>T){let error:unknown;for(const prompt of [initialPrompt,correctionPrompt]){try{return parse(await request(prompt))}catch(caught){error=caught}}throw error}

export async function writeGeneratedFiles(projectRoot:string,files:GeneratedFile[]){for(const file of files){const target=resolveOutput(projectRoot,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.content,'utf8')}}

async function runNpm(projectRoot:string,command:string,timeoutMs=600_000){
 const npmArgs=parseAllowedNpmCommand(command);
 const npmExecPath=process.env.npm_execpath;

 const executable=process.platform==='win32'
  ? npmExecPath
   ? process.execPath
   : process.env.ComSpec||'cmd.exe'
  : 'npm';

 const args=process.platform==='win32'
  ? npmExecPath
   ? [npmExecPath,...npmArgs]
   : ['/d','/s','/c','npm.cmd',...npmArgs]
  : npmArgs;

 return new Promise<void>((resolve,reject)=>{
  const child=spawn(executable,args,{
   cwd:projectRoot,
   shell:false,
   windowsHide:true
  });

  let output='';
  let timedOut=false;
  let settled=false;

  const collect=(chunk:Buffer)=>{
   const text=chunk.toString();
   process.stdout.write(text);
   output=(output+text).slice(-12_000);
  };

  child.stdout.on('data',collect);
  child.stderr.on('data',collect);

  const timer=setTimeout(()=>{
   timedOut=true;
   console.error(`Command timed out after ${timeoutMs}ms: ${command}`);
   child.kill();
  },timeoutMs);

  child.on('error',error=>{
   if(settled)return;
   settled=true;
   clearTimeout(timer);
   reject(Object.assign(error,{
    command,
    exitCode:'spawn error',
    output
   }));
  });

  child.on('close',(code,signal)=>{
   if(settled)return;
   settled=true;
   clearTimeout(timer);

   if(code===0){
    resolve();
    return;
   }

   const exitCode=timedOut
    ? 'timeout'
    : code!==null
      ? code
      : signal
        ? `signal ${signal}`
        : 'unknown';

   reject(Object.assign(
    new Error(timedOut?`Command timed out: ${command}`:`Command failed: ${command}`),
    {command,exitCode,output}
   ));
  });
 });
}

function commandFailure(error:unknown,command:string){const failure=(error instanceof Error?error:new Error(String(error))) as CommandFailure;failure.command||=command;failure.exitCode??='unknown';failure.output??='';return failure}

export async function executeProjectPlan(projectRoot:string,value:ProjectManifest,generateFile:FileGenerator,planRepair?:RepairPlanner,runCommand:CommandRunner=runNpm,report:ProgressReporter=defaultProgressReporter){
 const manifest=validateProjectManifest(projectRoot,value);let repairAttempts=0;
 report({type:'plan',files:manifest.files.length,commands:manifest.commands.length});
 for(let i=0;i<manifest.files.length;i++){const file=manifest.files[i];report({type:'writing',path:file,index:i+1,total:manifest.files.length});await writeGeneratedFiles(projectRoot,[{path:file,content:await generateFile(file,0)}])}
 for(const command of manifest.commands){
  while(true){
   try{report({type:'command',command});await runCommand(projectRoot,command);break}catch(error){
    const failure=commandFailure(error,command);
    if(!planRepair||repairAttempts>=2){failure.repairAttempts=repairAttempts;throw failure}
    report({type:'repairing',attempt:++repairAttempts});
    const repairFiles=validateFilePaths(projectRoot,await planRepair(failure,repairAttempts),manifest.files);
    for(let i=0;i<repairFiles.length;i++){const file=repairFiles[i];report({type:'writing',path:file,index:i+1,total:repairFiles.length,repairAttempt:repairAttempts});await writeGeneratedFiles(projectRoot,[{path:file,content:await generateFile(file,repairAttempts)}])}
    if(command!=='npm install'&&repairFiles.some(file=>file.toLowerCase()==='package.json')&&manifest.commands.includes('npm install')){report({type:'command',command:'npm install'});await runCommand(projectRoot,'npm install')}
   }
  }
 }
 return {filesCreated:manifest.files.length,commandsPassed:manifest.commands.length,repairAttempts};
}

export async function runDeepSeekWorkflow(projectRoot:string,task:string,request:AssistantRequester,runCommand:CommandRunner=runNpm,report:ProgressReporter=defaultProgressReporter){
 report({type:'planning'});
 const manifest=await requestWithProtocolRetry(manifestPrompt(task),manifestCorrectionPrompt(),request,response=>parseProjectManifest(response,projectRoot));
 const generateFile:FileGenerator=async(file,attempt)=>requestWithProtocolRetry(filePrompt(file,task,manifest.files,attempt),fileCorrectionPrompt(file),request,extractFileContent);
 const planRepair:RepairPlanner=async(failure,attempt)=>requestWithProtocolRetry(repairManifestPrompt(failure,attempt,task,manifest.files),repairCorrectionPrompt(),request,response=>parseRepairManifest(response,projectRoot,manifest.files));
 return await executeProjectPlan(projectRoot,manifest,generateFile,planRepair,runCommand,report);
}

export async function runSimpleDeepSeek(projectRoot:string,task:string,report:ProgressReporter=defaultProgressReporter){
 projectRoot=path.resolve(projectRoot);await fs.mkdir(projectRoot,{recursive:true});
 const profile=path.join(appDir(),'chromium-profile');await fs.mkdir(profile,{recursive:true});
 const context=await chromium.launchPersistentContext(profile,{headless:false});
 try{
  const page=context.pages()[0]||await context.newPage();
  await page.goto('https://chat.deepseek.com/',{waitUntil:'domcontentloaded',timeout:60_000});
  report({type:'idle'});
  const messages=page.locator('.ds-assistant-message-main-content');
  const request=async(prompt:string)=>{const start=await baseline(messages),input=await findChatInput(page);await input.click();await input.fill(prompt);await input.press('Enter');return await waitForCompletedResponse(page,start)};
  return await runDeepSeekWorkflow(projectRoot,task,request,runNpm,report);
 }finally{await context.close()}
}
