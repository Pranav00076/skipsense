import { FSMState } from '../types';
import { MessageBus } from './MessageBus';

type StateChangeListener = (from: FSMState, to: FSMState, reason?: string) => void;

/**
 * Finite State Machine representing the exact lifecycle of the SkipSense extension.
 * Ensures no boolean flags are used and transitions are explicit.
 */
export class StateMachine {
  private currentState: FSMState = 'Initializing';
  private listeners: Set<StateChangeListener> = new Set();
  
  // Defines valid transitions. Key is current state, value is array of allowed next states.
  private readonly transitions: Record<FSMState, FSMState[]> = {
    'Initializing': ['Idle', 'Error'],
    'Idle': ['WaitingForConnection', 'Paused', 'Error'],
    'WaitingForConnection': ['WaitingDelay', 'Paused', 'Error'],
    'WaitingDelay': ['CapturingFrame', 'Paused', 'Error'],
    'CapturingFrame': ['DetectingFace', 'Paused', 'Error'],
    'DetectingFace': ['RunningInference', 'MakingDecision', 'Paused', 'Error'],
    'RunningInference': ['MakingDecision', 'Paused', 'Error'],
    'MakingDecision': ['Skipping', 'WaitingForConnection', 'WaitingDelay', 'Paused', 'Error'],
    'Skipping': ['WaitingNextConnection', 'Paused', 'Error'],
    'WaitingNextConnection': ['WaitingForConnection', 'Paused', 'Error'],
    'Paused': ['Idle', 'Error'],
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
   * Throws an error if the transition is invalid according to the state machine definition.
   */
  public transition(to: FSMState, reason?: string): boolean {
    const allowed = this.transitions[this.currentState];
    
    // Explicit escape hatches: we can transition to Paused or Error from ANY state (except themselves).
    const isGlobalTransition = (to === 'Paused' && this.currentState !== 'Paused') || (to === 'Error' && this.currentState !== 'Error');

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
