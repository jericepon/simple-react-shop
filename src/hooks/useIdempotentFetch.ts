import { useState, useMemo, useCallback, useRef } from 'react';

// --- Type Definitions ---
export type IdempotentUiState = keyof typeof idempotentUiStates;
export type ValidationError = Error & { errorMessages: string[] };
export type ValueOrError<T> = T | Error | ValidationError;
export type PromiseOfValueOrError<T> = Promise<T | Error | ValidationError>;
export type IdempotentValue<T> = PromiseOfValueOrError<T> | ValueOrError<T> | undefined;

export type IdempotentFetchOptions<T, Args extends unknown[] = []> = {
  /* The unique name for this idempotent fetch operation. */
  name: string;
  /**
   * The initial value for the idempotent fetch operation, including whether it has been initialized.
   * @default undefined
   * This allows the hook to start with a predefined value and initialization state.
   * @example
   * initialValue: { isInitialized: true, value: someValue }
   */
  initialValue?: { isInitialized: boolean; value: T };
  /**
   * An optional function to fetch the value externally, which can be used to inject a value into the hook.
   * @param isRefetch - Indicates if this fetch is a refetch.
   * @param args - The arguments for the fetch function.
   * @returns A promise that resolves to the fetched value.
   */
  fetchInjectedValue?: (isRefetch: boolean, ...args: Args) => Promise<T>;
  /**
   * The primary function to fetch the value.
   * @param args - The arguments for the fetch function.
   * @returns A promise that resolves to the fetched value.
   */
  fetch: (...args: Args) => Promise<T>;
  /**
   * An optional validation function for the fetched value.
   * @param value - The value to validate.
   * @returns True if the value is valid, or an array of error messages if invalid.
   */
  validate?: (value: T) => true | Array<string>;
};

/**
 * The possible UI states for the idempotent fetch hook.
 * These states represent the different stages of the fetch operation, such as when it is ready, loading, has encountered an error, is complete, or has a validation error.
 * @enum {string}
 * @readonly
 * @example
 * const state = idempotentUiStates.ready;
 * console.log(state); // "ready"
 * const loadingState = idempotentUiStates.loading;
 * console.log(loadingState); // "loading"
 * const errorState = idempotentUiStates.error;
 * console.log(errorState); // "error"
 * const completeState = idempotentUiStates.complete;
 * console.log(completeState); // "complete"
 * const validationErrorState = idempotentUiStates.validationError;
 * console.log(validationErrorState); // "validationError"
 */
export const idempotentUiStates = {
  ready: 'ready',
  loading: 'loading',
  error: 'error',
  complete: 'complete',
  validationError: 'validationError',
} as const;

// --- Utility Functions ---
/**
 * Checks if a value is an instance of Error.
 * @param value - The value to check.
 * @returns True if the value is an Error, false otherwise.
 */
function isError(value: unknown): value is Error {
  return value instanceof Error;
}
/**
 * Checks if a value is a validation error.
 * @param error - The error to check.
 * @returns True if the error is a validation error, false otherwise.
 */
function isValidationError(error: unknown): error is ValidationError {
  return (
    error instanceof Error &&
    'errorMessages' in error &&
    Array.isArray((error as Record<string, unknown>).errorMessages)
  );
}
/**
 * Checks if a value is a Promise.
 * @param value - The value to check.
 * @returns True if the value is a Promise, false otherwise.
 */
function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value instanceof Promise ||
    (typeof value === 'object' &&
      value !== null &&
      'then' in value &&
      typeof (value as Record<string, unknown>).then === 'function')
  );
}
/**
 * Resolves an unknown error into an instance of Error.
 * @param err - The error to resolve.
 * @returns An instance of Error.
 */
function resolveError(err: unknown): Error {
  if (isError(err)) return err;
  if (typeof err === 'string') return new Error(err);
  return new Error(JSON.stringify(err) || 'An unknown error occurred');
}
/**
 * Creates a validation error from an existing error and an array of error messages.
 * @param error - The original error.
 * @param errorMessages - The array of validation error messages.
 * @returns A ValidationError instance.
 */
export function makeValidationError(error: Error, errorMessages: string[]): ValidationError {
  return Object.assign(error, { errorMessages });
}

