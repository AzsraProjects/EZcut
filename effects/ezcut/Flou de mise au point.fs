/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Garde une zone nette (bande ou cercle) et floute le reste : effet maquette, ou regard guidé vers le sujet",
  "CATEGORIES": ["Blur"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "forme", "LABEL": "Zone nette", "TYPE": "long", "VALUES": [0, 1], "LABELS": ["Bande", "Cercle"], "DEFAULT": 0 },
    { "NAME": "centre", "LABEL": "Centre", "TYPE": "point2D", "MIN": [0.0, 0.0], "MAX": [1.0, 1.0], "DEFAULT": [0.5, 0.5] },
    { "NAME": "taille", "LABEL": "Taille de la zone nette", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.3 },
    { "NAME": "transition", "LABEL": "Transition", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 },
    { "NAME": "rayon", "LABEL": "Flou", "TYPE": "float", "MIN": 0.0, "MAX": 100.0, "DEFAULT": 40.0 },
    { "NAME": "angle", "LABEL": "Angle de la bande (°)", "TYPE": "float", "MIN": -90.0, "MAX": 90.0, "DEFAULT": 0.0 }
  ],
  "PASSES": [
    { "TARGET": "reduit", "WIDTH": "$WIDTH/4.0", "HEIGHT": "$HEIGHT/4.0" },
    { "TARGET": "flouH", "WIDTH": "$WIDTH/4.0", "HEIGHT": "$HEIGHT/4.0" },
    { "TARGET": "flouV", "WIDTH": "$WIDTH/4.0", "HEIGHT": "$HEIGHT/4.0" },
    {}
  ]
}*/

// Passe 0 : réduction au quart. Passes 1 et 2 : flou gaussien horizontal puis vertical, dont la force
// dépend de la distance à la zone nette. Passe 3 : l'image d'origine reste intacte dans la zone nette
// et laisse place à la version floue à mesure qu'on s'en éloigne.

// 0 dans la zone nette, 1 là où le flou est maximal
float horsZone(vec2 uv) {
	vec2 dim = IMG_SIZE(inputImage);
	vec2 p = uv - centre;
	p.x *= dim.x / dim.y;
	float d;
	if (forme == 1) {
		d = length(p);
	} else {
		float a = radians(angle);
		d = abs(dot(p, vec2(-sin(a), cos(a)))); // distance à l'axe de la bande
	}
	float bord = taille * 0.5;
	return smoothstep(bord, bord + 0.02 + transition * 0.5, d);
}

// écart-type maximal du flou, en pixels de l'image d'origine (rayon donné pour 1080 lignes)
float sigmaMax() {
	vec2 dim = IMG_SIZE(inputImage);
	return rayon * 0.32 * min(dim.x, dim.y) / 1080.0;
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
	float z = horsZone(uv);
	if (PASSINDEX == 0) {
		// moyenne exacte de 4 × 4 pixels en 4 lectures bilinéaires
		vec2 px = 1.0 / IMG_SIZE(inputImage);
		gl_FragColor = 0.25 * (IMG_NORM_PIXEL(inputImage, uv + px * vec2(-1.0, -1.0)) + IMG_NORM_PIXEL(inputImage, uv + px * vec2(1.0, -1.0))
			+ IMG_NORM_PIXEL(inputImage, uv + px * vec2(-1.0, 1.0)) + IMG_NORM_PIXEL(inputImage, uv + px * vec2(1.0, 1.0)));
	} else if (PASSINDEX == 1) {
		// pas = 3 écarts-types / 16 lectures, en pixels de la cible (quart de résolution)
		float pas = z * sigmaMax() * 0.25 * 0.1875;
		gl_FragColor = gauss1D(reduit, uv, vec2(pas / RENDERSIZE.x, 0.0));
	} else if (PASSINDEX == 2) {
		float pas = z * sigmaMax() * 0.25 * 0.1875;
		gl_FragColor = gauss1D(flouH, uv, vec2(0.0, pas / RENDERSIZE.y));
	} else {
		vec4 net = IMG_THIS_PIXEL(inputImage);
		vec4 flou = IMG_NORM_PIXEL(flouV, uv);
		// la version floue prend le relais dès que le flou local dépasse quelques pixels
		float m = smoothstep(0.0, 1.0, z * sigmaMax() / 4.0);
		gl_FragColor = mix(net, flou, m);
	}
}
