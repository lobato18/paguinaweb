#!/usr/bin/env node
/**
 * Genera un artículo diario de divulgación informática con Ollama,
 * reconstruye el blog estático y actualiza el sitemap.
 *
 * Uso:
 *   node scripts/generar-post-diario.mjs            Genera (si no existe el de hoy) y renderiza
 *   node scripts/generar-post-diario.mjs --force    Fuerza un artículo nuevo aunque ya haya uno hoy
 *   node scripts/generar-post-diario.mjs --render   Solo reconstruye las páginas desde posts.json
 *   node scripts/generar-post-diario.mjs --fecha=YYYY-MM-DD   Genera el artículo de una fecha concreta
 */
import { readFile, writeFile, mkdir, access, unlink, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const IMG_DIR = path.join(BLOG_DIR, 'img');
const POSTS_FILE = path.join(BLOG_DIR, 'posts.json');
let FOTOS_BLOG = [];
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODELO = process.env.BLOG_MODEL || 'qwen2.5:7b';
const SITE = 'https://tecnolobato.one';
const WA = 'https://wa.me/34687397664?text=';
const ZONA = 'Europe/Madrid';

const args = new Set(process.argv.slice(2));
const soloRender = args.has('--render');
const forzar = args.has('--force');

function leerOpcion(nombre) {
  const prefijo = `${nombre}=`;
  const arg = process.argv.slice(2).find((valor) => valor.startsWith(prefijo));
  return arg ? arg.slice(prefijo.length).trim() : '';
}

const temaPersonalizado = leerOpcion('--tema');
const tagPersonalizado = leerOpcion('--tag');
const fechaPersonalizada = leerOpcion('--fecha');
if (fechaPersonalizada && !/^\d{4}-\d{2}-\d{2}$/.test(fechaPersonalizada)) {
  console.error('La fecha debe tener formato YYYY-MM-DD');
  process.exit(1);
}

const TEMAS = [
  { tema: 'Por qué el modelo OSI sigue siendo útil para entender una red', tag: 'Redes' },
  { tema: 'Qué es la memoria RAM y cómo afecta a la velocidad de tu PC', tag: 'Hardware' },
  { tema: 'SSD SATA, NVMe y M.2: diferencias reales al elegir almacenamiento', tag: 'Hardware' },
  { tema: 'Cómo saber si tu PC se está sobrecalentando y qué hacer', tag: 'Mantenimiento' },
  { tema: 'Cada cuánto hay que cambiar la pasta térmica del procesador', tag: 'Mantenimiento' },
  { tema: 'Cómo elegir una fuente de alimentación segura y eficiente', tag: 'Hardware' },
  { tema: 'CPU para gaming: núcleos, frecuencia y caché sin perderse', tag: 'Hardware' },
  { tema: 'Qué hace realmente la tarjeta gráfica y cuánta VRAM necesitas', tag: 'Hardware' },
  { tema: 'Errores habituales al montar un PC por primera vez', tag: 'Hardware' },
  { tema: 'Cable management: por qué importa más de lo que parece', tag: 'Mantenimiento' },
  { tema: 'Copias de seguridad: la regla 3-2-1 explicada con ejemplos', tag: 'Software' },
  { tema: 'Gestores de contraseñas: cómo funcionan y por qué usarlos', tag: 'Seguridad' },
  { tema: 'Cómo detectar un correo de phishing en menos de un minuto', tag: 'Seguridad' },
  { tema: 'Autenticación en dos pasos: opciones y cuál elegir', tag: 'Seguridad' },
  { tema: 'Por qué deberías instalar las actualizaciones de seguridad', tag: 'Software' },
  { tema: 'Ransomware: qué es y cómo reducir el riesgo en casa', tag: 'Seguridad' },
  { tema: 'Wi-Fi 2,4 GHz o 5 GHz: cuándo conviene cada banda', tag: 'Redes' },
  { tema: 'Qué es una VPN y qué no puede hacer por ti', tag: 'Redes' },
  { tema: 'DNS: el directorio que hace funcionar internet', tag: 'Redes' },
  { tema: 'TCP y UDP: dos formas de enviar datos', tag: 'Redes' },
  { tema: 'Qué es un firewall y cómo filtra tu tráfico', tag: 'Seguridad' },
  { tema: 'Latencia y ancho de banda: por qué no son lo mismo', tag: 'Redes' },
  { tema: 'Cómo limpiar el interior de tu PC sin dañarlo', tag: 'Mantenimiento' },
  { tema: 'Mantenimiento de software: una rutina sencilla cada mes', tag: 'Software' },
  { tema: 'Windows o Linux: ventajas reales para cada tipo de usuario', tag: 'Software' },
  { tema: 'Qué es un home server y para qué puede servirte', tag: 'Redes' },
  { tema: 'Virtualización: qué es y cuándo tiene sentido', tag: 'Software' },
  { tema: 'Docker explicado para quien empieza', tag: 'Software' },
  { tema: 'Cómo proteger las copias de seguridad de tu móvil', tag: 'Seguridad' },
  { tema: 'Estafas por WhatsApp: señales de alarma y cómo actuar', tag: 'Seguridad' },
  { tema: 'Comprar un PC de segunda mano: checklist antes de pagar', tag: 'Hardware' },
  { tema: 'Refrigeración por aire o líquida: qué necesita tu equipo', tag: 'Hardware' },
  { tema: 'Monitor para gaming: Hz, resolución y tipo de panel', tag: 'Hardware' },
  { tema: 'Cómo ampliar la RAM o el SSD sin romper nada', tag: 'Hardware' },
  { tema: 'Mantenimiento de un portátil: lo que sí puedes hacer tú', tag: 'Mantenimiento' },
  { tema: 'Qué hacer si tu PC no arranca: diagnóstico paso a paso', tag: 'Mantenimiento' }
];

const FALLBACKS = [
  {
    tema: 'Cómo detectar un correo de phishing en menos de un minuto',
    tag: 'Seguridad',
    title: 'Phishing: cómo detectar un correo fraudulento antes de picar',
    summary: 'Los estafadores imitan a bancos, mensajerías y servicios conocidos. Estas señales te ayudan a detectar un correo falso antes de hacer clic.',
    sections: [
      {
        heading: 'Qué es el phishing y por qué funciona',
        paragraphs: [
          'El phishing es un intento de engañarte para que entregues datos personales, credenciales o dinero haciéndose pasar por una entidad de confianza. Puede llegar por correo, SMS o mensajería instantánea, y suele aprovechar una emoción concreta: prisa, miedo a perder una cuenta o curiosidad por una supuesta entrega.',
          'Funciona porque imita el diseño y el lenguaje de marcas reales. No hace falta que el fraude sea perfecto: basta con que una parte del mensaje resulte creíble durante los segundos en los que decides hacer clic. Por eso conviene revisar siempre el remitente, el enlace y el contexto antes de actuar.'
        ]
      },
      {
        heading: 'Señales que aparecen casi siempre',
        paragraphs: [
          'Desconfía de los mensajes que exigen una acción urgente, amenazan con cerrar tu cuenta o prometen un reembolso que no has solicitado. También son sospechosas las direcciones de correo extrañas, los errores de escritura y los saludos genéricos del tipo «estimado cliente».',
          'Antes de hacer clic, pasa el ratón por encima del enlace y comprueba el dominio real. Un texto que dice «banco.com» puede apuntar a «banco-seguridad.xyz». Si la web te pide contraseña, datos de tarjeta o un código de verificación, abre la aplicación oficial por tu cuenta en lugar de usar el enlace recibido.'
        ]
      },
      {
        heading: 'Qué hacer si ya has hecho clic',
        paragraphs: [
          'No entres en pánico, pero actúa rápido. Si has introducido una contraseña, cámbiala desde el sitio oficial y activa la autenticación en dos pasos. Si has facilitado datos bancarios, contacta con tu entidad y revisa los movimientos de la cuenta.',
          'Borra el mensaje y, si es posible, notifica el fraude al servicio suplantado. Si el enlace descargó un archivo, no lo ejecutes: analízalo con el antivirus y, ante la duda, restaura una copia de seguridad reciente.'
        ]
      },
      {
        heading: 'Cómo proteger tu correo y tus cuentas',
        paragraphs: [
          'Usa contraseñas distintas y largas para cada servicio, guardadas en un gestor de contraseñas. Activa la verificación en dos pasos siempre que esté disponible y mantén actualizado el navegador y el sistema operativo.',
          'Revisa periódicamente las sesiones activas y los dispositivos vinculados a tus cuentas principales. Si algo no te suena, ciérralo y cambia la contraseña. La prevención más eficaz es desconfiar por defecto de cualquier mensaje que te pida datos o dinero.'
        ]
      }
    ],
    tips: [
      'Comprueba el dominio real del enlace, no solo el texto que se muestra.',
      'Nunca introduzcas contraseñas o códigos de verificación desde un enlace recibido.',
      'Activa la autenticación en dos pasos en correo, banca y redes sociales.',
      'Si el mensaje mete prisa, para y verifica por otro canal antes de responder.'
    ],
    conclusion: 'El phishing no se detecta con una sola regla, sino con una rutina: mirar el remitente, revisar el enlace y desconfiar de la urgencia. Si tienes dudas sobre un mensaje o quieres revisar la seguridad de tu equipo, puedes escribirnos por WhatsApp y lo vemos juntos.'
  },
  {
    tema: 'Copias de seguridad: la regla 3-2-1 explicada con ejemplos',
    tag: 'Software',
    title: 'Copias de seguridad: la regla 3-2-1 explicada con ejemplos',
    summary: 'Tener una copia no es suficiente. La regla 3-2-1 ayuda a proteger tus archivos frente a fallos de disco, robos y ransomware.',
    sections: [
      {
        heading: 'Qué significa exactamente 3-2-1',
        paragraphs: [
          'La regla 3-2-1 propone mantener al menos tres copias de los datos importantes, guardadas en dos tipos de soporte distintos y con una de ellas fuera de tu casa o del lugar de trabajo. Así, un fallo de un disco no arrastra todas las versiones disponibles.',
          'Por ejemplo: el archivo original en el PC, una copia en un disco externo y otra en un servicio de almacenamiento en la nube. Los dos soportes podrían ser un disco duro y una unidad SSD, o un NAS y la nube. Lo importante es que no dependan del mismo fallo.'
        ]
      },
      {
        heading: 'Por qué una sola copia no basta',
        paragraphs: [
          'Un disco externo conectado permanentemente al ordenador también puede infectarse en un ataque de ransomware o sufrir una subida de tensión. Una copia en la nube sincronizada al instante puede propagar el borrado accidental en segundos.',
          'La clave no es solo cuántas copias tienes, sino cuántas pueden recuperarse de forma independiente. Las copias deben ser versionadas y, si es posible, mantener una que no esté montada ni conectada de forma permanente.'
        ]
      },
      {
        heading: 'Cómo aplicarlo en casa sin complicarte',
        paragraphs: [
          'Empieza por lo irrecuperable: fotos, documentos, proyectos y configuraciones. Programa una copia automática diaria o semanal y revisa de vez en cuando que los archivos se abren correctamente. Una copia que nunca se ha probado no es una copia fiable.',
          'Puedes usar un disco externo para la copia local, un NAS para centralizar varios equipos y un servicio en la nube para la copia externa. Si tienes muchos datos, prioriza primero lo importante y amplía después.'
        ]
      },
      {
        heading: 'Errores que conviene evitar',
        paragraphs: [
          'No guardes la única copia en el mismo equipo ni en la misma habitación que el original. Tampoco confundas sincronización con copia de seguridad: si borras un archivo y se borra en todos los dispositivos, no tienes una copia, tienes un espejo del error.',
          'Revisa el espacio libre antes de que la copia deje de ejecutarse en silencio. Y documenta cómo restaurar: una copia útil incluye saber qué hacer con ella cuando el equipo principal falla.'
        ]
      }
    ],
    tips: [
      'Mantén tres copias de los datos que no puedes recuperar.',
      'Usa al menos dos soportes diferentes, por ejemplo disco externo y nube.',
      'Guarda una copia fuera de casa o en un lugar independiente.',
      'Prueba una restauración completa al menos una vez al año.'
    ],
    conclusion: 'La mejor copia de seguridad es la que existe antes del fallo y la que sabes restaurar. Si quieres montar un sistema de copias para tu casa o tu negocio, podemos ayudarte a elegir discos, NAS y una rutina sencilla.'
  },
  {
    tema: 'Cómo limpiar el interior de tu PC sin dañarlo',
    tag: 'Mantenimiento',
    title: 'Cómo limpiar el interior de tu PC sin dañar ningún componente',
    summary: 'El polvo sube las temperaturas y acelera el desgaste. Una limpieza cuidadosa, con las herramientas adecuadas, alarga la vida del equipo.',
    sections: [
      {
        heading: 'Cuándo merece la pena abrir el PC',
        paragraphs: [
          'Si notas que los ventiladores hacen más ruido de lo habitual, que las temperaturas suben o que el equipo se apaga en carga, probablemente toca revisar la refrigeración. En ambientes con polvo o con animales, conviene inspeccionar cada pocos meses.',
          'Antes de abrir la tapa, apaga el equipo, desenchúfalo y espera unos minutos. Descarga la electricidad estática tocando una superficie metálica conectada a tierra y evita trabajar sobre alfombras o ropa sintética.'
        ]
      },
      {
        heading: 'Qué usar y qué evitar',
        paragraphs: [
          'Un pincel de cerdas suaves, aire comprimido y un paño de microfibra son suficientes para la mayoría de limpiezas. Sujeta los ventiladores con el dedo o con un palillo mientras soplas, para que no giren a gran velocidad y dañen el rodamiento.',
          'Evita el aspirador doméstico cerca de la placa: puede generar estática y arrastrar componentes pequeños. Tampoco apliques el aire comprimido a muy corta distancia ni lo inclines, porque puede expulsar líquido propelente.'
        ]
      },
      {
        heading: 'Limpieza paso a paso',
        paragraphs: [
          'Empieza por los filtros y rejillas exteriores. Después retira el polvo de los ventiladores y del disipador con el pincel, y usa el aire comprimido en ráfagas cortas desde cierta distancia. Limpia las aspas con cuidado y vuelve a colocar los filtros cuando estén secos.',
          'No desmontes el disipador ni el procesador si no vas a cambiar la pasta térmica. Si el equipo tiene refrigeración líquida, revisa que la bomba funcione y que no haya fugas, pero no manipules los tubos sin necesidad.'
        ]
      },
      {
        heading: 'Cuándo es mejor pedir ayuda',
        paragraphs: [
          'Si el equipo no arranca después de la limpieza, si ves cables sueltos que no identificas o si necesitas cambiar la pasta térmica, es momento de parar. Forzar un conector o recolocar mal un módulo de RAM puede convertir una limpieza sencilla en una avería.',
          'Una limpieza profesional incluye revisión de temperaturas, comprobación de conexiones y cambio de pasta térmica cuando hace falta. Es una buena ocasión para detectar un ventilador degradado antes de que provoque apagones.'
        ]
      }
    ],
    tips: [
      'Apaga, desenchufa y descarga la estática antes de abrir la torre.',
      'Sujeta los ventiladores mientras soplas para que no giren locos.',
      'No uses aspiradores domésticos dentro de la caja.',
      'Si no vas a cambiar la pasta térmica, no desmontes el disipador.'
    ],
    conclusion: 'Una limpieza periódica, sin prisa y con las herramientas correctas, mantiene el equipo más fresco y silencioso. Si prefieres no abrirlo o quieres revisar temperaturas y pasta térmica, en TecnoLobato podemos hacerlo por ti.'
  }
];

function log(...partes) {
  console.log(`[${new Date().toISOString()}]`, ...partes);
}

function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonSeguro(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function hoyISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: ZONA });
}

