import dotenv from "dotenv";
import path from "path";

// Load environment variables BEFORE importing mailer
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Import mailer after env vars are loaded
const { sendMail } = require("../src/utils/mailer");

const RECIPIENTS = [
  "hmiyanji@finsense.co.ke",
  "aabubakar@finsense.co.ke",
  "ashakur.js24@gmail.com",
  "isumra@finsense.co.ke",
  // "another@example.com"
];

async function main() {
  console.log("🚀 Starting email test...");

  if (RECIPIENTS.length === 0) {
    console.error("❌ No recipients defined.");
    process.exit(1);
  }

  // Join recipients with comma for Nodemailer
  const toAddress = RECIPIENTS.join(", ");
  console.log(`📧 Sending email to: ${toAddress}`);

  try {
    await sendMail({
      to: toAddress,
      subject: "Test Email from Padel Mania Backend",
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h1 style="color: #333;">Test Email</h1>
          <p>This is a test email sent from the Padel Mania backend script.</p>
          <hr />
          <p><strong>Recipients:</strong> ${toAddress}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
      `,
      text: `Test Email\n\nThis is a test email sent from the Padel Mania backend script.\nRecipients: ${toAddress}\nTime: ${new Date().toLocaleString()}`,
    });

    console.log("✅ Email sent successfully!");
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    process.exit(0);
  });
