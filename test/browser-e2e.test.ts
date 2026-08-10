import {describe,it,expect,afterAll} from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {BrowserChat} from '../src/browser.js';
import {getProvider} from '../src/providers.js';
import {runAgent} from '../src/agent.js';
import type {Settings} from '../src/config.js';

const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',available=process.platform==='win32'&&fs.existsSync(edge);
let server:http.Server|undefined,profile='';
afterAll(async()=>{if(server)await new Promise<void>(r=>server!.close(()=>r()));if(profile)await fsp.rm(profile,{recursive:true,force:true}).catch(()=>{})});

describe.runIf(available)('Chromium randomized DOM fixture',()=>{
 it('uses persistent Playwright and picks the best of multiple semantic inputs',async()=>{
  const random=()=>Math.random().toString(36).slice(2);
  server=http.createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(`<!doctype html><body><nav><input role="textbox" aria-label="Search navigation"></nav><main class="${random()}"><div class="${random()}"><div contenteditable="true" role="textbox" aria-label="Secondary notes"></div><textarea aria-label="Message DeepSeek" placeholder="Message DeepSeek"></textarea></div><article></article><section aria-live="polite"></section></main><script>const q=document.querySelector('textarea'),u=document.querySelector('article'),o=document.querySelector('section');q.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();const prompt=q.value;u.innerText=prompt;q.value='';const x=/<<<FA_BEGIN:([^:]+):(\\d+)>>>/.exec(prompt);if(!x)return;const n=x[1],t=+x[2],b='<<<FA_BEGIN:'+n+':'+t+'>>>',z='<<<FA_END:'+n+':'+t+'>>>';setTimeout(()=>{o.innerText=b+'\\n<<<WRITE path="package.json">>>\\n{"scripts":{"build":"node --check index.js"}}\\n<<<END_WRITE>>>\\n<<<WRITE path="index.js">>>\\nconsole.log("FREEAGENT_OK")\\n<<<END_WRITE>>>\\n<<<DONE>>>\\ntrue\\n<<<END_DONE>>>\\n'+z},120)});</script>`)});
  await new Promise<void>(r=>server!.listen(0,'127.0.0.1',()=>r()));const address=server.address();if(!address||typeof address==='string')throw new Error('fixture address');
  const url=`http://127.0.0.1:${address.port}`,root=await fsp.mkdtemp(path.join(os.tmpdir(),'fa-browser-'));profile=await fsp.mkdtemp(path.join(os.tmpdir(),'fa-profile-'));
  const chat=new BrowserChat(getProvider('generic',url));await chat.launch(edge,profile,{headless:true});
  try{const cfg:Settings={defaultProvider:'generic',browserExecutable:edge,maxTurns:2,commandTimeoutMs:5000};const result=await runAgent(root,'create a checked Node file','generic',chat,cfg);expect(result.session.phase).toBe('VERIFIED');expect(await fsp.readFile(path.join(root,'index.js'),'utf8')).toContain('FREEAGENT_OK')}finally{await chat.close()}
 },20_000);
});
