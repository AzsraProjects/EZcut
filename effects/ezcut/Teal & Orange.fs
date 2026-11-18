/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Le look des films d'action : peaux orangées, ombres bleu-vert",
  "CATEGORIES": ["Film"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.75 },
    { "NAME": "separation", "LABEL": "Séparation des couleurs", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "contraste", "LABEL": "Contraste", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.3 }
  ]
}*/

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	vec3 c = src.rgb;
	float l = luma(c);
	// 1. les couleurs se resserrent autour de l'axe orange / bleu-vert (axe de luminance nulle)
	vec3 axe = vec3(0.754, -0.155, -0.638);
	vec3 d = c - vec3(l);
	d = mix(d, axe * dot(d, axe), 0.6 * separation) * (1.0 + 0.35 * separation);
	c = vec3(l) + d;
	// 2. ombres vers le bleu-vert, hautes lumières vers l'orange ; le noir et le blanc purs restent neutres
	float ombres = (1.0 - smoothstep(0.0, 0.55, l)) * smoothstep(0.0, 0.10, l);
	float clairs = smoothstep(0.45, 0.85, l) * (1.0 - smoothstep(0.92, 1.0, l));
	c += (vec3(-0.070, 0.015, 0.060) * ombres + vec3(0.070, 0.010, -0.070) * clairs) * separation * 1.4;
	// 3. courbe en S douce
	c = clamp(c, 0.0, 1.0);
	c = mix(c, c * c * (3.0 - 2.0 * c), contraste * 0.8);
	gl_FragColor = vec4(mix(src.rgb, c, intensite), src.a);
}
