/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Ambiance froide : dominante bleue, couleurs retenues, ombres profondes",
  "CATEGORIES": ["Color Effect"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.75 },
    { "NAME": "froid", "LABEL": "Froid", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "desaturation", "LABEL": "Couleurs retenues", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.3 },
    { "NAME": "contraste", "LABEL": "Contraste", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.3 }
  ]
}*/

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	vec3 c = src.rgb;
	float l = luma(c);
	c *= mix(vec3(1.0), vec3(0.86, 0.98, 1.12), froid); // balance des blancs vers le bleu
	// les ombres se teintent davantage que les hautes lumières ; le noir pur reste noir
	c += vec3(-0.020, 0.000, 0.045) * froid * (1.0 - l) * smoothstep(0.0, 0.15, l);
	c = mix(vec3(luma(c)), c, 1.0 - 0.6 * desaturation);
	c = clamp(c, 0.0, 1.0);
	c = mix(c, c * c * (3.0 - 2.0 * c), contraste * 0.8);
	gl_FragColor = vec4(mix(src.rgb, c, intensite), src.a);
}