function fechaLarga(iso) {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${iso}T12:00:00Z`));
}

const PALETAS_PORTADA = {
  Hardware: { a: '#10b981', b: '#22d3ee', icono: 'chip' },
  Seguridad: { a: '#f87171', b: '#f59e0b', icono: 'shield' },
  Redes: { a: '#38bdf8', b: '#10b981', icono: 'network' },
  Software: { a: '#a78bfa', b: '#22d3ee', icono: 'code' },
  Mantenimiento: { a: '#fbbf24', b: '#fb923c', icono: 'wrench' },
  Blog: { a: '#10b981', b: '#d4af37', icono: 'spark' }
};

const ICONOS_PORTADA = {
  chip: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  network: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7.5l3 8M16 7.5l-3 8M8.5 6h7"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13 4l-2 16"/>',
  wrench: '<path d="M14.5 6.5a4.5 4.5 0 0 0-6 6L3 18l3 3 5.5-5.5a4.5 4.5 0 0 0 6-6l-3 3-3-3 3-3z"/>',
  spark: '<path d="M12 2l2.2 6.2L21 10l-6.8 1.8L12 18l-2.2-6.2L3 10l6.8-1.8L12 2z"/>'
};

function hashPortada(texto) {
  let h = 0;
  for (const caracter of String(texto)) h = (h * 31 + caracter.codePointAt(0)) >>> 0;
  return h;
}

function envolverLineas(texto, maximo) {
  const palabras = String(texto || '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (prueba.length > maximo && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function ajustarTituloPortada(texto) {
  const opciones = [
    { tamano: 62, maximo: 23, salto: 68 },
    { tamano: 54, maximo: 28, salto: 61 },
    { tamano: 46, maximo: 30, salto: 53 },
    { tamano: 40, maximo: 33, salto: 47 }
  ];
  for (const opcion of opciones) {
    const lineas = envolverLineas(texto, opcion.maximo);
    if (lineas.length <= 3) return { ...opcion, lineas };
  }
  const opcion = opciones[opciones.length - 1];
  const lineas = envolverLineas(texto, opcion.maximo).slice(0, 3);
  lineas[lineas.length - 1] = `${lineas[lineas.length - 1].replace(/\s+\S*$/, '')}…`;
  return { ...opcion, lineas };
}

function generarPortadaSVG(post) {
  const paleta = PALETAS_PORTADA[post.tag] || PALETAS_PORTADA.Blog;
  const semilla = hashPortada(post.slug);
  const gx = 800 + (semilla % 250);
  const gy = 50 + (semilla % 150);
  const titulo = ajustarTituloPortada(post.title);
  const tituloSVG = titulo.lineas.map((linea, i) =>
    `<tspan x="80" dy="${i === 0 ? 0 : titulo.salto}">${esc(linea)}</tspan>`
  ).join('');
  const resumenLineas = envolverLineas(post.summary, 60).slice(0, 2);
  const resumenSVG = resumenLineas.map((linea, i) =>
    `<tspan x="80" dy="${i === 0 ? 0 : 28}">${esc(linea)}</tspan>`
  ).join('');
  const yTitulo = 238;
  const yResumen = yTitulo + (titulo.lineas.length - 1) * titulo.salto + 56;
  const anchoEtiqueta = Math.max(120, String(post.tag).length * 11 + 56);
  const icono = ICONOS_PORTADA[paleta.icono] || ICONOS_PORTADA.spark;
  const fecha = fechaLarga(post.date);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${esc(post.title)}">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050b12"/>
      <stop offset="1" stop-color="#0b1622"/>
    </linearGradient>
    <linearGradient id="acento" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${paleta.a}"/>
      <stop offset="1" stop-color="${paleta.b}"/>
    </linearGradient>
    <radialGradient id="brillo1" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${paleta.a}" stop-opacity=".30"/>
      <stop offset="1" stop-color="${paleta.a}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="brillo2" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${paleta.b}" stop-opacity=".18"/>
      <stop offset="1" stop-color="${paleta.b}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="rejilla" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="${paleta.a}" stroke-opacity=".09" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#fondo)"/>
  <rect width="1200" height="630" fill="url(#rejilla)"/>
  <circle cx="${gx}" cy="${gy}" r="300" fill="url(#brillo1)"/>
  <circle cx="120" cy="650" r="280" fill="url(#brillo2)"/>
  <rect x="0" y="0" width="1200" height="6" fill="url(#acento)"/>
  <g fill="none" stroke="url(#acento)" stroke-opacity=".20" stroke-width="1.5">
    <path d="M760 84h110v78h92"/>
    <path d="M690 520h150v-62h120"/>
    <circle cx="870" cy="162" r="4" fill="${paleta.a}" stroke="none"/>
    <circle cx="960" cy="520" r="4" fill="${paleta.b}" stroke="none"/>
  </g>
  <g transform="translate(80,64)">
    <rect width="${anchoEtiqueta}" height="38" rx="19" fill="${paleta.a}" fill-opacity=".14" stroke="${paleta.a}" stroke-opacity=".45"/>
    <text x="${anchoEtiqueta / 2}" y="25" text-anchor="middle" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="14" font-weight="700" letter-spacing="2" fill="${paleta.b}">${esc(String(post.tag).toUpperCase())}</text>
  </g>
  <rect x="80" y="134" width="58" height="4" rx="2" fill="url(#acento)"/>
  <text x="80" y="${yTitulo}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="${titulo.tamano}" font-weight="800" letter-spacing="-1.5" fill="#ffffff">${tituloSVG}</text>
  <text x="80" y="${yResumen}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="20" fill="#94a3b8">${resumenSVG}</text>
  <g transform="translate(930,250)">
    <rect width="160" height="160" rx="34" fill="#ffffff" fill-opacity=".035" stroke="${paleta.b}" stroke-opacity=".28"/>
    <svg x="28" y="28" width="104" height="104" viewBox="0 0 24 24" fill="none" stroke="url(#acento)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${icono}</svg>
  </g>
  <text x="80" y="556" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="20" font-weight="800" letter-spacing="3" fill="#ffffff">TECNO<tspan fill="${paleta.b}">LOBATO</tspan></text>
  <text x="80" y="586" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="14" fill="#64748b">Divulgación informática · ${esc(fecha)}</text>
  <text x="1120" y="586" text-anchor="end" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="14" fill="#475569">tecnolobato.one</text>
</svg>
`;
}

