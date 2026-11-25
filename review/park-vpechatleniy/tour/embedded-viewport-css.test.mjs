/** CSS cascade regression only: no browser, raster layout or WebGL rendering. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

let Window;
try{({Window}=await import('happy-dom'));}
catch(error){
  const entry=process.env.PARK_HAPPY_DOM_MODULE;
  if(!entry)throw error;
  ({Window}=await import(entry.startsWith('file:')?entry:pathToFileURL(resolve(entry)).href));
}
const html=(await readFile(new URL('./index.html',import.meta.url),'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
const css=Object.fromEntries(await Promise.all([
  ['crowd','./crowd/crowd.css'],['viewer','./viewer.css'],['walk','./walk-mode.css'],['adaptive','../adaptive-zoom.css'],['rgo','./rgo-zones.css']
].map(async([name,path])=>[name,await readFile(new URL(path,import.meta.url),'utf8')])));
const compact=value=>String(value).replace(/\s/g,'');
const viewports=[
  {width:390,height:330}, // The two panes stacked on a phone.
  {width:720,height:540}, // One half of a desktop display.
  {width:900,height:700}, // Last width affected by the adaptive layout.
  {width:901,height:700},
  {width:1440,height:900} // A full-width or fullscreen scene.
];
function fixture(viewport,embedded,order){
  const win=new Window({url:'https://fazafilms.ru/review/park-vpechatleniy/tour/',...viewport,
    settings:{disableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true,disableIframePageLoading:true}});
  win.document.write(html);
  if(embedded)win.document.documentElement.dataset.installationsWalk='true';
  for(const key of order){const style=win.document.createElement('style');style.textContent=css[key];win.document.head.append(style);}
  // The renderer changes bitmap dimensions independently of the CSS rectangle.
  const canvas=win.document.getElementById('canvas');canvas.width=2000;canvas.height=150;
  return {win,style:id=>win.getComputedStyle(win.document.getElementById(id))};
}

for(const [name,order] of [
  ['adaptive stylesheet after walking styles',['crowd','viewer','walk','adaptive','rgo']],
  ['adaptive stylesheet before walking styles',['crowd','viewer','adaptive','walk','rgo']]
]){
  test(`embedded scene keeps one full cell with ${name}`,()=>{
    for(const viewport of viewports){
      const f=fixture(viewport,true,order),label=`${viewport.width}×${viewport.height}`;
      try{
        assert.equal(compact(f.style('viewer').gridTemplateRows),'minmax(0,1fr)',label);
        assert.equal(compact(f.style('stage').gridArea),'1/1/2/2',label);
        assert.equal(f.style('stage').position,'relative',label);
        for(const id of ['viewer','stage','canvas']){
          assert.equal(f.style(id).width,'100%',`${label} ${id} width`);
          assert.equal(f.style(id).height,'100%',`${label} ${id} height`);
        }
        assert.equal(f.style('canvas').position,'absolute',label);
        assert.equal(f.win.getComputedStyle(f.win.document.querySelector('.viewer-header')).display,'none',label);
        assert.equal(f.win.getComputedStyle(f.win.document.querySelector('.viewer-toolbar')).display,'none',label);
        assert.equal(f.style('walk-media-canvas').height,'auto','The separate media player retains its natural aspect.');
        assert.notEqual(f.style('walk-media-canvas').position,'absolute','The media canvas is not the scene canvas.');
      }finally{f.win.close();}
    }
  });
  test(`standalone tour preserves its adaptive three rows with ${name}`,()=>{
    for(const viewport of viewports){
      const f=fixture(viewport,false,order),label=`${viewport.width}×${viewport.height}`;
      try{
        assert.equal(compact(f.style('viewer').gridTemplateRows),'autominmax(0,1fr)auto',label);
        assert.notEqual(f.style('canvas').position,'absolute',label);
        assert.notEqual(f.win.getComputedStyle(f.win.document.querySelector('.viewer-header')).display,'none',label);
        assert.notEqual(f.win.getComputedStyle(f.win.document.querySelector('.viewer-toolbar')).display,'none',label);
      }finally{f.win.close();}
    }
  });
}
