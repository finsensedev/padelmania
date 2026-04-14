export function buildResendVerificationEmail(
  verifyUrl: string,
  firstName?: string,
) {
  const greeting = firstName ? `Hi ${firstName}` : "Hello";

  return {
    subject: "🔄 Padel Mania - New Verification Link",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Verification Link - Padel Mania</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, rgba(109, 40, 217, 0.1) 0%, rgba(245, 158, 11, 0.1) 100%); min-height: 100vh;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, rgba(109, 40, 217, 0.1) 0%, rgba(245, 158, 11, 0.1) 100%); padding: 40px 0; min-height: 100vh;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); overflow: hidden; max-width: 90%;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, hsl(268, 68%, 45%) 0%, hsl(193, 88%, 47%) 100%); padding: 50px 30px; text-align: center;">
                    <div style="background-color: hsl(268, 68%, 45%); width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 24px; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);">
                      <span style="color: #ffffff; font-size: 36px; font-weight: bold; font-family: 'Inter', sans-serif;">T</span>
                    </div>
                    <h1 style="color: #ffffff; font-size: 32px; font-weight: 700; margin: 0; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); font-family: 'Inter', sans-serif;">Padel Mania</h1>
                    <p style="color: rgba(255, 255, 255, 0.95); font-size: 18px; margin: 8px 0 0 0; font-weight: 500;">New Verification Link</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 50px 40px; text-align: center;">
                    <h2 style="color: hsl(240, 10%, 3.9%); font-size: 28px; font-weight: 700; margin: 0 0 24px 0; font-family: 'Inter', sans-serif;">Fresh Verification Link 🔄</h2>
                    
                    <p style="color: hsl(240, 3.8%, 46.1%); font-size: 18px; line-height: 1.6; margin: 0 0 24px 0; font-family: 'Inter', sans-serif;">${greeting},</p>
                    
                    <p style="color: hsl(240, 3.8%, 46.1%); font-size: 16px; line-height: 1.6; margin: 0 0 32px 0; font-family: 'Inter', sans-serif;">
                      We've generated a fresh verification link for your Padel Mania account. Your previous link may have expired, so please use this new one to verify your email.
                    </p>
                    
                    <!-- CTA Button -->
                    <div style="margin: 40px 0;">
                      <a href="${verifyUrl}" 
                         style="display: inline-block; background: hsl(268, 68%, 45%); color: hsl(0, 0%, 98%); text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 16px rgba(109, 40, 217, 0.3); font-family: 'Inter', sans-serif;">
                        ✅ Verify My Email Address
                      </a>
                    </div>
                    
                    <p style="color: hsl(240, 3.8%, 46.1%); font-size: 14px; margin: 32px 0 24px 0; font-family: 'Inter', sans-serif;">
                      This verification link will expire in <strong style="color: hsl(268, 68%, 45%);">30 minutes</strong>.
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: hsl(240, 4.8%, 95.9%); padding: 40px 30px; text-align: center; border-top: 1px solid hsl(240, 5.9%, 90%);">
                    <p style="color: hsl(240, 3.8%, 46.1%); font-size: 12px; margin: 0 0 12px 0; line-height: 1.5; font-family: 'Inter', sans-serif;">
                      © ${new Date().getFullYear()} Padel Mania. All rights reserved.<br>
                      <span style="color: hsl(268, 68%, 45%); font-weight: 600;">Nairobi, Kenya</span> | 
                      <a href="mailto:team@padelmania.co.ke" style="color: hsl(268, 68%, 45%); text-decoration: none;">team@padelmania.co.ke</a> | 
                      <span style="color: hsl(268, 68%, 45%); font-weight: 600;">+254 742 754 354</span>
                    </p>
                    <p style="color: #9ca3af; font-size: 11px; margin: 0; font-family: 'Inter', sans-serif;">
                      Powered by <a href="https://www.finsense.co.ke/" style="color: #fc4639; text-decoration: none; font-weight: 600;">FinSense Africa</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  };
}
