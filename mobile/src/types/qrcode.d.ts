// The QR encoder from `qrcode`, imported from its core (no Node canvas / Buffer code paths).
declare module 'qrcode/lib/core/qrcode' {
  const QRCode: {
    create(text: string, options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): {
      modules: { size: number; get(row: number, col: number): number };
    };
  };
  export default QRCode;
}
