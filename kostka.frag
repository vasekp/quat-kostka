#version 300 es

precision highp float;
in vec2 oPos;
out vec4 color;

const float brightness = 0.4;

void main() {
  float d = max(1.0 - pow(length(oPos) * 2.0, 2.0), 0.0) * brightness;
  //float d = exp(-pow(length(oPos) * 2.0, 2.0) * 5.0) * brightness;
  color = vec4(1.0, 0.95, 0.5, d);
}
