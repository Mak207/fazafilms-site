const names=['Встречный','Круговой','Праздничный'];
const rhythms=[
  [[0],[2],[1],[2],[0,2],[],[1],[2]],
  [[0],[1],[2],[],[0],[2],[1],[]],
  [[0,2],[2],[1,2],[2],[0,1],[2],[1,2],[]]
];
const notes=[146.8324,369.9944,440];
export function bellConsole(host,paint,feedback){
  host.innerHTML='<fieldset><legend>Кто участвует в перезвоне</legend><div class="buttons">'+['Низкий · ре','Средний · фа♯','Высокий · ля'].map((v,i)=>'<button type="button" data-part="'+i+'" aria-pressed="false">'+v+'</button>').join('')+'</div></fieldset><fieldset><legend>Рисунок перезвона</legend><div class="buttons">'+names.map((v,i)=>'<button type="button" data-tune="'+i+'" aria-pressed="'+(i===0)+'">'+v+'</button>').join('')+'</div></fieldset><button type="button" data-ensemble>Встать втроём</button> <button type="button" data-stop>Остановить</button>';
  let players=[false,false,false],struck=[-20,-20,-20],tune=0,slot=0,next=0,timer=0,redrawTimer=0,audio;
  function render(){const now=performance.now()/1000;paint({voices:struck.map(t=>Math.exp(-Math.max(0,now-t)*3.9)),participants:[...players]});}
  function strike(index,at){
    const now=audio.currentTime,d=at-now;struck[index]=performance.now()/1000+Math.max(0,d);
    for(const [multiple,gain] of [[.5,.06],[1,.16],[1.2,.042],[1.5,.04],[2.02,.027],[2.67,.018],[4.05,.012]]){
      const osc=audio.createOscillator(),env=audio.createGain();osc.frequency.value=notes[index]*multiple;
      env.gain.setValueAtTime(.00001,at);env.gain.exponentialRampToValueAtTime(gain,at+.012);env.gain.exponentialRampToValueAtTime(.00001,at+2.6/Math.sqrt(multiple));
      osc.connect(env).connect(audio.destination);osc.start(at);osc.stop(at+3.8);
    }
  }
  function listen(){audio||=new AudioContext();audio.resume().catch(()=>{});}
  function pulse(){if(!audio||audio.state!=='running')return;const now=audio.currentTime;if(next<now-.15)next=now;
    while(next<=now+.04){for(const i of rhythms[tune][slot])if(players[i])strike(i,next);slot=(slot+1)%8;next+=[.46,.40,.33][tune];}}
  function update(){host.querySelectorAll('[data-part]').forEach((b,i)=>b.setAttribute('aria-pressed',String(players[i])));host.querySelectorAll('[data-tune]').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===tune)));
    const n=players.filter(Boolean).length;feedback.textContent=n?'Рисунок «'+names[tune]+'». Участвуют '+n+' из трёх голосов.':'Выберите свой колокол или пригласите всех троих.';
    if(n&&!timer){next=audio.currentTime;slot=0;pulse();timer=setInterval(pulse,35);redrawTimer=setInterval(render,95);}
    if(!n){clearInterval(timer);clearInterval(redrawTimer);timer=0;struck=[-20,-20,-20];}render();}
  host.querySelectorAll('[data-part]').forEach((b,i)=>b.onclick=()=>{listen();players[i]=!players[i];if(players[i])strike(i,audio.currentTime+.02);update();});
  host.querySelectorAll('[data-tune]').forEach((b,i)=>b.onclick=()=>{tune=i;slot=0;update();});
  function reset(){players=[false,false,false];update();}
  host.querySelector('[data-ensemble]').onclick=()=>{listen();players=[true,true,true];update();};
  host.querySelector('[data-stop]').onclick=reset;
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset()});
  return {render,reset,next(){const i=players.indexOf(false);if(i<0){reset();return;}host.querySelector('[data-part="'+i+'"]').click();},setCount(n){listen();players=players.map((_,i)=>i<n);update();}};
}
