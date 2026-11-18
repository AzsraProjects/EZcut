/** Moteur d'effets : exécute des shaders ISF (effets, filtres) et gl-transitions non modifiés dans un contexte WebGL2. */
import type { Transform } from '../core/types';

export interface IsfInput { NAME: string; TYPE: string; DEFAULT?: unknown; MIN?: unknown; MAX?: unknown; LABEL?: string; VALUES?: number[]; LABELS?: string[]; }
export interface IsfPass { TARGET?: string; WIDTH?: string | number; HEIGHT?: string | number; FLOAT?: boolean; }
export interface EffectDef { id: string; name: string; inputs: IsfInput[]; passes: IsfPass[] | null; fs: string; vs: string | null; }
export interface TransitionParam { type: string; name: string; def: number[]; }
export interface TransitionDef { id: string; name: string; params: TransitionParam[]; src: string; }

export interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number; }
interface Linked { prog: WebGLProgram; uni: Record<string, WebGLUniformLocation | null>; }
export interface EffectProgram extends Linked { ok: true; kind: 'effect'; mode: string; def: EffectDef; targets: string[]; state: Record<string, Record<string, { front: Target; back: Target }>>; }
export interface TransitionProgram extends Linked { ok: true; kind: 'transition'; mode: string; def: TransitionDef; }
export interface Failed { ok: false; err: string; }
export interface RenderOpts { time?: number; /** Avancement dans le clip, de 0 à 1 (uniforme EZ_PROGRESS, propre à EZcut). */ progress?: number; frame?: number; key?: string; params?: Record<string, unknown>; }

function replaceMacro(src: string, name: string, fn: (args: string[]) => string): string {
  const re = new RegExp('\\b' + name + '\\s*\\(');
  for (let guard = 0; guard < 4000; guard++) {
    const m = re.exec(src);
    if (!m) break;
    let j = m.index + m[0].length, depth = 1, cur = '';
    const args: string[] = [];
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (!depth) break; }
      if (c === ',' && depth === 1) { args.push(cur); cur = ''; } else cur += c;
    }
    args.push(cur);
    src = src.slice(0, m.index) + fn(args.map(s => s.trim())) + src.slice(j + 1);
  }
  return src;
}

function expandISF(src: string): string {
  src = replaceMacro(src, 'IMG_NORM_PIXEL', a => `texture2D(${a[0]}, ${a[1]})`);
  src = replaceMacro(src, 'IMG_PIXEL', a => `texture2D(${a[0]}, (${a[1]}) / _${a[0]}_size)`);
  src = replaceMacro(src, 'IMG_THIS_NORM_PIXEL', a => `texture2D(${a[0]}, isf_FragNormCoord)`);
  src = replaceMacro(src, 'IMG_THIS_PIXEL', a => `texture2D(${a[0]}, isf_FragNormCoord)`);
  src = replaceMacro(src, 'IMG_SIZE', a => `_${a[0]}_size`);
  return src.replace(/\bvv_FragNormCoord\b/g, 'isf_FragNormCoord').replace(/\bvv_vertShaderInit\b/g, 'isf_vertShaderInit');
}

