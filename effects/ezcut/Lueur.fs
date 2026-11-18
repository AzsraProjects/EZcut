/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Les zones claires rayonnent : halo doux autour des lumières, ambiance rêveuse",
  "CATEGORIES": ["Stylize"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "seuil", "LABEL": "Seuil de luminosité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "rayon", "LABEL": "Rayon", "TYPE": "float", "MIN": 0.0, "MAX": 100.0, "DEFAULT": 50.0 },
    { "NAME": "teinte", "LABEL": "Teinte du halo", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] }
  ],
  "PASSES": [
    { "TARGET": "clairs", "WIDTH": "$WIDTH/4.0", "HEIGHT": "$HEIGHT/4.0" },
    { "TARGET": "lueurH", "WIDTH": "$WIDTH/4.0", "HEIGHT": "$HEIGHT/4.0" },
    { "TARGET": "lueurV", "WIDTH": "$WIDTH/4.0", "HEIGHT": "$HEIGHT/4.0" },
    {}
  ]
}*/

// Passe 0 : ne garde que les zones claires, au quart de la résolution. Passes 1 et 2 : flou gaussien
// horizontal puis vertical. Passe 3 : le halo s'ajoute à l'image d'origine.

// ce qui dépasse le seuil, avec une entrée progressive pour éviter les contours durs
vec3 auDessusDuSeuil(vec2 p) {
	vec3 c = IMG_NORM_PIXEL(inputImage, p).rgb;
	float m = max(c.r, max(c.g, c.b));
	return c * smoothstep(seuil - 0.08, seuil + 0.08, m);
}

// Gaussienne 1D tronquée à 3 écarts-types : 33 lectures espacées de « pas »
vec4 gauss1D(sampler2D src, vec2 uv, vec2 pas) {
	vec4 somme = texture2D(src, uv);
	float poids = 1.0;
	for (int k = 1; k <= 16; k++) {
		float x = float(k) / 16.0;
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
	// écart-type du halo en pixels de la cible au quart (rayon donné pour une image de 1080 lignes)
	float sigma = rayon * 0.32 * min(dim.x, dim.y) / 1080.0 * 0.25;
	float pas = sigma * 0.1875; // 3 écarts-types répartis sur 16 lectures
	if (PASSINDEX == 0) {
		vec2 px = 1.0 / dim;
		vec3 c = 0.25 * (auDessusDuSeuil(uv + px * vec2(-1.0, -1.0)) + auDessusDuSeuil(uv + px * vec2(1.0, -1.0))
			+ auDessusDuSeuil(uv + px * vec2(-1.0, 1.0)) + auDessusDuSeuil(uv + px * vec2(1.0, 1.0)));
		gl_FragColor = vec4(c, 1.0);
	} else if (PASSINDEX == 1) {
		gl_FragColor = gauss1D(clairs, uv, vec2(pas / RENDERSIZE.x, 0.0));
	} else if (PASSINDEX == 2) {
		gl_FragColor = gauss1D(lueurH, uv, vec2(0.0, pas / RENDERSIZE.y));
	} else {
		vec4 src = IMG_THIS_PIXEL(inputImage);
		vec3 halo = clamp(IMG_NORM_PIXEL(lueurV, uv).rgb * teinte.rgb * intensite * 1.5, 0.0, 1.0);
		// fusion « écran » : éclaircit sans brûler les blancs
		gl_FragColor = vec4(vec3(1.0) - (vec3(1.0) - src.rgb) * (vec3(1.0) - halo), src.a);
	}
}
