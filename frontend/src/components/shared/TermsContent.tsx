interface TermsContentProps {
  compact?: boolean;
  className?: string;
}

export const TermsContent = ({
  compact = false,
  className = "",
}: TermsContentProps) => {
  const sectionClass = compact ? "text-xs sm:text-sm" : "text-sm sm:text-base";
  const headingClass = compact ? "text-sm sm:text-base" : "text-lg sm:text-xl";
  const subHeadingClass = compact
    ? "text-xs sm:text-sm"
    : "text-sm sm:text-base";

  return (
    <div className={`space-y-3 sm:space-y-4 ${className}`}>
      {/* Terms and Conditions */}
      <div className="space-y-2 sm:space-y-3">
        <h3
          className={`font-semibold mb-2 sm:mb-3 ${headingClass} leading-tight`}
        >
          Terms and Conditions
        </h3>
        <p
          className={`mb-2 sm:mb-3 ${sectionClass} leading-relaxed text-muted-foreground`}
        >
          Welcome to Padel Mania. By creating an account and using our services,
          you agree to be bound by the following terms and conditions.
        </p>

        <div className="space-y-2 sm:space-y-3">
          <div>
            <h4 className={`font-medium mb-1 ${subHeadingClass} leading-tight`}>
              1. Account Registration
            </h4>
            <p
              className={`${sectionClass} leading-relaxed text-muted-foreground`}
            >
              You must provide accurate, current, and complete information
              during the registration process. You are responsible for
              maintaining the confidentiality of your account credentials and
              for all activities that occur under your account.
            </p>
          </div>

          <div>
            <h4 className={`font-medium mb-1 ${subHeadingClass} leading-tight`}>
              2. Court Reservations
            </h4>
            <p
              className={`${sectionClass} leading-relaxed text-muted-foreground`}
            >
              Court reservations are subject to availability. We reserve the
              right to cancel or modify reservations due to maintenance, weather
              conditions, or other unforeseen circumstances. Cancellations made
              less than 24 hours in advance may be subject to fees.
            </p>
          </div>

          <div>
            <h4 className={`font-medium mb-1 ${subHeadingClass} leading-tight`}>
              3. Payment and Fees
            </h4>
            <p
              className={`${sectionClass} leading-relaxed text-muted-foreground`}
            >
              All fees must be paid in advance. We accept various payment
              methods as indicated on our platform. Refunds are subject to our
              cancellation policy and may take 3-5 business days to process.
            </p>
          </div>

          <div>
            <h4 className={`font-medium mb-1 ${subHeadingClass} leading-tight`}>
              4. Facility Rules
            </h4>
            <p
              className={`${sectionClass} leading-relaxed text-muted-foreground`}
            >
              Users must comply with all facility rules and regulations.
              Inappropriate behavior, damage to property, or violation of safety
              rules may result in account suspension or termination.
            </p>
          </div>

          <div>
            <h4 className={`font-medium mb-1 ${subHeadingClass} leading-tight`}>
              5. Liability
            </h4>
            <p
              className={`${sectionClass} leading-relaxed text-muted-foreground`}
            >
              Participation in padel activities is at your own risk. Padel Mania
              is not liable for any injuries, accidents, or damages that may
              occur during the use of our facilities or services.
            </p>
          </div>

          {!compact && (
            <>
              <div>
                <h4 className={`font-medium mb-1 ${subHeadingClass}`}>
                  6. Intellectual Property
                </h4>
                <p
                  className={`${sectionClass} leading-relaxed text-muted-foreground`}
                >
                  All content, trademarks, and intellectual property on our
                  platform belong to Padel Mania. Users may not reproduce,
                  distribute, or create derivative works without explicit
                  permission.
                </p>
              </div>

              <div>
                <h4 className={`font-medium mb-1 ${subHeadingClass}`}>
                  7. Service Modifications
                </h4>
                <p
                  className={`${sectionClass} leading-relaxed text-muted-foreground`}
                >
                  We reserve the right to modify, suspend, or discontinue any
                  aspect of our services at any time without prior notice. We
                  will make reasonable efforts to notify users of significant
                  changes.
                </p>
              </div>

              <div>
                <h4 className={`font-medium mb-1 ${subHeadingClass}`}>
                  8. Termination
                </h4>
                <p
                  className={`${sectionClass} leading-relaxed text-muted-foreground`}
                >
                  Either party may terminate the agreement at any time. Upon
                  termination, your access to our services will cease, and any
                  outstanding obligations must be fulfilled.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Privacy Policy */}
      <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t border-muted">
        <h3
          className={`font-semibold mb-2 sm:mb-3 ${headingClass} leading-tight`}
        >
          Privacy Policy
        </h3>
        <p
          className={`mb-2 sm:mb-3 ${sectionClass} leading-relaxed text-muted-foreground`}
        >
          Your privacy is important to us. This policy describes how we collect,
          use, and protect your personal information.
        </p>

        <div className="space-y-2 sm:space-y-3">
          <div>
            <h4 className={`font-medium mb-1 ${subHeadingClass} leading-tight`}>
              Information We Collect
            </h4>
            <p
              className={`${sectionClass} leading-relaxed text-muted-foreground`}
            >
              We collect information you provide directly, such as your name,
              email address, phone number, and payment information. We also
              collect usage data and technical information about your use of our
              services.
            </p>
          </div>

          <div>
            <h4 className={`font-medium mb-1 ${subHeadingClass} leading-tight`}>
              How We Use Your Information
            </h4>
            <p
              className={`${sectionClass} leading-relaxed text-muted-foreground`}
            >
              We use your information to provide and improve our services,
              process reservations and payments, communicate with you, and
              ensure the security of our platform.
            </p>
          </div>

          <div>
            <h4 className={`font-medium mb-1 ${subHeadingClass} leading-tight`}>
              Data Security
            </h4>
            <p
              className={`${sectionClass} leading-relaxed text-muted-foreground`}
            >
              We implement appropriate security measures to protect your
              personal information against unauthorized access, alteration,
              disclosure, or destruction.
            </p>
          </div>

          {!compact && (
            <>
              <div>
                <h4 className={`font-medium mb-1 ${subHeadingClass}`}>
                  Data Sharing
                </h4>
                <p
                  className={`${sectionClass} leading-relaxed text-muted-foreground`}
                >
                  We do not sell, trade, or rent your personal information to
                  third parties. We may share information with trusted service
                  providers who assist in operating our platform.
                </p>
              </div>

              <div>
                <h4 className={`font-medium mb-1 ${subHeadingClass}`}>
                  Your Rights
                </h4>
                <p
                  className={`${sectionClass} leading-relaxed text-muted-foreground`}
                >
                  You have the right to access, update, or delete your personal
                  information. You may also opt out of certain communications
                  and request data portability where applicable.
                </p>
              </div>

              <div>
                <h4 className={`font-medium mb-1 ${subHeadingClass}`}>
                  Data Retention
                </h4>
                <p
                  className={`${sectionClass} leading-relaxed text-muted-foreground`}
                >
                  We retain your personal data only as long as necessary to
                  fulfill the purposes outlined in this policy, typically while
                  your account is active and for 7 years for financial records.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Contact Information */}
      {/* Contact Information */}
      <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t border-muted">
        <h4 className={`font-medium mb-1 ${subHeadingClass} leading-tight`}>
          Contact Us
        </h4>
        <div
          className={`${sectionClass} leading-relaxed text-muted-foreground space-y-1`}
        >
          <p className="leading-tight">
            If you have any questions about these terms or our privacy policy:
          </p>
          <p className="leading-tight">Email: team@padelmania.com</p>
          <p className="leading-tight">Phone: +254 742 754 354</p>
          <p className="leading-tight">Address: Nairobi, Kenya</p>
        </div>
      </div>
    </div>
  );
};
