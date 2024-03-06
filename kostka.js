const quats = {
  cur: [0.0, 0.0, 0.0, 1.0],
  tmp: [0.0, 0.0, 0.0, 1.0],
  rot: [0.0, 0.0, 0.0]
};

const viewAngle = 40.0;

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
  const data = new Float32Array(await fetch('coords.data').then(r => r.arrayBuffer()));
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(0, 1);

  const views = new Float32Array(await fetch('quats.data').then(r => r.arrayBuffer()));

  let lastT;
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
      if(dt < 1000) {
        const rot = qexp(quats.rot, dt);
        const q = qmul(rot, quats.cur);
        const n = qnorm(q, q);
        quats.cur = [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
      }
    }
    lastT = time;

    gl.uniform4fv(prog.qView, quats.cur);
    gl.uniform4fv(prog.qView2, quats.tmp);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, 10000);

    requestAnimationFrame(drawFrame);
  }

  let pid, pcoords;
  const hist = [];

  canvas.addEventListener('pointerdown', ev => {
    if(pid === undefined) {
      pid = ev.pointerId;
      canvas.setPointerCapture(pid);
      ev.preventDefault();
      pcoords = [ev.clientX, ev.clientY];
      hist.length = 0;
      hist.push({ t: performance.now(), q: quats.tmp });
      quats.rot = [0.0, 0.0, 0.0];
    }
  });

  canvas.addEventListener('pointermove', ev => {
    if(pid !== undefined) {
      const coords = [ev.clientX, ev.clientY];
      const angle = viewAngle * Math.PI / 180.0 * 3.0;
      const ax = (coords[0] - pcoords[0]) / canvas.height * 2 * angle;
      const ay = -(coords[1] - pcoords[1]) / canvas.height * 2 * angle;
      quats.tmp = qmul(
        [Math.sin(ay / 2), 0, 0, Math.cos(ay / 2)],
        [0, Math.sin(ax / 2), 0, Math.cos(ax / 2)]);
      const now = performance.now();
      hist.push({ t: performance.now(), q: quats.tmp });
      hist.splice(0, hist.findIndex(rec => rec.t >= now - 100));
    }
  });

  canvas.addEventListener('pointerup', ev => {
    if(pid !== undefined) {
      quats.cur = qmul(quats.tmp, quats.cur);
      const now = performance.now();
      hist.splice(0, hist.findIndex(rec => rec[0] >= now - 100));
      if(hist.length >= 2 && hist.at(-1).t != hist[0].t && now - hist.at(-1).t < 10) {
        const dt = hist.at(-1).t - hist[0].t;
        const dq = qmul(hist.at(-1).q, qconj(hist[0].q));
        quats.rot = qlog0(dq, dt);
      } else
        quats.rot = [0.0, 0.0, 0.0];
    }
    quats.tmp = [0.0, 0.0, 0.0, 1.0];
    canvas.releasePointerCapture(pid);
    pid = undefined;
  });

  canvas.addEventListener('pointercancel', ev => {
    quats.tmp = [0.0, 0.0, 0.0, 1.0];
    canvas.releasePointerCapture(pid);
    pid = undefined;
  });

  canvas.addEventListener('dblclick', ev => {
    const i = Math.floor(Math.random() * 6);
    quats.cur = [...views.subarray(i * 4, (i + 1) * 4)];
  });

  requestAnimationFrame(drawFrame);
});

function qmul(q1, q2) {
  return [
    q1[3] * q2[0] + q2[3] * q1[0] + q1[1] * q2[2] - q1[2] * q2[1],
    q1[3] * q2[1] + q2[3] * q1[1] + q1[2] * q2[0] - q1[0] * q2[2],
    q1[3] * q2[2] + q2[3] * q1[2] + q1[0] * q2[1] - q1[1] * q2[0],
    q1[3] * q2[3] - q1[0] * q2[0] - q1[1] * q2[1] - q1[2] * q2[2],
  ];
}

function qconj(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

function qnorm(q) {
  return q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3];
}

function qlog0(q, div) { // assumes q.q == 1, q[3] != -1
  const a = Math.acos(q[3]);
  if(a == 0.0)
    return [0.0, 0.0, 0.0];
  else {
    const m = a / Math.sin(a) / div;
    return [m * q[0], m * q[1], m * q[2]];
  }
}

function qexp(v, mul) {
  const a = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if(a == 0)
    return [0.0, 0.0, 0.0, 1.0];
  else {
    const sa = Math.sin(a * mul);
    return [v[0] / a * sa, v[1] / a * sa, v[2] / a * sa, Math.cos(a * mul)];
  }
}

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
