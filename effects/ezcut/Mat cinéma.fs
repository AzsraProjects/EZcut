/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Rendu de film : courbe en S, hautes lumières qui s'éteignent en douceur, noirs mats",
  "CATEGORIES": ["Film"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.85 },
    { "NAME": "contraste", "LABEL": "Courbe en S", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "clairs", "LABEL": "Hautes lumières adoucies", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "noirs", "LABEL": "Noirs mats", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/

// Au-dessus du genou, la courbe s'aplatit progressivement vers le plafond (pente continue au raccord).
vec3 rouler(vec3 x, float genou, float plafond) {
	float e = max(plafond - genou, 0.0001);
	vec3 r = max(x - vec3(genou), vec3(0.0));
	return min(x, vec3(genou)) + e * (vec3(1.0) - exp(-r / e));
}

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	vec3 c = clamp(src.rgb, 0.0, 1.0);
	c = mix(c, c * c * (3.0 - 2.0 * c), contraste * 0.8);
	c = rouler(c, 1.0 - 0.5 * clairs, 1.0 - 0.06 * clairs);
	// noirs mats : le noir remonte, le blanc ne bouge pas
	float m = 0.07 * noirs;
	c = vec3(m) + c * (1.0 - m);
	// couleurs très légèrement retenues, comme sur une copie film
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c = mix(vec3(l), c, 0.92);
	gl_FragColor = vec4(mix(src.rgb, c, intensite), src.a);
}
