import type { ReactNode } from "react";

interface LayoutContainerProps {
  children: ReactNode;
  className?: string;
}

// Provides a consistent responsive max-width and horizontal padding for officer pages.
export default function LayoutContainer({
  children,
  className = "",
}: LayoutContainerProps) {
  return (
    <div className={`mx-auto w-full  px-4 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}
