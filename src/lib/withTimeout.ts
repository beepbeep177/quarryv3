/** Bound UI waits even when a network request never settles. */
export async function withTimeout<T>(request: PromiseLike<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Request timed out')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
