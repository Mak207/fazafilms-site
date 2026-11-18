/* Perspective exhibition studies. Coordinates are in metres, with Y pointing up
   and the presentation wall on the negative Z side of the room. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  const add = (a,b) => a.map((v,i) => v+b[i]);
  const sub = (a,b) => a.map((v,i) => v-b[i]);
  const scale = (a,k) => a.map(v => v*k);
  const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = v => scale(v,1/(Math.hypot(...v)||1));
  const light = unit([-0.65,1,0.85]);
  const rgbCache = new Map();
  function rgb(hex) {
    if (!rgbCache.has(hex)) rgbCache.set(hex,[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)));
    return rgbCache.get(hex);
  }
  const C = {
    shell:'#ddd0ad',edge:'#b1a88e',floor:'#e6d9bd',line:'#baad90',stone:'#cfc3ac',
    iron:'#3a504e',wood:'#986a43',oak:'#bc8e62',bronze:'#b58d56',gold:'#e5b45f',
    white:'#ede8d6',navy:'#31555e',blue:'#548894',water:'#74a8a5',pale:'#c6e4d7',
    red:'#c26651',light:'#ffe7a0',green:'#618c73',pink:'#da8992',
    user:'#b65746',guest:'#63838d',skin:'#c99c78',ink:'#273d3d'
  };

  class Model {
    constructor() { this.faces=[];this.labels=[];this.actions=[]; }
    face(points,color,options={}) {
      this.faces.push({points,color,...options});
    }
    line(points,color,width=.018,options={}) {
      this.faces.push({points,color,line:width,...options});
    }
    box(x,y,z,w,h,d,color) {
      const a=x-w/2,b=x+w/2,c=z-d/2,e=z+d/2,t=y+h;
      this.face([[a,y,e],[b,y,e],[b,t,e],[a,t,e]],color);
      this.face([[b,y,c],[a,y,c],[a,t,c],[b,t,c]],color);
      this.face([[a,y,c],[a,y,e],[a,t,e],[a,t,c]],color);
      this.face([[b,y,e],[b,y,c],[b,t,c],[b,t,e]],color);
      this.face([[a,t,e],[b,t,e],[b,t,c],[a,t,c]],color);
    }
    profile(x,y,z,rings,color,n=14,depth=1) {
      const pts = rings.map(([offset,r]) => Array.from({length:n},(_,j)=>{
        const a=j*TAU/n;return [x+r*Math.cos(a),y+offset,z+r*depth*Math.sin(a)];
      }));
      for(let i=0;i<pts.length-1;i++) for(let j=0;j<n;j++){
        const k=(j+1)%n;
        this.face([pts[i][k],pts[i][j],pts[i+1][j],pts[i+1][k]],color);
      }
      this.face([...pts.at(-1)].reverse(),color);
      this.face(pts[0],color);
    }
    cyl(x,y,z,r,h,color,n=14,depth=1) {
      this.profile(x,y,z,[[0,r],[h,r]],color,n,depth);
    }
    orb(x,y,z,rx,ry,rz,color) {
      const n=5, rings=Array.from({length:n+1},(_,i)=>{
        const a=-Math.PI/2+i*Math.PI/n;return [ry*Math.sin(a),Math.max(.004, rx*Math.cos(a))];
      });
      this.profile(x,y,z,rings,color,10,rz/rx);
    }
    rod(a,b,r,color,n=6) {
      const axis=unit(sub(b,a)), right=unit(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),up=cross(axis,right);
      const ends=[a,b].map(end=>Array.from({length:n},(_,i)=>{
        const angle=i*TAU/n;return add(end,add(scale(right,r*Math.cos(angle)),scale(up,r*Math.sin(angle))));
      }));
      for(let i=0;i<n;i++){const k=(i+1)%n;this.face([ends[0][k],ends[0][i],ends[1][i],ends[1][k]],color);}
      this.face(ends[1],color);
    }
    disc(x,z,rx,rz,color,opacity=1,y=.012,layer=1) {
      this.face(Array.from({length:32},(_,i)=>[x+rx*Math.cos(TAU*i/32),y,z+rz*Math.sin(TAU*i/32)]),color,{opacity,unlit:true,layer});
    }
    mark(pos,label) { this.labels.push({pos,label}); }
    action(pos,action,symbol,active=false) { this.actions.push({pos,action,symbol,active}); }
    media(points,name,x,y,w,h){
      const uv=points.map(([px,py])=>[(px-x)/w,1-(py-y)/h]);
      this.face(points,C.navy,{media:name,uv,unlit:true});
    }
    picturePlane(x,y,z,w,h,name){
      this.media([[x-w/2,y,z],[x+w/2,y,z],[x+w/2,y+h,z],[x-w/2,y+h,z]],name,x-w/2,y,w,h);
    }
    person(x,z,heading,role='guest',reach=0) {
      const tint=role==='user'?C.user:C.guest;
      const local=(u,y,v)=>[x+u*Math.cos(heading)+v*Math.sin(heading),y,z-u*Math.sin(heading)+v*Math.cos(heading)];
      this.disc(x,z,.35,.24,'#685d44',.20);
      for(const side of [-1,1]){
        const foot=local(side*.108,.105,side*.075);
        this.rod(foot,local(side*.102,.87,0),.066,'#485854');
        this.orb(foot[0],.065,foot[2],.095,.064,.12,'#394746');
      }
      this.profile(x,.78,z,[[0,.17],[.13,.17],[.48,.225],[.58,.165]],tint,10,.82);
      const neck=local(0,1.40,0);this.cyl(neck[0],1.33,neck[2],.085,.13,C.skin,8);
      this.orb(x,1.53,z,.147,.184,.14,C.skin);
      const hair=local(0,1.64,-.018);this.orb(hair[0],hair[1],hair[2],.148,.09,.138,'#594c3e');
      const nose=local(0,1.53,.135);this.orb(...nose,.044,.039,.042,C.skin);
      for(const side of [-1,1]){
        const shoulder=local(side*.18,1.27,0), elbow=local(side*.24,1.02,.025+reach*.12), wrist=local(side*.19,.89+reach*.27,.04+reach*.43);
        this.rod(shoulder,elbow,.072,tint);this.rod(elbow,wrist,.052,C.skin);this.orb(...wrist,.057,.055,.053,C.skin);
      }
    }
    table(x,z,w,d,height=1.02) {
      for(const sx of [-1,1])for(const sz of [-1,1])this.box(x+sx*w*.43,0,z+sz*d*.37,.095,height,.11,C.iron);
      this.box(x,height,z,w,.12,d,C.oak);
    }
    screen(x,y,z,w,h,bg) {
      this.box(x,y-.05,z-.06,w+.12,h+.10,.12,C.iron);
      this.face([[x-w/2,y,z+.012],[x+w/2,y,z+.012],[x+w/2,y+h,z+.012],[x-w/2,y+h,z+.012]],bg,{unlit:true});
    }
    picture(x,y,z,w,h,step,media) {
      this.screen(x,y,z,w,h,step?C.water:'#688d91');
      const pts=[[-.5,.23],[-.35,.39],[-.21,.35],[-.06,.48],[.09,.41],[.28,.58],[.42,.42],[.5,.48],[.5,0],[-.5,0]];
      this.face(pts.map(([u,v])=>[x+u*w,y+v*h,z+.023]),C.green,{unlit:true});
      this.face([[-.5,.12],[-.21,.21],[.04,.14],[.26,.23],[.5,.14],[.5,0],[-.5,0]].map(([u,v])=>[x+u*w,y+v*h,z+.034]),C.pale,{unlit:true});
      this.face(Array.from({length:18},(_,i)=>[x+w*.24+Math.cos(TAU*i/18)*h*.10,y+h*.72+Math.sin(TAU*i/18)*h*.10,z+.04]),step===3?C.light:'#f5d694',{unlit:true});
      if(media)this.picturePlane(x,y,z+.045,w,h,media);
    }
  }

  function room(m,theme,yaw,hardware) {
    const W=5,D=3.4,H=3.4;
    // Floor, wall and furniture are separate passes so near walls never hide the exhibit.
    m.face([[-W,-.005,D],[W,-.005,D],[W,-.005,-D],[-W,-.005,-D]], C.floor,{unlit:true,layer:0});
    m.face([[-W,-.25,D],[W,-.25,D],[W,0,D],[-W,0,D]],C.edge,{unlit:true,layer:0});
    m.face([[W,-.25,D],[W,-.25,-D],[W,0,-D],[W,0,D]],'#b2a488',{unlit:true,layer:0});
    for(let x=-W+1;x<W;x++)m.line([[x,0,-D],[x,0,D]],C.line,.012,{opacity:.42,layer:1});
    for(let z=-D+1;z<D;z++)m.line([[-W,0,z],[W,0,z]],C.line,.012,{opacity:.42,layer:1});
    if(Math.cos(yaw)>-.2){
      m.face([[-W,0,-D],[W,0,-D],[W,H,-D],[-W,H,-D]], theme,{unlit:true,layer:-2});
      m.line([[-W,H,-D],[W,H,-D]],'#b8a78c',.045,{layer:-1});
      for(let x=-W+.32;x<W;x+=.38)m.line([[x,.10,-D],[x,H-.09,-D]],'#8d8471',.011,{opacity:.27,layer:-1});
    }
    if(Math.sin(yaw)>-.1){
      m.face([[-W,0,D],[-W,0,-D],[-W,H,-D],[-W,H*.66,D]],'#d4cab2',{unlit:true,layer:-2});
      m.line([[-W,H*.66,D],[-W,H,-D]],'#b0a08a',.045,{layer:-1});
    }
    if(hardware){
      m.disc(2.8,1.9,1.35,.73,'#7ab4a4',.23);
    }
  }

  const spectatorEye=[2.10,1.68,2.40];
  const listeners=(m,step,standingHere)=>{
    m.person(2.82,1.96,-2.44);m.person(3.68,1.51,-2.5);
    if(step>=2&&!standingHere)m.person(spectatorEye[0],spectatorEye[2],-2.68);
  };
  const rail=(m,a,b)=>m.rod(a,b,.052,C.bronze);
  function waterWake(m,x,z,forward,s) {
    for(let i=1;i<=3;i++){
      const v=i*.23,w=(.48+v)*s;
      m.line([[x-w,.105,z+forward*(v+.3)],[x,.106,z+forward*v],[x+w,.105,z+forward*(v+.3)]],C.pale,.025,{opacity:.88});
    }
  }
  function barge(m,p,t) {
    m.box(-.75,.015,-1.07,6.38,.07,3.28,C.water);
    const x=-1.55+p*.54,z=-1.1;
    // Bow, keel and raised gunwales create a readable boat from above or the shore.
    const outline=[[-1.0,0],[-.65,-.39],[.54,-.43],[1.10,0],[.57,.39],[-.66,.37]];
    const hull=outline.map(([u,v])=>[x+u,.58,z+v]);
    const keel=outline.map(([u,v])=>[x+u*.73,.17,z+v*.46]);
    for(let i=0;i<hull.length;i++)m.face([keel[i],keel[(i+1)%6],hull[(i+1)%6],hull[i]],C.wood);
    m.face(hull,C.oak);m.line([...hull,hull[0]],C.light,.044);
    m.box(x-.34,.58,z,.58,.33,.48,C.wood);m.box(x-.34,.91,z,.72,.065,.6,C.navy);
    m.rod([x+.24,.53,z],[x+.24,1.53,z],.037,C.iron);
    m.face([[x+.24,1.48,z],[x+.72,1.36,z],[x+.24,1.25,z]],C.red);
    if(p>0)waterWake(m,x-1.04,z,1,.62);
    m.picture(-.2,1.3,-3.23,7.7,1.63,p,'barge-river');
    m.box(1.94,.06,-.89,.55,.18,2.88,C.oak);
    for(const zz of [-1.96,.14])m.cyl(1.95,.07,zz,.09,.72,C.wood);
    m.cyl(-.80,.02,.87,.29,.77,C.wood);
    m.rod([-.80,.62,.87],[-.80,.85,.87],.34,C.bronze);
    m.line([[x+.91,.55,z],[-.58,.70,.75],[-.83,.83,.98],[-1.06,.91+p*.055,1.48]],'#705138',.07);
    m.person(-1.03,1.7,Math.PI,'user',.85);if(p>=2)m.person(-1.73,1.82,Math.PI,'user',.85);
    if(p===3)for(const zz of [-1.96,.14])m.orb(1.95,.90,zz,.095,.13,.095,C.light);
    m.mark([-.8,.91,.87],'Датчик тяги');m.mark([1.93,.88,.12],'Причал');m.mark([1.9,2.66,-3.19],'Общий экран');
  }

  function glass(m,p,t) {
    m.box(-2.55,0,-1.55,1.52,1.32,1.35,'#9a614a');
    m.box(-2.55,1.32,-1.55,1.66,.13,1.44,C.iron);m.box(-2.55,1.44,-1.82,.46,1.06,.48,C.iron);
    m.box(-2.55,.43,-.854,.89,.65,.04,C.iron);m.box(-2.55,.50,-.820,.74,.45,.03,p? '#ffa44d':'#df763e');
    m.table(-.62,.12,2.22,.84,.96);
    m.rod([-1.55,1.47,.53],[.18,1.38,-.06],.044,C.iron);
    const r=.13+p*.073;
    m.profile(.27,1.22,-.076,[[0,.08],[.07,r*.87],[.20,r],[.36,r*.50],[.39,.09]],p===3?'#8bbfbe':'#ed9860',18);
    m.screen(1.16,1.08,-3.23,4.38,1.97,'#101513');
    const a=.19+p*.10; m.face([[-.24,.02],[-.76,.18],[-1,.49],[-.85,.68],[-.32,.88],[-.30,1], [.30,1],[.32,.88],[.85,.68],[1,.49],[.76,.18],[.24,.02]].map(([u,v])=>[1.18+u*a,1.29+v*1.32,-3.20]),p===3?C.pale:C.gold,{unlit:true});
    if(p===3)for(let i=0;i<4;i++){const angle=.55+i*.65;m.line([[1.18,1.75,-3.18],[1.18+Math.cos(angle)*1.75,1.75+Math.sin(angle)*.81,-3.18]],C.light,.025,{opacity:.8})}
    const width=.65+.23*p;
    m.picturePlane(1.16,1.20,-3.15,width,1.05+p*.25,p>2.5?'glass-vase':'glass-gather');
    m.person(-1.71,.98,2.52,'user',1);m.mark([-1.45,1.52,.49],'Трубка');m.mark([-2.55,1.2,-.82],'Печь');m.mark([2.6,2.74,-3.2],'Проекция формы');
  }

  function archPoints(x,y,z,w,h) {
    const r=w/2, shoulder=h-r;
    const pts=[[x-r,y,z],[x+r,y,z]];
    for(let i=0;i<=20;i++){const a=i*Math.PI/20;pts.push([x+r*Math.cos(a),y+shoulder+r*Math.sin(a),z]);}
    return pts;
  }
  function regional(m,p,t) {
    for(let i=0;i<3;i++){
      const x=-2.83+i*2.55;
      m.face(archPoints(x,.12,-3.11,2.33,3.0),'#997f60');m.face(archPoints(x,.21,-3.08,2.06,2.77),i<Math.round(p)?C.blue:'#b8c9bf',{unlit:true});
      if(i<Math.round(p)){
        m.face([[-1,0],[1,0],[1,.75],[.39,.97],[-.22,.70],[-.7,.90],[-1,.80]].map(([u,v])=>[x+u,.34+v,-3.05]),C.green,{unlit:true});
        m.face([[-1,0],[1,0],[1,.3],[.2,.42],[-.25,.34],[-1,.55]].map(([u,v])=>[x+u,.34+v,-3.02]),C.water,{unlit:true});
        m.media(archPoints(x,.21,-2.99,2.06,2.77),'spatial-regional-'+i,x-1.03,.21,2.06,2.77);
      } else {
        for(let j=0;j<4;j++)m.line([[x-.82,.65+j*.34,-3.01],[x-.18,.74+j*.34,-3.01],[x+.66,.66+j*.34,-3.01]],'#deebe0',.042,{opacity:.66});
      }
      m.box(x,.11,-3.03,2.15,.13,.30,C.oak);
      m.disc(x,-.92,.62,.47,i<p?'#e8ae64':'#91aba5',.34);
    }
    m.person(-2.75+Math.min(2,Math.floor(p))*2.55,-1.17,Math.PI,'user',.92);
    m.box(-.25,3.07,-3.06,.29,.13,.22,C.iron);
    m.mark([-.25,3.16,-3.03],'Датчик жеста');m.mark([1.98,2.44,-3],'Экран в арке');
  }

  function bells(m,p,t) {
    for(const x of [-3.55,2.50])m.box(x,0,-.7,.22,3.00,.24,C.wood);
    m.box(-.52,2.97,-.70,6.3,.20,.32,C.wood);
    for(let i=0;i<3;i++){
      const x=-2.72+i*2.13, r=.63-i*.10, h=.88-i*.115, top=2.85-i*.08;
      m.rod([x,top,-.70],[x,3.01,-.7],.047,C.iron);
      m.profile(x,top-h,-.70,[[0,r],[.08*h,r*1.03],[.19*h,r*.82],[.57*h,r*.58],[.83*h,r*.48],[h,r*.12]],C.bronze,20);
      m.profile(x,top-h+.08*h,-.70,[[0,r*1.04],[.036,r*1.02]],C.gold,20);
      const move=i<Math.round(p)? Math.sin(t*4+i)*.06:0;
      m.rod([x,top-h+.14,-.7],[x+move,top-h-.16,-.70],.032,C.iron);m.orb(x+move,top-h-.18,-.70,.076,.095,.076,C.iron);
      const active=i<Math.round(p);m.disc(x,-.32,.69,.61,active?C.gold:C.blue,.34);
      if(active)m.person(x,-.10,Math.PI,'user',.15);
    }
    if(p<.5)m.person(-2.72,.64,Math.PI,'user',.15);
    m.picture(-.58,1.29,-3.24,6.92,1.56,p,p>2.5?'bells-riverside':'bells-riverside-dusk');
    m.mark([-2.73,.26,-.33],'Зона слушателя');m.mark([1.55,2.74,-.68],'Колокол');
  }

  function flower(m,x,y,z,r,colour,wall=false) {
    const petal=(xx,yy,zz,rad,fill)=>{
      const pts=Array.from({length:13},(_,i)=>wall?[xx+rad*Math.cos(i*TAU/13),yy+rad*Math.sin(i*TAU/13),zz]:[xx+rad*Math.cos(i*TAU/13),yy,zz+rad*Math.sin(i*TAU/13)]);
      m.face(pts,fill,{unlit:true});
    };
    for(let i=0;i<7;i++){const a=i*TAU/7;petal(x+Math.cos(a)*r*.52,y+(wall?Math.sin(a)*r*.52:0),z+(wall?0:Math.sin(a)*r*.52),r*.47,colour)}
    petal(x,y+(wall?0:.008),z+(wall?.009:0),r*.29,C.light);
  }
  function craft(m,p,t) {
    m.table(-1.14,.15,2.85,1.36,.91);
    m.profile(-1.09,1.03,.11,[[0,.64],[.055,.74],[.105,.76]],C.oak,30,.67);
    for(let i=0;i<3;i++){
      const x=-1.48+.38*i;
      if(i<Math.round(p))flower(m,x,1.14,.12,.19,[C.blue,C.red,C.pink][i]);
      m.cyl(-2.17+.19*i,1.035,.59,.078,.035,[C.blue,C.red,C.pink][i],12);
    }
    m.rod([-.62,1.16,.32],[-.32,1.57,.82],.035,C.wood);m.orb(-.64,1.15,.30,.052,.071,.05,C.red);
    m.screen(-.3,1.12,-3.20,7.26,1.90,'#41635a');
    for(let i=0;i<Math.round(p);i++)for(let j=0;j<(p===3?3:1);j++)flower(m,-2.9+1.90*i+.6*j,1.73+((i+j)%2)*.45,-3.17,.34,[C.blue,C.red,C.pink][i],true);
    m.person(-.44,1.4,2.98,'user',1);m.mark([-.40,1.52,.74],'Кисть');m.mark([-1.08,1.24,.09],'Блюдо');m.mark([2.32,2.60,-3.17],'Орнамент на стене');
  }

  function passport(m,p,t) {
    m.table(-1.16,.15,3.25,1.25,.87);m.box(-1.16,.99,.15,2.8,.035,.92,C.navy);
    m.box(-.66,1.03,.24,.55,.025,.34,C.white);m.box(-.20,1.04,.03,.32,.10,.24,C.iron);
    for(let i=0;i<3;i++){m.cyl(-2.29+.31*i,1.035,.11,.105,.07,[C.gold,C.green,C.red][i]);m.cyl(-2.29+.31*i,1.105,.11,.038,.13,C.wood);}
    m.screen(-.26,1.22,-3.19,8.22,1.68,C.navy);
    const river=Array.from({length:34},(_,i)=>[-4.28+i*.245,1.76+Math.sin(i*.28)*.20+Math.sin(i*.7)*.08,-3.17]);
    m.line(river,'#709a9d',.15);
    const locations=[[-3.72,1.65,-3.14],[-1.71,2.24,-3.14],[.55,1.84,-3.14],[2.95,2.47,-3.14]];
    m.line(locations,'#728f8c',.024);
    m.line(locations.slice(0,1+Math.round(p)),C.gold,.083);
    for(let i=0;i<=Math.round(p);i++){
      const [x,y,z]=locations[i];m.orb(x,y,z,.10,.10,.035,C.light);
      if(i>0){
        const yy=2.42,xx=x-.23;
        m.face([[xx-.22,yy,z],[xx+.20,yy,z],[xx+.20,yy+.21,z],[xx+.09,yy+.29,z],[xx+.05,yy+.43,z],[xx,yy+.51,z],[xx-.05,yy+.40,z],[xx-.12,yy+.31,z],[xx-.22,yy+.24,z]],'#ead5a3',{unlit:true});
      }
    }
    m.orb(0,3.16,-2.60,.42,.42,.17,C.gold);
    m.person(-.92,1.48,Math.PI,'user',1);m.mark([-.17,1.22,.01],'Считыватель');m.mark([2.69,2.46,-3.13],'Маршрут на панораме');
  }

  function loom(m,p,t) {
    const baseZ=-.33;
    for(const x of [-2.86,.93])m.box(x,0,baseZ,.21,2.75,.27,C.wood);
    for(const y of [.37,2.55])m.rod([-2.91,y,baseZ],[1.01,y,baseZ],.13,C.oak,12);
    for(let i=0;i<21;i++){const x=-2.71+.171*i;m.line([[x,.4,baseZ],[x,2.54,baseZ]],'#d7c294',.019);}
    const h=.20+p*.59;
    for(let i=0;i<Math.ceil(h/.085);i++){
      const y=.42+i*.085;const col=[C.red,C.white,C.gold,C.green][Math.floor(i/3)%4];m.box(-1.02,y,baseZ+.03,3.42,.083,.066,col);
      for(let j=0;j<9;j++)if((j+i)%5===0)m.face([[-2.68+j*.40,y+.006,baseZ+.069],[-2.55+j*.40,y+.04,baseZ+.069],[-2.67+j*.40,y+.078,baseZ+.069]],C.navy,{unlit:true});
    }
    const pass=Math.round(p),start=pass%2===0 ? -2.45 : .44;
    const shuttleX=p===pass ? start : (-2.45+2.89*(Math.floor(p)%2===0 ? p%1 : 1-p%1));
    m.orb(shuttleX,.59+h,baseZ+.12,.23,.078,.08,C.navy);
    for(const x of [-2.83,.88]){
      m.rod([x,1.09,baseZ],[x,1.09,.31],.062,C.iron);m.orb(x,1.09,.32,.10,.10,.11,C.gold);
      m.person(x+(x<0?-.23:.23),.97,Math.PI,'user',.87);
      m.action([x,1.16,.33],x<0?'left':'right',x<0?'→':'←',pass<3&&(pass%2===0)===(x<0));
    }
    m.mark([-.83,2.55,baseZ],'Основа ткани');m.mark([.88,1.16,.33],'Рукоятка');m.mark([-2.82,1.15,.31],'Рукоятка');
  }

  function soundmap(m,p,t,state) {
    m.table(-.78,-.13,4.65,2.39,.79);m.box(-.78,.91,-.13,4.39,.13,2.17,C.green);
    for(let i=0;i<10;i++){const x=-2.66+.39*i,z=-.70+.26*Math.sin(i*1.5);m.profile(x,1.04,z,[[0,.32],[.08,.27],[.17,.14],[.21,.06]],'#92a27d',10,.77);}
    const pts=[[-2.1,1.12,.20],[-.64,1.12,-.55],[.90,1.12,.28]];
    const selected=i=>state.points ? state.points.includes(i) : i<Math.round(p);
    m.line(pts,C.pale,.055);pts.forEach(([x,y,z],i)=>{
      m.cyl(x,1.04,z,.145,.18,selected(i)?C.gold:C.navy,17);
      if(selected(i))m.disc(x,z,.31,.31,C.light,.72,1.052,2);
      m.action([x,1.24,z],String(i),String(i+1),selected(i));
    });
    for(let i=0;i<3;i++){
      const x=-2.1+1.49*i;m.rod([x,3.04,-.51],[x,2.69,-.51],.026,C.iron);m.profile(x,2.56,-.51,[[0,.22],[.17,.104]],C.iron,14);
      if(selected(i)){
        const a=pts[i];m.disc(x,.28,.53,.46,C.gold,.32);
        for(const side of [-1,1])m.line([[x+side*.16,2.56,-.51],[a[0]+side*.35,1.26,a[2]]],C.light,.028,{opacity:.78});
      }
    }
    m.person(-.68,1.66,Math.PI,'user',1);m.mark([-.64,1.28,-.55],'Точка на карте');m.mark([.89,2.63,-.51],'Звуковой купол');
  }

  function shadow(m,p,t,state) {
    m.screen(-.39,.38,-2.71,6.23,2.60, p ? '#ffe7ac':'#e4ceab');
    m.box(-.38,.13,-2.70,6.63,.21,.44,C.wood);
    for(const x of [-3.55,2.77])m.box(x,.33,-2.69,.13,2.77,.20,C.wood);
    m.box(-.39,3.0,-2.70,6.47,.12,.21,C.oak);
    const x=-.83, screenZ=-2.67, lightZ=.92, lightY=1.65;
    m.table(x,lightZ,1.25,.76,.85);m.cyl(x,.97,lightZ,.19,.42,C.iron);m.orb(x,lightY,lightZ,.17,.17,.19,C.light);
    m.rod([x,.47,lightZ-.24],[x,.47,screenZ+.17],.056,C.iron);
    const distance=state.distance??p/3,z=screenZ+.28+distance*1.88;
    const projection=(lightZ-screenZ)/(lightZ-z);
    const tower=[[-.38,-.5],[-.38,-.04],[-.21,-.04],[-.19,.20],[-.25,.22],[-.10,.34],[0,.54],[.1,.34],[.25,.22],[.19,.20],[.21,-.04],[.38,-.04],[.38,-.5]];
    const bird=[[-.56,.40],[-.28,.26],[-.08,.03],[.04,.11],[.15,.20],[.25,.17],[.34,.10],[.49,.10],[.35,.02],[.23,-.06],[.10,-.09],[-.02,-.19],[-.40,-.28],[-.26,-.13],[-.55,-.14],[-.28,.01],[-.42,.15]];
    const outline=state.shape==='tower'?tower:bird;
    m.rod([x,.47,z],[x,lightY,z],.027,C.wood);
    m.face(outline.map(([u,v])=>[x+u,lightY+v,z]),C.navy);
    m.face(outline.map(([u,v])=>[x+u*projection,lightY+v*projection,screenZ+.025]),'#34403f',{unlit:true});
    for(const side of [-1,1])m.face([[x,lightY,lightZ],[x+side*2.42,.50,screenZ+.07],[x+side*2.42,2.87,screenZ+.07]],'#fbcf75',{opacity:.17,unlit:true});
    m.person(-1.65,-.45,1.70,'user',1);m.mark([x,lightY+.17,lightZ],'Источник света');m.mark([x,lightY+.22,z],'Силуэт');m.mark([2.1,2.51,screenZ],'Теневой экран');
  }

  const models={barge,glass,regional,bells,craft,passport,loom,soundmap,shadow};
  const themes={barge:'#adc1b7',glass:'#bbb3a2',regional:'#c9c6ae',bells:'#b6baa8',craft:'#c2b79d',passport:'#b0bbaa',loom:'#c8b89e',soundmap:'#b6c4b1',shadow:'#beb39e'};

  // A scanline depth buffer keeps wall graphics, instruments, limbs and floor
  // marks on their own surfaces even when the visitor rotates the cutaway.
  // Interpolating reciprocal depth also gives the projected media correct UVs.
  const scriptURL=document.currentScript?.src||document.baseURI;
  const textureCache=new Map();
  function texture(name,ready){
    if(textureCache.has(name)){
      const record=textureCache.get(name);if(!record.done)record.listeners.add(ready);return record.data;
    }
    const record={listeners:new Set([ready]),data:null,done:false};textureCache.set(name,record);
    const img=new Image();
    const finish=()=>{record.done=true;record.listeners.forEach(fn=>fn());record.listeners.clear();};
    img.onload=()=>{
      try{
        const tmp=document.createElement('canvas'),s=Math.min(1,600/img.width,420/img.height);
        tmp.width=Math.max(1,Math.round(img.width*s));tmp.height=Math.max(1,Math.round(img.height*s));
        const tc=tmp.getContext('2d',{willReadFrequently:true});tc.drawImage(img,0,0,tmp.width,tmp.height);
        const pixels=tc.getImageData(0,0,tmp.width,tmp.height);
        record.data={w:tmp.width,h:tmp.height,rgba:new Uint32Array(pixels.data.buffer)};
      }catch(_){/* Local-file previews retain the vector illustration. */}
      finish();
    };
    img.onerror=finish;
    try{img.src=new URL('art/'+name+'.webp',scriptURL).href;}catch(_){finish();}
    return null;
  }
  function createRaster(){
    const surface=document.createElement('canvas'),out=surface.getContext('2d');
    let width=0,height=0,image,pixels,buffer,background;
    const packed=(r,g,b)=>(255<<24)|(b<<16)|(g<<8)|r;
    function begin(w,h){
      if(w!==width||h!==height){
        width=w;height=h;surface.width=w;surface.height=h;
        image=out.createImageData(w,h);pixels=new Uint32Array(image.data.buffer);
        background=new Uint32Array(w*h);buffer=new Float32Array(w*h);
        for(let y=0;y<h;y++){
          const a=y/Math.max(1,h-1);
          background.fill(packed(244-23*a,241-24*a,232-31*a),y*w,(y+1)*w);
        }
      }
      pixels.set(background);buffer.fill(0);
    }
    function polygon(vertices,col,alpha,tex){
      const count=vertices.length;
      let low=height,high=0;for(const v of vertices){low=Math.min(low,v.y);high=Math.max(high,v.y);}
      const y0=Math.max(0,Math.ceil(low-.5)),y1=Math.min(height,Math.ceil(high-.5));
      if(y0>=y1)return;
      const edges=[];const blended=alpha<.999;
      for(let k=0;k<count;k++){
        let a=vertices[k],b=vertices[(k+1)%count];
        if(a.y>b.y)[a,b]=[b,a];if(b.y-a.y<1e-6)continue;
        const inv=1/(b.y-a.y);
        edges.push({a,b,dx:(b.x-a.x)*inv,dz:(b.q-a.q)*inv,du:tex?(b.u-a.u)*inv:0,dv:tex?(b.v-a.v)*inv:0});
      }
      const cuts=[];
      for(let y=y0;y<y1;y++){
        const sample=y+.5;cuts.length=0;
        for(const e of edges){
          if(sample<e.a.y||sample>=e.b.y)continue;
          const dy=sample-e.a.y;
          cuts.push({x:e.a.x+dy*e.dx,q:e.a.q+dy*e.dz,u:tex?e.a.u+dy*e.du:0,v:tex?e.a.v+dy*e.dv:0});
        }
        cuts.sort((a,b)=>a.x-b.x);
        for(let i=0;i+1<cuts.length;i+=2){
          const a=cuts[i],b=cuts[i+1],span=b.x-a.x;if(span<1e-6)continue;
          const x0=Math.max(0,Math.ceil(a.x-.5)),x1=Math.min(width,Math.ceil(b.x-.5));if(x1<=x0)continue;
          const dq=(b.q-a.q)/span,du=(b.u-a.u)/span,dv=(b.v-a.v)/span;
          const dx=x0+.5-a.x;let q=a.q+dx*dq,u=a.u+dx*du,v=a.v+dx*dv;
          for(let index=y*width+x0,last=y*width+x1;index<last;index++,q+=dq,u+=du,v+=dv){
            if(q<buffer[index]-1e-8)continue;
            let ink=col;
            if(tex){
              const tx=clamp((u/q*tex.w)|0,0,tex.w-1),ty=clamp((v/q*tex.h)|0,0,tex.h-1);
              ink=tex.rgba[ty*tex.w+tx];if((ink>>>24)<100)continue;
            }
            if(blended){
              const dst=pixels[index],inv=1-alpha;
              pixels[index]=packed((dst&255)*inv+(ink&255)*alpha,((dst>>8)&255)*inv+((ink>>8)&255)*alpha,((dst>>16)&255)*inv+((ink>>16)&255)*alpha);
            }else{buffer[index]=q;pixels[index]=ink;}
          }
        }
      }
    }
    function draw({face,pts,depth,shade},resolution,focal,ready){
      const c=rgb(face.color),col=packed(...c.map(v=>Math.round(clamp(v*shade,0,255))));
      const tex=face.media ? texture(face.media,ready) : null;
      if(face.media&&!tex)return;
      const vertices=pts.map((pt,i)=>{
        const q=1/pt.z,uv=face.uv?.[i]||[0,0];
        return {x:pt.x*resolution,y:pt.y*resolution,q,u:uv[0]*q,v:uv[1]*q};
      });
      if(!face.line){polygon(vertices,col,face.opacity??1,tex);return;}
      for(let i=0;i<vertices.length-1;i++){
        const a=vertices[i],b=vertices[i+1],length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.001)continue;
        const hw=Math.max(.58,face.line*focal*resolution/depth)*.5;
        const nx=(a.y-b.y)/length*hw,ny=(b.x-a.x)/length*hw;
        const off=(v,k)=>({x:v.x+nx*k,y:v.y+ny*k,q:v.q+1e-6});
        polygon([off(a,1),off(b,1),off(b,-1),off(a,-1)],col,face.opacity??1,null);
      }
    }
    return {begin,draw,finish(ctx,w,h){out.putImageData(image,0,0);ctx.drawImage(surface,0,0,w,h);}};
  }

  window.RingSpatial = function (canvas,{id}={}) {
    const ctx=canvas.getContext('2d'), model=models[id]||models.barge;
    const raster=createRaster(), extra={points:null,distance:null,shape:'bird'};
    let hits=[];
    let view='overview',yaw=.53,pitch=.46,factor=1,step=0,hardware=false,frame=0,drag=null,alive=true;
    let progress=0,startProgress=0,since=0,inTransition=false;
    let size={w:0,h:0};
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    canvas.style.touchAction='none';
    function render(now) {
      frame=0;if(!alive)return;
      const {w,h}=size;if(!w||!h)return;
      if(inTransition){
        const a=motion.matches?1:clamp((now-since)/650,0,1);
        progress=startProgress+(step-startProgress)*(1-Math.pow(1-a,3));inTransition=a<1;
      }
      const first=view==='participant',standingHere=view==='spectator';
      const at=first?[-.55,1.18,-1.0]:[0,.94,0];
      const dir=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
      const distance=(first?8.5:18)/factor;
      const eye=standingHere?spectatorEye:add(at,scale(dir,distance)),forward=scale(dir,-1);
      const right=unit(cross(forward,[0,1,0])),up=unit(cross(right,forward));
      const focal=standingHere?Math.min(w/2.72,h/1.15)*factor:Math.min(w/(first?1.04:.78),h/(first?.71:.56));
      function project(v){
        const rel=sub(v,eye),z=dot(rel,forward);
        return {x:w*.5+focal*dot(rel,right)/z,y:h*.52-focal*dot(rel,up)/z,z};
      }
      const geometry=new Model();
      room(geometry,themes[id]||themes.barge,yaw,hardware);
      model(geometry,progress,motion.matches?0:now*.001,extra);
      listeners(geometry,step,standingHere);
      const faces=[];
      function enqueue(face,pts){
        if(face.points.length<(face.line?2:3))return;
        const depth=pts.reduce((n,pt)=>n+pt.z,0)/pts.length;
        if(pts.every(pt=>pt.x<0)||pts.every(pt=>pt.x>w)||pts.every(pt=>pt.y<0)||pts.every(pt=>pt.y>h))return;
        let shade=1;
        if(!face.line&&!face.unlit){
          const n=unit(cross(sub(face.points[1],face.points[0]),sub(face.points[2],face.points[0])));
          shade=.76+.30*Math.max(-.20,dot(n,light));
        }
        faces.push({face,pts,depth,shade,layer:face.layer??3});
      }
      const near=.18;
      for(const face of geometry.faces){
        if(face.points.length<(face.line?2:3))continue;
        const pts=face.points.map(project);
        if(pts.every(pt=>pt.z>=near)){enqueue(face,pts);continue;}
        if(pts.every(pt=>pt.z<near))continue;
        // From inside the room, long surfaces often run behind the viewer.
        // Clip at the near plane while preserving texture coordinates.
        const vertex=i=>({p:face.points[i],uv:face.uv?.[i],z:pts[i].z});
        const crossing=(a,b)=>{
          const f=(near-a.z)/(b.z-a.z);
          return {p:a.p.map((v,i)=>v+f*(b.p[i]-v)),uv:a.uv?.map((v,i)=>v+f*(b.uv[i]-v)),z:near};
        };
        const clipped=[];
        const submit=vs=>{
          if(vs.length<(face.line?2:3))return;
          const points=vs.map(v=>v.p);
          enqueue({...face,points,uv:face.uv?vs.map(v=>v.uv):undefined},points.map(project));
        };
        for(let i=face.line?1:0;i<pts.length;i++){
          const a=vertex((i+pts.length-1)%pts.length),b=vertex(i);
          if(face.line){
            if(a.z>=near&&b.z>=near)submit([a,b]);
            else if(a.z>=near)submit([a,crossing(a,b)]);
            else if(b.z>=near)submit([crossing(a,b),b]);
          }else{
            if((a.z>=near)!==(b.z>=near))clipped.push(crossing(a,b));
            if(b.z>=near)clipped.push(b);
          }
        }
        if(!face.line)submit(clipped);
      }
      const resolution=Math.min(1.4,Math.sqrt(900000/(w*h)));
      raster.begin(Math.max(1,Math.round(w*resolution)),Math.max(1,Math.round(h*resolution)));
      faces.sort((a,b)=>Number((a.face.opacity??1)<1)-Number((b.face.opacity??1)<1)||b.depth-a.depth);
      for(const item of faces)raster.draw(item,resolution,focal,request);
      raster.finish(ctx,w,h);
      if(hardware)drawLabels(geometry.labels,project,w,h);
      hits=[];
      if(!geometry.actions.length&&id!=='shadow'&&geometry.labels.length)geometry.action(geometry.labels[0].pos,'advance','');
      for(const a of geometry.actions){
        const pt=project(a.pos);if(pt.z<.18||pt.x<0||pt.y<0||pt.x>w||pt.y>h)continue;
        hits.push({...pt,action:a.action,r:a.symbol?21:30});
        if(!a.symbol)continue;
        const r=w<460?9:11;
        ctx.beginPath();ctx.arc(pt.x,pt.y,r,0,TAU);ctx.fillStyle=a.active?'#ffd47b':'#f5f3e8';
        ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='#2c5150';ctx.stroke();
        ctx.font='bold '+(r+3)+'px Arial, sans-serif';ctx.fillStyle='#183b3a';
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(a.symbol,pt.x,pt.y+.5);
        ctx.textAlign='start';ctx.textBaseline='alphabetic';
      }
      if(inTransition)request();
    }
    function drawLabels(labels,project,w,h){
      ctx.font='600 '+(w<500?'11':'13')+'px Arial, sans-serif';
      const placed=[];
      for(const item of labels){
        const pt=project(item.pos);if(pt.z<.18||pt.x<1||pt.x>w-1||pt.y<1||pt.y>h-1)continue;
        const bw=ctx.measureText(item.label).width+16,bh=23;
        let x=clamp(pt.x+9,3,w-bw-3),y=clamp(pt.y-31,3,h-bh-3);
        for(const box of placed)if(x<box.x+box.w&&x+bw>box.x&&y<box.y+bh&&y+bh>box.y)y=clamp(box.y+bh+3,3,h-bh-3);
        placed.push({x,y,w:bw});ctx.strokeStyle='#af7135';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(pt.x,pt.y);ctx.lineTo(x+8,y+bh*.5);ctx.stroke();
        ctx.fillStyle='#a55337';ctx.beginPath();ctx.arc(pt.x,pt.y,3.2,0,TAU);ctx.fill();
        ctx.fillStyle='#fff9e9';ctx.fillRect(x,y,bw,bh);ctx.strokeStyle='#c5b18f';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,bw-1,bh-1);
        ctx.fillStyle=C.ink;ctx.fillText(item.label,x+8,y+15.5);
      }
    }
    function request(){if(!frame&&alive)frame=requestAnimationFrame(render);}
    function setView(name){
      if(!['overview','participant','spectator','technical'].includes(name))return;
      view=name;factor=1;
      const camera={overview:[.53,.46],participant:[-.10,.14],spectator:[.60,.068],technical:[.005,1.48]};
      [yaw,pitch]=camera[name];
      request();
    }
    function setState(state={}){
      if(typeof state.hardware==='boolean')hardware=state.hardware;
      if(Array.isArray(state.points))extra.points=state.points.filter(n=>n===0||n===1||n===2);
      if(Number.isFinite(state.distance))extra.distance=clamp(state.distance,0,1);
      if(state.shape==='bird'||state.shape==='tower')extra.shape=state.shape;
      if(Number.isFinite(state.step)&&step!==clamp(state.step,0,3)){
        startProgress=progress;step=clamp(state.step,0,3);since=performance.now();inTransition=true;
      }
      request();
    }
    function zoom(k){if(Number.isFinite(k)&&k>0){factor=clamp(factor*k,.64,1.70);request();}}
    function turn(delta){if(Number.isFinite(delta)){yaw+=delta;request();}}
    function target(e){
      const b=canvas.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;
      let nearest=null,best=Infinity;for(const hit of hits){const d=Math.hypot(x-hit.x,y-hit.y);if(d<hit.r&&d<best){best=d;nearest=hit;}}
      return nearest;
    }
    function down(e){if(e.button!==0||drag)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);}
    function move(e){
      if(!drag){canvas.style.cursor=target(e)?'pointer':'grab';return;}
      if(drag.id!==e.pointerId)return;
      if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<5)return;
      drag.moved=true;canvas.style.cursor='grabbing';const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      yaw-=dx*.008;pitch=clamp(pitch+dy*.006,.07,1.50);drag.x=e.clientX;drag.y=e.clientY;request();
    }
    function end(e){
      if(drag?.id!==e.pointerId)return;
      const click=!drag.moved&&e.type==='pointerup';drag=null;
      const hit=target(e);canvas.style.cursor=hit?'pointer':'grab';
      if(click&&hit)canvas.dispatchEvent(new CustomEvent('spatialaction',{detail:{action:hit.action}}));
    }
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    const observer=new ResizeObserver(()=>{
      const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
      size={w:rect.width,h:rect.height};canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);request();
    });
    observer.observe(canvas);request();
    return {setView,turn,zoom,setState,destroy(){
      alive=false;observer.disconnect();cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('pointercancel',end);canvas.removeEventListener('lostpointercapture',end);
    }};
  };
})();
