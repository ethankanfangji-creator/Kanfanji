/**
 * Shared async action state: loading / success / error + duplicate-submit + abort.
 */

export type AsyncPhase = "idle" | "loading" | "success" | "error";

export type AsyncActionState<TError = string> = {
  phase: AsyncPhase;
  error: TError | null;
  /** Monotonic token; bump to ignore stale responses. */
  generation: number;
};

export function initialAsyncState<TError = string>(): AsyncActionState<TError> {
  return { phase: "idle", error: null, generation: 0 };
}

export type RunAsyncOptions = {
  /** When true, a second start while loading is ignored. */
  blockDuplicate?: boolean;
};

/**
 * Pure helper for reducers / hooks: start → success/error with generation guard.
 */
export function beginAsync<TError>(
  state: AsyncActionState<TError>,
  options?: RunAsyncOptions,
): { next: AsyncActionState<TError>; started: boolean } {
  if (options?.blockDuplicate !== false && state.phase === "loading") {
    return { next: state, started: false };
  }
  return {
    next: {
      phase: "loading",
      error: null,
      generation: state.generation + 1,
    },
    started: true,
  };
}

export function succeedAsync<TError>(
  state: AsyncActionState<TError>,
  generation: number,
): AsyncActionState<TError> {
  if (generation !== state.generation) return state;
  return { ...state, phase: "success", error: null };
}

export function failAsync<TError>(
  state: AsyncActionState<TError>,
  generation: number,
  error: TError,
): AsyncActionState<TError> {
  if (generation !== state.generation) return state;
  return { ...state, phase: "error", error };
}

export function cancelAsyncGeneration(controller: AbortController | null): void {
  try {
    controller?.abort();
  } catch {
    // ignore
  }
}
