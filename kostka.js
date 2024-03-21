class Quat {
  constructor(x, y, z, w) {
    this.q = [x, y, z, w];
  }

  static one() {
    return new Quat(0.0, 0.0, 0.0, 1.0);
  }

  static zero() {
    return new Quat(0.0, 0.0, 0.0, 0.0);
  }

  static rotX(a) {
    return new Quat(Math.sin(a / 2), 0.0, 0.0, Math.cos(a / 2));
  }

  static rotY(a) {
    return new Quat(0.0, Math.sin(a / 2), 0.0, Math.cos(a / 2));
  }

  get data() {
    return this.q;
  }

  conj() {
    const q = this.q;
    return new Quat(-q[0], -q[1], -q[2], q[3]);
  }

  norm() {
    const q = this.q;
    return Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  }

  normal() { // assumes |q| ≠ 0
    return this.muls(1.0 / this.norm());
  }

  mul(other) {
    const q1 = this.q;
    const q2 = other.q;
    return new Quat(
      q1[3] * q2[0] + q2[3] * q1[0] + q1[1] * q2[2] - q1[2] * q2[1],
      q1[3] * q2[1] + q2[3] * q1[1] + q1[2] * q2[0] - q1[0] * q2[2],
      q1[3] * q2[2] + q2[3] * q1[2] + q1[0] * q2[1] - q1[1] * q2[0],
      q1[3] * q2[3] - q1[0] * q2[0] - q1[1] * q2[1] - q1[2] * q2[2]
    );
  }

  div(other) { // assumes |other| = 1
    return this.mul(other.conj());
  }

  muls(x) {
    const q = this.q;
    return new Quat(x * q[0], x * q[1], x * q[2], x * q[3]);
  }

  add(other, x = 1.0) { // MODIFYING
    for(let i = 0; i < 4; i++)
      this.q[i] += x * other.q[i];
  }

  vec() {
    const q = this.q;
    return new Quat(q[0], q[1], q[2], 0.0);
  }

  log() { // assumes |q| = 1
    const q = this.q;
    const s = Math.sign(q[3]);
    if(s * q[3] > 1.0)
      return Quat.zero();
    const a = Math.acos(s * q[3]);
    if(a == 0.0)
      return Quat.zero();
    else {
      const n = this.vec().normal();
      return n.muls(s * a);
    }
  }

  exp() { // assumes q[3] = 0
    const a = this.norm();
    if(a == 0)
      return Quat.one();
    else {
      const n = this.muls(1.0 / a).q;
      const sa = Math.sin(a);
      return new Quat(n[0] * sa, n[1] * sa, n[2] * sa, Math.cos(a));
    }
  }
}

const quats = {
  cur: Quat.one(),
  tmp: Quat.one(),
  bezier: null
};

const viewAngle = 40.0;
const bezierDuration = 1500.0;
const speedLoss = 0.002;