function toES3(src: string, stage: 'vs' | 'fs'): string {
  return src
    .replace(/^\s*#(version|extension).*$/gm, '')
    .replace(/\bgl_FragColor\b/g, 'isf_FragColor')
    .replace(/\btexture2D(Rect)?\b/g, 'texture')
    .replace(/\bvarying\b/g, stage === 'vs' ? 'out' : 'in')
    .replace(/\battribute\b/g, 'in');
}

const GLSL_TYPE: Record<string, string> = { float: 'float', bool: 'bool', long: 'int', color: 'vec4', point2D: 'vec2', event: 'bool' };
const VS_QUAD = 'attribute vec2 isf_position;varying vec2 isf_FragNormCoord;void main(){isf_FragNormCoord=isf_position*.5+.5;gl_Position=vec4(isf_position,0.,1.);}';

/** Évalue les tailles de passe ISF, par exemple "floor($WIDTH/4.0)". Pas d'eval : la CSP l'interdit. */
export function evalExpr(expr: string | number, vars: Record<string, unknown>): number {
  const s = String(expr).replace(/\s+/g, '');
  let i = 0;
  const fns: Record<string, (...a: number[]) => number> = { floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, max: Math.max, min: Math.min };
  const sum = (): number => { let v = prod(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = prod(); v = o === '+' ? v + r : v - r; } return v; };
  const prod = (): number => { let v = fac(); while (s[i] === '*' || s[i] === '/') { const o = s[i++]; const r = fac(); v = o === '*' ? v * r : v / r; } return v; };
  const fac = (): number => {
    if (s[i] === '-') { i++; return -fac(); }
    if (s[i] === '(') { i++; const v = sum(); i++; return v; }
    if (s[i] === '$') { i++; const m = /^\w+/.exec(s.slice(i)); if (!m) throw new Error('expr'); i += m[0].length; return Number(vars[m[0]] ?? 0); }
    let m = /^[a-zA-Z_]\w*/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      if (s[i] === '(') { i++; const a = [sum()]; while (s[i] === ',') { i++; a.push(sum()); } i++; return (fns[m[0]] ?? ((x: number) => x))(...a); }
      return Number(vars[m[0]] ?? 0);
    }
    m = /^\d*\.?\d+(e-?\d+)?/i.exec(s.slice(i));
    if (!m) throw new Error('expr: ' + expr);
    i += m[0].length;
    return parseFloat(m[0]);
  };
  try { const v = sum(); return Number.isFinite(v) ? v : 1; } catch { return 1; }
}

