/**
 * The names stored in `categories.icon` (Lucide style, as the seed wrote
 * them) translated to Material Symbols, the same glyph set the phone
 * draws with (`lib/core/ui/iconos_de_categoria.dart`). The name is the
 * data; this map is only the dictionary, so a redesign never changes it.
 */
export const GLIFOS: Record<string, string> = {
  home: 'home', 'shopping-cart': 'shopping_cart', car: 'directions_car', 'heart-pulse': 'monitor_heart',
  'graduation-cap': 'school', user: 'person', popcorn: 'local_movies', users: 'group', landmark: 'account_balance',
  'file-text': 'description', gift: 'redeem', briefcase: 'work', laptop: 'computer', sparkles: 'auto_awesome',
  wallet: 'account_balance_wallet', 'credit-card': 'credit_card', 'piggy-bank': 'savings', banknote: 'payments',
  coins: 'paid', receipt: 'receipt_long', 'trending-up': 'insights', calendar: 'calendar_month', key: 'key',
  building: 'apartment', zap: 'bolt', droplet: 'water_drop', flame: 'local_fire_department', wifi: 'router',
  phone: 'phone', wrench: 'build', hammer: 'handyman', utensils: 'restaurant', coffee: 'local_cafe',
  'shopping-bag': 'shopping_bag', store: 'storefront', cake: 'cake', bus: 'directions_bus', fuel: 'local_gas_station',
  plane: 'flight', bike: 'pedal_bike', truck: 'local_shipping', pill: 'medication', stethoscope: 'medical_services',
  dumbbell: 'fitness_center', shirt: 'checkroom', scissors: 'content_cut', book: 'menu_book', baby: 'child_care',
  'paw-print': 'pets', gamepad: 'sports_esports', music: 'music_note', tv: 'tv', smartphone: 'smartphone',
  ticket: 'confirmation_number', camera: 'photo_camera', palette: 'palette', shield: 'shield', umbrella: 'beach_access',
  'heart-handshake': 'volunteer_activism', leaf: 'eco', scale: 'balance', handshake: 'handshake',
  'credit-score': 'credit_score', lunch: 'lunch_dining', breakfast: 'free_breakfast', cloud: 'cloud',
  'health-safety': 'health_and_safety', elderly: 'elderly', subscriptions: 'subscriptions', film: 'movie',
  play: 'smart_display', taxi: 'local_taxi', soup: 'soup_kitchen', milk: 'local_drink', cookie: 'cookie',
  stroller: 'stroller', shapes: 'category', diaper: 'baby_changing_station', lotion: 'sanitizer', soap: 'soap',
  cottage: 'cottage', pantry: 'kitchen', spray: 'cleaning_services', beverage: 'emoji_food_beverage',
  meat: 'kebab_dining', spa: 'spa', egg: 'egg', bread: 'bakery_dining', 'gift-card': 'card_giftcard',
  family: 'family_restroom',
}

/** What is drawn without an icon, or with one the dictionary does not know yet. */
export const GLIFO_NEUTRO = 'label'

export const glifoDe = (nombre: string | null | undefined) => (nombre && GLIFOS[nombre]) || GLIFO_NEUTRO
