/**
 * 水印添加工具函数
 */

interface WatermarkOptions {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  opacity?: number;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
  margin?: number;
  rotation?: number;
}

interface LogoWatermarkOptions {
  logoUrl?: string;
  opacity?: number;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
  margin?: number;
  maxWidth?: number;
  maxHeight?: number;
  rotation?: number;
}

const DEFAULT_WATERMARK_OPTIONS: Required<WatermarkOptions> = {
  text: 'AI换脸工具网站',
  fontSize: 24,
  fontFamily: 'Arial, sans-serif',
  color: '#ffffff',
  opacity: 0.7,
  position: 'bottom-right',
  margin: 20,
  rotation: -15,
};

const DEFAULT_LOGO_WATERMARK_OPTIONS: Required<LogoWatermarkOptions> = {
  logoUrl: '/logo.png',
  opacity: 0.8,
  position: 'bottom-right',
  margin: 20,
  maxWidth: 120,
  maxHeight: 40,
  rotation: 0,
};

/**
 * 为图片添加水印
 * @param imageUrl 图片URL
 * @param options 水印选项
 * @returns Promise<string> 带水印的图片URL
 */
export async function addWatermarkToImage(
  imageUrl: string,
  options: WatermarkOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_WATERMARK_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    // 创建图片元素
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // 创建Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        // 设置Canvas尺寸
        canvas.width = img.width;
        canvas.height = img.height;
        
        // 绘制原图
        ctx.drawImage(img, 0, 0);
        
        // 设置水印样式
        ctx.save();
        
        // 计算水印位置
        const { x, y } = calculateWatermarkPosition(
          canvas.width,
          canvas.height,
          opts.text,
          opts.fontSize,
          opts.position,
          opts.margin,
          ctx
        );
        
        // 移动到水印位置
        ctx.translate(x, y);
        
        // 旋转
        if (opts.rotation !== 0) {
          ctx.rotate((opts.rotation * Math.PI) / 180);
        }
        
        // 设置文字样式
        ctx.font = `${opts.fontSize}px ${opts.fontFamily}`;
        ctx.fillStyle = opts.color;
        ctx.globalAlpha = opts.opacity;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 添加文字阴影以提高可见性
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        // 绘制水印文字
        ctx.fillText(opts.text, 0, 0);
        
        ctx.restore();
        
        // 转换为blob URL
        canvas.toBlob((blob) => {
          if (blob) {
            const watermarkedUrl = URL.createObjectURL(blob);
            resolve(watermarkedUrl);
          } else {
            reject(new Error('Failed to create blob'));
          }
        }, 'image/png', 0.9);
        
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    // 如果是data URL，直接设置
    if (imageUrl.startsWith('data:')) {
      img.src = imageUrl;
    } else {
      // 对于外部URL，可能需要代理处理CORS
      img.src = imageUrl;
    }
  });
}

/**
 * 计算水印位置
 */
function calculateWatermarkPosition(
  canvasWidth: number,
  canvasHeight: number,
  text: string,
  fontSize: number,
  position: string,
  margin: number,
  ctx: CanvasRenderingContext2D
): { x: number; y: number } {
  // 测量文字尺寸
  ctx.font = `${fontSize}px Arial`;
  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = fontSize;
  
  let x: number;
  let y: number;
  
  switch (position) {
    case 'top-left':
      x = margin + textWidth / 2;
      y = margin + textHeight / 2;
      break;
    case 'top-right':
      x = canvasWidth - margin - textWidth / 2;
      y = margin + textHeight / 2;
      break;
    case 'bottom-left':
      x = margin + textWidth / 2;
      y = canvasHeight - margin - textHeight / 2;
      break;
    case 'bottom-right':
      x = canvasWidth - margin - textWidth / 2;
      y = canvasHeight - margin - textHeight / 2;
      break;
    case 'center':
      x = canvasWidth / 2;
      y = canvasHeight / 2;
      break;
    default:
      x = canvasWidth - margin - textWidth / 2;
      y = canvasHeight - margin - textHeight / 2;
  }
  
  return { x, y };
}

/**
 * 为图片添加Logo水印
 * @param imageUrl 图片URL
 * @param options Logo水印选项
 * @returns Promise<string> 带水印的图片URL
 */
export async function addLogoWatermarkToImage(
  imageUrl: string,
  options: LogoWatermarkOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_LOGO_WATERMARK_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    // 创建图片元素
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      // 加载logo图片
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      
      logoImg.onload = () => {
        try {
          // 创建Canvas
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          // 设置Canvas尺寸
          canvas.width = img.width;
          canvas.height = img.height;
          
          // 绘制原图
          ctx.drawImage(img, 0, 0);
          
          // 计算logo缩放尺寸
          const logoScale = calculateLogoScale(
            logoImg.width,
            logoImg.height,
            opts.maxWidth,
            opts.maxHeight,
            img.width,
            img.height
          );
          
          const logoWidth = logoImg.width * logoScale;
          const logoHeight = logoImg.height * logoScale;
          
          // 计算logo位置 (固定在右下角)
          const logoX = canvas.width - opts.margin - logoWidth;
          const logoY = canvas.height - opts.margin - logoHeight;
          
          // 设置透明度和绘制logo
          ctx.save();
          ctx.globalAlpha = opts.opacity;
          
          // 如果需要旋转
          if (opts.rotation !== 0) {
            const centerX = logoX + logoWidth / 2;
            const centerY = logoY + logoHeight / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate((opts.rotation * Math.PI) / 180);
            ctx.translate(-centerX, -centerY);
          }
          
          // 绘制logo
          ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
          
          ctx.restore();
          
          // 转换为blob URL
          canvas.toBlob((blob) => {
            if (blob) {
              const watermarkedUrl = URL.createObjectURL(blob);
              resolve(watermarkedUrl);
            } else {
              reject(new Error('Failed to create blob'));
            }
          }, 'image/png', 0.9);
          
        } catch (error) {
          reject(error);
        }
      };
      
      logoImg.onerror = () => {
        reject(new Error('Failed to load logo image'));
      };
      
      // 加载logo
      logoImg.src = opts.logoUrl;
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    // 如果是data URL，直接设置
    if (imageUrl.startsWith('data:')) {
      img.src = imageUrl;
    } else {
      // 对于外部URL，可能需要代理处理CORS
      img.src = imageUrl;
    }
  });
}

/**
 * 计算logo缩放比例
 */
function calculateLogoScale(
  logoWidth: number,
  logoHeight: number,
  maxWidth: number,
  maxHeight: number,
  imageWidth: number,
  imageHeight: number
): number {
  // 确保logo不超过图片尺寸的20%
  const maxImagePercentWidth = imageWidth * 0.2;
  const maxImagePercentHeight = imageHeight * 0.2;
  
  const finalMaxWidth = Math.min(maxWidth, maxImagePercentWidth);
  const finalMaxHeight = Math.min(maxHeight, maxImagePercentHeight);
  
  const scaleWidth = finalMaxWidth / logoWidth;
  const scaleHeight = finalMaxHeight / logoHeight;
  
  // 取较小的缩放比例以保持logo比例
  return Math.min(scaleWidth, scaleHeight, 1);
}

/**
 * 清理之前创建的blob URL
 */
export function cleanupBlobUrl(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
} 