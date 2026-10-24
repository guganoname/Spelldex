/* Generiert von scripts/build-tokens.mjs aus tokens.json. Nicht von Hand ändern. */
export const color = {
  "brass": "#b08d57",
  "brass-light": "#dcc08a",
  "brass-dark": "#5e4626",
  "bronze": "#7a5a34",
  "leather": "#2a1a14",
  "leather-light": "#4a2f22",
  "obsidian": "#0d0b10",
  "obsidian-2": "#16121a",
  "obsidian-3": "#231c27",
  "parchment": "#e9dcc0",
  "parchment-dark": "#c8b088",
  "ink-gold": "#e8c983",
  "ink-dim": "#a8946f",
  "ink-sepia": "#3b2a19",
  "table": "#120e0c",
  "mana": {
    "W": "#f3ead2",
    "U": "#3d7fd1",
    "B": "#6b4f8a",
    "R": "#d4462f",
    "G": "#3e9a52",
    "M": "#d9b44a",
    "C": "#b9bec4"
  }
} as const;

export const semantic = {
  "screen-surface": "#0d0b10",
  "screen-raised": "#16121a",
  "screen-line": "#231c27",
  "screen-ink": "#e8c983",
  "rune-glow": "#e8c983",
  "panel-surface": "#e9dcc0",
  "panel-ink": "#3b2a19",
  "control-face": "#b08d57",
  "control-edge": "#5e4626",
  "control-shine": "#dcc08a",
  "accent-identity": "#d4462f",
  "danger": "#e0664f",
  "success": "#6cbf7d",
  "screen-ink-muted": "#a8946f"
} as const;

export const font = {
  "display": [
    "Cinzel",
    "Trajan Pro",
    "Georgia",
    "serif"
  ],
  "body": [
    "Crimson Pro",
    "Iowan Old Style",
    "Georgia",
    "serif"
  ],
  "ui": [
    "Inter",
    "system-ui",
    "-apple-system",
    "sans-serif"
  ]
} as const;

export const size = {
  "xs": "11px",
  "sm": "13px",
  "md": "15px",
  "lg": "17px",
  "xl": "21px",
  "2xl": "27px",
  "3xl": "34px"
} as const;

export const space = {
  "1": "4px",
  "2": "8px",
  "3": "12px",
  "4": "16px",
  "5": "20px",
  "6": "24px",
  "8": "32px",
  "10": "40px"
} as const;

export const radius = {
  "xs": "2px",
  "sm": "4px",
  "md": "8px",
  "lg": "14px",
  "xl": "22px",
  "pill": "999px",
  "screen": "14px"
} as const;

export const shadow = {
  "raised": "inset 1px 1px 0 rgba(255,236,190,.45), inset -1px -1px 0 rgba(40,24,8,.55), 2px 3px 5px rgba(0,0,0,.55), 0 1px 0 rgba(0,0,0,.6)",
  "pressed": "inset 2px 2px 4px rgba(20,12,4,.7), inset -1px -1px 0 rgba(255,236,190,.2), 0 0 0 rgba(0,0,0,0)",
  "inset-screen": "inset 3px 4px 10px rgba(0,0,0,.85), inset -1px -1px 0 rgba(255,236,190,.08)",
  "engrave": "-1px -1px 0 rgba(0,0,0,.55), 1px 1px 0 rgba(255,236,190,.35)"
} as const;

export const motion = {
  "spring": {
    "lid": {
      "type": "spring",
      "mass": 2,
      "stiffness": 260,
      "damping": 34
    },
    "key": {
      "type": "spring",
      "mass": 0.6,
      "stiffness": 700,
      "damping": 30
    },
    "card": {
      "type": "spring",
      "mass": 1,
      "stiffness": 260,
      "damping": 26
    },
    "gem": {
      "type": "spring",
      "mass": 0.8,
      "stiffness": 320,
      "damping": 18
    },
    "stamp": {
      "type": "spring",
      "mass": 1.4,
      "stiffness": 900,
      "damping": 50
    }
  },
  "duration": {
    "press": "100ms",
    "card": "400ms",
    "lid": "800ms"
  },
  "lid-detent": 0.4
} as const;

