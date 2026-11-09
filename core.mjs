export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const median=a=>{const s=[...a].sort((a,b)=>a-b);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
export function pinchRatio(lm,w,h){
 const d=(a,b)=>Math.hypot((lm[a].x-lm[b].x)*w,(lm[a].y-lm[b].y)*h);
 const scale=(d(5,17)+d(0,9))/2;
 return scale>4?d(4,8)/scale:null;
}
export function progressFromRatio(r,close=.15,open=1.65){
 if(!Number.isFinite(r)||open-close<.25)return null;
 let p=clamp((r-close)/(open-close));
 if(p<.025)p=0;if(p>.975)p=1;
 return p;
}
export function smooth(current,target,dt,tau=75){return current+(target-current)*(1-Math.exp(-Math.min(dt,100)/tau));}
export function frameIndex(p,count=100){return Math.round(clamp(p)*(count-1));}
