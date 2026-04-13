import { Link } from "react-router-dom";
import { Search, ArrowLeft, Home, HelpCircle } from "lucide-react";

function NotFoundPage({ isPublicRoute = false }: { isPublicRoute?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-8 justify-center items-center px-4  ${
        isPublicRoute
          ? "min-h-screen bg-gradient-to-br from-primary/5 to-accent/5"
          : "h-[calc(100vh-80px-16px-16px)]"
      }`}
    >
      {/* 404 Illustration */}
      <div className="relative">
        <div className="text-9xl font-bold text-primary/20 select-none animate-pulse">
          404
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center animate-bounce">
            <Search className="w-8 h-8 text-primary" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="text-center space-y-4 max-w-md">
        <h1 className="text-3xl font-bold text-foreground">Page Not Found</h1>
        <p className="text-muted-foreground text-lg">
          Oops! The page you're looking for seems to have taken a wrong turn on
          the court.
        </p>
        <p className="text-muted-foreground/70 text-sm">
          Don't worry, even the best padel players sometimes hit the ball out of
          bounds.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <Link
          to={isPublicRoute ? "/" : "/"}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          {isPublicRoute ? (
            <>
              <ArrowLeft className="w-4 h-4" />
              Go Back Home
            </>
          ) : (
            <>
              <Home className="w-4 h-4" />
              Go to Dashboard
            </>
          )}
        </Link>

        <button className="inline-flex items-center gap-2 bg-muted text-muted-foreground px-6 py-3 rounded-lg font-medium hover:bg-muted/80 hover:text-foreground transition-colors">
          <HelpCircle className="w-4 h-4" />
          Get Help
        </button>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-primary/30 rounded-full animate-pulse"></div>
      <div className="absolute top-3/4 right-1/3 w-1 h-1 bg-accent/40 rounded-full animate-pulse delay-1000"></div>
      <div className="absolute bottom-1/4 left-1/2 w-1.5 h-1.5 bg-primary/25 rounded-full animate-pulse delay-500"></div>
    </div>
  );
}

export default NotFoundPage;
