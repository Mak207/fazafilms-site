(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const scenes = window.RingScenes;
  const views = Array.from(document.querySelectorAll('[data-view]'));
  const places = ['У воды','В мастерской','На пристани'];
  const descriptions = ['Мягкий шум воды','Три коротких удара по дереву','Низкий гудок у пристани'];
  const readings={
    barge:[
      ['Петля свободна','Началось натяжение','Совместная тяга','Ход завершён'],
      ['Ролик в покое','Есть нагрузка','Сигнал общей тяги','Команда остановки'],
      ['Судно ждёт','Судно тронулось','Виден кильватерный след','Судно у причала']],
    glass:[
      ['Мех расправлен','Первое сжатие','Ровная подача','Подача закончена'],
      ['Поток отсутствует','Поток зарегистрирован','Поддерживается форма','Цикл завершён'],
      ['Заготовка','Горячее стекло','Форма выросла','Показ огранённого образца']],
    regional:[
      ['Жест ожидается','Жест у левой арки','Жест у средней арки','Жест у правой арки'],
      ['Зоны свободны','Открыта первая зона','Открыта вторая зона','Открыта третья зона'],
      ['Стекло покрыто дымкой','Открыт один вид','Открыты два вида','Видны все три пейзажа']],
    bells:[
      ['Места свободны','Занято одно место','Заняты два места','Заняты три места'],
      ['Входы выключены','Активен один канал','Активны два канала','Активны три канала'],
      ['Тишина','Первый голос','Два голоса','Общий перезвон']],
    craft:[
      ['Кисть над блюдом','Первый цветок','Второй цветок','Третий цветок'],
      ['Ожидание метки','Передан первый мотив','Переданы два мотива','Переданы три мотива'],
      ['Панно свободно','Один мотив','Два мотива','Орнамент развёрнут']],
    passport:[
      ['Чистый билет','Выбор отмечен','Билет под камерой','Билет прочитан'],
      ['Ожидание билета','Ожидание билета','Распознаны отметки','Маршрут передан'],
      ['Маршрут ожидается','Выбор принят','Строится маршрут','Три остановки на карте']],
    loom:[
      ['Челнок слева','Челнок справа','Челнок слева','Последний проход завершён'],
      ['Ожидание прохода','Правый конец','Левый конец','Правый конец'],
      ['Основа на раме','Вплетена одна полоса','Вплетены две полосы','Орнамент из трёх полос']]
  };
  function reading(){
    if(scene.id==='soundmap'){
      if(lastNote===null || lastNote===undefined)return ['Клавиши свободны','Канал ожидает выбора','Купола в покое'][inspectedPart];
      return [places[lastNote],'Канал '+(lastNote+1)+' из трёх',muted?'Звук выключен · открыто '+points.length+' из 3':'Выбран фрагмент «'+places[lastNote]+'»'][inspectedPart];
    }
    if(scene.id==='shadow')return [(shape==='tower'?'Башня':'Птица')+' · '+Math.round((distance||0)*100)+' % хода каретки','Свет постоянный',['Малая тень','Тень растёт','Средняя тень','Крупная тень'][step||0]][inspectedPart];
    return readings[scene.id]?.[inspectedPart]?.[step||0]||'';
  }
  const select = $('choose');
  let scene, engine, step, points, shape, distance, voice, playing, lastNote;
  let currentView='overview', inspectedPart=0;
  let muted = true;
  scenes.forEach((item, i) => select.add(new Option((i + 1) + '. ' + item.title, item.id)));
  function makeButton(id, title, callback) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.textContent = title;
    button.addEventListener('click',callback);
    $('actions').append(button);
    return button;
  }
  function rememberView(){
    const u=new URL(location.href);
    if(currentView==='detail'){
      u.searchParams.set('view','detail');u.searchParams.set('part',String(inspectedPart+1));
    }else{u.searchParams.delete('view');u.searchParams.delete('part');}
    history.replaceState({},'',u);
  }
  function describePart(){
    const detail=window.RingDetails?.[scene.id];
    const shown=Boolean(detail && $('hardware').checked);
    $('part-panel').hidden=!shown;
    if(!shown)return;
    const part=detail.parts[inspectedPart];
    Array.from($('part-buttons').children).forEach((b,i)=>b.setAttribute('aria-pressed',String(i===inspectedPart)));
    $('part-description').textContent=part.description;
    $('part-response').textContent=part.active;
    $('part-state').textContent=reading();
  }
  function camera(view,remember=true) {
    currentView=view;
    if(view==='detail')$('hardware').checked=true;
    views.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    engine?.setState({hardware:$('hardware').checked,inspect:view==='detail'?inspectedPart:-1});
    engine?.setView(view);
    describePart();
    if(remember)rememberView();
  }
  function inspect(index){
    inspectedPart=index;camera('detail');
    if(compact.matches && $('space').getBoundingClientRect().bottom<innerHeight*.32){
      $('space').scrollIntoView({block:'start',behavior:'instant'});
    }
  }
  function listParts(){
    const group=$('part-buttons');group.replaceChildren();
    (window.RingDetails?.[scene.id]?.parts||[]).forEach((part,i)=>{
      const b=document.createElement('button');b.type='button';b.textContent=(i+1)+'. '+part.name;
      b.addEventListener('click',()=>inspect(i));group.append(b);
    });
  }
  function feedback(text) { $('feedback').textContent = text; }
  function refresh(message) {
    engine?.setState({step, hardware:$('hardware').checked, inspect:currentView==='detail'?inspectedPart:-1, points:[...points], distance, shape, lastNote});
    document.querySelectorAll('.progress i').forEach((i,n)=>i.classList.toggle('done',n<step));
    if (scene.steps) {
      $('advance').textContent = scene.steps[Math.min(step,2)];
      $('advance').disabled = step===3;
    }
    if (scene.id === 'loom') {
      for (let i=0;i<2;i++) {
        const b=$('handle'+i); b.classList.toggle('active', step<3 && step%2===i); b.disabled=step===3;
      }
    }
    if (scene.id === 'soundmap') {
      places.forEach((_,i)=>{const b=$('place'+i);b.setAttribute('aria-pressed',String(points.includes(i)));b.classList.toggle('on',points.includes(i));});
      $('sound').setAttribute('aria-pressed',String(!muted));$('sound').textContent=muted?'Включить звук':'Выключить звук';
    }
    if (scene.id === 'shadow') {
      ['bird','tower'].forEach(k=>{const b=$(k);b.classList.toggle('active',shape===k);b.setAttribute('aria-pressed',String(shape===k));});
      $('distance').value=Math.round(distance*100);
    }
    feedback(message || scene.beats[step]);
    if($('hardware').checked)describePart();
  }
  async function hear(index) {
    if (muted || !window.AudioContext) return;
    try {
      voice ||= new AudioContext();
      if (voice.state === 'suspended') await voice.resume();
      if (muted || scene.id!=='soundmap') return;
      if (playing) playing.gain.setTargetAtTime(0,voice.currentTime,.02);
      const group=voice.createGain(); playing=group;group.gain.value=.22;group.connect(voice.destination);
      const t=voice.currentTime;
      function tone(hz,delay,length,type,volume,end) {
        const osc=voice.createOscillator(),gain=voice.createGain(), start=t+delay;
        osc.type=type;osc.frequency.setValueAtTime(hz,start);osc.frequency.exponentialRampToValueAtTime(end,start+length);
        gain.gain.setValueAtTime(.001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.025);gain.gain.exponentialRampToValueAtTime(.001,start+length);
        osc.connect(gain);gain.connect(group);osc.start(start);osc.stop(start+length+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};
      }
      if (index===0) {
        const buffer=voice.createBuffer(1,Math.ceil(voice.sampleRate*1.2),voice.sampleRate),data=buffer.getChannelData(0);
        let previous=0;
        for(let n=0;n<data.length;n++){previous=(previous+Math.random()*.18-.09)/1.025;data[n]=previous*Math.sin(Math.PI*n/data.length)*1.8;}
        const src=voice.createBufferSource();src.buffer=buffer;src.connect(group);src.start();src.onended=()=>src.disconnect();
      } else if (index===1) [0,.21,.53].forEach((dt,i)=>tone(400+i*42,dt,.095,'triangle',.55,140));
      else {tone(135,0,1.08,'sine',.4,118);tone(204,.04,1.02,'triangle',.18,177);}
      setTimeout(()=>group.disconnect(),2300);
    } catch { feedback('Звук недоступен в этом браузере. Светом на карте показана выбранная точка.'); }
  }
  function populate() {
    $('actions').replaceChildren();
    if (scene.steps) {
      $('prompt').textContent='Пройдите три действия и посмотрите, где появится результат для зрителей.';
      makeButton('advance','',()=>{step=Math.min(3,step+1);refresh();}).className='step';
    } else if (scene.id==='loom') {
      $('prompt').textContent='Передавайте челнок с одной стороны рамы на другую. Начните слева.';
      ['Слева направо','Справа налево'].forEach((name,i)=>makeButton('handle'+i,name,()=>{
        if (step%2!==i) {feedback('Челнок ещё на другой стороне. Возьмите его '+(step%2===0?'слева.':'справа.'));return;}
        step++;refresh();
      }));
    } else if (scene.id==='soundmap') {
      $('prompt').textContent='Включите звук и выберите место на карте. Можно оставить звук выключенным и читать подписи к каждой точке.';
      places.forEach((p,i)=>makeButton('place'+i,p,()=>{
        if(!points.includes(i))points.push(i);
        step=points.length;lastNote=i;refresh(descriptions[i]+'. '+scene.beats[step]);hear(i);
      }));
      makeButton('sound','',()=>{
        if(!window.AudioContext){feedback('Звук недоступен в этом браузере. У каждой точки есть видимая световая реакция.');return;}
        muted=!muted;
        if(muted && playing && voice)playing.gain.setTargetAtTime(0,voice.currentTime,.02);
        refresh(muted?'Звук выключен. У каждой точки есть свет и подпись.':'Звук включён. Выберите любую из трёх точек.');if(!muted && lastNote!==null)hear(lastNote);
      });
      $('actions').prepend($('sound'));
    } else {
      $('prompt').textContent='Выберите птицу или башню. Передвиньте ползунок к лампе и проследите, как вырастет тень.';
      [['bird','Птица'],['tower','Башня']].forEach(([k,n])=>makeButton(k,n,()=>{shape=k;refresh(n+'. '+scene.beats[step]);}));
      const label=document.createElement('label');label.htmlFor='distance';label.textContent='От экрана к лампе';
      const range=document.createElement('input');range.type='range';range.id='distance';range.min=0;range.max=100;range.value=0;
      range.addEventListener('input',()=>{distance=Number(range.value)/100;step=Math.round(distance*3);refresh();});$('actions').append(label,range);
    }
  }
  function restart() {
    step=0;points=[];distance=0;shape='bird';lastNote=null;
    if(playing && voice)playing.gain.setTargetAtTime(0,voice.currentTime,.02);
    refresh();
  }
  function openScene(id, record) {
    scene=scenes.find(item=>item.id===id)||scenes[0];
    if(record){const u=new URL(location.href);u.searchParams.set('scene',scene.id);u.searchParams.delete('view');u.searchParams.delete('part');history.pushState({},'',u);}
    select.value=scene.id;$('name').textContent=scene.title;document.title=scene.title+' в 3D · Золотое кольцо';
    ['zone','aim','apparatus','decision'].forEach(k=>$(k).textContent=scene[k]);$('composition').textContent=scene.staging;
    $('original').hidden=!scene.steps;if(scene.steps)$('original').href=scene.id+'.html?v=2';
    engine?.destroy();$('hardware').checked=false;
    engine=typeof window.RingSpatial==='function'?window.RingSpatial($('space'),{id:scene.id}):null;
    $('render-note').hidden=Boolean(engine);
    const query=new URL(location.href).searchParams;
    inspectedPart=Math.min(2,Math.max(0,Number.parseInt(query.get('part'),10)-1||0));
    listParts();camera(query.get('view')==='detail'?'detail':'overview',false);populate();restart();
  }
  select.addEventListener('change',()=>openScene(select.value,true));
  $('next').addEventListener('click',()=>{openScene(scenes[(scenes.indexOf(scene)+1)%scenes.length].id,true);select.focus();select.scrollIntoView({block:'start'});});
  window.addEventListener('popstate',()=>openScene(new URL(location.href).searchParams.get('scene'),false));
  $('hardware').addEventListener('change',()=>{
    if(!$('hardware').checked && currentView==='detail'){camera('overview');}
    else {describePart();refresh();}
  });$('reset').addEventListener('click',restart);
  $('space').addEventListener('spatialaction',event=>{
    const action=String(event.detail?.action);
    if(/^part-[012]$/.test(action))inspect(Number(action.slice(-1)));
    else if(scene.id==='loom' && ['left','right'].includes(action))$('handle'+(action==='left'?0:1)).click();
    else if(scene.id==='soundmap' && ['0','1','2'].includes(action))$('place'+action).click();
    else if(scene.steps && action==='advance')$('advance').click();
  });
  views.forEach(b=>b.addEventListener('click',()=>camera(b.dataset.view)));
  document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>{
    const op=b.dataset.camera;
    if(op==='left'||op==='right')engine?.turn((op==='left'?-1:1)*Math.PI/10);
    else engine?.zoom(op==='in'?1.16:1/1.16);
  }));
  const compact=matchMedia('(max-width:770px)');
  function placeControls(){
    (compact.matches?$('compact-controls'):document.querySelector('.workspace')).append($('console'));
  }
  compact.addEventListener('change',placeControls);placeControls();
  openScene(new URL(location.href).searchParams.get('scene'),false);
})();
