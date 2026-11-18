/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Le clip arrive zoomé et flou, puis se pose : pour donner de l'élan à une coupe",
  "CATEGORIES": ["Mouvement"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "duree", "LABEL": "Durée (s)", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 },
    { "NAME": "quantite", "LABEL": "Amplitude", "TYPE": "float", "MIN": 0.0, "MAX": 1.5, "DEFAULT": 0.5 },
    { "NAME": "flou", "LABEL": "Flou de mouvement", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/

void main() {
	float k = clamp(TIME / duree, 0.0, 1.0);
	float rest = pow(1.0 - k, 3.0); // 1 au début du clip, 0 une fois posé
	float zoom = 1.0 + quantite * rest;
	vec2 dir = isf_FragNormCoord - 0.5;
	// flou radial : plusieurs échantillons le long du mouvement de zoom
	float spread = flou * rest * 0.25;
	vec4 sum = vec4(0.0);
	for (int i = 0; i < 12; i++) {
		float s = 1.0 - spread * float(i) / 11.0;
		sum += IMG_NORM_PIXEL(inputImage, dir * s / zoom + 0.5);
	}
	gl_FragColor = sum / 12.0;
}
