/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Signal numérique corrompu : bandes et blocs décalés, couleurs qui se séparent, par à-coups",
  "CATEGORIES": ["Glitch"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "frequence", "LABEL": "Fréquence des à-coups", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.45 },
    { "NAME": "taille", "LABEL": "Taille des blocs", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 },
    { "NAME": "couleurs", "LABEL": "Séparation des couleurs", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/

float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
	vec2 uv = isf_FragNormCoord;
	float tick = mod(floor(TIME * 12.0), 1024.0);  // l'état change 12 fois par seconde
	float salve = mod(floor(TIME * 2.5), 1024.0);  // les à-coups arrivent par salves de 0,4 s
	// actif seulement pendant certaines salves, et pas à chaque pas d'une salve
	float actif = step(1.0 - frequence, hash11(salve * 12.9898 + 3.0)) * step(0.25, hash11(tick * 7.233 + 1.0));
	float force = intensite * actif;

	// bandes horizontales décalées, de deux hauteurs différentes
	float nb = mix(48.0, 8.0, taille);
	float l1 = floor(uv.y * nb);
	float l2 = floor(uv.y * nb * 0.31 + hash11(tick + 5.0) * 7.0);
	float dx = 0.0;
	if (hash21(vec2(l1, tick)) > 1.0 - 0.30 * force) dx += (hash21(vec2(l1, tick + 31.0)) - 0.5) * 0.12;
	if (hash21(vec2(l2, tick + 17.0)) > 1.0 - 0.45 * force) dx += (hash21(vec2(l2, tick + 47.0)) - 0.5) * 0.30;
	dx *= force;

	// quelques blocs sautent ailleurs dans l'image
	vec2 bloc = floor(uv * vec2(8.0, 5.0) * mix(2.5, 1.0, taille));
	vec2 saut = vec2(0.0);
	if (hash21(bloc + vec2(tick, 91.0)) > 1.0 - 0.18 * force) {
		saut = (vec2(hash21(bloc + vec2(13.0, tick)), hash21(bloc + vec2(tick, 57.0))) - vec2(0.5)) * vec2(0.25, 0.10) * force;
	}
	// le décalage horizontal reboucle de l'autre côté, comme un tampon vidéo corrompu
	vec2 p = vec2(fract(uv.x + dx + saut.x), clamp(uv.y + saut.y, 0.0, 1.0));

	// séparation des couleurs : forte sur les zones touchées, légère ailleurs pendant l'à-coup
	float touche = step(0.0001, abs(dx) + abs(saut.x) + abs(saut.y));
	float sens = hash11(tick + 9.0) > 0.5 ? 1.0 : -1.0;
	float ecart = couleurs * force * (0.004 + 0.020 * touche) * sens;
	vec4 g = IMG_NORM_PIXEL(inputImage, p);
	float r = IMG_NORM_PIXEL(inputImage, vec2(fract(p.x + ecart), p.y)).r;
	float b = IMG_NORM_PIXEL(inputImage, vec2(fract(p.x - ecart), p.y)).b;
	gl_FragColor = vec4(r, g.g, b, g.a);
}
