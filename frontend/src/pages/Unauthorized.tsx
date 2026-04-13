import { Link, useNavigate } from "react-router-dom";
import { Shield, ArrowLeft, Home, LogIn, HelpCircle } from "lucide-react";

function Unauthorized() {
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen flex flex-col gap-8 justify-center items-center px-4 bg-gradient-to-br from-destructive/5 to-accent/5">
      {/* 403 Illustration */}
      <div className="relative">
        <div className="text-9xl font-bold text-destructive/20 select-none animate-pulse">
          403
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center animate-bounce">
            <Shield className="w-8 h-8 text-destructive" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="text-center space-y-4 max-w-lg">
        <h1 className="text-3xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground text-lg">
          Sorry, you don't have permission to access this area of the court.
        </p>
        <p className="text-muted-foreground/70 text-sm">
          This section is reserved for authorized players only. Please check
          your membership level or contact our staff for assistance.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <button
          onClick={handleGoBack}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>

        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-muted text-muted-foreground px-6 py-3 rounded-lg font-medium hover:bg-muted/80 hover:text-foreground transition-colors"
        >
          <Home className="w-4 h-4" />
          Home
        </Link>

        <Link
          to="/login"
          className="inline-flex items-center gap-2 border border-border text-foreground px-6 py-3 rounded-lg font-medium hover:bg-muted transition-colors"
        >
          <LogIn className="w-4 h-4" />
          Login
        </Link>
      </div>

      {/* Help Section */}
      <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-border max-w-md text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <HelpCircle className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-medium text-foreground">Need Help?</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          If you believe this is an error, please contact our support team.
        </p>
        <button className="text-sm text-primary hover:text-primary/80 font-medium">
          Contact Support
        </button>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-destructive/30 rounded-full animate-pulse"></div>
      <div className="absolute top-3/4 right-1/3 w-1 h-1 bg-accent/40 rounded-full animate-pulse delay-1000"></div>
      <div className="absolute bottom-1/4 left-1/2 w-1.5 h-1.5 bg-destructive/25 rounded-full animate-pulse delay-500"></div>
    </div>
  );
}

export default Unauthorized;
