/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Assombrit (ou colore) les bords pour ramener le regard vers le centre",
  "CATEGORIES": ["Film"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "rayon", "LABEL": "Rayon", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "douceur", "LABEL": "Douceur", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "couleur", "LABEL": "Couleur", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.0, 1.0] }
  ]
}*/

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	float aspect = RENDERSIZE.x / RENDERSIZE.y;
	vec2 p = (isf_FragNormCoord - 0.5) * 2.0;           // ±1 aux bords : ellipse qui épouse le cadre
	vec2 q = p * vec2(aspect, 1.0) / max(aspect, 1.0);  // même repère, mais circulaire
	float d = length(mix(p, q, 0.5));                   // compromis entre les deux, comme un vrai objectif
	float debut = rayon * 1.2;
	float m = smoothstep(debut, debut + 0.05 + douceur * 1.2, d);
	gl_FragColor = vec4(mix(src.rgb, couleur.rgb, m * intensite), src.a);
}
