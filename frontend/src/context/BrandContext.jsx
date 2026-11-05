import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { applyAccent } from '../utils/brand';

const BrandContext = createContext({ brand: null, unknownGym: false, setBrand: () => {} });

// The gym whose address this is (acme.example.com), looked up before anyone signs in so the
// login page already looks like theirs. On the main address there is no gym: brand stays null.
// After sign-in the API sends the user's own gym brand, which covers the main address too.
export function BrandProvider({ children }) {
  const [brand, setBrandState] = useState(null);
  const [unknownGym, setUnknownGym] = useState(false);

  const setBrand = useCallback((b) => {
    setBrandState(b || null);
    applyAccent(b?.color, b?.color2, b?.gradientAngle);
    document.title = b?.name || 'FlexHub';
  }, []);

  useEffect(() => {
    axios.get('/api/public/tenant')
      .then((res) => { if (res.data) setBrand(res.data); })
      .catch((err) => { if (err.response?.status === 404) setUnknownGym(true); });
  }, [setBrand]);

  return <BrandContext.Provider value={{ brand, unknownGym, setBrand }}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);
