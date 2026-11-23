// Each screen band uses the arc-length UV of its own physical contour.
// The upper wall is curved; the lower ribbon follows the shelf front edges.
const themes = [
  {id:"technology", title:"Технологии России", ink:"#78f5ed", cells:[0,9,2,10,11,12,13,14,2]},
  {id:"construction", title:"Строительство России", ink:"#c8ee8d", cells:[3,15,16,4,17,18,19,20,5]},
  {id:"transport", title:"Транспорт России", ink:"#73e8ff", cells:[6,21,22,23,24,7,8,25,26]}
];
const modes = ["hero","cards","grid"];
const ease = t => { t=Math.min(1,Math.max(0,t)); return t*t*(3-2*t); };

function cover(ctx, img, sx, sy, sw, sh, x, y, w, h, pan=0.5) {
  const scale=Math.max(w/sw,h/sh);
  const cw=w/scale, ch=h/scale;
  ctx.drawImage(img,sx+(sw-cw)*pan,sy+(sh-ch)*0.58,cw,ch,x,y,w,h);
}

function type(ctx, text, x, y, width, size, weight=600, color="#f4fbff", family="Oswald, Arial") {
  ctx.font=`${weight} ${size}px ${family}`;
  const measured=ctx.measureText(text).width;
  if(measured>width) ctx.font=`${weight} ${size*width/measured}px ${family}`;
  ctx.fillStyle=color;
  ctx.fillText(text,x,y);
}

function label(ctx, text, x, y, width, size, maxLines) {
  const words=text.split(/\s+/);
  let lines;
  for (;;) {
    ctx.font=`600 ${size}px Inter,Arial`;
    lines=[""];
    for (const word of words) {
      const last=lines.length-1, line=(lines[last]+" "+word).trim();
      if(lines[last] && ctx.measureText(line).width>width) lines.push(word);
      else lines[last]=line;
    }
    if(lines.length<=maxLines || size<=8) break;
    size*=0.9;
  }
  ctx.fillStyle="#f1f8ff";
  lines.forEach((s,i)=>ctx.fillText(s,x,y+i*size*1.12));
}

function plate(ctx,x,y,w,h,r) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r);
  const wash=ctx.createLinearGradient(x,y,x+w,y+h);
  wash.addColorStop(0,"rgba(14,101,166,.94)");
  wash.addColorStop(1,"rgba(3,44,96,.88)");
  ctx.fillStyle=wash; ctx.fill();
  ctx.lineWidth=Math.max(1,r*.14); ctx.strokeStyle="rgba(136,227,255,.82)"; ctx.stroke();
}

