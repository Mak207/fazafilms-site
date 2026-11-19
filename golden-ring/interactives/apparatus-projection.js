// The luminous back wall is exhibition media. It responds to the same normalized control as the physical prop.
export async function makeProjection(T,id,spec) {
  if(id==='regional'||id==='soundmap')return (await import('./river-media.js')).riverMedia(T,id);
  if(id==='glass')return (await import('./glass-process.js')).glassProcess(T);
  if(id==='shadow')return (await import('./shadow-fairground.js')).makeFairground(T);
  const canvas=document.createElement('canvas'); canvas.width=1280;canvas.height=544;
  const ctx=canvas.getContext('2d',{alpha:false});
  const src=name=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src='art/'+name+'.webp';});
  const first=await src(id==='bells'?'bells-finale':spec.surface), last=id==='bells'||spec.result===spec.surface?first:await src(spec.result);
  const vessel=id==='barge'?await src('barge-vessel'):null;
  const weave=id==='loom'?await src('loom-finale'):null;
  const proof=['passport','craft'].includes(id)?await src(id+'-finale'):null;
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=T.LinearFilter;
  const w=canvas.width,h=canvas.height;
  const bellSpots=[.29,.56,.86];
  const skyline=id==='bells'?bellSpots.map(x=>{
    const layer=document.createElement('canvas');layer.width=w;layer.height=h;
    const c=layer.getContext('2d'),k=Math.max(w/first.width,h/first.height);
    c.filter='brightness(1.26) saturate(1.16)';c.drawImage(first,(w-first.width*k)/2,(h-first.height*k)/2,first.width*k,first.height*k);c.filter='none';
    const gradient=c.createRadialGradient(x*w,h*.55,w*.026,x*w,h*.55,w*.25);gradient.addColorStop(0,'#fff');gradient.addColorStop(1,'transparent');
    c.globalCompositeOperation='destination-in';c.fillStyle=gradient;c.fillRect(0,0,w,h);return layer;
  }):null;
  function cover(im,zoom=1,pan=.5){const k=Math.max(w/im.width,h/im.height)*zoom;ctx.drawImage(im,(w-im.width*k)*pan,(h-im.height*k)*.5,im.width*k,im.height*k);}
  function place(im,left,bottom,width,height){const k=Math.min(width/im.width,height/im.height);ctx.drawImage(im,left-im.width*k/2,bottom-im.height*k,im.width*k,im.height*k);}
  function rosette(x,y,size,p){
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);
    for(let j=0;j<3;j++){const count=10-j*3;for(let i=0;i<count;i++){
        if((j+i/count)/3>p)continue;
        const a=2*Math.PI*i/count;ctx.save();ctx.rotate(a);ctx.fillStyle=['#923e35','#d46e59','#edd4ae'][j];
        ctx.beginPath();ctx.ellipse(0,-63+18*j,29-5*j,51-9*j,0,0,2*Math.PI);ctx.fill();ctx.restore();
    }}ctx.restore();
  }
  let prior=-1;
  function redraw(p,elapsed,approach,state){
    const voices=state?.voices??[];
    const step=id==='bells'?[Math.round(p*40),...voices.map(x=>Math.round(x*30))].join('/'):Math.round(p*130);if(step===prior)return;prior=step;
    ctx.globalAlpha=1;ctx.fillStyle='#251e18';ctx.fillRect(0,0,w,h);cover(first,1.08,.5-.1*p);
    if(id==='barge'){
      place(last,w*.89,h*.97,w*.32,h*.49);
      place(vessel,w*(.09+.55*p),h*(.67+.13*p),w*(.20+.25*p),h*.42);
    }else if(id==='bells'){
      ctx.globalAlpha=1;ctx.filter='brightness(.65) saturate(.78)';cover(last);ctx.filter='none';
      const active=state?.participants||[];
      for(const [i,x] of bellSpots.entries()){
        const a=voices[i]??Math.max(0,Math.min(1,3*p-i));
        if(a<=.01&&!active[i])continue;
        ctx.globalAlpha=Math.min(1,a+.14*Number(active[i]||0));ctx.drawImage(skyline[i],0,0);ctx.globalAlpha=1;
        ctx.save();ctx.beginPath();ctx.rect((x-.16)*w,0,w*.32,h);ctx.clip();
        const blend=ctx.createRadialGradient(x*w,h*.68,2,x*w,h*.68,w*.17);
        blend.addColorStop(0,'rgba(255,189,107,'+(.035*Number(active[i]||0)+.26*a)+')');blend.addColorStop(1,'rgba(255,185,100,0)');
        ctx.fillStyle=blend;ctx.globalCompositeOperation='screen';ctx.fillRect(0,0,w,h);
        ctx.strokeStyle='rgba(255,208,141,'+(.57*a)+')';ctx.lineWidth=1.3;
        for(let j=0;j<12;j++){
          const width=(1+j*.8)*(.5+.5*a),cx=w*x+Math.sin(i*10+j*5.3)*width*1.6;
          ctx.beginPath();ctx.moveTo(cx-width,h*(.73+j*.017));ctx.lineTo(cx+width,h*(.73+j*.017));ctx.stroke();
        }ctx.restore();
      }
    }else if(id==='regional'){
      ctx.save();ctx.beginPath();ctx.rect(0,0,w*p,h);ctx.clip();cover(last);ctx.restore();
      ctx.fillStyle='rgba(183,210,205,.33)';ctx.fillRect(w*p,0,w*(1-p),h);
    }else if(id==='loom'){
      ctx.fillStyle='#231d1b';ctx.fillRect(0,0,w,h);
      for(let y=0;y<h;y+=5){ctx.fillStyle=y<h*(1-p)?'#4d4038':y%20?'#c49b83':'#8b5149';ctx.fillRect(0,y,w,2.5);}
        for(let i=0;i<3;i++){
          const fill=Math.min(1,Math.max(0,3*p-i)),row=h/3;
          if(!fill)continue;
          ctx.save();ctx.beginPath();ctx.rect(i%2?w*(1-fill):0,h-row*(i+1),w*fill,row);ctx.clip();
          ctx.drawImage(weave,0,h-row*(i+1),w,row);ctx.restore();
        }
      for(let x=0;x<w;x+=7){ctx.fillStyle='rgba(233,206,172,.11)';ctx.fillRect(x,0,2,h);}
    }else if(id==='craft'){
      ctx.fillStyle='rgba(33,23,17,'+(.28+.26*p)+')';ctx.fillRect(0,0,w,h);
      ctx.globalAlpha=p;rosette(w*.49,h*.53,1.7,p);
      if(p>.80){ctx.globalAlpha=(p-.8)*4;place(last,w*.5,h*.93,w*.4,h*.23);}
    }else if(id==='passport'||id==='soundmap'){
      ctx.fillStyle='rgba(20,30,31,.55)';ctx.fillRect(0,0,w,h);
      const pts=id==='soundmap'?[[.19,.70],[.51,.46],[.83,.28]]:[[.13,.72],[.40,.43],[.64,.58],[.86,.27]];ctx.lineWidth=4;ctx.strokeStyle='#ffe2a5';ctx.shadowColor='#ffd399';ctx.shadowBlur=12;
      for(let i=0;i<pts.length-1;i++){const q=Math.min(1,Math.max(0,p*(pts.length-1)-i)),a=pts[i],b=pts[i+1];ctx.beginPath();ctx.moveTo(a[0]*w,a[1]*h);ctx.lineTo((a[0]+(b[0]-a[0])*q)*w,(a[1]+(b[1]-a[1])*q)*h);ctx.stroke();}
      const selected=Math.max(0,Math.min(2,Math.ceil(p*3-.00001)-1));
      pts.forEach(([x,y],i)=>{ctx.fillStyle=(id==='soundmap'?p>0&&i===selected:p*3>=i)?'#ffde9a':'#998d7c';ctx.beginPath();ctx.arc(x*w,y*h,8,0,7);ctx.fill();if(id==='soundmap'&&p>0&&selected===i){ctx.beginPath();ctx.arc(x*w,y*h,24,0,7);ctx.stroke();}});ctx.shadowBlur=0;
    }else{
      ctx.globalAlpha=p;cover(last,1.06+.07*(1-p));
    }
    if(proof&&p>.78){
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=Math.min(1,(p-.78)/.18);
      cover(proof,1.015+.05*(1-p));
    }
    ctx.globalAlpha=1;texture.needsUpdate=true;
  }
  redraw(0);return {texture,redraw};
}
