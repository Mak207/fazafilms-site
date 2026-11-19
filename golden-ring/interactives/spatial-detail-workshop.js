(() => {
  'use strict';
  const oak = '#a66e42', walnut = '#694935', brass = '#d7ae68', iron = '#384b4c';
  const cream = '#f5dfac', enamel = '#365e62', gold = '#ffc765';
  const front = 0.04;

  // Coordinates follow the exhibit geometry: y is up, positive z faces the public.
  function ring(m, x, y, z, radius, axis, colour, width, count=24) {
    const points=[];
    for(let i=0;i<=count;i++){
      const a=i*2*Math.PI/count, u=radius*Math.cos(a), v=radius*Math.sin(a);
      if(axis==='x') points.push([x,y+u,z+v]);
      else if(axis==='y') points.push([x+u,y,z+v]);
      else points.push([x+u,y+v,z]);
    }
    m.line(points,colour,width);
  }
  function diamond(m,x,y,z,w,h,colour) {
    m.face([[x-w,y,z],[x,y+h,z],[x+w,y,z],[x,y-h,z]],colour,{unlit:true});
  }
  function strip(m,path,width,y,colour) {
    for(let i=1;i<path.length;i++){
      const a=path[i-1], b=path[i], dx=b[0]-a[0], dz=b[1]-a[1];
      const s=width/Math.hypot(dx,dz)/2, nx=-dz*s, nz=dx*s;
      m.face([[a[0]+nx,y,a[1]+nz],[b[0]+nx,y,b[1]+nz],[b[0]-nx,y,b[1]-nz],[a[0]-nx,y,a[1]-nz]],colour,{unlit:true});
    }
  }
  function shuttle(m,x,y,z) {
    // Two wooden cheeks leave a real opening for the wound bobbin and its spindle.
    const hull=[[-.31,0],[-.17,-.093],[.16,-.093],[.30,0],[.16,.093],[-.17,.093]];
    m.face(hull.map(([u,v])=>[x+u,y,z+v]),walnut);
    hull.forEach(([u,v],i)=>{
      const [a,b]=hull[(i+1)%hull.length];
      m.face([[x+u,y,z+v],[x+a,y,z+b],[x+a,y+.058,z+b],[x+u,y+.058,z+v]],oak);
    });
    for(const side of [-1,1]){
      m.face([[x-.31,y+.060,z],[x-.17,y+.073,z+side*.094],[x+.16,y+.073,z+side*.094],[x+.30,y+.060,z],[x+.12,y+.061,z+side*.037],[x-.12,y+.061,z+side*.037]],brass);
    }
    m.rod([x-.17,y+.056,z],[x+.17,y+.056,z],.017,iron,6);
    m.rod([x-.08,y+.059,z],[x+.08,y+.059,z],.047,'#be644f',10);
    for(const off of [-.052,0,.052])ring(m,x+off,y+.059,z,.048,'x','#f4b59f',.009,10);
  }
  function shuttleTravel(p) {
    const transfer=Math.min(2,Math.floor(p)),fraction=p-transfer;
    return transfer%2===0?fraction:1-fraction;
  }
  function fabricSample(m,x,variant) {
    const z=-3.22, width=.88, top=2.74, bottom=1.12;
    const grounds=['#91805b','#596d66','#a57456'];
    const inks=['#cabb8c','#b0ba9c','#d0b18a'];
    m.rod([x-width*.62,top+.07,z-.04],[x+width*.62,top+.07,z-.04],.035,brass,8);
    for(const sign of [-1,1]){
      m.rod([x+sign*width*.42,top+.06,z-.11],[x+sign*width*.42,top+.06,z],.029,iron,6);
    }
    const pleats=6;
    for(let j=0;j<pleats;j++){
      const l=x-width/2+j*width/pleats,r=l+width/pleats;
      const a=z+.013*(j%2),b=z+.013*((j+1)%2);
      m.face([[l,bottom,a],[r,bottom,b],[r,top,b],[l,top,a]],grounds[variant]);
    }
    for(let i=0;i<15;i++){
      const a=x-width*.46+i*width*.92/14;
      m.line([[a,bottom+.03,z+.025],[a,bottom-.10+(i%3)*.017,z+.04]],inks[variant],.012);
    }
    for(const y of [bottom+.13,bottom+.23,top-.18])m.line([[x-width*.48,y,z+.035],[x+width*.48,y,z+.035]],inks[variant],.027);
    for(let j=0;j<3;j++){
      const y=bottom+.42+j*.37;
      if(variant===0){
        for(let i=0;i<3;i++)diamond(m,x-.25+i*.25,y,z+.038,.10,.103,inks[variant]);
      }else if(variant===1){
        m.line([[-.40,0],[-.21,.12],[0,0],[.21,.12],[.40,0]].map(([u,v])=>[x+u,y+v,z+.038]),inks[variant],.039);
      }else{
        diamond(m,x,y,z+.035,.30,.11,inks[variant]);diamond(m,x,y,z+.038,.13,.060,grounds[variant]);
      }
    }
  }
  function drawLoom(m,p,t,state) {
    const z=-.33, travel=shuttleTravel(p);
    const shuttleX=-2.45+2.89*travel;
    if(!state.detailView)for(let i=0;i<3;i++)fabricSample(m,-.88+1.36*i,i);
    for(const x of [-2.86,.93]){
      m.box(x,.015,z+.04,.45,.15,1.34,walnut);
      m.rod([x,.16,z+.58],[x,.85,z+.12],.057,oak,7);
      m.rod([x,.16,z-.50],[x,.85,z-.1],.057,oak,7);
      for(const y of [.38,2.49]){
        m.box(x,y,z,.235,.095,.292,'#705041');
        m.rod([x,y+.043,z+.141],[x,y+.043,z+.172],.043,brass,8);
      }
      m.box(x,2.73,z,.275,.065,.33,brass);
    }
    // The upper beam carries the warp; the lower rail belongs to the working shuttle.
    m.rod([-2.69,2.64,z],[.75,2.64,z],.095,'#d4bc8a',14);
    for(let i=0;i<29;i++)ring(m,-2.63+i*.116,2.64,z,.098,'x',i%5===0?brass:'#ac8c5d',.014,12);
    for(const x of [-2.77,.83]){
      m.rod([x-.055,2.64,z],[x+.055,2.64,z],.162,brass,12);
    }
    for(const zz of [front-.106,front+.103]){
      m.rod([-2.75,1.07,zz],[.82,1.07,zz],.029,brass,8);
    }
    m.shuttlePosition=[shuttleX,1.10,front];
    const start=m.faces.length;
    shuttle(m,shuttleX,1.10,front);
    for(let i=start;i<m.faces.length;i++)m.faces[i].fallbackAsset='loom';
    // Raised floats and double selvedges distinguish woven material from a painted board.
    const height=.20+.59*p;
    const shades=['#284f55','#b45646','#e4c695','#7d976d'];
    for(let band=0;band<Math.floor(height/.235);band++){
      const y=.55+.235*band;
      for(let motif=0;motif<8;motif++){
        const x=-2.47+motif*.412;
        diamond(m,x,y,z+.087,.143,.082,shades[(band+1)%4]);
        diamond(m,x,y,z+.090,.055,.033,band%2===0?cream:'#a64e3f');
      }
    }
    for(const x of [-2.65,.61])m.line([[x,.43,z+.089],[x,.41+height,z+.089]],cream,.041);
    // End receivers and their small indicator lamps make handoff legs visible from the front.
    for(const [i,x] of [-2.79,.78].entries()){
      const atEnd=i===0?travel<.04:travel>.96;
      const cutaway=state.hardware || state.detailView,dir=i===0?1:-1;
      if(cutaway){
        m.box(x,.94,.06,.275,.045,.35,enamel);
        m.box(x-dir*.117,.98,.06,.037,.19,.35,enamel);
        m.box(x,1.01,.16,.15,.094,.12,'#41494c');
        m.cyl(x,1.104,.17,.028,.019,brass,9);
        m.rod([x,1.122,.16],[x+dir*.061,1.145,.055],.014,cream,7);
        m.rod([x+dir*.061,1.145,.029],[x+dir*.061,1.145,.082],.030,atEnd?gold:'#66757a',10);
        for(const dx of [-.048,.048]){
          m.rod([x+dx,1.041,.216],[x+dx,1.041,.259],.017,brass,7);
          m.line([[x+dx,1.04,.261],[x+dx,1.00,.29],[x+dx,.99,.21]],atEnd?'#c87642':'#c9a479',.011);
        }
        m.line([[x,1.00,.22],[x,.25,.22],[x,.20,-.15],[-1,.20,-.15]],atEnd?'#f4bd61':'#789089',.022);
      }else{
        m.box(x,.94,.06,.26,.22,.34,enamel);
        m.box(x,.98,.25,.20,.082,.034,brass);
      }
      m.box(x-dir*.102,1.157,.082,.049,.022,.13,atEnd?gold:'#8b988b');
    }
  }

  const mapPoints=[[-2.10,.20],[-.64,-.55],[.90,.28]];
  const river=[];
  for(let i=0;i<=32;i++){
    const x=-2.89+.130*i;
    river.push([x,-.04+.30*Math.sin(i*.26+.25)+.10*Math.sin(i*.55)]);
  }
  function contour(m,x,z,rx,rz,y,colour) {
    const points=[];
    for(let i=0;i<=18;i++){
      const a=2*Math.PI*i/18,r=1+.10*Math.sin(3*a)+.07*Math.cos(5*a+.5);
      points.push([x+rx*r*Math.cos(a),y,z+rz*r*Math.sin(a)]);
    }
    m.line(points,colour,.017);
  }
  function tactile(m,x,z,i,active) {
    const y=1.338, c=active?gold:cream;
    m.profile(x,1.045,z,[[0,.217],[.045,.203],[.19,.183],[.244,.164]],'#8d744e',16);
    ring(m,x,1.282,z,.171,'y',c,.024,18);
    m.cyl(x,1.288,z,.157,.049,active?'#996f38':'#345257',17);
    if(i===0){
      for(const dz of [-.042,.033]){
        m.line([[-.09,0],[-.048,.019],[0,-.013],[.047,.020],[.09,0]].map(([u,v])=>[x+u,y+.004,z+dz+v]),c,.017);
      }
    }else if(i===1){
      for(const n of [-1,0,1])m.rod([x+n*.041,y,z-.067],[x+n*.041,y,z+.073],.010,c,5);
    }else{
      m.line([[x-.086,y,z+.067],[x-.06,y,z-.052],[x+.065,y,z-.052],[x+.092,y,z+.067]],c,.023);
      m.line([[x-.076,y,z+.016],[x+.077,y,z+.016]],c,.018);
    }
  }
  function drawSoundmap(m,p,t,state) {
    const selected=state.points||[];
    const channel=Number.isInteger(state.lastNote)?state.lastNote:selected.at(-1);
    const tableX=-.78;
    if(!state.detailView){
      // A printed interpretive relief puts the tabletop landmarks in a Volga landscape.
      const boardX=-.34,boardY=1.16,boardZ=-3.24,w=6.34,h=1.71;
      m.box(boardX,boardY-.04,boardZ-.035,w+.12,h+.10,.085,walnut);
      m.picturePlane(boardX,boardY,boardZ+.023,w,h,'barge-river');
      m.box(boardX,boardY-.04,boardZ+.03,w+.12,.048,.064,brass);
      // The inset is a diagrammatic river profile, with the three stations engraved in it.
      const y=boardY+.18;
      m.box(boardX,y-.11,boardZ+.05,w-.22,.21,.03,'#345457');
      const bank=river.map(([xx,zz])=>[boardX-2.89+(xx+2.89)*1.37,y+zz*.20,boardZ+.077]);
      m.line(bank,'#c0c8a2',.030);
      for(const index of [4,16,29]){
        const [xx,yy,zz]=bank[index];
        diamond(m,xx,yy,zz+.006,.065,.061,brass);
      }
    }
    // Stepped wooden fascia and a routed metal edge continue around the raised relief.
    m.box(tableX,.77,-.13,4.75,.085,2.47,walnut);
    m.box(tableX,.844,1.046,4.72,.083,.06,brass);
    for(const x of [-3.04,1.47])m.box(x,.87,-.13,.055,.164,2.37,walnut);
    for(const z of [-1.294,1.022])m.box(tableX,.97,z,4.5,.073,.055,brass);
    strip(m,river,.28,1.049,'#c0d8b2');
    strip(m,river,.20,1.055,'#518b97');
    m.line(river.map(([x,z])=>[x,1.062,z]),'#a7d7d1',.021);
    for(const site of [[-2.23,-.87,.46,.18],[-.18,.54,.42,.18],[.70,-.68,.27,.17]]){
      const [x,z,rx,rz]=site;
      contour(m,x,z,rx,rz,1.050,'#bfca97');contour(m,x,z,rx*.70,rz*.64,1.058,'#bdc99a');
    }
    mapPoints.forEach(([x,z],i)=>tactile(m,x,z,i,selected.includes(i)));
    // Three downward-facing drivers share a cable tray, with independent branches.
    m.box(-.61,3.03,-.51,3.70,.105,.112,iron);
    for(let i=0;i<3;i++){
      const x=-2.1+1.49*i,active=i===channel;
      m.profile(x,2.52,-.51,[[0,.292],[.06,.276],[.13,.20],[.20,.108]],enamel,18);
      ring(m,x,2.527,-.51,.285,'y',brass,.029,20);
      m.cyl(x,2.506,-.51,.22,.02,'#263f44',16);
      for(const r of [.105,.157,.200])ring(m,x,2.503,-.51,r,'y','#8b9990',.011,16);
      m.orb(x+.245,2.565,-.46,.021,.021,.021,active?gold:'#b1b995');
    }
    if(state.hardware || state.detailView){
      // A service cassette at the edge presents the actual input, logic and audio outputs.
      const x=.59,z=1.105;
      m.box(x,.46,z,1.45,.36,.18,'#294849');
      m.box(x,.475,z+.10,1.38,.31,.023,'#4b7269');
      for(let i=0;i<3;i++){
        const xx=x-.49+.49*i,col=i===channel?gold:'#a9c2ac';
        m.box(xx,.53,z+.121,.31,.14,.036,'#273e44');
        m.line([[xx-.085,.603,z+.148],[xx-.04,.603,z+.148],[xx-.02,.65,z+.148],[xx+.02,.56,z+.148],[xx+.045,.615,z+.148],[xx+.09,.615,z+.148]],col,.014);
        m.rod([xx-.11,.74,z+.14],[xx+.107,.74,z+.14],.016,col,5);
        const [px,pz]=mapPoints[i];
        m.line([[px,1.04,pz],[px,1.046,.81],[px,.91,1.076],[xx,.82,1.11],[xx,.78,z+.13]],col,.023);
      }
    }
  }

  function curtain(m,side) {
    const from=side<0?-3.43:2.65,span=.73, ridge='#9d5c49',hollow='#693f42';
    for(let i=0;i<6;i++){
      const a=i/6,b=(i+1)/6,depth=i%2===0?.07:.15,next=i%2===0?.15:.07;
      const upper=u=>from-side*span*u;
      const middle=u=>from-side*(.11+.26*u);
      const lower=u=>from-side*(.17+.33*u);
      m.face([[upper(a),2.99,-2.55+depth],[upper(b),2.99,-2.55+next],[middle(b),1.43,-2.55+next],[middle(a),1.43,-2.55+depth]],i%2===0?ridge:hollow);
      m.face([[middle(a),1.43,-2.55+depth],[middle(b),1.43,-2.55+next],[lower(b),.43,-2.55+next],[lower(a),.43,-2.55+depth]],i%2===0?ridge:hollow);
    }
    m.rod([from-side*.05,1.44,-2.39],[from-side*.41,1.42,-2.38],.025,brass);
  }
  function drawShadow(m,p,t,state) {
    const x=-.83,sy=1.65,sz=-2.67,lz=.92;
    const z=sz+.28+(state.distance??p/3)*1.88;
    const magnification=(lz-sz)/(lz-z);
    curtain(m,-1);curtain(m,1);
    m.box(-.39,2.99,-2.59,6.47,.09,.15,walnut);
    m.box(-.39,3.04,-2.51,6.54,.035,.08,brass);
    if(!state.detailView){
      // A carved header holds the stretched screen; the central field stays open for shadows.
      for(let i=0;i<7;i++){
        const a=-3.40+i*.86,b=a+.86;
        m.face([[a,2.99,-2.47],[b,2.99,-2.47],[b,2.92,-2.46],[a+.65,2.88,-2.44],[a+.43,2.84,-2.43],[a+.215,2.88,-2.44],[a,2.92,-2.46]],'#784743');
        m.line([[a,2.92,-2.454],[a+.215,2.88,-2.434],[a+.43,2.84,-2.424],[a+.65,2.88,-2.434],[b,2.92,-2.454]],brass,.021);
      }
      for(const x of [-3.55,2.77]){
        m.box(x,.30,-2.64,.32,.28,.27,walnut);m.box(x,2.91,-2.63,.30,.12,.28,brass);
        m.rod([x,.58,-2.54],[x,2.91,-2.54],.039,'#bd9765',8);
      }
    }
    // Carriage rollers run along two fixed rails; a knurled collar clamps the silhouette.
    for(const dx of [-.16,.16]){
      m.rod([x+dx,.51,sz+.18],[x+dx,.51,lz-.19],.029,brass,8);
      m.rod([x+dx,.41,sz+.18],[x+dx,.41,lz-.19],.035,iron,6);
    }
    for(const end of [sz+.18,lz-.19]){
      m.box(x,.33,end,.44,.22,.10,walnut);
      for(const dx of [-.16,.16])m.rod([x+dx,.50,end-.06],[x+dx,.50,end+.06],.056,iron,8);
    }
    m.box(x,.545,z,.45,.09,.30,enamel);
    for(const zz of [z-.10,z+.10])for(const dx of [-.17,.17]){
      m.rod([x+dx-.038,.558,zz],[x+dx+.038,.558,zz],.050,brass,9);
    }
    m.cyl(x,.64,z,.083,.133,iron,12);ring(m,x,.744,z,.086,'y',brass,.021,12);
    m.rod([x-.08,.73,z],[x-.22,.73,z],.033,brass,6);
    m.box(x,1.12,z,.142,.16,.09,enamel);
    m.rod([x+.06,1.20,z],[x+.13,1.20,z],.032,brass);
    // Focusing barrel, vented body and tilting yoke. The lens faces the screen.
    m.rod([x,sy,lz+.01],[x,sy,lz+.41],.223,enamel,18);
    for(const zz of [lz+.39,lz+.28,lz+.17,lz+.07,lz-.075])
      ring(m,x,sy,zz,.227,'z',zz<lz?brass:'#627d77',.031,20);
    m.rod([x,sy,lz-.11],[x,sy,lz+.02],.203,iron,18);
    ring(m,x,sy,lz-.125,.191,'z',brass,.034,20);
    for(const dx of [-.245,.245]){
      m.rod([x+dx,1.25,lz+.16],[x+dx,sy,lz+.16],.037,iron,7);
      m.rod([x+dx-.032,sy,lz+.16],[x+dx+.032,sy,lz+.16],.065,brass,10);
    }
    m.rod([x-.245,1.25,lz+.16],[x+.245,1.25,lz+.16],.038,iron,7);
    if(state.hardware || state.detailView){
      // These pairings pass through matching boundary points of the current cutout.
      const tips=state.shape==='tower'?[[-.38,-.5],[.38,-.5],[0,.54]]:[[-.56,.40],[.49,.10],[-.40,-.28]];
      for(const [u,v] of tips){
        const edge=[x+u,sy+v,z],target=[x+u*magnification,sy+v*magnification,sz+.035];
        m.line([[x,sy,lz],edge,target],'#c08135',.020,{unlit:true});
        m.orb(...target,.043,.043,.014,brass);
      }
    }
  }

  Object.assign(window.RingDetails ||= {}, {
    loom:{
      focus:[-.99,1.40,-.06],radius:1.65,
      parts:[
        {name:'Челнок с катушкой',position:[-2.45,1.14,.04],locate:p=>[-2.45+2.89*shuttleTravel(p),1.14,.04],radius:.51,angle:[.25,.97],description:'Две деревянные щёчки держат катушку на оси. Участники по очереди передают челнок вдоль направляющей от одной рукояти к другой.',active:'При передаче челнок пересекает станок.'},
        {name:'Приёмник на конце хода',position:[.78,1.10,.14],radius:.39,angle:[-.60,.80],description:'На каждом конце направляющей предусмотрен роликовый концевик. Дошедший челнок нажимает рычажок. Контроллер принимает попеременно левый и правый сигналы.',active:'Индикатор загорается у того края, куда пришёл челнок.'},
        {name:'Основа и цветной уток',position:[-.99,1.34,-.23],radius:1.36,angle:[.21,.20],description:'На вертикальной основе подсвечивается следующая полоса. В макете один проход добавляет целый фрагмент орнамента, чтобы общий ритм был виден из зала.',active:'После каждого прохода на полотне появляется новый цветной пояс.'}
      ],draw:drawLoom
    },
    soundmap:{
      focus:[-.70,1.15,.19],radius:1.65,
      parts:[
        {name:'Рельефные клавиши',position:[-2.10,1.33,.20],locate:(p,s)=>{const a=mapPoints[s?.lastNote??0]||mapPoints[0];return [a[0],1.33,a[1]];},radius:.58,angle:[.38,1.02],description:'У трёх клавиш разные осязаемые знаки: волны, насечки и контур причала. Каждая нажимается отдельно и остаётся узнаваемой без звука.',active:'Кольцо и рельеф отмечают выбранное место.'},
        {name:'Три звуковых канала',position:[.59,.65,1.20],radius:.88,angle:[.26,.08],description:'В выдвижной кассете под кромкой стола вход клавиши связан со своим звуковым фрагментом. При повторном нажатии можно вернуться к знакомому месту.',active:'На лицевой стороне кассеты выделяется последний выбранный канал.'},
        {name:'Направленный громкоговоритель',position:[-.61,2.58,-.51],locate:(p,s)=>[-2.1+1.49*(s?.lastNote??1),2.58,-.51],radius:.58,angle:[-.43,-.34],description:'Над каждой станцией предусмотрен свой громкоговоритель. За защитным кольцом видна решётка излучателя. Направленность и слышимость соседней станции проверяют в зале.',active:'Цветовая отметка показывает выбранный выход. Звук можно включить отдельно.'}
      ],draw:drawSoundmap
    },
    shadow:{
      focus:[-.83,1.24,-.68],radius:1.63,
      parts:[
        {name:'Каретка с фигурой',position:[-.83,.69,-2.39],locate:(p,s)=>[-.83,.69,-2.39+(s?.distance??p/3)*1.88],radius:.72,angle:[1.12,.43],description:'Сменная птица или башня зажата на вертикальной стойке. Каретка катится на роликах по двум рельсам. Упоры ограничивают перемещение между лампой и экраном.',active:'Ползунок перемещает и каретку, и фигуру вдоль рельсов.'},
        {name:'Светильник с линзой',position:[-.83,1.65,.96],radius:.61,angle:[2.35,.26],description:'Светильник закреплён в поворотной скобе. Лучи расходятся от источника; силуэт перекрывает часть пучка. В разборе показаны лучи, проходящие через края выбранной фигуры.',active:'Чем ближе фигура к источнику, тем шире расходятся граничные лучи до экрана.'},
        {name:'Матовый экран',position:[-.83,1.80,-2.64],radius:1.24,angle:[-.64,.19],description:'Тень возникает оптически на светлом полотне. Размер зависит от положения фигуры, а форма повторяет её контур. Шторы по краям обрамляют освещённое поле.',active:'Контур птицы или башни меняется на экране одновременно с движением каретки.'}
      ],draw:drawShadow
    }
  });
})();
