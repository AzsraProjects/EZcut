/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "L'image tourne lentement en se rapprochant : plan penché animé, tension qui monte",
  "CATEGORIES": ["Mouvement"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "quantite", "LABEL": "Zoom", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.15 },
    { "NAME": "vitesse", "LABEL": "Rotation (° par seconde)", "TYPE": "float", "MIN": -30.0, "MAX": 30.0, "DEFAULT": 2.0 },
    { "NAME": "depart", "LABEL": "Inclinaison de départ (°)", "TYPE": "float", "MIN": -45.0, "MAX": 45.0, "DEFAULT": 0.0 }
  ]
}*/

void main() {
	float aspect = RENDERSIZE.x / RENDERSIZE.y;
	float a = radians(depart + vitesse * TIME);
	float c = cos(a);
	float s = sin(a);
	// recadrage juste suffisant pour que les coins restent couverts à l'angle courant
	float couverture = abs(c) + abs(s) * max(aspect, 1.0 / aspect);
	float zoom = couverture * (1.0 + quantite * EZ_PROGRESS);
	vec2 p = isf_FragNormCoord - 0.5;
	p.x *= aspect;
	p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) / zoom;
	p.x /= aspect;
	gl_FragColor = IMG_NORM_PIXEL(inputImage, p + 0.5);
}
