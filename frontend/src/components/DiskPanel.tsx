import type { DiskInfo } from '../types';
import Panel from './Panel';

function fmtSpeed(bps: number) {
  if (bps >= 1073741824) return (bps / 1073741824).toFixed(2) + ' GB/s';
  if (bps >= 1048576) return (bps / 1048576).toFixed(2) + ' MB/s';
  if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KB/s';
  return bps.toFixed(0) + ' B/s';
}

interface Props {
  disk: DiskInfo[];
}

export default function DiskPanel({ disk }: Props) {
  return (
    <Panel num="⁵" title="disk" borderColor="#fa5">
      {disk.length === 0 && <div className="text-[#444] text-[10px]">no devices</div>}
      {disk.map(d => (
        <div key={d.device} className="mb-3 last:mb-0">
          <div className="text-[10px] text-[#fa5] mb-1">{d.device}</div>
          <div className="flex gap-4 text-[10px]">
            <span className="text-[#555]">
              R: <span className="text-[#aaa]">{fmtSpeed(d.readBytesPerSec)}</span>
            </span>
            <span className="text-[#555]">
              W: <span className="text-[#aaa]">{fmtSpeed(d.writeBytesPerSec)}</span>
            </span>
          </div>
        </div>
      ))}
    </Panel>
  );
}
