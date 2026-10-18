// Reference data: banks (with card colours and popular card names),
// gift-card brands and the passphrase word list.

// c1/c2 = card gradient, ink = text colour on the card.
export const BANKS = [
  { name: 'HDFC Bank', c1: '#0b2a6f', c2: '#1d4fb8', cards: ['Infinia', 'Diners Club Black', 'Regalia Gold', 'Regalia', 'Millennia', 'MoneyBack+', 'Swiggy', 'Tata Neu Infinity', 'Tata Neu Plus', 'IndianOil', 'Marriott Bonvoy', 'Pixel Play', 'Freedom', 'Shoppers Stop', 'Platinum Debit', 'Millennia Debit', 'EasyShop Debit'] },
  { name: 'ICICI Bank', c1: '#7a1f12', c2: '#d4570f', cards: ['Amazon Pay', 'Emeralde Private Metal', 'Emeralde', 'Sapphiro', 'Rubyx', 'Coral', 'Platinum Chip', 'HPCL Super Saver', 'MakeMyTrip', 'Times Black', 'Manchester United', 'Coral Debit', 'Sapphiro Debit', 'Expressions Debit'] },
  { name: 'State Bank of India (SBI)', c1: '#123b8c', c2: '#2a86d1', cards: ['SBI Card ELITE', 'SBI Card PRIME', 'SimplyCLICK', 'SimplySAVE', 'Cashback', 'BPCL Octane', 'IRCTC', 'Aurum', 'Miles Elite', 'Tata Card', 'Air India Signature', 'Classic Debit', 'Global Debit', 'Platinum Debit'] },
  { name: 'Axis Bank', c1: '#5d0f2b', c2: '#a8174b', cards: ['Magnus', 'Magnus Burgundy', 'Atlas', 'Reserve', 'Select', 'Privilege', 'ACE', 'Flipkart', 'Airtel', 'MY Zone', 'Neo', 'Horizon', 'Samsung Infinite', 'IndianOil', 'Burgundy Debit', 'Priority Debit', 'Online Rewards Debit'] },
  { name: 'Kotak Mahindra Bank', c1: '#8f0d16', c2: '#e2232e', cards: ['White Reserve', 'Zen Signature', 'League Platinum', 'Myntra', 'IndianOil', 'Mojo', 'Royale Signature', '811 Dream Different', 'Solitaire', 'Privy League Debit', '811 Debit'] },
  { name: 'American Express', c1: '#145f8f', c2: '#3aa0d6', cards: ['Platinum Card', 'Platinum Travel', 'Platinum Reserve', 'Membership Rewards', 'Gold Charge', 'SmartEarn'] },
  { name: 'IDFC First Bank', c1: '#7b1323', c2: '#b92c3f', cards: ['Wealth', 'Select', 'Classic', 'Millennia', 'Power+', 'Mayura', 'Ashva', 'Club Vistara', 'WOW', 'First SWYP', 'Visa Signature Debit'] },
  { name: 'IndusInd Bank', c1: '#3b1f14', c2: '#8a4b2c', cards: ['Pinnacle', 'Legend', 'Pioneer Heritage', 'Celesta', 'Iconia', 'Tiger', 'EazyDiner', 'Platinum Aura Edge', 'Nexxt', 'Pioneer Debit'] },
  { name: 'YES Bank', c1: '#0b3c78', c2: '#1f6fc4', cards: ['Marquee', 'Reserv', 'Elite+', 'Select', 'Prosperity', 'ACE', 'Wellness', 'Kiwi'] },
  { name: 'AU Small Finance Bank', c1: '#3c1361', c2: '#7b2fbf', cards: ['Zenith+', 'Zenith', 'Vetta', 'Altura Plus', 'Altura', 'LIT', 'SwipeUp', 'Ixigo'] },
  { name: 'HSBC', c1: '#3a3a3a', c2: '#a7141e', cards: ['Premier', 'TravelOne', 'Live+', 'Visa Platinum', 'RuPay Cashback'] },
  { name: 'Standard Chartered Bank', c1: '#00426b', c2: '#0a8f4f', cards: ['Ultimate', 'Smart', 'EaseMyTrip', 'Rewards', 'Super Value Titanium'] },
  { name: 'RBL Bank', c1: '#0a2540', c2: '#1d5c8f', cards: ['World Safari', 'Icon', 'ShopRite', 'Platinum Maxima', 'IndianOil Xtra', 'Zomato Edition', 'Bajaj Finserv'] },
  { name: 'Bank of Baroda', c1: '#a8410b', c2: '#f0761d', cards: ['Eterna', 'Premier', 'Select', 'Easy', 'Snapdeal', 'IRCTC'] },
  { name: 'Punjab National Bank', c1: '#6b0f2a', c2: '#c8a034', cards: ['RuPay Select', 'Platinum', 'Wave & Pay'] },
  { name: 'Canara Bank', c1: '#00578a', c2: '#f2b705', cards: ['RuPay Select', 'Visa Platinum', 'Classic Debit'] },
  { name: 'Union Bank of India', c1: '#0d3b78', c2: '#e2232e', cards: ['RuPay Select', 'Visa Signature', 'Classic Debit'] },
  { name: 'Bank of India', c1: '#0c3c78', c2: '#f29b1d', cards: ['RuPay Select', 'Platinum Debit'] },
  { name: 'Indian Bank', c1: '#0d4d8c', c2: '#f2a51d', cards: ['RuPay Select', 'Platinum Debit'] },
  { name: 'Federal Bank', c1: '#1c3f94', c2: '#f2a900', cards: ['Celesta', 'Imperio', 'Signet', 'Scapia', 'OneCard'] },
  { name: 'Citibank', c1: '#00366e', c2: '#0b7fd1', cards: ['Prestige', 'PremierMiles', 'Rewards', 'Cashback'] },
  { name: 'DBS Bank', c1: '#3a0d0d', c2: '#e2232e', cards: ['Vantage', 'Spark', 'digibank Debit'] },
  { name: 'OneCard', c1: '#141414', c2: '#4a4a4a', cards: ['OneCard Metal'] },
  { name: 'Scapia', c1: '#1b2a4a', c2: '#ff6b4a', cards: ['Scapia Federal'] },
  { name: 'Jupiter', c1: '#1a1446', c2: '#ef6a3a', cards: ['Edge CSB RuPay', 'Debit'] },
  { name: 'Fi Money', c1: '#00352b', c2: '#00b899', cards: ['Debit'] },
  { name: 'Slice', c1: '#2d0b5a', c2: '#8b3dff', cards: ['Slice'] },
  { name: 'Paytm Payments Bank', c1: '#00266b', c2: '#00baf2', cards: ['Debit'] },
  { name: 'Airtel Payments Bank', c1: '#7a0a0a', c2: '#e40000', cards: ['Debit'] },
  { name: 'Bandhan Bank', c1: '#7a0f18', c2: '#ea5a2a', cards: ['Debit'] },
  { name: 'Central Bank of India', c1: '#132e6b', c2: '#d9312b', cards: ['Debit'] },
  { name: 'Indian Overseas Bank', c1: '#0d3478', c2: '#2e7fd1', cards: ['Debit'] },
  { name: 'UCO Bank', c1: '#0c2e6b', c2: '#3e6fc4', cards: ['Debit'] },
  { name: 'Bank of Maharashtra', c1: '#0d4c8c', c2: '#e3a21a', cards: ['Debit'] },
  { name: 'IDBI Bank', c1: '#00513d', c2: '#f28c1d', cards: ['Winnings', 'Euphoria', 'Debit'] },
  { name: 'South Indian Bank', c1: '#7b0f1d', c2: '#c8323f', cards: ['SIB Debit'] },
  { name: 'Karnataka Bank', c1: '#7a1b0b', c2: '#d4882a', cards: ['Debit'] },
  { name: 'Karur Vysya Bank', c1: '#0e4d29', c2: '#2a9a54', cards: ['Debit'] },
  { name: 'City Union Bank', c1: '#7a0a3f', c2: '#c8327a', cards: ['Debit'] },
  { name: 'Equitas Small Finance Bank', c1: '#00456b', c2: '#f28c1d', cards: ['Debit'] },
  { name: 'Ujjivan Small Finance Bank', c1: '#3b1f6b', c2: '#7e4fc4', cards: ['Debit'] },
  { name: 'India Post Payments Bank', c1: '#7a0a0a', c2: '#d42a2a', cards: ['Debit'] },
];

