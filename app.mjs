import {FrameStore} from './frame-store.mjs';
import {buildings} from './buildings.mjs';
import {clamp,median,pinchRatio,progressFromRatio,smooth,frameIndex} from './core.mjs';
const $=id=>document.getElementById(id);
const inWechat=/MicroMessenger/i.test(navigator.userAgent);
if(inWechat)$('wechatHint').hidden=false;
const el=Object.fromEntries(['building','loading','loadText','modeLabel','phaseLabel','progressText','camera','overlay','cameraBox','cameraPlaceholder','cameraBadge','trackingStatus','cameraToggle','calibrate','reset','scrub','demo','manualHint','statusDot','calibrationDialog','calibrationText','stepClose','stepOpen','recordCalibration','calibrationNote','closeCalibration'].map(id=>[id,$(id)]));
const ctx=el.building.getContext('2d',{alpha:false}), overlay=el.overlay.getContext('2d');

const store=new FrameStore(buildings,{maxDecoded:(navigator.deviceMemory||8)>=8?4:2});
const pagePositions=new Map();let firstLoad=true;
let activeBuilding=0,loadVersion=0;let frames=new Array(buildings[0].count);let ready=false,current=0,target=0,lastFrame=-1,lastTime=performance.now();
let mode='manual',stream=null,landmarker=null,cameraStarting=false,cameraActive=false,session=0,detectBusy=false,lastDetect=0,lastVideoTime=-1,lastHandAt=0,currentRatio=null,filteredRatio=null,modelPromise=null;
let manualUntil=0,demoStart=null,closeRatio=.15,openRatio=1.65,sampleRun=null,calibrationStep=0,recordedClose=null;
try{const saved=JSON.parse(localStorage.getItem('yunda-pinch-range-v1'));if(saved&&Number.isFinite(saved.close)&&saved.open-saved.close>=.25){closeRatio=saved.close;openRatio=saved.open;}}catch{}
function say(text,error=false){el.trackingStatus.textContent=text;el.trackingStatus.classList.toggle('error',error);}
function syncMode(){el.modeLabel.textContent=mode==='demo'?'自动演示':cameraActive?(performance.now()<manualUntil?'滑杆优先':'指尖控制'):'滑杆体验';el.statusDot.classList.toggle('active',cameraActive&&performance.now()-lastHandAt<250);}
function stopDemo(){demoStart=null;el.demo.innerHTML='自动演示 <span>▷</span>';mode=cameraActive?'gesture':'manual';}
async function loadFrames(){
 const version=++loadVersion,index=activeBuilding,building=buildings[index];store.active=index;
 const cached=store.get(index);if(cached){frames=cached;ready=true;lastFrame=frameIndex(current,frames.length);ctx.drawImage(frames[lastFrame],0,0,960,540);el.loading.classList.add('hidden');el.scrub.disabled=false;el.demo.disabled=false;el.building.parentElement.classList.remove('is-switching');return;}
 ready=false;frames=[];lastFrame=-1;el.scrub.disabled=true;el.demo.disabled=true;
 if(firstLoad){el.loading.classList.remove('hidden');el.loadText.textContent='首次准备画面 · 0%';}else{el.loading.classList.add('hidden');el.building.parentElement.classList.add('is-switching');}
 try{const pending=await store.load(index,{startFrame:frameIndex(current,building.count),onPreview:img=>{if(version===loadVersion)ctx.drawImage(img,0,0,960,540);},onProgress:(done,total)=>{if(version===loadVersion&&firstLoad)el.loadText.textContent=`首次准备画面 · ${Math.round(done/total*100)}%`;}});
 if(version!==loadVersion)return;frames=pending;ready=true;firstLoad=false;el.loading.classList.add('hidden');el.building.parentElement.classList.remove('is-switching');el.scrub.disabled=false;el.demo.disabled=false;
 setTimeout(()=>store.warmRemaining(index=>{$('cacheHint').textContent='正在后台准备其他建筑…';}).then(ok=>{$('cacheHint').textContent=ok?'已预读其他建筑 · 翻页保留展开位置':'已缓存当前画面 · 其他建筑按需准备';}),350);
 }catch(err){if(version!==loadVersion)return;el.building.parentElement.classList.remove('is-switching');el.loading.classList.remove('hidden');el.loadText.textContent='画面准备中断，请刷新重试。';say('素材加载失败，请检查网络并刷新页面。',true);console.error(err);}
}

