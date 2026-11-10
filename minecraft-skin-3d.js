/* SSCircle V10.49.1.5 | Stable Minecraft skin viewer.
 * True 3D cuboid geometry rasterized on a 2D canvas with an orthographic camera.
 * All visible faces are depth sorted back-to-front, then painted using their
 * correct Minecraft UV region. This avoids WebGL transparent back-faces,
 * depth-mask artifacts, CSS transform flattening and browser/GPU differences.
 * No external JavaScript, CDN, account lookup or video dependencies.
 */
'use strict';
(() => {
  const UV=(u,v,w,h,d)=>({
    front:[u+d,v+d,w,h], back:[u+2*d+w,v+d,w,h],
    right:[u,v+d,d,h],left:[u+d+w,v+d,d,h],
    top:[u+d,v,w,d],bottom:[u+d+w,v,w,d]
  });
  // Coordinates match Minecraft texture pixel dimensions. Body width 8,
  // height 12, depth 4, head 8x8x8; Y increases down the screen.
  function mesh(model='classic',height=64){
    const slim=model==='slim'&&height===64,arm=slim?3:4,modern=height===64;
    const parts=[
      ['head',0,0,8,8,8,0,-12,0],
      ['body',16,16,8,12,4,0,-2,0],
      ['right-arm',40,16,arm,12,4,-4-arm/2,-2,0],
      ['left-arm',modern?32:40,modern?48:16,arm,12,4,4+arm/2,-2,0],
      ['right-leg',0,16,4,12,4,-2,10,0],
      ['left-leg',modern?16:0,modern?48:16,4,12,4,2,10,0]
    ];
    const layers=[['hat',32,0,8,8,8,0,-12,0],...(modern?[
      ['jacket',16,32,8,12,4,0,-2,0],
      ['right-sleeve',40,32,arm,12,4,-4-arm/2,-2,0],
      ['left-sleeve',48,48,arm,12,4,4+arm/2,-2,0],
      ['right-pants',0,32,4,12,4,-2,10,0],
      ['left-pants',0,48,4,12,4,2,10,0]
    ]:[])];
    const emit=(items,inflate)=>{
      const vertices=[];
      for(const [,u,v,w,h,d,cx,cy,cz] of items){
        const skinUV=UV(u,v,w,h,d), wx=w/2+inflate,hy=h/2+inflate,dz=d/2+inflate;
        const X0=cx-wx,X1=cx+wx,Y0=cy-hy,Y1=cy+hy,Z0=cz-dz,Z1=cz+dz;
        // All faces point outward; their UVs follow the normal Minecraft atlas.
        const corners={
          front:[[X0,Y0,Z1],[X1,Y0,Z1],[X1,Y1,Z1],[X0,Y1,Z1]],
          back:[[X1,Y0,Z0],[X0,Y0,Z0],[X0,Y1,Z0],[X1,Y1,Z0]],
          right:[[X0,Y0,Z0],[X0,Y0,Z1],[X0,Y1,Z1],[X0,Y1,Z0]],
          left:[[X1,Y0,Z1],[X1,Y0,Z0],[X1,Y1,Z0],[X1,Y1,Z1]],
          top:[[X0,Y0,Z0],[X1,Y0,Z0],[X1,Y0,Z1],[X0,Y0,Z1]],
          bottom:[[X0,Y1,Z1],[X1,Y1,Z1],[X1,Y1,Z0],[X0,Y1,Z0]]
        };
        for(const [face,rect] of Object.entries(skinUV)){
          const [tx,ty,tw,th]=rect,quad=corners[face];
          const uv=[[tx,ty],[tx+tw,ty],[tx+tw,ty+th],[tx,ty+th]];
          for(const idx of [0,1,2,0,2,3]){
            vertices.push(...quad[idx],uv[idx][0]/64,uv[idx][1]/height);
          }
        }
      }
      return new Float32Array(vertices);
    };
    return {base:emit(parts,0),outer:emit(layers,0.36),parts:parts.map(p=>p[0]),
      layers:layers.map(p=>p[0]),slim};
  }

  // Retain a quad per face. The original triangle data are kept above for
  // dimension tests and for compatibility with users of SSCircleSkin3D.mesh.
  function faces(vertices,imageHeight,layer){
    const result=[];
    const point=(offset)=>[
      vertices[offset*5],vertices[offset*5+1],vertices[offset*5+2]
    ];
    for(let i=0;i<vertices.length/5;i+=6){
      const p0=point(i),p1=point(i+1),p3=point(i+5);
      const u=Math.round(vertices[(i*5)+3]*64),
        v=Math.round(vertices[(i*5)+4]*imageHeight);
      const w=Math.round((vertices[((i+1)*5)+3]-vertices[(i*5)+3])*64),
        h=Math.round((vertices[((i+5)*5)+4]-vertices[(i*5)+4])*imageHeight);
      if(w>0&&h>0)result.push({p0,p1,p3,u,v,w,h,layer});
    }
    return result;
  }
  function create(canvas){
    const ctx=canvas?.getContext?.('2d',{alpha:true,willReadFrequently:false});
    if(!ctx)return null;
    let image=null,shape=null,quads=[],yaw=25,pitch=-10,zoom=1,outer=true,disposed=false;
    const rad=n=>n*Math.PI/180;
    function setSkin(img,model){
      if(!img||img.naturalWidth!==64||![32,64].includes(img.naturalHeight)||disposed)return false;
      image=img;shape=mesh(model,img.naturalHeight);
      quads=[...faces(shape.base,img.naturalHeight,false),
        ...faces(shape.outer,img.naturalHeight,true)];
      draw();return true;
    }
    function draw(){
      if(disposed)return;
      const rect=canvas.getBoundingClientRect();
      const ratio=Math.min(Math.max(window.devicePixelRatio||1,1),2);
      const width=Math.max(1,Math.round(rect.width*ratio));
      const height=Math.max(1,Math.round(rect.height*ratio));
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
      if(!image||!shape||width<4||height<4)return;
      ctx.imageSmoothingEnabled=false;
      const cy=Math.cos(rad(yaw)),sy=Math.sin(rad(yaw));
      const cp=Math.cos(rad(pitch)),sp=Math.sin(rad(pitch));
      const pixels=(height/43)*zoom;
      const rotate=p=>{
        const x=cy*p[0]+sy*p[2],z=-sy*p[0]+cy*p[2];
        return [x,cp*p[1]-sp*z,sp*p[1]+cp*z];
      };
      const projected=[];
      for(const f of quads){
        if(f.layer&&!outer)continue;
        const p0=rotate(f.p0),p1=rotate(f.p1),p3=rotate(f.p3);
        const ab=[p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]];
        const ad=[p3[0]-p0[0],p3[1]-p0[1],p3[2]-p0[2]];
        // Only outward-facing sides are visible. Hidden back faces must not
        // leak through transparent jacket or hair texels.
        const normalZ=ab[0]*ad[1]-ab[1]*ad[0];
        if(normalZ<=1e-5)continue;
        // One projection scale for all axes; no perspective-induced stretching.
        const a={x:width/2+p0[0]*pixels,y:height/2+p0[1]*pixels};
        const b={x:width/2+p1[0]*pixels,y:height/2+p1[1]*pixels};
        const d={x:width/2+p3[0]*pixels,y:height/2+p3[1]*pixels};
        projected.push({...f,a,b,d,depth:(p0[2]+p1[2]+p3[2])/3});
      }
      // Painter order also sorts outer shells, eliminating the depth-mask
      // / transparent-triangle artifacts seen on real custom skins in WebGL.
      projected.sort((a,b)=>a.depth-b.depth);
      for(const f of projected){
        const ax=(f.b.x-f.a.x)/f.w,ay=(f.b.y-f.a.y)/f.w;
        const bx=(f.d.x-f.a.x)/f.h,by=(f.d.y-f.a.y)/f.h;
        if(!Number.isFinite(ax+ay+bx+by)||Math.abs(ax*by-ay*bx)<1e-6)continue;
        ctx.save();
        ctx.setTransform(ax,ay,bx,by,f.a.x,f.a.y);
        ctx.beginPath();ctx.rect(0,0,f.w,f.h);ctx.clip();
        ctx.drawImage(image,f.u,f.v,f.w,f.h,0,0,f.w,f.h);
        ctx.restore();
      }
    }
    function setView(next){
      if(Number.isFinite(next?.yaw))yaw=next.yaw;
      if(Number.isFinite(next?.pitch))pitch=Math.max(-60,Math.min(60,next.pitch));
      if(Number.isFinite(next?.zoom))zoom=Math.max(.6,Math.min(2.25,next.zoom));
      if(typeof next?.outer==='boolean')outer=next.outer;
      draw();
    }
    function clear(){image=null;shape=null;quads=[];draw();}
    function dispose(){disposed=true;image=null;shape=null;quads=[];}
    return Object.freeze({setSkin,setView,draw,clear,dispose,method:'canvas2d'});
  }
  window.SSCircleSkin3D=Object.freeze({mesh,create});
})();
