/*{
  "CREDIT": "EZcut",
  "DESCRIPTION": "Transforme une scène tournée de jour en nuit de cinéma : sombre, bleutée, presque sans couleur",
  "CATEGORIES": ["Film"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "intensite", "LABEL": "Intensité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.9 },
    { "NAME": "obscurite", "LABEL": "Obscurité", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "bleu", "LABEL": "Teinte bleue", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.65 },
    { "NAME": "lune", "LABEL": "Reflets de lune", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.35 }
  ]
}*/

void main() {
	vec4 src = IMG_THIS_PIXEL(inputImage);
	vec3 c = clamp(src.rgb, 0.0, 1.0);
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	// vision de nuit : sensible au bleu-vert, presque aveugle au rouge, et il reste peu de couleur
	float nuit = dot(c, vec3(0.12, 0.58, 0.30));
	vec3 n = mix(vec3(nuit), c, 0.30);
	// l'image s'assombrit surtout dans les tons moyens
	n = pow(n, vec3(1.0 + 0.9 * obscurite)) * (1.0 - 0.55 * obscurite);
	n *= mix(vec3(1.0), vec3(0.55, 0.78, 1.15), bleu);
	// les zones très claires gardent de l'éclat, comme sous la lune
	float h = smoothstep(0.65, 1.0, l);
	n = mix(n, c * vec3(0.80, 0.90, 1.00), h * lune);
	gl_FragColor = vec4(mix(src.rgb, clamp(n, 0.0, 1.0), intensite), src.a);
}
