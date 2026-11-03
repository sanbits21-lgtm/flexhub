import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import QRCode from 'qrcode/lib/core/qrcode';

// A QR is always black on white (white quiet zone included) so any phone camera or UPI
// app can read it, whatever the app theme is.
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const { n, d } = useMemo(() => {
    const m = QRCode.create(value, { errorCorrectionLevel: 'M' }).modules;
    let path = '';
    for (let r = 0; r < m.size; r += 1) {
      for (let c = 0; c < m.size; c += 1) if (m.get(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
    return { n: m.size, d: path };
  }, [value]);
  const quiet = 4;
  return (
    <View style={{ width: size, height: size, borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${n + quiet * 2} ${n + quiet * 2}`}>
        <Rect width={n + quiet * 2} height={n + quiet * 2} fill="#fff" />
        <Path d={d} transform={`translate(${quiet} ${quiet})`} fill="#000" />
      </Svg>
    </View>
  );
}
