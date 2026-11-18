/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Couleurs vives et image tonique, sans saturer ce qui l'est déjà ni rougir les visages",
  "CATEGORIES": ["Color Effect"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.8 },
    { "NAME": "vibrance", "LABEL": "Vibrance", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "contraste", "LABEL": "Contraste", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.35 }
  ]
}*/

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	vec3 c = src.rgb;
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	// vibrance : les couleurs ternes gagnent plus que les couleurs déjà vives
	float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
	// tons chair (rouge > vert > bleu) : poussés deux fois moins
	float peau = smoothstep(0.0, 0.12, c.r - c.g) * smoothstep(0.0, 0.12, c.g - c.b);
	float gain = 1.0 + vibrance * 1.3 * (1.0 - sat) * (1.0 - 0.5 * peau);
	c = vec3(l) + (c - vec3(l)) * gain;
	// contraste doux
	c = clamp(c, 0.0, 1.0);
	c = mix(c, c * c * (3.0 - 2.0 * c), contraste * 0.7);
	gl_FragColor = vec4(mix(src.rgb, c, intensite), src.a);
}
