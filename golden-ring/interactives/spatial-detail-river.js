// Additional geometry for the working exhibits. The screen drawings and the
// proposed physical controls share a coordinate system, not a mechanical drive.
(() => {
  'use strict';
  const tau=Math.PI*2;
  const pin='#dbb878', dark='#38494a', iron='#505c59', rope='#c9a575';
  const timber='#99714b', woodEdge='#cfa570', wire='#386e69', signal='#f1ba63';
  const clamp=n=>Math.max(0,Math.min(1,n));
  const between=(a,b,f)=>a.map((v,i)=>v+(b[i]-v)*f);

  function circleXY(m,x,y,z,r,colour,weight=.017) {
    const line=[];
    for(let j=0;j<=28;j++)line.push([x+r*Math.cos(tau*j/28),y+r*Math.sin(tau*j/28),z]);
    m.line(line,colour,weight);
  }
  function hose(m,points,colour,width) {
    m.line(points,colour,width);
    for(const p of [points[0],points.at(-1)])m.orb(...p,width*.62,width*.62,width*.62,colour);
  }
  function led(m,x,y,z,on) {
    m.cyl(x,y,z,.033,.013,on?signal:'#708074',10);
  }
  function screw(m,x,y,z) {
    m.cyl(x,y,z,.021,.012,pin,6);
  }

  function bargeGeometry(m,p,t,state) {
    const x=-1.55+p*.54, z=-1.10, drumX=-.80, drumZ=.87;
    const tension=clamp(p)*(.75+.25*Math.sin(Math.PI*p)**2);
    // Weathered planking, iron rubbing strakes, open deck and two glazed ports.
    for(let i=0;i<9;i++){
      const dx=-.77+i*.183, width=.36*(1-Math.max(0,(Math.abs(dx)-.48)*1.9));
      m.line([[x+dx,.588,z-width],[x+dx,.588,z+width]],'#775b40',.013);
    }
    for(const side of [-1,1]){
      for(const height of [.34,.47])m.line([[x-.86,height,z+side*.075],[x-.56,height,z+side*.29],[x+.48,height,z+side*.32],[x+.94,height,z+side*.045]],'#634c37',.026);
      for(const dx of [-.48,-.25])m.box(x+dx,.71,z+side*.247,.122,.12,.014,'#466367');
      m.line([[x-.64,.955,z+side*.25],[x-.03,.955,z+side*.25]],'#577377',.025);
    }
    m.box(x+.30,.59,z,.50,.084,.39,'#714d35');
    for(let n=0;n<4;n++)m.box(x+.11+n*.115,.676,z,.084,.014,.35,'#a88355');
    m.line([[x-.82,.60,z],[x+.24,1.47,z],[x+.89,.60,z]],'#76563c',.017);
    for(let i=0;i<=10;i++)m.line([[1.675,.247,-2.21+i*.26],[2.20,.247,-2.21+i*.26]],'#795d45',.025);
    for(const zz of [-1.96,.14]){
      m.cyl(1.95,.61,zz,.106,.085,dark,10);m.cyl(1.95,.805,zz,.109,.055,iron,10);
      m.box(1.95,.856,zz,.117,.12,.117,p>=2.8?'#ffcf77':'#ded2ac');
      m.profile(1.95,.973,zz,[[0,.115],[.075,.038]],dark,8);
    }

    // A real-looking rope lies in helical wraps on the capstan. The short
    // controlled pull is read at the measuring sheave beside the drum.
    m.cyl(drumX,.04,drumZ,.368,.10,dark,18);
    m.profile(drumX,.64,drumZ,[[0,.34],[.04,.35],[.13,.307],[.17,.35]],'#987344',22);
    for(let i=0;i<3;i++){
      const chain=[];
      for(let j=0;j<=28;j++){
        const a=j*tau/28+.3;
        chain.push([drumX+.345*Math.cos(a),.668+i*.040+j*.04/28,drumZ+.345*Math.sin(a)]);
      }
      m.line(chain,rope,.034);
    }
    m.cyl(drumX,.851,drumZ,.215,.04,'#68736d',16);
    for(let j=0;j<4;j++){
      const a=j*tau/4+.48;
      screw(m,drumX+.142*Math.cos(a),.893,drumZ+.142*Math.sin(a));
    }
    const handle=[-1.075,.915+tension*.075,1.46+tension*.13];
    const elbow=[-.95,.81+tension*.07,1.30];
    const sheave=[-.43,.72+tension*.023,.70];
    m.line([handle,elbow,[-.76,.779,1.20]],rope,.065);
    m.line([[drumX+.20,.731,drumZ-.25],sheave,[-.27,.706,.44]],rope,.052);
    const band=[[-.20,.05,0],[-.14,.17,.05],[.12,.18,.06],[.22,.08,.02],[.12,.00,-.02],[-.12,-.025,-.02]];
    const outer=band.map(v=>v.map((n,i)=>n+handle[i]));
    const inner=band.map(([dx,dy,dz])=>[handle[0]+dx*.66,handle[1]+.055+(dy-.055)*.53,handle[2]+dz]);
    for(let i=0;i<band.length;i++)m.face([outer[i],outer[(i+1)%6],inner[(i+1)%6],inner[i]],'#b89059');
    m.line([...inner,inner[0]],'#775534',.018);
    // The axis is supported at its base by the strain beam. In the service
    // view the side guard is removed so the pin, pads and cable are visible.
    m.box(-.39,.07,.69,.72,.088,.48,dark);
    m.box(-.24,.16,.69,.16,.31,.22,'#77827c');
    m.box(-.41,.43,.69,.38,.11,.17,'#93a39a');
    m.box(-.44,.535,.70,.15,.13,.15,iron);
    m.cyl(-.43,.652,.70,.044,.19,'#6d766b',10);
    m.cyl(...sheave,.139,.050,'#555e55',16);
    m.cyl(sheave[0],sheave[1]+.051,sheave[2],.114,.052,pin,16);
    m.cyl(sheave[0],sheave[1]+.103,sheave[2],.135,.025,'#64746d',16);
    if(state.hardware){
      m.box(-.38,.543,.784,.12,.015,.022,'#d3ad6e');
      hose(m,[[-.38,.548,.798],[-.17,.52,.81],[-.08,.28,.76],[.16,.19,.76]],wire,.027);
      m.box(.19,.10,.77,.22,.13,.19,'#688a79');
      m.box(.16,.234,.775,.055,.018,.049,'#42554b');led(m,.23,.236,.78,p>0);
    }else m.box(-.40,.14,.908,.58,.43,.03,'#6f7c73');
    m.line([[-.07,.086,.77],[.43,.086,.77],[.43,.086,.49]],'#4d615a',.031);

    // On the wall the vessel travels along the same shore as the tabletop
    // maquette. The wake length is proportional to the completed pull.
    const sx=-2.84+p*1.30, sy=1.76, screen=-3.16;
    m.face([[sx-.32,sy,screen],[sx+.35,sy,screen],[sx+.26,sy-.095,screen],[sx-.22,sy-.10,screen]],'#3f3c31',{unlit:true});
    m.face([[sx-.21,sy,screen+.004],[sx-.21,sy+.14,screen+.004],[sx+.02,sy+.14,screen+.004],[sx+.035,sy,screen+.004]],'#846b48',{unlit:true});
    m.line([[sx+.12,sy-.01,screen+.009],[sx+.12,sy+.29,screen+.009]],'#524635',.020);
    if(p>.05)for(let i=0;i<2;i++)m.line([[sx-.21,sy-.10-i*.035,screen+.01],[sx-.31-p*.16,sy-.082-i*.07,screen+.01],[sx-.46-p*.20,sy-.095-i*.10,screen+.01]],'#d6d9bb',.022);
  }

  function glassGeometry(m,p,t,state) {
    const pressure=clamp(Math.sin(Math.min(1,p/3)*Math.PI));
    // A decorative cold hearth; the warm inner face is a luminous image.
    const cx=-2.55, cy=.84, front=-.79;
    for(let j=0;j<9;j++){
      const a=j*Math.PI/9+.015,b=(j+1)*Math.PI/9-.015;
      const q=(angle,r,zz)=>[cx+Math.cos(angle)*r,cy+Math.sin(angle)*r*.83,zz];
      m.face([q(a,.38,front),q(a,.52,front),q(b,.52,front),q(b,.38,front)],['#b78157','#a16b49','#c38d62'][j%3]);
    }
    for(const side of [-1,1])for(let j=0;j<3;j++)m.box(cx+side*.449,.43+j*.13,front-.01,.125,.114,.069,j%2?'#a9704a':'#b88158');
    m.box(cx,.404,-.77,1.07,.09,.30,'#886341');
    for(let i=0;i<3;i++)m.box(cx-.56+i*.54,.13,-.85,.43,.086,.045,'#947052');
    m.box(cx,1.47,-1.82,.51,.077,.54,'#4e5551');m.box(cx,2.33,-1.82,.50,.075,.52,'#52625d');

    // Physical hand bellows, a pneumatic tapping tee and a removable low-voltage
    // differential-pressure insert. The opposite port is open to room air.
    const bx=-1.33,bz=.32,top=1.32-pressure*.085;
    m.profile(bx,1.084,bz,[[0,.225],[.04,.238]],'#b79568',18,.66);
    for(let i=0;i<4;i++){
      const y=1.12+(top-1.12)*i/4,h=(top-1.12)/4;
      m.profile(bx,y,bz,[[0,.164],[h*.49,.217],[h,.164]],i%2?'#805342':'#93634c',14,.62);
    }
    m.profile(bx,top,bz,[[0,.225],[.042,.22]],'#bc9666',18,.67);
    m.box(bx-.16,top+.042,bz,.25,.054,.084,woodEdge);
    m.cyl(bx+.17,top+.042,bz,.025,.028,pin,8);
    const port=[-1.11,1.145,.34],tee=[-.64,1.149,.41];
    hose(m,[port,[-.99,1.10,.49],[-.80,1.097,.51],tee],dark,.048);
    m.rod([-.72,1.149,.41],[-.52,1.149,.41],.041,pin,10);
    m.rod(tee,[-.64,1.19,.47],.030,pin,8);
    m.rod([-.64,1.19,.47],[-.40,1.21,.46],.025,wire,7);
    m.box(-.25,1.084,.43,.32,.068,.255,'#676f65');
    m.box(-.25,1.153,.43,.22,.055,.17,'#628976');
    if(state.hardware){
      m.cyl(-.27,1.21,.45,.062,.02,pin,12);
      m.face([[-.26,1.233,.40],[-.22,1.233,.45],[-.26,1.233,.505],[-.30,1.233,.45]],pressure>.2?'#e4af5d':'#a8c6b1',{unlit:true});
      for(let i=0;i<3;i++)m.box(-.165,1.199,.39+.033*i,.050,.011,.013,pin);
    }else{
      m.box(-.25,1.20,.43,.278,.045,.201,'#769184');
      led(m,-.185,1.246,.47,p>.2);
    }
    m.line([[-.12,1.177,.42],[.06,1.13,.42],[.14,1.115,.19],[.21,.97,.00],[.21,.14,-.05]],wire,.028);
    for(const f of [.03,.09,.23,.77,.92]){
      const a=between([-1.55,1.47,.53],[.18,1.38,-.06],f),b=between([-1.55,1.47,.53],[.18,1.38,-.06],f+.033);
      m.rod(a,b,.058,f<.25?'#a78152':'#a2a598',10);
    }
    // A dial makes varying pressure distinguishable from final completion.
    const gx=-.67,gy=1.31,gz=.058;
    m.rod([gx,1.08,gz],[gx,gy,gz],.028,dark);
    m.rod([gx,gy,gz-.025],[gx,gy,gz+.032],.135,dark,20);
    m.face(Array.from({length:20},(_,i)=>[gx+.112*Math.cos(tau*i/20),gy+.112*Math.sin(tau*i/20),gz+.037]),'#e8dcb8',{unlit:true});
    for(let i=0;i<5;i++){
      const a=2.78-i*.59;
      m.line([[gx+.080*Math.cos(a),gy+.080*Math.sin(a),gz+.041],[gx+.101*Math.cos(a),gy+.101*Math.sin(a),gz+.041]],dark,.010);
    }
    const needle=2.68-pressure*1.97;
    m.line([[gx,gy,gz+.044],[gx+.081*Math.cos(needle),gy+.081*Math.sin(needle),gz+.044]],'#a34e37',.016);
    if(p>2.45){
      const r=.13+p*.073;
      for(let j=0;j<10;j++){
        const a=j*tau/10,b=(j+1)*tau/10;
        m.line([[.27+Math.cos(a)*r*.7,1.31,-.076+Math.sin(a)*r*.7],[.27+Math.cos((a+b)/2)*r,1.42,-.076+Math.sin((a+b)/2)*r],[.27+Math.cos(b)*r*.52,1.56,-.076+Math.sin(b)*r*.52]],'#d9e7d9',.014);
      }
    }
  }

  function archRim(m,x,z,rx,shoulder,rise,width) {
    const ring=(a,r,yoff)=>[x+r*Math.cos(a),shoulder+(rise+yoff)*Math.sin(a),z];
    for(let j=0;j<12;j++){
      const a=j*Math.PI/12,b=(j+1)*Math.PI/12;
      m.face([ring(a,rx,0),ring(a,rx+width,width),ring(b,rx+width,width),ring(b,rx,0)],j%3===1?'#bea377':'#cbb38d');
    }
    for(const side of [-1,1])m.box(x+side*(rx+width/2),.26,z-.036,width,shoulder-.26,.084,'#b9a181');
  }

  function regionalGeometry(m,p,t,state) {
    for(let i=0;i<3;i++){
      const x=-2.83+2.55*i,windowZ=-2.966,opened=clamp(p-i),rx=1.03,shoulder=1.95;
      archRim(m,x,-2.939,rx,shoulder,rx,.10);
      m.box(x,.105,-2.98,2.34,.119,.35,'#ab8862');
      m.box(x,.208,-2.939,2.30,.047,.40,'#ceb08b');
      for(const side of [-1,1])m.box(x+side*.78,.055,-2.981,.13,.062,.27,'#6c6558');
      // Under each strip lies the same photograph as the final arch. A hand
      // swipe takes off its digital condensation from left to right.
      if(opened<.999){
        const topAt=v=>shoulder+Math.sqrt(Math.max(0,rx*rx-v*v));
        const count=20;
        for(let j=0;j<count;j++){
          const a=-rx+j*(2*rx/count),b=-rx+(j+1)*(2*rx/count),c=(a+b)/2;
          const pts=[[x+a,.21,windowZ],[x+b,.21,windowZ],[x+b,topAt(b),windowZ],[x+c,topAt(c),windowZ],[x+a,topAt(a),windowZ]];
          m.media(pts,'spatial-regional-'+i,x-rx,.21,2*rx,2.77);
          const blend=clamp((j+.7)/count-opened+.16)*5.1;
          const alpha=Math.min(.92,blend*.96);
          if(alpha>.012)m.face(pts.map(([u,v,z])=>[u,v,z+.006]),'#bfd4cf',{unlit:true,opacity:alpha});
        }
        for(let j=0;j<12;j++){
          const u=-.86+((j*7)%13)*.14,v=.45+((j*11)%19)*.091;
          if((u+rx)/(2*rx)<opened+.10)continue;
          m.line([[x+u,v+.044,windowZ+.014],[x+u+.009,v,windowZ+.014],[x+u+.007,v-.066,windowZ+.014]],'#e2ede4',.014,{opacity:.72});
        }
      }
      // Each arch has its own small camera and an independent signal cable.
      const sy=2.99,sz=-2.75;
      m.rod([x,3.19,-3.16],[x,3.13,sz],.028,iron,6);
      m.box(x,sy,sz,.30,.12,.14,'#535c54');
      m.box(x,sy+.009,sz+.078,.25,.091,.014,'#2f4542');
      for(const dx of [-.07,.065]){
        m.rod([x+dx,sy+.060,sz+.083],[x+dx,sy+.058,sz+.100],.032,'#729496',10);
        m.rod([x+dx,sy+.059,sz+.099],[x+dx,sy+.058,sz+.104],.016,'#293a39',8);
      }
      m.rod([x+.106,sy+.072,sz+.081],[x+.106,sy+.072,sz+.092],.012,opened>0?'#f2bb68':'#779e87',8);
      if(state.hardware){
        const isActive=i===Math.min(2,Math.floor(p));
        const nearZ=-2.59,farZ=-2.29;
        m.face([[x,sy,sz],[x-.85,.53,nearZ],[x+.85,.53,nearZ]],'#a9d8be',{opacity:isActive?.18:.065,unlit:true});
        m.line([[x-.85,.53,nearZ],[x,sy,sz],[x+.85,.53,nearZ]],'#69a899',.024,{opacity:.78});
        m.line([[x-.85,.53,nearZ],[x-.85,.53,farZ],[x+.85,.53,farZ],[x+.85,.53,nearZ]],'#6aa594',.021,{opacity:.72});
        m.line([[x,3.14,sz],[x,3.21,-3.14],[x+1.12,3.21,-3.14],[x+1.12,.33,-3.14]],wire,.028);
      }
    }
  }

  Object.assign(window.RingDetails ||= {}, {
    barge:{
      focus:[-.67,.66,.92],radius:1.14,
      parts:[
        {name:'Петля и канат',position:[-1.06,1.01,1.47],radius:.70,angle:[.64,.55],description:'Посетитель берёт широкую петлю. В предлагаемом узле свободный участок каната имеет короткий ход и натягивается уже при первом движении.',active:'Петля приподнимается, свободный участок выпрямляется.'},
        {name:'Измерительный ролик',position:[-.42,.64,.69],radius:.67,angle:[.76,.42],description:'Канат огибает ролик. Возрастающая боковая нагрузка на его ось передаётся упругой балке с тензодатчиком. В разрезе видны балка, провод и вход контроллера.',active:'Контроллер получает сигнал тяги; у входа загорается индикатор.'},
        {name:'Баржа на панораме',position:[-.80,1.81,-3.16],radius:2.74,angle:[.01,.08],description:'Контроллер переводит последовательность рывков в ход виртуального судна. Корпус на панораме движется вдоль берега, за кормой растёт след, в финале у причала зажигаются фонари.',active:'Баржа смещается по реке; согласованные рывки доводят её к причалу.'}
      ],draw:bargeGeometry
    },
    glass:{
      focus:[-.86,1.24,.30],radius:1.05,
      parts:[
        {name:'Ручной мех',position:[-1.32,1.29,.32],radius:.67,angle:[.47,.55],description:'В этом варианте гость сжимает складчатый мех. Коротким шлангом воздух поступает в измерительную линию. Трубка на верстаке показывает движение мастера.',active:'Верхняя доска опускается; складки меха сходятся.'},
        {name:'Отбор давления',position:[-.36,1.21,.44],radius:.55,angle:[.36,.66],description:'Отвод тройника соединяет шланг с датчиком перепада давления. Второй вход датчика сообщается с воздухом зала. После настройки схемы контроллер различает слабый и более сильный нажим.',active:'На шкале отклоняется стрелка; в разрезе виден измерительный модуль.'},
        {name:'Проекция сосуда',position:[1.16,2.05,-3.15],radius:1.39,angle:[.05,.08],description:'По сигналу контроллера меняется форма горячей заготовки на экране. Финальный свет выявляет грани уже отделанного сосуда. Нагрев передан изображением.',active:'Заготовка растёт, затем на экране появляется готовая ваза.'}
      ],draw:glassGeometry
    },
    regional:{
      focus:[-.28,1.88,-2.92],radius:1.62,
      parts:[
        {name:'Жест перед стеклом',position:[-2.82,1.35,-2.48],radius:1.49,angle:[.26,.15],description:'Посетитель проводит рукой перед выбранной аркой. В этом варианте рука входит в узкую рабочую зону перед стеклом. Границы зоны можно рассмотреть в техническом режиме.',active:'След от жеста проходит по запотевшему окну.'},
        {name:'Датчик над аркой',position:[-.28,3.045,-2.68],radius:.60,angle:[.34,.14],description:'Для пробы предложен отдельный оптический датчик глубины над каждым окном. Контроллер сопоставляет положение руки с местом на экране. Дальность и границы настраивают на одной арке.',active:'Выбранная арка получает координату жеста; соседнее окно сохраняет свой вид.'},
        {name:'Экран за стеклом',position:[2.27,1.83,-2.95],radius:1.52,angle:[.18,.12],description:'По координатам жеста меняется прозрачность цифрового слоя конденсата. Пейзаж открывается на экране за защитным стеклом. Три арки можно раскрыть последовательно.',active:'В очищенной полосе становится виден берег Волги.'}
      ],draw:regionalGeometry
    }
  });
})();
