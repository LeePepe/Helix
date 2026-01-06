import { NormalizerConfig, ExtractedValue } from '../../configs/dimensionConfigs';

/**
 * 颜色规范化器
 * 将不同格式的颜色统一为目标格式（hex, rgb, hsl）
 */
export class ColorNormalizer {
	constructor(private config: NormalizerConfig) {}

	/**
	 * 规范化值
	 */
	normalize(values: Map<string, ExtractedValue>): Map<string, ExtractedValue> {
		const normalized = new Map<string, ExtractedValue>();
		const targetFormat = this.config.targetFormat || 'hex';

		for (const [key, extractedValue] of values.entries()) {
			const normalizedValue = this.normalizeColor(extractedValue.value, targetFormat);

			normalized.set(key, {
				...extractedValue,
				value: normalizedValue
			});
		}

		return normalized;
	}

	/**
	 * 规范化单个颜色
	 */
	private normalizeColor(color: any, targetFormat: string): any {
		if (typeof color !== 'string') {
			return color;
		}

		const rgb = this.parseColor(color);
		if (!rgb) {
			return color;
		}

		switch (targetFormat) {
			case 'hex':
				return this.rgbToHex(rgb.r, rgb.g, rgb.b);
			case 'rgb':
				return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
			case 'hsl':
				const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
				return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
			default:
				return color;
		}
	}

	/**
	 * 解析颜色为 RGB
	 */
	private parseColor(color: string): { r: number; g: number; b: number } | null {
		color = color.trim();

		// Hex
		if (color.startsWith('#')) {
			return this.parseHex(color);
		}

		// RGB/RGBA
		if (color.startsWith('rgb')) {
			return this.parseRGB(color);
		}

		// HSL/HSLA
		if (color.startsWith('hsl')) {
			return this.parseHSL(color);
		}

		// Named colors (简单映射)
		const namedColors: Record<string, string> = {
			'white': '#FFFFFF',
			'black': '#000000',
			'red': '#FF0000',
			'green': '#00FF00',
			'blue': '#0000FF'
		};

		if (color.toLowerCase() in namedColors) {
			return this.parseHex(namedColors[color.toLowerCase()]);
		}

		return null;
	}

	/**
	 * 解析 Hex 颜色
	 */
	private parseHex(hex: string): { r: number; g: number; b: number } {
		hex = hex.replace('#', '');

		if (hex.length === 3) {
			hex = hex.split('').map(c => c + c).join('');
		}

		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);

		return { r, g, b };
	}

	/**
	 * 解析 RGB/RGBA 颜色
	 */
	private parseRGB(rgb: string): { r: number; g: number; b: number } | null {
		const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

		if (!match) {
			return null;
		}

		return {
			r: parseInt(match[1]),
			g: parseInt(match[2]),
			b: parseInt(match[3])
		};
	}

	/**
	 * 解析 HSL/HSLA 颜色
	 */
	private parseHSL(hsl: string): { r: number; g: number; b: number } | null {
		const match = hsl.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%/);

		if (!match) {
			return null;
		}

		const h = parseInt(match[1]) / 360;
		const s = parseInt(match[2]) / 100;
		const l = parseInt(match[3]) / 100;

		return this.hslToRgb(h, s, l);
	}

	/**
	 * RGB 转 Hex
	 */
	private rgbToHex(r: number, g: number, b: number): string {
		const toHex = (n: number) => {
			const hex = Math.round(n).toString(16).padStart(2, '0');
			return hex;
		};

		return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
	}

	/**
	 * RGB 转 HSL
	 */
	private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
		r /= 255;
		g /= 255;
		b /= 255;

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		let h = 0, s = 0, l = (max + min) / 2;

		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

			switch (max) {
				case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
				case g: h = ((b - r) / d + 2) / 6; break;
				case b: h = ((r - g) / d + 4) / 6; break;
			}
		}

		return {
			h: Math.round(h * 360),
			s: Math.round(s * 100),
			l: Math.round(l * 100)
		};
	}

	/**
	 * HSL 转 RGB
	 */
	private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
		let r, g, b;

		if (s === 0) {
			r = g = b = l;
		} else {
			const hue2rgb = (p: number, q: number, t: number) => {
				if (t < 0) t += 1;
				if (t > 1) t -= 1;
				if (t < 1 / 6) return p + (q - p) * 6 * t;
				if (t < 1 / 2) return q;
				if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
				return p;
			};

			const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			const p = 2 * l - q;

			r = hue2rgb(p, q, h + 1 / 3);
			g = hue2rgb(p, q, h);
			b = hue2rgb(p, q, h - 1 / 3);
		}

		return {
			r: Math.round(r * 255),
			g: Math.round(g * 255),
			b: Math.round(b * 255)
		};
	}
}
