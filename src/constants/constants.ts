enum CurrencySymbolPlace {
    BEFORE,
    AFTER,
}

export const CURRENCY = {
    USD: {
        name: 'USD',
        symbol: '$',
        symbolPlace: CurrencySymbolPlace.BEFORE,
        emoji: '🇺🇸'
    },
    EUR: {
        name: 'EUR',
        symbol: '€',
        symbolPlace: CurrencySymbolPlace.BEFORE,
        emoji: '🇪🇺'
    },
    RUB: {
        name: 'RUB',
        symbol: '₽',
        symbolPlace: CurrencySymbolPlace.AFTER,
        emoji: '🇷🇺'
    },
    RSD: {
        name: 'RSD',
        symbol: 'din',
        symbolPlace: CurrencySymbolPlace.AFTER,
        emoji: '🇷🇸',
    },
    KGS: {
        name: 'KGS',
        symbol: 'с',
        symbolPlace: CurrencySymbolPlace.AFTER,
        emoji: '🇰🇬',
    }
}

export const NO_CATEGORY_ID = 0;
export const NO_CATEGORY_NAME = '🚫 Без категории';
