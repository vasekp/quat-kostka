#version 300 es

uniform mat4 mProj;
uniform vec4 qView;
uniform vec4 qView2;
in vec3 iPos;
out vec2 oPos;
const float scale = 0.02;

const vec2 corners[] = vec2[](
  vec2(-0.866, -0.5),
  vec2(0.866, -0.5),
  vec2(0.0, 1.0)
);

vec4 qmul(vec4 a, vec4 b) {
  return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz));
}

vec4 qconj(vec4 q) {
  return vec4(-q.xyz, q.w);
}

vec3 qrot(vec3 v, vec4 q) {
  return qmul(qmul(q, vec4(v, 0.0)), qconj(q)).xyz;
}

void main() {
  oPos = corners[gl_VertexID];
  gl_Position = mProj * (vec4(qrot(qrot(iPos, qView), qView2), 1.0) + vec4(oPos * scale, 0.0, 0.0));
}
