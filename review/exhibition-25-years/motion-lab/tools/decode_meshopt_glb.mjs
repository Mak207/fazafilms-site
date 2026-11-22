import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [input, output, decoderPath] = process.argv.slice(2);
if (!input || !output || !decoderPath) throw new Error('Usage: node decode_meshopt_glb.mjs input.glb output.glb decoder.mjs');
const raw = fs.readFileSync(input);
if (raw.toString('ascii',0,4)!=='glTF' || raw.readUInt32LE(4)!==2 || raw.readUInt32LE(8)!==raw.length) throw new Error('Invalid GLB header');
let doc, bin;
for (let offset=12;offset<raw.length;) {
 const size=raw.readUInt32LE(offset), type=raw.readUInt32LE(offset+4);
 const chunk=raw.subarray(offset+8,offset+8+size);
 if(type===0x4e4f534a) doc=JSON.parse(chunk.toString('utf8'));
 if(type===0x004e4942) bin=chunk;
 offset+=8+size;
}
if(!doc||!bin) throw new Error('Expected JSON and BIN chunks');
const {MeshoptDecoder}=await import(pathToFileURL(path.resolve(decoderPath)).href);
await MeshoptDecoder.ready;
const chunks=[bin]; let offset=bin.length, decoded=0;
for (const view of doc.bufferViews || []) {
 const ext=view.extensions?.EXT_meshopt_compression;
 if(!ext) {
   if(view.buffer!==0) throw new Error('External or unresolved fallback buffer');
   continue;
 }
 if(ext.buffer!==0) throw new Error('Compressed data must be in embedded buffer zero');
 if(ext.byteOffset+ext.byteLength>bin.length) throw new Error('Compressed data out of bounds');
 const bytes=new Uint8Array(ext.count*ext.byteStride);
 MeshoptDecoder.decodeGltfBuffer(bytes,ext.count,ext.byteStride,new Uint8Array(bin.buffer,bin.byteOffset+(ext.byteOffset||0),ext.byteLength),ext.mode,ext.filter);
 if(bytes.length!==view.byteLength) throw new Error('Decoded byteLength mismatch');
 const pad=(-offset)&3;
 if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
 view.buffer=0;view.byteOffset=offset;offset+=bytes.length;chunks.push(Buffer.from(bytes));
 delete view.extensions.EXT_meshopt_compression;
 if(!Object.keys(view.extensions).length)delete view.extensions;
 decoded++;
}
doc.buffers=[{byteLength:offset}];
for (const key of ['extensionsRequired','extensionsUsed']) {
 if(doc[key])doc[key]=doc[key].filter(x=>x!=='EXT_meshopt_compression');
 if(doc[key]&&!doc[key].length)delete doc[key];
}
let json=Buffer.from(JSON.stringify(doc));
json=Buffer.concat([json,Buffer.alloc((-json.length)&3,32)]);
let data=Buffer.concat(chunks);
data=Buffer.concat([data,Buffer.alloc((-data.length)&3)]);
const header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+data.length,8);
const jc=Buffer.alloc(8);jc.writeUInt32LE(json.length);jc.writeUInt32LE(0x4e4f534a,4);
const bc=Buffer.alloc(8);bc.writeUInt32LE(data.length);bc.writeUInt32LE(0x004e4942,4);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.concat([header,jc,json,bc,data]));
console.log(JSON.stringify({input,output,decodedBufferViews:decoded,inputBytes:raw.length,outputBytes:28+json.length+data.length}));
