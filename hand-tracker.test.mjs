import test from 'node:test';
import assert from 'node:assert/strict';
import {HandTracker} from './hand-tracker.mjs';
const makeCanvas=()=>({width:0,height:0,getContext(){return {drawImage(){}};}});
test('a frozen video clock still feeds every eligible frame into inference',()=>{
 const canvas=makeCanvas(),tracker=new HandTracker(canvas),timestamps=[];
 const video={readyState:4,videoWidth:1280,videoHeight:720,currentTime:0};
 const landmarks=Array.from({length:21},()=>({x:.5,y:.5}));
 const model={detectForVideo(input,time){assert.equal(input,canvas);timestamps.push(time);return {landmarks:[landmarks]};}};
 for(const t of [100,166,232])assert.equal(tracker.detect(video,model,t).landmarks[0].length,21);
 assert.equal(tracker.frames,3);assert.deepEqual(timestamps,[100,166,232]);assert.equal(canvas.width,640);assert.equal(canvas.height,360);
});
test('timestamps always increase even when browser timestamps repeat',()=>{
 const tracker=new HandTracker(makeCanvas()),times=[],video={readyState:4,videoWidth:480,videoHeight:640};
 const model={detectForVideo(_,t){times.push(t);return {landmarks:[]};}};
 for(const t of [10,10,9])tracker.detect(video,model,t);
 assert.deepEqual(times,[10,11,12]);
});
test('does not infer on an unready or empty video',()=>{
 const tracker=new HandTracker(makeCanvas()),model={detectForVideo(){throw Error('must not run');}};
 assert.equal(tracker.detect({readyState:0,videoWidth:640,videoHeight:480},model,1),null);
 assert.equal(tracker.detect({readyState:4,videoWidth:0,videoHeight:0},model,2),null);
});