window.addEventListener('DOMContentLoaded', async _ => {
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2');

  const prog = new Program(gl, await fetch('kostka.vert').then(r => r.text()), await fetch('kostka.frag').then(r => r.text()));
  gl.useProgram(prog.program);

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  const data = new Float32Array(await fetch('coords.data', { cache: "no-store" }).then(r => r.arrayBuffer()));
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(0, 1);

  const views = new Float32Array(await fetch('quats.data', { cache: "no-store" }).then(r => r.arrayBuffer()));

  let lastT;
  let bTime;

  function bezier() {
    const t = Math.min(bTime / bezierDuration, 1.0);
    const rt = 1.0 - t;
    const wts = [rt*rt*rt, 3.0*t*rt*rt, 3.0*t*t*rt, t*t*t];
    const ret = Quat.zero();
    for(let i = 0; i < 4; i++)
      ret.add(quats.bezier[i], wts[i]);
    return ret;
  }

  function drawFrame(time) {
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.width = canvas.clientWidth * ratio;
    const height = canvas.height = canvas.clientHeight * ratio;
    const itan = Math.tan(viewAngle * Math.PI / 180.0);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(prog.program);

    const mProj = [
      itan * height / width, 0, 0, 0,
      0, -itan, 0, 0,
      0, 0, 0, 0,
      0, 0, 1, 1
    ];
    gl.uniformMatrix4fv(prog.mProj, false, mProj);

    if(lastT !== undefined) {
      const dt = time - lastT;
      bTime += dt;
    }
    lastT = time;

    if(quats.bezier !== null) {
      if(bTime < bezierDuration)
        quats.tmp = bezier().exp();
      else
        cancelTransition();
    }

    gl.uniform4fv(prog.qView, quats.cur.data);
    gl.uniform4fv(prog.qView2, quats.tmp.data);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, 10000);

    requestAnimationFrame(drawFrame);
  }

  let pid, pcoords;
  const hist = [];

  function cancelTransition() {
    if(quats.bezier !== null) {
      quats.cur = bezier().exp().mul(quats.cur).normal();
      quats.tmp = Quat.one();
      quats.bezier = null;
    }
  }

  canvas.addEventListener('pointerdown', ev => {
    if(pid === undefined) {
      pid = ev.pointerId;
      canvas.setPointerCapture(pid);
      ev.preventDefault();
      pcoords = [ev.clientX, ev.clientY];
      hist.length = 0;
      hist.push({ t: performance.now(), q: quats.tmp });
      cancelTransition();
    }
  });

  canvas.addEventListener('pointermove', ev => {
    if(pid === ev.pointerId) {
      const coords = [ev.clientX, ev.clientY];
      const angle = viewAngle * Math.PI / 180.0 * 3.0;
      const ax = (coords[0] - pcoords[0]) / canvas.height * 2 * angle;
      const ay = -(coords[1] - pcoords[1]) / canvas.height * 2 * angle;
      quats.tmp = Quat.rotX(ay).mul(Quat.rotY(ax));
      const now = performance.now();
      hist.push({ t: performance.now(), q: quats.tmp });
      hist.splice(0, hist.findIndex(rec => rec.t >= now - 100));
    }
  });

  canvas.addEventListener('pointerup', ev => {
    if(pid === ev.pointerId) {
      quats.cur = quats.tmp.mul(quats.cur);
      const now = performance.now();
      hist.splice(0, hist.findIndex(rec => rec[0] >= now - 100));
      if(hist.length >= 2 && hist.at(-1).t != hist[0].t && now - hist.at(-1).t < 50) {
        const dt = hist.at(-1).t - hist[0].t;
        const dq = hist.at(-1).q.div(hist[0].q);
        const curSpeed = dq.log().muls(1.0 / dt);
        const i = Math.floor(Math.random() * 6);
        const tgt = new Quat(...views.subarray(i * 4, (i + 1) * 4));
        const tlog = tgt.div(quats.cur).log();
        quats.bezier = [Quat.zero(), curSpeed.muls(bezierDuration / 3.0), tlog, tlog];
        bTime = 0.0;
      }
      quats.tmp = Quat.one();
      canvas.releasePointerCapture(pid);
      pid = undefined;
    }
  });

  canvas.addEventListener('pointercancel', ev => {
    quats.tmp = Quat.one();
    canvas.releasePointerCapture(pid);
    pid = undefined;
  });

  requestAnimationFrame(drawFrame);
});

function Shader(ctx, type, source) {
  var shader = ctx.createShader(type);
  ctx.shaderSource(shader, source);
  ctx.compileShader(shader);
  if(!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
    console.log(ctx.getShaderInfoLog(shader));
    ctx.deleteShader(shader);
    throw 'Shader compilation failed.';
  }
  this.shader = shader;
}

function Program(ctx, vs, fs) {
  var program = ctx.createProgram();
  function attach(s, type) {
    if(s instanceof Shader)
      ctx.attachShader(program, s.shader);
    else
      ctx.attachShader(program, new Shader(ctx, type, s).shader);
  }
  attach(vs, ctx.VERTEX_SHADER);
  attach(fs, ctx.FRAGMENT_SHADER);

  ctx.linkProgram(program);
  if(!ctx.getProgramParameter(program, ctx.LINK_STATUS)) {
    console.log(ctx.getProgramInfoLog(program));
    ctx.deleteProgram(program);
    throw 'Program linking failed.';
  }

  this.program = program;
  const numUniforms = ctx.getProgramParameter(program, ctx.ACTIVE_UNIFORMS);
  for(let i = 0; i < numUniforms; i++) {
    let name = ctx.getActiveUniform(program, i).name;
    if(name.indexOf('[') > 0)
      name = name.substring(0, name.indexOf('['));
    const loc = ctx.getUniformLocation(program, name);
    this[name] = loc;
  }
  const numAttribs = ctx.getProgramParameter(program, ctx.ACTIVE_ATTRIBUTES);
  for(let i = 0; i < numAttribs; i++) {
    const name = ctx.getActiveAttrib(program, i).name;
    const loc = ctx.getAttribLocation(program, name);
    this[name] = loc;
  }
}
