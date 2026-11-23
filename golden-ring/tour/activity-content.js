import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';

// Interpretive text is drawn from the received concept (21.10.2026). The
// illustrated workshop gestures are a mouse-operated adaptation of its inputs.
export const ACTIVITY_STORIES = Object.freeze({
  scroll: [
    { title:'1157 · Рождение столицы', text:'Перенос княжеского центра во Владимир открывает летопись. Белокаменная архитектура становится языком власти и памяти.', page:23 },
    { title:'1408 · Образ и память', text:'Андрей Рублёв и росписи Успенского собора. Княжеская столица раскрывается через искусство и духовную культуру.', page:14 },
    { title:'Суздаль · Город и ремесло', text:'Белокаменные ансамбли, деревянные постройки и работа мастера продолжают рассказ о Владимирской земле.', page:25 }
  ],
  well: [
    { id:'kalyazin', title:'Калязин · Вода и память', text:'Колокольня остаётся знаком города среди воды. Круги отражения собирают образ, а пар открывает следующий сюжет.', page:28 },
    { id:'kashin', title:'Кашин · Источники', text:'Излучина Кашинки и минеральные источники связывают город с темой исцеления. Зелёные отражения раскрывают движение живой воды.', page:28 },
    { id:'three-seas', title:'Афанасий Никитин · Три моря', text:'Вода становится дорогой дальнего путешествия. Волны ведут взгляд от знакомого берега к открытому пространству.', page:28 }
  ],
  boats: [
    { title:'Лодка · Река соединяет', text:'Деревянные волжские лодки связывают поселения. Река служит дорогой, по которой движутся люди, ремёсла и товары.', page:33 },
    { title:'Пароход · Новый ритм', text:'Паровое судоходство меняет масштаб речного пути. Пристани собирают пассажиров и груз, города включаются в общий обмен.', page:33 },
    { title:'Теплоход · Продолжение пути', text:'Современный теплоход продолжает движение по Волге. Исторические берега складываются в маршрут путешествия.', page:33 }
  ],
  bobbins: [
    { id:'filigree', title:'Красное-на-Волге · Скань', text:'Тонкая металлическая нить образует ажур. Вращающаяся бобина раскрывает световой узор и показывает переход от материала к мастерству.', page:45 },
    { id:'capital', title:'Кострома · Капитал Чижова', text:'Торговля превращается в образование и развитие города. В концепции этот сюжет связывает капитал, училища и электрический свет.', page:45 },
    { id:'salt', title:'Нерехта · Соль и полотно', text:'От соляных варниц к ткацким мануфактурам: промысел связывает землю, обмен и работу мастера.', page:46 }
  ]
});

export const WORKSHOP_ACTIVITIES = Object.freeze({
  pottery:{ title:'Мастерская керамики', action:'Поднять стенки сосуда', hint:'Каждое нажатие поднимает стенки. Сформируйте горлышко и завершите сосуд.', story:'Из бесформенной глины рождается объём. В концепции это обучение в виртуальной мастерской.', page:59, color:'#cf8f61' },
  matryoshka:{ title:'Тайна русской матрёшки', action:'Открыть матрёшку', hint:'Нажимайте на экран: один клик раскрывает следующую матрёшку. Цель — 79.', story:'В концепции хлопок раскрывает вложенную матрёшку. Здесь тем же действием служит клик.', page:59, color:'#c64536' },
  gorodets:{ title:'Художник Городца', action:'Расписать узор', hint:'Запомните цвет следующего элемента на образце и выберите его в палитре.', story:'Цветовая память и движение кисти складываются в городецкую роспись.', page:59, color:'#ca4934' },
  palekh:{ title:'Секреты Палеха', action:'Расписать миниатюру', hint:'Сверяйтесь с образцом и выбирайте цвет следующего элемента.', story:'Светлая линия и цвет разворачиваются на тёмном фоне миниатюры.', page:59, color:'#d6b76b' },
  lace:{ title:'Кружевное одеяние', action:'Примерить следующий узор', hint:'Выберите кружево на силуэте. Три узора показывают, как рисунок меняет образ.', story:'Калязинское кружево становится частью одежды. В павильоне предусмотрена фотозона; здесь показан выбор узора.', page:60, color:'#d8e1d1' },
  glass:{ title:'Мастер-стеклодув', action:'Выдуть форму', hint:'Удерживайте силу потока в зелёной области. Нажатия поддерживают процесс.', story:'Ровное дыхание формирует стекло. Слишком сильный или слабый поток не даёт сохранить форму.', page:60, color:'#80c8c7' },
  finift:{ title:'Мастерская финифти', action:'Нанести слой росписи', hint:'Наносите слои: основа, рисунок, цвет, обжиг. Каждый клик открывает следующий этап.', story:'Роспись появляется на эмалевой поверхности постепенно. В концепции предусмотрено обучение в VR.', page:60, color:'#88b8c8' },
  filigree:{ title:'Искусство филиграни', action:'Соединить детали', hint:'Нажимайте, чтобы соединять металлические детали по очереди. Свет показывает готовые стыки.', story:'Из отдельных металлических элементов складывается цельная вещь. Свет подтверждает каждый соединённый стык.', page:60, color:'#ddb765' }
});

