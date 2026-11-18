/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Secousses sèches et rapides, comme un séisme ou une basse saturée",
  "CATEGORIES": ["Mouvement"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 },
    { "NAME": "frequence", "LABEL": "Fréquence", "TYPE": "float", "MIN": 6.0, "MAX": 60.0, "DEFAULT": 24.0 },
    { "NAME": "couleurs", "LABEL": "Décalage des couleurs", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.3 }
  ]
}*/

float hash(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
	float f = floor(TIME * frequence); // une nouvelle position à chaque pas, sans transition
	vec2 off = (vec2(hash(f), hash(f + 91.0)) - 0.5) * 0.10 * intensite;
	float zoom = 1.0 + 0.12 * intensite;
	vec2 uv = (isf_FragNormCoord - 0.5) / zoom + 0.5 + off;
	vec2 split = off * couleurs * 0.6;
	float r = IMG_NORM_PIXEL(inputImage, uv + split).r;
	vec4 g = IMG_NORM_PIXEL(inputImage, uv);
	float b = IMG_NORM_PIXEL(inputImage, uv - split).b;
	gl_FragColor = vec4(r, g.g, b, g.a);
}