async function existeArchivo(ruta) {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

async function asegurarPortada(post, forzar = false) {
  await mkdir(IMG_DIR, { recursive: true });
  const svgPath = path.join(IMG_DIR, `${post.slug}.svg`);
  const jpgPath = path.join(IMG_DIR, `${post.slug}.jpg`);
  const pngPath = path.join(IMG_DIR, `${post.slug}.png`);
  const haySvg = await existeArchivo(svgPath);
  const hayImagen = (await existeArchivo(jpgPath)) || (await existeArchivo(pngPath));
  if (!forzar && haySvg && hayImagen) return;
  const svg = generarPortadaSVG(post);
  if (!haySvg || forzar) await writeFile(svgPath, svg, 'utf8');
  if (!hayImagen || forzar) {
    const htmlTemporal = path.join('/tmp', `tecnolobato-portada-${process.pid}-${post.slug}.html`);
    const pngTemporal = path.join('/tmp', `tecnolobato-portada-${process.pid}-${post.slug}.png`);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:1200px;height:630px;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`;
    await writeFile(htmlTemporal, html, 'utf8');
    try {
      execFileSync('/usr/bin/google-chrome', [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=1200,630',
        `--screenshot=${pngTemporal}`,
        `file://${htmlTemporal}`
      ], { timeout: 60000, stdio: 'ignore' });
      try {
        const codigo = 'from PIL import Image; import sys; im = Image.open(sys.argv[1]).convert("RGB"); im.save(sys.argv[2], "JPEG", quality=85, optimize=True, progressive=True)';
        execFileSync('python3', ['-c', codigo, pngTemporal, jpgPath], { timeout: 30000, stdio: 'ignore' });
        log(`Portada generada: blog/img/${post.slug}.jpg`);
      } catch {
        await copyFile(pngTemporal, pngPath);
        log(`Portada generada: blog/img/${post.slug}.png`);
      }
    } catch (error) {
      log(`Aviso: no se pudo rasterizar la portada ${post.slug}: ${error.message}`);
    } finally {
      try { await unlink(htmlTemporal); } catch {}
      try { await unlink(pngTemporal); } catch {}
    }
  }
}

async function urlPortada(post) {
  const jpgPath = path.join(IMG_DIR, `${post.slug}.jpg`);
  if (await existeArchivo(jpgPath)) return `${SITE}/blog/img/${post.slug}.jpg`;
  const pngPath = path.join(IMG_DIR, `${post.slug}.png`);
  return (await existeArchivo(pngPath))
    ? `${SITE}/blog/img/${post.slug}.png`
    : `${SITE}/blog/img/${post.slug}.svg`;
}

async function urlPortadaBlog(fecha) {
  const version = fecha || hoyISO();
  if (await existeArchivo(path.join(IMG_DIR, 'portada-blog.jpg'))) return `${SITE}/blog/img/portada-blog.jpg?v=${version}`;
  if (await existeArchivo(path.join(IMG_DIR, 'portada-blog.png'))) return `${SITE}/blog/img/portada-blog.png?v=${version}`;
  return `${SITE}/blog/img/portada-blog.svg?v=${version}`;
}

