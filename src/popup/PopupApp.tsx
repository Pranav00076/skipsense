import { useEffect, useState } from 'react';
import { ExtensionSettings, ExtensionStats, FSMState } from '../types';
import { StorageService } from '../storage/StorageService';
import { MessageBus } from '../core/MessageBus';
import { Activity, Pause, Play, Settings, Shield, ShieldOff, Zap } from 'lucide-react';
import DebugPanel from '../components/DebugPanel';

export default function PopupApp() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [stats, setStats] = useState<ExtensionStats | null>(null);
  const [fsmState, setFsmState] = useState<FSMState>('WaitingForConnection');

  useEffect(() => {
    // 1. Initial Storage Load
    StorageService.getSettings().then(setSettings);
    StorageService.getStats().then(setStats);

    // 2. Query Active Content Script for real-time FSM state
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_FSM_STATE' }, (resp) => {
            if (resp?.state) {
              setFsmState(resp.state);
            }
            if (resp?.settings) {
              setSettings(resp.settings);
            }
          });
        }
      });
    }

    // 3. Listeners
    MessageBus.on('SETTINGS_UPDATED', (msg) => {
      if (msg?.payload?.settings) setSettings(msg.payload.settings);
    });
    MessageBus.on('STATS_UPDATED', (msg) => {
      if (msg?.payload?.stats) setStats(msg.payload.stats);
    });
    MessageBus.on('FSM_STATE_CHANGE', (msg) => {
      if (msg?.payload?.to) setFsmState(msg.payload.to);
    });
  }, []);

  if (!settings || !stats) {
    return <div className="p-4 text-center">Loading SkipSense...</div>;
  }

  const toggleEnabled = async () => {
    const updated = await StorageService.saveSettings({ enabled: !settings.enabled });
    setSettings(updated);
    
    MessageBus.send({
      type: 'SETTINGS_UPDATED',
      payload: { settings: updated }
    });
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="w-[320px] p-4 flex flex-col gap-4 font-sans bg-background text-foreground">
      {/* Header */}
      <div className="flex justify-between items-center pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          {settings.enabled ? <Shield className="w-5 h-5 text-green-500" /> : <ShieldOff className="w-5 h-5 text-red-500" />}
          <h1 className="text-lg font-bold tracking-tight">SkipSense</h1>
        </div>
        <button onClick={openOptions} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <Settings className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Status Card */}
      <div className="glass p-4 rounded-lg flex flex-col gap-2 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary/20">
          {['CapturingFrame', 'DetectingFace', 'RunningInference', 'MakingDecision'].includes(fsmState) && (
            <div className="h-full bg-primary animate-pulse w-full"></div>
          )}
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-muted-foreground">Extension Status</span>
          <button 
            onClick={toggleEnabled}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              settings.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}
          >
            {settings.enabled ? <><Play className="w-3 h-3"/> Active</> : <><Pause className="w-3 h-3"/> Paused</>}
          </button>
        </div>
        
        <div className="mt-1">
          <div className="text-xs text-muted-foreground mb-1">Current State</div>
          <div className="font-mono text-sm bg-muted/50 p-2 rounded truncate">
            {fsmState}
          </div>
        </div>
      </div>

      {/* Target Setting Quick Toggle */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground">Target Presentation</span>
        <div className="flex gap-2 bg-muted p-1 rounded-lg">
          {(['MALE', 'FEMALE', 'ANY'] as const).map(target => (
            <button
              key={target}
              onClick={() => {
                 StorageService.saveSettings({ targetPresentation: target }).then(s => {
                    setSettings(s);
                    MessageBus.send({ type: 'SETTINGS_UPDATED', payload: { settings: s }});
                 });
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                settings.targetPresentation === target 
                  ? 'bg-background shadow text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {target}
            </button>
          ))}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-3 mt-2">
        <div className="glass p-3 rounded-lg flex flex-col">
          <span className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Skipped
          </span>
          <span className="text-xl font-bold text-foreground">{stats.totalSkipped}</span>
        </div>
        <div className="glass p-3 rounded-lg flex flex-col">
          <span className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Activity className="w-3 h-3" /> Avg Conf
          </span>
          <span className="text-xl font-bold text-foreground">
            {stats.averageConfidence > 0 ? `${(stats.averageConfidence * 100).toFixed(1)}%` : '---'}
          </span>
        </div>
      </div>

      {/* Debug Panel Toggle */}
      {settings.debugMode && (
         <div className="mt-4 border-t border-border pt-4">
            <DebugPanel fsmState={fsmState} stats={stats} />
         </div>
      )}
    </div>
  );
}
