const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','viewer.js'),'utf8');
const start=source.indexOf('var Bc=Object.freeze(');
const end=source.indexOf('var _d=',start);
if(start<0||end<0)throw new Error('Could not locate the bundled expression parser in viewer.js');
const context={Math,Object,Number,Set,Error};
vm.createContext(context);
vm.runInContext(source.slice(start,end)+'\nglobalThis.__compileStudentVizExpression=cn;',context);
const compile=context.__compileStudentVizExpression;

const validationEnd=source.indexOf('function Cr(',start);
if(validationEnd<0)throw new Error('Could not locate the bundled StudentViz validator in viewer.js');
const validationContext={Math,Object,Number,Set,Error,JSON};
vm.createContext(validationContext);
// Extract the renderer's validation helpers without instantiating its WebGL scene.
vm.runInContext(source.slice(start,validationEnd)+'\nglobalThis.__validateStudentViz=Gc;',validationContext);
const validate=validationContext.__validateStudentViz;

test('the repaired DeepSeek expression compiles and returns the expected cubic value',()=>{
 const fn=compile('(4/3)*pi*x^3',['x']);
 assert.ok(Math.abs(fn({x:3})-36*Math.PI)<1e-10);
});

test('supported implicit-multiplication repairs compile correctly',()=>{
 const cases=[
  ['2*x+1',['x'],{x:3},7],
  ['2*sin(x)',['x'],{x:Math.PI/2},2],
  ['(x+1)*(x-1)',['x'],{x:4},15],
  ['sqrt(x^2)',['x'],{x:3},3],
  ['pi*r^2',['r'],{r:2},4*Math.PI],
  ['(x>0)?x:-x',['x'],{x:-5},5]
 ];
 for(const [expression,names,values,expected] of cases){
  const result=compile(expression,names)(values);
  assert.ok(Math.abs(result-expected)<1e-9,`${expression} returned ${result}`);
 }
});

test('unknown identifiers and executable syntax are rejected rather than evaluated',()=>{
 assert.throws(()=>compile('pix^3',['x']),/Unknown expression token/);
 assert.throws(()=>compile('alert(1)',['x']),/Unknown expression token/);
 assert.throws(()=>compile('x.constructor(1)',['x']),/Unexpected expression token/);
});


test('the screenshot-like repaired StudentViz spec passes the real viewer validator',()=>{
 const repairContext={console};
 vm.createContext(repairContext);
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','repair.js'),'utf8'),repairContext);
 const raw={
  $schema:'studentviz/v1',type:'plot',title:'V = (4/3)πr³',detail:'full',
  xLabel:'Jari-jari r',yLabel:'Volume V',xRange:[0,4.3],yRange:[0,300],
  colors:{palette:['#1f5fbf','#b3261e']},
  series:[
   {kind:'function',expression:'(4/3)pix^3',range:[0,4],samples:300,width:'3.5'},
   {kind:'scatter',x:[1,2,3,4],y:[4.18879,33.5103,113.097,268.083],markerSize:'9'}
  ],
  annotations:[{x:3,y:113.1,text:'r=3 → 36π ≈ 113',arrow:true}]
 };
 const fixed=repairContext.StudentVizRepair.repair(raw).spec;
 assert.equal(fixed.series[0].expression,'(4/3)*pi*x^3');
 assert.doesNotThrow(()=>validate(fixed));
});

test('the real viewer validator accepts a budgeted complex 3D scene',()=>{
 const repairContext={console};
 vm.createContext(repairContext);
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','repair.js'),'utf8'),repairContext);
 const raw={$schema:'studentviz/v1',type:'scene3d',detail:'full',objects:[
  {kind:'surface',expression:'x^2-y^2',xRange:[-3,3],yRange:[-3,3],resolution:[256,256]},
  {kind:'parametric',x:'(2+cos(v))*cos(u)',y:'(2+cos(v))*sin(u)',z:'sin(v)',u:[0,6.28],v:[0,6.28],resolution:[256,256]},
  {kind:'torus',radius:2,tube:.3}
 ]};
 const fixed=repairContext.StudentVizRepair.repair(raw).spec;
 assert.doesNotThrow(()=>validate(fixed));
});
