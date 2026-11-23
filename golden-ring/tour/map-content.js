import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';

/**
 * An exhibition diagram, not a navigation map. The ten places are the cities
 * already represented by the customer's pavilion. Distances, bends, landforms
 * and monument silhouettes are deliberately schematic. No external tile service.
 * Factual labels are referenced below; interpretive craft links follow the
 * received concept of 21.10.2026 (map pp.15–18, city rooms pp.23–57).
 */
export const MAP_CONTENT_SOURCES = Object.freeze([
  {id:'concept',title:'Концепция заказчика, 21.10.2026',pages:'15–18, 23–57',type:'received-concept'},
  {id:'unesco-white',title:'ЮНЕСКО · Белокаменные памятники Владимира и Суздаля',url:'https://whc.unesco.org/en/list/633/'},
  {id:'unesco-yaroslavl',title:'ЮНЕСКО · Исторический центр Ярославля',url:'https://whc.unesco.org/en/list/1170/'},
  {id:'unesco-lavra',title:'ЮНЕСКО · Троице-Сергиева лавра',url:'https://whc.unesco.org/en/list/657/'},
  {id:'plesheevo',title:'Национальный парк «Плещеево озеро»',url:'https://www.plesheevo-lake.ru/o-parke/ozero-pleshcheevo/'},
  {id:'nero',title:'Ростовский кремль · Озеро Неро',url:'https://www.rostmuseum.ru/posetitelyam/dostoprimechatelnosti/ozero-nero/'},
  {id:'finift',title:'Ростовский кремль · Музей финифти',url:'https://www.rostmuseum.ru/events/ekspozitsiya/muzey-finifti/'},
  {id:'ivanovo-crafts',title:'Турпортал Ивановской области · Искусства и ремёсла',url:'https://visitivanovo.ru/iskusstvo-i-remesla'},
  {id:'uvod',title:'Турпортал Ивановской области · Набережная Уводи',url:'https://visitivanovo.ru/interesting/river-uvod'},
  {id:'kostroma',title:'Администрация Костромы · «Россия — Волга — Кострома»',url:'https://gradkostroma.ru/news/646313ce-2b39-4cf2-9c55-a1f30ac7f3d0.aspx'},
  {id:'fair',title:'Нижегородская ярмарка · История',url:'https://www.yarmarka.ru/about/'},
  {id:'strelka',title:'Нижегородская ярмарка · Выбор места на Стрелке',url:'https://www.yarmarka.ru/news/istoriya-mestoraspolozhenie-nizhegorodskoy-yarmarki/'},
  {id:'tver-crafts',title:'Тверской музей · Историко-бытовая коллекция',url:'https://tvermuzeum.ru/collection/items/o-kollektsii-istoriko-bytovaya-kollektsiya'},
  {id:'tver-rivers',title:'Администрация Твери · Генеральный план',url:'https://www.tver.ru/documents/gradostroitelstvo/gen-plan/'}
]);

