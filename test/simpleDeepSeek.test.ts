import {describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {COMPLETION_SENTINEL,executeProjectPlan,extractFileContent,parseProjectManifest,requestWithProtocolRetry,runDeepSeekWorkflow,writeGeneratedFiles} from '../src/simpleDeepSeek.js';

const response=(code:string)=>({text:`response\n${COMPLETION_SENTINEL}`,codeBlocks:[code]});
const failure=(command='npm run build')=>Object.assign(new Error('failed'),{command,exitCode:1,output:'build error'});

describe('simple DeepSeek manifest workflow',()=>{
 it('parses a fenced project manifest',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'fa-manifest-')),json='{"files":["package.json","src/index.js"],"commands":["npm install","npm run build"]}',parsed=parseProjectManifest({text:`\`\`\`json\n${json}\n\`\`\`\n${COMPLETION_SENTINEL}`,codeBlocks:[]},root);expect(parsed).toEqual({files:['package.json','src/index.js'],commands:['npm install','npm run build']})});

 it('rejects unsafe manifest paths',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'fa-unsafe-'));expect(()=>parseProjectManifest(response('{"files":["../escape.js"],"commands":[]}'),root)).toThrow('escapes project root')});

 it('rejects unsupported commands before generation or execution',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'fa-command-'));let generated=false,executed=false;const work=executeProjectPlan(root,{files:['index.js'],commands:['npm run build && whoami']},async()=>{generated=true;return ''},undefined,async()=>{executed=true});await expect(work).rejects.toThrow('Unsafe command rejected');expect({generated,executed}).toEqual({generated:false,executed:false})});

 it('extracts pre/code textContent without changing source',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'fa-exact-')),source='/** @type {import(\'next\').NextConfig} */\n`template literal`\n${value}\n"quotes"\n<div>HTML</div>\n.x { color: red; }\nПривет ✓',content=extractFileContent(response(source));await writeGeneratedFiles(root,[{path:'src/nested/exact.js',content}]);expect(await fs.readFile(path.join(root,'src/nested/exact.js'))).toEqual(Buffer.from(source,'utf8'))});

 it('does not truncate source larger than 20,000 characters',()=>{const source=`start\n${'x'.repeat(25_000)}\nend`;expect(extractFileContent(response(source))).toBe(source)});

 it('runs task, manifest, individual files, and approved commands end to end',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'fa-flow-')),events:string[]=[],files:Record<string,string>={'package.json':'{"scripts":{"build":"ok"}}','src/index.js':'export default 1'},replies=[response(JSON.stringify({files:Object.keys(files),commands:['npm install','npm run build']})),response(files['package.json']),response(files['src/index.js'])];const result=await runDeepSeekWorkflow(root,'build it',async prompt=>{events.push(`request:${prompt.includes('Plan a complete')?'manifest':'file'}`);return replies.shift()!},async(_root,command)=>{events.push(`command:${command}`)});expect(await fs.readFile(path.join(root,'src/index.js'),'utf8')).toBe(files['src/index.js']);expect(events).toEqual(['request:manifest','request:file','request:file','command:npm install','command:npm run build']);expect(result).toEqual({filesCreated:2,commandsPassed:2,repairAttempts:0})});

 it('uses a targeted repair manifest and regenerates only its files',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'fa-repair-'));let runs=0;const prompts:string[]=[],replies=[response('{"files":["index.js","style.css"],"commands":["npm run build"]}'),response('broken'),response('body{}'),response('{"files":["index.js"]}'),response('fixed')];const result=await runDeepSeekWorkflow(root,'repair me',async prompt=>{prompts.push(prompt);return replies.shift()!},async()=>{runs++;if((await fs.readFile(path.join(root,'index.js'),'utf8'))!=='fixed')throw failure()});expect({runs,result}).toEqual({runs:2,result:{filesCreated:2,commandsPassed:1,repairAttempts:1}});expect(prompts).toHaveLength(5);expect(prompts[3]).toContain('Failed command: npm run build');expect(prompts[4]).toContain('exactly this file:\nindex.js')});

 it('stops repair after two attempts',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'fa-stop-'));let repairs=0,runs=0;const work=executeProjectPlan(root,{files:['index.js'],commands:['npm run build']},async(_file,attempt)=>`attempt ${attempt}`,async()=>{repairs++;return ['index.js']},async()=>{runs++;throw failure()});await expect(work).rejects.toMatchObject({repairAttempts:2});expect({repairs,runs}).toEqual({repairs:2,runs:3})});

 it('corrects one protocol violation instead of hanging',async()=>{let requests=0;const content=await requestWithProtocolRetry('initial','correction',async prompt=>{requests++;return prompt==='initial'?{text:COMPLETION_SENTINEL,codeBlocks:[]}:response('fixed')},extractFileContent);expect({requests,content}).toEqual({requests:2,content:'fixed'})});
});
