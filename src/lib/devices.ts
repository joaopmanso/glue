/* Each device has a colour, the same in the Device column and the sidebar's Devices (ADR 0042). */
import { LIST_COLORS } from '../store/types';

export function deviceColor(name: string): string {
  let h = 7;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return LIST_COLORS[h % LIST_COLORS.length];
}
