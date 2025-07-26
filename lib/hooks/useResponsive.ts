"use client";

import { useMediaQuery } from "react-responsive";

export const useResponsive = () => {
  const isMobile = useMediaQuery({ maxWidth: 640 });
  const isTablet = useMediaQuery({ minWidth: 641, maxWidth: 1024 });
  const isDesktop = useMediaQuery({ minWidth: 1025 });
  const isSmallMobile = useMediaQuery({ maxWidth: 480 });

  return {
    isMobile,
    isTablet,
    isDesktop,
    isSmallMobile,
    // Convenience computed values
    isMobileOrTablet: isMobile || isTablet,
    isTabletOrDesktop: isTablet || isDesktop,
  };
};

// Individual hooks for specific breakpoints
export const useIsMobile = () => useMediaQuery({ maxWidth: 640 });
export const useIsTablet = () =>
  useMediaQuery({ minWidth: 641, maxWidth: 1024 });
export const useIsDesktop = () => useMediaQuery({ minWidth: 1025 });
export const useIsSmallMobile = () => useMediaQuery({ maxWidth: 480 });
