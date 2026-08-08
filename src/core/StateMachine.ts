import { FSMState } from '../types';
import { MessageBus } from './MessageBus';

type StateChangeListener = (from: FSMState, to: FSMState, reason?: string) => void;

/**
 * Finite State Machine representing the exact lifecycle of the SkipSense extension.
 */
export class StateMachine {
  private currentState: FSMState = 'Initializing';
  private listeners: Set<StateChangeListener> = new Set();
  
  // Defines valid standard transitions.
  private readonly transitions: Record<FSMState, FSMState[]> = {
    'Initializing': ['Idle', 'WaitingForConnection', 'WaitingDelay', 'Error'],
    'Idle': ['WaitingForConnection', 'WaitingDelay', 'CapturingFrame', 'Paused', 'Error'],
    'WaitingForConnection': ['WaitingDelay', 'CapturingFrame', 'Paused', 'Error'],
    'WaitingDelay': ['CapturingFrame', 'WaitingForConnection', 'Idle', 'Paused', 'Error'],
    'CapturingFrame': ['DetectingFace', 'WaitingForConnection', 'Idle', 'Paused', 'Error'],
    'DetectingFace': ['RunningInference', 'MakingDecision', 'WaitingForConnection', 'Idle', 'Paused', 'Error'],
    'RunningInference': ['MakingDecision', 'WaitingForConnection', 'Idle', 'Paused', 'Error'],
    'MakingDecision': ['Skipping', 'WaitingForConnection', 'WaitingDelay', 'Idle', 'Paused', 'Error'],
    'Skipping': ['WaitingNextConnection', 'WaitingForConnection', 'Idle', 'Paused', 'Error'],
    'WaitingNextConnection': ['WaitingForConnection', 'WaitingDelay', 'CapturingFrame', 'Idle', 'Paused', 'Error'],
    'Paused': ['Idle', 'WaitingForConnection', 'Error'],
    'Error': ['Initializing', 'Idle', 'WaitingForConnection', 'WaitingDelay']
  };

  constructor(initialState: FSMState = 'Initializing') {
    this.currentState = initialState;
  }

  public getState(): FSMState {
    return this.currentState;
  }

  /**
   * Attempt to transition to a new state.
   */
  public transition(to: FSMState, reason?: string): boolean {
    const allowed = this.transitions[this.currentState];
    
    // Global safe escape hatches: we can transition to Paused, Error, or WaitingForConnection from any active state
    const isGlobalTransition = 
      (to === 'Paused' && this.currentState !== 'Paused') || 
      (to === 'Error' && this.currentState !== 'Error') ||
      (to === 'WaitingForConnection' && this.currentState !== 'WaitingForConnection');

    if (!allowed?.includes(to) && !isGlobalTransition) {
      console.error(`[SkipSense FSM] Invalid transition from ${this.currentState} to ${to}`);
      return false;
    }

    const from = this.currentState;
    this.currentState = to;

    // Notify local listeners
    this.listeners.forEach(listener => listener(from, to, reason));

    // Broadcast state change across contexts
    MessageBus.send({
      type: 'FSM_STATE_CHANGE',
      payload: { from, to, reason }
    });

    console.log(`[SkipSense FSM] Transition: ${from} -> ${to}${reason ? ` (${reason})` : ''}`);
    return true;
  }

  public subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public forceReset() {
    this.transition('Initializing', 'Forced Reset');
  }
}
