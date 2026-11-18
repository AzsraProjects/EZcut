/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Zoom arrière progressif sur toute la durée du clip",
  "CATEGORIES": ["Mouvement"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "quantite", "LABEL": "Amplitude", "TYPE": "float", "MIN": 0.0, "MAX": 1.5, "DEFAULT": 0.3 },
    { "NAME": "centre", "LABEL": "Centre", "TYPE": "point2D", "MIN": [0.0, 0.0], "MAX": [1.0, 1.0], "DEFAULT": [0.5, 0.5] }
  ]
}*/

void main() {
	float k = EZ_PROGRESS * EZ_PROGRESS * (3.0 - 2.0 * EZ_PROGRESS);
	float zoom = 1.0 + quantite * (1.0 - k);
	gl_FragColor = IMG_NORM_PIXEL(inputImage, (isf_FragNormCoord - centre) / zoom + centre);
}
