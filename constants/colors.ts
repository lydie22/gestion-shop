/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const brandRed = '#D92D20';

const colors = {
  light: {
    text: '#252323',
    tint: brandRed,
    background: '#FAF8F8',
    foreground: '#252323',
    card: '#FFFFFF',
    cardForeground: '#252323',
    primary: brandRed,
    primaryForeground: '#FFFFFF',
    secondary: '#FDE8E6',
    secondaryForeground: brandRed,
    muted: '#F2EEEE',
    mutedForeground: '#786F70',
    accent: '#FEECEC',
    accentForeground: brandRed,
    destructive: brandRed,
    destructiveForeground: '#FFFFFF',
    border: '#E9DEDF',
    input: '#DED2D3',
    success: '#16804A',
    warning: '#A96512',
    warningSurface: '#FFF2DD',
    dangerSurface: '#FDE8E6',
    infoSurface: '#FEECEC',
    inkSoft: '#5F5657',
    hero: brandRed,
    heroMuted: '#F9D4D4',
    heroBalance: '#FECACA',
  },

  radius: 18,
};

export default colors;
