/* EZcut — prototype de moteur d'effets.
   Exécute des shaders ISF (effets) et gl-transitions (transitions) non modifiés dans un contexte WebGL2 unique.
   Prototype de maquette : pas le moteur définitif. */
(function (global) {
  'use strict';

  function replaceMacro(src, name, fn) {
    const re = new RegExp('\\b' + name + '\\s*\\(');
    for (let guard = 0; guard < 4000; guard++) {
      const m = re.exec(src);
      if (!m) break;
      let j = m.index + m[0].length, depth = 1, cur = '';
      const args = [];
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

  function expandISF(src) {
    src = replaceMacro(src, 'IMG_NORM_PIXEL', a => `texture2D(${a[0]}, ${a[1]})`);
    src = replaceMacro(src, 'IMG_PIXEL', a => `texture2D(${a[0]}, (${a[1]}) / _${a[0]}_size)`);
    src = replaceMacro(src, 'IMG_THIS_NORM_PIXEL', a => `texture2D(${a[0]}, isf_FragNormCoord)`);
    src = replaceMacro(src, 'IMG_THIS_PIXEL', a => `texture2D(${a[0]}, isf_FragNormCoord)`);
    src = replaceMacro(src, 'IMG_SIZE', a => `_${a[0]}_size`);
    return src.replace(/\bvv_FragNormCoord\b/g, 'isf_FragNormCoord').replace(/\bvv_vertShaderInit\b/g, 'isf_vertShaderInit');
  }

  function toES3(src, stage) {
    return src
      .replace(/^\s*#(version|extension).*$/gm, '')
      .replace(/\bgl_FragColor\b/g, 'isf_FragColor')
      .replace(/\btexture2D(Rect)?\b/g, 'texture')
      .replace(/\bvarying\b/g, stage === 'vs' ? 'out' : 'in')
      .replace(/\battribute\b/g, 'in');
  }

  const GLSL_TYPE = { float: 'float', bool: 'bool', long: 'int', color: 'vec4', point2D: 'vec2', event: 'bool' };

  // Petit évaluateur arithmétique pour les tailles de passe ISF ("floor($WIDTH/4.0)").
  function evalExpr(expr, vars) {
    const s = String(expr).replace(/\s+/g, '');
    let i = 0;
    const fns = { floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, max: Math.max, min: Math.min };
    function sum() { let v = prod(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = prod(); v = o === '+' ? v + r : v - r; } return v; }
    function prod() { let v = fac(); while (s[i] === '*' || s[i] === '/') { const o = s[i++]; const r = fac(); v = o === '*' ? v * r : v / r; } return v; }
    function fac() {
      if (s[i] === '-') { i++; return -fac(); }
      if (s[i] === '(') { i++; const v = sum(); i++; return v; }
      if (s[i] === '$') { i++; const m = /^\w+/.exec(s.slice(i)); i += m[0].length; return Number(vars[m[0]] ?? 0); }
      let m = /^[a-zA-Z_]\w*/.exec(s.slice(i));
      if (m) {
        i += m[0].length;
        if (s[i] === '(') { i++; const a = [sum()]; while (s[i] === ',') { i++; a.push(sum()); } i++; return (fns[m[0]] || (x => x))(...a); }
        return Number(vars[m[0]] ?? 0);
      }
      m = /^\d*\.?\d+(e-?\d+)?/i.exec(s.slice(i));
      if (!m) throw new Error('expr: ' + expr);
      i += m[0].length; return parseFloat(m[0]);
    }
    const v = sum();
    return Number.isFinite(v) ? v : 1;
  }

  class Engine {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false });
      if (!gl) throw new Error('WebGL2 indisponible');
      this.gl = gl; this.canvas = canvas;
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      this.copy = this._link(
        '#version 300 es\nin vec2 isf_position;out vec2 v;void main(){v=isf_position*.5+.5;gl_Position=vec4(isf_position,0.,1.);}',
        '#version 300 es\nprecision highp float;in vec2 v;uniform sampler2D t;out vec4 o;void main(){o=vec4(texture(t,v).rgb,1.);}');
    }

    _compile(type, src) {
      const gl = this.gl, sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error(log); }
      return sh;
    }
    _link(vsSrc, fsSrc) {
      const gl = this.gl, vs = this._compile(gl.VERTEX_SHADER, vsSrc);
      let fs;
      try { fs = this._compile(gl.FRAGMENT_SHADER, fsSrc); } catch (e) { gl.deleteShader(vs); throw e; }
      const prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.bindAttribLocation(prog, 0, 'isf_position');
      gl.linkProgram(prog);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { const log = gl.getProgramInfoLog(prog); gl.deleteProgram(prog); throw new Error(log); }
      return { prog, uni: {} };
    }
    _try(build) {
      try { return Object.assign(build(true), { mode: 'es3' }); }
      catch (e3) {
        try { return Object.assign(build(false), { mode: 'es1' }); }
        catch (e1) { return { ok: false, err: String(e1.message || e1).slice(0, 300), err3: String(e3.message || e3).slice(0, 300) }; }
      }
    }

    compileEffect(def) {
      const targets = [...new Set((def.passes || []).map(p => p.TARGET).filter(Boolean))];
      let decl = 'uniform int PASSINDEX;uniform vec2 RENDERSIZE;uniform float TIME;uniform float TIMEDELTA;uniform int FRAMEINDEX;uniform vec4 DATE;\n';
      for (const n of ['inputImage', ...targets]) decl += `uniform sampler2D ${n};uniform vec2 _${n}_size;\n`;
      for (const i of def.inputs) if (GLSL_TYPE[i.TYPE]) decl += `uniform ${GLSL_TYPE[i.TYPE]} ${i.NAME};\n`;
      const fsBody = expandISF(def.fs), vsBody = def.vs ? expandISF(def.vs) : 'void main(){isf_vertShaderInit();}';
      const r = this._try(es3 => {
        const head = (es3 ? '#version 300 es\n' : '') + 'precision highp float;precision highp int;\n';
        let vs = head + 'attribute vec2 isf_position;varying vec2 isf_FragNormCoord;\n' + decl +
          'void isf_vertShaderInit(){isf_FragNormCoord=isf_position*.5+.5;gl_Position=vec4(isf_position,0.,1.);}\n' + vsBody;
        let fs = head + (es3 ? 'out vec4 isf_FragColor;\n' : '') + 'varying vec2 isf_FragNormCoord;\n' + decl + fsBody;
        if (es3) { vs = '#version 300 es\n' + toES3(vs.slice(16), 'vs'); fs = '#version 300 es\n' + toES3(fs.slice(16), 'fs'); }
        return this._link(vs, fs);
      });
      if (r.ok === false) return r;
      return Object.assign(r, { ok: true, kind: 'effect', def, targets, state: {} });
    }

    compileTransition(def) {
      const r = this._try(es3 => {
        const head = (es3 ? '#version 300 es\n' : '') + 'precision highp float;precision highp int;\n';
        let vs = head + 'attribute vec2 isf_position;varying vec2 isf_FragNormCoord;void main(){isf_FragNormCoord=isf_position*.5+.5;gl_Position=vec4(isf_position,0.,1.);}';
        let fs = head + (es3 ? 'out vec4 isf_FragColor;\n' : '') +
          'varying vec2 isf_FragNormCoord;uniform sampler2D from,to;uniform float progress,ratio;\n' +
          'vec4 getFromColor(vec2 uv){return texture2D(from,uv);}vec4 getToColor(vec2 uv){return texture2D(to,uv);}\n' +
          def.src + '\nvoid main(){gl_FragColor=transition(isf_FragNormCoord);}';
        if (es3) { vs = '#version 300 es\n' + toES3(vs.slice(16), 'vs'); fs = '#version 300 es\n' + toES3(fs.slice(16), 'fs'); }
        return this._link(vs, fs);
      });
      if (r.ok === false) return r;
      return Object.assign(r, { ok: true, kind: 'transition', def });
    }

    _u(p, name) { return name in p.uni ? p.uni[name] : (p.uni[name] = this.gl.getUniformLocation(p.prog, name)); }

    createTexture() {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    upload(tex, source) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); return true; } catch (e) { return false; }
    }
    createTarget(w, h) {
      const gl = this.gl, tex = this.createTexture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo, w, h };
    }
    freeTarget(t) { if (t) { this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fbo); } }

    _bind(out, w, h) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fbo : null);
      gl.viewport(0, 0, w, h);
    }
    _tex(p, name, unit, tex, w, h) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(this._u(p, name), unit);
      const s = this._u(p, `_${name}_size`); if (s) gl.uniform2f(s, w, h);
    }

    /* Rend un effet. out = cible {fbo,w,h} ou null (canvas, coin bas-gauche). key distingue les tampons par usage. */
    renderEffect(p, inTex, w, h, out, opt) {
      const gl = this.gl, def = p.def, o = opt || {}, vals = o.params || {};
      const key = (o.key || 'k') + ':' + w + 'x' + h;
      let st = p.state[key];
      if (!st) {
        st = p.state[key] = {};
        const vars = { WIDTH: w, HEIGHT: h };
        for (const i of def.inputs) vars[i.NAME] = vals[i.NAME] ?? i.DEFAULT ?? 0;
        for (const ps of def.passes || []) if (ps.TARGET && !st[ps.TARGET]) {
          const tw = Math.max(1, Math.floor(evalExpr(ps.WIDTH ?? '$WIDTH', vars))), th = Math.max(1, Math.floor(evalExpr(ps.HEIGHT ?? '$HEIGHT', vars)));
          st[ps.TARGET] = { front: this.createTarget(tw, th), back: this.createTarget(tw, th) };
        }
      }
      const passes = def.passes && def.passes.length ? def.passes : [{}];
      gl.useProgram(p.prog);
      gl.uniform1f(this._u(p, 'TIME'), o.time || 0);
      gl.uniform1f(this._u(p, 'TIMEDELTA'), 1 / 30);
      gl.uniform1i(this._u(p, 'FRAMEINDEX'), o.frame || 0);
      gl.uniform4f(this._u(p, 'DATE'), 2026, 1, 1, o.time || 0);
      for (const i of def.inputs) {
        const loc = this._u(p, i.NAME); if (!loc) continue;
        const v = vals[i.NAME] ?? i.DEFAULT;
        switch (i.TYPE) {
          case 'float': gl.uniform1f(loc, Number(v ?? 0)); break;
          case 'bool': gl.uniform1i(loc, v ? 1 : 0); break;
          case 'event': gl.uniform1i(loc, 0); break;
          case 'long': gl.uniform1i(loc, Math.round(Number(v ?? (i.VALUES ? i.VALUES[0] : 0)))); break;
          case 'color': gl.uniform4fv(loc, Array.isArray(v) && v.length === 4 ? v : [1, 1, 1, 1]); break;
          case 'point2D': gl.uniform2fv(loc, Array.isArray(v) && v.length === 2 ? v : [0, 0]); break;
        }
      }
      passes.forEach((ps, idx) => {
        const tg = ps.TARGET ? st[ps.TARGET] : null;
        const tw = tg ? tg.back.w : w, th = tg ? tg.back.h : h;
        this._bind(tg ? tg.back : out, tw, th);
        gl.uniform1i(this._u(p, 'PASSINDEX'), idx);
        gl.uniform2f(this._u(p, 'RENDERSIZE'), tw, th);
        this._tex(p, 'inputImage', 0, inTex, w, h);
        p.targets.forEach((n, k) => this._tex(p, n, k + 1, st[n].front.tex, st[n].front.w, st[n].front.h));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (tg) { const t = tg.front; tg.front = tg.back; tg.back = t; }
      });
      const last = passes[passes.length - 1];
      if (last.TARGET) this.blit(st[last.TARGET].front.tex, w, h, out);
    }

    renderTransition(p, fromTex, toTex, progress, w, h, out, params) {
      const gl = this.gl, vals = params || {};
      gl.useProgram(p.prog);
      this._bind(out, w, h);
      this._tex(p, 'from', 0, fromTex, w, h); this._tex(p, 'to', 1, toTex, w, h);
      gl.uniform1f(this._u(p, 'progress'), progress);
      gl.uniform1f(this._u(p, 'ratio'), w / h);
      for (const u of p.def.params) {
        const loc = this._u(p, u.name); if (!loc) continue;
        const v = vals[u.name] ?? u.def, n = { float: 1, int: 1, bool: 1, vec2: 2, vec3: 3, vec4: 4, ivec2: 2 }[u.type];
        const a = Array.from({ length: n }, (_, k) => Number(v[k] ?? v[0] ?? 0));
        if (u.type === 'float') gl.uniform1f(loc, a[0]);
        else if (u.type === 'int' || u.type === 'bool') gl.uniform1i(loc, a[0]);
        else if (u.type === 'ivec2') gl.uniform2iv(loc, a);
        else gl['uniform' + n + 'fv'](loc, a);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    blit(tex, w, h, out) {
      const gl = this.gl, p = this.copy;
      gl.useProgram(p.prog);
      this._bind(out, w, h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(this._u(p, 't'), 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /* Copie le coin bas-gauche w×h du canvas WebGL vers un contexte 2D. À appeler juste après le rendu. */
    present(ctx2d, w, h) {
      ctx2d.drawImage(this.canvas, 0, this.canvas.height - h, w, h, 0, 0, ctx2d.canvas.width, ctx2d.canvas.height);
    }
    readStats(w, h) {
      const gl = this.gl, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    }
  }

  global.EZFX = { Engine, evalExpr };
})(window);
