/* Close inspection of three proposed exhibition assemblies. All model points
   use the existing room coordinates; inspection targets sit on visible parts. */
(() => {
  'use strict';
  const tau = 2 * Math.PI;
  const iron = '#364744', brass = '#b39458', copper = '#b56948', linen = '#eddfbf';
  const led = '#a6e1c8', amber = '#ffd071';
  const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
  const mix = (a, b, fraction) => a.map((value, i) => value + (b[i] - value) * fraction);
  const flat = {unlit: true};

  function wallLoop(m, x, y, z, width, height, color, thickness) {
    m.line([[x,y,z],[x+width,y,z],[x+width,y+height,z],[x,y+height,z],[x,y,z]],color,thickness);
  }
  function signal(m, points, amount, color) {
    m.line(points,'#41534d',.045);
    if (amount<=0) return;
    const progress = clamp(amount) * (points.length-1), index = Math.floor(progress);
    const lit = points.slice(0, index+1);
    if (index < points.length-1) lit.push(mix(points[index],points[index+1],progress-index));
    if (lit.length>1) m.line(lit,color,.021,{unlit:true});
  }
  function brassBand(m,x,y,z,rx,rz,color,width) {
    const path = Array.from({length:25},(_,i)=>[x+rx*Math.cos(tau*i/24),y,z+rz*Math.sin(tau*i/24)]);
    m.line(path,color,width);
  }
  function ferrule(m,a,b,thickness,colour) { m.rod(a,b,thickness,colour,9); }

  function makeBells(m,p,t,state) {
    const padZ=.02;
    for(let i=0;i<3;i++){
      const x=-2.72+i*2.13, r=.63-i*.10, h=.88-i*.115, top=2.85-i*.08;
      const active=p>i+.30;
      // An inset pressure mat with a low brass rim. The diaphragm translates
      // by a few millimetres in use; the seam remains visible from the side.
      m.cyl(x,.008,padZ,.68,.018,'#625948',20,.83);
      m.cyl(x,.026,padZ,.637,.017,active?'#75674d':'#615f54',20,.83);
      brassBand(m,x,.046,padZ,.58,.46,active?amber:'#bdad8b',.022);
      for(let j=-2;j<=2;j++) {
        const z=padZ+j*.092, reach=.47*Math.sqrt(1-(j*.19)**2);
        m.line([[x-reach,.046,z],[x+reach,.046,z]],'#918675',.015);
      }
      // Hardware on the crown catches the eye against the dark river wall.
      m.rod([x-.29,2.87,-.7],[x+.29,2.87,-.7],.079,iron,9);
      for(const side of [-1,1]){
        m.box(x+side*.22,2.76,-.70,.078,.28,.30,iron);
        m.rod([x+side*.22,2.89,-.53],[x+side*.22,2.89,-.49],.048,brass,6);
        m.rod([x+side*.16,2.81,-.58],[x+side*.075,top-.025,-.61],.030,brass);
      }
      const shoulder=top-.26*h;
      brassBand(m,x,shoulder,-.70,r*.52,r*.52,'#dfcc84',.021);
      brassBand(m,x,top-h+.03,-.70,r*1.012,r*1.012,'#e9d28b',.026);
      // A cast lozenge frieze lies on the bell wall. Only the facing half is
      // decorated, so the silhouette remains clean in the wide room.
      for(let j=0;j<6;j++){
        const a=Math.PI*(j+.54)/6;
        const at=(theta,y,ratio)=>[x+Math.cos(theta)*r*ratio,y,-.70+Math.sin(theta)*r*ratio];
        m.line([at(a-.10,top-.46*h,.61),at(a,top-.39*h,.56),at(a+.10,top-.46*h,.61),at(a,top-.54*h,.66),at(a-.10,top-.46*h,.61)],'#dfbd75',.023);
      }
      // Directional audio unit under the timber. The bell casting is a visual
      // reference; recorded sound is sourced from this independently wired unit.
      const speakerX=x+.61;
      m.rod([speakerX,2.93,-.69],[speakerX,2.81,-.69],.037,iron);
      m.profile(speakerX,2.58,-.69,[[0,.19],[.05,.19],[.19,.11]],'#475753',14);
      brassBand(m,speakerX,2.59,-.69,.184,.184,active?amber:brass,.021);
      if(active && state.hardware){
        for (let j=0;j<2;j++) {
          const y=2.35-j*.32;
          m.line([[speakerX-.14-j*.07,y+.07,-.68],[speakerX,y,-.52],[speakerX+.14+j*.07,y+.07,-.68]],amber,.026,flat);
        }
      }
    }
    // Diagonal braces and blackened steel joining plates define the structure.
    for(const x of [-3.55,2.50]){
      const sign=x<0?1:-1;
      m.rod([x,2.24,-.70],[x+sign*.71,2.98,-.70],.080,'#8d663e');
      m.box(x,2.78,-.512,.32,.28,.028,iron);
      for(const dx of [-.09,.09]) m.rod([x+dx,2.9,-.50],[x+dx,2.9,-.46],.033,brass,6);
      m.box(x,.03,-.70,.35,.13,.38,'#697066');
    }
    // Controller remains accessible on the audience side of the right upright.
    m.box(2.48,.97,-.45,.48,.64,.22,'#4a5c56');
    m.box(2.48,1.06,-.328,.39,.47,.017,'#77847a');
    m.box(2.48,1.255,-.31,.37,.23,.013,'#314540');
    for(const dx of [-.175,.175])for(const dy of [.04,.425])
      m.rod([2.48+dx,1.06+dy,-.321],[2.48+dx,1.06+dy,-.303],.014,brass,6);
    for(let i=0;i<3;i++){
      const x=2.35+i*.13;
      for(let j=0;j<3;j++)m.box(x,1.285+j*.044,-.292,.064,.031,.008,i<p?led:'#4b5a50');
      m.rod([x,1.197,-.32],[x,1.197,-.28],.035,iron,9);
      m.rod([x,1.197,-.281],[x,1.197,-.267],.022,brass,6);
      m.rod([x,.98,-.43],[x,.93,-.43],.031,iron,8);
      m.line([[x,.94,-.43],[x,.86,-.40],[2.42+i*.02,.79,-.46]],'#465a53',.025);
    }
    if(state.hardware){
      for(let i=0;i<3;i++){
        const x=-2.72+i*2.13;
        signal(m,[[x+.57,.054,.09],[x+.75,.052,-.28],[x+.75,.052,-.95+i*.055],[2.45,.052,-.95+i*.055],[2.45,1.07,-.44]],p-i,led);
      }
      signal(m,[[2.52,1.55,-.41],[2.53,2.95,-.48],[-2.09,2.95,-.48],[-2.09,2.76,-.67]],p,amber);
    }
  }

  function flowerImage(m,center,radius,index,onWall) {
    const [x,y,z]=center;
    const convert=(u,v)=>onWall?[x+u*radius,y+v*radius,z]:[x+u*radius,y,z-v*radius*.85];
    const u0=(index+.014)/3,u1=(index+.986)/3;
    m.face([convert(-1,-1),convert(1,-1),convert(1,1),convert(-1,1)],'#d28778',{
      media:'craft-pigment',uv:[[u0,1],[u1,1],[u1,0],[u0,0]],unlit:true
    });
  }
  function sprig(m,anchor,scale,direction,onWall) {
    const pos=(u,v,offset=0)=>onWall?
      [anchor[0]+direction*u*scale,anchor[1]+v*scale,anchor[2]+offset]:
      [anchor[0]+direction*u*scale,anchor[1]+offset,anchor[2]-v*scale];
    m.line([pos(0,0),pos(.30,.18),pos(.57,.27),pos(.84,.56)],'#cda675',.022);
    for(let i=0;i<4;i++){
      const u=.14+i*.15,v=.07+i*.073,k=i%2?1:-1;
      m.face([pos(u,v,.002),pos(u+.09,v+.17*k,.002),pos(u+.23,v+.21*k,.002),pos(u+.14,v+.067*k,.002)],i%2?'#729268':'#a6a87b',flat);
    }
  }
  function brushPose(p) {
    const head=2.98,reach=1.62,artistX=-1.03+.72*clamp(p/3),artistZ=1.56;
    const forward=.04+reach*.43;
    const wrist=[artistX+.19*Math.cos(head)+forward*Math.sin(head),.89+reach*.27,artistZ-.19*Math.sin(head)+forward*Math.cos(head)];
    const tip=[-1.52+.78*clamp(p/3),1.163,.24+.09*Math.sin(Math.PI*p*2)];
    return {head,reach,artistX,artistZ,tip,end:mix(tip,wrist,1.28)};
  }
  function makeCraft(m,p,t,state) {
    const x=-1.09, z=.11;
    // A turned rim and tool marks give the plate thickness at eye level.
    brassBand(m,x,1.138,z,.73,.488,'#745233',.031);
    brassBand(m,x,1.140,z,.686,.454,'#cf9d61',.017);
    const opened=Math.round(p);
    for(let i=0;i<3;i++){
      const u=-1.48+.38*i;
      if(i<opened){
        flowerImage(m,[u,1.161,z],.192,i,false);
        sprig(m,[u,1.151,z+.08],.19,i===0?-1:1,false);
      }
      const pot=-2.17+.19*i;
      brassBand(m,pot,1.081,.59,.078,.078,'#cfb57a',.016);
    }
    // Rings with alternating facets make an optically readable grip on the
    // existing brush axis. A soft ferrule distinguishes the working tip.
    const {head,reach,artistX,artistZ,tip,end}=brushPose(p);
    m.person(artistX,artistZ,head,'user',reach);
    ferrule(m,tip,end,.027,'#966d43');
    const bristle=mix(tip,end,.105);
    m.rod(tip,bristle,.025,p<1?'#616b8c':p<2?'#a34736':'#b96269',7);
    ferrule(m,mix(tip,end,.09),mix(tip,end,.27),.039,brass);
    for(const n of [0,1,2,3,4]){
      ferrule(m,mix(tip,end,.49+n*.049),mix(tip,end,.537+n*.049),.053,n%2?linen:iron);
    }
    // Compact optical bridge fixed to the rear of the bench. Camera and
    // down-projector have separate apertures and a common calibrated field.
    m.box(-2.28,1.03,-.34,.18,.12,.22,iron);
    m.rod([-2.28,1.13,-.34],[-2.28,2.27,-.34],.042,iron,8);
    m.rod([-2.28,2.25,-.34],[-1.09,2.25,.10],.044,iron,8);
    m.box(-1.10,2.10,.1,.41,.16,.24,'#62736a');
    m.box(-1.10,2.115,.223,.32,.095,.015,iron);
    for(const dx of [-.15,.15])m.rod([-1.10+dx,2.16,.224],[-1.10+dx,2.16,.241],.015,brass,6);
    for(let i=0;i<5;i++)m.box(-1.195+i*.036,2.154,.237,.017,.037,.006,'#95a097');
    m.box(-.985,2.154,.238,.032,.026,.006,p?led:'#837652');
    m.cyl(-1.20,2.043,.10,.060,.073,iron,12);m.cyl(-1.20,2.034,.10,.042,.012,'#6cb3b2',12);
    m.cyl(-1.016,2.042,.10,.069,.073,iron,12);m.cyl(-1.016,2.032,.10,.051,.012,'#e9c98c',12);
    for(let i=0;i<4;i++)m.box(-1.23+i*.085,2.19,.231,.045,.016,.01,'#354b42');
    const screenZ=-3.135;
    m.face([[-3.87,1.14,screenZ],[3.27,1.14,screenZ],[3.27,2.98,screenZ],[-3.87,2.98,screenZ]],'#324e43',flat);
    wallLoop(m,-3.75,1.24,screenZ+.008,6.89,1.64,'#ad975f',.027);
    for(let i=0;i<opened;i++){
      const cx=-2.59+2.24*i;
      const cy=2.13+.055*(i%2);
      sprig(m,[cx-.29,cy-.16,screenZ+.026],.82,-1,true);
      sprig(m,[cx+.28,cy-.18,screenZ+.026],.77,1,true);
      flowerImage(m,[cx,cy,screenZ+.039],.65,i,true);
    }
    if(!opened){
      for(let i=0;i<3;i++){
        const cx=-2.59+2.24*i;
        m.line(Array.from({length:23},(_,j)=>[cx+.43*Math.cos(tau*j/22),2.15+.43*Math.sin(tau*j/22),screenZ+.017]),'#72806b',.019);
      }
    }
    if(state.hardware){
      const field=[[-1.77,1.17,-.32],[-.42,1.17,-.32],[-.42,1.17,.55],[-1.77,1.17,.55]];
      field.forEach(v=>m.line([[-1.20,2.032,.10],v],p?'#91c8af':'#71958a',.017,{opacity:.75}));
      signal(m,[[-1.20,2.13,.10],[-2.29,2.21,-.34],[-2.29,.48,-.34],[-2.67,.48,-.42],[-2.67,.06,-.42],[-2.67,.06,-3.14],[-2.67,1.17,-3.14]],p,led);
    }
  }

  const ink='#2b494b', mapPaper='#d3bc86';
  function cartography(m,p) {
    const z=-3.093;
    m.face([[-4.32,1.26,z],[3.80,1.26,z],[3.80,2.84,z],[-4.32,2.84,z]],mapPaper,flat);
    wallLoop(m,-4.23,1.34,z+.008,7.93,1.42,'#806d47',.023);
    const river = [];
    for(let i=0;i<=53;i++){
      const x=-4.13+7.76*i/53;
      river.push([x,1.83+.17*Math.sin(i*.26)+.07*Math.sin(i*.62),z+.027]);
    }
    m.line(river,'#917f55',.101);m.line(river.map(([x,y,zz])=>[x,y,zz+.008]),'#789ca0',.065);
    for(let i=0;i<19;i++){
      const x=-3.90+i*.395,y=2.47+.075*Math.sin(i*1.46);
      m.line([[x-.12,y-.11,z+.012],[x,y+.055,z+.012],[x+.095,y-.06,z+.012]],'#9a9267',.013);
      if(i%3!==1)m.line([[x-.11,1.48,z+.012],[x+.06,1.55,z+.012]],'#9d9267',.013);
    }
    const stops=[[-3.61,1.72],[-1.44,2.34],[.81,1.76],[3.00,2.28]];
    // Ingest first, then draw the route. The pressed ticket produces one
    // journey at the wall; the screen is a partial view of the long panorama.
    const segments=clamp(p-2)*3;
    for(let i=0;i<4;i++){
      const [x,y]=stops[i];
      const reached=i===0?p>=2:segments>=i-.01;
      const glow=reached?'#654125':'#8c7958';
      const ring=Array.from({length:20},(_,j)=>[x+.078*Math.cos(tau*j/19),y+.078*Math.sin(tau*j/19),z+.063]);
      m.line(ring,glow,.034);
      if(!i)continue;
      const [ax,ay]=stops[i-1];
      const end=clamp(segments-i+1),path=[];
      for(let k=0;k<=12;k++){
        const f=k/12;
        path.push([ax+(x-ax)*f,ay+(y-ay)*f+.08*Math.sin(Math.PI*f),z+.050]);
      }
      m.line(path,'#ac9870',.027);
      if(end>0){
        const lit=path.slice(0,1+Math.floor(12*end));const s=end*12;
        if(lit.length<13)lit.push(mix(path[Math.floor(s)],path[Math.floor(s)+1],s%1));
        m.line(lit,'#99543a',.052);
      }
      const towerY=2.32, u=x+.13;
      const silhouette=[[-.20,0],[.22,0],[.22,.11],[.13,.11],[.13,.24],[.08,.25],[.055,.34],[.025,.39],[0,.34],[-.03,.25],[-.09,.22],[-.09,.10],[-.17,.09]];
      m.face(silhouette.map(([dx,dy])=>[u+dx,towerY+dy,z+.045]),reached?'#3c5650':'#9c926b',flat);
    }
  }
  function makePassport(m,p,t,state) {
    const x=-.65,z=.26;
    // Front apron reeded like a travel chest. The top edge of the ticket can
    // be inspected from both sides of the table.
    m.box(-1.16,.70,.718,3.02,.19,.08,'#86603a');
    m.box(-1.16,.866,.763,3.05,.022,.035,brass);
    for(const cx of [-2.45,.13])m.box(cx,.70,.772,.13,.19,.033,brass);
    const ticketY=1.079;
    m.box(x,1.059,z,.61,.019,.38,'#eecc8f');
    m.box(x,ticketY,z,.582,.005,.35,linen);
    m.line([[x-.263,ticketY+.007,z-.13],[x+.265,ticketY+.007,z-.13]],'#7a8973',.014);
    for(let i=0;i<3;i++)m.line([[x-.22,ticketY+.007,z-.105+i*.016],[x-.12+i*.016,ticketY+.007,z-.105+i*.016]],'#8f8b72',.006);
    // Three stops around the scanning bay position the front of the paper
    // repeatably while leaving an open side for withdrawal.
    m.box(x,1.041,z-.226,.71,.033,.025,brass);
    for(const dx of [-.343,.343])m.box(x+dx,1.041,z-.111,.026,.033,.235,brass);
    for(const side of [-1,1]){
      m.line([[x+side*.25,ticketY+.008,z+.10],[x+side*.25,ticketY+.008,z+.13],[x+side*.22,ticketY+.008,z+.13]],ink,.016);
    }
    for(let i=0;i<3;i++){
      const sx=x-.15+i*.148;
      const r=.047,col=p>=1?['#8d5746','#39605b','#7a6144'][i]:'#b0a58e';
      brassBand(m,sx,ticketY+.009,z,r,r,col,.013);
      if(p>=1){
        const marks=[
          [[-.023,.014],[.011,-.023],[.027,.012],[-.023,.014]],
          [[-.023,.012],[-.012,-.019],[.016,-.019],[.024,.012],[-.023,.012]],
          [[-.022,0],[0,-.024],[.023,0],[0,.020],[-.022,0]]
        ];
        m.line(marks[i].map(([u,v])=>[sx+u,ticketY+.010,z+v]),col,.011);
      }
    }
    // Reader camera sees the inked face of the ticket, not the carved bases
    // of the stamps. The amber lamp becomes green after a complete reading.
    m.box(-.215,1.056,z,.14,.37,.17,'#53625a');
    m.box(-.416,1.395,z,.53,.07,.17,iron);
    m.box(-.62,1.386,z,.24,.084,.20,'#596b60');
    m.box(-.62,1.409,z+.104,.20,.044,.010,iron);
    m.cyl(-.62,1.351,z,.064,.053,iron,14);m.cyl(-.62,1.345,z,.041,.01,'#7fb4be',12);
    m.box(-.66,1.424,z+.111,.062,.017,.006,p>=2?led:amber);
    for(let i=0;i<4;i++)m.box(-.65+i*.036,1.471,z-.028,.012,.003,.084,'#33463d');
    for(const dx of [-.092,.092])m.cyl(-.62+dx,1.471,z+.067,.011,.003,brass,6);
    for(const d of [-1,1])m.box(-.62+d*.079,1.377,z,.029,.018,.107,'#e8d6a5');
    for(let i=0;i<3;i++) {
      const sx=-2.29+.31*i;
      m.profile(sx,1.212,.11,[[0,.043],[.042,.064],[.085,.063],[.107,.047]],'#885e3b',10);
    }
    if(state.hardware){
      for(const [dx,dz] of [[-.255,-.12],[.255,-.12],[.255,.12],[-.255,.12]])
        m.line([[-.62,1.35,z],[x+dx,ticketY+.012,z+dz]],p>=2?'#80bfa9':'#a9ac82',.014,{opacity:.75});
      signal(m,[[-.22,1.39,z],[-.22,.65,z],[-.22,.09,z],[-.22,.09,-2.96],[-.22,1.28,-3.04]],clamp(p-1),led);
    }
    cartography(m,p);
  }

  Object.assign(window.RingDetails ||= {}, {
    bells:{
      focus:[-.78,1.50,-.48],radius:1.5,
      parts:[
        {name:'Площадка слушателя',position:[-2.36,.052,.39],radius:1.12,angle:[.69,.77],description:'Для этого макета выбрана напольная площадка. Под упругим верхним слоем замыкается контакт присутствия. У каждой из трёх площадок отдельный вход.',active:'При входе слушателя светится обод его площадки.'},
        {name:'Три канала управления',position:[2.48,1.29,-.30],radius:.55,angle:[.20,.13],description:'Кабели от площадок сходятся в доступном блоке на стойке. Контроллер различает три входа, включает соответствующий голос и собирает общий финал, когда активны все три.',active:'Независимые огни в блоке повторяют состояние трёх мест.'},
        {name:'Подвес и локальный звук',position:[-2.12,2.65,-.68],radius:1.14,angle:[.36,.04],description:'Бронзовая форма и подвес показывают, чей голос слышен. Компактный громкоговоритель под балкой воспроизводит запись для этой площадки. Размер слышимой зоны предстоит подобрать в зале.',active:'К каждому занятому месту добавляется голос. При трёх голосах свет меняется на панораме.'}
      ],draw:makeBells
    },
    craft:{
      focus:[-1.04,1.48,.12],radius:1.35,
      parts:[
        {name:'Кисть с контрастной меткой',position:[-.95,1.26,.56],locate(p){const pose=brushPose(p);return mix(pose.tip,pose.end,.58);},radius:.77,angle:[1.59,.44],description:'На ручке мягкой кисти видны контрастные кольца. По положению метки относительно известной плоскости блюда система оценивает место мазка. Привязку к кончику проверяют на образце.',active:'Посетитель ведёт кисть. Выбранный цвет появляется в рисунке на блюде.'},
        {name:'Камера и проектор блюда',position:[-1.10,2.10,.10],radius:.96,angle:[.54,.15],description:'Камера на поперечине смотрит на рабочее поле блюда. Соседняя оптика возвращает цифровой мазок на поверхность. Для пробы нужно настроить совпадение изображения с движением кончика кисти.',active:'Оптическое поле охватывает блюдо, а очередной цветок пополняет общий рисунок.'},
        {name:'Увеличенный орнамент',position:[-.35,2.14,-3.085],radius:3.55,angle:[.04,.07],description:'Настенная медиаповерхность показывает ту же композицию, что и блюдо. Сохраняются порядок цветов и их расположение, чтобы автор мог узнать свою работу из зала.',active:'По завершении три розетки и листья занимают панно мастерской.'}
      ],draw:makeCraft
    },
    passport:{
      focus:[-.83,1.18,.17],radius:1.2,
      parts:[
        {name:'Штампы и бумажный билет',position:[-.78,1.10,.26],radius:.47,angle:[.33,.91],description:'В показанном оптическом варианте выбор хранится в отпечатках на бумаге. Поля с отметками и уголки совмещения помогают положить билет лицевой стороной к камере.',active:'В отмеченных полях билета становятся видны три печатных знака.'},
        {name:'Оптический считыватель',position:[-.62,1.398,.32],radius:.44,angle:[.43,.27],description:'Камера в коротком козырьке смотрит на билет сверху. Равномерная подсветка помогает выделить отпечатки. После чтения программа связывает распознанные темы с остановками маршрута.',active:'Индикатор меняет цвет, когда отметки прочитаны.'},
        {name:'Панорама маршрута',position:[.79,1.77,-3.02],radius:4.15,angle:[.06,.06],description:'Готовая последовательность остановок передаётся на панорамный экран. На показанном фрагменте линия проходит по карте и связывает пункты одного маршрута.',active:'По карте прокладывается линия, а силуэты открытых остановок темнеют.'}
      ],draw:makePassport
    }
  });
})();
