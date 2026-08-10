import type {WorkflowEvent} from './simpleDeepSeek.js';

type Output={write(value:string):unknown;isTTY?:boolean};
type CliFailure=Error&{command?:string;exitCode?:number|string;output?:string;repairAttempts?:number};

const ansiPattern=/\x1B\[[0-?]*[ -/]*[@-~]/g;

const PET={
 idle:'|^ᴗ^|',
 opening:'|•ᴗ•|',
 planning:'|•_•|',
 writing:'|^ᴗ^|',
 running:'|>ᴗ<|',
 repairing:'|;ᴗ;|',
 success:'|^o^|',
 error:'|x_x|',
} as const;

export class TerminalUi{
 private readonly ansi:boolean;

 constructor(
  private readonly plain:boolean,
  private readonly stdout:Output=process.stdout,
  private readonly stderr:Output=process.stderr
 ){
  this.ansi=!plain&&Boolean(stdout.isTTY);
 }

 private style(code:number,text:string){
  return this.ansi?`\x1b[${code}m${text}\x1b[0m`:text;
 }

 private line(text=''){
  this.stdout.write(`${text}\n`);
 }

 private pet(face:string,message:string){
  const plainMessage=message.replace(/^Mipi (?:is )?/,'');
  this.line(this.plain?plainMessage:`${face} ${message}`);
 }

 header(){
  this.line(this.style(1,'FreeAgent'));
  this.line('local browser-powered coding agent');

  if(!this.plain){
   this.line();
   this.line('        .              *');
   this.line('   *           .');
   this.line();
   this.line(`            ${PET.idle}`);
   this.line('             Mipi');
   this.line();
   this.line('   your tiny coding companion');
  }

  this.line();
 }

 report(event:WorkflowEvent){
  if(event.type==='idle'){
   this.pet(PET.opening,'Mipi is opening DeepSeek...');
  }
  else if(event.type==='planning'){
   this.pet(PET.planning,'Mipi is planning the project...');
  }
  else if(event.type==='plan'){
   this.line();
   this.line(this.style(1,'Plan'));
   this.line(`  ${event.files} files`);
   this.line(`  ${event.commands} commands`);
   this.line();
  }
  else if(event.type==='writing'){
   const action=event.repairAttempt?'rewriting':'writing';
   this.pet(PET.writing,`Mipi is ${action} ${event.path} [${event.index}/${event.total}]`);
  }
  else if(event.type==='command'){
   if(event.command==='npm install'){
    this.pet(PET.running,'Mipi is installing dependencies...');
   }
   else if(event.command==='npm run build'){
    this.pet(PET.running,'Mipi is building the project...');
   }
   else{
    this.pet(PET.running,`Mipi is running ${event.command}`);
   }
  }
  else if(event.type==='repairing'){
   this.pet(PET.repairing,`Mipi is fixing the project... attempt ${event.attempt}/2`);
  }
 }

 success(files:number,commands:number){
  if(!this.plain){
   this.line();
   this.pet(PET.success,'Mipi finished!');
  }

  this.line();
  this.line(this.style(32,'SUCCESS'));
  this.line(`Files: ${files}`);
  this.line(`Commands: ${commands}`);
 }

 failure(error:unknown){
  const value=(error instanceof Error?error:new Error(String(error))) as CliFailure;

  const lines=this.plain
   ? ['FAILED']
   : [`${PET.error} Mipi could not finish this task.`,'FAILED'];

  if(value.command)lines.push(`Command: ${value.command}`);
  if(value.exitCode!==undefined)lines.push(`Exit code: ${value.exitCode}`);
  if(value.repairAttempts!==undefined)lines.push(`Repair attempts: ${value.repairAttempts}`);
  if(!value.command)lines.push(value.message);

  const tail=value.output?.slice(-3000).trim();

  if(tail){
   lines.push(
    'Error tail:',
    this.plain?tail.replace(ansiPattern,''):tail
   );
  }

  this.stderr.write(`${lines.join('\n')}\n`);
 }
}