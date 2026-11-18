/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Flou lisse et régulier, du léger voile au flou d'arrière-plan",
  "CATEGORIES": ["Blur"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "rayon", "LABEL": "Rayon", "TYPE": "float", "MIN": 0.0, "MAX": 100.0, "DEFAULT": 25.0 }
  ],
  "PASSES": [
    { "TARGET": "passeA" },
    { "TARGET": "passeB" },
    { "TARGET": "passeC", "WIDTH": "$WIDTH/4.0", "HEIGHT": "$HEIGHT/4.0" },
    { "TARGET": "passeD", "WIDTH": "$WIDTH/4.0", "HEIGHT": "$HEIGHT/4.0" },
    {}
  ]
}*/

// Flou gaussien séparable. Les passes A et B font un flou fin en pleine résolution (horizontal puis vertical).
// Au-delà, les passes C et D prolongent le flou au quart de la résolution : l'image y est déjà assez lisse
// pour être lue avec un pas plus grand sans créneaux, ce qui garde le flou lisse même à grand rayon.

// Gaussienne 1D tronquée à 3 écarts-types : 2 × taps + 1 lectures espacées de « pas ».
vec4 gauss1D(sampler2D src, vec2 uv, vec2 pas, int taps) {
	vec4 somme = texture2D(src, uv);
	float poids = 1.0;
	float inv = 1.0 / float(taps);
	for (int k = 1; k <= 16; k++) {
		if (k > taps) break;
		float x = float(k) * inv;
		float w = exp(-4.5 * x * x);
		vec2 d = pas * float(k);
		somme += (texture2D(src, uv + d) + texture2D(src, uv - d)) * w;
		poids += 2.0 * w;
	}
	return somme / poids;
}

void main() {
	vec2 uv = isf_FragNormCoord;
	vec2 dim = IMG_SIZE(inputImage);
	vec2 px = 1.0 / dim;
	// le rayon est donné pour une image de 1080 lignes : même rendu en vignette, à l'aperçu et à l'export
	float sigma = rayon * 0.32 * min(dim.x, dim.y) / 1080.0;  // écart-type total, en pixels
	float s0 = min(sigma, 4.0);                               // part faite en pleine résolution
	float s1 = sqrt(max(sigma * sigma - s0 * s0, 0.0));       // le reste, fait au quart
	if (PASSINDEX == 0) {
		gl_FragColor = gauss1D(inputImage, uv, vec2(px.x * s0 * 0.375, 0.0), 8);
	} else if (PASSINDEX == 1) {
		gl_FragColor = gauss1D(passeA, uv, vec2(0.0, px.y * s0 * 0.375), 8);
	} else if (PASSINDEX == 2) {
		gl_FragColor = gauss1D(passeB, uv, vec2(px.x * s1 * 0.1875, 0.0), 16);
	} else if (PASSINDEX == 3) {
		gl_FragColor = gauss1D(passeC, uv, vec2(0.0, px.y * s1 * 0.1875), 16);
	} else {
		vec4 fin = IMG_NORM_PIXEL(passeB, uv);
		vec4 large = IMG_NORM_PIXEL(passeD, uv);
		gl_FragColor = mix(fin, large, clamp((sigma - 4.0) / 2.0, 0.0, 1.0));
	}
}
