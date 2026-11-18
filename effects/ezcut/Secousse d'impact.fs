/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Un choc bref qui s'amortit, répété à intervalle régulier : coup, chute, explosion",
  "CATEGORIES": ["Mouvement"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "intervalle", "LABEL": "Intervalle (s)", "TYPE": "float", "MIN": 0.3, "MAX": 5.0, "DEFAULT": 1.5 },
    { "NAME": "amorti", "LABEL": "Amorti", "TYPE": "float", "MIN": 2.0, "MAX": 14.0, "DEFAULT": 6.0 }
  ]
}*/

float hash(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
	float phase = mod(TIME, intervalle);
	float env = exp(-phase * amorti); // 1 à l'impact, puis décroît
	float f = floor(TIME * 30.0);
	vec2 off = (vec2(hash(f), hash(f + 91.0)) - 0.5) * 0.14 * intensite * env;
	float zoom = 1.0 + (0.04 + 0.10 * env) * intensite;
	vec2 uv = (isf_FragNormCoord - 0.5) / zoom + 0.5 + off;
	gl_FragColor = IMG_NORM_PIXEL(inputImage, uv);
}
