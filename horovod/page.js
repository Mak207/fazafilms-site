const showcaseVideo=document.getElementById('showcase-video');
const streamStatus=document.getElementById('stream-status');
showcaseVideo.addEventListener('error',()=>{streamStatus.textContent='4K-файл не загрузился. Используйте ссылку «Скачать 4K-мастер» или проверьте соединение.';});
