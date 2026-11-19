// The latch represents the last 15 mm of the 623 mm carriage stroke.
export function fairVisit({paint,selectView,setPosition,setAction,feedback,beats,soundButton}){
  const threshold=1-15/623;
  const track=new Audio('films/fair-sound.mp3');
  track.preload='metadata';
  let origin=null,frameId=0,travelId=0,pos=0,autoView=false,lastCue=-1;
  let sound=true;
  const reduce=()=>window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  soundButton.hidden=false;
  function stopTrack(){track.pause();track.currentTime=0;}
  function playTrack(elapsed){
    if(!sound || (Number.isFinite(track.duration) && elapsed>=track.duration))return;
    if(track.readyState>0)track.currentTime=elapsed;
    track.play().catch(()=>{});
  }
  soundButton.onclick=()=>{
    sound=!sound;
    soundButton.setAttribute('aria-pressed',String(sound));
    soundButton.textContent=sound?'Звук включён':'Звук выключен';
    if(!sound)track.pause();else if(origin!==null)playTrack((performance.now()-origin)/1000);
  };
  function cue(n){if(n!==lastCue){lastCue=n;feedback.textContent=beats[n];}}
  function render(now=performance.now()){
    const elapsed=origin===null?0:Math.max(0,(now-origin)/1000);
    if(autoView && elapsed>=1.15){autoView=false;selectView('result');}
    const t=reduce() && origin!==null ? Math.max(6,elapsed):elapsed;
    paint(pos,t);
    cue(origin===null?(pos>.02?1:0):(t<2.7?2:3));
  }
  function cycle(now){
    render(now);
    if(origin!==null && !document.hidden && !reduce())frameId=requestAnimationFrame(cycle);
  }
  function position(value){
    pos=Math.min(1,Math.max(0,value));setPosition(pos);
    if(pos>=threshold && origin===null){
      origin=performance.now();setAction('Повторить с начала');playTrack(0);
      cancelAnimationFrame(frameId);frameId=requestAnimationFrame(cycle);
    }else if(pos<threshold && origin!==null){
      origin=null;autoView=false;stopTrack();cancelAnimationFrame(frameId);setAction('Подвести зазывалу к балагану');
    }
    render();
  }
  function reset(){
    cancelAnimationFrame(travelId);cancelAnimationFrame(frameId);stopTrack();
    origin=null;autoView=false;pos=0;setAction('Подвести зазывалу к балагану');setPosition(0);render();
  }
  function move(){
    cancelAnimationFrame(travelId);
    if(origin!==null)reset();
    const start=performance.now(),from=pos,duration=reduce()?1:2300*Math.max(.15,1-from);
    selectView('user');autoView=true;
    function step(t){const u=Math.min(1,(t-start)/duration);position(from+(1-from)*u*u*(3-2*u));if(u<1)travelId=requestAnimationFrame(step);}
    travelId=requestAnimationFrame(step);
  }
  document.addEventListener('visibilitychange',()=>{
    cancelAnimationFrame(frameId);
    if(document.hidden){track.pause();return;}
    if(origin!==null)frameId=requestAnimationFrame(cycle);
  });
  return {move,reset,render,seek(value){cancelAnimationFrame(travelId);autoView=false;position(value);},manualView(){autoView=false;},pauseSound(){track.pause();}};
}
