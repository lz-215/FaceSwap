// THIS IS A COMMENT TO FORCE THE FILE TO BE RE-SAVED
export interface FileValidationOptions {
  allowedTypes?: string[];
  maxSize?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  requireFaceDetection?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  metadata?: {
    width?: number;
    height?: number;
    size: number;
    type: string;
    name: string;
  };
}

// 榛樿閰嶇疆
const DEFAULT_OPTIONS: Required<FileValidationOptions> = {
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxSize: 10 * 1024 * 1024, // 10MB
  minWidth: 100,
  minHeight: 100,
  maxWidth: 4096,
  maxHeight: 4096,
  requireFaceDetection: false,
};

// 楠岃瘉鏂囦欢绫诲瀷
export function validateFileType(file: File, allowedTypes: string[]): ValidationResult {
  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: `Invalid file type "${file.type}". Allowed types: ${allowedTypes.join(', ')}`,
    };
  }
  return { isValid: true };
}

// 楠岃瘉鏂囦欢澶у皬
export function validateFileSize(file: File, maxSize: number): ValidationResult {
  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      error: `File size ${fileSizeMB}MB exceeds maximum allowed size ${maxSizeMB}MB`,
    };
  }
  return { isValid: true };
}

// 楠岃瘉鍥剧墖灏哄
export async function validateImageDimensions(
  file: File,
  options: {
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
  }
): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const { width, height } = img;
      const warnings: string[] = [];
      
      // 妫€鏌ユ渶灏忓昂瀵?
      if (options.minWidth && width < options.minWidth) {
        return resolve({
          isValid: false,
          error: `Image width ${width}px is below minimum required ${options.minWidth}px`,
        });
      }
      
      if (options.minHeight && height < options.minHeight) {
        return resolve({
          isValid: false,
          error: `Image height ${height}px is below minimum required ${options.minHeight}px`,
        });
      }
      
      // 妫€鏌ユ渶澶у昂瀵?
      if (options.maxWidth && width > options.maxWidth) {
        return resolve({
          isValid: false,
          error: `Image width ${width}px exceeds maximum allowed ${options.maxWidth}px`,
        });
      }
      
      if (options.maxHeight && height > options.maxHeight) {
        return resolve({
          isValid: false,
          error: `Image height ${height}px exceeds maximum allowed ${options.maxHeight}px`,
        });
      }

      // 娣诲姞寤鸿鎬ц鍛?
      if (width < 512 || height < 512) {
        warnings.push('Low resolution image may result in poor quality output');
      }
      
      if (width !== height) {
        warnings.push('Non-square image may be cropped or stretched');
      }

      resolve({
        isValid: true,
        warnings: warnings.length > 0 ? warnings : undefined,
        metadata: { width, height, size: file.size, type: file.type, name: file.name },
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        isValid: false,
        error: 'Failed to load image. File may be corrupted or invalid.',
      });
    };
    
    img.src = url;
  });
}

// 楠岃瘉鍥剧墖鍐呭瀹夊叏鎬?
export async function validateImageContent(file: File): Promise<ValidationResult> {
  // 鍩烘湰鐨勬枃浠跺ご楠岃瘉
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  // 妫€鏌ュ父瑙佸浘鐗囨牸寮忕殑鏂囦欢澶?
  const isPNG = bytes.length >= 8 && 
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  
  const isJPEG = bytes.length >= 3 && 
    bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  
  const isWebP = bytes.length >= 12 && 
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

  if (!isPNG && !isJPEG && !isWebP) {
    return {
      isValid: false,
      error: 'File content does not match expected image format',
    };
  }

  return { isValid: true };
}

// 绠€鍗曠殑浜鸿劯妫€娴嬮獙璇侊紙鍩轰簬Canvas API锛?
export async function validateFacePresence(file: File): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        return resolve({
          isValid: false,
          error: 'Canvas not supported for face detection',
        });
      }
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      try {
        // 绠€鍗曠殑棰滆壊鍒嗘瀽鏉ヤ及璁℃槸鍚﹀寘鍚汉鑴?
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let skinPixels = 0;
        const totalPixels = data.length / 4;
        
        // 绠€鍗曠殑鑲よ壊妫€娴嬬畻娉?
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // 绠€鍗曠殑鑲よ壊鑼冨洿妫€鏌?
          if (
            r > 95 && g > 40 && b > 20 &&
            r > g && r > b &&
            Math.abs(r - g) > 15 &&
            Math.max(r, g, b) - Math.min(r, g, b) > 15
          ) {
            skinPixels++;
          }
        }
        
        const skinPercentage = (skinPixels / totalPixels) * 100;
        
        if (skinPercentage < 1) {
          return resolve({
            isValid: false,
            error: 'No face detected in the image. Please ensure the image contains a clear face.',
          });
        }
        
        const warnings: string[] = [];
        if (skinPercentage < 5) {
          warnings.push('Face may be difficult to detect. Consider using a clearer image.');
        }
        
        resolve({
          isValid: true,
          warnings: warnings.length > 0 ? warnings : undefined,
        });
      } catch (error) {
        resolve({
          isValid: false,
          error: 'Failed to analyze image content',
        });
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        isValid: false,
        error: 'Failed to load image for face detection',
      });
    };
    
    img.src = url;
  });
}

// 涓昏鐨勬枃浠堕獙璇佸嚱鏁?
export async function validateFile(
  file: File,
  options: FileValidationOptions = {}
): Promise<ValidationResult> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  const validationSteps = [
    () => validateFileType(file, mergedOptions.allowedTypes),
    () => validateFileSize(file, mergedOptions.maxSize),
    () => validateImageContent(file),
    () => validateImageDimensions(file, {
        minWidth: mergedOptions.minWidth,
        minHeight: mergedOptions.minHeight,
        maxWidth: mergedOptions.maxWidth,
        maxHeight: mergedOptions.maxHeight,
    }),
  ];

  if (mergedOptions.requireFaceDetection) {
    validationSteps.push(() => validateFacePresence(file));
  }

  const allWarnings = new Set<string>();
  let finalMetadata: ValidationResult['metadata'] | undefined;

  for (const step of validationSteps) {
    const result = await step();
    
    if (result.warnings) {
      result.warnings.forEach(w => allWarnings.add(w));
    }
    
    if (result.metadata) {
      finalMetadata = { ...finalMetadata, ...result.metadata };
    }

    if (!result.isValid) {
      return { 
        ...result,
        warnings: Array.from(allWarnings),
        metadata: finalMetadata,
      };
    }
  }

  return { 
    isValid: true,
    warnings: Array.from(allWarnings),
    metadata: finalMetadata,
  };
}

// 涓篎ace Swap椤甸潰瀹氬埗鐨勯獙璇侀€夐」
export const FACE_SWAP_VALIDATION_OPTIONS: FileValidationOptions = {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 15 * 1024 * 1024, // 15MB
    minWidth: 256,
    minHeight: 256,
    maxWidth: 8192,
    maxHeight: 8192,
}; 
