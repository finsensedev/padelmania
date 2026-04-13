import { Request } from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary';

// Configure Multer to use memory storage
const storage = multer.memoryStorage();

// File filter - only allow images
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed.'
      )
    );
  }
};

// Multer upload configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

/**
 * Upload a single image to Cloudinary
 * @param file - Multer file object
 * @param folder - Cloudinary folder (e.g., 'products', 'categories')
 * @returns Cloudinary secure URL
 */
export const uploadToCloudinary = async (
  file: Express.Multer.File,
  folder: string = 'products'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `padel-mania/${folder}`,
        transformation: [
          { width: 1200, height: 1200, crop: 'limit' },
          { quality: 'auto' },
          { fetch_format: 'auto' },
        ],
      },
      (error: any, result: any) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return reject(error);
        }
        if (!result) {
          return reject(new Error('Upload failed - no result'));
        }
        resolve(result.secure_url);
      }
    );

    uploadStream.end(file.buffer);
  });
};

/**
 * Upload multiple images to Cloudinary
 * @param files - Array of Multer file objects
 * @param folder - Cloudinary folder
 * @returns Array of Cloudinary secure URLs
 */
export const uploadMultipleToCloudinary = async (
  files: Express.Multer.File[],
  folder: string = 'products'
): Promise<string[]> => {
  const uploadPromises = files.map((file) =>
    uploadToCloudinary(file, folder)
  );
  return Promise.all(uploadPromises);
};

/**
 * Delete an image from Cloudinary
 * @param imageUrl - Cloudinary URL
 */
export const deleteFromCloudinary = async (
  imageUrl: string
): Promise<void> => {
  try {
    const publicId = extractPublicId(imageUrl);
    if (publicId) {
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};

/**
 * Extract public ID from Cloudinary URL
 */
function extractPublicId(url: string): string | null {
  try {
    // Extract public_id from Cloudinary URL
    // Example: https://res.cloudinary.com/demo/image/upload/v1234/folder/image.jpg
    const parts = url.split('/');
    const uploadIndex = parts.findIndex((part) => part === 'upload');
    if (uploadIndex !== -1 && uploadIndex + 2 < parts.length) {
      // Get everything after 'upload/v123456/'
      const pathParts = parts.slice(uploadIndex + 2);
      const fullPath = pathParts.join('/');
      // Remove file extension
      return fullPath.replace(/\.[^/.]+$/, '');
    }
    return null;
  } catch (error) {
    console.error('Error extracting public ID:', error);
    return null;
  }
}

/**
 * Generate a placeholder image URL (for development/testing)
 * Uses placeholder.com or similar service
 */
export const generatePlaceholderImage = (
  width: number = 800,
  height: number = 800,
  text: string = 'Product Image'
): string => {
  const encodedText = encodeURIComponent(text);
  return `https://via.placeholder.com/${width}x${height}/1a1a1a/ffffff?text=${encodedText}`;
};

/**
 * Get dummy product images for testing
 * Returns array of placeholder URLs
 */
export const getDummyProductImages = (productName: string): string[] => {
  return [
    generatePlaceholderImage(800, 800, `${productName} - Main`),
    generatePlaceholderImage(800, 800, `${productName} - Side`),
    generatePlaceholderImage(800, 800, `${productName} - Detail`),
    generatePlaceholderImage(800, 800, `${productName} - Back`),
  ];
};
