import { useState } from 'react';

/** The gym's logo, or its initial if there is none or the image fails to load. */
export default function BrandMark({ brand, size = 32, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (brand?.logoUrl && !failed) {
    return <img src={brand.logoUrl} alt="" width={size} height={size} onError={() => setFailed(true)} className={`rounded-lg object-contain ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden="true" className={`inline-flex items-center justify-center rounded-lg bg-accent text-accent-ink font-extrabold ${className}`} style={{ width: size, height: size, fontSize: size * 0.5 }}>
      {(brand?.name || 'F').trim().charAt(0).toUpperCase()}
    </span>
  );
}
