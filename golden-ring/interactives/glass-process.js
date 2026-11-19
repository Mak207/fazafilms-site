const clamp=x=>Math.min(1,Math.max(0,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const phases=[
  ['Горячий цех','Выдувание','Стеклодув придаёт массе форму на конце трубки.'],
  ['После отжига','Гладкая заготовка','Остывший сосуд передают в мастерскую огранки.'],
  ['Холодный цех','Алмазная грань','Мастер подаёт хрусталь к мокрому алмазному кругу.'],
  ['Гусь-Хрустальный','Готовый хрусталь','Свет проходит сквозь грани и распадается на цвета.']
];
export async function glassProcess(T){
  const photos=await Promise.all(phases.map((_,i)=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=new URL('./art/glass-process/'+(i+1)+'.webp',import.meta.url);
  })));
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=618;
  const ctx=canvas.getContext('2d',{alpha:false}),w=canvas.width,h=canvas.height;
  const plates=photos.map((image,i)=>{
    const sheet=document.createElement('canvas');sheet.width=w;sheet.height=h;
    const c=sheet.getContext('2d'),photoWidth=h*image.width/image.height;
    c.fillStyle='#201b1a';c.fillRect(0,0,w,h);
    c.save();c.beginPath();c.rect(photoWidth-2,0,w-photoWidth+2,h);c.clip();
    c.translate(w,0);c.scale(-1,1);c.drawImage(image,-90,-20,w+160,h+40);c.restore();
    let shade=c.createLinearGradient(photoWidth-90,0,w,0);
    shade.addColorStop(0,'rgba(32,23,21,.95)');shade.addColorStop(.65,'rgba(32,23,21,.88)');shade.addColorStop(1,'rgba(25,19,18,.94)');
    c.fillStyle=shade;c.fillRect(photoWidth-90,0,w-photoWidth+90,h);
    c.drawImage(image,0,0,photoWidth,h);
    shade=c.createLinearGradient(photoWidth-78,0,photoWidth+1,0);shade.addColorStop(0,'rgba(32,23,21,0)');shade.addColorStop(1,'rgba(32,23,21,.95)');c.fillStyle=shade;c.fillRect(photoWidth-78,0,79,h);
    const x=photoWidth+38;
    c.fillStyle='#dcb87e';c.font='500 24px Georgia';c.fillText(phases[i][0],x,217);
    c.strokeStyle='#b89d71';c.lineWidth=2;c.beginPath();c.moveTo(x,242);c.lineTo(x+58,242);c.stroke();
    c.fillStyle='#fff3da';c.font='48px Georgia';c.fillText(phases[i][1],x,313,w-x-19);
    c.fillStyle='#f1e5d1';c.font='27px Georgia';
    let line='',y=372;
    for(const word of phases[i][2].split(' ')){const next=line?line+' '+word:word;if(c.measureText(next).width>w-x-49&&line){c.fillText(line,x,y);line=word;y+=38;}else line=next;}c.fillText(line,x,y);
    return sheet;
  });
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;
  let stamp='';
  function redraw(progress,elapsed,approach,state){
    const s=state?.glassPhase??clamp(progress)*3;
    const i=Math.min(3,Math.floor(s)),mix=i<3?smooth((s-i-.68)/.32):0;
    const t=i===3?(elapsed||0):0,next=i+'/'+mix.toFixed(3)+'/'+Math.round(t*16);if(next===stamp)return;stamp=next;
    ctx.globalAlpha=1;ctx.drawImage(plates[i],0,0);
    if(mix){
      const split=Math.round(h*photos[i].width/photos[i].height);
      ctx.globalAlpha=mix;ctx.drawImage(plates[i+1],0,0,split,h,0,0,split,h);ctx.globalAlpha=1;
      if(mix>=.5)ctx.drawImage(plates[i+1],split,0,w-split,h,split,0,w-split,h);
      ctx.fillStyle='rgba(31,23,21,'+(.91*(1-Math.abs(2*mix-1)))+')';ctx.fillRect(split,0,w-split,h);
    }
    if(i===3){
      const jewels=[[.38,.56],[.55,.63],[.43,.78],[.593,.48]],photoWidth=h*photos[3].width/photos[3].height;
      ctx.save();ctx.globalCompositeOperation='screen';
      for(const [j,[u,v]] of jewels.entries()){
        const pulse=Math.max(0,Math.cos(t*1.18+j*1.56))**8;
        ctx.globalAlpha=pulse*.68;ctx.strokeStyle=j%2?'#fff6dc':'#e0efff';ctx.lineWidth=1.2;
        const x=u*photoWidth,y=v*h,r=2+pulse*9;
        ctx.beginPath();ctx.moveTo(x-r,y+r*.4);ctx.lineTo(x+r,y-r*.4);ctx.moveTo(x-r*.32,y-r*.75);ctx.lineTo(x+r*.32,y+r*.75);ctx.stroke();
      }ctx.restore();
    }
    texture.needsUpdate=true;
  }
  redraw(0);return {texture,redraw};
}
