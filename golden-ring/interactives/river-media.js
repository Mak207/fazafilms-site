export const views=['Лесной исток','Деревянный мостик','Звонница у воды','Песчаная коса','Излучина среди полей','Буксир с баржами','Тихая пристань','Парус у берега','Берёзы под снегом','Жигулёвский берег','Протоки дельты','Птицы над Каспием','Половодье','Река с моста','Слияние рек','Светлый обрыв','Портовые склады','Водосброс','Огни причала','Иван-чай на берегу','Монастырская долина','Ледоход','Деревенская переправа','Каспийские тростники'];
// A permutation of 0..23. Across three panes, the complete 24-view programme takes eight changes.
export function viewNumber(group,slot){const n=Math.max(0,Math.floor(group));return ((n%8)*3*7+((slot+Math.floor(n/8))%3)*7)%views.length;}
export const framePath=(group,slot=0)=>'art/volga-windows/'+(viewNumber(group,slot)+1)+'.webp';
export async function riverMedia(T,id){
  const load=url=>new Promise((ok,fail)=>{const image=new Image();image.onload=()=>ok(image);image.onerror=fail;image.src=url;});
  const isMap=id==='soundmap';
  const images=await Promise.all(isMap?[0,1,2,3].map(i=>load('art/volga-map/'+i+'.webp')):views.map((_,i)=>load('art/volga-windows/'+(i+1)+'.webp')));
  function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d'),texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;return {c,ctx,texture};}
  const wall=surface(isMap?1536:1536,isMap?664:640);
  const panes=isMap?[]:Array.from({length:3},()=>surface(384,512));
  let last='';
  function paint(ctx,im,x,y,w,h){const k=Math.max(w/im.width,h/im.height);ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(im,x+(w-im.width*k)/2,y+(h-im.height*k)/2,im.width*k,im.height*k);ctx.restore();}
  function condensation(ctx,w,h,p){
    if(p>=1)return;
    const g=ctx.createLinearGradient(w*(p-.05),0,w*(p+.13),0);g.addColorStop(0,'rgba(184,207,205,0)');g.addColorStop(1,'rgba(166,192,191,.91)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(219,232,228,.47)';for(let i=0;i<100;i++){const x=((i*317)%997)/997*w;if(x/w<p+.03)continue;const y=((i*211)%991)/991*h;ctx.fillRect(x,y,1.6,4+(i%4));}
  }
  function redraw(p,elapsed=0,approach=1,state=null){
    const group=Math.floor(Math.max(0,elapsed)/5),section=state?.mapSection??(p<=0?0:Math.min(3,Math.ceil(p*3-.00001)));
    const key=isMap?section:group+':'+Math.round(p*100);
    if(key===last)return;last=key;
    if(isMap){wall.ctx.drawImage(images[section],0,0,wall.c.width,wall.c.height);}
    else for(let i=0;i<3;i++){
      const im=images[viewNumber(group,i)],pane=panes[i];
      paint(pane.ctx,im,0,0,pane.c.width,pane.c.height);condensation(pane.ctx,pane.c.width,pane.c.height,p);pane.texture.needsUpdate=true;
      wall.ctx.drawImage(pane.c,i*512,0,512,640);
      if(i){wall.ctx.fillStyle='#1c312f';wall.ctx.fillRect(i*512-2,0,4,640);}
    }
    wall.texture.needsUpdate=true;
  }
  redraw(0);return {texture:wall.texture,panes:panes.map(p=>p.texture),redraw};
}
