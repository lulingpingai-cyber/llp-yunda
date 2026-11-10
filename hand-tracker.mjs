// Copy video pixels into a normal canvas before inference. Some mobile video
// elements expose a frozen currentTime even though the preview keeps advancing.
export class HandTracker{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true});this.lastTimestamp=-1;this.frames=0;}
 detect(video,model,now){
  if(video.readyState<2||!video.videoWidth||!video.videoHeight)return null;
  const scale=Math.min(1,640/video.videoWidth,640/video.videoHeight);
  const width=Math.max(1,Math.round(video.videoWidth*scale)),height=Math.max(1,Math.round(video.videoHeight*scale));
  if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
  this.ctx.drawImage(video,0,0,width,height);
  const timestamp=Math.max(now,this.lastTimestamp+1);this.lastTimestamp=timestamp;
  const result=model.detectForVideo(this.canvas,timestamp);this.frames++;
  return result;
 }
}
