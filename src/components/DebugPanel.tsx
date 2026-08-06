
import { ExtensionStats, FSMState } from '../types';
import { Terminal } from 'lucide-react';

interface DebugPanelProps {
  fsmState: FSMState;
  stats: ExtensionStats;
}

export default function DebugPanel({ fsmState, stats }: DebugPanelProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1">
        <Terminal className="w-3 h-3" />
        Developer Panel
      </div>
      
      <div className="bg-black/50 border border-border rounded-md p-2 font-mono text-[10px] leading-relaxed text-green-400 overflow-x-auto">
        <div><span className="text-white">State:</span> {fsmState}</div>
        <div><span className="text-white">Avg Inf Time:</span> {stats.averageInferenceTimeMs.toFixed(1)}ms</div>
        <div><span className="text-white">Retries:</span> {stats.totalRetries}</div>
        <div><span className="text-white">Unknowns:</span> {stats.totalUnknown}</div>
        <div><span className="text-white">Session Conns:</span> {stats.totalConnections}</div>
      </div>
    </div>
  );
}
