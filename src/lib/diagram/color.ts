export function wavelengthToHex(wavelengthNm: number | undefined, fallback = "#5a6478"): string {
  if (wavelengthNm === undefined || Number.isNaN(wavelengthNm)) {
    return fallback;
  }

  const wavelength = Math.max(380, Math.min(780, wavelengthNm));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (wavelength < 440) {
    red = -(wavelength - 440) / (440 - 380);
    blue = 1;
  } else if (wavelength < 490) {
    green = (wavelength - 440) / (490 - 440);
    blue = 1;
  } else if (wavelength < 510) {
    green = 1;
    blue = -(wavelength - 510) / (510 - 490);
  } else if (wavelength < 580) {
    red = (wavelength - 510) / (580 - 510);
    green = 1;
  } else if (wavelength < 645) {
    red = 1;
    green = -(wavelength - 645) / (645 - 580);
  } else {
    red = 1;
  }

  let factor = 1;
  if (wavelength < 420) {
    factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
  } else if (wavelength > 700) {
    factor = 0.3 + 0.7 * (780 - wavelength) / (780 - 700);
  }

  const channel = (value: number): string => {
    const gamma = 0.8;
    const scaled = value <= 0 ? 0 : Math.round(255 * Math.pow(value * factor, gamma));
    return scaled.toString(16).padStart(2, "0");
  };

  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}