export function createWallProgram(topics, catalog, pavilion, videos, art, objectAction, refresh) {
  const photos=new Image(), subjects=new Image();
  const overlays=new Map();
  function invalidate(){ overlays.clear(); refresh(); }
  art.onload=invalidate; photos.onload=invalidate; subjects.onload=invalidate;
  art.src="./assets/frames/panorama-atlas.webp"; photos.src="./assets/frames/metric-atlas.webp";
  subjects.src="./assets/frames/metric-subjects.webp";
  document.fonts?.ready.then(invalidate);
  const side=pavilion.screenFrontZ-pavilion.screenCornerZ;
  const arc=Math.PI/2*(pavilion.screenX-pavilion.screenBackHalf);
  const back=2*pavilion.screenBackHalf;
  const length=2*(side+arc)+back;
  const edges=[0,(side+arc/2)/length,1-(side+arc/2)/length,1];
  const lowerSide=pavilion.screenFrontZ-pavilion.lowerScreenBackZ;
  const lowerLength=2*lowerSide+2*pavilion.lowerScreenX;
  const lowerEdges=[0,lowerSide/lowerLength,1-lowerSide/lowerLength,1];
  const strip=catalog.map(e=>{
    const t=e.index/13, z=-8.88+t*17.76, x=-5.70+t*11.4;
    const metres=e.zone==="technology" ? pavilion.screenFrontZ-z :
      e.zone==="transport" ? lowerLength-(pavilion.screenFrontZ-z) : lowerSide+pavilion.lowerScreenX+x;
    return {...e,u:metres/lowerLength};
  }).sort((a,b)=>a.u-b.u);

  function photo(ctx,index,x,y,w,h) {
    const extra=index>=9, source=extra?subjects:photos;
    if(!source.naturalWidth) return;
    const cols=extra?6:3, n=extra?index-9:index;
    const sw=source.naturalWidth/cols, sh=source.naturalHeight/3;
    cover(ctx,source,n%cols*sw+2,Math.floor(n/cols)*sh+2,sw-4,sh-4,x,y,w,h);
  }

  const joins=new Map();
  function cornerBuffer(blend,h){
    const key=blend+"/"+h;
    if(!joins.has(key)){
      const buffer=document.createElement("canvas");
      buffer.width=blend;buffer.height=h;
      const join=buffer.getContext("2d");
      const mask=join.createLinearGradient(0,0,blend,0);
      mask.addColorStop(0,"#fff");mask.addColorStop(1,"transparent");
      joins.set(key,{buffer,join,mask});
    }
    return joins.get(key);
  }

  function backdrop(ctx,w,h,time,lower=false) {
    const blend=Math.max(2,Math.round(w*.012));
    const {buffer,join,mask}=cornerBuffer(blend,h);
    ctx.fillStyle="#06386c"; ctx.fillRect(0,0,w,h);
    const bandEdges=lower?lowerEdges:edges;
    themes.forEach(({id},i)=>{
      const x=Math.round(bandEdges[i]*w);
      const span=Math.round(bandEdges[i+1]*w)-x+(i<themes.length-1?blend:0);
      if(i){
        join.clearRect(0,0,blend,h);
        join.drawImage(ctx.canvas,x,0,blend,h,0,0,blend,h);
        join.globalCompositeOperation="destination-in";
        join.fillStyle=mask;join.fillRect(0,0,blend,h);
        join.globalCompositeOperation="source-over";
      }
      ctx.save(); ctx.beginPath();ctx.rect(x,0,span+1,h);ctx.clip();
      const drift=.5+.38*Math.sin(time*.095+i);
      const vid=videos[id];
      if(vid?.readyState>=2 && vid.videoWidth)
        cover(ctx,vid,0,0,vid.videoWidth,vid.videoHeight,x,0,span,h,drift);
      if(art.naturalWidth) {
        const row=art.naturalHeight/3;
        const zoom=1.02+.016*Math.sin(time*.12+i);
        const available=row-4, sh=available/zoom, sw=art.naturalWidth/zoom;
        const filmMix=ease((1-Math.cos(time*Math.PI/12))*.5);
        ctx.globalAlpha=vid?.readyState>=2 ? .94-.78*filmMix : 1;
        cover(ctx,art,(art.naturalWidth-sw)*drift,i*row+2+(available-sh)*.5,sw,sh,x,0,span,h,drift);
      }
      ctx.restore();
      if(i) ctx.drawImage(buffer,x,0);
    });
    const veil=ctx.createLinearGradient(0,0,0,h);
    veil.addColorStop(0,"rgba(1,24,61,.96)");veil.addColorStop(.32,"rgba(2,32,74,.72)");
    veil.addColorStop(.65,"rgba(2,38,77,.18)");veil.addColorStop(1,"rgba(2,38,77,.04)");
    ctx.fillStyle=veil;ctx.fillRect(0,0,w,h);
    // A single light path crosses both bends at the same phase.
    ctx.save();ctx.globalCompositeOperation="screen";
    for(let i=0;i<2;i++){
      const route=ctx.createLinearGradient(0,0,w,0);
      for(let j=0;j<=16;j++){
        const v=(.5+.5*Math.cos(j*Math.PI/2-time*.85-i))**6;
        route.addColorStop(j/16,`rgba(99,234,255,${.05+v*.49})`);
      }
      ctx.strokeStyle=route;ctx.lineWidth=h*(lower?.031:.010);ctx.beginPath();
      for(let j=0;j<=96;j++){
        const t=j/96,y=h*(.88+.07*Math.sin(t*21+i*.7+time*.13));
        if(!j)ctx.moveTo(0,y);else ctx.lineTo(t*w,y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function compose(w,h,mode,page,active) {
    const key=[w,h,mode,page,active].join("/");
    if(overlays.has(key)) return overlays.get(key);
    const layer=document.createElement("canvas");layer.width=w;layer.height=h;
    const ctx=layer.getContext("2d");ctx.textBaseline="top";
    themes.forEach(({id,title,ink,cells},i)=>{
      const topic=topics.find(t=>t.zone===id), metrics=topic?.metrics||[];
      if(!metrics.length)return;
      const start=w*edges[i], end=w*edges[i+1], margin=h*(i===1?.23:.39);
      const x=start+margin, width=end-start-margin*2;
      ctx.save();ctx.beginPath();ctx.rect(start,0,end-start,h);ctx.clip();
      const heading=title.toUpperCase();
      type(ctx,heading,x,h*.046,width*.72,h*.104,600);
      ctx.textAlign="right";
      type(ctx,"2000 — 2025",end-margin,h*.066,width*.25,h*.063,600,ink);
      ctx.textAlign="left";
      ctx.fillStyle=ink;ctx.fillRect(x,h*.178,id===active?width*.38:width*.15,Math.max(1,h*.009));
      const startIndex=(page*3)%metrics.length;
      if(mode==="hero") {
        for(let n=0;n<3;n++) {
          const m=metrics[(startIndex+n)%metrics.length], unit=width/3, xx=x+n*unit;
          if(n) {ctx.fillStyle=ink;ctx.fillRect(xx-h*.045,h*.245,h*.004,h*.34);}
          type(ctx,m.value,xx,h*.207,unit-h*.11,h*.192,600);
          label(ctx,m.label,xx,h*.449,unit-h*.12,h*.062,2);
          type(ctx,(m.detail||"").split("·")[0].trim(),xx,h*.606,unit-h*.12,h*.043,600,ink,"Inter,Arial");
        }
      } else {
        const isGrid=mode==="grid",cols=isGrid?3:(i===1?4:5),rows=isGrid?3:1;
        const gap=h*.026,cw=(width-(cols-1)*gap)/cols,ch=isGrid?h*.201:h*.61;
        for(let n=0;n<Math.min(rows*cols,metrics.length);n++) {
          const idx=(startIndex+n)%metrics.length,m=metrics[idx];
          const xx=x+n%cols*(cw+gap),yy=h*.214+Math.floor(n/cols)*(ch+gap);
          plate(ctx,xx,yy,cw,ch,h*.028);
          const pad=h*.033,tx=xx+pad;
          if(isGrid){
            const imageW=cw*.23;
            photo(ctx,cells[idx],xx+cw-pad-imageW,yy+pad,imageW,ch-2*pad);
            type(ctx,m.value,tx,yy+pad*.65,cw-imageW-pad*3,h*.086,600);
            label(ctx,m.label,tx,yy+h*.099,cw-imageW-pad*3,h*.035,2);
            type(ctx,(m.detail||"").split("·")[0].trim(),tx,yy+h*.165,cw-imageW-pad*3,h*.028,600,ink,"Inter,Arial");
          } else {
            type(ctx,m.value,tx,yy+pad,cw-2*pad,h*.125,600);
            label(ctx,m.label,tx,yy+h*.198,cw-2*pad,h*.047,2);
            type(ctx,(m.detail||"").split("·")[0].trim(),tx,yy+h*.316,cw-2*pad,h*.040,600,ink,"Inter,Arial");
            photo(ctx,cells[idx],tx,yy+h*.385,cw-2*pad,h*.185);
          }
        }
      }
      ctx.restore();
    });
    if(overlays.size>=4) overlays.delete(overlays.keys().next().value);
    overlays.set(key,layer);return layer;
  }

  let previous=null,current=null,signature="",changeTime=0;
  function draw(upper,lower,time,page,active,mode,playing) {
    const ctx=upper.getContext("2d"),w=upper.width,h=upper.height;
    const layout=modes.includes(mode)?mode:modes[page%3];
    const overlay=compose(w,h,layout,page,active);
    const next=[layout,page,active].join("/");
    if(next!==signature) {previous=playing?current:null;signature=next;changeTime=time;}
    current=overlay;
    backdrop(ctx,w,h,time);
    if(!playing) previous=null;
    const mix=previous?ease((time-changeTime)/1.4):1;
    if(previous && mix<1){ctx.globalAlpha=1-mix;ctx.drawImage(previous,0,0);}
    else previous=null;
    ctx.globalAlpha=mix;ctx.drawImage(current,0,0);ctx.globalAlpha=1;
    const ribbon=lower.getContext("2d"),rw=lower.width,rh=lower.height;
    backdrop(ribbon,rw,rh,time,true);
    ribbon.fillStyle="rgba(1,29,69,.65)";ribbon.fillRect(0,0,rw,rh);
    strip.forEach((entry,k)=>{
      const left=(k?(entry.u+strip[k-1].u)/2:0)*rw;
      const right=(k+1<strip.length?(entry.u+strip[k+1].u)/2:1)*rw;
      const width=right-left, ink=themes.find(z=>z.id===entry.zone).ink;
      ribbon.save();ribbon.beginPath();ribbon.rect(left,0,width,rh);ribbon.clip();
      objectAction(ribbon,entry.kind,left+width*.19,rh*.52,width*.31,rh*.58,time+k*.14,ink);
      ribbon.textBaseline="top";label(ribbon,entry.objectTitle,left+width*.38,rh*.25,width*.59,rh*.21,2);
      ribbon.restore();
    });
  }
  return draw;
}
