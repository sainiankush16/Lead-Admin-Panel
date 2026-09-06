import { useEffect, useRef } from "react";

/**
 * Tracks whether the component is still mounted.
 * Use before setState after async work to avoid updates on unmounted screens.
 */
export function useMountedRef() {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return mountedRef;
}
