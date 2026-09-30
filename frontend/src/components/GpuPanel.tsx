import type { GpuInfo } from '../types';
import Panel from './Panel';
import UsageBar from './UsageBar';
import { theme } from '../theme';
import { levelColor } from '../thresholds';

const GPU_GRADIENT: [string, string, string] = [theme.cpu_start, theme.cpu_mid, theme.cpu_end];
const FREQ: [string, string, string] = [theme.cached_start, theme.cached_mid, theme.cached_end];

// Engine classes as the kernel names them → what they do for a media server.
const ENGINE_LABEL: Record<string, string> = {
  video: 'Video',                 // Quick Sync decode/encode
  'video-enhance': 'VidEnh',      // scaling, tone mapping
  render: 'Render',               // 3D/compute (OpenCL tone mapping)
  copy: 'Copy',
};
const ENGINE_ORDER = ['video', 'video-enhance', 'render', 'copy'];

const note: React.CSSProperties = { fontSize: 11, lineHeight: '15px', color: theme.graph_text, marginTop: 4 };

function Transcodes({ gpu }: { gpu: GpuInfo }) {
  const { transcoders, transcodersOnGpu, engines, engineStats } = gpu;
  if (transcoders === 0) return <div style={note}>no transcodes running</div>;

  const sw = transcoders - transcodersOnGpu;
  const swLine =
    sw > 0 ? (
      <div
        style={{ ...note, color: levelColor('warn') }}
        title="These transcoder processes have no GPU device open: they encode on the CPU. In Plex, check Settings → Transcoder → Use hardware acceleration."
      >
        {sw} transcode{sw === 1 ? '' : 's'} on the CPU (software)
      </div>
    ) : null;

  if (transcodersOnGpu === 0) return swLine;
  if (!engineStats || !engines) {
    return (
      <>
        <div style={note} title="The kernel does not report per-process GPU engine time (needs Linux 5.19+ for Intel).">
          {transcodersOnGpu} transcode{transcodersOnGpu === 1 ? '' : 's'} on the GPU · engine load n/a
        </div>
        {swLine}
      </>
    );
  }
  const names = Object.keys(engines).sort(
    (a, b) => (ENGINE_ORDER.indexOf(a) + 1 || 99) - (ENGINE_ORDER.indexOf(b) + 1 || 99),
  );
  return (
    <>
      <div style={{ ...note, marginBottom: 2 }}>
        {transcodersOnGpu} transcode{transcodersOnGpu === 1 ? '' : 's'} on the GPU
      </div>
      {names.map(n => (
        <UsageBar key={n} label={ENGINE_LABEL[n] ?? n} value={engines[n]} gradient={GPU_GRADIENT} labelWidth={52} />
      ))}
      {swLine}
    </>
  );
}

export default function GpuPanel({ gpu }: { gpu: GpuInfo }) {
  const { freqMhz, maxMhz, awakePercent, busyPercent } = gpu;
  const asleep = freqMhz === 0;

  return (
    <Panel
      title="gpu"
      className="panel-gpu"
      borderColor={theme.gpu_box}
      extra={`${gpu.driver} ${gpu.card}`}
      bottomRight={
        gpu.transcoders > 0 ? (
          <span style={{ color: theme.graph_text }}>
            {gpu.transcoders} transcode{gpu.transcoders === 1 ? '' : 's'}
          </span>
        ) : undefined
      }
    >
      {freqMhz !== null && (
        <UsageBar
          label="Clock"
          value={maxMhz ? (freqMhz / maxMhz) * 100 : 0}
          gradient={FREQ}
          display={asleep ? 'asleep' : `${freqMhz}`}
          valueWidth={44}
          total={maxMhz ? `/ ${maxMhz} MHz` : 'MHz'}
          labelWidth={52}
        />
      )}
      {awakePercent !== null && (
        <div title="Share of time the GPU was out of its RC6 sleep state: a rough measure of how busy it is.">
          <UsageBar label="Awake" value={awakePercent} gradient={GPU_GRADIENT} labelWidth={52} valueWidth={44} />
        </div>
      )}
      {busyPercent !== null && <UsageBar label="Busy" value={busyPercent} gradient={GPU_GRADIENT} labelWidth={52} valueWidth={44} />}
      <Transcodes gpu={gpu} />
    </Panel>
  );
}
