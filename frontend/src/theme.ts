// btop "Default" theme palette
// source: https://github.com/aristocratos/btop/blob/main/themes/Default.theme
export const theme = {
  bg: '#1a1a1a',
  fg: '#cccccc',
  title: '#eeeeee',
  hi_fg: '#969696',
  selected_bg: '#7e2626',
  selected_fg: '#eeeeee',
  inactive_fg: '#404040',
  graph_text: '#606060',
  meter_bg: '#404040',
  proc_misc: '#0de756',
  // box borders
  cpu_box: '#3d7b46',
  mem_box: '#8a882e',
  net_box: '#423ba5',
  proc_box: '#923535',
  div_line: '#303030',
  // cpu gradient (bottom → top)
  cpu_start: '#50f095',
  cpu_mid: '#f2e266',
  cpu_end: '#fa1e1e',
  // temperature gradient
  temp_start: '#4897d4',
  temp_mid: '#5474e8',
  temp_end: '#ff40b6',
  // mem: free / cached / available / used gradients (start=dark, end=bright)
  free_start: '#223014',
  free_mid: '#b5e685',
  free_end: '#dcff85',
  cached_start: '#0b1a29',
  cached_mid: '#74e6fc',
  cached_end: '#26c5ff',
  available_start: '#292107',
  available_mid: '#ffd77a',
  available_end: '#ffb814',
  used_start: '#3b1f1c',
  used_mid: '#d9626d',
  used_end: '#ff4769',
  // net gradients
  download_start: '#231a63',
  download_mid: '#4f43a3',
  download_end: '#b0a9de',
  upload_start: '#510554',
  upload_mid: '#7d4180',
  upload_end: '#dcafde',
  // proc cpu column gradient (low→high)
  process_start: '#80d0a3',
  process_mid: '#dcd179',
  process_end: '#d45454',
};

export function gradAt(stops: [string, string, string], t: number): string {
  // t in [0,1]. Piecewise lerp through 3 stops.
  const clamped = Math.max(0, Math.min(1, t));
  const [a, b, c] = stops;
  const hex = (s: string) => [
    parseInt(s.slice(1, 3), 16),
    parseInt(s.slice(3, 5), 16),
    parseInt(s.slice(5, 7), 16),
  ];
  const lerp = (x: number[], y: number[], k: number) =>
    x.map((v, i) => Math.round(v + (y[i] - v) * k));
  const rgb = clamped < 0.5
    ? lerp(hex(a), hex(b), clamped * 2)
    : lerp(hex(b), hex(c), (clamped - 0.5) * 2);
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}
