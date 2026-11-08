const videos=[document.getElementById('light-video'),document.getElementById('color-video')];
const compare=document.getElementById('compare');
const status=document.getElementById('play-status');
let together=false;
const resetButton=()=>{compare.textContent='Смотреть одновременно ↔';};
for(const video of videos){
  video.addEventListener('play',()=>{if(!together){for(const other of videos)if(other!==video)other.pause();}});
  video.addEventListener('error',()=>{status.textContent='Не удалось загрузить видео. Попробуйте открыть его по ссылке «Скачать ролик».';});
  video.addEventListener('ended',()=>{if(videos.every(v=>v.ended)){together=false;resetButton();status.textContent='Просмотр завершён. Можно повторить сравнение или включить каждый ролик отдельно.';}});
}
compare.addEventListener('click',async()=>{
  if(together){videos.forEach(v=>v.pause());together=false;resetButton();status.textContent='Сравнение остановлено. Звук можно включить в плеере каждого ролика.';return;}
  together=true;videos.forEach(v=>{v.muted=true;v.currentTime=0;});
  const results=await Promise.allSettled(videos.map(v=>v.play()));
  if(results.some(r=>r.status==='rejected')){videos.forEach(v=>v.pause());together=false;resetButton();status.textContent='Браузер ограничил одновременный запуск. Используйте кнопку воспроизведения в каждом плеере.';return;}
  compare.textContent='Остановить сравнение ‖';status.textContent='Оба ролика запущены с начала без звука. На телефоне второй плеер находится ниже.';
});

const showcase=document.getElementById('showcase');
const showcaseVideo=document.getElementById('showcase-video');
const streamButton=document.getElementById('launch-stream');
const streamDialog=document.getElementById('stream-dialog');
const streamFrame=document.getElementById('stream-frame');
const streamPlaceholder=document.getElementById('stream-placeholder');
const streamStatus=document.getElementById('stream-status');
const closeStream=document.getElementById('close-stream');
const backToVideo=document.getElementById('back-to-video');
const streamUrl=(showcase?.dataset.streamUrl||'').trim();

showcase?.classList.toggle('stream-ready',Boolean(streamUrl));
if(streamUrl){
  streamButton.innerHTML='Запустить интерактив <span aria-hidden="true">↗</span>';
  streamStatus.textContent='Интерактивная GPU-сессия готова к запуску.';
}

const openStream=()=>{
  showcaseVideo?.pause();
  streamButton.setAttribute('aria-expanded','true');
  if(streamUrl){
    streamFrame.src=streamUrl;
    streamFrame.hidden=false;
    streamPlaceholder.hidden=true;
    streamStatus.textContent='Интерактивная GPU-сессия настроена. Откройте её в полноэкранной панели.';
  }else{
    streamFrame.hidden=true;
    streamPlaceholder.hidden=false;
  }
  if(typeof streamDialog.showModal==='function')streamDialog.showModal();
  else streamDialog.setAttribute('open','');
};

const closeStreamPanel=()=>{
  if(streamDialog.open)streamDialog.close();
  else streamDialog.removeAttribute('open');
  streamButton.setAttribute('aria-expanded','false');
  if(streamFrame.src){streamFrame.src='about:blank';streamFrame.hidden=true;}
};

streamButton.addEventListener('click',openStream);
closeStream.addEventListener('click',closeStreamPanel);
backToVideo.addEventListener('click',closeStreamPanel);
streamDialog.addEventListener('click',event=>{if(event.target===streamDialog)closeStreamPanel();});
streamDialog.addEventListener('close',()=>{streamButton.setAttribute('aria-expanded','false');if(streamFrame.src){streamFrame.src='about:blank';streamFrame.hidden=true;}});
showcaseVideo.addEventListener('error',()=>{streamStatus.textContent='4K-файл не загрузился. Используйте ссылку «Скачать 4K-мастер» или проверьте соединение.';});
