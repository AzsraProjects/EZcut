/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Ton sépia de vieille photo, avec des blancs crème et des noirs adoucis",
  "CATEGORIES": ["Color Effect"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.8 },
    { "NAME": "ton", "LABEL": "Chaleur du ton", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "fondu", "LABEL": "Noirs adoucis", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.35 }
  ]
}*/

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	float l = clamp(dot(src.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
	// un gamma différent par canal : les tons moyens virent au brun, le noir et le blanc restent neutres
	float k = 0.4 + 1.2 * ton;
	vec3 sep = pow(vec3(l), vec3(1.0 - 0.20 * k, 1.0, 1.0 + 0.45 * k));
	// noirs relevés vers le brun, blancs légèrement crème
	sep = sep * (1.0 - 0.10 * fondu) + vec3(0.100, 0.075, 0.055) * fondu;
	gl_FragColor = vec4(mix(src.rgb, sep, intensite), src.a);
}
