"use client";

import { useMediaQuery } from "react-responsive";

export const useResponsive = () => {
  const isMobile = useMediaQuery({ maxWidth: 767 });
  const isDesktop = useMediaQuery({ minWidth: 768 });

  return {
    isMobile,
    isDesktop,
  };
};

// Individual hooks for specific breakpoints
export const useIsMobile = () => useMediaQuery({ maxWidth: 767 });
export const useIsDesktop = () => useMediaQuery({ minWidth: 768 });
