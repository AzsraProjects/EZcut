/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Tout ce qui bouge laisse une traînée : les images précédentes restent à l'écran et s'estompent",
  "CATEGORIES": ["Stylize"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.85 },
    { "NAME": "persistance", "LABEL": "Longueur de la traînée", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.7 },
    { "NAME": "mode", "LABEL": "Type de traînée", "TYPE": "long", "VALUES": [0, 1], "LABELS": ["Fondue", "Lumineuse"], "DEFAULT": 0 }
  ],
  "PASSES": [
    { "TARGET": "trainee", "PERSISTENT": true, "FLOAT": true },
    {}
  ]
}*/

// Passe 0 : le tampon « trainee » garde le résultat de l'image précédente et y mêle l'image courante.
// Son alpha sert de témoin : 1 = tampon encore vierge (valeur d'effacement du moteur), 0,5 = déjà écrit.
// Passe 1 : sortie, dosée par l'intensité.

void main() {
	vec2 uv = isf_FragNormCoord;
	vec4 src = IMG_THIS_PIXEL(inputImage);
	vec4 avant = IMG_NORM_PIXEL(trainee, uv);
	if (PASSINDEX == 0) {
		vec3 acc = src.rgb;
		// au tout début du clip, ou si le tampon est vierge, on repart de l'image courante
		if (TIME >= 0.02 && avant.a < 0.75) {
			float k = persistance * 0.96;
			if (mode == 1) acc = max(src.rgb, avant.rgb * k);  // seules les zones claires laissent une trace
			else acc = mix(src.rgb, avant.rgb, k);
		}
		gl_FragColor = vec4(acc, 0.5);
	} else {
		gl_FragColor = vec4(mix(src.rgb, avant.rgb, intensite), src.a);
	}
}
