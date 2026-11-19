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
    constructor(detailView=false) { this.faces=[];this.labels=[];this.actions=[];this.visitors=[];this.detailView=detailView; }
    face(points,color,options={}) {
      this.faces.push({points,color,...options});
    }
    line(points,color,width=.018,options={}) {
      this.faces.push({points,color,line:width,...options});
    }
    box(x,y,z,w,h,d,color) {
      const a=x-w/2,b=x+w/2,c=z-d/2,e=z+d/2,t=y+h;
      const minimumEdge=Math.min(w,h,d),bevelThreshold=this.cinema ? .025 : .098;
      if(minimumEdge>bevelThreshold && Math.max(w,h,d)<5.3){
        const r=Math.min(.026,minimumEdge*(this.cinema ? .095 : .065));
        const oct=(yy,inset)=>[[a+r,yy,c+inset],[b-r,yy,c+inset],[b-inset,yy,c+r],[b-inset,yy,e-r],[b-r,yy,e-inset],[a+r,yy,e-inset],[a+inset,yy,e-r],[a+inset,yy,c+r]];
        const lower=oct(y,0),shoulder=oct(t-r,0),top=oct(t,r*.68);
        for(let i=0;i<8;i++){
          const j=(i+1)%8;
          this.face([lower[j],lower[i],shoulder[i],shoulder[j]],color);
          this.face([shoulder[j],shoulder[i],top[i],top[j]],color);
        }
        this.face([...top].reverse(),color);this.face(lower,color);return;
      }
      this.face([[a,y,e],[b,y,e],[b,t,e],[a,t,e]],color);
      this.face([[b,y,c],[a,y,c],[a,t,c],[b,t,c]],color);
      this.face([[a,y,c],[a,y,e],[a,t,e],[a,t,c]],color);
      this.face([[b,y,e],[b,y,c],[b,t,c],[b,t,e]],color);
      this.face([[a,t,e],[b,t,e],[b,t,c],[a,t,c]],color);
    }
    profile(x,y,z,rings,color,n=14,depth=1,smooth=false) {
      const pts = rings.map(([offset,r]) => Array.from({length:n},(_,j)=>{
        const a=j*TAU/n;return [x+r*Math.cos(a),y+offset,z+r*depth*Math.sin(a)];
      }));
      for(let i=0;i<pts.length-1;i++) for(let j=0;j<n;j++){
        const k=(j+1)%n;
        const normal=(a,ring)=>{
          const lo=smooth?Math.max(0,ring-1):i,hi=smooth?Math.min(rings.length-1,ring+1):i+1;
          const slope=(rings[hi][1]-rings[lo][1])/Math.max(.00001,rings[hi][0]-rings[lo][0]);
          return unit([Math.cos(a*TAU/n),-slope,Math.sin(a*TAU/n)/depth]);
        };
        this.face([pts[i][k],pts[i][j],pts[i+1][j],pts[i+1][k]],color,
          {normals:[normal(k,i),normal(j,i),normal(j,i+1),normal(k,i+1)]});
      }
      this.face([...pts.at(-1)].reverse(),color);
      this.face(pts[0],color);
    }
    cyl(x,y,z,r,h,color,n=14,depth=1) {
      this.profile(x,y,z,[[0,r],[h,r]],color,n,depth);
    }
    orb(x,y,z,rx,ry,rz,color) {
      const n=this.cinema?10:7, rings=Array.from({length:n+1},(_,i)=>{
        const a=-Math.PI/2+i*Math.PI/n;return [ry*Math.sin(a),Math.max(.004, rx*Math.cos(a))];
      });
      this.profile(x,y,z,rings,color,this.cinema?22:16,rz/rx,true);
    }
    rod(a,b,r,color,n=r>.06?14:8) {
      const axis=unit(sub(b,a)), right=unit(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),up=cross(axis,right);
      const normals=Array.from({length:n},(_,i)=>{
        const angle=i*TAU/n;return add(scale(right,Math.cos(angle)),scale(up,Math.sin(angle)));
      });
      const ends=[a,b].map(end=>normals.map(v=>add(end,scale(v,r))));
      for(let i=0;i<n;i++){
        const k=(i+1)%n;
        this.face([ends[0][i],ends[0][k],ends[1][k],ends[1][i]],color,n>6?{normals:[normals[i],normals[k],normals[k],normals[i]]}:{});
      }
      this.face(ends[1],color);this.face([...ends[0]].reverse(),color);
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
      if(this.detailView)return;
      if(this.poseVisitors&&this.sceneId==='craft'&&role==='user'){
        // The craft assembly defines its brush axis from this wrist. Give the
        // photographic skeleton the same grip as the hand-built visitor.
        const forward=.04+reach*.43;
        this.rightHandTarget=[x+.19*Math.cos(heading)+forward*Math.sin(heading),.89+reach*.27,z-.19*Math.sin(heading)+forward*Math.cos(heading)];
      }
      if(window.RingCinemaVisitors){
        const visitor={x,z,heading,role,reach,target:this.rightHandTarget?.slice(),firstFace:this.faces.length};
        window.RingCinemaVisitors.draw(this,x,z,heading,role,reach);
        visitor.afterFace=this.faces.length;this.visitors.push(visitor);
        if(this.sceneId==='craft')this.rightHandTarget=null;
        return;
      }
      const tint=role==='user'?C.user:C.guest;
      const local=(u,y,v)=>[x+u*Math.cos(heading)+v*Math.sin(heading),y,z-u*Math.sin(heading)+v*Math.cos(heading)];
      this.disc(x,z,.35,.24,'#685d44',.20);
      for(const side of [-1,1]){
        const foot=local(side*.108,.105,side*.075);
        this.rod(foot,local(side*.102,.87,0),.066,'#485854');
        this.orb(foot[0],.065,foot[2],.095,.064,.12,'#394746');
      }
      this.profile(x,.78,z,[[0,.17],[.13,.17],[.48,.225],[.58,.165]],tint,10,.82);
      for(const side of [-1,1]){
        const collar=local(side*.09,1.34,.065);
        this.face([collar,local(side*.037,1.25,.15),local(0,1.32,.155)],role==='user'?'#914c3c':'#516f78');
      }
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
    m.face([[-W,-.005,D],[W,-.005,D],[W,-.005,-D],[-W,-.005,-D]], C.floor,{unlit:true,layer:0,material:'floor'});
    m.face([[-W,-.25,D],[W,-.25,D],[W,0,D],[-W,0,D]],C.edge,{unlit:true,layer:0});
    m.face([[W,-.25,D],[W,-.25,-D],[W,0,-D],[W,0,D]],'#b2a488',{unlit:true,layer:0});
    for(let x=-W+1;x<W;x++)m.line([[x,0,-D],[x,0,D]],C.line,.012,{opacity:.42,layer:1});
    for(let z=-D+1;z<D;z++)m.line([[-W,0,z],[W,0,z]],C.line,.012,{opacity:.42,layer:1});
    if(Math.cos(yaw)>-.2){
      m.face([[-W,0,-D],[W,0,-D],[W,H,-D],[-W,H,-D]], theme,{unlit:true,layer:-2,material:'wall'});
      m.box(0,.015,-D+.018,2*W,.10,.038,'#a3967b');
      m.box(0,H-.095,-D+.03,2*W,.065,.065,'#665f53');
      m.line([[-W,H,-D],[W,H,-D]],'#b8a78c',.045,{layer:-1});
      for(let x=-W+.32;x<W;x+=.38)m.line([[x,.10,-D],[x,H-.09,-D]],'#8d8471',.011,{opacity:.27,layer:-1});
    }
    if(Math.sin(yaw)>-.1){
      m.face([[-W,0,D],[-W,0,-D],[-W,H,-D],[-W,H*.66,D]],'#d4cab2',{unlit:true,layer:-2,material:'wall'});
      m.box(-W+.022,.01,0,.04,.1,2*D,'#aa9a80');
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
    if(m.poseVisitors){
      const pull=Math.min(1,p)*(.75+.25*Math.sin(Math.PI*p)**2);
      m.rightHandTarget=[-1.075,1.036+.075*pull,1.49+.13*pull];
      m.person(-.88,1.99+.055*pull,Math.PI,'user',.73+.24*pull);m.rightHandTarget=null;
    }else m.person(-1.03,1.7,Math.PI,'user',.85);
    if(p>=2)m.person(-1.73,1.82,Math.PI,'user',.85);
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
    if(m.poseVisitors){
      const pressure=Math.sin(Math.min(1,p/3)*Math.PI);
      m.rightHandTarget=[-1.49,1.424-.085*pressure,.32];
      m.person(-1.71,.98,2.52,'user',1.45-.22*pressure);m.rightHandTarget=null;
    }else m.person(-1.71,.98,2.52,'user',1);
    m.mark([-1.45,1.52,.49],'Трубка');m.mark([-2.55,1.2,-.82],'Печь');m.mark([2.6,2.74,-3.2],'Проекция формы');
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
    if(!window.RingDetails?.craft){m.rod([-.62,1.16,.32],[-.32,1.57,.82],.035,C.wood);m.orb(-.64,1.15,.30,.052,.071,.05,C.red);}
    m.screen(-.3,1.12,-3.20,7.26,1.90,'#41635a');
    for(let i=0;i<Math.round(p);i++)for(let j=0;j<(p===3?3:1);j++)flower(m,-2.9+1.90*i+.6*j,1.73+((i+j)%2)*.45,-3.17,.34,[C.blue,C.red,C.pink][i],true);
    if(!window.RingDetails?.craft)m.person(-.44,1.4,2.98,'user',1);
    m.mark([-.40,1.52,.74],'Кисть');m.mark([-1.08,1.24,.09],'Блюдо');m.mark([2.32,2.60,-3.17],'Орнамент на стене');
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
    if(m.poseVisitors){
      const pass=clamp(p-1,0,1),relax=clamp(p-2,0,1);
      // The first stamp is reachable from the end of the counter. The visitor
      // releases it and walks around the corner to insert the ticket from the front.
      if(pass<.05){
        m.rightHandTarget=[-2.29,1.232+.03*(1-Math.min(1,p)),.12];
        m.person(-3.00,.24,1.74,'user',1.15);
      }else if(pass>.94){
        m.rightHandTarget=[-.66,1.10+.08*relax,.285+.17*relax];
        m.person(-.82,1.02+.08*relax,Math.PI,'user',1.14-.37*relax);
      }else{
        const firstHalf=Math.min(1,pass*2),secondHalf=Math.max(0,pass*2-1);
        m.person(-3.0+2.18*secondHalf,.24+.79*firstHalf,1.74+pass*1.4,'user',.22);
      }
      m.rightHandTarget=null;
    }else m.person(-.92,1.48,Math.PI,'user',1);
    m.mark([-.17,1.22,.01],'Считыватель');m.mark([2.69,2.46,-3.13],'Маршрут на панораме');
  }

  const loomStates=new Map();
  function wovenCloth(m,p,shuttleX){
    if(loomStates.has(p)){m.faces.push(...loomStates.get(p));return;}
    const first=m.faces.length,left=-2.73,width=3.42,bottom=.42,height=.20+p*.59,repeat=.426,step=.0108;
    const flax='#bba586',undyed='#d7c2a3',madder='#87503d',indigo='#405861',ochre='#b38b54';
    // Coordinates are those of the undyed cloth, before it bows under tension.
    const at=(u,v)=>{
      const edge=Math.sin(Math.PI*u);
      const x=left+u*width+.008*Math.sin(9.1*v+.5)*Math.cos(Math.PI*u);
      const local=Math.exp(-Math.pow((x-shuttleX)/.53,2)),rise=v/height;
      const y=bottom+v-(.012+.022*rise*rise)*edge-.024*local*rise*rise;
      const z=-.275+edge*(.044*Math.sin(15*u+v*.83)+.015*Math.sin(36*u-.5*v))
        +.024*local*Math.exp(-Math.pow((bottom+v-1.10)/.43,2))
        +.00067*Math.cos(Math.PI*v/step+.12*Math.sin(8*u));
      return [x,y,z];
    };
    // The 21 cm photographed textile tile has world-space UVs shared across
    // every weft colour, including the motifs and the two reinforced edges.
    const patch=(u0,u1,v0,v1,color)=>{
      const uv=[[u0*width,v0],[u1*width,v0],[u1*width,v1],[u0*width,v1]].map(q=>[q[0]/.21,q[1]/.21]);
      m.face([at(u0,v0),at(u1,v0),at(u1,v1),at(u0,v1)],color,{material:'textile',uv});
    };
    // The small variation comes from neighbouring lengths of spun yarn. Its
    // irregular sequence avoids a high-contrast periodic grid on small screens.
    const dyes=new Map();
    const dye=(color,level)=>{
      const key=color+level;
      if(!dyes.has(key)){
        const factor=1+level*.026;
        const channels=rgb(color).map(c=>Math.round(clamp(c*factor,0,255)).toString(16).padStart(2,'0'));
        dyes.set(key,'#'+channels.join(''));
      }
      return dyes.get(key);
    };
    const period=.31;
    for(let row=0;row*step<height-.000001;row++){
      const v0=row*step,v1=Math.min(height,v0+step),mid=(v0+v1)/2;
      const band=Math.floor(mid/period),f=(mid-band*period)/period;
      const ground=[flax,madder,indigo,undyed][band%4];
      const motif=[indigo,undyed,flax,madder][band%4];
      const border=f<.07||f>.92, pinstripe=f>.11&&f<.16||f>.83&&f<.88;
      const base=border?(band%2?ochre:madder):pinstripe?(band%2?flax:indigo):ground;
      const mark=Math.max(0,1-Math.abs(f-.50)/.285)*.139;
      const inset=Math.max(0,1-Math.abs(f-.50)/.12)*.056;
      const cuts=[0,.024,.044,width-.044,width-.024,width],centres=[];
      // Additional vertices carry broad, continuous folds even in a monochrome band.
      for(let j=1;j<24;j++)cuts.push(width*j/24);
      if(mark>.0001){
        for(let x=.214+(band%2)*repeat*.5;x<width+.14;x+=repeat){
          centres.push(x);
          for(const k of [x-mark,x+mark,...(inset>.001?[x-inset,x+inset]:[])]){
            if(k>.045&&k<width-.045)cuts.push(k);
          }
        }
      }
      cuts.sort((a,b)=>a-b);
      for(let i=1;i<cuts.length;i++){
        const a=cuts[i-1],b=cuts[i],c=(a+b)/2;
        if(b-a<.00005)continue;
        let col=base;
        if(c<.024||c>width-.024)col=indigo;
        else if(c<.044||c>width-.044)col=ochre;
        else for(const centre of centres){
          const dx=Math.abs(centre-c);
          if(dx<=mark){col=dx<inset?ground:motif;break;}
        }
        const blend=Math.sin(row*2.17+.37*Math.sin(c*3))+.5*Math.sin(row*.77+c*.48);
        patch(a/width,b/width,v0,v1,dye(col,Math.round(blend*1.8)));
      }
    }
    // The cut edge shows the thickness of two layers of yarn from a side angle.
    for(const u of [0,1])for(let j=0;j<10;j++){
      const a=at(u,height*j/10),b=at(u,height*(j+1)/10);
      m.face([a,b,[b[0],b[1],b[2]-.005],[a[0],a[1],a[2]-.005]],'#675d4e',{material:'textile'});
    }
    for(let j=0;j<48;j++){
      const a=at(j/48,height),b=at((j+1)/48,height);
      m.face([a,b,[b[0],b[1]+.002,b[2]-.005],[a[0],a[1]+.002,a[2]-.005]],undyed,{material:'textile'});
    }
    // At the live weaving edge individual doubled warp ends emerge from the
    // fabric. Their modest contrast and irregular spacing stay stable in wide shots.
    for(let i=0;i<=112;i++){
      const u=clamp((i+.09*Math.sin(i*2.19))/112,0,1),start=at(u,height);
      const x=left+u*width+.006*Math.sin(i*.76);
      const col=['#bca783','#c5b190','#ad9675','#c0ab88','#d0bf9f'][i%5];
      const half=(i%4===0?.0036:.0025),middleY=start[1]+(2.55-start[1])*.51;
      const mid=[(start[0]+x)/2,middleY,-.304+.009*Math.sin(i*1.61)];
      const top=[x,2.565,-.322+(i%2)*.008];
      const warp=(a,b)=>m.face([[a[0]-half,a[1],a[2]],[a[0]+half,a[1],a[2]],
        [b[0]+half,b[1],b[2]],[b[0]-half,b[1],b[2]]],col,{material:'textile'});
      warp(start,mid);warp(mid,top);
    }
    if(Number.isInteger(p))loomStates.set(p,m.faces.slice(first));
  }
  function loom(m,p,t) {
    const baseZ=-.33;
    for(const x of [-2.86,.93])m.box(x,0,baseZ,.21,2.75,.27,C.wood);
    for(const y of [.37,2.55])m.rod([-2.91,y,baseZ],[1.01,y,baseZ],.13,C.oak,12);
    const h=.20+p*.59;
    const pass=Math.round(p),start=pass%2===0 ? -2.45 : .44;
    const shuttleX=p===pass ? start : (-2.45+2.89*(Math.floor(p)%2===0 ? p%1 : 1-p%1));
    wovenCloth(m,p,shuttleX);
    if(!window.RingDetails?.loom)m.orb(shuttleX,.59+h,baseZ+.12,.23,.078,.08,C.navy);
    for(const x of [-2.83,.88]){
      m.rod([x,1.09,baseZ],[x,1.09,.31],.062,C.iron);m.orb(x,1.09,.32,.10,.10,.11,'#a49c88');
      for(let i=0;i<18;i++){
        const a=i*TAU/18;
        const end=(angle,z,r)=>[x+r*Math.cos(angle),1.09+r*Math.sin(angle),z];
        m.rod(end(a-.07,.335,.100),end(a+.06,.369,.090),.0024,'#808782',6);
      }
      if(m.poseVisitors){
        const handoff=.5-.5*Math.cos(Math.PI*p),pressed=Math.min(1,p)*(x<0?handoff:1-handoff);
        m.rightHandTarget=[x,1.146+.042*(1-pressed),.355+.15*(1-pressed)];
        m.person(x+.185,.95,Math.PI,'user',.72+.33*pressed);m.rightHandTarget=null;
      }else m.person(x+(x<0?-.23:.23),.97,Math.PI,'user',.87);
      m.action([x,1.16,.33],x<0?'left':'right',x<0?'→':'←',pass<3&&(pass%2===0)===(x<0));
    }
    m.mark([-.83,2.55,baseZ],'Основа ткани');m.mark([.88,1.16,.33],'Рукоятка');m.mark([-2.82,1.15,.31],'Рукоятка');
  }

  function soundmap(m,p,t,state) {
    m.table(-.78,-.13,4.65,2.39,.79);m.box(-.78,.91,-.13,4.39,.13,2.17,C.green);
    for(let i=0;i<10;i++){const x=-2.66+.39*i,z=-.70+.26*Math.sin(i*1.5);m.profile(x,1.04,z,[[0,.32],[.08,.27],[.17,.14],[.21,.06]],'#92a27d',10,.77);}
    const pts=[[-2.1,1.12,.20],[-.64,1.12,-.55],[.90,1.12,.28]];
    const selected=i=>state.points ? state.points.includes(i) : i<Math.round(p);
    if(!window.RingDetails?.soundmap)m.line(pts,C.pale,.055);
    pts.forEach(([x,y,z],i)=>{
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
    if(m.poseVisitors){
      const key=state.lastNote??state.points?.at(-1)??clamp(Math.round(p)-1,0,2);
      const [x,,z]=pts[key],pose=[[-1.91,1.17,Math.PI],[-.83,-1.41,0],[1.76,.09,-Math.PI/2]][key];
      m.rightHandTarget=[x,p>.05?1.255:1.32,z+.018];m.person(...pose,'user',1.24);m.rightHandTarget=null;
    }else m.person(-.68,1.66,Math.PI,'user',1);
    m.mark([-.64,1.28,-.55],'Точка на карте');m.mark([.89,2.63,-.51],'Звуковой купол');
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
    if(m.poseVisitors){
      m.rightHandTarget=[x-.045,1.21,z+.036];
      m.person(-1.50,z+.26,1.66,'user',1.1+.12*distance);m.rightHandTarget=null;
    }else m.person(-1.65,-.45,1.70,'user',1);
    m.mark([x,lightY+.17,lightZ],'Источник света');m.mark([x,lightY+.22,z],'Силуэт');m.mark([2.1,2.51,screenZ],'Теневой экран');
  }

  const models={barge,glass,regional,bells,craft,passport,loom,soundmap,shadow};
  const themes={barge:'#adc1b7',glass:'#bbb3a2',regional:'#c9c6ae',bells:'#b6baa8',craft:'#c2b79d',passport:'#b0bbaa',loom:'#c8b89e',soundmap:'#b6c4b1',shadow:'#beb39e'};

  // Each line holds a position in the actual hall, its point of interest, and
  // the horizontal angle of view. Mobile keeps the full subject in the frame.
  const galleries={
    barge:{wall:'#395455',floor:'#635f55',trim:'#977653',key:'#ffdeb0',rim:'#9de2f3',bounce:'#61cbd4',source:[-1.1,.5,-1.45],
      establish:[[3.7,2.5,5.65],[-.62,1.3,-.80],54],action:[[1.08,1.74,2.77],[-.80,.84,.78],48],result:[[1.5,1.55,3.27],[-.69,.98,-1.39],58]},
    glass:{wall:'#4a4746',floor:'#625952',trim:'#a27a59',key:'#ffcf97',rim:'#b4d7e5',bounce:'#ff8232',source:[-2.55,1,-.61],
      establish:[[3.2,2.1,5.75],[-.65,1.42,-1.06],55],action:[[.20,1.79,2.56],[-.91,1.28,.28],52],result:[[-1.85,1.78,2.45],[.69,1.82,-1.94],51]},
    regional:{wall:'#817968',floor:'#746d61',trim:'#b3a080',key:'#fff0d3',rim:'#b1d6dd',bounce:'#dae6c6',source:[-.3,2,-2.60],
      establish:[[1.45,1.81,5.84],[-.35,1.53,-2.28],59],action:[[-1.20,1.79,1.45],[-3.15,1.43,-2.08],64],result:[[.30,1.70,3.31],[-.28,1.54,-3.08],68]},
    bells:{wall:'#444857',floor:'#5e5c64',trim:'#ab8859',key:'#ffe1a5',rim:'#abbff4',bounce:'#f2bf71',source:[-1.06,2.29,-.28],
      establish:[[2.78,2.0,6.08],[-.55,1.61,-.69],62],action:[[-1.15,1.40,3.52],[-2.50,1.43,-.39],68],result:[[1.16,1.55,3.45],[-.61,2.23,-.86],70]},
    craft:{wall:'#4e5b4f',floor:'#6c6052',trim:'#a18b62',key:'#ffe4b9',rim:'#a9d6c1',bounce:'#e3ae71',source:[-.97,1.82,-.05],
      establish:[[2.76,2.16,4.78],[-.75,1.50,-1.16],60],action:[[-2.58,2.13,2.15],[-1.03,1.13,.20],49],result:[[1.28,1.84,2.06],[-.33,1.96,-3.01],75]},
    passport:{wall:'#47565c',floor:'#605c54',trim:'#a07e57',key:'#f9deaa',rim:'#a5cfe0',bounce:'#e4b874',source:[-.60,1.80,.16],
      establish:[[2.82,2.12,5.88],[-.54,1.55,-1.39],58],action:[[.63,2.06,2.06],[-1.13,1.03,.20],50],result:[[.10,1.65,3.14],[-.22,2.01,-3.16],71]},
    loom:{wall:'#635453',floor:'#6f6156',trim:'#aa8861',key:'#ffe1b2',rim:'#e2bab5',bounce:'#db9c77',source:[-.90,1.60,.42],
      establish:[[2.70,1.96,5.38],[-.94,1.35,-.04],59],action:[[-.98,1.74,.74],[-2.65,1.15,.17],52],result:[[.70,1.86,3.32],[-.98,1.48,-.26],60]},
    soundmap:{wall:'#455a56',floor:'#625f54',trim:'#998867',key:'#ffe8bd',rim:'#9ddbcc',bounce:'#a4dac1',source:[-.75,1.86,-.36],
      establish:[[3.32,2.57,5.25],[-.83,1.53,-.64],59],action:[[.28,2.68,2.60],[-.93,1.12,-.08],57],result:[[1.48,1.68,3.81],[-.92,1.91,-1.17],59]},
    shadow:{wall:'#53474e',floor:'#5e5453',trim:'#9f765f',key:'#f4d8bd',rim:'#bdb3d7',bounce:'#ffd278',source:[-.83,1.65,.62],
      establish:[[3.71,2.17,4.63],[-.48,1.53,-1.18],59],action:[[1.65,1.79,1.98],[-.93,1.45,-.70],54],result:[[1.55,1.60,1.60],[-.68,1.58,-2.65],72]}
  };

  function cinemaHall(m,g,hardware,yaw,id) {
    const w=6.3,back=-3.48,front=10.5,height=4.2;
    if(window.RingArchitecture)window.RingArchitecture.floor(m,id,g,w,back,front);
    else m.face([[-w,-.009,front],[w,-.009,front],[w,-.009,back],[-w,-.009,back]],g.floor,{material:'floor'});
    const lining={material:'wall'};
    if(Math.cos(yaw)>-.18){
      m.face([[-w,0,back],[w,0,back],[w,height,back],[-w,height,back]],g.wall,lining);
      m.box(0,.02,back+.035,w*2,.12,.07,'#393d39');
      // Wall reveal and recessed light trough. No fixture hangs in front of the exhibits.
      m.box(0,3.53,back+.028,w*2,.19,.065,'#363a38');
      m.box(0,3.69,back+.075,w*2,.06,.15,g.trim);
      m.line([[-w,3.70,back+.113],[w,3.70,back+.113]],'#fce8bc',.018,{unlit:true});
      for(const sign of [-1,1]){
        for(let i=0;i<12;i++){
          const x=(4.16+i*.15)*sign;
          m.box(x,.15,back+.070,.052,3.31,.13,g.trim);
        }
      }
    }
    for(const side of [-1,1]){
      if(side*Math.sin(yaw)>.40)continue;
      const x=side*w;
      m.face([[x,0,front],[x,0,back],[x,height,back],[x,height,front]],g.wall,lining);
      m.box(x-side*.07,0,3.5,.14,.15,front-back,'#393d39');
      for(let i=0;i<6;i++){
        const z=back+.86+i*1.95;
        m.box(x-side*.07,.15,z,.12,3.45,.085,g.trim);
      }
    }
    // Dark open ceiling and real track luminaires anchor the cameras looking upward.
    m.face([[-w,height,front],[-w,height,back],[w,height,back],[w,height,front]],'#414442',{material:'ceiling'});
    for(const z of [-.18,2.78]){
      m.box(0,3.98,z,2*w,.080,.075,'#454c49');
      for(const x of [-3.55,-.55,2.81]){
        const top=[x,3.98,z],lens=[x+.08,3.67,z-.15];
        m.rod(top,[x,3.86,z],.026,'#393f3c');
        m.rod([x,3.87,z],lens,.092,'#414a47');
        m.rod(lens,[lens[0]+.005,3.655,z-.166],.075,'#f4d8a0',12);
      }
    }
    window.RingArchitecture?.architecture(m,id,yaw);
    if(hardware)m.disc(2.8,1.9,1.35,.73,'#7ab4a4',.23);
  }

  // Recessed slotted heads have a washer, a turned face and a real slot.
  function fixing(m,x,y,z,r,up=false){
    const plane=(u,v,d)=>up?[x+u,y+d,z+v]:[x+u,y+v,z+d];
    m.rod(plane(0,0,0),plane(0,0,r*.17),r,'#535a55',14);
    m.rod(plane(0,0,r*.17),plane(0,0,r*.29),r*.78,'#a49c88',14);
    m.line([plane(-r*.47,-r*.13,r*.30),plane(r*.47,r*.13,r*.30)],'#42504c',r*.14);
  }
  function scenicFinish(m,id,p){
    if(id==='barge'){
      const x=-1.55+p*.54,z=-1.10;
      // The running rigging and its deck eyes travel with the model vessel.
      for(const side of [-1,1]){
        m.line([[x+.24,1.45,z],[x+.82,.59,z+side*.16]],'#a48a63',.008);
        m.line([[x-.82,.585,z+side*.18],[x+.24,1.45,z]],'#a48a63',.008);
        fixing(m,x+.82,.585,z+side*.16,.033,true);
        m.rod([x+.72,.588,z+side*.235],[x+.716,.655,z+side*.235],.018,'#535a55',9);
        m.rod([x+.65,.656,z+side*.235],[x+.775,.656,z+side*.235],.015,'#8b938e',9);
      }
      for(let i=0;i<3;i++){
        const rope=Array.from({length:27},(_,j)=>{
          const a=j*TAU/26,r=.15+i*.027;
          return [-1.16+r*Math.cos(a),.025+i*.005,1.04+r*.62*Math.sin(a)];
        });
        m.line(rope,'#ae9066',.021);
      }
      m.line([[-1.30,.026,1.08],[-1.42,.027,.99],[-1.37,.024,.86],[-1.06,.026,.74],[-.94,.085,.72]],'#ae9066',.021);
      for(const xx of [-.61,-.15])for(const zz of [.54,.84])fixing(m,xx,.16,zz,.025,true);
      for(const z of [-1.96,.14])for(let i=0;i<3;i++)
        m.cyl(1.95,.55+i*.045,z,.099,.014,'#99714b',14);
    }else if(id==='glass'){
      for(let j=0;j<7;j++){
        const y=.09+j*.171;
        for(let k=0;k<6;k++){
          const x=-3.27+k*.271+(j%2)*.135;
          if(x>-1.89||(x>-3.09&&x< -1.997&&y>.38&&y<1.08))continue;
          m.box(x,y,-.866,.254,.143,.051,['#976b58','#aa745b','#8f6454'][(k+j)%3]);
        }
      }
      for(const xx of [-1.54,-1.13])for(const zz of [.20,.44])fixing(m,xx,1.125,zz,.024,true);
      for(const xx of [-2.99,-2.12])fixing(m,xx,.486,-.674,.043);
    }else if(id==='regional'){
      for(let k=0;k<3;k++){
        const x=-2.83+2.55*k;
        for(const side of [-1,1]){
          m.box(x+side*.97,.247,-2.97,.122,.026,.103,'#8b938e');
          fixing(m,x+side*.97,.274,-2.955,.024,true);
        }
        for(let j=0;j<=16;j++){
          const a=j*Math.PI/16,c=Math.cos(a),s=Math.sin(a);
          m.line([[x+c*1.048,1.956+s*1.048,-3.066],[x+c*1.152,1.956+s*1.152,-3.066]],'#c5b399',.011);
        }
      }
    }else if(id==='bells'){
      for(let i=0;i<3;i++){
        const x=-2.72+i*2.13,r=.63-i*.10,h=.88-i*.115,top=2.85-i*.08;
        for(const [at,radius] of [[.22,.812],[.24,.795],[.68,.545],[.70,.537]])
          m.profile(x,top-h+h*at,-.70,[[0,r*radius],[.010,r*radius+.008],[.021,r*radius-.004]],'#bc995e',26);
          for(const dx of [-.22,.22])fixing(m,x+dx,2.897,-.473,.032);
      }
    }else if(id==='craft'){
      for(let i=0;i<3;i++){
        const z=-.30+i*.036;
        m.rod([-2.35,1.045,z],[-1.95,1.053,z+.065],.012,'#705138');
        m.rod([-1.95,1.053,z+.065],[-1.90,1.053,z+.076],.013,'#b58d56');
      }
      m.profile(-1.09,1.034,.11,[[0,.34],[.028,.37],[.043,.43]],'#79563c',42,.66);
      m.box(-2.28,1.032,-.34,.28,.028,.23,'#8b938e');
      for(const dx of [-.105,.105])for(const dz of [-.076,.076])fixing(m,-2.28+dx,1.061,-.34+dz,.019,true);
    }else if(id==='passport'){
      for(let i=0;i<5;i++){
        const z=-.01+i*.13;
        m.line([[-2.46,1.027,z],[-1.71,1.027,z]],'#a89064',.010);
      }
      for(let i=0;i<3;i++){
        const x=-2.29+i*.31;
        m.profile(x,1.097,.11,[[0,.067],[.012,.063],[.021,.050]],'#b58d56',22);
        m.profile(x,1.215,.11,[[0,.042],[.011,.054],[.023,.045]],'#99714b',18);
      }
      for(const dx of [-.12,.12])fixing(m,-.20+dx,1.144,.107,.014,true);
    }else if(id==='loom'){
      for(let i=0;i<3;i++){
        const x=-3.91+i*.25,z=-.59+(i%2)*.18;
        m.cyl(x,.018,z,.122,.035,'#99714b',16);
        m.cyl(x,.055,z,.091,.23,['#995943','#c6af80','#667e79'][i],18);
        m.cyl(x,.285,z,.122,.035,'#99714b',16);
      }
      for(const x of [-2.83,.88]){
        m.profile(x,1.02,.312,[[0,.064],[.018,.082],[.035,.071]],'#ad905f',16);
        fixing(m,x,1.09,.425,.028);
      }
    }else if(id==='soundmap'){
      for(let i=0;i<5;i++){
        const x=-2.60+i*.81,z=-.63+.18*Math.sin(i*1.3);
        const contour=Array.from({length:25},(_,j)=>{
          const a=j*Math.PI/12,r=.23+.037*Math.sin(3*a+i);
          return [x+r*Math.cos(a),1.051,z+r*.76*Math.sin(a)];
        });
        m.line(contour,'#b4bd94',.012);
      }
      for(const [x,z] of [[-2.1,.20],[-.64,-.55],[.90,.28]]){
        m.profile(x,1.053,z,[[0,.17],[.014,.176],[.026,.155]],'#808782',28);
        for(const side of [-1,1])fixing(m,x+side*.16,1.074,z,.012,true);
      }
    }else if(id==='shadow'){
      for(const side of [-1,1]){
        const edge=side<0?-3.63:2.84;
        for(let i=0;i<13;i++){
          const x=edge+side*(i*.108),z=-2.72+.063*Math.cos(i*1.6);
          const z2=-2.72+.063*Math.cos((i+1)*1.6);
          m.face([[x,.08,z],[x+side*.109,.08,z2],[x+side*.109,3.25,z2],[x,3.25,z]],i%3===0?'#684b50':'#78545a',{material:'textile'});
        }
      }
      // Rear fan guard and access screws face the operator, the lens faces the screen.
      m.rod([-.83,1.65,1.332],[-.83,1.65,1.347],.183,'#42504c',28);
      for(let i=-3;i<=3;i++){
        const yy=1.65+i*.034,half=Math.sqrt(.144**2-(i*.034)**2);
        m.rod([-.83-half,yy,1.353],[-.83+half,yy,1.353],.006,'#8b938e',7);
      }
      for(const dx of [-.125,.125])for(const dy of [-.125,.125])fixing(m,-.83+dx,1.65+dy,1.338,.017);
    }
  }

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
    let width=0,height=0,image,pixels,buffer,background,night;
    const packed=(r,g,b)=>(255<<24)|(b<<16)|(g<<8)|r;
    function begin(w,h,cinema){
      if(w!==width||h!==height||night!==cinema){
        night=cinema;
        width=w;height=h;surface.width=w;surface.height=h;
        image=out.createImageData(w,h);pixels=new Uint32Array(image.data.buffer);
        background=new Uint32Array(w*h);buffer=new Float32Array(w*h);
        for(let y=0;y<h;y++){
          const a=y/Math.max(1,h-1);
            background.fill(cinema?packed(42-10*a,50-11*a,49-10*a):packed(244-23*a,241-24*a,232-31*a),y*w,(y+1)*w);
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
    function draw({face,pts,depth,shade,tint},resolution,focal,ready){
      const c=rgb(face.color),col=packed(...c.map((v,i)=>Math.round(clamp(v*(tint?tint[i]:shade),0,255))));
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
    const detail=window.RingDetails?.[id];
    const raster=createRaster(), extra={points:null,distance:null,shape:'bird',lastNote:null,inspect:-1,hardware:false,detailView:false};
    let hits=[];
    const gallery=galleries[id]||galleries.barge,hallViews=new Map();
    let view='overview',shot='establish',yaw=.53,pitch=.46,factor=1,step=0,hardware=false,frame=0,drag=null,alive=true;
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
      const first=view==='participant',standingHere=view==='spectator',cinema=view==='cinema',close=view==='detail' && detail;
      const part=detail?.parts[extra.inspect];
      const partPosition=part?.locate?.(progress,extra)||part?.position;
      const [cameraPoint,lookPoint,horizontalFov]=gallery[shot];
      let actionShift=0,trackedYaw=yaw;
      if(shot==='action'&&id==='regional')actionShift=Math.min(2,Math.floor(progress))*2.55;
      if(shot==='action'&&id==='loom'&&detail){
        const offset=detail.parts[0].locate(progress,extra)[0]-detail.parts[0].position[0];
        // Stay inside the two participants' positions so the receiving hand and shuttle share the frame.
        const travel=offset/2.89;
        actionShift=3.31*travel;
        if(cinema)trackedYaw-=2*travel*Math.atan2(cameraPoint[0]-lookPoint[0],cameraPoint[2]-lookPoint[2]);
      }
      let at=cinema?add(lookPoint,[actionShift,0,0]):close?(partPosition||detail.focus):first?[-.55,1.18,-1.0]:[0,.94,0];
      if(cinema&&shot==='action'&&id==='soundmap'){
        const key=extra.lastNote??extra.points?.at(-1)??clamp(Math.round(progress)-1,0,2);
        at=[[-2.05,1.18,.22],[-.67,1.18,-.49],[.84,1.18,.25]][key];
      }
      const dir=[Math.sin(trackedYaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(trackedYaw)*Math.cos(pitch)];
      const radius=part?.radius||detail?.radius||1.4;
      const distance=(cinema?Math.hypot(...sub(cameraPoint,lookPoint)):close?Math.max(radius*2.9,2.3):first?8.5:18)/factor;
      const eye=standingHere?spectatorEye:add(at,scale(dir,distance)),forward=scale(dir,-1);
      const right=unit(cross(forward,[0,1,0])),up=unit(cross(right,forward));
      const focal=cinema?Math.min(w,h*1.84)/(2*Math.tan(horizontalFov*Math.PI/360)):close?Math.min(w/(2*radius),h/(1.65*radius))*Math.max(radius*2.9,2.3):standingHere?Math.min(w/2.72,h/1.15)*factor:Math.min(w/(first?1.04:.78),h/(first?.71:.56));
      function project(v){
        const rel=sub(v,eye),z=dot(rel,forward);
        return {x:w*.5+focal*dot(rel,right)/z,y:h*.52-focal*dot(rel,up)/z,z};
      }
      const geometry=new Model(Boolean(close));
      extra.detailView=Boolean(close);extra.hardware=hardware;geometry.cinema=cinema;geometry.poseVisitors=!close;geometry.sceneId=id;
      if(cinema){
        const hallKey=[Math.cos(trackedYaw)>-.18,Math.sin(trackedYaw)<-.40,Math.sin(trackedYaw)>.40,hardware].join('/');
        if(!hallViews.has(hallKey)){
          const hall=new Model();
          cinemaHall(hall,gallery,hardware,trackedYaw,id);hallViews.set(hallKey,hall.faces);
        }
        geometry.faces.push(...hallViews.get(hallKey));
      }
      else room(geometry,themes[id]||themes.barge,yaw,hardware);
      const time=motion.matches?0:now*.001;
      model(geometry,progress,time,extra);
      detail?.draw(geometry,progress,time,extra);
      if(cinema)scenicFinish(geometry,id,progress);
      if(!close)listeners(geometry,step,standingHere);
      const device={distance:extra.distance,hardware,detailView:Boolean(close),open:extra.deviceOpen};
      const lit=window.RingLitRender?.(ctx,geometry,{w,h,eye,forward,focal,gallery:cinema?gallery:null,shot,focusDistance:distance,progress,device})||false;
      canvas.dataset.rendering=lit?'lit':'canvas';
      if(!lit){
      const faces=[];
      function enqueue(face,pts){
        if(face.points.length<(face.line?2:3))return;
        const depth=pts.reduce((n,pt)=>n+pt.z,0)/pts.length;
        if(pts.every(pt=>pt.x<0)||pts.every(pt=>pt.x>w)||pts.every(pt=>pt.y<0)||pts.every(pt=>pt.y>h))return;
        let shade=1,tint;
        if(!face.line&&!face.unlit){
          const n=unit(cross(sub(face.points[1],face.points[0]),sub(face.points[2],face.points[0])));
          shade=.76+.30*Math.max(-.20,dot(n,light));
          if(cinema){
            const offset=sub(gallery.source,face.points[0]),d=Math.hypot(...offset);
            const bounce=Math.max(0,dot(n,offset)/Math.max(.01,d))/(1+d*d*.42);
            const key=Math.max(0,dot(n,light)),rim=Math.max(0,.59*n[0]+.49*n[1]-.62*n[2]);
            tint=rgb(gallery.key).map((value,i)=>.51+.60*key*value/255+.29*rim*rgb(gallery.rim)[i]/255+.58*bounce*rgb(gallery.bounce)[i]/255);
          }
        }
        faces.push({face,pts,depth,shade,tint,layer:face.layer??3});
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
      raster.begin(Math.max(1,Math.round(w*resolution)),Math.max(1,Math.round(h*resolution)),cinema);
      faces.sort((a,b)=>Number((a.face.opacity??1)<1)-Number((b.face.opacity??1)<1)||b.depth-a.depth);
      for(const item of faces)raster.draw(item,resolution,focal,request);
      raster.finish(ctx,w,h);
      }
      hits=[];
      if(hardware && detail){
        const parts=detail.parts.map((part,i)=>({pos:part.locate?.(progress,extra)||part.position,label:part.name,index:i}));
        drawLabels(close?parts.filter(item=>item.index===extra.inspect):parts,project,w,h);
      }else if(hardware)drawLabels(geometry.labels,project,w,h);
      if(!geometry.actions.length&&id!=='shadow'&&geometry.labels.length)geometry.action(geometry.labels[0].pos,'advance','');
      for(const a of (close?[]:geometry.actions)){
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
        if(view==='detail'){
          x=clamp(w-bw-16,3,w-bw-3);
          y=clamp(h*.15,7,h-bh-3);
        }
        for(const box of placed)if(x<box.x+box.w&&x+bw>box.x&&y<box.y+bh&&y+bh>box.y)y=clamp(box.y+bh+3,3,h-bh-3);
        placed.push({x,y,w:bw});ctx.strokeStyle='#af7135';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(pt.x,pt.y);ctx.lineTo(x+8,y+bh*.5);ctx.stroke();
        ctx.fillStyle='#a55337';ctx.beginPath();ctx.arc(pt.x,pt.y,3.2,0,TAU);ctx.fill();
        ctx.fillStyle='#fff9e9';ctx.fillRect(x,y,bw,bh);ctx.strokeStyle='#c5b18f';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,bw-1,bh-1);
        ctx.fillStyle=C.ink;ctx.fillText(item.label,x+8,y+15.5);
        if(Number.isInteger(item.index))hits.push({x:x+bw/2,y:y+bh/2,r:bh,box:[x,y,bw,bh],action:'part-'+item.index});
      }
    }
    function request(){if(!frame&&alive)frame=requestAnimationFrame(render);}
    function frameShot(){
      const [eye,at]=gallery[shot],d=unit(sub(eye,at));
      yaw=Math.atan2(d[0],d[2]);pitch=Math.asin(d[1]);factor=1;
    }
    function setShot(name){
      if(!['establish','action','result'].includes(name))return;
      shot=name;if(view==='cinema')frameShot();request();
    }
    function setView(name){
      if(!['overview','participant','spectator','technical','detail','cinema'].includes(name))return;
      view=name;factor=1;
      if(name==='cinema'){frameShot();request();return;}
      const camera={overview:[.53,.46],participant:[-.10,.14],spectator:[.60,.068],technical:[.005,1.48],detail:detail?.parts[extra.inspect]?.angle||[.42,.37]};
      [yaw,pitch]=camera[name];
      request();
    }
    function setState(state={}){
      if(state.deviceOpen===null||typeof state.deviceOpen==='boolean')extra.deviceOpen=state.deviceOpen;
      if(typeof state.hardware==='boolean')hardware=state.hardware;
      if(Number.isInteger(state.inspect))extra.inspect=clamp(state.inspect,-1,2);
      if(state.lastNote===null || [0,1,2].includes(state.lastNote))extra.lastNote=state.lastNote;
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
      let nearest=null,best=Infinity;for(const hit of hits){if(hit.box){const [l,t,w,h]=hit.box;if(x>=l&&x<=l+w&&y>=t&&y<=t+h)return hit;continue;}const d=Math.hypot(x-hit.x,y-hit.y);if(d<hit.r&&d<best){best=d;nearest=hit;}}
      return nearest;
    }
    function down(e){if(e.button!==0||drag)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);}
    function move(e){
      if(!drag){canvas.style.cursor=target(e)?'pointer':'grab';return;}
      if(drag.id!==e.pointerId)return;
      if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<5)return;
      drag.moved=true;canvas.style.cursor='grabbing';const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      yaw-=dx*.008;pitch=clamp(pitch+dy*.006,view==='cinema'?-.24:.07,1.50);drag.x=e.clientX;drag.y=e.clientY;request();
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
    observer.observe(canvas);window.addEventListener('ringtexture',request);request();
    return {setView,setShot,turn,zoom,setState,destroy(){
      alive=false;observer.disconnect();window.removeEventListener('ringtexture',request);cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('pointercancel',end);canvas.removeEventListener('lostpointercapture',end);
    }};
  };
})();