export const material = {
  "brass": {
    "color": "#b08d57",
    "metalness": 1,
    "roughness": 0.35
  },
  "bronze": {
    "color": "#7a5a34",
    "metalness": 1,
    "roughness": 0.5
  },
  "leather": {
    "color": "#2a1a14",
    "metalness": 0,
    "roughness": 0.7
  },
  "obsidian": {
    "color": "#0d0b10",
    "metalness": 0,
    "roughness": 0.08,
    "clearcoat": 1
  },
  "parchment": {
    "color": "#e9dcc0",
    "metalness": 0,
    "roughness": 0.9
  }
} as const;

export const gem = {
  "emissiveIntensity": {
    "rest": 0.15,
    "active": 1.2
  }
} as const;

export const sound = {
  "master": 0.8,
  "pitchJitter": 0.03,
  "gemPitch": {
    "W": 587.33,
    "U": 659.25,
    "B": 739.99,
    "R": 880,
    "G": 987.77,
    "M": 1174.66,
    "C": 523.25
  }
} as const;

export const tokens = { color, semantic, font, size, space, radius, shadow, motion, material, gem, sound } as const;

/** Federn für Motion ({type:'spring'}) und @react-spring/three (tension = stiffness, friction = damping). */
export const spring = motion.spring;

/** CSS-Näherung jeder Feder für transition-timing-function. */
export const springCss = {
  "lid": {
    "easing": "linear(0, 0.062, 0.199, 0.365, 0.528, 0.672, 0.789, 0.878, 0.942, 0.984, 1.01, 1.024, 1.028, 1.028, 1.025, 1.02, 1.016, 1.012, 1.008, 1.005, 1.003, 1.001, 1, 1, 0.999, 0.999, 0.999, 0.999, 0.999, 1, 1, 1, 1)",
    "durationMs": 1058
  },
  "key": {
    "easing": "linear(0, 0.04, 0.247, 0.374, 0.614, 0.715, 0.869, 0.923, 0.992, 1.011, 1.023, 1.031, 1.031, 1.025, 1.021, 1.013, 1.01, 1.007, 1.003, 1.001, 1, 0.999, 0.999, 0.999, 0.999, 0.999, 0.999, 1, 1, 1, 1, 1, 1)",
    "durationMs": 383
  },
  "card": {
    "easing": "linear(0, 0.033, 0.161, 0.27, 0.439, 0.544, 0.639, 0.758, 0.821, 0.872, 0.929, 0.957, 0.985, 0.997, 1.004, 1.011, 1.012, 1.013, 1.012, 1.011, 1.008, 1.007, 1.006, 1.004, 1.003, 1.002, 1.001, 1.001, 1, 1, 1, 1, 1)",
    "durationMs": 633
  },
  "gem": {
    "easing": "linear(0, 0.107, 0.336, 0.507, 0.745, 0.927, 1.044, 1.089, 1.115, 1.109, 1.084, 1.055, 1.036, 1.013, 0.997, 0.989, 0.987, 0.987, 0.989, 0.993, 0.996, 0.998, 1, 1.001, 1.002, 1.001, 1.001, 1.001, 1.001, 1, 1, 1, 1)",
    "durationMs": 742
  },
  "stamp": {
    "easing": "linear(0, 0.078, 0.244, 0.436, 0.616, 0.696, 0.828, 0.923, 0.985, 1.021, 1.038, 1.042, 1.039, 1.035, 1.028, 1.02, 1.013, 1.007, 1.003, 1.001, 0.999, 0.999, 0.998, 0.998, 0.999, 0.999, 0.999, 0.999, 1, 1, 1, 1, 1)",
    "durationMs": 500
  }
} as const;

export type ManaColor = keyof typeof color.mana;
export type SpringName = keyof typeof spring;
