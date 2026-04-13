import { IoSettingsOutline } from "react-icons/io5";
import { useState, useEffect } from "react";

const OutletSettingUp = () => {
  const [dots, setDots] = useState("...");

  useEffect(() => {
    const sequence = ["...", "..", ".", "..", "..."];
    let index = 0;

    const interval = setInterval(() => {
      index = (index + 1) % sequence.length;
      setDots(sequence[index]);
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center space-y-4">
        {/* Icon container */}
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-md animate-pulse"></div>
          <div className="relative bg-muted/50 p-4 rounded-full border border-border">
            <IoSettingsOutline className="text-4xl text-primary animate-spin [animation-duration:3s]" />
          </div>
        </div>

        {/* Loading text with animated dots */}
        <p className="text-muted-foreground text-sm">
          Loading<span className="inline-block w-6 text-left">{dots}</span>
        </p>
      </div>
    </div>
  );
};

export default OutletSettingUp;
