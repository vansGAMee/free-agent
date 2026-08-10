import {describe,it,expect} from 'vitest';
import {parseCliInvocation,positionalProject} from '../src/cliArgs.js';
import {TerminalUi} from '../src/terminalUi.js';

describe('CLI arguments',()=>{
 it('accepts the first positional project path',()=>expect(positionalProject(['C:\\Users\\me\\project'])).toBe('C:\\Users\\me\\project'));
 it('does not treat option values as the project',()=>expect(positionalProject(['--provider','deepseek','C:\\work'])).toBe('C:\\work'));
 it('parses freecodex dot and task',()=>expect(parseCliInvocation(['.','Create a landing page'],'C:\\cwd')).toMatchObject({project:'.',task:'Create a landing page'}));
 it('uses cwd when only a task is supplied',()=>expect(parseCliInvocation(['Create a landing page'],'C:\\current')).toMatchObject({project:'C:\\current',task:'Create a landing page'}));
 it('supports plain mode',()=>expect(parseCliInvocation(['--plain','.','task'])).toMatchObject({project:'.',task:'task',plain:true}));
 it('fails cleanly when the task is missing',()=>expect(()=>parseCliInvocation(['.'])).toThrow('Example: freecodex .'));
 it('preserves the existing project and task options',()=>expect(parseCliInvocation(['C:\\work','--task','Build it'])).toMatchObject({project:'C:\\work',task:'Build it'}));
});

describe('terminal UI',()=>{it('keeps plain output readable and ANSI-free',()=>{let text='';const output={isTTY:true,write(value:string){text+=value}};const ui=new TerminalUi(true,output,output);ui.header();ui.report({type:'planning'});ui.report({type:'writing',path:'index.html',index:1,total:1});ui.success(1,0);expect(text).toContain('FreeAgent');expect(text).toContain('writing index.html');expect(text).toContain('SUCCESS');expect(text).not.toContain('\x1b[');expect(text).not.toContain('Mipi')})});