function selectBuilding(index){
 if(index<0||index>=buildings.length||index===activeBuilding)return;
 stopDemo();pagePositions.set(activeBuilding,current);activeBuilding=index;current=target=pagePositions.get(index)??current;manualUntil=performance.now()+1100;el.progressText.textContent=String(Math.round(current*100)).padStart(2,'0');el.scrub.value=String(Math.round(current*1000));el.scrub.style.setProperty('--p',`${current*100}%`);el.scrub.setAttribute('aria-valuetext',`${Math.round(current*100)}% 展开`);
 const building=buildings[index];el.phaseLabel.textContent=current<.12?'一团彩纸 · 蓄势待展':current<.9?'折面舒展 · 建筑渐现':`建筑成形 · ${building.name}`;$('buildingName').textContent=building.name;$('pageNumber').textContent=`${String(index+1).padStart(2,'0')} / ${String(buildings.length).padStart(2,'0')}`;
 el.building.setAttribute('aria-label',`${building.name}：由彩色纸团展开成建筑的动画`);$('buildingStage').setAttribute('aria-labelledby',building.tab);
 buildings.forEach((b,i)=>{const tab=$(b.tab);tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;tab.classList.toggle('selected',i===index);});
 $('previousBuilding').disabled=index===0;$('nextBuilding').disabled=index===buildings.length-1;
 say(cameraActive?`已翻到${building.name}，稍候恢复指尖控制。`:`已翻到${building.name}，拖动滑杆或开启手势体验。`);
 loadFrames();
}
buildings.forEach((building,index)=>{const tab=$(building.tab);tab.addEventListener('click',()=>selectBuilding(index));tab.addEventListener('keydown',event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%buildings.length;else if(event.key==='ArrowLeft')next=(index+buildings.length-1)%buildings.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buildings.length-1;else return;event.preventDefault();selectBuilding(next);$(buildings[next].tab).focus();});});
$('previousBuilding').addEventListener('click',()=>selectBuilding(activeBuilding-1));$('nextBuilding').addEventListener('click',()=>selectBuilding(activeBuilding+1));

