import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium, type BrowserContext, type Page, type Locator} from 'playwright-core';
import {appDir} from './config.js';
import type {ProviderAdapter} from './providers.js';

const windows=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
const linux=['/usr/bin/chromium','/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/brave-browser'];
export async function discoverBrowser(explicit?:string|null){for(const p of [explicit,...(process.platform==='win32'?windows:linux)].filter(Boolean) as string[])try{await fs.access(p);return p}catch{}throw new Error(process.platform==='win32'?'Install Microsoft Edge, Chrome, or Chromium, or pass --browser <path>.':'Install Chromium (for Arch: pacman -S chromium), or pass --browser <path>.')}

export class BrowserChat {
 context?:BrowserContext;
 page?:Page;
 private submittedBaselines=new Map<string,number>();
 constructor(public adapter:ProviderAdapter){}
 async launch(executable:string,profile=path.join(appDir(),'browser-profile'),options:{headless?:boolean}={}){await fs.mkdir(profile,{recursive:true});this.context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:options.headless??false,args:['--no-first-run','--no-default-browser-check']});this.page=this.context.pages()[0]||await this.context.newPage();await this.page.goto(this.adapter.url,{waitUntil:'domcontentloaded',timeout:60_000})}
 private async bestInput():Promise<Locator|null>{const page=this.page;if(!page)throw new Error('Browser is not launched');const candidates=page.locator('textarea, [contenteditable="true"], [role="textbox"], input:not([type]), input[type="text"]'),hints=this.adapter.inputHints.map(x=>x.toLowerCase());const best=await candidates.evaluateAll((elements,hints)=>elements.map((element,index)=>{const e=element as HTMLElement,r=e.getBoundingClientRect(),style=getComputedStyle(e);if(r.width<80||r.height<20||style.visibility==='hidden'||style.display==='none'||style.opacity==='0'||e.getAttribute('aria-disabled')==='true'||(e as HTMLInputElement).disabled)return {index,score:-Infinity};const label=[e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.getAttribute('role'),e.getAttribute('data-placeholder')].filter(Boolean).join(' ').toLowerCase();let score=(e.tagName==='TEXTAREA'?30:0)+(e.isContentEditable?25:0)+(e.getAttribute('role')==='textbox'?15:0)+(r.top/innerHeight)*25+(hints.some(h=>label.includes(h))?40:0);if(/search|navigation|email|password/.test(label))score-=100;return {index,score}}).sort((a,b)=>b.score-a.score)[0],hints);return best&&Number.isFinite(best.score)&&best.score>0?candidates.nth(best.index):null}
 async waitForInput(timeoutMs=this.adapter.timeoutMs){const end=Date.now()+timeoutMs;while(Date.now()<end){const input=await this.bestInput();if(input)return input;await this.page?.waitForTimeout(500)}throw new Error('Timed out waiting for the chat input. Complete DeepSeek login in the opened browser.')}
 async visibleText(){if(!this.page)throw new Error('Browser is not launched');return this.page.locator('body').innerText().catch(()=> '')}
 async count(text:string){return (await this.visibleText()).split(text).length-1}
 async send(text:string){const input=await this.waitForInput(),marker=text.match(/<<<FA_END:[^>]+>>>/)?.[0],before=marker?await this.count(marker):0;await input.click();await input.fill(text);if(this.adapter.enterSubmits)await input.press('Enter');else throw new Error('Provider does not define an automatic submit method');if(marker){for(let i=0;i<40;i++){const count=await this.count(marker);if(count>before){this.submittedBaselines.set(marker,count);break}await this.page?.waitForTimeout(25)}}}
 async waitFor(marker:string,baseline:number,timeout:number){baseline=Math.max(baseline,this.submittedBaselines.get(marker)??baseline);const end=Date.now()+timeout;while(Date.now()<end){if(await this.count(marker)>baseline)return await this.visibleText();await this.page?.waitForTimeout(750)}const body=(await this.visibleText()).toLowerCase();if(/captcha|rate limit|too many requests/.test(body))throw new Error('Provider appears rate-limited or blocked by CAPTCHA');throw new Error('Timed out waiting for a complete model response')}
 async close(){await this.context?.close()}
}
