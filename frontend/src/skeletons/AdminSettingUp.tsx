import { useState, useEffect } from "react";
import { IoSettingsOutline } from "react-icons/io5";

function AdminSettingUp() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prevProgress) => {
        if (prevProgress < 98) {
          // Fast initial progress, but clamp at 98
          return Math.min(prevProgress + 4, 98);
        } else if (prevProgress < 99) {
          // Slow crawl toward 99
          return Math.min(prevProgress + 0.1, 99);
        } else {
          // Stay at 99
          return 99;
        }
      });
    }, 100);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10 dark:from-primary/20 dark:to-accent/20 p-4">
      {/* Main content card */}
      <div className="bg-card border border-border rounded-xl shadow-lg dark:shadow-2xl dark:shadow-primary/5 p-8 w-full max-w-md">
        {/* Icon container */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 dark:bg-primary/30 rounded-full blur-md animate-pulse"></div>
            <div className="relative bg-muted/50 dark:bg-muted/30 p-4 rounded-full border border-border dark:border-primary/20">
              <IoSettingsOutline className="text-4xl text-primary dark:text-primary animate-spin [animation-duration:3s]" />
            </div>
          </div>
        </div>

        {/* Text content */}
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold text-foreground dark:text-foreground">
            Setting Up Your Experience
          </h1>
          <p className="text-muted-foreground dark:text-muted-foreground text-sm">
            Please wait while we prepare everything for you...
          </p>

          {/* Loading dots */}
          <div className="flex justify-center space-x-1 mt-6">
            <div className="w-2 h-2 bg-primary dark:bg-primary rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-primary/70 dark:bg-primary/80 rounded-full animate-bounce [animation-delay:0.2s]"></div>
            <div className="w-2 h-2 bg-primary/50 dark:bg-primary/60 rounded-full animate-bounce [animation-delay:0.4s]"></div>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="mt-8 space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground dark:text-muted-foreground">
            <span>Loading...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-muted dark:bg-muted/50 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary dark:bg-primary rounded-full transition-all duration-300 ease-out relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent animate-[shimmer_2s_infinite] transform -skew-x-12"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminSettingUp;