// Fallback palette for banks not in the list: pick by hash of the name.
const FALLBACK = [
  ['#1f2a44', '#3c5a8a'], ['#2d3a2e', '#567d4f'], ['#3b2a44', '#7a5aa0'],
  ['#44322a', '#9a6a4f'], ['#20383d', '#3f8790'], ['#3d2030', '#8c4a6a'],
];

export function bankInfo(name) {
  const n = String(name || '').trim().toLowerCase();
  const hit = BANKS.find((b) => b.name.toLowerCase() === n)
    || (n.length >= 3 && BANKS.find((b) => b.name.toLowerCase().startsWith(n)));
  if (hit) return hit;
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [c1, c2] = FALLBACK[h % FALLBACK.length];
  return { name, c1, c2, cards: [] };
}

export const GIFT_BRANDS = [
  'Amazon', 'Flipkart', 'Myntra', 'Swiggy', 'Zomato', 'Blinkit', 'Zepto', 'BigBasket', 'Uber', 'Ola',
  'BookMyShow', 'PVR INOX', 'MakeMyTrip', 'Goibibo', 'Cleartrip', 'Yatra', 'Taj Hotels', 'Marriott',
  'Croma', 'Reliance Digital', 'Tata CLiQ', 'Ajio', 'Nykaa', 'Lakmé Salon', 'Decathlon', 'Shoppers Stop',
  'Lifestyle', 'Pantaloons', 'Westside', 'H&M', 'Zara', 'Levi\'s', 'Puma', 'Adidas', 'Nike', 'Bata',
  'Titan', 'Tanishq', 'Kalyan Jewellers', 'CaratLane', 'Apple', 'Samsung', 'Starbucks', 'Café Coffee Day',
  'Domino\'s', 'Pizza Hut', 'McDonald\'s', 'KFC', 'EazyDiner', 'Apollo Pharmacy', 'Tata 1mg', 'PharmEasy',
  'Cult.fit', 'Thyrocare', 'Disney+ Hotstar', 'Amazon Prime', 'Netflix', 'SonyLIV', 'Zee5', 'Spotify',
  'Google Play', 'Apple iTunes', 'Steam', 'IKEA', 'Pepperfry', 'Urban Company', 'Jockey', 'FirstCry',
];

