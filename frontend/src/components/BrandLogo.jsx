import BrandMark from './BrandMark';
import Logo from './Logo';
import { useBrand } from '../context/BrandContext';

/**
 * The identity at the top of the menu and the login screens. A gym that has set its own name or logo sees those;
 * everyone else sees FitzyClub exactly as designed (with the gym's own tagline under it, if it set one).
 * `onDark` is for the menu, which is dark in both themes.
 */
export default function BrandLogo({ size = 40, tagline = false, onDark = false, className = '', brand: given }) {
  const ctx = useBrand().brand;
  const brand = given === undefined ? ctx : given; // `given` lets the Branding page preview unsaved changes
  if (!brand?.customBrand) return <Logo size={size} tagline={tagline || !!brand?.tagline} taglineText={brand?.tagline || ''} onDark={onDark} className={className} />;
  return (
    <span className={`inline-flex min-w-0 items-center gap-3 ${className}`}>
      <BrandMark brand={brand} size={size} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={`truncate font-extrabold tracking-tight ${onDark ? 'text-white' : 'text-gray-900 dark:text-white'}`} style={{ fontSize: size * 0.5 }}>{brand.name}</span>
        {tagline && brand.tagline && (
          <span className={`truncate italic ${onDark ? 'text-gray-300' : 'text-gray-500 dark:text-gray-300'}`} style={{ fontSize: Math.max(10, size * 0.27) }}>{brand.tagline}</span>
        )}
      </span>
    </span>
  );
}