export function activityNarrative(id, state={}) {
  const list=ACTIVITY_STORIES[id];
  if (list) {
    const item=(state.theme ? list.find(x=>x.id===state.theme) : null) || list[Math.min(list.length-1, Math.max(0,id==='scroll'?state.chapter||0:Math.floor((state.progress||0)*list.length)))];
    return item;
  }
  if(id==='workshops') {const craft=WORKSHOP_ACTIVITIES[state.craft]||WORKSHOP_ACTIVITIES.pottery;return {title:craft.title,text:craft.story,page:craft.page};}
  if(id==='bells')return {title:state.voices===7?'Соборный звон · Вместе':'Соборный звон · Соберите голоса',text:'Каждое нажатие добавляет голос. Три голоса соединяются в общий перезвон — веб-версия совместного участия под подвесами.',page:38};
  if(id==='ornament')return {title:'Орнамент · Ритм руки',text:'Ровный ритм превращает нить в порядок. Нажимайте последовательно или ведите ползунок; готовый узор становится частью общего полотна этого посещения.',page:49};
  if(id==='finale')return {title:'Путешествие начинается',text:'Выберите город и интерес. Панорама проходит от дня к ночи и связывает три остановки вашего маршрута.',page:63};
  return null;
}

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const TAU=Math.PI*2;
const COLORS=['#c94c37','#347da0','#6d8b5e'];
function rounded(c,x,y,w,h,r=18){c.beginPath();c.roundRect(x,y,w,h,r);}
function text(c,s,x,y,size=26,color='#eee6d1',align='left'){c.font=`${size>=44?'600':'400'} ${size}px ${size>=44?'Georgia':'Arial'},serif`;c.fillStyle=color;c.textAlign=align;c.fillText(String(s),x,y);}
function wrap(c,s,x,y,width,size=24,color='#d6d4c6',lineHeight=32,max=3){c.font=`${size}px Arial,sans-serif`;c.fillStyle=color;c.textAlign='left';let line='',row=0;for(const word of String(s).split(' ')){const next=line?line+' '+word:word;if(c.measureText(next).width>width&&line){c.fillText(line,x,y+row*lineHeight);row++;line=word;if(row>=max)return;}else line=next;}if(row<max)c.fillText(line,x,y+row*lineHeight);}
function line(c,points,color,width=3){c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function imageCover(c,image,x,y,w,h,opacity=.2){if(!image)return;const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;if(!iw||!ih)return;const s=Math.max(w/iw,h/ih);c.save();c.globalAlpha=opacity;rounded(c,x,y,w,h,14);c.clip();c.drawImage(image,x+(w-iw*s)/2,y+(h-ih*s)/2,iw*s,ih*s);c.restore();}
function vessel(c,cx,cy,progress,color,glass=false){const p=clamp(progress),h=80+p*210,w=95+p*30;c.save();c.translate(cx,cy);const g=c.createLinearGradient(-w,0,w,0);g.addColorStop(0,glass?'rgba(110,195,203,.45)':'#9a5b39');g.addColorStop(.35,color);g.addColorStop(.7,glass?'rgba(225,249,240,.82)':'#e0aa78');g.addColorStop(1,glass?'rgba(77,156,177,.4)':'#90512e');c.fillStyle=g;c.beginPath();c.moveTo(-w*.72,0);c.bezierCurveTo(-w*1.1,-h*.32,-w*.88,-h*.69,-w*.48,-h);c.lineTo(w*.48,-h);c.bezierCurveTo(w*.88,-h*.69,w*1.1,-h*.32,w*.72,0);c.closePath();c.fill();c.strokeStyle=glass?'#c9f3ed':'#f1c693';c.lineWidth=4;c.stroke();c.beginPath();c.ellipse(0,-h,w*.48,13,0,0,TAU);c.fillStyle=glass?'#618f9a':'#865331';c.fill();c.stroke();for(let i=1;i<9;i++){c.beginPath();c.ellipse(0,-h*i/10,w*(.8-.2*i/10),5,0,0,Math.PI);c.strokeStyle=glass?'rgba(220,255,248,.14)':'rgba(91,48,22,.16)';c.lineWidth=2;c.stroke();}c.restore();}
function flower(c,x,y,r,colors,completion=1){c.save();c.translate(x,y);for(let i=0;i<12;i++){if(i/12>completion)continue;const a=i*TAU/12;c.fillStyle=colors[i%colors.length];c.beginPath();c.ellipse(Math.cos(a)*r*.55,Math.sin(a)*r*.55,r*.3,r*.17,a,0,TAU);c.fill();}c.fillStyle='#e5be6d';c.beginPath();c.arc(0,0,r*.22,0,TAU);c.fill();c.restore();}
function matryoshka(c,x,y,scale,color){c.save();c.translate(x,y);c.scale(scale,scale);c.fillStyle=color;c.beginPath();c.moveTo(-55,70);c.bezierCurveTo(-100,20,-58,-10,-43,-58);c.bezierCurveTo(-63,-115,63,-115,43,-58);c.bezierCurveTo(58,-10,100,20,55,70);c.closePath();c.fill();c.strokeStyle='#e1bd75';c.lineWidth=3;c.stroke();c.fillStyle='#f2d4ac';c.beginPath();c.ellipse(0,-60,28,33,0,0,TAU);c.fill();c.fillStyle='#382b25';for(const xx of [-10,10]){c.beginPath();c.arc(xx,-63,2.7,0,TAU);c.fill();}line(c,[[-8,-45],[0,-41],[8,-45]],'#ad544d',2);flower(c,0,12,38,['#e0b05d','#f1d3a0','#547e6b']);c.restore();}
function ship(c,x,y,type,scale=1){c.save();c.translate(x,y);c.scale(scale,scale);c.fillStyle='#d8bd83';c.beginPath();c.moveTo(-95,0);c.lineTo(96,0);c.lineTo(74,29);c.lineTo(-67,29);c.closePath();c.fill();line(c,[[-100,-1],[101,-1]],'#755939',5);if(type===0){line(c,[[0,0],[0,-106]],'#c7b38c',5);c.fillStyle='#dfd5b4';c.beginPath();c.moveTo(4,-103);c.lineTo(4,-9);c.lineTo(69,-12);c.closePath();c.fill();}else{c.fillStyle='#e6dfc9';c.fillRect(-58,-40,105,40);c.fillStyle='#b76b49';c.fillRect(-10,-72,20,32);if(type===2){c.fillStyle='#f4ead4';c.fillRect(-45,-62,77,22);}for(let i=0;i<5;i++){c.fillStyle='#456f75';c.fillRect(-47+i*19,-30,12,16);}}c.restore();}

/** One texture per verified display face. Nothing is recorded or uploaded. */
export function createActivityCanvas(renderer,{id,aspect=16/9,ordinal=0}={}){
  if(!['scroll','boats','bobbins','ornament','workshops'].includes(id))return null;
  const canvas=document.createElement('canvas');const a=Math.max(.45,Math.min(3.6,aspect));
  canvas.width=a>=1?Math.min(2048,Math.max(1024,Math.round(1280*a/1.777))):1024;
  canvas.height=Math.min(2048,Math.max(640,Math.round(canvas.width/a)));
  const c=canvas.getContext('2d');const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  let drawCount=0,lastKey='',lastState={};
  function draw(state={},photo=null){
    const key=JSON.stringify([id,state.chapter,state.theme,state.craft,state.step,state.count,state.pattern,state.assembled,state.palette,state.sample,state.completed,Math.round((state.progress||0)*600),Math.round((state.angle||0)*90),state.running,Math.round((state.blow||0)*30),state.feedback]);
    if(key===lastKey)return false;lastKey=key;lastState={...state};drawCount++;
    c.setTransform(1,0,0,1,0,0);c.fillStyle='#132a28';c.fillRect(0,0,canvas.width,canvas.height);
    const scale=Math.min(canvas.width/1280,canvas.height/900);
    c.setTransform(scale,0,0,scale,(canvas.width-1280*scale)/2,(canvas.height-900*scale)/2);
    c.fillStyle=id==='ornament'?'#152a28':'#132a28';c.fillRect(0,0,1280,900);
    const grad=c.createLinearGradient(0,0,1280,900);grad.addColorStop(0,'rgba(213,180,112,.14)');grad.addColorStop(1,'rgba(31,83,84,.20)');c.fillStyle=grad;c.fillRect(0,0,1280,900);
    imageCover(c,photo?.image||photo,44,142,1192,600,.14);
    const n=activityNarrative(id,state)||{title:'Орнамент',text:''};
    text(c,id==='workshops'?'МАСТЕРСКАЯ · ПОПРОБУЙТЕ САМИ':'ЗОЛОТОЕ КОЛЬЦО · ЖИВАЯ ЭКСПОЗИЦИЯ',62,56,23,'#d5b573');
    text(c,n.title,62,112,48);
    c.strokeStyle='#b4955d';c.lineWidth=2;c.strokeRect(45,139,1190,594);
    if(id==='scroll'){
      imageCover(c,photo?.image||photo,65,157,1150,480,.92);
      c.fillStyle='rgba(17,35,31,.90)';c.fillRect(65,505,1150,210);
      text(c,['ВЛАДИМИР','ОБРАЗ И ПАМЯТЬ','СУЗДАЛЬ'][state.chapter||0],96,561,43,'#ead6a7');
      wrap(c,n.text,96,607,1060,28,'#f1ecdb',38,3);
      const p=clamp(state.progress);line(c,[[85,698],[1195,698]],'#7b8166',5);line(c,[[85,698],[85+1110*p,698]],'#dcb56c',8);
      for(let i=0;i<3;i++){c.fillStyle=(state.chapter||0)===i?'#f7dd9a':'#6e8b7e';c.beginPath();c.arc(85+i*555,698,10,0,TAU);c.fill();}
    }else if(id==='boats'){
      const p=clamp(state.progress),type=Math.min(2,Math.floor(p*3));
      const water=c.createLinearGradient(0,295,0,685);water.addColorStop(0,'#477d7d');water.addColorStop(1,'#173e46');c.fillStyle=water;c.fillRect(65,295,1150,410);
      for(let row=0;row<10;row++){const pts=[];for(let x=65;x<=1215;x+=16)pts.push([x,320+row*38+Math.sin(x*.02-p*TAU*4+row)*7]);line(c,pts,'rgba(203,226,209,.25)',2);}
      for(let i=0;i<3;i++){const x=240+i*400;ship(c,x+(type===i?Math.sin(p*TAU*3)*35:0),480,i,type===i?1.3:.75);text(c,['Лодка','Пароход','Теплоход'][i],x,620,31,i===type?'#f4d691':'#c9d8cd','center');}
      wrap(c,n.text,90,195,1090,29,'#eee9d6',39,2);
      text(c,'РЕКА ВРЕМЕНИ · НЕПРЕРЫВНОЕ ДВИЖЕНИЕ',640,683,24,'#cdd8c9','center');
    }else if(id==='bobbins'){
      const index=({filigree:0,capital:1,salt:2})[state.theme]||0;
      const colors=[['#d8b66c','#e9d9b5','#9da783'],['#cbb078','#a0bda9','#f2d68c'],['#e8e9d3','#9ec9c1','#c7a97d']][index];
      if(index===0){c.save();c.translate(390,430);c.rotate((state.angle||0)*.5);for(let r=60;r<=225;r+=55){for(let j=0;j<12;j++){const a=j*TAU/12;flower(c,Math.cos(a)*r,Math.sin(a)*r,25,colors,1);}}c.restore();}
      else if(index===1){
        c.fillStyle='#c2ad7f';c.fillRect(170,350,425,260);c.beginPath();c.moveTo(145,350);c.lineTo(385,230);c.lineTo(625,350);c.closePath();c.fill();
        for(let y=0;y<3;y++)for(let x=0;x<6;x++){c.fillStyle=(x+y+Math.floor((state.angle||0)*3))%7<4?'#e9d88c':'#344a42';c.fillRect(205+x*60,390+y*65,28,39);}
        text(c,'УЧИЛИЩА',385,323,26,'#4b553e','center');line(c,[[145,630],[635,630]],'#d5ba7b',7);
        c.fillStyle='#edda8f';c.beginPath();c.arc(385,193,28,0,TAU);c.fill();for(let i=0;i<10;i++){const a=i*TAU/10;line(c,[[385+Math.cos(a)*40,193+Math.sin(a)*40],[385+Math.cos(a)*65,193+Math.sin(a)*65]],'#b9a06b',3);}
      }else{
        for(let i=0;i<12;i++){const x=195+(i%4)*130,y=270+Math.floor(i/4)*120,a=(state.angle||0)*.15+i*.37;c.save();c.translate(x,y);c.rotate(a);c.fillStyle=colors[i%3];c.beginPath();for(let j=0;j<6;j++){const b=j*TAU/6;(j?c.lineTo:c.moveTo).call(c,Math.cos(b)*45,Math.sin(b)*45);}c.closePath();c.fill();c.strokeStyle='#f0edda';c.lineWidth=3;c.stroke();c.restore();}
        line(c,[[140,640],[280,630],[390,650],[530,632],[640,645]],'#7fb3ac',10);text(c,'ОТ СОЛИ К ПОЛОТНУ',390,695,27,'#d5d9bd','center');
      }
      const words=[['МЕТАЛЛ','НИТЬ','АЖУР'],['ТОРГОВЛЯ','ОБРАЗОВАНИЕ','СВЕТ'],['ЗЕМЛЯ','ПРОМЫСЕЛ','ОБМЕН']][index];
      words.forEach((word,i)=>{c.fillStyle='#27483f';rounded(c,760,245+i*120,365,82,18);c.fill();text(c,word,942,299+i*120,31,'#e9d4a0','center');if(i<2)line(c,[[942,328+i*120],[942,355+i*120]],'#cfb274',4);});
    }else if(id==='ornament'){
      const p=clamp(state.progress),pattern=state.pattern||0;c.fillStyle='#dfd2ad';c.fillRect(66,162,1148,546);
      const total=144;for(let i=0;i<total;i++){const col=i%18,row=Math.floor(i/18),x=95+col*64,y=192+row*64;const done=i/total<p;c.strokeStyle=done?'#b93f31':'#b5ae91';c.lineWidth=done?9:1.2;c.beginPath();if(pattern===1){c.moveTo(x-18,y);c.lineTo(x,y-23);c.lineTo(x+18,y);c.lineTo(x,y+23);c.closePath();}else if(pattern===2){c.arc(x,y,21,0,Math.PI*1.6);}else{c.moveTo(x-19,y-19);c.lineTo(x+19,y+19);c.moveTo(x+19,y-19);c.lineTo(x-19,y+19);}c.stroke();}
      const cursor=Math.min(total-1,Math.floor(p*total));c.strokeStyle='#285f62';c.lineWidth=3;c.strokeRect(69+(cursor%18)*64,166+Math.floor(cursor/18)*64,58,58);
      text(c,'РОВНЫЙ РИТМ РУКИ → ЦЕЛЬНОЕ ПОЛОТНО',640,684,25,'#33534a','center');
      if((state.archive||[]).length){c.fillStyle='#27443c';c.fillRect(790,156,418,56);text(c,'Полотно: '+state.completed+' фрагм.',805,193,23,'#e6d4a3');}
    }else if(id==='workshops'){
      const craft=state.craft||'pottery',p=clamp(state.progress),def=WORKSHOP_ACTIVITIES[craft]||WORKSHOP_ACTIVITIES.pottery;
      if(craft==='pottery'||craft==='glass'){
        c.fillStyle='#2a433b';c.beginPath();c.ellipse(570,671,240,38,0,0,TAU);c.fill();vessel(c,570,637,p,def.color,craft==='glass');
        if(craft==='glass'){const blow=clamp(state.blow??.55);c.fillStyle='#516255';c.fillRect(990,250,52,360);c.fillStyle='#85b483';c.fillRect(990,250+360*.32,52,360*.36);line(c,[[974,610-360*blow],[1058,610-360*blow]],'#f4d58b',9);text(c,'ПОТОК',1016,664,25,'#d4dac9','center');}
        text(c,Math.round(p*100)+'%',570,240,40,'#e8d3a0','center');
      }else if(craft==='matryoshka'){
        const count=state.count||0;matryoshka(c,315,485,2.1,'#c44936');for(let i=0;i<Math.min(7,1+count);i++)matryoshka(c,610+i*78,540,1.05-i*.085,COLORS[i%3]);text(c,String(count)+' / 79',690,246,56,'#e9d9ab','center');text(c,'ОДИН КЛИК — ОДНО ОТКРЫТИЕ',690,300,24,'#bcd2bf','center');
      }else if(craft==='gorodets'||craft==='palekh'){
        c.fillStyle=craft==='palekh'?'#10151a':'#d9c698';rounded(c,95,190,1090,480,30);c.fill();
        const colors=craft==='palekh'?['#d9bc65','#bb4134','#6e9062']:COLORS;
        if(craft==='gorodets'){for(let i=0;i<8;i++){const x=220+(i%4)*275,y=310+Math.floor(i/4)*220;flower(c,x,y,78,colors,state.sample?1:clamp(p*8-i));}}
        else{
          const done=state.sample?8:Math.ceil(p*8);c.lineWidth=4;c.strokeStyle='#d9bc65';
          // A clearly schematic learning motif: gold line, dark ground, a horse
          // and a red rider, rather than calling generic flowers a Palekh scene.
          if(done>0){line(c,[[180,620],[350,570],[560,610],[820,555],[1100,610]],'#6e9062',9);}
          if(done>1){c.fillStyle='#d9bc65';c.beginPath();c.ellipse(620,460,160,72,-.08,0,TAU);c.fill();}
          if(done>2){c.fillStyle='#d9bc65';c.beginPath();c.moveTo(720,440);c.lineTo(765,322);c.lineTo(830,292);c.lineTo(868,345);c.lineTo(805,370);c.lineTo(790,488);c.closePath();c.fill();}
          if(done>3){line(c,[[505,493],[460,576],[430,608]],'#d9bc65',18);line(c,[[710,501],[740,558],[810,600]],'#d9bc65',18);}
          if(done>4){line(c,[[485,450],[395,475],[350,555]],'#d9bc65',14);}
          if(done>5){c.fillStyle='#bb4134';c.beginPath();c.moveTo(610,328);c.lineTo(555,415);c.lineTo(685,441);c.lineTo(650,338);c.closePath();c.fill();}
          if(done>6){c.fillStyle='#d9bc65';c.beginPath();c.arc(635,300,24,0,TAU);c.fill();line(c,[[650,350],[755,364],[811,331]],'#d9bc65',5);}
          if(done>7){for(let i=0;i<14;i++){const x=180+i*70,y=263+(i%3)*30;flower(c,x,y,13,['#d9bc65'],1);}}
        }
        const next=Math.min(7,Math.floor(p*8));text(c,'Цвет следующего элемента',640,218,24,craft==='palekh'?'#e0d5b0':'#3f4b36','center');c.fillStyle=colors[next%3];c.fillRect(600,235,80,18);
      }else if(craft==='lace'){
        const pat=state.pattern||0;c.fillStyle='#49645e';c.beginPath();c.moveTo(545,230);c.lineTo(440,325);c.lineTo(500,400);c.lineTo(435,670);c.lineTo(845,670);c.lineTo(780,400);c.lineTo(840,325);c.lineTo(735,230);c.closePath();c.fill();for(let y=310;y<655;y+=35){for(let x=505;x<790;x+=35){c.strokeStyle='#f0eed6';c.lineWidth=2;c.beginPath();if(pat===1){c.moveTo(x-10,y);c.lineTo(x,y-12);c.lineTo(x+10,y);c.lineTo(x,y+12);c.closePath();}else c.arc(x,y,pat===2?13:8,0,TAU);c.stroke();}}text(c,'УЗОР '+(pat+1),640,205,32,'#e1d9b4','center');
      }else if(craft==='finift'){
        c.fillStyle='#d6c391';c.beginPath();c.ellipse(640,450,268,220,0,0,TAU);c.fill();c.fillStyle='#e9eadb';c.beginPath();c.ellipse(640,450,246,198,0,0,TAU);c.fill();for(let i=0;i<5;i++){const a=i*TAU/5;flower(c,640+Math.cos(a)*110,450+Math.sin(a)*105,75,['#4d8aa0','#c05c67','#769761'],p);}text(c,['Основа','Рисунок','Цвет','Обжиг','Готово'][Math.min(4,state.step||0)],640,195,35,'#e6d5ad','center');
      }else if(craft==='filigree'){
        const done=state.assembled||0;c.save();c.translate(640,430);for(let i=0;i<12;i++){const a=i*TAU/12;c.save();c.rotate(a);c.strokeStyle=i<done?'#f0cf7d':'#657467';c.lineWidth=i<done?7:3;c.beginPath();c.ellipse(0,-125,45,110,0,0,TAU);c.stroke();c.fillStyle=i<done?'#fff0b4':'#708878';c.beginPath();c.arc(0,-40,8,0,TAU);c.fill();c.restore();}c.restore();text(c,done+' / 12 соединений',640,705,32,'#d5c390','center');
      }
    }
    const footer=id==='workshops'?(WORKSHOP_ACTIVITIES[state.craft]||WORKSHOP_ACTIVITIES.pottery).hint:n.text;
    wrap(c,footer,65,788,1150,27,'#e0ddcb',35,2);
    text(c,state.running?'ДЕЙСТВИЕ ЗАПУЩЕНО':'НАЖМИТЕ НА ОБЪЕКТ ИЛИ ВОСПОЛЬЗУЙТЕСЬ ПАНЕЛЬЮ',65,870,20,'#c4af7c');
    texture.needsUpdate=true;return true;
  }
  return {texture,canvas,aspect:canvas.width/canvas.height,draw,snapshot:()=>({id,ordinal,width:canvas.width,height:canvas.height,drawCount,state:lastState}),dispose:()=>texture.dispose()};
}
