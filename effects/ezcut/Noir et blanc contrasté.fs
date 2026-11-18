/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Noir et blanc profond, avec un filtre coloré comme en photo argentique : le rouge assombrit le ciel, le vert éclaircit les feuillages",
  "CATEGORIES": ["Color Effect"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 1.0 },
    { "NAME": "contraste", "LABEL": "Contraste", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "filtreCouleur", "LABEL": "Filtre coloré", "TYPE": "long", "VALUES": [0, 1, 2, 3, 4, 5], "LABELS": ["Aucun", "Rouge", "Orange", "Jaune", "Vert", "Bleu"], "DEFAULT": 2 }
  ]
}*/

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	// part de chaque canal dans le gris : c'est ce que fait un filtre coloré devant l'objectif
	vec3 poids = vec3(0.2126, 0.7152, 0.0722);
	if (filtreCouleur == 1) poids = vec3(0.80, 0.25, -0.05);
	else if (filtreCouleur == 2) poids = vec3(0.55, 0.45, 0.00);
	else if (filtreCouleur == 3) poids = vec3(0.40, 0.55, 0.05);
	else if (filtreCouleur == 4) poids = vec3(0.15, 0.85, 0.00);
	else if (filtreCouleur == 5) poids = vec3(0.10, 0.30, 0.60);
	float g = clamp(dot(src.rgb, poids), 0.0, 1.0);
	// courbe en S, appliquée une puis deux fois : le contraste monte sans jamais inverser les tons
	float s1 = g * g * (3.0 - 2.0 * g);
	float s2 = s1 * s1 * (3.0 - 2.0 * s1);
	float k = clamp(contraste, 0.0, 1.0) * 2.0;
	g = k < 1.0 ? mix(g, s1, k) : mix(s1, s2, k - 1.0);
	gl_FragColor = vec4(mix(src.rgb, vec3(g), intensite), src.a);
}
