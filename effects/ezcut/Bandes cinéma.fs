/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Bandes de format cinéma (2,39 par défaut), fixes ou animées sur la durée du clip",
  "CATEGORIES": ["Film", "Stylize"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "ratio", "LABEL": "Format (largeur / hauteur)", "TYPE": "float", "MIN": 1.0, "MAX": 3.0, "DEFAULT": 2.39 },
    { "NAME": "animation", "LABEL": "Animation", "TYPE": "long", "VALUES": [0, 1, 2, 3], "LABELS": ["Fixes", "Entrent au début", "S'ouvrent depuis le noir", "Se referment à la fin"], "DEFAULT": 0 },
    { "NAME": "duree", "LABEL": "Durée de l'animation (part du clip)", "TYPE": "float", "MIN": 0.02, "MAX": 1.0, "DEFAULT": 0.2 },
    { "NAME": "couleur", "LABEL": "Couleur", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.0, 1.0] }
  ]
}*/

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	vec2 uv = isf_FragNormCoord;
	float aspect = RENDERSIZE.x / RENDERSIZE.y;
	// bandes en haut et en bas si le format visé est plus large que l'image (cas courant),
	// sur les côtés sinon (vidéo verticale ramenée à un format plus étroit, par exemple)
	bool horizontal = ratio >= aspect;
	float cible = horizontal ? 0.5 * (1.0 - aspect / ratio) : 0.5 * (1.0 - ratio / aspect);
	float d = max(duree, 0.001);
	float bande = cible;
	if (animation == 1) {
		float k = clamp(EZ_PROGRESS / d, 0.0, 1.0);
		bande = cible * k * k * (3.0 - 2.0 * k);
	} else if (animation == 2) {
		float k = clamp(EZ_PROGRESS / d, 0.0, 1.0);
		bande = mix(0.5, cible, k * k * (3.0 - 2.0 * k));
	} else if (animation == 3) {
		float k = clamp((1.0 - EZ_PROGRESS) / d, 0.0, 1.0);
		bande = mix(0.5, cible, k * k * (3.0 - 2.0 * k));
	}
	float bord = horizontal ? min(uv.y, 1.0 - uv.y) : min(uv.x, 1.0 - uv.x);
	float cote = horizontal ? RENDERSIZE.y : RENDERSIZE.x;
	float m = clamp((bande - bord) * cote + 0.5, 0.0, 1.0); // bord net, lissé sur un pixel
	gl_FragColor = vec4(mix(src.rgb, couleur.rgb, m), src.a);
}
