/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Cassette vidéo : couleurs qui bavent, lignes de balayage, image instable et neige",
  "CATEGORIES": ["Retro"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.85 },
    { "NAME": "bavure", "LABEL": "Bavure des couleurs", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "lignes", "LABEL": "Lignes de balayage", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 },
    { "NAME": "tracking", "LABEL": "Instabilité (tracking)", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 },
    { "NAME": "bruit", "LABEL": "Neige", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/

float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p, float graine) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + graine) * 43758.5453); }
float vnoise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash11(i), hash11(i + 1.0), f); }

// luminance + deux composantes de couleur, comme le signal d'une cassette
vec3 versYIQ(vec3 c) {
	return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
}
vec3 versRVB(vec3 y) {
	return vec3(y.x + 0.956 * y.y + 0.621 * y.z, y.x - 0.272 * y.y - 0.647 * y.z, y.x - 1.106 * y.y + 1.703 * y.z);
}

void main() {
	vec2 uv = isf_FragNormCoord;
	vec4 src = IMG_THIS_PIXEL(inputImage);
	// l'effet est décrit pour une image de 480 lignes, puis mis à l'échelle : même rendu en vignette et à l'export
	float echelle = RENDERSIZE.y / 480.0;
	float pas = echelle / RENDERSIZE.x;
	float t = mod(TIME, 600.0);
	float graine = mod(floor(TIME * 30.0), 512.0) * 1.37; // un nouveau tirage de neige 30 fois par seconde
	// lignes de balayage : un nombre entier de pixels par ligne, pour éviter le moiré
	float hauteurLigne = max(3.0, floor(RENDERSIZE.y / 240.0 + 0.5));
	float nbLignes = RENDERSIZE.y / hauteurLigne;
	float ligne = floor(uv.y * nbLignes);

	// instabilité horizontale : chaque ligne flotte un peu
	float dx = (vnoise(ligne * 0.35 + t * 9.0) - 0.5) * 0.004 * tracking;
	// bande de tracking qui remonte lentement dans l'image
	float bandeT = (1.0 - smoothstep(0.0, 0.06, abs(uv.y - fract(t * 0.11)))) * tracking;
	dx += bandeT * (vnoise(ligne * 1.3 + t * 40.0) - 0.5) * 0.05;
	// commutation de tête : le bas de l'image se déchire
	float bas = (1.0 - smoothstep(0.0, 0.035, uv.y)) * tracking;
	dx += bas * bas * 0.04 * (0.5 + vnoise(t * 13.0));
	vec2 p = vec2(uv.x + dx, uv.y);

	// luminance légèrement adoucie
	float y = 0.5 * versYIQ(IMG_NORM_PIXEL(inputImage, p).rgb).x
		+ 0.25 * versYIQ(IMG_NORM_PIXEL(inputImage, vec2(p.x - pas, p.y)).rgb).x
		+ 0.25 * versYIQ(IMG_NORM_PIXEL(inputImage, vec2(p.x + pas, p.y)).rgb).x;
	// couleur étalée sur plusieurs pixels et en retard sur la luminance : elle bave vers la droite
	float etal = (0.3 + 1.4 * bavure) * pas;
	vec2 iq = vec2(0.0);
	float poids = 0.0;
	for (int i = 0; i < 8; i++) {
		float fi = float(i) - 2.0;
		float w = exp(-0.18 * (fi - 1.5) * (fi - 1.5));
		iq += versYIQ(IMG_NORM_PIXEL(inputImage, vec2(p.x - fi * etal, p.y)).rgb).yz * w;
		poids += w;
	}
	iq /= poids;
	vec3 c = versRVB(vec3(y, iq));

	// rendu magnétique : noirs relevés, blancs tassés
	c = c * 0.90 + vec3(0.04);
	c *= 1.0 - lignes * 0.22 * (0.5 + 0.5 * cos(uv.y * nbLignes * 6.2831853));
	// neige fine, étirée horizontalement, plus dense dans les zones instables
	vec2 grain = vec2(floor(uv.x * RENDERSIZE.x / (3.0 * echelle)), floor(uv.y * RENDERSIZE.y / echelle));
	c += vec3((hash21(grain, graine) - 0.5) * 0.10 * bruit * (1.0 + 3.0 * bandeT + 2.0 * bas));
	// éclats blancs : courtes traînées horizontales, rares
	if (hash21(vec2(ligne, 3.0), graine) > 1.0 - 0.012 * bruit) {
		float x0 = hash21(vec2(ligne, 9.0), graine);
		c += vec3(0.5 * step(x0, uv.x) * (1.0 - smoothstep(0.0, 0.08, uv.x - x0)));
	}
	gl_FragColor = vec4(mix(src.rgb, clamp(c, 0.0, 1.0), intensite), src.a);
}
