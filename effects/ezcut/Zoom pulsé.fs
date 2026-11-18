/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Coups de zoom en rythme, à caler sur le tempo de la musique",
  "CATEGORIES": ["Mouvement"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "tempo", "LABEL": "Tempo (BPM)", "TYPE": "float", "MIN": 40.0, "MAX": 200.0, "DEFAULT": 120.0 },
    { "NAME": "quantite", "LABEL": "Amplitude", "TYPE": "float", "MIN": 0.0, "MAX": 0.6, "DEFAULT": 0.12 },
    { "NAME": "amorti", "LABEL": "Amorti", "TYPE": "float", "MIN": 1.0, "MAX": 12.0, "DEFAULT": 5.0 }
  ]
}*/

void main() {
	float phase = fract(TIME * tempo / 60.0);
	float zoom = 1.0 + quantite * exp(-phase * amorti);
	gl_FragColor = IMG_NORM_PIXEL(inputImage, (isf_FragNormCoord - 0.5) / zoom + 0.5);
}
