/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Souvenir de vacances : dominante dorée, couleurs un peu passées, coins assombris",
  "CATEGORIES": ["Film"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.8 },
    { "NAME": "chaleur", "LABEL": "Chaleur", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "fondu", "LABEL": "Noirs adoucis", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 },
    { "NAME": "vignette", "LABEL": "Vignettage", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	vec3 c = src.rgb;
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c = mix(vec3(l), c, 1.0 - 0.25 * chaleur);              // couleurs un peu passées
	c *= mix(vec3(1.0), vec3(1.10, 1.01, 0.84), chaleur);   // dominante chaude
	c.b = mix(c.b, c.b * 0.82 + 0.09, chaleur);             // bleu tassé : ombres légèrement violacées, clairs jaunis
	c = c * (1.0 - 0.10 * fondu) + vec3(0.100, 0.085, 0.070) * fondu; // noirs relevés
	// vignettage elliptique : 0 au centre, 1 dans les coins
	vec2 p = (isf_FragNormCoord - 0.5) * 2.0;
	float d = dot(p, p) * 0.5;
	c *= 1.0 - vignette * 0.55 * smoothstep(0.25, 1.0, d);
	gl_FragColor = vec4(mix(src.rgb, clamp(c, 0.0, 1.0), intensite), src.a);
}
