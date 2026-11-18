/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Cross-process : une pellicule développée dans le mauvais bain, couleurs décalées et contraste marqué",
  "CATEGORIES": ["Film"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.75 },
    { "NAME": "style", "LABEL": "Dominante", "TYPE": "long", "VALUES": [0, 1], "LABELS": ["Jaune-vert", "Bleu-magenta"], "DEFAULT": 0 },
    { "NAME": "force", "LABEL": "Décalage des courbes", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.7 },
    { "NAME": "saturation", "LABEL": "Saturation", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	vec3 c = clamp(src.rgb, 0.0, 1.0);
	vec3 s = c * c * (3.0 - 2.0 * c); // courbe en S de chaque canal
	vec3 x;
	if (style == 0) {
		// rouge et vert contrastés, bleu tassé : clairs jaune-vert, ombres bleutées
		x = vec3(mix(c.r, s.r, 0.9), mix(c.g, s.g, 0.6) * 0.97 + 0.03, c.b * 0.62 + 0.16);
	} else {
		// l'inverse : bleu contrasté, rouge tassé, vert en retrait : clairs bleus, ombres rougeâtres
		x = vec3(c.r * 0.66 + 0.15, mix(c.g, s.g, 0.5) * 0.94, mix(c.b, s.b, 0.9));
	}
	x = mix(c, x, force);
	float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
	x = vec3(l) + (x - vec3(l)) * (0.8 + 0.6 * saturation);
	gl_FragColor = vec4(mix(src.rgb, clamp(x, 0.0, 1.0), intensite), src.a);
}
