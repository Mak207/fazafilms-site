(() => {
  'use strict';
  const workshops=new Set(['loom','craft','passport']);
  const boards=['#9d7b5a','#96745a','#a28161','#ac8967','#94755b'];
  function floor(m,id,g,w,back,front){
    const y=-.009;
    m.face([[-w,y,front],[w,y,front],[w,y,back],[-w,y,back]],g.floor,{material:workshops.has(id)?'matte':'tile'});
    if(!workshops.has(id))return;
    const width=.225,length=1.76,gap=.003;
    for(let row=0,z=back;z<front;row++,z+=width){
      const last=Math.min(z+width,front);
      for(let board=0,left=-w-(row%3)*length/3;left<w;board++,left+=length){
        const x0=Math.max(-w,left)+gap,x1=Math.min(w,left+length)-gap;
        if(x1<=x0)continue;
        const offset=((row*47+board*23)%33)/17;
        const p=[[x0,y+.002,last-gap],[x1,y+.002,last-gap],[x1,y+.002,z+gap],[x0,y+.002,z+gap]];
        m.face(p,boards[(row*3+board*7)%boards.length],{material:'wood',uv:p.map(([x,,depth])=>[depth+offset,x+offset])});
      }
    }
  }
  function serviceDoor(m,x){
    const z=-3.30,hu=x+.31;
    m.box(x,0,z,1.04,2.24,.10,'#353d39');
    m.box(x,.026,z+.054,.935,2.13,.042,'#555a54');
    m.box(hu,.94,z+.095,.043,.17,.018,'#656e69');
    m.rod([hu,.999,z+.10],[hu,.999,z+.17],.017,'#505c59');
    m.rod([hu,.999,z+.17],[hu-.113,.999,z+.17],.015,'#a4a6a0');
    m.box(x,.035,z+.086,.91,.16,.009,'#757b72');
  }
  function vent(m,x,y,z,w){
    m.box(x,y,z,w,.19,.035,'#373b37');
    for(let i=0;i<7;i++)m.box(x,y+.015+i*.023,z+.022,w-.034,.008,.023,'#74796f');
    for(const k of [-1,1])m.box(x+k*(w/2-.010),y,z+.021,.015,.19,.026,'#73776f');
  }
  function sideWindow(m,side,id){
    const x=side*6.13,r=1.29,sill=.83,top=2.97,z=1.08,frame='#626b62';
    m.box(x,sill-.09,z,.11,.10,r*2+.27,'#9e947f');
    m.box(x,sill,z,.04,top-sill,r*2,'#a3b4b2');
    for(const dz of [-r,0,r])m.box(x-side*.068,sill,z+dz,.14,top-sill+.04,.062,frame);
    for(const h of [sill,2.24,top])m.box(x-side*.070,h,z,.14,.056,r*2+.11,frame);
    for(const dz of [-r-.090,r+.090])m.box(x+.018*side,sill-.07,z+dz,.24,top-sill+.17,.13,'#ad9f86');
    if(id==='glass'||id==='craft')m.rod([x-side*.106,top+.09,z-r-.18],[x-side*.106,top+.09,z+r+.18],.018,'#747669');
  }
  function architecture(m,id,yaw){
    if(Math.cos(yaw)>-.18){
      serviceDoor(m,5.35);
      vent(m,-4.92,3.20,-3.325,1.57);
      for(let col=0;col<3;col++)for(let row=0;row<2;row++){
        const x=-3.45+col*3.42,z=-1.42+row*2.44;
        m.box(x,4.025,z,2.75,.068,1.45,'#4f524b');
        m.rod([x-1.14,4.09,z-.49],[x-1.14,4.19,z-.49],.009,'#515751');
      }
    }
    const side=-1;
    if(['loom','craft','glass','regional','barge'].includes(id)){
      if(side*Math.sin(yaw)<=.40)sideWindow(m,side,id);
    }else{
      const x=side*5.85;
      const start=m.faces.length;
      m.box(x-.08,.39,.9,.60,.082,2.30,'#99714b');
      for(const dz of [-.78,.78])m.box(x-.08,.012,.9+dz,.45,.38,.075,'#414b48');
      for(let i=start;i<m.faces.length;i++)m.faces[i].fallbackAsset='bench';
    }
  }
  window.RingArchitecture=Object.freeze({floor,architecture});
})();