const W=3200,H=1000,TAU=Math.PI*2;
// Actual source map-field outline, normalized Canvas coordinates (y down).
// The top is narrow: important content is composed inside this contour.
export const MAP_SURFACE_HULL = Object.freeze([
  [0,.816617],[.008301,.845426],[.018555,.880842],[.050782,.991699],[.052491,.997559],
  [.053223,1],[.947265,1],[.947997,.997803],[.949706,.992187],[.964355,.941894],
  [.975586,.903304],[.991699,.847623],[1,.818814],[.989014,.786328],[.922591,.592187],
  [.738460,.054200],[.721614,.005615],[.707210,0],[.290105,0],[.276432,.009033],
  [.267643,.034424],[.253727,.074968],[.217823,.179721],[.038087,.704768],[.005615,.8]
]);
const HULL=MAP_SURFACE_HULL.map(([x,y])=>[x*W,y*H]);
const HULL_SIGN=Math.sign(HULL.reduce((a,p,i)=>{const q=HULL[(i+1)%HULL.length];return a+p[0]*q[1]-q[0]*p[1];},0));
const CONTENT_MARGIN=24;
const semanticBounds=new WeakMap();
function noteBounds(ctx,id,x,y,w,h) {semanticBounds.get(ctx)?.push({id,x,y,w,h});}
function clearanceAt(x,y) {
  return Math.min(...HULL.map((a,i)=>{const b=HULL[(i+1)%HULL.length],dx=b[0]-a[0],dy=b[1]-a[1];
    return HULL_SIGN*(dx*(y-a[1])-dy*(x-a[0]))/Math.hypot(dx,dy);}));
}
function boundsClearance(box) {
  return Math.min(clearanceAt(box.x,box.y),clearanceAt(box.x+box.w,box.y),
    clearanceAt(box.x,box.y+box.h),clearanceAt(box.x+box.w,box.y+box.h));
}
function insetHull(distance) {
  const lines=HULL.map((p,i)=>{const q=HULL[(i+1)%HULL.length],dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);
    return {p:[p[0]-HULL_SIGN*dy/length*distance,p[1]+HULL_SIGN*dx/length*distance],d:[dx,dy]};});
  return lines.map((line,i)=>{const previous=lines[(i+lines.length-1)%lines.length];
    const cross=previous.d[0]*line.d[1]-previous.d[1]*line.d[0];
    if(Math.abs(cross)<1e-6)return line.p;
    const dx=line.p[0]-previous.p[0],dy=line.p[1]-previous.p[1];
    const t=(dx*line.d[1]-dy*line.d[0])/cross;
    return [previous.p[0]+t*previous.d[0],previous.p[1]+t*previous.d[1]];});
}
const P={ink:'#173d39',sand:'#ede2c6',paper:'#fff6dd',gold:'#a87327',lightGold:'#ddbf7b',water:'#397f91',waterLight:'#a9d6d4',green:'#6e8970',red:'#9d4938',line:'#c8b992'};
const THEMES=Object.freeze({
  cities:{title:'Города',heading:'Города экспозиции',color:P.gold,legend:'Золотая линия — связи городов в экспозиции',intro:'Десять городов, представленных в павильоне. Выберите название на поле или город в списке.',detail:'Знакомство с городами и сюжетами залов; схема не задаёт автомобильный маршрут.'},
  rivers:{title:'Реки',heading:'Вода связывает города',color:P.water,legend:'Синие линии — реки · голубые поля — озёра',intro:'Волга, Ока, Клязьма, Уводь, Которосль; рядом — озёра Неро и Плещеево.',detail:'Изгибы рек условны. Сравните города у слияния рек и города на озёрных берегах.'},
  nature:{title:'Природа',heading:'Озёра, берега и леса',color:'#4d7150',legend:'Деревья — образ леса · волны — вода',intro:'Плещеево озеро, озеро Неро и волжские берега связывают природные и городские пейзажи.',detail:'Зелёные пятна — иллюстрации ландшафта, а не границы лесов или охраняемых территорий.'},
  trade:{title:'Торговля',heading:'От речной пристани к ярмарке',color:'#a45c30',legend:'Пунктир — тематические связи · значок — товарный сюжет',intro:'Волжская торговля, костромские ряды, ивановский текстиль и Нижегородская ярмарка.',detail:'Линии связывают сюжеты экспозиции; это не реконструкция исторических торговых маршрутов.'},
  crafts:{title:'Ремёсла',heading:'Материал, рука, узор',color:'#9b4f3e',legend:'Медальоны — темы ремёсел городских залов',intro:'Эмаль Ростова, текстиль Иванова, белокаменная резьба, ремесленные темы залов.',detail:'Сравните материал и приём: камень, нить, эмаль, дерево. Некоторые связи заданы сценарием павильона.'},
  architecture:{title:'Архитектура',heading:'Узнаваемые силуэты',color:'#58656e',legend:'Силуэты памятников условны; название указывает объект',intro:'Лавра, кремли, белокаменные соборы, исторический центр Ярославля и торговые ансамбли.',detail:'Рисунки показывают тип архитектуры, а не обмерные модели зданий.'}
});
const fact=(tag,text,source='concept')=>({tag,text,source});
export const MAP_CITIES=Object.freeze([
  {id:'tver',title:'Тверь',x:740,y:460,labelY:395,number:'01',symbol:'belltower',
   portrait:'Вода и путешествие — главные темы тверского зала.',source:'concept',
   facts:{
     rivers:fact('Волга · Тверца · Тьмака','В пределах Твери в Волгу впадают Тверца и Тьмака. Водные связи помогают прочитать расположение города.','tver-rivers'),
     nature:fact('Волжские берега','Тверской зал связывает водные пейзажи, память о Калязине и путешествие Афанасия Никитина.'),
     trade:fact('Путешествие и обмен','В сценарии тверского зала история путешествия связывает воду, города и встречу культур.'),
     crafts:fact('Ткани и местные ремёсла','В коллекции Тверского музея есть ткани местных мануфактур и изделия региональных ремесленников.','tver-crafts'),
     architecture:fact('Калязинская колокольня','В тверском зале павильона узнаваемый архитектурный образ — колокольня в Калязине. Это объект области, а не города Твери.')
   }},
  {id:'sergiev-posad',title:'Сергиев Посад',x:480,y:725,labelY:660,number:'02',symbol:'church',
   portrait:'Троице-Сергиева лавра — архитектурный и духовный центр городского сюжета.',source:'unesco-lavra',
   facts:{
     rivers:fact('Вода в общей схеме','Этот город сопоставлен с волжскими и озёрными городами экспозиции. Синие линии не обозначают судоходный путь к лавре.'),
     nature:fact('Холм Маковец','Лавра выросла на холме Маковец; ландшафт и архитектурный ансамбль воспринимаются вместе.','unesco-lavra'),
     trade:fact('Город и паломничество','Лавра — центр паломничества. В этом слое она сопоставлена с городами речного торга.','unesco-lavra'),
     crafts:fact('Колокол · образ · рука','В сергиево-посадском зале концепции ремесленная и духовная темы соединяются с образом соборного звона.'),
     architecture:fact('Троице-Сергиева лавра','Архитектурный ансамбль лавры включён в Список всемирного наследия ЮНЕСКО.','unesco-lavra')
   }},
  {id:'pereslavl',title:'Переславль-Залесский',x:1110,y:580,labelY:645,number:'03',symbol:'church',
   portrait:'Переславль и Плещеево озеро соединяют культурную и природную историю.',source:'plesheevo',
   facts:{
     rivers:fact('Плещеево озеро · Трубеж','Трубеж впадает в Плещеево озеро у Переславля; вода из озера уходит по Вексе.','plesheevo'),
     nature:fact('Национальный парк','Плещеево озеро и его окрестности составляют природно-исторический комплекс национального парка.','plesheevo'),
     trade:fact('Озеро и перекрёсток путей','Официальная история парка связывает известность Плещеева озера с пересечением древних торговых путей.','plesheevo'),
     crafts:fact('Вода и мастерство','В павильоне переславский сюжет включён в тему воды и путешествия. Здесь предложено сравнить материалы речного быта.'),
     architecture:fact('Город у озера','В этом слое Переславль показан как исторический город в природном окружении Плещеева озера.','plesheevo')
   }},
  {id:'rostov',title:'Ростов',x:1370,y:435,labelY:370,number:'04',symbol:'kremlin',
   portrait:'Ростовский кремль, озеро Неро и финифть складываются в единый городской портрет.',source:'nero',
   facts:{
     rivers:fact('Озеро Неро','Ростов расположен у озера Неро. Из озера вытекает одна река — Векса.','nero'),
     nature:fact('Берега озера Неро','Озеро Неро — памятник природы. Его береговой пейзаж связан с панорамой Ростова.','nero'),
     trade:fact('Ремесленный предмет','Ростовская финифть позволяет увидеть, как искусство миниатюры становится украшением, памятным и бытовым предметом.','finift'),
     crafts:fact('Финифть · живопись на эмали','Ростовская финифть — миниатюрная роспись по эмали; в музейной коллекции представлены разные этапы развития промысла.','finift'),
     architecture:fact('Ростовский кремль','Архитектура кремля, звонница и озёрный пейзаж формируют узнаваемую панораму Ростова.','nero')
   }},
  {id:'yaroslavl',title:'Ярославль',x:1660,y:280,labelY:215,number:'05',symbol:'church',
   portrait:'Исторический центр у слияния Волги и Которосли — городская тема Ярославля.',source:'unesco-yaroslavl',
   facts:{
     rivers:fact('Волга + Которосль','Исторический центр Ярославля расположен у слияния Волги и Которосли.','unesco-yaroslavl'),
     nature:fact('Речная панорама','Встреча Волги и Которосли создаёт характерный речной пейзаж исторического центра.','unesco-yaroslavl'),
     trade:fact('Волжский торговый город','ЮНЕСКО описывает развитие Ярославля как крупного торгового центра, связанного с речным положением.','unesco-yaroslavl'),
     crafts:fact('Архитектура и роспись','Слой предлагает рассмотреть связь архитектуры исторического центра и монументального искусства.','unesco-yaroslavl'),
     architecture:fact('Исторический центр','Исторический центр Ярославля включён в Список всемирного наследия ЮНЕСКО.','unesco-yaroslavl')
   }},
  {id:'kostroma',title:'Кострома',x:2180,y:365,labelY:300,number:'06',symbol:'arcade',
   portrait:'Волга, торговые ряды и ремесленные темы — опорные сюжеты костромского зала.',source:'kostroma',
   facts:{
     rivers:fact('Волга','Волжская набережная связывает виды исторических ансамблей Костромы.','kostroma'),
     nature:fact('Волжской берег','В этом слое Кострома представлена речным берегом и панорамой города над водой.','kostroma'),
     trade:fact('Торговые ряды','Торговые ряды входят в основные исторические архитектурные ансамбли Костромы.','kostroma'),
     crafts:fact('Филигрань · ремесленный сюжет','В концепции костромского зала есть тема филиграни. На карте она показана тонким металлическим узором.'),
     architecture:fact('Ряды и пожарная каланча','Торговые ряды и пожарная каланча — два узнаваемых ансамбля городского центра.','kostroma')
   }},
  {id:'ivanovo',title:'Иваново',x:2400,y:560,labelX:2550,labelY:480,number:'07',symbol:'factory',
   portrait:'Текстиль, фабричная среда и орнамент формируют ивановский сюжет.',source:'ivanovo-crafts',
   facts:{
     rivers:fact('Река Уводь','Ивановские фабрики строились на берегах Уводи: вода была нужна для производства и окрашивания тканей.','uvod'),
     nature:fact('Городская река','Берег Уводи показывает, как водный ландшафт связан с фабричным городом.','uvod'),
     trade:fact('Текстиль','Ивановские мануфактуры и торговля тканями раскрывают производственную сторону путешествия.','ivanovo-crafts'),
     crafts:fact('Ткачество · печатный узор','Текстильная история Иванова соседствует с ремёслами области — лаковой миниатюрой и вышивкой.','ivanovo-crafts'),
     architecture:fact('Фабрики на Уводи','Фабричные корпуса у реки — характерный архитектурный образ Иванова.','uvod')
   }},
  {id:'suzdal',title:'Суздаль',x:1950,y:690,labelY:750,number:'08',symbol:'church',
   portrait:'Кремль, монастыри и белокаменные памятники определяют архитектурный сюжет Суздаля.',source:'unesco-white',
   facts:{
     rivers:fact('Каменка','Суздаль расположен на Каменке; её изгибы сопровождают городской исторический ландшафт.','unesco-white'),
     nature:fact('Памятник и ландшафт','ЮНЕСКО отмечает гармонию памятников Владимиро-Суздальской земли с окружающим ландшафтом.','unesco-white'),
     trade:fact('Ремесло и городской посад','У исторического центра Суздаля развивался посад ремесленников и торговцев.','unesco-white'),
     crafts:fact('Белокаменная резьба','Слой показывает белый камень и тонкую резьбу — признаки Владимиро-Суздальской архитектурной школы.','unesco-white'),
     architecture:fact('Суздальский кремль','Кремль и Рождественский собор входят в ансамбль белокаменных памятников всемирного наследия.','unesco-white')
   }},
  {id:'vladimir',title:'Владимир',x:1580,y:750,labelY:810,number:'09',symbol:'gate',
   portrait:'Белокаменная архитектура и история княжеской столицы — темы владимирского зала.',source:'unesco-white',
   facts:{
     rivers:fact('Клязьма · Нерль','Водный слой связывает Владимиро-Суздальскую землю с Клязьмой и Нерлью; направление линий схематично.'),
     nature:fact('Белый камень и открытый пейзаж','Гармония архитектуры с природным окружением — одна из особенностей белокаменных памятников.','unesco-white'),
     trade:fact('Княжеский город','В сценарии павильона Владимир раскрывается через историю столицы. На карте он соединён с темами других городов.'),
     crafts:fact('Камень · резьба · пропорция','Для белокаменных памятников характерны известняковые блоки, тонкая резьба и выверенные пропорции.','unesco-white'),
     architecture:fact('Соборы и Золотые ворота','Успенский и Дмитриевский соборы, Золотые ворота представляют белокаменную школу Владимира.','unesco-white')
   }},
  {id:'nizhny-novgorod',title:'Нижний Новгород',x:2760,y:750,labelY:810,number:'10',symbol:'fair',
   portrait:'Ярмарка на встрече двух рек — главный сюжет нижегородского зала.',source:'fair',
   facts:{
     rivers:fact('Ока + Волга','Стрелка — место слияния Оки и Волги. Это положение было важно для размещения ярмарки.','strelka'),
     nature:fact('Встреча двух рек','Слияние Оки и Волги создаёт основную природную панораму Нижнего Новгорода.','strelka'),
     trade:fact('Нижегородская ярмарка','Торговый ансамбль на Стрелке связывал речную доставку товаров, склады и ярмарочную торговлю.','fair'),
     crafts:fact('Городецкая роспись','В нижегородском зале концепции ремесленная тема представлена в том числе городецкой росписью.'),
     architecture:fact('Главный ярмарочный дом','Главный ярмарочный дом — архитектурный образ торгового ансамбля Нижегородской ярмарки.','fair')
   }}
]);
export const MAP_CITY_OPTIONS=Object.freeze([{id:'all',title:'Все города'},...MAP_CITIES.map(c=>({id:c.id,title:c.title}))]);
const cityById=new Map(MAP_CITIES.map(c=>[c.id,c]));
export function mapSelectionInfo(layer='cities',city='all') {
  const theme=THEMES[layer]||THEMES.cities,selected=cityById.get(city);
  if(!selected)return {title:theme.heading,tag:theme.title,text:theme.intro,sourceIds:['concept'],city:null};
  const item=selected.facts[layer]||fact('Город экспозиции',selected.portrait,selected.source);
  return {title:selected.title,tag:item.tag,text:item.text,sourceIds:[item.source],city:selected.id};
}
export function mapSelectionSummary(layer,city) {
  const info=mapSelectionInfo(layer,city);return info.title+' · '+info.tag+'. '+info.text;
}
function shape(ctx,points,close=false) {ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));if(close)ctx.closePath();}
function stroke(ctx,points,color,width=4,dash=[]) {ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin=ctx.lineCap='round';ctx.setLineDash(dash);shape(ctx,points);ctx.stroke();ctx.restore();}
function circle(ctx,x,y,r,fill,outline=null,width=2) {ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=fill;ctx.fill();if(outline){ctx.strokeStyle=outline;ctx.lineWidth=width;ctx.stroke();}}
function rounded(ctx,x,y,w,h,r=18) {ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function label(ctx,text,x,y,size=32,color=P.ink,align='left',serif=false) {
  ctx.font=(serif?'500 ':'600 ')+size+'px '+(serif?'Georgia, serif':'Arial, sans-serif');
  ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillStyle=color;
  const metrics=ctx.measureText(text),left=align==='center'?x-metrics.width/2:align==='right'?x-metrics.width:x;
  const ascent=metrics.actualBoundingBoxAscent||size,descent=metrics.actualBoundingBoxDescent||size*.24;
  noteBounds(ctx,'text:'+text,left,y-ascent,metrics.width,ascent+descent);
  ctx.fillText(text,x,y);
}
function textLines(ctx,text,x,y,width,size=29,lineHeight=37,maxLines=3,color=P.ink) {
  ctx.font=size+'px Arial, sans-serif';ctx.textAlign='left';ctx.fillStyle=color;
  noteBounds(ctx,'paragraph:'+text.slice(0,35),x,y-size,width,(maxLines-1)*lineHeight+size*1.25);
  const words=text.split(/\s+/);let line='',row=0;
  for(const word of words){const test=line?line+' '+word:word;
    if(ctx.measureText(test).width>width&&line){ctx.fillText(line,x,y+row*lineHeight);row++;line=word;if(row>=maxLines)break;}else line=test;
  }
  if(row<maxLines)ctx.fillText(line,x,y+row*lineHeight);
}
function landmark(ctx,type,x,y,size=58,color=P.ink) {
  noteBounds(ctx,'landmark:'+type,x-size,y-size*2.1,size*2,size*2.1);
  ctx.save();ctx.translate(x,y);ctx.scale(size/60,size/60);ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2.5;
  if(type==='belltower'){
    ctx.fillRect(-31,-19,62,19);ctx.fillRect(-23,-44,46,25);ctx.fillRect(-17,-67,34,23);ctx.fillRect(-10,-90,20,23);
    shape(ctx,[[-14,-90],[0,-113],[14,-90]],true);ctx.fill();ctx.fillRect(-1.5,-125,3,13);ctx.fillRect(-7,-120,14,3);
    ctx.fillStyle=P.paper;for(const [w,y] of [[12,-14],[9,-37],[6,-61],[4,-85]]){ctx.beginPath();ctx.arc(0,y,w,Math.PI,0);ctx.lineTo(w,y+8);ctx.lineTo(-w,y+8);ctx.fill();}
  }else if(type==='factory'){
    shape(ctx,[[-45,0],[-45,-32],[-20,-46],[-20,-32],[5,-46],[5,-32],[27,-46],[27,0]],true);ctx.fill();
    ctx.fillRect(30,-72,12,72);ctx.fillStyle=P.paper;for(let i=-34;i<25;i+=19)ctx.fillRect(i,-21,8,11);
  }else if(type==='arcade'||type==='fair'){
    ctx.fillRect(-50,-37,100,37);shape(ctx,[[-57,-37],[0,-61],[57,-37]],true);ctx.fill();
    if(type==='fair'){ctx.fillRect(-10,-70,20,33);shape(ctx,[[-15,-70],[0,-90],[15,-70]],true);ctx.fill();}
    ctx.fillStyle=P.paper;for(let i=-36;i<=36;i+=24){ctx.beginPath();ctx.arc(i,-18,8,Math.PI,0);ctx.lineTo(i+8,0);ctx.lineTo(i-8,0);ctx.fill();}
  }else if(type==='gate'){
    ctx.fillRect(-45,-36,90,36);ctx.fillRect(-30,-63,60,28);ctx.fillRect(-13,-79,26,17);
    ctx.beginPath();ctx.ellipse(0,-84,13,10,0,0,TAU);ctx.fill();ctx.fillRect(-2,-108,4,17);ctx.fillRect(-8,-101,16,3);
    ctx.fillStyle=P.paper;ctx.beginPath();ctx.arc(0,-20,14,Math.PI,0);ctx.lineTo(14,0);ctx.lineTo(-14,0);ctx.fill();
  }else{
    const towers=type==='kremlin'?[-38,0,38]:[-28,0,28];
    ctx.fillRect(-50,-24,100,24);
    towers.forEach((tx,i)=>{const tall=i===1?65:44;ctx.fillRect(tx-10,-tall,20,tall);
      ctx.beginPath();ctx.moveTo(tx,-tall-27);ctx.bezierCurveTo(tx+5,-tall-15,tx+18,-tall-13,tx+12,-tall-5);ctx.lineTo(tx-12,-tall-5);ctx.bezierCurveTo(tx-18,-tall-13,tx-5,-tall-15,tx,-tall-27);ctx.fill();
      ctx.fillRect(tx-1.5,-tall-38,3,13);ctx.fillRect(tx-6,-tall-34,12,3);
    });
    ctx.fillStyle=P.paper;ctx.fillRect(-6,-25,12,25);ctx.fillRect(-33,-22,8,12);ctx.fillRect(25,-22,8,12);
  }
  ctx.restore();
}
function craft(ctx,type,x,y,size=35,color=P.red) {
  ctx.save();ctx.translate(x,y);ctx.scale(size/35,size/35);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3;
  if(type==='rostov'){for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*TAU/6);ctx.beginPath();ctx.ellipse(0,-13,7,14,0,0,TAU);ctx.stroke();ctx.restore();}circle(ctx,0,0,5,color);}
  else if(type==='ivanovo'||type==='tver'){ctx.strokeRect(-24,-22,48,44);for(let i=-16;i<25;i+=8){stroke(ctx,[[i,-22],[i,22]],color,2);stroke(ctx,[[-24,i],[24,i]],color,2);}shape(ctx,[[0,-13],[13,0],[0,13],[-13,0]],true);ctx.fill();}
  else if(type==='kostroma'){for(let i=-1;i<2;i++){ctx.beginPath();ctx.ellipse(i*14,0,12,23,i*.6,0,TAU);ctx.stroke();}circle(ctx,0,0,4,color);}
  else if(type==='vladimir'||type==='suzdal'){ctx.strokeRect(-25,-20,50,40);stroke(ctx,[[-25,0],[25,0]],color,2);stroke(ctx,[[0,-20],[0,0]],color,2);stroke(ctx,[[-13,0],[-13,20]],color,2);stroke(ctx,[[13,0],[13,20]],color,2);}
  else if(type==='nizhny-novgorod'){for(let i=0;i<5;i++){ctx.save();ctx.rotate(i*TAU/5);circle(ctx,0,-16,9,color);ctx.restore();}circle(ctx,0,0,8,P.paper);}
  else{ctx.beginPath();ctx.moveTo(-19,16);ctx.bezierCurveTo(-34,-9,-4,-26,0,-30);ctx.bezierCurveTo(4,-26,34,-9,19,16);ctx.closePath();ctx.stroke();stroke(ctx,[[-23,18],[23,18]],color,3);}
  ctx.restore();
}
function tree(ctx,x,y,s=1,color=P.green){noteBounds(ctx,'tree',x-25*s,y-35*s,50*s,63*s);ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle=color;
  shape(ctx,[[0,-35],[19,-5],[9,-5],[25,15],[3,15],[3,28],[-3,28],[-3,15],[-25,15],[-9,-5],[-19,-5]],true);ctx.fill();ctx.restore();}
