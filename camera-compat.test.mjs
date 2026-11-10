import test from 'node:test';
import assert from 'node:assert/strict';
import {openCamera,playCamera,cameraAdvice,withDeadline} from './camera-compat.mjs';
const stream=()=>{let stopped=0;return {get stopped(){return stopped;},getTracks:()=>[{stop:()=>stopped++}]};};
test('falls back only for rejected device constraints',async()=>{
 let calls=[];const s=stream();const devices={getUserMedia:async c=>{calls.push(c);if(calls.length===1)throw {name:'OverconstrainedError'};return s;}};
 assert.equal(await openCamera(devices,()=>true),s);assert.equal(calls.length,2);assert.deepEqual(calls[1],{audio:false,video:true});
});
test('permission denial does not request permission again',async()=>{
 let count=0;await assert.rejects(openCamera({getUserMedia:async()=>{count++;throw Object.assign(new Error(),{name:'NotAllowedError'});}},()=>true),{name:'NotAllowedError'});assert.equal(count,1);
});
test('late authorization after deadline stops the camera',async()=>{
 let finish;const pending=new Promise(r=>finish=r),s=stream();
 await assert.rejects(openCamera({getUserMedia:()=>pending},()=>true,{timeout:5}),{name:'PermissionTimeout'});
 finish(s);await new Promise(r=>setTimeout(r,0));assert.equal(s.stopped,1);
});
test('cancellation releases a stream granted later',async()=>{
 let current=true,finish;const s=stream(),pending=openCamera({getUserMedia:()=>new Promise(r=>finish=r)},()=>current);
 current=false;finish(s);await assert.rejects(pending,{name:'CancelledError'});assert.equal(s.stopped,1);
});
test('play sets mobile inline and muted properties before starting',async()=>{
 const s=stream(),attrs={};const video={readyState:2,videoWidth:640,setAttribute:(k,v)=>attrs[k]=v,play(){assert.equal(this.muted,true);assert.equal(this.playsInline,true);assert.equal(this.srcObject,s);return Promise.resolve();}};
 await playCamera(video,s);assert.ok('webkit-playsinline'in attrs);assert.equal(attrs['x5-playsinline'],'true');
});
test('rejected autoplay is available for a second direct gesture',async()=>{
 let calls=0;const video={readyState:2,videoWidth:640,setAttribute(){},play(){calls++;return calls===1?Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'})):Promise.resolve();}};
 const s=stream();await assert.rejects(playCamera(video,s));assert.equal(s.stopped,0);await playCamera(video,s);assert.equal(calls,2);
});
test('playback waiting forever is bounded',async()=>{
 await assert.rejects(playCamera({setAttribute(){},play:()=>new Promise(()=>{})},stream(),{timeout:5}),{name:'VideoTimeout'});
});
test('model deadline does not stop an existing preview',async()=>{
 const s=stream();await assert.rejects(withDeadline(new Promise(()=>{}),5,'ModelTimeout'),{name:'ModelTimeout'});assert.equal(s.stopped,0);
});
test('precise camera errors survive WeChat guidance',()=>{
 assert.match(cameraAdvice({name:'NotReadableError'},{wechat:true}),/相机的应用/);
 assert.match(cameraAdvice({name:'NotReadableError'},{wechat:true}),/微信/);
 assert.match(cameraAdvice({name:'NotAllowedError'},{ios:true}),/Safari/);
 assert.match(cameraAdvice({name:'Error'},{stage:'model'}),/摄像头已打开/);
});