export class Engine {
  readonly gl: WebGL2RenderingContext;
  private copy: Linked;
  private fit: Linked;
  private mix: Linked;
  private floatOk: boolean;

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 indisponible');
    this.gl = gl;
    this.floatOk = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    const vs = '#version 300 es\nin vec2 isf_position;out vec2 v;void main(){v=isf_position*.5+.5;gl_Position=vec4(isf_position,0.,1.);}';
    this.copy = this.link(vs, '#version 300 es\nprecision highp float;in vec2 v;uniform sampler2D t;uniform float gain;out vec4 o;void main(){o=vec4(texture(t,v).rgb*gain,1.);}');
    // Place l'image source dans le cadre du projet : ajustement sans déformation, puis échelle, position, rotation.
    this.fit = this.link(vs, `#version 300 es
precision highp float;in vec2 v;uniform sampler2D t;uniform vec2 box;uniform vec2 off;uniform float scale,rot,aspect,keepAlpha;out vec4 o;
void main(){vec2 p=(v-.5)*vec2(aspect,1.)-off*vec2(aspect,1.);float c=cos(rot),s=sin(rot);p=vec2(c*p.x+s*p.y,-s*p.x+c*p.y)/scale;
vec2 uv=p/box+.5;bool outside=uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.;vec4 px=texture(t,uv);
o=keepAlpha>.5?(outside?vec4(0.):px):(outside?vec4(0.,0.,0.,1.):vec4(px.rgb,1.));}`);
    // Pose une couche sur une image : la couverture vient du masque (alpha), la couleur de la couche, selon un mode de fusion.
    this.mix = this.link(vs, `#version 300 es
precision highp float;in vec2 v;uniform sampler2D base,top,mask;uniform float opacity;uniform int mode;out vec4 o;
void main(){vec3 b=texture(base,v).rgb;float m=texture(mask,v).a;vec3 t=texture(top,v).rgb;if(m>.001)t=min(t/m,1.);float a=m*opacity;vec3 r=t;
if(mode==1)r=1.-(1.-b)*(1.-t);else if(mode==2)r=b*t;else if(mode==3)r=min(b+t,1.);
else if(mode==4)r=mix(2.*b*t,1.-2.*(1.-b)*(1.-t),step(.5,b));
o=vec4(mix(b,r,a),1.);}`);
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl, sh = gl.createShader(type)!;
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(sh) ?? ''; gl.deleteShader(sh); throw new Error(log); }
    return sh;
  }
  private link(vsSrc: string, fsSrc: string): Linked {
    const gl = this.gl, vs = this.compile(gl.VERTEX_SHADER, vsSrc);
    let fs: WebGLShader;
    try { fs = this.compile(gl.FRAGMENT_SHADER, fsSrc); } catch (e) { gl.deleteShader(vs); throw e; }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'isf_position');
    gl.linkProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { const log = gl.getProgramInfoLog(prog) ?? ''; gl.deleteProgram(prog); throw new Error(log); }
    return { prog, uni: {} };
  }
  /** Essaie d'abord en GLSL ES 3.00 (boucles dynamiques, dérivées), puis en ES 1.00 tel quel. */
  private tryBoth(build: (es3: boolean) => Linked): (Linked & { mode: string }) | Failed {
    try { return Object.assign(build(true), { mode: 'es3' }); }
    catch {
      try { return Object.assign(build(false), { mode: 'es1' }); }
      catch (e1) { return { ok: false, err: String((e1 as Error).message ?? e1).slice(0, 300) }; }
    }
  }

  compileEffect(def: EffectDef): EffectProgram | Failed {
    const targets = [...new Set((def.passes ?? []).map(p => p.TARGET).filter((t): t is string => !!t))];
    let decl = 'uniform int PASSINDEX;uniform vec2 RENDERSIZE;uniform float TIME;uniform float TIMEDELTA;uniform int FRAMEINDEX;uniform vec4 DATE;uniform float EZ_PROGRESS;\n';
    for (const n of ['inputImage', ...targets]) decl += `uniform sampler2D ${n};uniform vec2 _${n}_size;\n`;
    for (const i of def.inputs) if (GLSL_TYPE[i.TYPE]) decl += `uniform ${GLSL_TYPE[i.TYPE]} ${i.NAME};\n`;
    const fsBody = expandISF(def.fs), vsBody = def.vs ? expandISF(def.vs) : 'void main(){isf_vertShaderInit();}';
    const r = this.tryBoth(es3 => {
      const head = 'precision highp float;precision highp int;\n';
      let vs = head + 'attribute vec2 isf_position;varying vec2 isf_FragNormCoord;\n' + decl +
        'void isf_vertShaderInit(){isf_FragNormCoord=isf_position*.5+.5;gl_Position=vec4(isf_position,0.,1.);}\n' + vsBody;
      let fs = head + (es3 ? 'out vec4 isf_FragColor;\n' : '') + 'varying vec2 isf_FragNormCoord;\n' + decl + fsBody;
      if (es3) { vs = '#version 300 es\n' + toES3(vs, 'vs'); fs = '#version 300 es\n' + toES3(fs, 'fs'); }
      return this.link(vs, fs);
    });
    if ('ok' in r) return r;
    return Object.assign(r, { ok: true as const, kind: 'effect' as const, def, targets, state: {} });
  }

  compileTransition(def: TransitionDef): TransitionProgram | Failed {
    const r = this.tryBoth(es3 => {
      const head = 'precision highp float;precision highp int;\n';
      let vs = head + VS_QUAD;
      let fs = head + (es3 ? 'out vec4 isf_FragColor;\n' : '') +
        'varying vec2 isf_FragNormCoord;uniform sampler2D from,to;uniform float progress,ratio;\n' +
        'vec4 getFromColor(vec2 uv){return texture2D(from,uv);}vec4 getToColor(vec2 uv){return texture2D(to,uv);}\n' +
        def.src + '\nvoid main(){gl_FragColor=transition(isf_FragNormCoord);}';
      if (es3) { vs = '#version 300 es\n' + toES3(vs, 'vs'); fs = '#version 300 es\n' + toES3(fs, 'fs'); }
      return this.link(vs, fs);
    });
    if ('ok' in r) return r;
    return Object.assign(r, { ok: true as const, kind: 'transition' as const, def });
  }

  private u(p: Linked, name: string) { return name in p.uni ? p.uni[name] : (p.uni[name] = this.gl.getUniformLocation(p.prog, name)); }

  createTexture(): WebGLTexture {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  }
  upload(tex: WebGLTexture, source: TexImageSource): boolean {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); // alpha prémultiplié : les bords des titres et des PNG restent propres une fois redimensionnés
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); return true; } catch { return false; }
  }
  deleteTexture(tex: WebGLTexture) { this.gl.deleteTexture(tex); }

  createTarget(w: number, h: number, float = false): Target {
    const gl = this.gl, tex = this.createTexture();
    if (float && this.floatOk) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }
  freeTarget(t: Target) { this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fbo); }

  /** Libère les tampons d'un effet pour une clé d'usage (préfixe). */
  releaseState(p: EffectProgram, keyPrefix: string) {
    for (const k of Object.keys(p.state)) if (k.startsWith(keyPrefix)) {
      for (const t of Object.values(p.state[k])) { this.freeTarget(t.front); this.freeTarget(t.back); }
      delete p.state[k];
    }
  }

  private bind(out: Target | null, w: number, h: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fbo : null);
    gl.viewport(0, 0, w, h);
  }
  private tex(p: Linked, name: string, unit: number, tex: WebGLTexture, w: number, h: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.u(p, name), unit);
    const s = this.u(p, `_${name}_size`); if (s) gl.uniform2f(s, w, h);
  }

  /** Rend un effet de inTex vers out (ou vers le coin bas-gauche du canvas si out est null). */
  renderEffect(p: EffectProgram, inTex: WebGLTexture, w: number, h: number, out: Target | null, o: RenderOpts = {}) {
    const gl = this.gl, def = p.def, vals = o.params ?? {};
    const key = (o.key ?? 'k') + ':' + w + 'x' + h;
    let st = p.state[key];
    if (!st) {
      st = p.state[key] = {};
      const vars: Record<string, unknown> = { WIDTH: w, HEIGHT: h };
      for (const i of def.inputs) vars[i.NAME] = vals[i.NAME] ?? i.DEFAULT ?? 0;
      for (const ps of def.passes ?? []) if (ps.TARGET && !st[ps.TARGET]) {
        const tw = Math.max(1, Math.floor(evalExpr(ps.WIDTH ?? '$WIDTH', vars))), th = Math.max(1, Math.floor(evalExpr(ps.HEIGHT ?? '$HEIGHT', vars)));
        st[ps.TARGET] = { front: this.createTarget(tw, th, !!ps.FLOAT), back: this.createTarget(tw, th, !!ps.FLOAT) };
      }
    }
    const passes: IsfPass[] = def.passes && def.passes.length ? def.passes : [{}];
    gl.useProgram(p.prog);
    gl.uniform1f(this.u(p, 'TIME'), o.time ?? 0);
    gl.uniform1f(this.u(p, 'TIMEDELTA'), 1 / 30);
    gl.uniform1i(this.u(p, 'FRAMEINDEX'), o.frame ?? 0);
    gl.uniform4f(this.u(p, 'DATE'), 2026, 1, 1, o.time ?? 0);
    gl.uniform1f(this.u(p, 'EZ_PROGRESS'), o.progress ?? 0);
    for (const i of def.inputs) {
      const loc = this.u(p, i.NAME); if (!loc) continue;
      const v = vals[i.NAME] ?? i.DEFAULT;
      switch (i.TYPE) {
        case 'float': gl.uniform1f(loc, Number(v ?? 0)); break;
        case 'bool': gl.uniform1i(loc, v ? 1 : 0); break;
        case 'event': gl.uniform1i(loc, 0); break;
        case 'long': gl.uniform1i(loc, Math.round(Number(v ?? i.VALUES?.[0] ?? 0))); break;
        case 'color': gl.uniform4fv(loc, Array.isArray(v) && v.length === 4 ? v : [1, 1, 1, 1]); break;
        case 'point2D': gl.uniform2fv(loc, Array.isArray(v) && v.length === 2 ? v : [0, 0]); break;
      }
    }
    passes.forEach((ps, idx) => {
      const tg = ps.TARGET ? st[ps.TARGET] : null;
      const tw = tg ? tg.back.w : w, th = tg ? tg.back.h : h;
      this.bind(tg ? tg.back : out, tw, th);
      gl.uniform1i(this.u(p, 'PASSINDEX'), idx);
      gl.uniform2f(this.u(p, 'RENDERSIZE'), tw, th);
      this.tex(p, 'inputImage', 0, inTex, w, h);
      p.targets.forEach((n, k) => this.tex(p, n, k + 1, st[n].front.tex, st[n].front.w, st[n].front.h));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (tg) { const t = tg.front; tg.front = tg.back; tg.back = t; }
    });
    const last = passes[passes.length - 1];
    if (last.TARGET) this.blit(st[last.TARGET].front.tex, w, h, out);
  }

  renderTransition(p: TransitionProgram, fromTex: WebGLTexture, toTex: WebGLTexture, progress: number, w: number, h: number, out: Target | null, params: Record<string, number[]> = {}) {
    const gl = this.gl;
    gl.useProgram(p.prog);
    this.bind(out, w, h);
    this.tex(p, 'from', 0, fromTex, w, h); this.tex(p, 'to', 1, toTex, w, h);
    gl.uniform1f(this.u(p, 'progress'), progress);
    gl.uniform1f(this.u(p, 'ratio'), w / h);
    const sizes: Record<string, number> = { float: 1, int: 1, bool: 1, vec2: 2, vec3: 3, vec4: 4, ivec2: 2 };
    for (const u of p.def.params) {
      const loc = this.u(p, u.name); if (!loc) continue;
      const v = params[u.name] ?? u.def, n = sizes[u.type] ?? 1;
      const a = Array.from({ length: n }, (_, k) => Number(v[k] ?? v[0] ?? 0));
      if (u.type === 'float') gl.uniform1f(loc, a[0]);
      else if (u.type === 'int' || u.type === 'bool') gl.uniform1i(loc, a[0]);
      else if (u.type === 'ivec2') gl.uniform2iv(loc, a);
      else if (n === 2) gl.uniform2fv(loc, a);
      else if (n === 3) gl.uniform3fv(loc, a);
      else gl.uniform4fv(loc, a);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Copie une image. gain < 1 l'assombrit vers le noir (fondu de l'image). */
  blit(tex: WebGLTexture, w: number, h: number, out: Target | null, gain = 1) {
    const gl = this.gl, p = this.copy;
    gl.useProgram(p.prog);
    this.bind(out, w, h);
    gl.uniform1f(this.u(p, 'gain'), gain);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.u(p, 't'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Dessine une source srcW×srcH dans un cadre w×h en conservant ses proportions, avec transformation. */
  drawFit(tex: WebGLTexture, srcW: number, srcH: number, w: number, h: number, out: Target | null, tf: Transform = { scale: 1, x: 0, y: 0, rot: 0 }, keepAlpha = false, natural = false) {
    const gl = this.gl, p = this.fit, A = w / h, sa = (srcW || w) / (srcH || h);
    gl.useProgram(p.prog);
    this.bind(out, w, h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.u(p, 't'), 0);
    // natural : la source est posée à sa taille réelle (un pixel pour un pixel), au lieu d'être ajustée au cadre.
    if (natural) gl.uniform2f(this.u(p, 'box'), srcW / h, srcH / h);
    else gl.uniform2f(this.u(p, 'box'), sa > A ? A : sa, sa > A ? A / sa : 1);
    gl.uniform2f(this.u(p, 'off'), tf.x, tf.y);
    gl.uniform1f(this.u(p, 'scale'), Math.max(0.01, tf.scale));
    gl.uniform1f(this.u(p, 'rot'), tf.rot * Math.PI / 180);
    gl.uniform1f(this.u(p, 'aspect'), A);
    gl.uniform1f(this.u(p, 'keepAlpha'), keepAlpha ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Fusionne une couche sur une image de base. mask fournit la couverture (son canal alpha). mode : 0 normal, 1 écran, 2 produit, 3 addition, 4 incrustation. */
  layer(base: WebGLTexture, top: WebGLTexture, mask: WebGLTexture, opacity: number, mode: number, w: number, h: number, out: Target | null) {
    const gl = this.gl, p = this.mix;
    gl.useProgram(p.prog);
    this.bind(out, w, h);
    [['base', base], ['top', top], ['mask', mask]].forEach(([n, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t as WebGLTexture); gl.uniform1i(this.u(p, n as string), i); });
    gl.uniform1f(this.u(p, 'opacity'), opacity);
    gl.uniform1i(this.u(p, 'mode'), mode);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  clear(w: number, h: number, out: Target | null) {
    this.bind(out, w, h);
    this.gl.clearColor(0, 0, 0, 1); this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  /** Copie le coin bas-gauche w×h du canvas WebGL vers un contexte 2D. À appeler juste après le rendu. */
  present(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const c = this.canvas as HTMLCanvasElement;
    ctx.drawImage(c, 0, c.height - h, w, h, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  /** Lit le coin bas-gauche w×h du canvas (ou d'une cible). Lignes de bas en haut. */
  readPixels(w: number, h: number, from: Target | null, into?: Uint8Array): Uint8Array {
    const gl = this.gl, px = into ?? new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, from ? from.fbo : null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }
}