function render(now){const dt=now-lastTime;lastTime=now;
 if(demoStart!==null){const cycle=(now-demoStart)/5500;target=(1-Math.cos(cycle*Math.PI))/2;}
 if(cameraActive&&now-lastHandAt>240&&mode!=='demo'&&now>=manualUntil){target=current;}
 const delta=Math.abs(target-current);current=smooth(current,target,dt,delta>.15?55:90);if(Math.abs(target-current)<.001)current=target;
 if(ready){const idx=frameIndex(current,frames.length);if(idx!==lastFrame){ctx.drawImage(frames[idx],0,0,960,540);lastFrame=idx;}}
 const pct=Math.round(current*100);el.progressText.textContent=String(pct).padStart(2,'0');el.scrub.value=String(Math.round(current*1000));el.scrub.style.setProperty('--p',`${current*100}%`);el.scrub.setAttribute('aria-valuetext',`${pct}% 展开`);
 el.phaseLabel.textContent=current<.12?'一团彩纸 · 蓄势待展':current<.9?'折面舒展 · 建筑渐现':`建筑成形 · ${buildings[activeBuilding].name}`;syncMode();requestAnimationFrame(render);
}
el.scrub.addEventListener('input',e=>{stopDemo();target=+e.target.value/1000;manualUntil=performance.now()+1800;if(cameraActive)say('滑杆控制中，松开后稍候将恢复指尖控制。');});
el.reset.addEventListener('click',()=>{stopDemo();target=0;manualUntil=performance.now()+2200;if(cameraActive)say('已收回纸团，稍候恢复指尖控制。');});
el.demo.addEventListener('click',()=>{if(demoStart!==null){stopDemo();target=current;say(cameraActive?'演示已暂停，移动指尖继续。':'演示已暂停，可拖动滑杆探索。');return;}demoStart=performance.now()-Math.acos(1-2*clamp(current))/Math.PI*5500;mode='demo';el.demo.innerHTML='暂停演示 <span>Ⅱ</span>';say(cameraActive?'演示中；改变两指距离即可接管。':'自动往返演示中，拖动滑杆可随时接管。');});
async function getModel(){if(landmarker)return landmarker;if(!modelPromise){modelPromise=(async()=>{const {FilesetResolver,HandLandmarker}=await import('./vision_bundle.mjs');const fs=await FilesetResolver.forVisionTasks('./');const options={baseOptions:{modelAssetPath:'./hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6};try{return await HandLandmarker.createFromOptions(fs,options);}catch{options.baseOptions.delegate='CPU';return await HandLandmarker.createFromOptions(fs,options);}})().then(m=>{landmarker=m;return m;}).catch(e=>{modelPromise=null;throw e;});}return modelPromise;}
function drawHand(lm){const w=el.overlay.width,h=el.overlay.height;overlay.clearRect(0,0,w,h);if(!lm)return;const lines=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];overlay.lineWidth=2;overlay.strokeStyle='#d6e5cf9c';for(const [a,b] of lines){overlay.beginPath();overlay.moveTo(lm[a].x*w,lm[a].y*h);overlay.lineTo(lm[b].x*w,lm[b].y*h);overlay.stroke();}overlay.strokeStyle='#f5bd88';overlay.lineWidth=3;overlay.setLineDash([6,5]);overlay.beginPath();overlay.moveTo(lm[4].x*w,lm[4].y*h);overlay.lineTo(lm[8].x*w,lm[8].y*h);overlay.stroke();overlay.setLineDash([]);for(const k of [4,8]){overlay.beginPath();overlay.arc(lm[k].x*w,lm[k].y*h,6,0,Math.PI*2);overlay.fillStyle='#f5bd88';overlay.fill();overlay.lineWidth=2;overlay.strokeStyle='#fff';overlay.stroke();}}
function finishSample(){const run=sampleRun;sampleRun=null;el.recordCalibration.disabled=false;if(!run||run.values.length<6){el.calibrationNote.textContent='未连续识别到手，请把两指放回镜头，再记录一次。';return;}
 const value=median(run.values);if(calibrationStep===0){recordedClose=value;calibrationStep=1;el.stepClose.classList.remove('active');el.stepOpen.classList.add('active');el.calibrationText.textContent='第二步：将拇指与食指分开到舒适的最大距离，保持稳定，再点击记录。';el.recordCalibration.textContent='记录分开位置';el.calibrationNote.textContent='无需用力撑开，保持与捏紧时相近的手掌朝向。';}
 else if(value-recordedClose<.25){el.calibrationNote.textContent='两次距离太接近。请进一步分开拇指与食指后重试。';}
 else{closeRatio=recordedClose;openRatio=value;try{localStorage.setItem('yunda-pinch-range-v1',JSON.stringify({close:closeRatio,open:openRatio}));}catch{}el.calibrationDialog.close();say('校准完成。慢慢分开、捏合两指，让建筑跟随你。');filteredRatio=null;}}
function onHand(lm,now){drawHand(lm);if(!lm){currentRatio=null;filteredRatio=null;el.cameraBadge.textContent='寻找手部';if(now-lastHandAt>300&&!el.calibrationDialog.open&&now>=manualUntil&&mode!=='demo')say('未看到手，画面已保持。请将手放回镜头。');return;}
 const r=pinchRatio(lm,el.camera.videoWidth,el.camera.videoHeight);if(r===null)return;
 const wasLost=now-lastHandAt>300;lastHandAt=now;currentRatio=r;el.cameraBadge.textContent='两指已识别';
 if(sampleRun){sampleRun.values.push(r);if(now-sampleRun.start>=800)finishSample();}
 if(el.calibrationDialog.open)return;
 const previous=filteredRatio;filteredRatio=previous===null?r:smooth(previous,r,now-(onHand.lastAt||now-50),65);onHand.lastAt=now;
 let p=progressFromRatio(filteredRatio,closeRatio,openRatio);if(p===null)return;
 if(mode==='demo'){if(previous!==null&&Math.abs(r-previous)>.11){stopDemo();}else return;}
 if(now<manualUntil)return;
 mode='gesture';if(Math.abs(p-target)>.008||p===0||p===1||wasLost)target=p;
 say('两指分开，建筑展开；两指捏合，折回纸团。');
}
function detectLoop(now,mySession){if(!cameraActive||mySession!==session)return;
 if(now-lastDetect>=50&&el.camera.readyState>=2&&el.camera.currentTime!==lastVideoTime&&!detectBusy){lastDetect=now;lastVideoTime=el.camera.currentTime;detectBusy=true;try{const result=landmarker.detectForVideo(el.camera,now);onHand(result.landmarks?.[0],now);}catch(err){console.error('Hand detection:',err);stopCamera();say('手势识别暂时中断，可重新开启；滑杆仍可使用。',true);return;}finally{detectBusy=false;}}
 if(sampleRun&&now-sampleRun.start>1800)finishSample();
 requestAnimationFrame(t=>detectLoop(t,mySession));
}
function stopCamera(){session++;cameraActive=false;cameraStarting=false;stream?.getTracks().forEach(t=>t.stop());stream=null;el.camera.srcObject=null;el.cameraBox.classList.remove('on');el.cameraPlaceholder.hidden=false;el.cameraPlaceholder.style.display='';drawHand(null);el.cameraBadge.textContent='摄像头已关闭';el.cameraToggle.disabled=false;el.cameraToggle.querySelector('span').textContent='开启手势体验';el.calibrate.disabled=true;lastHandAt=0;currentRatio=null;filteredRatio=null;sampleRun=null;if(el.calibrationDialog.open)el.calibrationDialog.close();if(mode!=='demo'){mode='manual';target=current;}say('摄像头已关闭，可以继续拖动滑杆。');}
async function startCamera(){if(cameraStarting||cameraActive)return;
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){say('当前页面无法调用摄像头。请用 Chrome / Edge 在 HTTPS 地址打开；也可使用滑杆。',true);return;}
 stopDemo();cameraStarting=true;const mySession=++session;el.cameraToggle.disabled=true;el.cameraToggle.querySelector('span').textContent='正在准备摄像头…';say('请允许摄像头访问；识别模型首次加载需要稍候。');
 try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},facingMode:'user'}});if(mySession!==session){stream.getTracks().forEach(t=>t.stop());return;}
 el.camera.srcObject=stream;await el.camera.play();el.overlay.width=el.camera.videoWidth||640;el.overlay.height=el.camera.videoHeight||480;el.cameraBox.classList.add('on');el.cameraPlaceholder.style.display='none';say('摄像头已连接，正在加载本地手部识别模型…');await getModel();if(mySession!==session)return;
 cameraActive=true;cameraStarting=false;mode='gesture';lastHandAt=0;lastVideoTime=-1;filteredRatio=null;manualUntil=0;el.cameraToggle.disabled=false;el.cameraToggle.querySelector('span').textContent='关闭摄像头';el.calibrate.disabled=false;el.cameraBadge.textContent='寻找手部';say('让手掌朝向镜头，分开拇指与食指；可校准个人范围。');for(const track of stream.getVideoTracks()){track.addEventListener('ended',()=>{if(cameraActive){stopCamera();say('摄像头连接已结束，请重新开启。',true);}},{once:true});}requestAnimationFrame(t=>detectLoop(t,mySession));
 }catch(err){console.error('Camera setup:',err);if(mySession!==session)return;stopCamera();const messages={NotAllowedError:'摄像头权限未获允许。请在浏览器地址栏允许摄像头后重试。',NotFoundError:'未找到摄像头。请连接摄像头，或使用滑杆体验。',NotReadableError:'摄像头可能被其他程序占用，请关闭相关程序后重试。',AbortError:'摄像头连接中断，请重新开启。'};say(inWechat?'微信内摄像头可能受限。请从右上角“···”在系统浏览器打开，或直接拖动滑杆体验。':(messages[err.name]||'手势模型加载失败，请检查网络后重试。滑杆仍可使用。'),true);}}
