// Visible spectrum boundaries (nm)
const WL_MIN = 380;
const WL_MAX = 780;
const WL_VIOLET_END = 440;
const WL_BLUE_END = 490;
const WL_CYAN_END = 510;
const WL_YELLOW_END = 580;
const WL_ORANGE_END = 645;

// Intensity falloff near spectrum edges to avoid harsh cutoff
const WL_FADE_LOW_END = 420;
const WL_FADE_HIGH_START = 700;
const INTENSITY_MIN = 0.3;
const INTENSITY_RANGE = 0.7; // full intensity = INTENSITY_MIN + INTENSITY_RANGE

const GAMMA = 0.8;
const MAX_CHANNEL = 255;

export function wavelengthToHex(wavelengthNm: number | undefined, fallback = "#5a6478"): string {
  if (wavelengthNm === undefined || Number.isNaN(wavelengthNm)) {
    return fallback;
  }

  const wavelength = Math.max(WL_MIN, Math.min(WL_MAX, wavelengthNm));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (wavelength < WL_VIOLET_END) {
    red = -(wavelength - WL_VIOLET_END) / (WL_VIOLET_END - WL_MIN);
    blue = 1;
  } else if (wavelength < WL_BLUE_END) {
    green = (wavelength - WL_VIOLET_END) / (WL_BLUE_END - WL_VIOLET_END);
    blue = 1;
  } else if (wavelength < WL_CYAN_END) {
    green = 1;
    blue = -(wavelength - WL_CYAN_END) / (WL_CYAN_END - WL_BLUE_END);
  } else if (wavelength < WL_YELLOW_END) {
    red = (wavelength - WL_CYAN_END) / (WL_YELLOW_END - WL_CYAN_END);
    green = 1;
  } else if (wavelength < WL_ORANGE_END) {
    red = 1;
    green = -(wavelength - WL_ORANGE_END) / (WL_ORANGE_END - WL_YELLOW_END);
  } else {
    red = 1;
  }

  let factor = 1;
  if (wavelength < WL_FADE_LOW_END) {
    factor = INTENSITY_MIN + INTENSITY_RANGE * (wavelength - WL_MIN) / (WL_FADE_LOW_END - WL_MIN);
  } else if (wavelength > WL_FADE_HIGH_START) {
    factor = INTENSITY_MIN + INTENSITY_RANGE * (WL_MAX - wavelength) / (WL_MAX - WL_FADE_HIGH_START);
  }

  const channel = (value: number): string => {
    const scaled = value <= 0 ? 0 : Math.round(MAX_CHANNEL * Math.pow(value * factor, GAMMA));
    return scaled.toString(16).padStart(2, "0");
  };

  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}
