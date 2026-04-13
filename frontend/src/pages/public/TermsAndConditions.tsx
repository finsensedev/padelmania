import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import {
  ChevronLeft,
  Shield,
  FileText,
  Eye,
  Users,
  Download,
} from "lucide-react";
import { TermsContent } from "src/components/shared/TermsContent";

function TermsAndConditions() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("terms");

  const handleBackToHome = () => {
    navigate("/");
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setActiveSection(sectionId);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: 0.3 }
    );

    const sections = document.querySelectorAll("section[id]");
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBackToHome}
              className="flex items-center gap-1 sm:gap-2 hover:bg-primary/10 text-xs sm:text-sm px-2 sm:px-3"
            >
              <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Back to Home</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg flex-shrink-0">
                  <FileText className="w-4 h-4 sm:w-6 sm:h-6 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg sm:text-2xl font-bold leading-tight truncate">
                    Terms & Conditions
                  </h1>
                  <p className="text-muted-foreground flex items-center gap-1 sm:gap-2 text-xs sm:text-sm leading-tight">
                    <span className="truncate">
                      Padel Mania - Legal Information
                    </span>
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 flex-shrink-0"
            >
              <Download className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Print</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="grid lg:grid-cols-4 gap-4 sm:gap-8">
          {/* Navigation Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-20 sm:top-24 shadow-lg border-border">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 py-3 sm:py-4">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  <span className="leading-tight">Quick Navigation</span>
                </CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground leading-tight">
                  Jump to any section
                </p>
              </CardHeader>
              <CardContent className="space-y-1.5 sm:space-y-2 px-3 sm:px-6 pb-3 sm:pb-6">
                <button
                  onClick={() => scrollToSection("terms")}
                  className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 ${
                    activeSection === "terms"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "hover:bg-muted/70 hover:shadow-sm"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <div className="text-left min-w-0 flex-1">
                    <div className="font-medium text-xs sm:text-sm leading-tight">
                      Terms & Conditions
                    </div>
                    <div className="text-xs opacity-80 leading-tight">
                      Service agreement
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => scrollToSection("privacy")}
                  className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 ${
                    activeSection === "privacy"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "hover:bg-muted/70 hover:shadow-sm"
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <div className="text-left min-w-0 flex-1">
                    <div className="font-medium text-xs sm:text-sm leading-tight">
                      Privacy Policy
                    </div>
                    <div className="text-xs opacity-80 leading-tight">
                      Data protection
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => scrollToSection("data-privacy")}
                  className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 ${
                    activeSection === "data-privacy"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "hover:bg-muted/70 hover:shadow-sm"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <div className="text-left min-w-0 flex-1">
                    <div className="font-medium text-xs sm:text-sm leading-tight">
                      Data Privacy Policy
                    </div>
                    <div className="text-xs opacity-80 leading-tight">
                      GDPR compliance
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => scrollToSection("contact")}
                  className={`w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-all duration-200 flex items-center gap-2 sm:gap-3 ${
                    activeSection === "contact"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "hover:bg-muted/70 hover:shadow-sm"
                  }`}
                >
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <div className="text-left min-w-0 flex-1">
                    <div className="font-medium text-xs sm:text-sm leading-tight">
                      Contact Us
                    </div>
                    <div className="text-xs opacity-80 leading-tight">
                      Get support
                    </div>
                  </div>
                </button>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="space-y-4 sm:space-y-8">
              {/* Terms and Conditions Section */}
              <section id="terms">
                <Card className="shadow-lg border-border">
                  <CardHeader className="bg-gradient-to-r from-primary/5 to-accent/5 px-3 sm:px-6 py-3 sm:py-6">
                    <CardTitle className="text-lg sm:text-xl lg:text-2xl flex items-center gap-2">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-primary flex-shrink-0" />
                      <span className="leading-tight">
                        Terms and Conditions
                      </span>
                    </CardTitle>
                    <p className="text-xs sm:text-sm lg:text-base text-muted-foreground leading-tight">
                      Last updated: October 2024 • Service agreement and user
                      responsibilities
                    </p>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 lg:p-6">
                    <TermsContent />
                  </CardContent>
                </Card>
              </section>

              {/* Privacy Policy Section */}
              <section id="privacy">
                <Card>
                  <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                    <CardTitle className="text-lg sm:text-xl lg:text-2xl flex items-center gap-2">
                      <Shield className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-primary flex-shrink-0" />
                      <span className="leading-tight">Privacy Policy</span>
                    </CardTitle>
                    <p className="text-xs sm:text-sm lg:text-base text-muted-foreground leading-tight">
                      Your privacy is important to us
                    </p>
                  </CardHeader>
                  <CardContent className="prose max-w-none px-3 sm:px-6 pb-3 sm:pb-6">
                    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                      <p className="text-sm sm:text-base lg:text-lg leading-relaxed">
                        Your privacy is important to us. This policy describes
                        how we collect, use, and protect your personal
                        information.
                      </p>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          Information We Collect
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed">
                          We collect information you provide directly, such as
                          your name, email address, phone number, and payment
                          information. We also collect usage data and technical
                          information about your use of our services.
                        </p>
                        <ul className="list-disc pl-4 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                          <li>Personal identification information</li>
                          <li>Contact information</li>
                          <li>Payment and billing information</li>
                          <li>Booking and reservation history</li>
                          <li>Device and browser information</li>
                          <li>Usage patterns and preferences</li>
                        </ul>
                      </div>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          How We Use Your Information
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed">
                          We use your information to provide and improve our
                          services, process reservations and payments,
                          communicate with you, and ensure the security of our
                          platform.
                        </p>
                        <ul className="list-disc pl-4 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                          <li>Process bookings and manage reservations</li>
                          <li>Handle payments and billing</li>
                          <li>Send booking confirmations and updates</li>
                          <li>Provide customer support</li>
                          <li>Improve our services and user experience</li>
                          <li>Ensure security and prevent fraud</li>
                        </ul>
                      </div>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          Data Security
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed">
                          We implement appropriate security measures to protect
                          your personal information against unauthorized access,
                          alteration, disclosure, or destruction. This includes
                          encryption, secure servers, and regular security
                          audits.
                        </p>
                      </div>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          Data Sharing
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed">
                          We do not sell, trade, or rent your personal
                          information to third parties. We may share information
                          with trusted service providers who assist in operating
                          our platform, conducting business, or serving users.
                        </p>
                      </div>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          Your Rights
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed">
                          You have the right to access, update, or delete your
                          personal information. You may also opt out of certain
                          communications and request data portability where
                          applicable.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Data Privacy Policy Section */}
              <section id="data-privacy">
                <Card>
                  <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                    <CardTitle className="text-lg sm:text-xl lg:text-2xl flex items-center gap-2">
                      <Eye className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-primary flex-shrink-0" />
                      <span className="leading-tight">Data Privacy Policy</span>
                    </CardTitle>
                    <p className="text-xs sm:text-sm lg:text-base text-muted-foreground leading-tight">
                      Comprehensive data protection information
                    </p>
                  </CardHeader>
                  <CardContent className="prose max-w-none px-3 sm:px-6 pb-3 sm:pb-6">
                    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                      <p className="text-sm sm:text-base lg:text-lg leading-relaxed">
                        This Data Privacy Policy provides detailed information
                        about how Padel Mania processes, stores, and protects
                        your personal data in compliance with applicable data
                        protection laws.
                      </p>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          1. Data Controller Information
                        </h3>
                        <div className="bg-muted/50 p-3 sm:p-4 rounded-lg border border-border">
                          <p className="text-sm sm:text-base leading-relaxed">
                            <strong>Company:</strong> Padel Mania Limited
                            <br />
                            <strong>Address:</strong> Mombasa, Kenya
                            <br />
                            <strong>Email:</strong> privacy@padelmania.com
                            <br />
                            <strong>Phone:</strong> +254 113 666 444
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          2. Legal Basis for Processing
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed">
                          We process your personal data under the following
                          legal bases:
                        </p>
                        <ul className="list-disc pl-4 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                          <li>
                            <strong>Contract Performance:</strong> To fulfill
                            our contractual obligations for court bookings and
                            services
                          </li>
                          <li>
                            <strong>Legitimate Interest:</strong> To improve our
                            services, prevent fraud, and ensure security
                          </li>
                          <li>
                            <strong>Consent:</strong> For marketing
                            communications and optional features
                          </li>
                          <li>
                            <strong>Legal Obligation:</strong> To comply with
                            applicable laws and regulations
                          </li>
                        </ul>
                      </div>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          3. Data Retention
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed">
                          We retain your personal data only for as long as
                          necessary to fulfill the purposes outlined in this
                          policy:
                        </p>
                        <ul className="list-disc pl-4 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                          <li>
                            Account information: While your account is active
                          </li>
                          <li>
                            Booking records: 7 years for financial compliance
                          </li>
                          <li>Marketing preferences: Until you opt out</li>
                          <li>Technical logs: 12 months maximum</li>
                        </ul>
                      </div>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          4. International Transfers
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed">
                          Your data may be transferred to and processed in
                          countries outside Kenya. We ensure appropriate
                          safeguards are in place to protect your data during
                          international transfers.
                        </p>
                      </div>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          5. Your Data Protection Rights
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed">
                          Under applicable data protection laws, you have the
                          following rights:
                        </p>
                        <ul className="list-disc pl-4 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
                          <li>
                            <strong>Right of Access:</strong> Request copies of
                            your personal data
                          </li>
                          <li>
                            <strong>Right to Rectification:</strong> Request
                            correction of inaccurate data
                          </li>
                          <li>
                            <strong>Right to Erasure:</strong> Request deletion
                            of your personal data
                          </li>
                          <li>
                            <strong>Right to Restrict Processing:</strong> Limit
                            how we use your data
                          </li>
                          <li>
                            <strong>Right to Data Portability:</strong> Receive
                            your data in a structured format
                          </li>
                          <li>
                            <strong>Right to Object:</strong> Object to
                            processing based on legitimate interests
                          </li>
                        </ul>
                      </div>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          6. Cookies and Tracking
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed">
                          We use cookies and similar technologies to enhance
                          your experience, analyze usage patterns, and provide
                          personalized content. You can manage cookie
                          preferences through your browser settings.
                        </p>
                      </div>

                      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight">
                          7. Data Breach Notification
                        </h3>
                        <p className="text-sm sm:text-base leading-relaxed">
                          In the event of a data breach that may pose a risk to
                          your rights and freedoms, we will notify you and
                          relevant authorities within 72 hours as required by
                          law.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Contact Section */}
              <section id="contact">
                <Card>
                  <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                    <CardTitle className="text-lg sm:text-xl lg:text-2xl flex items-center gap-2">
                      <Users className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-primary flex-shrink-0" />
                      <span className="leading-tight">Contact Us</span>
                    </CardTitle>
                    <p className="text-xs sm:text-sm lg:text-base text-muted-foreground leading-tight">
                      Get in touch with questions about our policies
                    </p>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                    <div className="grid sm:grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                      <div className="space-y-3 sm:space-y-4">
                        <h3 className="text-base sm:text-lg font-semibold leading-tight">
                          General Inquiries
                        </h3>
                        <div className="space-y-1.5 sm:space-y-2 text-sm sm:text-base">
                          <p>
                            <strong>Email:</strong> support@padelmania.com
                          </p>
                          <p>
                            <strong>Phone:</strong> +254 113 666 444
                          </p>
                          <p>
                            <strong>Address:</strong> Mombasa, Kenya
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 sm:space-y-4">
                        <h3 className="text-base sm:text-lg font-semibold leading-tight">
                          Privacy & Data Protection
                        </h3>
                        <div className="space-y-1.5 sm:space-y-2 text-sm sm:text-base">
                          <p>
                            <strong>Data Protection Officer:</strong> Available
                            upon request
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 sm:mt-8 p-3 sm:p-4 bg-muted/50 rounded-lg border border-border">
                      <p className="text-xs sm:text-sm leading-relaxed">
                        <strong>Policy Updates:</strong> We may update these
                        policies from time to time. When we do, we will post the
                        updated version on this page and update the "Last
                        updated" date. We encourage you to review these policies
                        periodically to stay informed about how we protect your
                        information.
                      </p>
                    </div>

                    <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <Button
                        onClick={handleBackToHome}
                        className="flex-1 h-10 sm:h-11 touch-manipulation"
                      >
                        Return to Home
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => window.print()}
                        className="flex-1 h-10 sm:h-11 touch-manipulation"
                      >
                        Print This Page
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TermsAndConditions;
