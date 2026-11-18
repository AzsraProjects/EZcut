/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Caméra à l'épaule : dérive douce et continue, avec une légère rotation",
  "CATEGORIES": ["Mouvement"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.35 },
    { "NAME": "vitesse", "LABEL": "Vitesse", "TYPE": "float", "MIN": 0.2, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "rotation", "LABEL": "Rotation", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float noise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }

void main() {
	float t = TIME * vitesse * 2.0;
	// deux octaves : un balancement lent et un tremblement fin par-dessus
	vec2 off = (vec2(noise(t), noise(t + 37.0)) - 0.5) * 0.06 + (vec2(noise(t * 3.1 + 11.0), noise(t * 3.1 + 71.0)) - 0.5) * 0.02;
	off *= intensite;
	float a = (noise(t * 0.8 + 5.0) - 0.5) * 0.10 * rotation * intensite;
	float zoom = 1.0 + 0.12 * intensite; // léger recadrage : les bords ne rentrent jamais dans l'image
	float aspect = RENDERSIZE.x / RENDERSIZE.y;
	vec2 p = isf_FragNormCoord - 0.5;
	p.x *= aspect;
	float c = cos(a); float s = sin(a);
	p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) / zoom;
	p.x /= aspect;
	gl_FragColor = IMG_NORM_PIXEL(inputImage, p + 0.5 + off);
}
