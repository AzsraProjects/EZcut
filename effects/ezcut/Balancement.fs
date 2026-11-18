/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "L'image penche doucement d'un côté puis de l'autre",
  "CATEGORIES": ["Mouvement"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "angle", "LABEL": "Angle (°)", "TYPE": "float", "MIN": 0.0, "MAX": 20.0, "DEFAULT": 4.0 },
    { "NAME": "vitesse", "LABEL": "Vitesse", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
	float a = sin(TIME * vitesse * 2.0) * radians(angle);
	float aspect = RENDERSIZE.x / RENDERSIZE.y;
	// recadrage juste suffisant pour que les coins restent couverts à l'angle maximal
	float m = radians(angle);
	float zoom = cos(m) + sin(m) * max(aspect, 1.0 / aspect);
	vec2 p = isf_FragNormCoord - 0.5;
	p.x *= aspect;
	float c = cos(a); float s = sin(a);
	p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) / zoom;
	p.x /= aspect;
	gl_FragColor = IMG_NORM_PIXEL(inputImage, p + 0.5);
}
