/* Contemporary museum visitors, modelled in metres. Local +Z is the gaze direction. */
(() => {
  'use strict';
  const tau = Math.PI * 2;
  const add = (a,b) => a.map((v,i) => v+b[i]);
  const sub = (a,b) => a.map((v,i) => v-b[i]);
  const mul = (a,s) => a.map(v => v*s);
  const mix = (a,b,t) => a.map((v,i) => v+(b[i]-v)*t);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit = a => mul(a,1/(Math.hypot(...a)||1));
  const angles = n => Array.from({length:n},(_,i) => tau*i/n);
  const cache = new Map();

  function build(m,x,z,heading,role,reach) {
    const active = role === 'user';
    const variant = active ? 0 : (x > 3 ? 2 : 1);
    const skin = ['#c78f73','#be8c72','#af7f66'][variant];
    const hair = ['#48382f','#55453d','#423c38'][variant];
    const jacket = ['#945342','#566e70','#686c61'][variant];
    const trim = ['#764638','#475d60','#545b51'][variant];
    const pants = ['#434b4b','#525853','#464f51'][variant];
    const shoes = ['#51443a','#454642','#55483f'][variant];
    const cs = Math.cos(heading), sn = Math.sin(heading);
    const rotate = ([a,b,c]) => [a*cs+c*sn,b,-a*sn+c*cs];
    const world = p => add(rotate(p),[x,0,z]);
    const stroke = (points,color,w) => m.line(points.map(world),color,w,{material:'matte'});
    const panel = (points,color,material='matte') => m.face(points.map(world),color,{material});

    // Shared vertices and averaged tangents keep the face, sleeves and fingers continuous in close-up.
    function shell(rows,color,material='matte',capBottom=true,capTop=true) {
      const n=rows[0].length, last=rows.length-1;
      const vertices=rows.map(row=>row.map(world));
      const normals=rows.map((row,i)=>row.map((p,j)=>{
        const around=sub(row[(j+1)%n],row[(j+n-1)%n]);
        const along=sub(rows[Math.min(i+1,last)][j],rows[Math.max(i-1,0)][j]);
        return rotate(unit(cross(around,along)));
      }));
      for(let i=0;i<last;i++){
        for(let j=0;j<n;j++){
          const k=(j+1)%n;
          m.face([vertices[i][j],vertices[i][k],vertices[i+1][k],vertices[i+1][j]],color,{
            material,normals:[normals[i][j],normals[i][k],normals[i+1][k],normals[i+1][j]]
          });
        }
      }
      if(capBottom)m.face(vertices[0].slice().reverse(),color,{material});
      if(capTop)m.face(vertices[last],color,{material});
    }
    function rings(sections,color,n=12,material='matte') {
      const theta=angles(n);
      shell(sections.map(([cx,cy,cz,rx,rz])=>theta.map(a=>[cx+rx*Math.sin(a),cy,cz+rz*Math.cos(a)])),color,material);
    }
    // Sweep ellipses normal to the joint path. The first ellipse axis stays transverse to the limb.
    function limb(sections,color,n=9,material='matte') {
      const centers=sections.map(s=>s.slice(0,3)), theta=angles(n);
      shell(sections.map((s,i)=>{
        const d=unit(sub(centers[Math.min(i+1,sections.length-1)],centers[Math.max(i-1,0)]));
        // Project the local X axis into the cross section to avoid a twist at the wrist.
        const first=unit(sub([1,0,0],mul(d,d[0])));
        const front=cross(first,d);
        return theta.map(a=>add(centers[i],add(mul(first,s[3]*Math.sin(a)),mul(front,s[4]*Math.cos(a)))));
      }),color,material);
    }
    function section(p,a,b) {return [...p,a,b];}
    function fingerDirection(side,extension) {
      const pointing=extension>.3, gripping=extension>1.25;
      return unit([side*(gripping?-.19:-.10),pointing?(gripping?-.48:-.27):-.98,pointing?.90:.17]);
    }
    function hand(wrist,side,extension) {
      // Fingers descend at rest, flatten towards a console and curl around a gripped tool.
      const pointing=extension>.3, gripping=extension>1.25;
      const along=fingerDirection(side,extension);
      const across=unit(sub([side,0,0],mul(along,along[0]*side)));
      const palmUp=mul(cross(along,across),side);
      const at=(w,h,l)=>add(wrist,add(mul(across,w),add(mul(palmUp,h),mul(along,l))));
      const outline=angles(10);
      const palm=[
        [-.030,.026,.021],[-.006,.029,.024],[.023,.039,.024],[.056,.043,.019],[.078,.037,.014]
      ].map(([l,w,h])=>outline.map(a=>at(w*Math.sin(a),h*Math.cos(a)*-side,l)));
      shell(palm,skin);
      [[-.028,.075],[-.009,.079],[.010,.072],[.028,.059]].forEach(([w,l],i)=>{
        const curl=pointing?(i===0&&!gripping?.004:.027+i*.003):.024+i*.002;
        const spread=(i-1.5)*.002;
        limb([
          section(at(w,0,.066),.0090,.0098),
          section(at(w+spread,-curl*.20,.076+l*.39),.0085,.0085),
          section(at(w+spread*1.4,-curl*.64,.075+l*.73),.0072,.0073),
          section(at(w+spread,-curl,.073+l*.92),.0048,.0054)
        ],skin,6);
      });
      limb([section(at(-.022,0,.021),.017,.014),section(at(-.043,-.004,.046),.013,.014),
        section(at(-.052,-.013,.068),.011,.011),section(at(-.047,-.024,.083),.007,.007)],skin,7);
    }

    const lean=active?Math.min(.045,reach*.037):0;
    const shift=variant===1?.025:-.010;
    m.disc(x,z,.32,.20,'#544839',.14);
    for(const s of [-1,1]){
      const foot=s*.050+(s<0&&active?-.055:0);
      const ankle=[s*.116,.124,foot], knee=[s*.11,.49,foot+.032], hip=[s*.101+shift,.869,-.015];
      rings([[ankle[0],.022,foot+.045,.053,.127],[ankle[0],.043,foot+.047,.055,.127],
        [ankle[0],.080,foot+.024,.055,.103],[ankle[0],.118,foot-.001,.044,.059]],shoes,10);
      limb([section(ankle,.058,.062),section(mix(ankle,knee,.14),.064,.060),section(mix(ankle,knee,.62),.072,.071),
        section(knee,.071,.073),section(mix(knee,hip,.52),.088,.090),section(hip,.105,.099)],pants,10,'textile');
    }
    rings([[shift,.795,0,.156,.105],[shift,.85,.004,.167,.111],[shift,.92,.006,.155,.105]],pants,12,'textile');
    const body=[
      [shift,.851,.001,.171,.115],[shift,.870,.005,.175,.118],[shift,.920,.009,.170,.112],
      [.005,1.025,.014,.155,.106],[0,1.133,.018+lean*.28,.174,.119],
      [0,1.232,.010+lean*.54,.205,.133],[0,1.286,.006+lean*.61,.213,.127],
      [0,1.325,.002+lean*.7,.170,.109],[0,1.349,lean*.72,.084,.085]
    ];
    rings(body,jacket,16,'textile');
    const throat=lean*.72;
    rings([[0,1.313,throat,.068,.068],[0,1.352,throat,.066,.065],
      [0,1.414,throat+.006,.060,.065],[0,1.449,throat+.017,.066,.067]],skin,12);
    rings([[0,1.326,throat,.086,.078],[0,1.356,throat,.079,.073]],trim,14,'textile');
    // Narrow sewn placket and a pair of folded collar leaves follow the jacket front.
    const placket=body.slice(0,8).map(([cx,cy,cz,rx,rz])=>[cx+.006,cy,cz+rz+.002]);
    stroke(placket,trim,.006);
    for(const s of [-1,1]){
      panel([[s*.006,1.323,.100+throat],[s*.055,1.35,.062+throat],
        [s*.118,1.325,.095+throat],[s*.067,1.272,.129+throat*.65]],trim,'textile');
    }
    for(const s of [-1,1]){
      const extension=active?(s>0?reach:reach*(reach>1.25?.39:.70)):0;
      const shoulder=[s*.173,1.278,lean*.60];
      let elbow=[s*(.235+.012*extension),1.044,.029+extension*.14];
      let wrist=[s*.19,.89+extension*.27,.04+extension*.43];
      if(active && s>0 && m.rightHandTarget){
        const [tx,ty,tz]=m.rightHandTarget;
        const local=[(tx-x)*cs-(tz-z)*sn,ty,(tx-x)*sn+(tz-z)*cs];
        wrist=sub(local,mul(fingerDirection(s,extension),.070));
        const delta=sub(wrist,shoulder), distance=Math.max(.001,Math.hypot(...delta));
        const axis=unit(delta), stretch=Math.max(1,distance/.558);
        const upper=.296*stretch, lower=.274*stretch;
        const projection=Math.max(-upper,Math.min(upper,(upper*upper-lower*lower+distance*distance)/(2*distance)));
        const hint=sub([s*.35,.93,.025],shoulder);
        const bend=unit(sub(hint,mul(axis,hint.reduce((sum,v,i)=>sum+v*axis[i],0))));
        elbow=add(shoulder,add(mul(axis,projection),mul(bend,Math.sqrt(Math.max(0,upper*upper-projection*projection)))));
      }
      const fore=mix(elbow,wrist,.81), cuff=mix(elbow,wrist,.89);
      limb([section(add(shoulder,[0,.039,0]),.052,.061),section(shoulder,.082,.085),
        section(mix(shoulder,elbow,.43),.074,.070),section(mix(shoulder,elbow,.72),.061,.061),
        section(mix(elbow,mix(shoulder,wrist,.50),.14),.059,.063),
        section(mix(elbow,wrist,.45),.055,.055),section(fore,.041,.046)],jacket,10,'textile');
      limb([section(fore,.044,.049),section(cuff,.039,.044)],trim,10,'textile');
      limb([section(cuff,.034,.034),section(wrist,.029,.027)],skin,9);
      hand(wrist,s,extension);
    }

    // One skin surface carries the bridge, orbital sockets, cheekbones and chin.
    // Overlapping spheres at the forehead produced visible banding in side light.
    const head=[
      [1.397,.026,.037,.045],[1.411,.061,.065,.035],[1.438,.079,.083,.025],
      [1.465,.093,.093,.017],[1.487,.101,.102,.010],[1.511,.108,.107,.007],
      [1.527,.110,.111,.004],[1.548,.111,.112,.003],[1.567,.111,.113,.002],
      [1.589,.112,.115,.001],[1.616,.108,.113,-.002],[1.643,.099,.103,-.007],
      [1.669,.077,.084,-.012],[1.690,.050,.058,-.014],[1.703,.010,.015,-.015]
    ];
    const headCenter=throat+(active?.042:.013);
    const dip=active?Math.min(.24,.10+reach*.08):.035;
    const tilt=([a,b,c])=>[a,1.435+(b-1.435)*Math.cos(dip)-c*Math.sin(dip),
      headCenter+(b-1.435)*Math.sin(dip)+c*Math.cos(dip)];
    function features(a,b){
      const gauss=(v,w)=>Math.exp(-v*v/(w*w));
      return (.020*gauss(a,.017)*gauss(b-1.553,.039) + .032*gauss(a,.020)*gauss(b-1.523,.013)
        + .010*gauss(Math.abs(a)-.016,.009)*gauss(b-1.518,.008)
        + .005*gauss(Math.abs(a)-.056,.029)*gauss(b-1.522,.029)
        - .008*gauss(Math.abs(a)-.044,.025)*gauss(b-1.553,.013)
        + .006*gauss(a,.034)*gauss(b-1.480,.015));
    }
    function sectionAt(y) {
      const upper=head.findIndex(r=>r[0]>=y);
      if(upper<0)return head[head.length-1];
      if(!upper)return head[0];
      return mix(head[upper-1],head[upper],(y-head[upper-1][0])/(head[upper][0]-head[upper-1][0]));
    }
    function headPoint(y,a,pad=0) {
      const [,w,d,offset]=sectionAt(y), t=Math.cos(a), xx=(w+pad)*Math.sin(a);
      return [xx,y,offset+(d+pad)*t+features(xx,y)*Math.pow(Math.max(t,0),5)];
    }
    function onFace(xx,y,pad=.002) {
      const [,w]=sectionAt(y), pt=headPoint(y,Math.asin(Math.max(-.99,Math.min(.99,xx/w))));
      pt[2]+=pad;
      return tilt(pt);
    }
    const headAngles=angles(active?24:16).flatMap((a,i,arr)=>
      (a<.68||a>tau-.77)?[a,a+tau/arr.length*.5]:[a]);
    shell(head.map(([y])=>headAngles.map(a=>tilt(headPoint(y,a)))),skin);
    for(const s of [-1,1]){
      const e=[s*.109,1.535,.002];
      const ears=[[-.025,.004,.009],[-.017,.009,.016],[.003,.014,.019],[.019,.011,.016],[.026,.006,.008]];
      shell(ears.map(([dy,w,d])=>angles(7).map(a=>tilt([e[0]+w*Math.sin(a),e[1]+dy,e[2]+d*Math.cos(a)]))),skin);
      const eye=(a,b,h)=>onFace(s*(.045+a),1.550+b,h);
      const eyeShape=[[-.019,.000],[-.011,.0041],[-.001,.0052],[.010,.0041],[.018,.0015],
        [.010,-.0024],[0,-.0037],[-.011,-.0025]];
      panel(eyeShape.map(([a,b])=>eye(a,b,.0035)),'#bcaaa0');
      const iris=angles(10).map(a=>eye(-.001+.0047*Math.cos(a),.0007+.0040*Math.sin(a),.0043));
      panel(iris,variant===2?'#686856':'#776354');
      panel(angles(8).map(a=>eye(-.001+.0021*Math.cos(a),.0007+.0024*Math.sin(a),.0049)),'#4d423b');
      stroke(eyeShape.slice(0,5).map(([a,b])=>eye(a,b,.0049)),'#826556',.0016);
      const brow=[[-.018,.000],[-.005,.004],[.007,.005],[.019,.002],[.009,.0065],[-.003,.0075],[-.016,.004]];
      panel(brow.map(([xx,yy])=>onFace(s*(.044+xx),1.561+yy,.0036)),hair);
    }
    const lip=(xx,yy,h)=>onFace(xx,1.485+yy,h);
    panel([[-.025,.000],[-.014,.003],[-.006,.005],[0,.003],[.006,.005],[.015,.003],[.025,.000],
      [.010,-.0005],[0,-.0016],[-.012,-.0005]].map(([a,b])=>lip(a,b,.0033)),'#a77162');
    panel([[-.024,0],[-.011,-.001],[0,-.002],[.011,-.001],[.024,0],[.012,-.005],
      [0,-.006],[-.012,-.005]].map(([a,b])=>lip(a,b,.0035)),'#ba8271');
    stroke([[-.024,.000],[-.012,-.001],[0,-.0016],[.012,-.001],[.024,0]].map(([xx,yy])=>
      lip(xx,yy,.0041)),'#956757',.0012);
    const hairAngles=angles(active?22:16);
    function hairline(a) {
      const front=Math.max(0,Math.cos(a)),back=Math.max(0,-Math.cos(a));
      return 1.549+.060*front-.031*back+.008*Math.sin(2*a+.4)
        +(variant===1?-.034*(1-front):0);
    }
    const scalp=[0,.13,.29,.45,.61,.76,.88,.95,.990].map(t=>hairAngles.map(a=>{
      const low=hairline(a), y=low+(1.703-low)*t;
      const p=headPoint(y,a,.008+.005*Math.sin(Math.PI*t)+.004*Math.max(0,Math.cos(a-.5)));
      p[1]+=.003+t*.009;
      return tilt(p);
    }));
    shell(scalp,hair,'matte',false,true);
  }

  function draw(model,x,z,heading,role='guest',reach=0) {
    const contact=(model.rightHandTarget||[]).map(v=>Math.round(v*100)).join(',');
    const key=[x,z,heading,role,reach,contact].join('|');
    const existing=cache.get(key);
    if(existing){model.faces.push(...existing);return;}
    const start=model.faces.length;
    build(model,x,z,heading,role,reach);
    if(cache.size>=12)cache.delete(cache.keys().next().value);
    cache.set(key,model.faces.slice(start));
  }
  window.RingCinemaVisitors=Object.freeze({draw});
})();
