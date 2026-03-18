export type Category =
  | 'Comida'
  | 'Transporte'
  | 'Entretenimiento'
  | 'Compras'
  | 'Supermercado'
  | 'Salud'
  | 'Servicios'
  | 'Educación'
  | 'Viajes'
  | 'Otros';

interface CategoryRule {
  category: Category;
  keywords: string[];
}

const RULES: CategoryRule[] = [
  {
    category: 'Comida',
    keywords: [
      'restaurante', 'restaurant', 'taqueria', 'taquería', 'burger', 'pizza',
      'sushi', 'comida', 'food', 'cafe', 'café', 'coffee', 'starbucks',
      'mcdonalds', "mcdonald's", 'kfc', 'subway', 'dominos', "domino's",
      'little caesars', 'burger king', 'wendys', "wendy's", 'tacos',
      'uber eats', 'rappi', 'didi food', 'cornershop', 'los compadres',
      'el pollo', 'vips', 'ihop', 'chilis', "chili's", 'applebees', 'sanborns',
    ],
  },
  {
    category: 'Transporte',
    keywords: [
      'uber', 'cabify', 'didi', 'taxi', 'gasolina', 'pemex', 'bp',
      'shell', 'mobil', 'oxxo gas', 'combustible', 'estacionamiento',
      'parking', 'caseta', 'telmex', 'metro', 'metrobus', 'ecobici',
      'autobus', 'autobús', 'first class', 'ado', 'estrella',
    ],
  },
  {
    category: 'Entretenimiento',
    keywords: [
      'netflix', 'spotify', 'disney', 'hbo', 'amazon prime', 'apple tv',
      'youtube', 'cinema', 'cine', 'cinemex', 'cinepolis', 'cinépolis',
      'teatro', 'concierto', 'ticketmaster', 'superboletos', 'steam',
      'xbox', 'playstation', 'nintendo', 'google play', 'app store',
      'twitch', 'deezer', 'tidal',
    ],
  },
  {
    category: 'Supermercado',
    keywords: [
      'walmart', 'bodega aurrera', 'aurrera', 'chedraui', 'soriana',
      'superama', 'heb', 'la comer', 'lacomer', 'costco', 'sams club',
      "sam's club", 'city market', 'fresko', 'superstore', 'mercado',
      'tianguis',
    ],
  },
  {
    category: 'Compras',
    keywords: [
      'amazon', 'mercado libre', 'mercadolibre', 'liverpool', 'palacio',
      'suburbia', 'sears', 'macys', "macy's", 'zara', 'h&m', 'forever 21',
      'shein', 'nike', 'adidas', 'apple store', 'best buy', 'office depot',
      'officedepot', 'staples', 'home depot', 'homedepot', 'ikea',
    ],
  },
  {
    category: 'Salud',
    keywords: [
      'farmacia', 'farmacias', 'similares', 'del ahorro', 'benavides',
      'hospital', 'clinica', 'clínica', 'doctor', 'dentista', 'laboratorio',
      'optica', 'óptica', 'gym', 'gimnasio', 'smartfit', 'sport city',
    ],
  },
  {
    category: 'Servicios',
    keywords: [
      'telmex', 'telcel', 'at&t', 'movistar', 'izzi', 'megacable',
      'totalplay', 'cfe', 'luz', 'agua', 'gas natural', 'naturgy',
      'seguros', 'seguro', 'afore', 'bancomer', 'banamex', 'santander',
      'hsbc', 'inbursa', 'scotiabank',
    ],
  },
  {
    category: 'Educación',
    keywords: [
      'universidad', 'unam', 'tec', 'itesm', 'udg', 'ipn', 'colegio',
      'escuela', 'school', 'coursera', 'udemy', 'duolingo', 'platzi',
      'libreria', 'librería', 'libros', 'papeleria', 'papelería',
    ],
  },
  {
    category: 'Viajes',
    keywords: [
      'hotel', 'airbnb', 'booking', 'expedia', 'volaris', 'aeromexico',
      'aeroméxico', 'vivaaerobus', 'viva aerobus', 'interjet', 'aeropuerto',
      'vuelo', 'aerolinea', 'aerolínea', 'renta car', 'hertz', 'alamo',
    ],
  },
];

export function categorize(merchant: string, rawText: string = ''): Category {
  const haystack = `${merchant} ${rawText}`.toLowerCase();

  for (const rule of RULES) {
    for (const keyword of rule.keywords) {
      if (haystack.includes(keyword.toLowerCase())) {
        return rule.category;
      }
    }
  }

  return 'Otros';
}
