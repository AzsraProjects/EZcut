/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Grain argentique vivant, plus présent dans les tons moyens que dans les noirs et les blancs",
  "CATEGORIES": ["Film"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.45 },
    { "NAME": "taille", "LABEL": "Taille du grain", "TYPE": "float", "MIN": 1.0, "MAX": 4.0, "DEFAULT": 1.6 },
    { "NAME": "chroma", "LABEL": "Grain coloré", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.25 },
    { "NAME": "anime", "LABEL": "Animé", "TYPE": "bool", "DEFAULT": true }
  ]
}*/

float hash21(vec2 p, float graine) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + graine) * 43758.5453); }

// bruit de valeur lissé : des grains aux bords doux plutôt que des carrés
float vnoise(vec2 p, float graine) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash21(i, graine);
	float b = hash21(i + vec2(1.0, 0.0), graine);
	float c = hash21(i + vec2(0.0, 1.0), graine);
	float d = hash21(i + vec2(1.0, 1.0), graine);
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	// la taille est donnée pour une image de 1080 lignes : même aspect en vignette et à l'export
	float cote = max(taille * min(RENDERSIZE.x, RENDERSIZE.y) / 1080.0, 1.0);
	vec2 p = isf_FragNormCoord * RENDERSIZE / cote;
	// un nouveau tirage à chaque image
	float graine = anime ? mod(float(FRAMEINDEX), 256.0) * 1.618 : 0.0;
	float n1 = vnoise(p, graine);
	float n2 = vnoise(p + vec2(31.7, 17.3), graine + 11.0);
	float n3 = vnoise(p + vec2(5.9, 47.1), graine + 23.0);
	// somme de deux tirages : répartition en cloche, plus naturelle
	float mono = n1 + n2 - 1.0;
	vec3 g = mix(vec3(mono), vec3(n1, n2, n3) * 2.0 - vec3(1.0), chroma);
	// plus fort dans les tons moyens, discret dans les noirs et les blancs
	float l = clamp(dot(src.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
	float w = mix(0.3, 1.0, 4.0 * l * (1.0 - l));
	gl_FragColor = vec4(clamp(src.rgb + g * intensite * 0.22 * w, 0.0, 1.0), src.a);
}
