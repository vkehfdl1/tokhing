"use client";

import React from "react";
import { useMediaQuery } from "react-responsive";

interface ResponsiveProps {
  children: React.ReactNode;
}

export const Desktop: React.FC<ResponsiveProps> = ({ children }) => {
  const isDesktop = useMediaQuery({ minWidth: 768 });
  return isDesktop ? <>{children}</> : null;
};

export const Mobile: React.FC<ResponsiveProps> = ({ children }) => {
  const isMobile = useMediaQuery({ maxWidth: 767 });
  return isMobile ? <>{children}</> : null;
};