const at=id=>{const c=cityById.get(id);return[c.x,c.y];};
const RIVERS=[
  {id:'volga',name:'Волга',width:16,points:[[640,430],at('tver'),[1050,300],[1320,260],[1500,255],at('yaroslavl'),[1900,330],at('kostroma'),[2450,420],[2630,545],[2760,660],at('nizhny-novgorod'),[2970,820]]},
  {id:'oka',name:'Ока',width:13,points:[[2240,855],[2470,840],[2580,825],[2660,800],at('nizhny-novgorod')]},
  {id:'klyazma',name:'Клязьма',width:8,points:[[950,800],[1250,795],at('vladimir'),[1810,800],[2160,820],[2470,840]]},
  {id:'kotorosl',name:'Которосль',width:6,points:[[1380,480],[1460,430],[1580,370],at('yaroslavl')]},
  {id:'uvod',name:'Уводь',width:6,points:[[2340,455],at('ivanovo'),[2470,690],[2350,832]]},
  {id:'nerl',name:'Нерль',width:5,points:[[2205,485],[2205,600],[2185,680],[2190,750],[2200,823]]},
  {id:'kamenka',name:'Каменка',width:5,points:[[2010,620],at('suzdal'),[2110,720],[2190,750]]}
];
function waterways(ctx,active=false){
  for(const river of RIVERS){stroke(ctx,river.points,active?'#f9f3dd':'#e5debd',river.width+10);stroke(ctx,river.points,active?P.water:'#82aaa5',river.width);
    if(active)stroke(ctx,river.points,'#afd9d7',Math.max(2,river.width*.28));}
  for(const [x,y,rx,ry] of [[1025,520,65,40],[1335,485,70,35]]) {
    ctx.beginPath();ctx.ellipse(x,y,rx,ry,-.24,0,TAU);ctx.fillStyle=active?'#91c7ce':'#afd0c5';ctx.fill();ctx.strokeStyle='#698f88';ctx.lineWidth=2;ctx.stroke();
    if(active){ctx.beginPath();ctx.ellipse(x,y,rx*.76,ry*.63,-.24,0,TAU);ctx.strokeStyle='#d5e9db';ctx.stroke();}
  }
  if(active){label(ctx,'В О Л Г А',1210,240,28,P.water,'center');label(ctx,'В О Л Г А',2490,407,28,P.water,'center');
    label(ctx,'О К А',2550,780,27,P.water,'center');label(ctx,'Клязьма',2050,852,26,P.water,'center');
    label(ctx,'Которосль',1500,450,24,P.water,'center');label(ctx,'Уводь',2520,560,24,P.water);
    label(ctx,'Нерль',2110,620,24,P.water);label(ctx,'Каменка',1770,650,24,P.water);label(ctx,'оз. Плещеево',1025,477,23,P.water,'center');label(ctx,'оз. Неро',1320,535,23,P.water,'center');}
}
function landscape(ctx,emphasis=false){
  const clusters=[[500,650,130,65],[780,510,110,50],[1110,740,130,45],[1570,570,125,48],[1980,455,110,45],[2440,290,115,40],[2670,550,100,50]];
  for(let n=0;n<clusters.length;n++){
    const [x,y,rx,ry]=clusters[n];ctx.beginPath();ctx.ellipse(x,y,rx,ry,-.25,0,TAU);ctx.fillStyle=emphasis?'#c0c6a2':'#d9d7b7';ctx.fill();
    for(let i=0;i<7;i++)tree(ctx,x+(i-3)*rx*.23,y+Math.sin(i*2+n)*ry*.3,emphasis?.80:.48,emphasis?'#688466':'#a3ac89');
  }
  if(emphasis){label(ctx,'ЛЕСНЫЕ ПЕЙЗАЖИ',400,740,27,'#577352','center');
    label(ctx,'ОЗЁРНЫЕ БЕРЕГА',1510,675,27,'#577352','center');label(ctx,'ВОЛЖСКИЕ ПАНОРАМЫ',2280,220,25,'#577352','center');}
}
function boat(ctx,x,y,scale=1){noteBounds(ctx,'boat',x-40*scale,y-55*scale,82*scale,80*scale);ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.fillStyle=P.ink;
  shape(ctx,[[-40,5],[42,5],[26,25],[-24,25]],true);ctx.fill();stroke(ctx,[[0,3],[0,-55]],P.ink,3);
  shape(ctx,[[4,-52],[35,-4],[4,-4]],true);ctx.fillStyle='#d0a95d';ctx.fill();shape(ctx,[[-4,-43],[-31,-4],[-4,-4]],true);ctx.fillStyle=P.paper;ctx.fill();ctx.restore();}
