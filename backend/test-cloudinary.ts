import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function testCloudinaryConnection() {
  console.log('🔍 Testing Cloudinary connection...\n');
  
  console.log('Configuration:');
  console.log(`  Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
  console.log(`  API Key: ${process.env.CLOUDINARY_API_KEY}`);
  console.log(`  API Secret: ${process.env.CLOUDINARY_API_SECRET?.substring(0, 10)}...`);
  console.log('');

  try {
    // Test connection by pinging the API
    const result = await cloudinary.api.ping();
    
    console.log('✅ SUCCESS! Cloudinary connection is working!');
    console.log('Response:', result);
    console.log('\n🎉 You can now upload images to Cloudinary!');
    
  } catch (error: any) {
    console.error('❌ FAILED! Could not connect to Cloudinary');
    console.error('Error:', error.message);
    
    if (error.error?.http_code === 401) {
      console.error('\n⚠️  Authentication failed. Please check:');
      console.error('   - CLOUDINARY_CLOUD_NAME is correct');
      console.error('   - CLOUDINARY_API_KEY is correct');
      console.error('   - CLOUDINARY_API_SECRET is correct');
    }
  }
}

testCloudinaryConnection();
