// Camera lifecycle helpers. No images or device identifiers leave the browser.
export function cameraError(name,message){return Object.assign(new Error(message),{name});}
export function withDeadline(promise,ms,name){
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(cameraError(name,name)),ms);})]).finally(()=>clearTimeout(timer));
}
export async function openCamera(mediaDevices,isCurrent,{timeout=30000}={}){
 let expired=false;
 const acquire=async()=>{
  try{return await mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},facingMode:{ideal:'user'}}});}
  catch(error){if(!['OverconstrainedError','ConstraintNotSatisfiedError'].includes(error.name)||!isCurrent())throw error;return mediaDevices.getUserMedia({audio:false,video:true});}
 };
 const pending=acquire().then(stream=>{
  if(expired||!isCurrent()){stream.getTracks().forEach(track=>track.stop());throw cameraError('CancelledError','Camera request no longer active');}return stream;
 });
 try{return await withDeadline(pending,timeout,'PermissionTimeout');}catch(error){expired=true;throw error;}
}
export async function playCamera(video,stream,{timeout=12000}={}){
 // Set both properties and attributes; show the video BEFORE calling this helper.
 video.muted=true;video.defaultMuted=true;video.autoplay=true;video.playsInline=true;
 for(const key of ['muted','autoplay','playsinline','webkit-playsinline'])video.setAttribute(key,'');
 video.setAttribute('x5-playsinline','true');video.setAttribute('x5-video-player-type','h5-page');
 if(video.srcObject!==stream)video.srcObject=stream;
 await withDeadline(Promise.resolve(video.play()),timeout,'VideoTimeout');
 if(video.readyState<2||!video.videoWidth){
  await new Promise((resolve,reject)=>{
   let timer;const clear=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',ready);video.removeEventListener('canplay',ready);video.removeEventListener('error',fail);};
   const ready=()=>{if(video.readyState>=2&&video.videoWidth){clear();resolve();}};
   const fail=()=>{clear();reject(cameraError('VideoError','Video could not start'));};
   video.addEventListener('loadeddata',ready);video.addEventListener('canplay',ready);video.addEventListener('error',fail);
   timer=setTimeout(()=>{clear();reject(cameraError('VideoTimeout','No camera frames'));},timeout);ready();
  });
 }
}
export function cameraAdvice(error,{stage='camera',wechat=false,ios=false}={}){
 const name=error?.name||'UnknownError';
 const permission=ios?'在手机“设置”中允许 Safari（或当前浏览器）使用相机，再在网站地址栏的权限设置中允许摄像头。':'在浏览器地址栏左侧的网站设置中允许摄像头，并检查系统是否允许该浏览器访问相机。';
 const messages={
  NotAllowedError:permission,PermissionDeniedError:permission,
  NotFoundError:'没有检测到可用摄像头。请检查设备是否有摄像头、是否已连接。',DevicesNotFoundError:'没有检测到可用摄像头。请检查设备是否有摄像头、是否已连接。',
  NotReadableError:'摄像头无法读取，请关闭其他正在使用相机的应用或浏览器标签页，再重试。',TrackStartError:'摄像头被占用，请关闭其他相机应用后重试。',
  PermissionTimeout:'尚未收到摄像头授权。请处理浏览器弹出的“允许”提示；没有提示时，请检查网站和系统相机权限，再重试。',
  OverconstrainedError:'设备不接受相机参数，请关闭其他相机应用后重试。',
  SecurityError:'当前浏览器禁止此网页使用相机，请在系统浏览器中直接打开本页。',
  AbortError:'摄像头连接中断，请关闭后重新开启。',
  ModelTimeout:'摄像头已打开，但手势识别资源加载较慢。请保持页面打开，稍后点击“重试手势识别”。',
  VideoTimeout:'摄像头已连接，预览尚未开始。请点击“继续播放摄像头”，或关闭后重新开启。'
 };
 let text=(stage==='video'&&name==='NotAllowedError'?'摄像头预览需要你再点一次，请点击“继续播放摄像头”。':messages[name])||(stage==='model'?'摄像头已打开，但手势识别未启动。请点击“重试手势识别”；若仍失败，请换较新版本的系统浏览器。':stage==='video'?'摄像头预览被暂停，请点击“继续播放摄像头”。':'摄像头未能启动，请检查相机权限后重试。');
 if(wechat)text+=' 微信若不提供实时相机权限，请点右上角“···”，选择“在浏览器打开”；网页不能代替微信授予权限。';
 return text;
}
