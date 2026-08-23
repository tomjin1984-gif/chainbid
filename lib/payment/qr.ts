import QRCode from "qrcode";

export async function createQrDataUrl(payload: string) {
  return QRCode.toDataURL(payload, {
    margin: 1,
    scale: 6,
    color: {
      dark: "#07100d",
      light: "#f7fff9",
    },
  });
}
