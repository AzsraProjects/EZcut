/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Fondu d'ouverture au début du clip et fondu de fermeture à la fin, vers le noir ou la couleur choisie",
  "CATEGORIES": ["Mouvement"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "ouverture", "LABEL": "Ouverture (s)", "TYPE": "float", "MIN": 0.0, "MAX": 5.0, "DEFAULT": 0.6 },
    { "NAME": "fermeture", "LABEL": "Fermeture (part du clip)", "TYPE": "float", "MIN": 0.0, "MAX": 0.5, "DEFAULT": 0.15 },
    { "NAME": "couleur", "LABEL": "Couleur", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.0, 1.0] }
  ]
}*/

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	// ouverture en secondes depuis le début du clip ; fermeture en part du clip,
	// car un effet connaît son avancement (EZ_PROGRESS) mais pas la durée du clip en secondes
	// une durée nulle désactive le fondu correspondant
	float a = ouverture > 0.0 ? clamp(TIME / ouverture, 0.0, 1.0) : 1.0;
	float b = fermeture > 0.0 ? clamp((1.0 - EZ_PROGRESS) / fermeture, 0.0, 1.0) : 1.0;
	a = a * a * (3.0 - 2.0 * a);
	b = b * b * (3.0 - 2.0 * b);
	gl_FragColor = vec4(mix(couleur.rgb, src.rgb, a * b), src.a);
}
