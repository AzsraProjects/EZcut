/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Image passée : noirs relevés, blancs tassés, couleurs atténuées",
  "CATEGORIES": ["Film"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.8 },
    { "NAME": "noirs", "LABEL": "Noirs relevés", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "delave", "LABEL": "Couleurs délavées", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.45 },
    { "NAME": "chaleur", "LABEL": "Froid / chaud", "TYPE": "float", "MIN": -1.0, "MAX": 1.0, "DEFAULT": 0.15 }
  ]
}*/

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	vec3 c = src.rgb;
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c = mix(vec3(l), c, 1.0 - 0.65 * delave);
	// la plage de tons se resserre : le noir devient un gris légèrement bleuté, le blanc perd son éclat
	float bas = 0.13 * noirs;
	float haut = 1.0 - 0.05 * noirs;
	c = bas * vec3(0.95, 1.00, 1.06) + c * (haut - bas);
	c += vec3(0.035, 0.005, -0.040) * chaleur;
	gl_FragColor = vec4(mix(src.rgb, clamp(c, 0.0, 1.0), intensite), src.a);
}