el.cameraToggle.addEventListener('click',()=>cameraActive?stopCamera():startCamera());
el.calibrate.addEventListener('click',()=>{if(!cameraActive)return;stopDemo();target=current;sampleRun=null;calibrationStep=0;recordedClose=null;el.stepClose.classList.add('active');el.stepOpen.classList.remove('active');el.calibrationText.textContent='第一步：拇指与食指轻轻捏紧，保持在镜头内，再点击记录。';el.recordCalibration.textContent='记录捏紧位置';el.recordCalibration.disabled=false;el.calibrationNote.textContent='保持手掌朝向镜头，记录期间保持稳定。';el.calibrationDialog.showModal();});
el.recordCalibration.addEventListener('click',()=>{if(!cameraActive||currentRatio===null){el.calibrationNote.textContent='还未看到手，请将手放入镜头后再记录。';return;}sampleRun={start:performance.now(),values:[]};el.recordCalibration.disabled=true;el.calibrationNote.textContent='正在记录，请保持手势约一秒…';});
el.closeCalibration.addEventListener('click',()=>el.calibrationDialog.close());el.calibrationDialog.addEventListener('close',()=>{sampleRun=null;filteredRatio=null;});
window.addEventListener('pagehide',()=>{stopCamera();landmarker?.close();landmarker=null;modelPromise=null;});
loadFrames();requestAnimationFrame(render);

$('shareLink').addEventListener('click',async()=>{const button=$('shareLink');const url=new URL(location.href);url.search='';url.hash='';try{await navigator.clipboard.writeText(url.href);button.textContent='链接已复制 ✓';setTimeout(()=>button.textContent='复制分享链接 ↗',2500);}catch{say('请复制浏览器地址栏中的网址，发送给朋友即可。');}});
