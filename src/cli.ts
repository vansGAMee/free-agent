#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline/promises';
import {stdin as input,stdout as output} from 'node:process';
import {optionValue,positionalProject} from './cliArgs.js';
import {runSimpleDeepSeek} from './simpleDeepSeek.js';

const args=process.argv.slice(2);
async function main(){
 const project=optionValue(args,'--project')||positionalProject(args);
 if(!project)throw new Error('Pass the project folder as the first argument.');
 const rl=readline.createInterface({input,output});
 const task=optionValue(args,'--task')||await rl.question('Task: ');
 rl.close();
 if(!task.trim())throw new Error('Task is empty.');
 const result=await runSimpleDeepSeek(path.resolve(project),task.trim());
 console.log(`SUCCESS\nFiles created: ${result.filesCreated}\nCommands passed: ${result.commandsPassed}`);
}
main().catch(error=>{if(error.command)console.error(`FAILED\nCommand: ${error.command}\nExit code: ${error.exitCode}${error.repairAttempts!==undefined?`\nRepair attempts: ${error.repairAttempts}`:''}`);else console.error(`FAILED: ${error.message}`);process.exitCode=1});
