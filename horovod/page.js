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
