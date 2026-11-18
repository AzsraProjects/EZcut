/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Halos colorés qui dérivent depuis les bords, comme de la lumière entrée dans le boîtier",
  "CATEGORIES": ["Film", "Stylize"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "couleur", "LABEL": "Couleur", "TYPE": "color", "DEFAULT": [1.0, 0.45, 0.15, 1.0] },
    { "NAME": "vitesse", "LABEL": "Vitesse", "TYPE": "float", "MIN": 0.0, "MAX": 3.0, "DEFAULT": 1.0 },
    { "NAME": "taille", "LABEL": "Taille", "TYPE": "float", "MIN": 0.2, "MAX": 1.5, "DEFAULT": 0.7 }
  ]
}*/

float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash11(i), hash11(i + 1.0), f); }

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	float aspect = RENDERSIZE.x / RENDERSIZE.y;
	vec2 p = (isf_FragNormCoord - 0.5) * vec2(aspect, 1.0); // repère centré, hauteur = 1
	float demi = 0.5 * aspect;
	float t = TIME * vitesse;
	// trois nappes : une large à gauche, une étirée à droite, une diffuse en haut
	vec2 a = vec2(-demi * (1.0 + 0.25 * sin(t * 0.31)), 0.35 * sin(t * 0.23 + 1.3));
	vec2 b = vec2(demi * (0.9 + 0.3 * sin(t * 0.19 + 2.1)), 0.45 * cos(t * 0.27));
	vec2 c = vec2(demi * 0.6 * sin(t * 0.13 + 4.0), 0.55 + 0.10 * sin(t * 0.41));
	float ra = taille * 0.9;
	float rb = taille * 0.6;
	float rc = taille * 0.7;
	vec2 qa = p - a;
	vec2 qb = (p - b) * vec2(0.6, 1.4);
	vec2 qc = (p - c) * vec2(0.45, 1.6);
	float la = exp(-dot(qa, qa) / (ra * ra));
	float lb = exp(-dot(qb, qb) / (rb * rb));
	float lc = exp(-dot(qc, qc) / (rc * rc));
	// chaque nappe respire à son rythme
	la *= 0.6 + 0.4 * vnoise(t * 0.50);
	lb *= 0.4 + 0.6 * vnoise(t * 0.37 + 17.0);
	lc *= 0.3 + 0.7 * vnoise(t * 0.29 + 41.0);
	// la deuxième nappe tire vers le rose, la troisième vers le blanc : plus riche qu'une seule teinte
	vec3 teinteB = clamp(couleur.rgb * vec3(1.0, 0.55, 0.85) + vec3(0.12, 0.0, 0.10), 0.0, 1.0);
	vec3 teinteC = mix(couleur.rgb, vec3(1.0), 0.5);
	vec3 fuite = (couleur.rgb * la + teinteB * lb + teinteC * lc * 0.6) * intensite;
	// tramage d'un demi-niveau : pas de bandes visibles dans les dégradés
	float niveau = max(fuite.r, max(fuite.g, fuite.b));
	fuite += (hash21(gl_FragCoord.xy) - 0.5) / 255.0 * smoothstep(0.0, 0.02, niveau);
	fuite = clamp(fuite, 0.0, 1.0);
	// fusion « écran » : la lumière s'ajoute sans brûler les blancs
	gl_FragColor = vec4(vec3(1.0) - (vec3(1.0) - src.rgb) * (vec3(1.0) - fuite), src.a);
}
