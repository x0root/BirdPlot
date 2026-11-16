const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('manifest parses and every declared local resource exists',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 assert.equal(manifest.manifest_version,3);
 assert.equal(manifest.version,'0.4.1');
 assert.ok(manifest.content_scripts.length>0);
 for(const script of manifest.content_scripts)for(const file of [...(script.js||[]),...(script.css||[])])assert.ok(fs.existsSync(path.join(root,file)),`missing content resource: ${file}`);
 for(const page of manifest.sandbox.pages)assert.ok(fs.existsSync(path.join(root,page)),`missing sandbox page: ${page}`);
 for(const resource of manifest.web_accessible_resources.flatMap(item=>item.resources))assert.ok(fs.existsSync(path.join(root,resource)),`missing web-accessible resource: ${resource}`);
 for(const file of ['popup.html','popup.css','popup.js'])assert.ok(fs.existsSync(path.join(root,file)),`missing popup asset: ${file}`);
});

test('content script has whole-message unfenced detection without consuming source prose',()=>{
 const source=fs.readFileSync(path.join(root,'content.js'),'utf8');
 assert.match(source,/function assistantTextWalker\(/);
 assert.match(source,/function scanUnfencedAssistant\(/);
 assert.match(source,/k\(anchor,pending,root\)/);
 assert.match(source,/deepseek\.com/);
 assert.match(source,/FILTER_REJECT/);
 assert.match(source,/t\.closest\("pre"\)\|\|t/);
});

test('AI prompt instructs AI to write in Python with START/END flags and lists libraries',()=>{
 const popup=fs.readFileSync(path.join(root,'popup.js'),'utf8');
 assert.match(popup,/Python Visualizations via Pyodide/);
 assert.match(popup,/WRITE (?:CONCISE )?PYTHON CODE/);
 assert.match(popup,/Do NOT output StudentViz JSON/);
 assert.match(popup,/# START_STUDENTVIZ/);
 assert.match(popup,/# END_STUDENTVIZ/);
 assert.match(popup,/matplotlib/);
 assert.match(popup,/numpy/);
 assert.match(popup,/scipy/);
 assert.match(popup,/plotly/);
 assert.match(popup,/trimesh/);
});

test('AI prompt specifies execution rules and self-contained Python examples',()=>{
 const popup=fs.readFileSync(path.join(root,'popup.js'),'utf8');
 assert.match(popup,/OUTPUT FORMAT — MANDATORY/);
 assert.match(popup,/COMPRESS CODE AS SHORT AS POSSIBLE/);
 assert.match(popup,/plt\.show\(\)/);
 assert.ok((popup.match(/# START_STUDENTVIZ/g)||[]).length >= 1);
 assert.ok((popup.match(/# END_STUDENTVIZ/g)||[]).length >= 1);
});

test('the actual copied AI prompt contains valid Python flagged examples',()=>{
 const vm=require('node:vm');
 const nodes=new Map();
 const getNode=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',checked:true,textContent:'',onclick:null,onchange:null,open:false,querySelector:()=>({textContent:''}),focus(){},select(){}});
  return nodes.get(id);
 };
 const context={document:{getElementById:getNode},chrome:{storage:{local:{get:(defaults,callback)=>callback(defaults),set(){}}}},navigator:{clipboard:{writeText:async()=>{}}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'popup.js'),'utf8'),context);
 const instructions=getNode('prompt').value;
 assert.match(instructions,/WRITE (?:CONCISE )?PYTHON CODE/);
 const blocks=[...instructions.matchAll(/```(?:python|studentviz-python)\s*\n([\s\S]*?)\n```/g)];
 assert.ok(blocks.length >= 1, 'Expected at least one Python code example block');
 for(const match of blocks){
  const code=match[1];
  assert.ok(code.includes('# START_STUDENTVIZ'));
  assert.ok(code.includes('# END_STUDENTVIZ'));
  assert.ok(code.includes('numpy') || code.includes('plt'));
  assert.ok(code.includes('plt.show()') || code.includes('animation') || code.includes('fig'));
 }
});