/**
 * Custom hook for idempotent fetching of data in React components.
 * @why To provide a consistent and idempotent way to fetch data in React components, ensuring that repeated fetches with the same parameters do not cause unnecessary network requests or state updates.
 * @what Provides a hook that manages the state and lifecycle of idempotent fetch operations in React components.
 * @template T - The type of the data being fetched.
 * @template Args - The type of the arguments for the fetch function.
 * @param options - Configuration options for the idempotent fetch.
 * @example
 * const { state, instance, initialize } = useIdempotentFetch<UserProfile, [number]>({
 *   name: 'getUserProfile',
 *   fetch: async (userId: number) => {
 *     const res = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`);
 *     if (!res.ok) throw new Error;
 *     return res.json();
 *   }
 * });
 * 
 * useEffect(() => {
 *   initialize(1).catch(console.error);
 * }, [initialize]);
 * 
 * @returns An object containing the current state, the instance value, and the initialize function.
 */
export function useIdempotentFetch<T, Args extends unknown[] = []>(
  options: IdempotentFetchOptions<IdempotentValue<T>, Args>
) {
  const { name: optionName, validate: optionValidate, fetch: optionFetch, fetchInjectedValue: optionFetchInjectedValue } = options;
  const usingFetchInjectedValue = typeof optionFetchInjectedValue === 'function';

  // --- React State & References ---
  const [valueState, setValueState] = useState<IdempotentValue<T>>(options.initialValue?.value);
  const valueRef = useRef<IdempotentValue<T>>(options.initialValue?.value);
  /**
   * Updates the current value state and reference.
   * @param val - The new value to set.
   */
  const updateValue = useCallback((val: IdempotentValue<T>) => {
    valueRef.current = val;
    setValueState(val);
  }, []);
  /**
   * Indicates whether the fetch has been initialized.
   * @returns True if the fetch has been initialized, false otherwise.
   */
  const [isInitialized, setIsInitialized] = useState<boolean>(
    () => (options.initialValue?.isInitialized && !!options.initialValue) || false
  );
  /**
   * Indicates whether the value has been set by a fetch operation.
   * @returns True if the value has been set by a fetch, false otherwise.
   */
  const [isSetByFetch, setIsSetByFetch] = useState<boolean>(
    () => usingFetchInjectedValue || options.initialValue?.isInitialized || false
  );
  /**
   * Indicates whether the fetch is quietly loading.
   * @returns True if the fetch is quietly loading, false otherwise.
   */
  const [quietlyLoading, setQuietlyLoading] = useState<boolean>(false);

  // --- Core Fetch Handlers ---
  /**
   * Handles the response from a fetch operation, updating the value state and reference.
   * @param response - The response to handle.
   * @returns The processed response, which may be a validation error or the original response.
   */
  const handleResponse = useCallback((response: IdempotentValue<T>): IdempotentValue<T> => {
    try
    {
      if (!isError(response) && typeof optionValidate === 'function')
      {
        const isValidOrErrorMessages = optionValidate(response as T);
        if (Array.isArray(isValidOrErrorMessages))
        {
          const validationErr = makeValidationError(new Error('Could not validate response'), isValidOrErrorMessages);
          updateValue(validationErr);
          return validationErr;
        }
      }
      updateValue(response);
      return response;
    } catch (err)
    {
      const error = resolveError(err);
      updateValue(error);
      return error;
    }
  }, [optionValidate, updateValue]);
  /**
   * Performs a fetch operation using the primary fetch function.
   * @param args - The arguments to pass to the fetch function.
   * @returns The result of the fetch operation, which may be a validation error or the original response.
   */
  const fetchFn = useCallback(async (...args: Args): Promise<IdempotentValue<T>> => {
    try
    {
      const response = await optionFetch(...args);
      return handleResponse(response);
    } catch (err)
    {
      return handleResponse(resolveError(err));
    } finally
    {
      setIsSetByFetch(true);
    }
  }, [optionFetch, handleResponse]);

  /**
   * Performs a fetch operation using the injected fetch function.
   * @param isRefetch - Indicates whether this is a refetch operation.
   * @param args - The arguments to pass to the injected fetch function.
   * @returns The result of the fetch operation, which may be a validation error or the original response.
   */
  const fetchInjected = useCallback(async (isRefetch: boolean, ...args: Args): Promise<IdempotentValue<T>> => {
    try
    {
      if (typeof optionFetchInjectedValue !== 'function')
      {
        throw new TypeError(`There is not an injected value for ${optionName}`);
      }
      const response = await optionFetchInjectedValue(isRefetch, ...args);
      return handleResponse(response);
    } catch (err)
    {
      return handleResponse(resolveError(err));
    } finally
    {
      setIsSetByFetch(true);
    }
  }, [optionFetchInjectedValue, optionName, handleResponse]);

  // --- Fetch Negotiation ---
  /**
   * Negotiates the fetch operation, deciding whether to use the primary or injected fetch function based on the current state.
   * @param args - The arguments to pass to the fetch function.
   * @returns The result of the fetch operation, which may be a validation error or the original response.
   */
  const negotiateFetch = useCallback(async (...args: Args): Promise<IdempotentValue<T>> => {
    const literalValue = valueRef.current;
    if (isPromise(literalValue)) return literalValue as Promise<T>;
    if (isError(literalValue)) return literalValue;
    if (isSetByFetch) return literalValue;

    const promise = fetchFn(...args) as PromiseOfValueOrError<T>;
    updateValue(promise);
    return promise;
  }, [isSetByFetch, fetchFn, updateValue]);

  const negotiateFetchInjected = useCallback(async (isRefetch: boolean, ...args: Args): Promise<IdempotentValue<T>> => {
    const literalValue = valueRef.current;
    if (isPromise(literalValue)) return literalValue as Promise<T>;
    if (isError(literalValue)) return literalValue;
    if (isSetByFetch) return literalValue;

    const promise = fetchInjected(isRefetch, ...args) as PromiseOfValueOrError<T>;
    updateValue(promise);
    return promise;
  }, [isSetByFetch, fetchInjected, updateValue]);

  // --- Callable Actions ---
  const initialize = useCallback(async (...args: Args): Promise<IdempotentValue<T>> => {
    setIsInitialized(true);
    if (usingFetchInjectedValue) return await negotiateFetchInjected(false, ...args);
    return await negotiateFetch(...args);
  }, [usingFetchInjectedValue, negotiateFetchInjected, negotiateFetch]);

  /**
   * Refetches the data, optionally in quiet mode to avoid triggering loading states.
   * @param quiet - Indicates whether to perform the refetch quietly.
   * @param args - The arguments to pass to the fetch function.
   * @returns The result of the refetch operation, which may be a validation error or the original response.
   */
  const refetch = useCallback(async (quiet = false, ...args: Args): Promise<IdempotentValue<T>> => {
    if (quiet)
    {
      setQuietlyLoading(true);
      const response = usingFetchInjectedValue ? await fetchInjected(true, ...args) : await fetchFn(...args);
      setQuietlyLoading(false);
      return response;
    }
    const promise = (usingFetchInjectedValue ? fetchInjected(true, ...args) : fetchFn(...args)) as PromiseOfValueOrError<T>;
    updateValue(promise);
    return promise;
  }, [usingFetchInjectedValue, fetchInjected, fetchFn, updateValue]);

  /**
   * Sets the value manually, bypassing the fetch mechanism.
   * @param value - The value to set.
   */
  const setValue = useCallback((value: T) => {
    updateValue(value);
  }, [updateValue]);

  // --- React UseMemo (Refactored to return safe, fallback values instead of throwing errors) ---
  /**
   * Computes the current UI state based on the internal value state and initialization status.
   * @returns The current UI state, which may be ready, loading, complete, error, or validation error.
   */
  const state = useMemo<IdempotentUiState>(() => {
    if (!isInitialized) return idempotentUiStates.ready;
    if (isPromise(valueState)) return idempotentUiStates.loading;
    if (isValidationError(valueState)) return idempotentUiStates.validationError;
    if (isError(valueState)) return idempotentUiStates.error;
    if (isSetByFetch) return idempotentUiStates.complete;
    return idempotentUiStates.ready; // Fallback safely if internal state is out of sync
  }, [isInitialized, valueState, isSetByFetch]);

  // Returns T if complete, otherwise undefined
  /**
   * Computes the current instance value based on the internal value state and fetch status.
   * @returns The current instance value if available, otherwise undefined.
   */
  const instance = useMemo<T | undefined>(() => {
    if (isSetByFetch && !isPromise(valueState) && !isError(valueState))
    {
      return valueState as T;
    }
    return undefined;
  }, [valueState, isSetByFetch]);

  // Returns Error if error, otherwise undefined
  /**
   * Computes the current error value based on the internal value state.
   * @returns The current error value if available, otherwise undefined.
   */
  const error = useMemo<Error | undefined>(() => {
    if (isError(valueState) && !isValidationError(valueState))
    {
      return valueState;
    }
    return undefined;
  }, [valueState]);

  // Returns ValidationError if valid-error occurs, otherwise undefined
  /**
   * Computes the current validation error value based on the internal value state.
   * @returns The current validation error value if available, otherwise undefined.
   */
  const validationError = useMemo<ValidationError | undefined>(() => {
    if (isValidationError(valueState))
    {
      return valueState;
    }
    return undefined;
  }, [valueState]);

  return {
    isInitialized,
    error,
    initialize,
    instance,
    quietlyLoading,
    refetch,
    setValue,
    state,
    validationError,
  };
}