function tradeDecor(ctx){
  stroke(ctx,[at('tver'),at('yaroslavl'),at('kostroma'),at('nizhny-novgorod')],'#a97534',7,[12,16]);
  stroke(ctx,[at('ivanovo'),at('nizhny-novgorod')],'#a97534',7,[12,16]);
  boat(ctx,1200,300,.9);boat(ctx,2590,525,.9);
  for(const [x,y] of [[2120,465],[2750,655]]){noteBounds(ctx,'trade-crate',x-33,y-22,66,44);ctx.save();ctx.translate(x,y);ctx.fillStyle='#bb8855';ctx.fillRect(-33,-22,66,44);ctx.strokeStyle='#6f492b';ctx.lineWidth=3;ctx.strokeRect(-33,-22,66,44);stroke(ctx,[[-33,-22],[33,22]],'#6f492b',3);stroke(ctx,[[33,-22],[-33,22]],'#6f492b',3);ctx.restore();}
}
function themeTag(city,layer){return layer==='cities'?city.portrait.split(' — ')[0].split(' формируют')[0]:city.facts[layer]?.tag||'';}
function shortTag(city,layer){
  const tags={
    cities:['Вода и путешествие','Лавра','Плещеево озеро','Кремль и финифть','Исторический центр','Торговые ряды','Текстиль','Белокаменный ансамбль','Княжеская столица','Ярмарка'],
    rivers:['Волга · Тверца · Тьмака','Город экспозиции','Плещеево · Трубеж','Озеро Неро','Волга + Которосль','Волга','Уводь','Каменка','Клязьма · Нерль','Ока + Волга'],
    nature:['Волжской берег','Холм Маковец','Национальный парк','Озёрный ландшафт','Речная панорама','Берег Волги','Городская река','Исторический пейзаж','Белый камень и ландшафт','Встреча двух рек'],
    trade:['Путешествие','Паломнический центр','Перекрёсток путей','Ремесленный предмет','Волжский торг','Торговые ряды','Ткани','Городской посад','Княжеский город','Нижегородская ярмарка'],
    crafts:['Ткань и узор','Колокол и образ','Речные истории','Финифть','Монументальное искусство','Филигрань','Ткачество','Белокаменная резьба','Камень и резьба','Городецкая роспись'],
    architecture:['Калязин · область','Троице-Сергиева лавра','Город у озера','Ростовский кремль','Исторический центр','Ряды и каланча','Фабричные корпуса','Суздальский кремль','Соборы и ворота','Ярмарочный дом']
  };
  return tags[layer]?.[MAP_CITIES.indexOf(city)]||'';
}
const labelBounds=new Map();
export function pickMapCity(uv,uniforms={}) {
  if(!uv||!Number.isFinite(uv.x)||!Number.isFinite(uv.y))return null;
  const value=(name,fallback)=>uniforms[name]?.value??fallback;
  let u=uv.x,v=value('uFlip',0)>.5?1-uv.y:uv.y;
  const panel=value('uAspect',3.2),image=value('uImageAspect',3.2),fit=value('uFit',1)>.5;
  u=(u-.5)*(fit?Math.max(1,panel/image):Math.min(1,panel/image))+.5;
  v=(v-.5)*(fit?Math.max(1,image/panel):Math.min(1,image/panel))+.5;
  if(u<0||u>1||v<0||v>1)return null;
  const x=u*W,y=(1-v)*H;
  for(const city of MAP_CITIES){
    if(Math.hypot(x-city.x,(y-city.y)*1.15)<58)return city.id;
    const box=labelBounds.get(city.id)||{x:(city.labelX??city.x)-220,y:city.labelY-44,w:440,h:83};
    if(x>=box.x&&x<=box.x+box.w&&y>=box.y&&y<=box.y+box.h)return city.id;
  }
  return null;
}
export function createMapAtlas(renderer,aspect=3.2) {
  const maxSize=Math.max(1024,renderer.capabilities.maxTextureSize||4096),width=Math.min(4096,maxSize);
  const targetAspect=Math.max(2.7,Math.min(3.7,aspect||3.2)),height=Math.round(width/targetAspect);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{alpha:false}),texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  texture.name='GoldenRing_ExhibitionMap_Atlas';texture.userData={type:'exhibition-diagram',version:2};
  let state={layer:'cities',city:'all'},drawCount=0,layoutBoxes=[];
  function draw(layer='cities',city='all'){
    layer=THEMES[layer]?layer:'cities';city=cityById.has(city)?city:'all';state={layer,city};drawCount++;
    const theme=THEMES[layer],selected=cityById.get(city),info=mapSelectionInfo(layer,city);
    layoutBoxes=[];semanticBounds.set(ctx,layoutBoxes);
    ctx.setTransform(width/W,0,0,height/H,0,0);ctx.clearRect(0,0,W,H);
    const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#f6edd6');bg.addColorStop(.52,'#e6d7b4');bg.addColorStop(1,'#efe4c9');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    // Quiet sand grain and engraved bands. Decorative, never geographic relief.
    for(let i=0;i<1600;i++){const x=((i*109.7)%W),y=((i*167.3)%H);ctx.fillStyle=i%2?'rgba(112,89,48,.045)':'rgba(255,255,255,.12)';ctx.fillRect(x,y,2+(i%3),1);}
    ctx.save();ctx.strokeStyle='rgba(139,112,58,.09)';ctx.lineWidth=1.4;
    for(let i=0;i<20;i++){ctx.beginPath();ctx.moveTo(70,180+i*32);ctx.bezierCurveTo(650,110+i*39,2200,290+i*22,3130,190+i*32);ctx.stroke();}ctx.restore();
    ctx.strokeStyle='#b8a678';ctx.lineWidth=3;shape(ctx,insetHull(22),true);ctx.stroke();
    landscape(ctx,layer==='nature');waterways(ctx,layer==='rivers'||layer==='nature');
    const ring=['sergiev-posad','pereslavl','rostov','yaroslavl','kostroma','ivanovo','suzdal','vladimir','sergiev-posad'].map(id=>{const c=cityById.get(id);return[c.x,c.y];});
    if(layer==='cities'||layer==='architecture'){stroke(ctx,ring,'#fcf3d8',13);stroke(ctx,ring,P.gold,6);
      stroke(ctx,[at('tver'),at('sergiev-posad')],P.gold,5,[9,12]);stroke(ctx,[at('suzdal'),at('nizhny-novgorod')],P.gold,5,[9,12]);}
    if(layer==='trade')tradeDecor(ctx);
    // Typography backplate keeps labels distinct from landscape and line work.
    for(const c of MAP_CITIES){
      const active=c.id===city,focused=city==='all'||active;
      if(layer==='architecture'||layer==='cities')landmark(ctx,c.symbol,c.x,c.labelY<c.y?c.y+(layer==='architecture'?110:80):c.y-30,layer==='architecture'?58:39,focused?P.ink:'#73857b');
      if(layer==='crafts'){
        const craftY=c.y+(c.labelY<c.y?78:-74);
        noteBounds(ctx,'craft:'+c.id,c.x-52,craftY-52,104,104);
        circle(ctx,c.x,craftY,49,active?P.paper:'#f7e9cd',theme.color,active?5:2);
        craft(ctx,c.id,c.x,craftY,32,theme.color);
      }
      noteBounds(ctx,'marker:'+c.id,c.x-(active?46:27),c.y-(active?46:27),active?92:54,active?92:54);
      if(active){circle(ctx,c.x,c.y,43,'#f9edce',theme.color,5);circle(ctx,c.x,c.y,29,theme.color);}
      else circle(ctx,c.x,c.y,24,focused?P.paper:'#e4dbbd',theme.color,3);
      label(ctx,c.number,c.x,c.y+8,active?23:20,active?P.paper:theme.color,'center');
      const titleSize=c.id==='pereslavl'?35:c.id==='nizhny-novgorod'?36:40;
      ctx.font='600 '+titleSize+'px Arial, sans-serif';
      const textWidth=ctx.measureText(c.title).width+32;
      const labelX=c.labelX??c.x;
      const x=labelX-textWidth/2,y=c.labelY-41;
      labelBounds.set(c.id,{x:x-8,y:y-8,w:textWidth+16,h:94});
      noteBounds(ctx,'city-label:'+c.id,x-8,y-8,textWidth+16,94);
      ctx.fillStyle=active?'#153d38':'rgba(249,240,216,.94)';rounded(ctx,x,y,textWidth,52,9);ctx.fill();
      label(ctx,c.title,labelX,c.labelY-4,titleSize,active?P.paper:P.ink,'center');
      const tag=shortTag(c,layer);ctx.font='500 25px Arial, sans-serif';
      const tagWidth=ctx.measureText(tag).width+24;noteBounds(ctx,'city-topic:'+c.id,labelX-tagWidth/2,c.labelY+4,tagWidth,36);ctx.fillStyle='rgba(249,240,216,.90)';rounded(ctx,labelX-tagWidth/2,c.labelY+4,tagWidth,36,7);ctx.fill();
      label(ctx,tag,labelX,c.labelY+30,25,theme.color,'center');
    }
    // The original field narrows at its back. Center the complete title in
    // that trapezoid, and keep the information strip inside its front bevels.
    noteBounds(ctx,'header',1040,48,1120,120);
    ctx.fillStyle='rgba(246,237,213,.98)';rounded(ctx,1040,48,1120,120,17);ctx.fill();
    label(ctx,'ЗОЛОТОЕ КОЛЬЦО · ГОРОДА ЭКСПОЗИЦИИ',1600,82,24,P.gold,'center');
    label(ctx,theme.heading,1600,127,43,P.ink,'center',true);
    label(ctx,theme.title.toUpperCase()+' · 10 ГОРОДОВ',1450,155,21,P.ink,'center');
    Object.keys(THEMES).forEach((key,i)=>circle(ctx,1800+i*29,149,key===layer?7:4,key===layer?P.gold:'#b7bc9f'));
    // Both explanatory lines are fully inside the physical front edge.
    label(ctx,theme.legend,250,877,23,'#526154');
    label(ctx,'СХЕМА · РАССТОЯНИЯ И ФОРМЫ УСЛОВНЫ',2945,877,20,'#68735f','right');
    noteBounds(ctx,'information-strip',230,898,2740,74);
    ctx.fillStyle='#183e38';rounded(ctx,230,898,2740,74,17);ctx.fill();
    label(ctx,selected?selected.title:'Выберите город',265,932,selected&&selected.title.length>17?30:34,P.paper,'left',true);
    label(ctx,selected?info.tag:theme.title+' · нажмите на название',265,960,21,'#dbc48f');
    textLines(ctx,selected?info.text:theme.intro,1250,932,1650,25,29,2,'#f0ead4');
    texture.needsUpdate=true;
  }
  draw();
  return {
    texture,draw,aspect:width/height,
    pick:(uv,uniforms)=>pickMapCity(uv,uniforms),
    snapshot:()=>({version:2,kind:'exhibition-diagram',theme:state.layer,selectedCity:state.city,
      atlas:{width,height,aspect:width/height},cityCount:MAP_CITIES.length,labels:MAP_CITIES.map(c=>c.title),
      layerCount:Object.keys(THEMES).length,waterLabels:state.layer==='rivers'||state.layer==='nature'?10:0,
      sourceCount:MAP_CONTENT_SOURCES.length,drawCount,
      layout:{version:2,sourceSurface:'map-surface',contentMargin:CONTENT_MARGIN,hull:MAP_SURFACE_HULL,
        minClearance:Math.min(...layoutBoxes.map(boundsClearance)),
        violations:layoutBoxes.map(box=>({...box,clearance:boundsClearance(box)})).filter(box=>box.clearance<CONTENT_MARGIN),
        boxes:layoutBoxes.map(box=>({...box,clearance:boundsClearance(box)}))},
      selected:mapSelectionInfo(state.layer,state.city),
      cityPickPoints:MAP_CITIES.map(c=>({id:c.id,u:c.x/W,v:1-c.y/H})),
      convention:'Города экспозиции; расстояния, русла, ландшафт и силуэты условны.'})
  };
}