function normalizarClave(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function coincideClave(texto, clave) {
  const buscada = normalizarClave(clave);
  if (!buscada) return false;
  if (buscada.length <= 4) {
    const patron = buscada.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${patron}([^a-z0-9]|$)`).test(texto);
  }
  return texto.includes(buscada);
}

function puntuarFoto(foto, texto, tag) {
  let puntos = 0;
  if (Array.isArray(foto.tags) && foto.tags.includes(tag)) puntos += 4;
  const base = normalizarClave(texto);
  for (const clave of foto.claves || []) {
    if (coincideClave(base, clave)) puntos += 5;
  }
  return puntos;
}

function elegirFoto(post, seccion, usadas) {
  const texto = [post.title, post.topic, seccion.heading, ...(seccion.paragraphs || [])].join(' ');
  const candidatas = FOTOS_BLOG
    .filter((foto) => foto.archivo && !usadas.has(foto.archivo))
    .map((foto) => ({ ...foto, puntos: puntuarFoto(foto, texto, post.tag) }))
    .sort((a, b) => b.puntos - a.puntos || a.archivo.length - b.archivo.length);
  const elegida = candidatas.find((foto) => foto.puntos > 0) || candidatas[0];
  if (elegida) usadas.add(elegida.archivo);
  return elegida;
}

async function cargarFotos() {
  try {
    const bruto = await readFile(path.join(IMG_DIR, 'fotos.json'), 'utf8');
    const fotos = JSON.parse(bruto);
    return Array.isArray(fotos) ? fotos.filter((foto) => foto.archivo) : [];
  } catch {
    return [];
  }
}

function slugify(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function limpiarTexto(valor) {
  return String(valor ?? '')
    .replace(/\r/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[¿¡]{2,}/g, (m) => m[0])
    .replace(/\?{2,}/g, '?')
    .replace(/!{2,}/g, '!')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\bcomputadoras\b/gi, 'ordenadores')
    .replace(/\bcomputadora\b/gi, 'ordenador')
    .replace(/\bcomputador\b/gi, 'ordenador')
    .replace(/\bcelulares\b/gi, 'móviles')
    .replace(/\bcelular\b/gi, 'móvil')
    .replace(/\bagregar\b/gi, 'añadir')
    .replace(/\bagrega\b/gi, 'añade')
    .replace(/\bchecar\b/gi, 'comprobar')
    .replace(/\bcomputación\b/gi, 'informática')
    .replace(/\bcostos\b/gi, 'costes')
    .replace(/\bcosto\b/gi, 'coste')
    .replace(/\brasgos\b/gi, 'arañazos')
    .replace(/\bfallantes\b/gi, 'defectuosos')
    .replace(/\brayones\b/gi, 'arañazos')
    .replace(/\bconfiable\b/gi, 'fiable')
    .replace(/\bfallas\b/gi, 'fallos')
    .replace(/\breemplazar\b/gi, 'sustituir')
    .replace(/\breemplazo\b/gi, 'sustitución')
    .replace(/\bChecklist\b/g, 'checklist')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarArticulo(obj, tema, tagSugerido) {
  if (!obj || typeof obj !== 'object') throw new Error('La respuesta no es un objeto JSON');

  const title = limpiarTexto(obj.title);
  const summary = limpiarTexto(obj.summary);
  const tag = limpiarTexto(obj.tag) || tagSugerido;
  let conclusion = limpiarTexto(obj.conclusion).replace(/^(Seguidamente|A continuaci[oó]n),\s*/i, '');
  if (conclusion && conclusion[0] === conclusion[0].toLowerCase()) conclusion = conclusion[0].toUpperCase() + conclusion.slice(1);

  const secciones = (Array.isArray(obj.sections) ? obj.sections : [])
    .map((s) => ({
      heading: limpiarTexto(s && s.heading),
      paragraphs: (Array.isArray(s && s.paragraphs) ? s.paragraphs : [s && s.paragraphs])
        .map(limpiarTexto)
        .filter((p) => p.length > 20)
    }))
    .filter((s) => s.heading && s.paragraphs.length > 0);

  const tips = (Array.isArray(obj.tips) ? obj.tips : [])
    .map(limpiarTexto)
    .filter((t) => t.length > 15);

  if (title.length < 10 || title.length > 140) throw new Error('Título fuera de rango');
  if (summary.length < 30 || summary.length > 280) throw new Error('Resumen fuera de rango');
  if (secciones.length < 3) throw new Error('Se necesitan al menos 3 secciones');
  if (tips.length < 3) throw new Error('Se necesitan al menos 3 consejos');
  if (conclusion.length < 40) throw new Error('Conclusión demasiado corta');

  const palabras = contarPalabras({ title, summary, conclusion, tips, sections: secciones });
  if (palabras < 400) throw new Error(`Artículo demasiado corto (${palabras} palabras)`);

  return { title, summary, tag, sections: secciones, tips, conclusion };
}

function contarPalabras(post) {
  const texto = [
    post.title,
    post.summary,
    post.conclusion,
    ...post.tips,
    ...post.sections.flatMap((s) => [s.heading, ...s.paragraphs])
  ].join(' ');
  return texto.split(/\s+/).filter(Boolean).length;
}

async function generarConOllama(tema, tag, fecha, intento = 1, errorPrevio = '') {
  const prompt = `Eres redactor de divulgación informática para TecnoLobato, un taller de reparación y montaje de PC en Chipiona (Cádiz, España).

Escribe en español de España, con tono cercano, claro y profesional, para usuarios domésticos y gamers. Usa "ordenador" o "PC"; nunca "computadora". No inventes precios, estadísticas ni noticias. No uses Markdown, HTML ni emojis.

Tema del artículo: "${tema}"
Categoría sugerida: ${tag}
Fecha: ${fecha}
${intento > 1 ? `El intento anterior no cumplió el esquema (${errorPrevio}). Corrige el formato y devuelve SOLO JSON válido.` : ''}

Devuelve SOLO un objeto JSON con esta estructura exacta:
{
  "title": "titular atractivo, máximo 90 caracteres",
  "summary": "resumen de 1 o 2 frases, máximo 240 caracteres",
  "tag": "una de estas categorías: Hardware, Seguridad, Redes, Software o Mantenimiento",
  "sections": [
    { "heading": "título de sección concreto", "paragraphs": ["párrafo 1", "párrafo 2"] }
  ],
  "tips": ["consejo práctico y accionable", "consejo 2", "consejo 3", "consejo 4"],
  "conclusion": "párrafo final con una invitación suave a contactar con TecnoLobato por WhatsApp"
}

Requisitos de contenido:
- Entre 4 y 6 secciones.
- De 2 a 3 párrafos por sección.
- Entre 700 y 900 palabras en total.
- El resumen no debe repetir literalmente el título; debe explicar qué aprenderá el lector.
- Incluye ejemplos prácticos, criterios concretos y pasos comprobables.
- Incluye una sección de errores comunes o cuándo pedir ayuda.
- Los consejos deben ser acciones concretas, no frases genéricas.
- No repitas la misma idea en varias secciones.
- No uses listas dentro de los párrafos ni escribas el título como encabezado de sección.
- Si mencionas una herramienta, explica para qué sirve; no recomiendes foros ni webs de forma vaga.
- No prometas resultados garantizados ni des consejos peligrosos.
- No uses las palabras "costos", "computadora", "celular" ni "agregar".`;

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 8 * 60 * 1000);
  try {
    const respuesta = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controlador.signal,
      body: JSON.stringify({
        model: MODELO,
        prompt,
        stream: false,
        format: 'json',
        keep_alive: '30m',
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 2600
        }
      })
    });

    if (!respuesta.ok) throw new Error(`Ollama respondió HTTP ${respuesta.status}`);
    const datos = await respuesta.json();
    if (!datos.response) throw new Error('Ollama no devolvió contenido');
    return JSON.parse(datos.response);
  } finally {
    clearTimeout(temporizador);
  }
}

function seleccionarTema(posts, fecha) {
  const recientes = new Set(
    posts
      .slice(0, Math.max(0, TEMAS.length - 5))
      .map((p) => p.topic)
      .filter(Boolean)
  );
  const dia = Math.floor(new Date(`${fecha}T12:00:00Z`).getTime() / 86400000);
  const inicio = ((dia % TEMAS.length) + TEMAS.length) % TEMAS.length;
  for (let i = 0; i < TEMAS.length; i += 1) {
    const candidato = TEMAS[(inicio + i) % TEMAS.length];
    if (!recientes.has(candidato.tema)) return candidato;
  }
  return TEMAS[inicio];
}

function seleccionarFallback(posts, fecha) {
  const usados = new Set(posts.map((p) => p.topic));
  const dia = Math.floor(new Date(`${fecha}T12:00:00Z`).getTime() / 86400000);
  for (let i = 0; i < FALLBACKS.length; i += 1) {
    const candidato = FALLBACKS[(dia + i) % FALLBACKS.length];
    if (!usados.has(candidato.tema)) return candidato;
  }
  return FALLBACKS[dia % FALLBACKS.length];
}

function crearSlugUnico(base, posts) {
  const usados = new Set(posts.map((p) => p.slug));
  let slug = base || 'articulo';
  let n = 2;
  while (usados.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

async function cargarPosts() {
  try {
    const bruto = await readFile(POSTS_FILE, 'utf8');
    const datos = JSON.parse(bruto);
    return Array.isArray(datos) ? datos : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function ordenarPosts(posts) {
  return [...posts].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return String(a.title).localeCompare(String(b.title), 'es');
  });
}

function nav(base) {
  return `<header class="sticky top-0 z-40 border-b border-slate-800/80 bg-lobatoDark/90 backdrop-blur">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
      <a href="${base}index.html" class="flex items-center gap-3">
        <img src="${base}logo.jpg" alt="TecnoLobato" class="h-10 w-10 rounded-full border-2 border-lobatoGold object-cover">
        <span class="text-lg font-black tracking-wider text-white">TECNO<span class="text-lobatoGreen">LOBATO</span>
          <span class="block text-[9px] font-semibold uppercase tracking-[.18em] text-slate-400">Divulgación informática</span>
        </span>
      </a>
      <nav class="hidden items-center gap-5 text-sm font-medium text-slate-300 md:flex">
        <a href="${base}index.html" class="transition hover:text-lobatoGreen">Inicio</a>
        <a href="${base}directos.html" class="transition hover:text-lobatoGreen">Trabajos en directo</a>
        <a href="${base}segundamano.html" class="transition hover:text-lobatoGold">Segunda mano</a>
        <a href="${base}blog.html" class="font-bold text-lobatoGreen">Blog</a>
        <a href="${base}index.html#contacto" class="transition hover:text-lobatoGreen">Contacto</a>
      </nav>
      <a href="${WA}${encodeURIComponent('Hola TecnoLobato, quiero hacer una consulta')}" target="_blank" rel="noopener" class="rounded-lg bg-[#25D366] px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-[#1ebd59]">WhatsApp</a>
    </div>
    <nav class="flex gap-4 overflow-x-auto border-t border-slate-800/60 px-5 py-2 text-xs font-semibold text-slate-300 md:hidden">
      <a href="${base}index.html" class="whitespace-nowrap">Inicio</a>
      <a href="${base}directos.html" class="whitespace-nowrap">Directos</a>
      <a href="${base}segundamano.html" class="whitespace-nowrap">Segunda mano</a>
      <a href="${base}blog.html" class="whitespace-nowrap font-bold text-lobatoGreen">Blog</a>
      <a href="${base}index.html#contacto" class="whitespace-nowrap">Contacto</a>
    </nav>
  </header>`;
}

function footer(base) {
  return `<footer class="mt-16 border-t border-slate-800/80 bg-black/20 py-9 text-center text-xs text-slate-500">
    <p>© 2026 TecnoLobato · Servicios Informáticos · Chipiona (Cádiz)</p>
    <div class="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 font-medium">
      <a href="${base}index.html" class="transition hover:text-lobatoGreen">Inicio</a>
      <a href="${base}blog.html" class="transition hover:text-lobatoGreen">Blog</a>
      <a href="${base}directos.html" class="transition hover:text-lobatoGreen">Trabajos en directo</a>
      <a href="${base}segundamano.html" class="transition hover:text-lobatoGold">Segunda mano</a>
      <a href="https://twitch.tv/tecnolobato" target="_blank" rel="noopener" class="transition hover:text-purple-400">Twitch</a>
      <a href="${WA}${encodeURIComponent('Hola TecnoLobato, quiero hacer una consulta')}" target="_blank" rel="noopener" class="transition hover:text-emerald-400">WhatsApp</a>
    </div>
    <p class="mx-auto mt-4 max-w-md text-[10px] text-slate-600">Contenido divulgativo elaborado por TecnoLobato. Si vas a manipular hardware, hazlo con las precauciones adecuadas.</p>
  </footer>`;
}

function shell({ title, description, canonical, base, content, jsonLd, image }) {
  const ogImage = image || `${SITE}/logo.jpg`;
  return `<!DOCTYPE html>
<html lang="es" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} · Blog TecnoLobato</title>
  <meta name="description" content="${esc(description)}">
  <meta name="author" content="TecnoLobato">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" type="image/png" href="${base}favicon.png">
  <link rel="apple-touch-icon" href="${base}logo.jpg">
  <meta property="og:type" content="${canonical.endsWith('/blog.html') ? 'website' : 'article'}">
  <meta property="og:site_name" content="TecnoLobato">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:locale" content="es_ES">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            lobatoDark: '#070d14',
            lobatoCard: '#0f1923',
            lobatoGreen: '#10b981',
            lobatoGold: '#d4af37',
            waGreen: '#25D366'
          }
        }
      }
    }
  </script>
  <style>
    body {
      background:
        radial-gradient(circle at 10% 0%, rgba(16,185,129,.10), transparent 30rem),
        radial-gradient(circle at 90% 5%, rgba(212,175,55,.08), transparent 28rem),
        linear-gradient(180deg, #050b12 0%, #07111b 50%, #050b12 100%);
    }
    .tl-grid-bg {
      background-image:
        linear-gradient(rgba(16,185,129,.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(16,185,129,.05) 1px, transparent 1px);
      background-size: 42px 42px;
      mask-image: linear-gradient(to bottom, black, transparent 85%);
    }
    .tl-card {
      transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
    }
    .tl-card:hover {
      transform: translateY(-4px);
      border-color: rgba(16,185,129,.42);
      box-shadow: 0 18px 45px rgba(0,0,0,.28);
    }
    .tl-shimmer {
      background: linear-gradient(90deg, #10b981, #f0d58a, #10b981);
      background-size: 220% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      animation: tlShimmer 4s linear infinite;
    }
    @keyframes tlShimmer { to { background-position: 220% 0; } }
    .blog-prose p { color: #cbd5e1; line-height: 1.8; margin-top: 1rem; }
    .blog-prose h2 { color: #fff; font-weight: 800; font-size: 1.45rem; line-height: 1.25; margin-top: 2.5rem; letter-spacing: -.01em; }
    #blog-progress {
      position: fixed; top: 0; left: 0; z-index: 60;
      height: 3px; width: 0;
      background: linear-gradient(90deg, #10b981, #d4af37);
      box-shadow: 0 0 12px rgba(16,185,129,.6);
      transition: width .1s linear;
    }
    .blog-keypoints {
      border: 1px solid rgba(212,175,55,.28);
      background: linear-gradient(135deg, rgba(212,175,55,.08), rgba(15,25,35,.9));
      border-radius: 1rem;
      padding: 1.25rem 1.4rem;
    }
    .blog-keypoints ul li { display: flex; gap: .65rem; align-items: flex-start; }
    .blog-toc-mobile {
      border: 1px solid #1e293b;
      background: rgba(15,25,35,.85);
      border-radius: 1rem;
      padding: .9rem 1.1rem;
    }
    .blog-toc-mobile summary { cursor: pointer; font-size: .8rem; font-weight: 800; color: #e2e8f0; list-style: none; }
    .blog-toc-mobile summary::-webkit-details-marker { display: none; }
    .blog-toc-mobile summary::after { content: '+'; float: right; color: #10b981; font-weight: 900; }
    .blog-toc-mobile[open] summary::after { content: '−'; }
    .blog-toc { list-style: none; margin: 0; padding: 0; }
    .blog-toc li + li { margin-top: .35rem; }
    .blog-toc a {
      display: flex; gap: .55rem; align-items: baseline;
      border-radius: .6rem; padding: .5rem .6rem;
      font-size: .8rem; line-height: 1.35; color: #94a3b8;
      transition: background .2s ease, color .2s ease;
    }
    .blog-toc a:hover { color: #d1fae5; background: rgba(16,185,129,.08); }
    .blog-toc a.is-active { color: #6ee7b7; background: rgba(16,185,129,.12); }
    .blog-toc a span { font-size: .62rem; font-weight: 900; letter-spacing: .08em; color: #64748b; }
    .blog-toc a.is-active span { color: #34d399; }
    .blog-section-head { display: flex; align-items: flex-start; gap: .8rem; margin-top: 2.6rem; }
    .blog-section-head h2 { margin-top: 0; }
    .blog-section-num {
      flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
      min-width: 2rem; height: 2rem; margin-top: .1rem;
      border-radius: .6rem; border: 1px solid rgba(16,185,129,.35);
      background: rgba(16,185,129,.12);
      font-size: .68rem; font-weight: 900; letter-spacing: .08em; color: #6ee7b7;
    }
    .blog-prose .blog-lead::first-letter {
      float: left; padding: .1rem .55rem 0 0;
      font-size: 3.6rem; line-height: .82; font-weight: 900; color: #10b981;
    }
    .blog-figure, .blog-hero { overflow: hidden; border-radius: 1rem; border: 1px solid #1e293b; background: #0f1923; }
    .blog-figure { margin: 1.6rem 0 1.8rem; }
    .blog-hero { border-radius: 1.25rem; box-shadow: 0 20px 50px rgba(0,0,0,.28); }
    .blog-figure img, .blog-hero img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; }
    .blog-figure figcaption, .blog-hero figcaption { padding: .8rem 1rem 1rem; font-size: .72rem; line-height: 1.5; color: #94a3b8; }
    .blog-figure figcaption > span:first-child, .blog-hero figcaption > span:first-child { display: block; color: #cbd5e1; }
    .blog-credito { display: block; margin-top: .35rem; color: #64748b; font-size: .65rem; }
    .blog-credito a { color: #34d399; text-decoration: none; }
    .blog-credito a:hover { text-decoration: underline; }
    .blog-pullquote {
      margin: 2rem 0; padding: 1.1rem 1.3rem;
      border-left: 3px solid #d4af37; border-radius: 0 .9rem .9rem 0;
      background: linear-gradient(90deg, rgba(212,175,55,.08), transparent);
      color: #e2e8f0; font-size: 1.1rem; line-height: 1.6; font-weight: 600; font-style: italic;
    }
    .blog-prose a { color: #34d399; text-decoration: underline; text-decoration-color: rgba(52,211,153,.4); text-underline-offset: 2px; }
    .blog-prose a:hover { color: #6ee7b7; }
    @media (max-width: 640px) {
      .blog-prose .blog-lead::first-letter { font-size: 3rem; }
      .blog-pullquote { font-size: 1rem; }
    }
    [hidden] { display: none !important; }
    ::selection { background: #10b981; color: #000; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
    }
  </style>
  ${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
</head>
<body class="min-h-screen bg-lobatoDark font-sans text-slate-200 antialiased">
  ${nav(base)}
  ${content}
  ${footer(base)}
</body>
</html>
`;
}

function tarjetaArticulo(post, base) {
  return `<a href="${base}blog/${post.slug}.html" class="tl-card group flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-lobatoCard/85" data-tag="${esc(post.tag)}">
    <img src="${base}blog/img/${post.slug}.svg" alt="Portada de ${esc(post.title)}" loading="lazy" class="aspect-[1200/630] w-full border-b border-slate-800 object-cover">
    <div class="flex flex-1 flex-col p-5">
    <div class="flex items-center justify-between gap-2 text-[11px] font-semibold">
      <span class="rounded-full border border-emerald-500/30 bg-emerald-950/50 px-2.5 py-1 text-emerald-300">${esc(post.tag)}</span>
      <span class="text-slate-500">${esc(fechaLarga(post.date))}</span>
    </div>
    <h3 class="mt-4 text-lg font-bold leading-snug text-white transition group-hover:text-emerald-300">${esc(post.title)}</h3>
    <p class="mt-2 flex-1 text-sm leading-relaxed text-slate-400">${esc(post.summary)}</p>
    <div class="mt-5 flex items-center justify-between text-xs font-semibold text-slate-500">
      <span>${esc(post.readTime)} de lectura</span>
      <span class="text-emerald-400 transition group-hover:translate-x-0.5">Leer &rarr;</span>
    </div>
    </div>
  </a>`;
}

function renderIndice(posts, ogImage) {
  const ordenados = ordenarPosts(posts);
  const ultimo = ordenados[0];
  const tags = [...new Set(ordenados.map((p) => p.tag).filter(Boolean))];
  const resto = ordenados.slice(1);

  const destacado = ultimo
    ? `<a href="blog/${ultimo.slug}.html" class="tl-card group relative block overflow-hidden rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/70 via-lobatoCard to-lobatoDark p-7 sm:p-10">
        <div class="absolute inset-0 tl-grid-bg opacity-60"></div>
        <div class="relative">
          <span class="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/60 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-emerald-300">Último artículo</span>
          <div class="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-400">
            <span class="text-emerald-300">${esc(ultimo.tag)}</span>
            <span aria-hidden="true">·</span>
            <time datetime="${esc(ultimo.date)}">${esc(fechaLarga(ultimo.date))}</time>
            <span aria-hidden="true">·</span>
            <span>${esc(ultimo.readTime)} de lectura</span>
          </div>
          <h2 class="mt-3 max-w-3xl text-2xl font-black leading-tight text-white transition group-hover:text-emerald-200 sm:text-4xl">${esc(ultimo.title)}</h2>
          <p class="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">${esc(ultimo.summary)}</p>
          <img src="blog/img/${ultimo.slug}.svg" alt="Portada de ${esc(ultimo.title)}" loading="eager" class="mt-6 w-full rounded-2xl border border-slate-800">
          <span class="mt-6 inline-flex items-center gap-2 text-sm font-extrabold text-emerald-400">Leer el artículo <span class="transition group-hover:translate-x-1">&rarr;</span></span>
        </div>
      </a>`
    : `<div class="rounded-3xl border border-dashed border-slate-700 bg-lobatoCard/60 p-10 text-center">
        <p class="text-lg font-bold text-white">Todavía no hay artículos publicados.</p>
        <p class="mt-2 text-sm text-slate-400">El primer post diario aparecerá aquí en la próxima ejecución.</p>
      </div>`;

  const filtros = `<div id="blog-filters" class="flex flex-wrap gap-2">
    <button type="button" data-filter="all" class="rounded-full bg-lobatoGreen px-3.5 py-1.5 text-[11px] font-extrabold text-black transition">Todos</button>
    ${tags.map((tag) => `<button type="button" data-filter="${esc(tag)}" class="rounded-full border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-[11px] font-bold text-slate-300 transition hover:border-emerald-500/50 hover:text-emerald-300">${esc(tag)}</button>`).join('')}
  </div>`;

  const archivo = resto.length
    ? `<div class="mt-12">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-[11px] font-black uppercase tracking-[.16em] text-lobatoGold">Archivo</p>
            <h2 class="mt-1 text-2xl font-black text-white">Todos los artículos</h2>
          </div>
          ${filtros}
        </div>
        <div id="blog-grid" class="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          ${resto.map((p) => tarjetaArticulo(p, '')).join('')}
        </div>
      </div>`
    : '';

  const contenido = `<main>
    <section class="relative overflow-hidden border-b border-slate-800/60">
      <div class="absolute inset-0 tl-grid-bg"></div>
      <div class="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-14 pt-16 sm:px-8 sm:pt-20 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <p class="text-[11px] font-black uppercase tracking-[.18em] text-emerald-400">Divulgación informática</p>
          <h1 class="mt-3 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl">Aprende informática <span class="tl-shimmer">sin humo</span></h1>
          <p class="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">Un artículo nuevo cada día sobre hardware, seguridad, redes y software. Explicaciones claras, consejos prácticos y cero tecnicismos innecesarios.</p>
          <div class="mt-8 flex flex-wrap gap-3 text-xs font-semibold text-slate-400">
            <span class="rounded-full border border-slate-700 bg-slate-900/70 px-3.5 py-2">Un post diario</span>
            <span class="rounded-full border border-slate-700 bg-slate-900/70 px-3.5 py-2">${ordenados.length} ${ordenados.length === 1 ? 'artículo publicado' : 'artículos publicados'}</span>
            <span class="rounded-full border border-slate-700 bg-slate-900/70 px-3.5 py-2">Hecho en Chipiona (Cádiz)</span>
          </div>
        </div>
        <div class="relative">
          <img src="blog/img/portada-blog.svg?v=${hoyISO()}" alt="Portada del blog de divulgación informática de TecnoLobato" class="w-full rounded-2xl border border-slate-800 shadow-2xl" loading="eager">
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      ${destacado}
      ${archivo}
    </section>

    <section class="mx-auto max-w-6xl px-5 pb-4 sm:px-8">
      <div class="rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/50 via-lobatoCard to-lobatoDark p-7 sm:p-10">
        <div class="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div class="max-w-2xl">
            <p class="text-[11px] font-black uppercase tracking-[.16em] text-emerald-400">¿Tienes un problema real?</p>
            <h2 class="mt-2 text-2xl font-black text-white sm:text-3xl">La teoría está bien. Resolverlo, mejor.</h2>
            <p class="mt-3 text-sm leading-relaxed text-slate-300">Si tu equipo no arranca, se calienta o quieres montar algo a medida, cuéntanoslo por WhatsApp y te orientamos sin compromiso.</p>
          </div>
          <a href="${WA}${encodeURIComponent('Hola TecnoLobato, he leído el blog y quiero hacer una consulta')}" target="_blank" rel="noopener" class="shrink-0 rounded-xl bg-lobatoGreen px-6 py-3.5 text-sm font-black text-black shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400">Hablar con TecnoLobato</a>
        </div>
      </div>
    </section>
  </main>
  <script>
    (function () {
      var filtros = document.getElementById('blog-filters');
      var rejilla = document.getElementById('blog-grid');
      if (!filtros || !rejilla) return;
      filtros.addEventListener('click', function (evento) {
        var boton = evento.target.closest('button[data-filter]');
        if (!boton) return;
        var filtro = boton.getAttribute('data-filter');
        filtros.querySelectorAll('button[data-filter]').forEach(function (b) {
          var activo = b === boton;
          b.className = activo
            ? 'rounded-full bg-lobatoGreen px-3.5 py-1.5 text-[11px] font-extrabold text-black transition'
            : 'rounded-full border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-[11px] font-bold text-slate-300 transition hover:border-emerald-500/50 hover:text-emerald-300';
        });
        rejilla.querySelectorAll('[data-tag]').forEach(function (tarjeta) {
          tarjeta.hidden = filtro !== 'all' && tarjeta.getAttribute('data-tag') !== filtro;
        });
      });
    })();
  </script>`;

  const jsonLd = jsonSeguro({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Blog de TecnoLobato',
    description: 'Divulgación informática diaria sobre hardware, seguridad, redes y software.',
    url: `${SITE}/blog.html`,
    inLanguage: 'es-ES',
    publisher: {
      '@type': 'Organization',
      name: 'TecnoLobato',
      logo: { '@type': 'ImageObject', url: `${SITE}/logo.jpg` }
    },
    blogPost: ordenados.slice(0, 10).map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${SITE}/blog/${p.slug}.html`,
      datePublished: p.date
    }))
  });

  return shell({
    title: 'Divulgación informática',
    description: 'Blog diario de TecnoLobato: hardware, seguridad, redes y software explicados con claridad y consejos prácticos.',
    canonical: `${SITE}/blog.html`,
    base: '',
    content: contenido,
    jsonLd,
    image: ogImage
  });
}

function extraerFrase(texto) {
  const frases = String(texto || '')
    .split(/(?<=[.!?])\s+/)
    .map((frase) => frase.trim())
    .filter((frase) => frase.length >= 70 && frase.length <= 210);
  return frases[0] || '';
}

function renderPost(post, posts, ogImage) {
  const base = '../';
  const relacionados = ordenarPosts(posts)
    .filter((p) => p.slug !== post.slug)
    .slice(0, 3);
  const usadas = new Set();
  const fotoHeroe = elegirFoto(post, { heading: post.title, paragraphs: [post.summary] }, usadas);
  const heroe = fotoHeroe
    ? `<figure class="blog-hero">
          <img src="${base}blog/img/fotos/${fotoHeroe.archivo}" alt="${esc(fotoHeroe.alt)}" width="1200" height="800" loading="eager" fetchpriority="high">
          <figcaption>
            <span>${esc(fotoHeroe.pie)}</span>
            <span class="blog-credito">Foto: <a href="${esc(fotoHeroe.fuente)}" target="_blank" rel="noopener nofollow">${esc(fotoHeroe.credito)}</a>${fotoHeroe.licenciaUrl ? ` · <a href="${esc(fotoHeroe.licenciaUrl)}" target="_blank" rel="noopener nofollow">${esc(fotoHeroe.licencia)}</a>` : ''}</span>
          </figcaption>
        </figure>`
    : `<figure class="blog-hero">
          <img src="${base}blog/img/${post.slug}.svg" alt="Portada del artículo: ${esc(post.title)}" class="w-full" loading="eager">
        </figure>`;

  const secciones = post.sections.map((seccion, i) => {
    const numero = i + 1;
    const figura = i % 2 === 0 ? elegirFoto(post, seccion, usadas) : null;
    const parrafos = seccion.paragraphs.map((parrafo, j) =>
      `<p${i === 0 && j === 0 ? ' class="blog-lead"' : ''}>${esc(parrafo)}</p>`
    ).join('');
    const imagen = figura ? `<figure class="blog-figure">
      <img src="${base}blog/img/fotos/${figura.archivo}" alt="${esc(figura.alt)}" width="1200" height="800" loading="lazy" decoding="async">
      <figcaption>
        <span>${esc(figura.pie)}</span>
        <span class="blog-credito">Foto: <a href="${esc(figura.fuente)}" target="_blank" rel="noopener nofollow">${esc(figura.credito)}</a>${figura.licenciaUrl ? ` · <a href="${esc(figura.licenciaUrl)}" target="_blank" rel="noopener nofollow">${esc(figura.licencia)}</a>` : ''}</span>
      </figcaption>
    </figure>` : '';
    const cita = i === 1 ? extraerFrase(seccion.paragraphs?.[0]) : '';
    const pullquote = cita ? `<blockquote class="blog-pullquote">“${esc(cita)}”</blockquote>` : '';
    return `<section id="seccion-${numero}" class="blog-section scroll-mt-28">
      <div class="blog-section-head">
        <span class="blog-section-num">${String(numero).padStart(2, '0')}</span>
        <h2>${esc(seccion.heading)}</h2>
      </div>
      ${parrafos}
      ${imagen}
      ${pullquote}
    </section>`;
  }).join('');

  const indice = post.sections.map((seccion, i) =>
    `<li><a href="#seccion-${i + 1}"><span>${String(i + 1).padStart(2, '0')}</span>${esc(seccion.heading)}</a></li>`
  ).join('');

  const puntosClave = post.tips.slice(0, 3).map((tip) =>
    `<li><svg class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>${esc(tip)}</span></li>`
  ).join('');

  const tips = post.tips.map((tip, i) => `<li class="flex gap-3 rounded-xl border border-emerald-500/15 bg-emerald-950/20 p-4">
    <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-black text-emerald-300">${i + 1}</span>
    <span class="text-sm leading-relaxed text-slate-300">${esc(tip)}</span>
  </li>`).join('');

  const urlPost = `${SITE}/blog/${post.slug}.html`;
  const waTexto = encodeURIComponent(`Hola TecnoLobato, he leído el artículo "${post.title}" y quiero hacer una consulta`);
  const waCompartir = `https://wa.me/?text=${encodeURIComponent(`${post.title} — ${urlPost}`)}`;
  const xCompartir = `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(urlPost)}`;

  const rel = relacionados.length
    ? `<div class="space-y-3">
        ${relacionados.map((p) => `<a href="${base}blog/${p.slug}.html" class="group flex gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 transition hover:border-emerald-500/40">
          <img src="${base}blog/img/${p.slug}.svg" alt="" class="h-16 w-24 shrink-0 rounded-lg border border-slate-800 object-cover" loading="lazy">
          <span class="min-w-0">
            <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-400">${esc(p.tag)}</span>
            <span class="mt-1 block text-xs font-bold leading-snug text-white transition group-hover:text-emerald-300">${esc(p.title)}</span>
          </span>
        </a>`).join('')}
      </div>`
    : '';

  const contenido = `<div id="blog-progress" aria-hidden="true"></div>
  <main class="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
    <nav class="mb-8 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500" aria-label="Migas de pan">
      <a href="${base}index.html" class="transition hover:text-lobatoGreen">Inicio</a>
      <span aria-hidden="true">/</span>
      <a href="${base}blog.html" class="transition hover:text-lobatoGreen">Blog</a>
      <span aria-hidden="true">/</span>
      <span class="text-slate-300">${esc(post.tag)}</span>
    </nav>

    <div class="grid gap-10 lg:grid-cols-3">
      <article class="min-w-0 lg:col-span-2">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-slate-400">
          <span class="rounded-full border border-emerald-500/30 bg-emerald-950/50 px-3 py-1 text-emerald-300">${esc(post.tag)}</span>
          <time datetime="${esc(post.date)}">${esc(fechaLarga(post.date))}</time>
          <span aria-hidden="true">·</span>
          <span>${esc(post.readTime)} de lectura</span>
          <span aria-hidden="true">·</span>
          <span>Por <strong class="text-slate-300">TecnoLobato</strong></span>
        </div>

        <h1 class="mt-5 text-3xl font-black leading-[1.1] tracking-tight text-white sm:text-5xl">${esc(post.title)}</h1>
        <p class="mt-5 border-l-2 border-emerald-500/60 pl-5 text-base leading-relaxed text-slate-300 sm:text-lg">${esc(post.summary)}</p>
        <div class="mt-7">${heroe}</div>

        <div class="blog-keypoints mt-8">
          <p class="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.16em] text-emerald-400">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>
            Lo esencial en 30 segundos
          </p>
          <ul class="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-300">${puntosClave}</ul>
        </div>

        <details class="blog-toc-mobile mt-5 lg:hidden">
          <summary>En este artículo</summary>
          <ol class="blog-toc">${indice}</ol>
        </details>

        <div class="blog-prose mt-8">
          ${secciones}

          <div class="mt-12 rounded-3xl border border-emerald-500/30 bg-emerald-950/30 p-6 sm:p-8">
            <h2 class="!mt-0 flex items-center gap-2 text-lg font-black text-white">
              <svg class="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z"/><path d="M9 22h6"/></svg>
              Consejos prácticos
            </h2>
            <ol class="mt-6 grid gap-3 sm:grid-cols-2">${tips}</ol>
          </div>

          <div class="mt-10 rounded-2xl border border-slate-800 bg-lobatoCard/80 p-6 sm:p-7">
            <h2 class="!mt-0 text-lg font-black text-white">Para terminar</h2>
            <p class="!mt-3">${esc(post.conclusion)}</p>
          </div>

          <div class="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/60 to-lobatoCard p-6 sm:flex-row sm:items-center">
            <div>
              <p class="text-sm font-black text-white">¿Quieres que lo revisemos contigo?</p>
              <p class="mt-1 text-xs leading-relaxed text-slate-400">Escríbenos por WhatsApp y te orientamos sobre tu equipo sin compromiso.</p>
            </div>
            <a href="${WA}${waTexto}" target="_blank" rel="noopener" class="shrink-0 rounded-xl bg-[#25D366] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#1ebd59]">Consultar por WhatsApp</a>
          </div>

          <div class="mt-8 flex flex-wrap items-center gap-2 text-xs font-bold">
            <span class="text-slate-500">Compartir:</span>
            <a href="${esc(waCompartir)}" target="_blank" rel="noopener" class="rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-emerald-500/50 hover:text-emerald-300">WhatsApp</a>
            <a href="${esc(xCompartir)}" target="_blank" rel="noopener" class="rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-emerald-500/50 hover:text-emerald-300">X</a>
            <button type="button" data-copiar="${esc(urlPost)}" class="rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-emerald-500/50 hover:text-emerald-300">Copiar enlace</button>
          </div>
        </div>

        <div class="mt-10 border-t border-slate-800 pt-6">
          <a href="${base}blog.html" class="text-sm font-bold text-emerald-400 transition hover:text-emerald-300">&larr; Volver a todos los artículos</a>
        </div>
      </article>

      <aside class="space-y-5">
        <div class="space-y-5 lg:sticky lg:top-24">
          <div class="hidden rounded-2xl border border-slate-800 bg-lobatoCard/85 p-6 lg:block">
            <p class="text-[10px] font-black uppercase tracking-[.16em] text-lobatoGold">En este artículo</p>
            <ol class="blog-toc mt-4">${indice}</ol>
          </div>
          <div class="rounded-2xl border border-slate-800 bg-lobatoCard/85 p-6">
            <div class="flex items-center gap-3">
              <img src="${base}logo.jpg" alt="TecnoLobato" class="h-12 w-12 rounded-full border-2 border-lobatoGold object-cover">
              <div>
                <p class="text-sm font-black text-white">TecnoLobato</p>
                <p class="text-[11px] font-semibold text-slate-400">Taller informático · Chipiona</p>
              </div>
            </div>
            <p class="mt-4 text-xs leading-relaxed text-slate-400">Montaje, reparación, mantenimiento y presupuestos a medida. Publicamos divulgación informática todos los días.</p>
            <a href="${base}index.html#contacto" class="mt-4 block rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-center text-xs font-extrabold text-emerald-300 transition hover:bg-emerald-900/50">Pedir presupuesto</a>
          </div>
        </div>
        ${rel ? `<div class="rounded-2xl border border-slate-800 bg-lobatoCard/85 p-6">
          <p class="text-[10px] font-black uppercase tracking-[.16em] text-lobatoGold">Sigue leyendo</p>
          <div class="mt-4">${rel}</div>
        </div>` : ''}
      </aside>
    </div>
  </main>

  <script>
    (function () {
      var barra = document.getElementById('blog-progress');
      if (barra) {
        var actualizar = function () {
          var total = document.documentElement.scrollHeight - window.innerHeight;
          var avance = total > 0 ? Math.min(100, Math.max(0, (window.scrollY / total) * 100)) : 0;
          barra.style.width = avance + '%';
        };
        window.addEventListener('scroll', actualizar, { passive: true });
        actualizar();
      }

      var enlaces = Array.prototype.slice.call(document.querySelectorAll('.blog-toc a'));
      if (enlaces.length && 'IntersectionObserver' in window) {
        var observador = new IntersectionObserver(function (entradas) {
          entradas.forEach(function (entrada) {
            if (!entrada.isIntersecting) return;
            enlaces.forEach(function (enlace) {
              enlace.classList.toggle('is-active', enlace.getAttribute('href') === '#' + entrada.target.id);
            });
          });
        }, { rootMargin: '-20% 0px -70% 0px' });
        document.querySelectorAll('.blog-section').forEach(function (seccion) { observador.observe(seccion); });
      }

      document.querySelectorAll('[data-copiar]').forEach(function (boton) {
        boton.addEventListener('click', function () {
          var texto = boton.getAttribute('data-copiar');
          if (!navigator.clipboard) return;
          navigator.clipboard.writeText(texto).then(function () {
            var original = boton.textContent;
            boton.textContent = '¡Copiado!';
            setTimeout(function () { boton.textContent = original; }, 1800);
          });
        });
      });
    })();
  </script>`;

  const jsonLd = jsonSeguro({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: 'es-ES',
    articleSection: post.tag,
    image: ogImage,
    wordCount: contarPalabras(post),
    author: { '@type': 'Organization', name: 'TecnoLobato' },
    publisher: {
      '@type': 'Organization',
      name: 'TecnoLobato',
      logo: { '@type': 'ImageObject', url: `${SITE}/logo.jpg` }
    },
    mainEntityOfPage: `${SITE}/blog/${post.slug}.html`,
    url: `${SITE}/blog/${post.slug}.html`
  });

  return shell({
    title: post.title,
    description: post.summary,
    canonical: `${SITE}/blog/${post.slug}.html`,
    base,
    content: contenido,
    jsonLd,
    image: ogImage
  });
}

async function actualizarSitemap(posts) {
  const hoy = hoyISO();
  const entradas = [
    { loc: `${SITE}/`, lastmod: '2026-09-17', changefreq: 'weekly', priority: '1.0' },
    { loc: `${SITE}/directos.html`, lastmod: '2026-09-17', changefreq: 'weekly', priority: '0.8' },
    { loc: `${SITE}/blog.html`, lastmod: hoy, changefreq: 'daily', priority: '0.9' },
    ...ordenarPosts(posts).map((p) => ({
      loc: `${SITE}/blog/${p.slug}.html`,
      lastmod: p.date,
      changefreq: 'monthly',
      priority: '0.7'
    }))
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entradas.map((e) => `  <url>
    <loc>${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  await writeFile(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
}

function limpiarHtml(html) {
  return html.replace(/[ \t]+$/gm, '');
}

async function renderizarTodo(posts) {
  await mkdir(BLOG_DIR, { recursive: true });
  FOTOS_BLOG = await cargarFotos();
  const ordenados = ordenarPosts(posts);
  for (const post of ordenados) await asegurarPortada(post);
  const portadaBlog = {
    slug: 'portada-blog',
    title: 'Aprende informática sin humo',
    summary: 'Un artículo nuevo cada día sobre hardware, seguridad, redes y software, con consejos que puedes aplicar.',
    tag: 'Blog',
    date: hoyISO()
  };
  await asegurarPortada(portadaBlog, true);
  await writeFile(POSTS_FILE, `${JSON.stringify(ordenados, null, 2)}\n`, 'utf8');
  for (const post of ordenados) {
    const html = renderPost(post, ordenados, await urlPortada(post));
    await writeFile(path.join(BLOG_DIR, `${post.slug}.html`), limpiarHtml(html), 'utf8');
  }
  await writeFile(path.join(ROOT, 'blog.html'), limpiarHtml(renderIndice(ordenados, await urlPortadaBlog(portadaBlog.date))), 'utf8');
  await actualizarSitemap(ordenados);
  log(`Renderizados ${ordenados.length} artículos y blog.html`);
}

async function main() {
  const fecha = fechaPersonalizada || hoyISO();
  let posts = await cargarPosts();

  if (!soloRender) {
    const yaExiste = posts.find((p) => p.date === fecha);
    if (yaExiste && !forzar && !temaPersonalizado) {
      log(`Ya existe un artículo para ${fecha}: "${yaExiste.title}". No se genera otro.`);
      await renderizarTodo(posts);
      return;
    }

    const elegido = temaPersonalizado
      ? { tema: temaPersonalizado, tag: tagPersonalizado || 'Hardware' }
      : seleccionarTema(posts, fecha);
    log(`Generando artículo sobre: ${elegido.tema}`);

    let articulo = null;
    let error = null;
    for (let intento = 1; intento <= 2 && !articulo; intento += 1) {
      try {
        log(`Intento ${intento} con el modelo ${MODELO}...`);
        const bruto = await generarConOllama(elegido.tema, elegido.tag, fecha, intento, error || '');
        articulo = normalizarArticulo(bruto, elegido.tema, elegido.tag);
        log(`Artículo generado: "${articulo.title}"`);
      } catch (e) {
        error = e.message;
        log(`Fallo en el intento ${intento}: ${error}`);
      }
    }

    if (!articulo) {
      if (temaPersonalizado) {
        throw new Error(`No se pudo generar el artículo sobre "${temaPersonalizado}"`);
      }
      const reserva = seleccionarFallback(posts, fecha);
      log(`Usando artículo de reserva: "${reserva.title}"`);
      articulo = normalizarArticulo(reserva, reserva.tema, reserva.tag);
      elegido.tema = reserva.tema;
      elegido.tag = reserva.tag;
    }

    const baseSlug = slugify(elegido.tema);
    const post = {
      slug: crearSlugUnico(baseSlug, posts),
      title: articulo.title,
      date: fecha,
      summary: articulo.summary,
      tag: articulo.tag,
      readTime: `${Math.max(3, Math.round(contarPalabras(articulo) / 200))} min`,
      topic: elegido.tema,
      sections: articulo.sections,
      tips: articulo.tips,
      conclusion: articulo.conclusion
    };

    posts = [post, ...posts.filter((p) => p.slug !== post.slug)];
    log(`Publicado en blog/${post.slug}.html`);
  }

  await renderizarTodo(posts);
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, error);
  process.exitCode = 1;
});
