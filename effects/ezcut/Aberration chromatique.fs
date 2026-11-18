/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Franges colorées qui s'accentuent vers les bords, comme avec un vieil objectif",
  "CATEGORIES": ["Stylize"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "quantite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.3 },
    { "NAME": "bords", "LABEL": "Concentrée sur les bords", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "centre", "LABEL": "Centre", "TYPE": "point2D", "MIN": [0.0, 0.0], "MAX": [1.0, 1.0], "DEFAULT": [0.5, 0.5] }
  ]
}*/

void main() {
	vec2 uv = isf_FragNormCoord;
	float aspect = RENDERSIZE.x / RENDERSIZE.y;
	vec2 dir = uv - centre;
	// distance au centre : 1 dans un coin quand le centre est au milieu
	float r = length(dir * vec2(aspect, 1.0)) / length(vec2(aspect, 1.0) * 0.5);
	float force = quantite * 0.03 * mix(1.0, r * r, bords);
	// dix lectures le long du rayon, pondérées comme un spectre (rouge, vert, bleu) : des franges
	// continues plutôt que trois images décalées. Le vert est centré : l'image ne se déplace pas.
	vec3 somme = vec3(0.0);
	vec3 poids = vec3(0.0);
	for (int i = 0; i < 10; i++) {
		float t = float(i) / 9.0;
		vec3 w = vec3(clamp(1.0 - 2.0 * t, 0.0, 1.0), 1.0 - abs(2.0 * t - 1.0), clamp(2.0 * t - 1.0, 0.0, 1.0));
		vec2 p = uv + dir * ((0.5 - t) * 2.0 * force);
		somme += IMG_NORM_PIXEL(inputImage, p).rgb * w;
		poids += w;
	}
	gl_FragColor = vec4(somme / poids, IMG_THIS_PIXEL(inputImage).a);
}
