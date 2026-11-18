/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Gros pixels sur toute l'image ou sur une zone ronde : pour masquer un visage, une plaque, ou styliser",
  "CATEGORIES": ["Stylize"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "taille", "LABEL": "Taille des blocs", "TYPE": "float", "MIN": 2.0, "MAX": 120.0, "DEFAULT": 28.0 },
    { "NAME": "animation", "LABEL": "Animation", "TYPE": "long", "VALUES": [0, 1, 2], "LABELS": ["Fixe", "Apparaît au fil du clip", "Disparaît au fil du clip"], "DEFAULT": 0 },
    { "NAME": "zone", "LABEL": "Zone", "TYPE": "long", "VALUES": [0, 1], "LABELS": ["Image entière", "Zone ronde"], "DEFAULT": 0 },
    { "NAME": "centre", "LABEL": "Centre de la zone", "TYPE": "point2D", "MIN": [0.0, 0.0], "MAX": [1.0, 1.0], "DEFAULT": [0.5, 0.5] },
    { "NAME": "etendue", "LABEL": "Taille de la zone", "TYPE": "float", "MIN": 0.05, "MAX": 1.5, "DEFAULT": 0.4 }
  ]
}*/

void main() {
	vec2 uv = isf_FragNormCoord;
	vec4 src = IMG_THIS_PIXEL(inputImage);
	float e = EZ_PROGRESS * EZ_PROGRESS * (3.0 - 2.0 * EZ_PROGRESS);
	float k = 1.0;
	if (animation == 1) k = e;
	else if (animation == 2) k = 1.0 - e;
	// côté d'un bloc en pixels ; la taille est donnée pour une image de 1080 lignes
	float cote = max(taille * k * min(RENDERSIZE.x, RENDERSIZE.y) / 1080.0, 1.0);
	// grille centrée sur l'image : les blocs sont symétriques de part et d'autre
	vec2 pos = (uv - 0.5) * RENDERSIZE;
	vec2 uvBloc = (floor(pos / cote) + 0.5) * cote / RENDERSIZE + 0.5;
	// couleur moyenne du bloc sur 16 lectures : stable d'une image à l'autre, sans scintillement
	vec4 somme = vec4(0.0);
	for (int j = 0; j < 4; j++) {
		for (int i = 0; i < 4; i++) {
			vec2 o = (vec2(float(i), float(j)) + 0.5) / 4.0 - 0.5;
			somme += IMG_NORM_PIXEL(inputImage, uvBloc + o * cote / RENDERSIZE);
		}
	}
	vec3 bloc = somme.rgb / 16.0;
	float m = 1.0;
	if (zone == 1) {
		// le test se fait au centre du bloc : le contour de la zone suit la grille
		vec2 d = (uvBloc - centre) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
		m = step(length(d), etendue * 0.5);
	}
	if (cote <= 1.0) m = 0.0; // blocs d'un pixel : image d'origine, intacte
	gl_FragColor = vec4(mix(src.rgb, bloc, m), src.a);
}
