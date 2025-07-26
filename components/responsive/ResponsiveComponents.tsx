"use client";

import React from "react";
import { useMediaQuery } from "react-responsive";

interface ResponsiveProps {
  children: React.ReactNode;
}

export const Desktop: React.FC<ResponsiveProps> = ({ children }) => {
  const isDesktop = useMediaQuery({ minWidth: 1025 });
  return isDesktop ? <>{children}</> : null;
};

export const Tablet: React.FC<ResponsiveProps> = ({ children }) => {
  const isTablet = useMediaQuery({ minWidth: 641, maxWidth: 1024 });
  return isTablet ? <>{children}</> : null;
};

export const Mobile: React.FC<ResponsiveProps> = ({ children }) => {
  const isMobile = useMediaQuery({ maxWidth: 640 });
  return isMobile ? <>{children}</> : null;
};

export const MobileAndTablet: React.FC<ResponsiveProps> = ({ children }) => {
  const isMobileOrTablet = useMediaQuery({ maxWidth: 1024 });
  return isMobileOrTablet ? <>{children}</> : null;
};

export const TabletAndDesktop: React.FC<ResponsiveProps> = ({ children }) => {
  const isTabletOrDesktop = useMediaQuery({ minWidth: 641 });
  return isTabletOrDesktop ? <>{children}</> : null;
};

export const SmallMobile: React.FC<ResponsiveProps> = ({ children }) => {
  const isSmallMobile = useMediaQuery({ maxWidth: 480 });
  return isSmallMobile ? <>{children}</> : null;
};
