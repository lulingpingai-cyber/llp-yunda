import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {openCamera,playCamera,withDeadline,cameraAdvice} from './camera-compat.mjs';
const source=await readFile(new URL('./app.mjs',import.meta.url),'utf8');
function setup({model=async()=>({}),permissionError}={}){
 const nodes=new Map();
 function node(id){if(nodes.has(id))return nodes.get(id);const n={textContent:'',hidden:true,disabled:false,style:{},classList:{add(){},remove(){}},addEventListener(){},setAttribute(){},querySelector(){return node(id+'-label');},readyState:2,videoWidth:640,videoHeight:480,play:async()=>{},open:false};nodes.set(id,n);return n;}
 let stopped=0,permissionCalls=0;const track={stop(){stopped++;},addEventListener(){}};
 const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
 const sandbox={tracker:null,HandTracker:class {constructor(){}},document:{createElement:()=>({})},openCamera,playCamera,withDeadline,cameraAdvice,console:{error(){}},performance:{now:()=>1},navigator:{userAgent:'iPhone',mediaDevices:{getUserMedia:async()=>{permissionCalls++;if(permissionError)throw permissionError;return stream;}}},window:{isSecureContext:true},requestAnimationFrame(){},URL,location:{href:'https://example.com/'},$ :node,inWechat:false,
  cameraActive:false,cameraStarting:false,session:0,stream:null,mode:'manual',target:0,current:0,currentRatio:null,filteredRatio:null,lastHandAt:0,lastVideoTime:0,manualUntil:0,sampleRun:null,
  stopDemo(){},drawHand(){},getModel:model,detectLoop(){},say(text){sandbox.message=text;},el:new Proxy({},{get:(_,id)=>node(id)})};
 vm.createContext(sandbox);
 const part=source.slice(source.indexOf("let cameraStage='idle'"),source.indexOf("el.calibrate.addEventListener"));
 vm.runInContext(part+'\nthis.api={startCamera,stopCamera};',sandbox);
 return {sandbox,nodes,node,stream,get stopped(){return stopped;},get permissionCalls(){return permissionCalls;}};
}
test('starts preview and enables gesture controls',async()=>{
 const s=setup();await s.sandbox.api.startCamera();assert.equal(s.sandbox.cameraActive,true);assert.equal(s.node('camera').srcObject,s.stream);assert.equal(s.node('calibrate').disabled,false);assert.equal(s.node('cameraToggle-label').textContent,'关闭摄像头');s.sandbox.api.stopCamera();assert.equal(s.stopped,1);
});
test('model failure keeps preview, and retry does not reopen the camera',async()=>{
 let count=0;const s=setup({model:async()=>{if(++count===1)throw new Error('GPU and CPU unavailable');return {};}});
 await s.sandbox.api.startCamera();assert.equal(s.stopped,0);assert.equal(s.node('camera').srcObject,s.stream);assert.equal(s.node('cameraToggle-label').textContent,'重试手势识别');assert.equal(s.node('cameraToggle').disabled,false);
 await s.sandbox.api.startCamera();assert.equal(s.permissionCalls,1);assert.equal(s.sandbox.cameraActive,true);s.sandbox.api.stopCamera();
});
test('denied permission restores a working retry button',async()=>{
 const s=setup({permissionError:{name:'NotAllowedError'}});await s.sandbox.api.startCamera();assert.equal(s.sandbox.cameraStarting,false);assert.equal(s.node('cameraToggle').disabled,false);assert.equal(s.node('cameraHelp').open,true);assert.match(s.sandbox.message,/允许 Safari/);
});