export const WORDS = (
  'acorn amber anchor apple arrow aspen atlas autumn badge bamboo banjo barley basil beacon berry birch ' +
  'bison blaze bloom blossom bonsai breeze brick brook bubble cabin cactus camel canal candle canyon cargo ' +
  'cedar cello chalk charm cherry cider cinder citrus clover cobalt comet coral cotton cove crane crater ' +
  'cricket crystal cumin cypress dahlia daisy delta denim desert dew dingo dolphin dune eagle ember emerald ' +
  'falcon fable fennel fern fiddle fig fjord flame flint forest fossil fox galaxy garnet geyser ginger glacier ' +
  'globe gorge granite grape grove guava harbor hazel heron hibiscus hill honey horizon iris island ivory ' +
  'jade jasmine jetty juniper kayak kernel kettle kiwi koala lagoon lantern lark lava lemon lilac lily lime ' +
  'linen lotus lunar lynx magnet mango maple marble meadow melon mesa meteor mint mirror monsoon moss nectar ' +
  'nebula nickel nutmeg oasis ocean olive onyx opal orbit orchid otter owl paddle palm panda papaya parrot ' +
  'pebble pepper petal pine planet plum polar pollen poppy prism puffin quartz quill quince rabbit radish ' +
  'rain raven reef ridge river robin rocket rose ruby saffron sage sail salmon sapphire satin sequoia shell ' +
  'sierra silver sky slate snow sparrow spice spruce squash star stone storm summit sun swan tamarind tango ' +
  'teal thistle thunder tiger timber topaz tulip tundra turtle twig umber valley velvet violet volcano walnut ' +
  'water wave willow wind wren yak yarrow zebra zenith zephyr zinc almond aloe beetle cashew clay dove ' +
  'falls frost gale gecko heath hollow ink jaguar kelp kite lichen lupin mallow marsh mica nimbus nova ' +
  'oak panther pearl quail sand shore pecan tidal'
).split(' ');
