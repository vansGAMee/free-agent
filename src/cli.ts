#!/usr/bin/env node
import path from 'node:path';
import {parseCliInvocation} from './cliArgs.js';
import {runSimpleDeepSeek} from './simpleDeepSeek.js';
import {TerminalUi} from './terminalUi.js';

const HELP=`Usage:
  freecodex [project-path] "task"
  freecodex "task"

Options:
  --plain       disable Mipi/ANSI decoration
  --help        show help
  --version     show version`;
const VERSION='0.1.0';

async function main(){
 const invocation=parseCliInvocation(process.argv.slice(2));
 if(invocation.help){console.log(HELP);return}
 if(invocation.version){console.log(VERSION);return}
 const ui=new TerminalUi(invocation.plain);ui.header();
 try{const result=await runSimpleDeepSeek(path.resolve(invocation.project),invocation.task,event=>ui.report(event));ui.success(result.filesCreated,result.commandsPassed)}catch(error){ui.failure(error);process.exitCode=1}
}

main().catch(error=>{console.error(`FAILED\n${error instanceof Error?error.message:String(error)}`);process.exitCode=1});
